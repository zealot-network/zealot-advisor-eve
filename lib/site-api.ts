import { BOT_REJECTED_CODE, BOT_REJECTED_MESSAGE, verifyHuman, type BotVerdict } from "./bot-guard.ts";
import { submitContact, submitLead } from "./contact.ts";
import { readHoopBoard, submitHoopScore, type HoopDeps } from "./hoop-scores.ts";
import { handleMcpOptions, handleMcpPost } from "./mcp.ts";
import { inspectJsonPost, type PostRejection } from "./post-gate.ts";
import { requestClientAddress } from "./rate-limit.ts";

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function callerIp(request: Request, requestIp: string | null): string {
  return requestClientAddress(request, requestIp);
}

function siteRejection(reason: PostRejection): Response {
  if (reason === "content-type") {
    return Response.json(
      { success: false, error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }
  return Response.json(
    { success: false, error: "Origin is not allowed." },
    { status: 403 },
  );
}

function gateSitePost(request: Request): Response | undefined {
  const reason = inspectJsonPost(request);
  return reason ? siteRejection(reason) : undefined;
}

export async function handleContactRequest(request: Request, requestIp: string | null = null): Promise<Response> {
  const rejected = gateSitePost(request);
  if (rejected) return rejected;
  const result = await submitContact(await readJson(request), callerIp(request, requestIp));
  return Response.json(result.body, { status: result.status });
}

export async function handleLeadRequest(request: Request, requestIp: string | null = null): Promise<Response> {
  const rejected = gateSitePost(request);
  if (rejected) return rejected;
  const result = await submitLead(await readJson(request), callerIp(request, requestIp));
  return Response.json(result.body, { status: result.status });
}

// The board changes rarely, so the edge may hold a good read for a short
// while. A failed read is never held.
const HOOP_BOARD_CACHE = "public, s-maxage=30, stale-while-revalidate=120";

export interface HoopPostDeps extends HoopDeps {
  verify?: () => Promise<BotVerdict>;
}

export async function handleHoopScoresGet(_request: Request, deps: HoopDeps = {}): Promise<Response> {
  const result = await readHoopBoard(deps);
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": result.status === 200 ? HOOP_BOARD_CACHE : "no-store" },
  });
}

// The gates run in this order: origin and content type, the bot check,
// then validation, the limits and the database in lib/hoop-scores.ts.
// A failed bot check is "unchecked" and goes through, as the chat does.
// src/lib/botid.ts protects the same path in the browser.
export async function handleHoopScorePost(
  request: Request,
  requestIp: string | null = null,
  deps: HoopPostDeps = {},
): Promise<Response> {
  const noStore = { "Cache-Control": "no-store" };
  const rejected = gateSitePost(request);
  if (rejected) {
    rejected.headers.set("Cache-Control", noStore["Cache-Control"]);
    return rejected;
  }
  const verdict = await (deps.verify ?? (() => verifyHuman()))();
  if (verdict === "bot") {
    return Response.json(
      { success: false, code: BOT_REJECTED_CODE, error: BOT_REJECTED_MESSAGE },
      { status: 403, headers: noStore },
    );
  }
  const result = await submitHoopScore(await readJson(request), callerIp(request, requestIp), deps);
  return Response.json(result.body, { status: result.status, headers: noStore });
}

export function handleSameOriginOptions(_request: Request): Response {
  return new Response(null, { status: 204 });
}

export function handleMcpOptionsRequest(request: Request): Response {
  return handleMcpOptions(request);
}

export function handleMcpPostRequest(request: Request, requestIp: string | null = null): Promise<Response> {
  return handleMcpPost(request, requestIp);
}
