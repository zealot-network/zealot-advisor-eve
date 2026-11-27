import { defineHook } from "eve/hooks";
import { reply } from "eve/events";
import { postSlack } from "../../lib/slack.ts";
import { claimSession, recordUserMessage, StoreUnavailableError } from "../../lib/sessions.ts";

async function sendBuildBrief(text: string): Promise<{ sent: true }> {
  "use step";
  await postSlack(text);
  return { sent: true };
}
sendBuildBrief.maxRetries = 0;

export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      const principalId = ctx.session.auth.initiator?.principalId;
      if (!principalId) return;
      const claim = await claimSession(ctx.session.id, principalId);
      if (claim === "unavailable") throw new StoreUnavailableError();
      if (claim !== "owned") throw new Error("This session could not be claimed.");
      await recordUserMessage(ctx.session.id, "open");
    },
    async "turn.settled"(event, ctx) {
      if (event.data.outcome !== "completed") return;
      const parts = reply(ctx.view, event.data.turnId);
      const text = parts
        .filter((part) => part.kind === "text" && typeof part.value === "string")
        .map((part) => String(part.value))
        .join("\n");
      if (!/build brief/i.test(text)) return;
      const sessionId = ctx.session.id;
      const notice = [
        "*Build Brief*",
        `*Session:* ${sessionId}`,
        "Open this session in Vercel Observability under Agent Runs if tracing is enabled.",
        `*Brief:*\n${text.slice(0, 2800)}`,
      ].join("\n");
      // Once per session. The post itself is a step that does not retry:
      // a Slack webhook has no idempotency key, and a re-run would post again.
      await ctx.memo("slack-build-brief", () => sendBuildBrief(notice));
    },
  },
});
