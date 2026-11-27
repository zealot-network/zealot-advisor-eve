/* The rules of the hoop's global board, shared by the page and the
   server so the two cannot disagree. Rules only: no storage, no
   network, nothing from the browser or from node.

   The board is the five best runs anyone has posted, each under three
   initials. A score is counted in the visitor's browser, so nothing
   here can prove one. These rules only keep what is posted believable
   and fit to show. */

/** How many scores the board shows. */
export const BOARD_SIZE = 5;

/** The lowest run that can be offered a place. Under it nothing is asked. */
export const BOARD_FLOOR = 10;

/** The highest score the board takes. It is the most the scoreboard itself can show. */
export const BOARD_CAP = 999;

/** One place on the board, as the server sends it and the page shows it. */
export interface BoardScore {
  initials: string;
  score: number;
}

/* Three letter runs no board should carry. Checked on the server, and
   on the page so the visitor hears at once. Short on purpose: it is a
   screen for the obvious, and anything that slips by is removed by hand
   with scripts/remove-hoop-score.ts. It is applied when a score is
   posted and again when the board is read, so adding to it hides rows
   already stored. */
const BLOCKED_INITIALS: ReadonlySet<string> = new Set([
  "ASS",
  "CNT",
  "COC",
  "COK",
  "CUM",
  "CUN",
  "DCK",
  "DIC",
  "DIE",
  "DIK",
  "FAG",
  "FAP",
  "FCK",
  "FKU",
  "FUC",
  "FUK",
  "FUQ",
  "GUK",
  "HOE",
  "JAP",
  "JEW",
  "JIZ",
  "KKK",
  "KUM",
  "KYK",
  "KYS",
  "NAZ",
  "NGA",
  "NGR",
  "NIG",
  "NIP",
  "PIS",
  "PNS",
  "SEX",
  "SHT",
  "SUK",
  "TIT",
  "VAG",
  "WOP",
  "WTF",
]);

/**
 * Initials as the board keeps them: trimmed and in capitals, and exactly
 * three letters A to Z. Anything else is null. Nothing is stripped or
 * guessed, so "B.H" is not "BH" and is not taken.
 */
export function normalInitials(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const initials = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(initials) ? initials : null;
}

/** Whether these initials, already normal, are ones the board will not carry. */
export function initialsBlocked(initials: string): boolean {
  return BLOCKED_INITIALS.has(initials);
}

/** A score the board can take: a whole number from the floor to the cap. Anything else is null. */
export function boardScore(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  return raw >= BOARD_FLOOR && raw <= BOARD_CAP ? raw : null;
}

/**
 * The place a score would take on this board, 1 for the top, or null
 * when it makes none. A score has to beat one to pass it, so a tie goes
 * to the one already there. `board` is in order, best first.
 */
export function boardRank(score: number, board: readonly BoardScore[]): number | null {
  if (boardScore(score) === null) return null;
  const ahead = board.filter((entry) => entry.score >= score).length;
  return ahead < BOARD_SIZE ? ahead + 1 : null;
}

/** What the server sent, kept only if it is a board: at most five well formed scores, best first. */
export function readBoard(raw: unknown): BoardScore[] | null {
  if (!Array.isArray(raw) || raw.length > BOARD_SIZE) return null;
  const board: BoardScore[] = [];
  for (const entry of raw) {
    const initials = normalInitials((entry as { initials?: unknown } | null)?.initials);
    const score = boardScore((entry as { score?: unknown } | null)?.score);
    if (initials === null || score === null || initialsBlocked(initials)) return null;
    if (board.length && board[board.length - 1].score < score) return null;
    board.push({ initials, score });
  }
  return board;
}
