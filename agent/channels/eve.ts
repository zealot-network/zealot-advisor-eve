import { createHash } from "node:crypto";
import { eveChannel } from "eve/channels/eve";
import { ForbiddenError, localDev, vercelOidc, type AuthFn } from "eve/channels/auth";
import { BOT_REJECTED_CODE, BOT_REJECTED_MESSAGE, verifyHuman } from "../../lib/bot-guard.ts";
import { buildIntakeGuidance } from "../../lib/intake.ts";
import { withLocalToolStubs } from "../../lib/local-stubs.ts";
import {
  eveSessionCreatedAt,
  GrantMissingError,
  readSessionGrant,
  recordUserMessage,
  sessionGrantCanArrive,
  sessionStoreReachable,
  SessionNotReadyError,
  SessionStoreError,
  StoreUnavailableError,
} from "../../lib/sessions.ts";
import {
  decideGrantAccess,
  isSessionCreatePath,
  isTextPart,
  judgePostedMessage,
  MESSAGE_LIMIT_CODE,
  MESSAGE_LIMIT_MESSAGE,
  messageLimitExceeded,
  sessionFreshness,
  sessionRouteFromUrl,
  type PostedMessageJudgment,
  type SessionFreshness,
} from "../../lib/session-guard.ts";

const MAX_CONTENT_LENGTH = 4000;

function messageText(message: string | readonly { type: string; text?: string }[]): string {
  if (typeof message === "string") return message;
  return message
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("");
}

function hasNonTextPart(message: string | readonly { type: string; text?: string }[]): boolean {
  if (typeof message === "string") return false;
  return message.some((part) => !isTextPart(part));
}

async function postedJudgment(request: Request): Promise<PostedMessageJudgment> {
  if (request.method !== "POST") return { counts: false, text: "" };
  try {
    return judgePostedMessage(await request.clone().text());
  } catch {
    return { counts: false, text: "" };
  }
}

function rejectPosted(judgment: PostedMessageJudgment): void {
  if (judgment.rejection === "attachment") {
    throw new ForbiddenError({ message: "Attachments are not accepted." });
  }
  if (judgment.rejection === "length") {
    throw new ForbiddenError({ message: "Message exceeds 4000 characters." });
  }
}

// Runs on every visitor POST that creates a session or posts a message, the
// two requests that can start a model turn. src/lib/botid.ts protects the
// same paths in the browser.
async function rejectBots(): Promise<void> {
  if ((await verifyHuman()) === "bot") {
    throw new ForbiddenError({ code: BOT_REJECTED_CODE, message: BOT_REJECTED_MESSAGE });
  }
}

function visitorAuth(): AuthFn<Request> {
  return async (request) => {
    const route = sessionRouteFromUrl(request.url);
    if (route.kind === "deny") {
      throw new ForbiddenError({ message: "This session is not available." });
    }

    const header = request.headers.get("authorization") ?? "";
    const match = header.match(/^Bearer\s+zealot-visitor\.(.+)$/i);
    if (!match) return null;
    const secret = match[1]?.trim() ?? "";
    if (secret.length < 32) return null;
    const principalId = createHash("sha256").update(secret).digest("hex");

    if (route.kind === "id") {
      const grant = await readSessionGrant(route.sessionId, principalId);
      const pending = sessionGrantCanArrive();
      let freshness: SessionFreshness | undefined;
      if (grant === "missing" && pending) {
        try {
          freshness = sessionFreshness(await eveSessionCreatedAt(route.sessionId), Date.now());
        } catch {
          throw new StoreUnavailableError();
        }
      }
      const access = decideGrantAccess({ grant, pending, freshness });
      if (access.action === "unavailable") throw new StoreUnavailableError();
      if (access.action === "retry") throw new SessionNotReadyError();
      if (access.action === "deny") {
        throw new ForbiddenError({ message: access.message });
      }
      if (route.countsMessage) {
        const judgment = await postedJudgment(request);
        if (judgment.counts) {
          await rejectBots();
          try {
            const count = await recordUserMessage(route.sessionId, "follow");
            if (messageLimitExceeded(count)) {
              throw new ForbiddenError({ code: MESSAGE_LIMIT_CODE, message: MESSAGE_LIMIT_MESSAGE });
            }
          } catch (error) {
            if (error instanceof ForbiddenError) throw error;
            if (error instanceof GrantMissingError) {
              throw new ForbiddenError({ message: "This session is not available." });
            }
            if (error instanceof StoreUnavailableError) throw error;
            if (error instanceof SessionStoreError) throw new StoreUnavailableError();
            throw new StoreUnavailableError();
          }
          rejectPosted(judgment);
        }
      }
    } else if (request.method === "POST" && isSessionCreatePath(request.url)) {
      await rejectBots();
      if (!(await sessionStoreReachable())) throw new StoreUnavailableError();
      rejectPosted(await postedJudgment(request));
    }

    return {
      attributes: {},
      authenticator: "zealot-visitor",
      principalId,
      principalType: "user",
    };
  };
}

export default eveChannel({
  // Only localDev()'s callers may stub tools, for local evals. Never expose eve
  // dev or vercel dev through a tunnel or reverse proxy: callers through it
  // count as local development and would get tool stubs.
  auth: [vercelOidc(), visitorAuth(), withLocalToolStubs(localDev())],
  // Confirmed on EveChannelConfig.uploadPolicy: "disabled" rejects every attachment.
  uploadPolicy: "disabled",
  onMessage: async (ctx, message) => {
    if (hasNonTextPart(message)) {
      throw new ForbiddenError({ message: "Attachments are not accepted." });
    }
    const text = messageText(message);
    if (text.length > MAX_CONTENT_LENGTH) {
      throw new ForbiddenError({ message: "Message exceeds 4000 characters." });
    }
    const guidance = buildIntakeGuidance(ctx.eve.clientContext);
    return {
      auth: ctx.eve.caller,
      clientContext: guidance || [],
    };
  },
});
