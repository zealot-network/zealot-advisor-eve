const MAX_MESSAGES = 50;

// The web client matches on this code to show the limit message instead of
// a generic error. Keep it in step with src/hooks/useChat.ts.
export const MESSAGE_LIMIT_CODE = "message_limit";
export const MESSAGE_LIMIT_MESSAGE = "This conversation has reached the 50 message limit.";

export function isLocalDevRuntime(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.EVE_DEV === "1") return true;
  return env.VERCEL === "1" && env.VERCEL_ENV === "development";
}

export function decodeSessionSegment(segment: string): string | undefined {
  const tokens: string[] = [];
  const marked = segment.replace(/%2f|%5c/gi, (match) => {
    const token = `\uE000${tokens.length}\uE001`;
    tokens.push(match);
    return token;
  });
  let decoded: string;
  try {
    decoded = decodeURIComponent(marked);
  } catch {
    return undefined;
  }
  if (decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0")) {
    return undefined;
  }
  const restored = decoded.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => {
    return tokens[Number(index)] ?? "";
  });
  const normalized = restored.normalize("NFC");
  if (!normalized) return undefined;
  return normalized;
}

export type SessionRoute =
  | { kind: "absent" }
  | { kind: "deny" }
  | { kind: "id"; sessionId: string; countsMessage: boolean };

function encoded(segment: string | undefined): boolean {
  return segment !== undefined && segment.includes("%");
}

export function sessionRouteFromUrl(url: string): SessionRoute {
  let pathname: string;
  try {
    pathname = new URL(url, "https://zealot.local").pathname;
  } catch {
    return { kind: "deny" };
  }
  const parts = pathname.split("/");
  // URL.pathname keeps %HH in place. Eve decodes those segments before routing,
  // so an encoded "session" would skip a check that compared the raw text.
  // Reject percent-encoding in every fixed segment. The session id is the
  // only segment decoded here, and it still rejects slashes and NUL.
  if (encoded(parts[1]) || encoded(parts[2]) || encoded(parts[3])) {
    return { kind: "deny" };
  }
  if ((parts[1] ?? "").toLowerCase() !== "eve" || parts[2] !== "v1" || (parts[3] ?? "").toLowerCase() !== "session") {
    return { kind: "absent" };
  }
  if (parts.length <= 4 || parts[4] === undefined) return { kind: "absent" };
  if (parts[4].length === 0) return { kind: "deny" };
  const sessionId = decodeSessionSegment(parts[4]);
  if (!sessionId) return { kind: "deny" };
  const rest = parts.slice(5);
  if (rest.some((segment) => segment.length === 0 || encoded(segment))) {
    return { kind: "deny" };
  }
  return { kind: "id", sessionId, countsMessage: rest.length === 0 };
}

export function isSessionCreatePath(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url, "https://zealot.local").pathname;
  } catch {
    return false;
  }
  const parts = pathname.split("/");
  return (parts[1] ?? "").toLowerCase() === "eve"
    && parts[2] === "v1"
    && (parts[3] ?? "").toLowerCase() === "session"
    && parts.length === 4;
}

const MAX_CONTENT_LENGTH = 4000;

export type PostedMessageRejection = "attachment" | "length";

export interface PostedMessageJudgment {
  counts: boolean;
  text: string;
  rejection?: PostedMessageRejection;
}

function carriesAttachmentField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  if (normalized === "file" || normalized === "filename") return true;
  if (normalized === "url" || normalized === "uri" || normalized.endsWith("url")) return true;
  if (normalized === "data") return true;
  if (normalized === "media" || normalized.startsWith("media")) return true;
  return false;
}

// A text part is type "text" plus a string text field. Extra fields such as
// id, state, and providerMetadata stay with the part. A part that is not text,
// or that carries file, url, data, or media fields, is an attachment.
export function isTextPart(part: unknown): part is { type: "text"; text: string } {
  if (!part || typeof part !== "object" || Array.isArray(part)) return false;
  const record = part as Record<string, unknown>;
  if (record.type !== "text" || typeof record.text !== "string") return false;
  return !Object.keys(record).some((key) => carriesAttachmentField(key));
}

// A message POST is any body that includes `message`. Prewarm and answers do not.
// Attachments are rejected and still counted. Harmless fields on a text part are not attachments.
export function judgePostedMessage(raw: string): PostedMessageJudgment {
  if (!raw.trim()) return { counts: false, text: "" };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { counts: false, text: "" };
  }
  if (!body || typeof body !== "object" || !("message" in body)) {
    return { counts: false, text: "" };
  }
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string") {
    return {
      counts: true,
      text: message,
      ...(message.length > MAX_CONTENT_LENGTH ? { rejection: "length" as const } : {}),
    };
  }
  if (!Array.isArray(message)) {
    return { counts: true, text: "", rejection: "attachment" };
  }
  let text = "";
  for (const part of message) {
    if (!isTextPart(part)) return { counts: true, text: "", rejection: "attachment" };
    text += part.text;
  }
  return {
    counts: true,
    text,
    ...(text.length > MAX_CONTENT_LENGTH ? { rejection: "length" as const } : {}),
  };
}

export function messageTextFromBody(raw: string): string | undefined {
  const judgment = judgePostedMessage(raw);
  if (!judgment.counts || judgment.rejection === "attachment") return undefined;
  return judgment.text;
}

export type GrantResult = "owned" | "denied" | "unavailable";

export type GrantReadResult = "owned" | "missing" | "denied" | "unavailable";

export interface GrantStore {
  claim(sessionId: string, principalId: string): Promise<GrantResult>;
}

export interface GrantReader {
  read(sessionId: string, principalId: string): Promise<GrantReadResult>;
}

export interface MemoryGrantStore extends GrantStore, GrantReader {
  has(sessionId: string): boolean;
}

export const RECENT_GRANT_WINDOW_MS = 60_000;

export type SessionFreshness = "recent" | "stale" | "unknown";

export type GrantAccess =
  | { action: "allow" }
  | { action: "retry" }
  | { action: "unavailable" }
  | { action: "deny"; message: string };

export function memoryGrantStore(): MemoryGrantStore {
  const grants = new Map<string, string>();
  return {
    async claim(sessionId, principalId) {
      const owner = grants.get(sessionId);
      if (owner && owner !== principalId) return "denied";
      grants.set(sessionId, principalId);
      return "owned";
    },
    async read(sessionId, principalId) {
      const owner = grants.get(sessionId);
      if (!owner) return "missing";
      return owner === principalId ? "owned" : "denied";
    },
    has(sessionId) {
      return grants.has(sessionId);
    },
  };
}

export function grantDenialMessage(result: "missing" | "denied"): string {
  return result === "missing"
    ? "This session is not available."
    : "This session belongs to someone else.";
}

export function sessionFreshness(
  createdAt: Date | undefined,
  now: number,
  windowMs = RECENT_GRANT_WINDOW_MS,
): SessionFreshness {
  if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) return "unknown";
  return now - createdAt.getTime() <= windowMs ? "recent" : "stale";
}

export function decideGrantAccess(input: {
  grant: GrantReadResult;
  pending: boolean;
  freshness?: SessionFreshness;
}): GrantAccess {
  if (input.grant === "owned") return { action: "allow" };
  if (input.grant === "unavailable") return { action: "unavailable" };
  if (input.grant === "denied") {
    return { action: "deny", message: grantDenialMessage("denied") };
  }
  if (input.pending && input.freshness === "recent") return { action: "retry" };
  return { action: "deny", message: grantDenialMessage("missing") };
}

export async function authorizeSessionClaim(input: {
  sessionId: string;
  principalId: string;
  databaseConfigured: boolean;
  localDev: boolean;
  database: GrantStore | undefined;
  memory: GrantStore;
}): Promise<GrantResult> {
  if (input.databaseConfigured) {
    if (!input.database) return "unavailable";
    return input.database.claim(input.sessionId, input.principalId);
  }
  if (!input.localDev) return "denied";
  return input.memory.claim(input.sessionId, input.principalId);
}

export async function authorizeSessionRead(input: {
  sessionId: string;
  principalId: string;
  databaseConfigured: boolean;
  localDev: boolean;
  database: GrantReader | undefined;
  memory: GrantReader;
}): Promise<GrantReadResult> {
  if (input.databaseConfigured) {
    if (!input.database) return "unavailable";
    return input.database.read(input.sessionId, input.principalId);
  }
  if (!input.localDev) return "missing";
  return input.memory.read(input.sessionId, input.principalId);
}

export type MessageOp = "open" | "follow";

export function messageOpsForRequest(sessionId: string | undefined): MessageOp[] {
  return sessionId ? ["follow"] : ["open"];
}

export function mergeMessageCount(existing: number | undefined, op: MessageOp): number {
  if (op === "open") return existing ?? 1;
  return (existing ?? 0) + 1;
}

export function messageLimitExceeded(count: number): boolean {
  return count > MAX_MESSAGES;
}

export function countUserTurns(turns: number): number {
  let count: number | undefined;
  for (let index = 0; index < turns; index += 1) {
    count = mergeMessageCount(count, index === 0 ? "open" : "follow");
  }
  return count ?? 0;
}
