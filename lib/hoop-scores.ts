/* The server side of the hoop's global board: read the five best runs,
   and take a new one.

   A score is counted in the visitor's browser, so nothing here can
   prove one. The server only limits: the shared rules, a limit per
   caller, a limit on the whole board, and the bot check in
   lib/site-api.ts.

   The table holds initials, a score and two times. Nothing about the
   visitor is stored. The limit per caller lives in memory only. */

import type { Sql, TransactionSql } from "postgres";
import { getSql } from "./db.ts";
import {
  BOARD_SIZE,
  boardRank,
  boardScore,
  initialsBlocked,
  normalInitials,
  type BoardScore,
} from "../src/lib/hoop-score-rules.ts";

const WINDOW_MS = 60 * 60 * 1000;
/** Posts one caller may make in an hour. Every post that passes validation counts. */
export const HOOP_POSTS_PER_HOUR = 3;
/** Rows the whole board takes in an hour, from everyone. */
export const HOOP_ROWS_PER_HOUR = 30;
/** How long one server instance answers reads from its own copy of the board, in ms. */
export const HOOP_BOARD_MEMO_MS = 30 * 1000;
/** How long an instance answers 503 from a failed read without asking the database again, in ms. */
export const HOOP_FAILED_MEMO_MS = 5 * 1000;
/** The longest the board waits on the database for one read or one save, in ms. */
export const HOOP_QUERY_MS = 5 * 1000;
/** The longest a save waits for another save to finish, in ms. Past it the answer is that the board is busy. */
export const HOOP_LOCK_MS = 2 * 1000;
/** Rows read to fill five places, so rows the block list now hides do not leave gaps. */
export const HOOP_READ_ROWS = 25;
/** The most callers the limiter remembers at once. */
export const HOOP_LIMITER_MAX_KEYS = 5000;

const BOARD_UNAVAILABLE = "The board is not available.";
const TOO_MANY = "Too many scores from here. Try again later.";
const BOARD_BUSY = "The board is taking no new scores for now. Try again later.";

/** What the board asks of the database. Tests pass a fake. */
export interface HoopStore {
  /** The live rows, best first. A tie goes to the older row. More than five may come back. */
  topFive(): Promise<BoardScore[]>;
  /** How many rows were created in the last hour, by anyone, removed ones included. */
  recentCount(): Promise<number>;
  /** Stores the score. False when that live score was stored already, and nothing was written. */
  insert(initials: string, score: number): Promise<boolean | void>;
  /**
   * Runs a save as one step that no other save can cut into: on the
   * database it is a transaction behind a lock. Without it two posts at
   * once would each count, read and insert on their own, and both would
   * get past the cap and past the rule that a score is saved once.
   * A store without it runs the save as it is.
   */
  alone?<T>(run: (store: HoopStore) => Promise<T>): Promise<T>;
}

/** The five places, from the rows as stored: anything the block list now refuses is left out. */
export function liveBoard(rows: readonly BoardScore[]): BoardScore[] {
  return rows.filter((row) => !initialsBlocked(row.initials)).slice(0, BOARD_SIZE);
}

/** Another save held the board past the wait. The visitor is told the board is busy. */
export class HoopBusy extends Error {}

/** What Postgres says when a wait for a lock ran past lock_timeout. */
const LOCK_NOT_AVAILABLE = "55P03";

/** Gives up on a database call that takes too long, so a save never hangs the field. */
export function within<T>(ms: number, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The database did not answer in ${ms}ms`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** One instance's copy of the board, so a flood of reads is not a flood of queries. */
export interface BoardMemo {
  now(): number;
  held: { at: number; scores: BoardScore[] } | null;
  /** When a read last failed. For a few seconds after, the answer is 503 with no query. */
  failedAt?: number | null;
  /** The read on its way now, if any. Every caller that arrives before it settles waits on it. */
  reading?: Promise<HoopBoardResult> | null;
}

/* The copy this instance keeps. The edge holds a good read too, but a
   query string gets past the edge, and every such read would otherwise
   be a query on the one connection the contact form shares. */
export const boardMemo: BoardMemo = {
  now: () => Date.now(),
  held: null,
};

export interface HoopDeps {
  /** Returns the store, or undefined when no database is configured. */
  store?: () => HoopStore | undefined;
  limiter?: { allow(address: string): boolean };
  /** The instance's copy of the board. Tests that pass a store get none unless they pass one. */
  memo?: BoardMemo;
}

function memoFor(deps: HoopDeps): BoardMemo | undefined {
  return deps.memo ?? (deps.store ? undefined : boardMemo);
}

export type HoopBoardResult =
  | { status: 200; body: { scores: BoardScore[] } }
  | { status: 503; body: { scores: null; error: string } };

export type HoopSubmitResult =
  | { status: 200; body: { success: true; rank: number | null; scores: BoardScore[] } }
  | { status: 400; body: { success: false; code: "invalid" | "initials_blocked"; error: string } }
  | { status: 429; body: { success: false; code: "rate_limited" | "board_busy"; error: string } }
  | { status: 500; body: { success: false; code: "failed"; error: string } }
  | { status: 503; body: { success: false; code: "unavailable"; error: string } };

/** The store on the site's database, or undefined when none is configured. */
export function hoopStore(): HoopStore | undefined {
  const sql = getSql();
  return sql ? hoopStoreOn(sql) : undefined;
}

/** The store on this client. Tests pass a stand-in and read the statements it was sent. */
export function hoopStoreOn(sql: Sql): HoopStore {
  // The same three statements, on the pool or inside a transaction.
  const on = (run: Sql | TransactionSql): HoopStore => ({
    async topFive() {
      const rows = await run<{ initials: string; score: number }[]>`
        select initials, score
        from hoop_scores
        where removed_at is null
        order by score desc, created_at asc
        limit ${HOOP_READ_ROWS}
      `;
      return rows.map((row) => ({ initials: row.initials, score: Number(row.score) }));
    },
    async recentCount() {
      const rows = await run<{ recent: number }[]>`
        select count(*)::int as recent
        from hoop_scores
        where created_at >= now() - interval '1 hour'
      `;
      return Number(rows[0]?.recent ?? 0);
    },
    async insert(initials, score) {
      // The index on live scores holds a score to one row. A second one
      // is no error: it is that score, saved already.
      const rows = await run<{ id: string }[]>`
        insert into hoop_scores (initials, score)
        values (${initials}, ${score})
        on conflict (initials, score) where removed_at is null do nothing
        returning id
      `;
      return rows.length > 0;
    },
  });
  return {
    ...on(sql),
    async alone<T>(run: (store: HoopStore) => Promise<T>): Promise<T> {
      try {
        const done = await sql.begin(async (tx) => {
          // The bounds come first, so the wait for the lock is bounded
          // too. This is the one connection the contact and lead forms
          // share, and a save parked on a lock would hold it. The last
          // bound has the database end a transaction whose instance
          // stopped mid-save, which lets go of the lock.
          await tx`
            select
              set_config('statement_timeout', ${String(HOOP_QUERY_MS)}, true),
              set_config('lock_timeout', ${String(HOOP_LOCK_MS)}, true),
              set_config('idle_in_transaction_session_timeout', ${String(HOOP_QUERY_MS * 2)}, true)
          `;
          // One save at a time, for the length of this transaction.
          await tx`select pg_advisory_xact_lock(hashtext('hoop_scores'))`;
          return run(on(tx));
        });
        return done as T;
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === LOCK_NOT_AVAILABLE) throw new HoopBusy("Another save holds the board");
        throw error;
      }
    },
  };
}

const callers = new Map<string, { windowStart: number; count: number }>();

function makeRoom(now: number): void {
  if (callers.size < HOOP_LIMITER_MAX_KEYS) return;
  for (const [address, entry] of callers) {
    if (now - entry.windowStart >= WINDOW_MS) callers.delete(address);
  }
  // Still full: drop the oldest. A Map keeps the order its keys were added in.
  for (const address of callers.keys()) {
    if (callers.size < HOOP_LIMITER_MAX_KEYS) break;
    callers.delete(address);
  }
}

/* The limit per caller. In memory only, so the caller's address is never
   written anywhere. Each server instance counts on its own, and the
   limit on the whole board backs it up. Tests replace `now` or `allow`,
   and call `reset` between cases. */
export const hoopLimiter = {
  now(): number {
    return Date.now();
  },
  allow(address: string): boolean {
    const now = hoopLimiter.now();
    const entry = callers.get(address);
    if (entry && now - entry.windowStart < WINDOW_MS) {
      if (entry.count >= HOOP_POSTS_PER_HOUR) return false;
      entry.count += 1;
      return true;
    }
    callers.delete(address);
    makeRoom(now);
    callers.set(address, { windowStart: now, count: 1 });
    return true;
  },
  reset(): void {
    callers.clear();
  },
  size(): number {
    return callers.size;
  },
};

export async function readHoopBoard(deps: HoopDeps = {}): Promise<HoopBoardResult> {
  const memo = memoFor(deps);
  if (memo?.held && memo.now() - memo.held.at < HOOP_BOARD_MEMO_MS) {
    return { status: 200, body: { scores: memo.held.scores } };
  }
  // A read that just failed is not tried again at once. With the
  // database down, or the table not there yet, every read would
  // otherwise be a failing query on the one connection the site shares.
  if (memo?.failedAt != null && memo.now() - memo.failedAt < HOOP_FAILED_MEMO_MS) {
    return { status: 503, body: { scores: null, error: BOARD_UNAVAILABLE } };
  }
  // One read at a time. On a cold instance, or when the copy has just
  // run out, every read that arrives before the first one answers waits
  // on that one. A burst is then one query on the shared connection, not
  // one each.
  if (memo?.reading) return memo.reading;
  const store = (deps.store ?? hoopStore)();
  if (!store) return { status: 503, body: { scores: null, error: BOARD_UNAVAILABLE } };
  const reading = readOnce(store, memo);
  if (!memo) return reading;
  memo.reading = reading;
  // Cleared when it answers. A failed read answers too, as a 503, so a
  // failure is remembered by its time and never by a promise that stays.
  void reading.then(() => {
    memo.reading = null;
  });
  return reading;
}

/** One query for the top five. It never rejects: a failure is a 503, logged once, and remembered for a few seconds. */
async function readOnce(store: HoopStore, memo: BoardMemo | undefined): Promise<HoopBoardResult> {
  try {
    const scores = liveBoard(await within(HOOP_QUERY_MS, store.topFive()));
    if (memo) {
      memo.held = { at: memo.now(), scores };
      memo.failedAt = null;
    }
    return { status: 200, body: { scores } };
  } catch (error) {
    console.error("Hoop board read failed", error);
    if (memo) memo.failedAt = memo.now();
    return { status: 503, body: { scores: null, error: BOARD_UNAVAILABLE } };
  }
}

/* Validation runs before the limits, so a typo does not spend an
   attempt. Only the normal initials and the score go on to the store. */
export async function submitHoopScore(
  raw: unknown,
  ipAddress: string,
  deps: HoopDeps = {},
): Promise<HoopSubmitResult> {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const score = boardScore(record.score);
  const initials = normalInitials(record.initials);
  if (score === null || initials === null) {
    return {
      status: 400,
      body: { success: false, code: "invalid", error: "Send three letters and a score." },
    };
  }
  if (initialsBlocked(initials)) {
    return {
      status: 400,
      body: { success: false, code: "initials_blocked", error: "Try other initials." },
    };
  }

  const store = (deps.store ?? hoopStore)();
  if (!store) {
    return { status: 503, body: { success: false, code: "unavailable", error: BOARD_UNAVAILABLE } };
  }

  if (!(deps.limiter ?? hoopLimiter).allow(ipAddress)) {
    return { status: 429, body: { success: false, code: "rate_limited", error: TOO_MANY } };
  }

  const memo = memoFor(deps);
  const hold = (scores: BoardScore[]) => {
    if (memo) memo.held = { at: memo.now(), scores };
  };
  const save = async (only: HoopStore): Promise<HoopSubmitResult> => {
    const board = liveBoard(await only.topFive());
    // The same initials and score, already on the board: the visitor is
    // trying again after an answer that never reached them. It is saved
    // once, and they are told the place it holds.
    const held = board.findIndex((entry) => entry.initials === initials && entry.score === score);
    if (held >= 0) return { status: 200, body: { success: true, rank: held + 1, scores: board } };
    const rank = boardRank(score, board);
    if (rank === null) {
      hold(board);
      return { status: 200, body: { success: true, rank: null, scores: board } };
    }
    // The limit on the whole board, asked only of a score that would be
    // stored. It is not the visitor's doing, and the answer says so. A
    // count that fails ends the save: inside a transaction nothing
    // after a failed statement can run, and a board that cannot count
    // should not take scores.
    if ((await only.recentCount()) >= HOOP_ROWS_PER_HOUR) {
      return { status: 429, body: { success: false, code: "board_busy", error: BOARD_BUSY } };
    }
    // Stored already, in a row the read did not show: it sits under
    // rows the block list hides. It is saved, with no place to mark.
    if ((await only.insert(initials, score)) === false) {
      return { status: 200, body: { success: true, rank: null, scores: board } };
    }
    // The new row sits behind every score it does not beat, which is
    // where the read's order puts it too.
    const scores = [...board.slice(0, rank - 1), { initials, score }, ...board.slice(rank - 1)].slice(0, BOARD_SIZE);
    hold(scores);
    return { status: 200, body: { success: true, rank, scores } };
  };
  try {
    return await within(HOOP_QUERY_MS * 2, store.alone ? store.alone(save) : save(store));
  } catch (error) {
    if (error instanceof HoopBusy) {
      return { status: 429, body: { success: false, code: "board_busy", error: BOARD_BUSY } };
    }
    console.error("Hoop score insert failed", error);
    return { status: 500, body: { success: false, code: "failed", error: "The score was not saved." } };
  }
}
