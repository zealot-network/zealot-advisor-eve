import { webFetch } from "eve/tools/web_fetch";

export type ToolContext = Parameters<typeof webFetch.execute>[1];

export interface FetchedPage {
  url: string;
  content: string;
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

/**
 * Reads a page through eve's webFetch, which checks every redirect hop and
 * every resolved address against private and reserved ranges before it
 * connects. webFetch can return its output directly or as a stream of
 * progress values whose last value is the result; this handles both.
 */
export async function fetchPublicPage(url: string, timeoutSeconds: number, ctx: ToolContext): Promise<FetchedPage> {
  const result = await webFetch.execute({ url, format: "markdown", timeout: timeoutSeconds }, ctx);
  if (!isAsyncIterable<{ url: string; content: string }>(result)) return result;
  let last: FetchedPage | undefined;
  for await (const value of result) last = value;
  if (!last) throw new Error("webFetch returned no result.");
  return last;
}
