import { checkBotId } from "botid/server";

// The web client matches on this code to show a reload prompt instead of a
// generic error. Keep it in step with src/hooks/useChat.ts.
export const BOT_REJECTED_CODE = "bot_rejected";
export const BOT_REJECTED_MESSAGE =
  "This browser could not be verified. Reload the page and try again.";

export type BotVerdict = "human" | "bot" | "unchecked";

type BotCheck = () => Promise<{ isBot: boolean }>;

// Every bot is refused, including verified crawlers. No legitimate bot needs
// to start a chat turn.
//
// A failed check is "unchecked" and the caller lets the request through. The
// failure comes from configuration (no OIDC token) or from Vercel's BotID
// service, not from the request, so failing closed would take the chat down
// for every visitor. The firewall rate limit on /eve/v1/ still applies.
//
// checkBotId reads the request from Vercel's request context. Outside
// production it returns a human verdict, so real detection is only exercised
// on a Vercel deployment.
export async function verifyHuman(check: BotCheck = () => checkBotId()): Promise<BotVerdict> {
  try {
    const verification = await check();
    return verification.isBot ? "bot" : "human";
  } catch (error) {
    console.error("BotID check failed; letting the request through", error);
    return "unchecked";
  }
}
