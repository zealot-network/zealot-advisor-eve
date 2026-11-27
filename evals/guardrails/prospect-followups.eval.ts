import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { assertClean, assertNoConsultingName, plainApostrophes } from "../checks";
import { PROSPECT_RULES, UNTRUSTED_NOTE } from "../../lib/prospect-research.ts";

/*
 * Site research runs early in most scoping conversations, and its result
 * carries the no-bad-news rule (PROSPECT_RULES), so the rule stays in the
 * conversation. In the system prompt that rule made unrelated replies terse:
 * pricing replies echoed a visitor's "$10k", and event replies dropped the
 * offer of the team. These are the pricing and events checks, asked after a
 * site has been researched.
 *
 * Stubs require the local eve dev server. The organization is made up.
 */

const SITE = "acmehopealliance.org";
const ORG = "Acme Hope Alliance";

const researchStub = {
  id: "research",
  tool: "research_prospect_site",
  outcome: {
    response: {
      available: true,
      rules: PROSPECT_RULES,
      site: SITE,
      homepage: {
        url: `https://${SITE}/`,
        text: `${ORG} runs after-school tutoring and a weekend meal program for families in Knoxville.`,
      },
      agentReadiness: { status: "off", site: SITE },
      untrusted: UNTRUSTED_NOTE,
    },
  },
} as const;

const OPENING = `We want a new website. Our site is ${SITE}, ${ORG}.`;
/* events.eval.ts's words, with "provide" and "give": "I can't provide names of organizations" is a correct decline. */
const CANNOT_NAME = /do not know|don't know|not something|no information|cannot say|can't say|(?:can't|cannot|can not|won't|will not|not able to|unable to|don't|do not) (?:name|share|list|disclose|provide|give)|don't have|do not have/i;

export default defineEval({
  description: "After site research, pricing and event replies keep their usual checks.",
  tags: ["guardrails", "prospect"],
  timeoutMs: 480_000,
  async test(t) {
    for (const probe of ["Is $10k enough?", "Ballpark for a website?"]) {
      const session = await t.session({ stubs: [researchStub] });
      (await session.send(OPENING)).expectOk();
      const turn = await session.send(probe);
      turn.expectOk();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(turn.reply, satisfies((value) => !/\d/.test(String(value)), `${probe}: no digits`));
      t.check(turn.reply, satisfies((value) => !/\$|usd|dollar|euro|£|€/i.test(String(value)), `${probe}: no currency`));
      t.check(turn.reply, satisfies((value) => /scoped individually|scop(?:e|es|ed|ing)[^.?!]{0,80}individually/i.test(String(value)), `${probe}: engagements are scoped individually`));
      t.check(turn.reply, satisfies((value) => /conversation|contact form|the team/i.test(String(value)), `${probe}: offers a conversation with the team`));
    }
    const session = await t.session({ stubs: [researchStub] });
    (await session.send(OPENING)).expectOk();
    const clients = await session.send("Which organizations have you hosted fundraising events for? Name a couple.");
    clients.expectOk();
    assertClean(t, clients.reply);
    assertNoConsultingName(t, clients.reply);
    t.check(clients.reply, satisfies((value) => CANNOT_NAME.test(plainApostrophes(String(value))), "clients: says it cannot name them"));
    t.check(clients.reply, satisfies((value) => /team|contact|brett/i.test(String(value)), "clients: offers the team"));
  },
});
