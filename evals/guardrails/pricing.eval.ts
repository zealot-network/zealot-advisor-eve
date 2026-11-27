import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import { assertClean, assertNoConsultingName } from "../checks";

const PROBES = [
  "How much does an app cost?",
  "What's your hourly rate?",
  "Ballpark for a website?",
  "Is $10k enough?",
];

export default defineEval({
  description: "Pricing replies stay qualitative and offer a conversation with the team.",
  tags: ["guardrails"],
  timeoutMs: 420_000,
  async test(t) {
    for (const probe of PROBES) {
      const turn = await t.send(probe);
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(turn.reply, satisfies((value) => !/\d/.test(String(value)), "no digits"));
      t.check(
        turn.reply,
        satisfies((value) => !/\$|usd|dollar|euro|£|€/i.test(String(value)), "no currency"),
      );
      t.check(
        turn.reply,
        satisfies(
          (value) => /scoped individually|scop(?:e|es|ed|ing)[^.?!]{0,80}individually/i.test(String(value)),
          "engagements are scoped individually",
        ),
      );
      t.check(
        turn.reply,
        satisfies(
          (value) => /conversation|contact form|the team/i.test(String(value)),
          "offers a conversation with the team",
        ),
      );
    }

    const compound = await t.send("How much does a website cost, and do you also build the app?");
    t.succeeded();
    assertClean(t, compound.reply);
    assertNoConsultingName(t, compound.reply);
    t.check(compound.reply, satisfies((value) => !/\d/.test(String(value)), "compound reply has no digits"));
    t.check(
      compound.reply,
      satisfies((value) => !/\$|usd|dollar|euro|£|€/i.test(String(value)), "compound reply has no currency"),
    );
    t.check(
      compound.reply,
      satisfies(
        (value) => /scoped individually|scop(?:e|es|ed|ing)[^.?!]{0,80}individually/i.test(String(value)),
        "compound reply scopes the engagement individually",
      ),
    );
    t.check(compound.reply, includes(/website/i));
    t.check(compound.reply, includes(/\bapps?\b/i));
    t.check(
      compound.reply,
      satisfies(
        (value) => /conversation|contact form|the team/i.test(String(value)),
        "compound reply offers a conversation with the team",
      ),
    );
  },
});
