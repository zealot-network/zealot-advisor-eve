import type { Sql } from "postgres";
import { HttpError } from "eve/channels/auth";
import { getRun } from "eve/workflow/api";
import { databaseUrl, getSql } from "./db.ts";
import {
  authorizeSessionClaim,
  authorizeSessionRead,
  isLocalDevRuntime,
  memoryGrantStore,
  mergeMessageCount,
  type GrantReadResult,
  type GrantReader,
  type GrantResult,
  type GrantStore,
  type MessageOp,
} from "./session-guard.ts";

const memory = memoryGrantStore();
const memoryCounts = new Map<string, number>();

export const STORE_UNAVAILABLE_MESSAGE =
  "The conversation store is temporarily unavailable. Please retry.";

export class SessionStoreError extends Error {
  constructor(message: string = STORE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "SessionStoreError";
  }
}

export class GrantMissingError extends Error {
  constructor() {
    super("This session is not available.");
    this.name = "GrantMissingError";
  }
}

// routeAuth only passes HttpError through to the client. A custom Error with a
// response property is now a 500.
export class SessionNotReadyError extends HttpError {
  static readonly errorName = "SessionNotReadyError";

  constructor() {
    super(425, {
      code: "session_not_ready",
      message: "This session is not ready yet.",
      headers: { "retry-after": "1" },
    });
  }
}

export class StoreUnavailableError extends HttpError {
  static readonly errorName = "StoreUnavailableError";

  constructor() {
    super(503, {
      code: "store_unavailable",
      message: STORE_UNAVAILABLE_MESSAGE,
      headers: { "retry-after": "2" },
    });
  }
}

export async function readDatabaseGrant(
  sql: Sql,
  sessionId: string,
  principalId: string,
): Promise<GrantReadResult> {
  try {
    const rows = await sql<{ principal_id: string }[]>`
      select principal_id from chat_session_grants where session_id = ${sessionId}
    `;
    const owner = rows[0]?.principal_id;
    if (!owner) return "missing";
    return owner === principalId ? "owned" : "denied";
  } catch (error) {
    console.error("Session grant lookup failed", error);
    return "unavailable";
  }
}

export async function claimDatabaseGrant(
  sql: Sql,
  sessionId: string,
  principalId: string,
): Promise<GrantResult> {
  try {
    const inserted = await sql<{ principal_id: string }[]>`
      insert into chat_session_grants (session_id, principal_id)
      values (${sessionId}, ${principalId})
      on conflict (session_id) do nothing
      returning principal_id
    `;
    if (inserted.length > 0) return "owned";
    const rows = await sql<{ principal_id: string }[]>`
      select principal_id from chat_session_grants where session_id = ${sessionId}
    `;
    const owner = rows[0]?.principal_id;
    if (!owner) return "unavailable";
    return owner === principalId ? "owned" : "denied";
  } catch (error) {
    console.error("Session grant lookup failed", error);
    return "unavailable";
  }
}

function databaseStore(): GrantStore | undefined {
  const sql = getSql();
  if (!sql) return undefined;
  return {
    async claim(sessionId, principalId) {
      return claimDatabaseGrant(sql, sessionId, principalId);
    },
  };
}

function databaseReader(): GrantReader | undefined {
  const sql = getSql();
  if (!sql) return undefined;
  return {
    async read(sessionId, principalId) {
      return readDatabaseGrant(sql, sessionId, principalId);
    },
  };
}

export async function claimSession(sessionId: string, principalId: string): Promise<GrantResult> {
  return authorizeSessionClaim({
    sessionId,
    principalId,
    databaseConfigured: Boolean(databaseUrl()),
    localDev: isLocalDevRuntime(),
    database: databaseUrl() ? databaseStore() : undefined,
    memory,
  });
}

export async function readSessionGrant(
  sessionId: string,
  principalId: string,
): Promise<GrantReadResult> {
  const databaseConfigured = Boolean(databaseUrl());
  return authorizeSessionRead({
    sessionId,
    principalId,
    databaseConfigured,
    localDev: isLocalDevRuntime(),
    database: databaseConfigured ? databaseReader() : undefined,
    memory,
  });
}

export function sessionGrantCanArrive(): boolean {
  return Boolean(databaseUrl()) || isLocalDevRuntime();
}

type EveRunClock = {
  exists?: Promise<boolean>;
  createdAt?: Promise<Date>;
};

export async function createdAtFromRun(run: EveRunClock): Promise<Date | undefined> {
  // "exists" in run does not call the getter. Reading the property does.
  if (!("exists" in run)) {
    throw new SessionStoreError("The session clock is not available.");
  }
  let exists = false;
  try {
    const pending = run.exists;
    if (pending === undefined) throw new SessionStoreError("The session clock is not available.");
    exists = await pending;
  } catch (error) {
    if (error instanceof SessionStoreError) throw error;
    console.error("Session age lookup failed", error);
    throw new SessionStoreError();
  }
  if (exists !== true) return undefined;
  if (!("createdAt" in run)) {
    throw new SessionStoreError("The session clock is not available.");
  }
  try {
    const pending = run.createdAt;
    if (pending === undefined) throw new SessionStoreError("The session clock is not available.");
    const createdAt = await pending;
    if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) return undefined;
    return createdAt;
  } catch (error) {
    if (error instanceof SessionStoreError) throw error;
    console.error("Session age lookup failed", error);
    throw new SessionStoreError();
  }
}

export async function eveSessionCreatedAt(sessionId: string): Promise<Date | undefined> {
  try {
    return await createdAtFromRun(getRun(sessionId) as EveRunClock);
  } catch (error) {
    if (error instanceof SessionStoreError) throw error;
    console.error("Session age lookup failed", error);
    throw new SessionStoreError();
  }
}

export async function sessionStoreReachable(): Promise<boolean> {
  if (!databaseUrl()) return true;
  const sql = getSql();
  if (!sql) return false;
  try {
    await sql`select 1 as ok`;
    return true;
  } catch (error) {
    console.error("Session store probe failed", error);
    return false;
  }
}

export async function recordDatabaseMessage(
  sql: Sql,
  sessionId: string,
  op: MessageOp,
): Promise<number> {
  try {
    if (op === "open") {
      await sql`
        insert into chat_message_counts (session_id, user_messages)
        select ${sessionId}, 1
        from chat_session_grants
        where chat_session_grants.session_id = ${sessionId}
        on conflict (session_id) do nothing
      `;
      const rows = await sql<{ user_messages: number }[]>`
        select user_messages
        from chat_message_counts
        where session_id = ${sessionId}
          and exists (
            select 1 from chat_session_grants
            where chat_session_grants.session_id = ${sessionId}
          )
      `;
      const count = Number(rows[0]?.user_messages);
      if (!Number.isFinite(count)) throw new GrantMissingError();
      return count;
    }

    const rows = await sql<{ user_messages: number }[]>`
      insert into chat_message_counts (session_id, user_messages)
      select ${sessionId}, 1
      from chat_session_grants
      where chat_session_grants.session_id = ${sessionId}
      on conflict (session_id) do update
      set user_messages = chat_message_counts.user_messages + 1,
          updated_at = now()
      returning user_messages
    `;
    const count = Number(rows[0]?.user_messages);
    if (!Number.isFinite(count)) throw new GrantMissingError();
    return count;
  } catch (error) {
    if (error instanceof GrantMissingError) throw error;
    console.error("Message count failed", error);
    throw new SessionStoreError();
  }
}

export async function purgeExpiredSessionRows(sql: Sql): Promise<void> {
  try {
    await sql`
      delete from chat_session_grants
      where created_at < now() - interval '30 days'
    `;
    await sql`
      delete from chat_message_counts
      where updated_at < now() - interval '30 days'
    `;
  } catch (error) {
    console.error("Session grant purge failed", error);
  }
}

export async function recordUserMessage(sessionId: string, op: MessageOp): Promise<number> {
  if (!databaseUrl()) {
    if (!isLocalDevRuntime()) {
      throw new SessionStoreError("The conversation store is not configured.");
    }
    if (!memory.has(sessionId)) throw new GrantMissingError();
    const next = mergeMessageCount(memoryCounts.get(sessionId), op);
    memoryCounts.set(sessionId, next);
    return next;
  }

  const sql = getSql();
  if (!sql) throw new SessionStoreError();
  return recordDatabaseMessage(sql, sessionId, op);
}
