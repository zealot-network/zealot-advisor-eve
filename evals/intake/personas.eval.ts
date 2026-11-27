import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import {
  INITIAL_INTAKE_STATE,
  advanceIntake,
  type IntakeState,
} from "../../src/lib/buildIntake.ts";
import { assertClean, assertNoConsultingName, questionCount, sentenceCount } from "../checks";

const PERSONAS: { name: string; messages: string[]; brief?: RegExp[] }[] = [
  {
    name: "app founder",
    messages: [
      "I want to build a member app for my startup.",
      "It is for our customers and a small internal team.",
      "We need one place to manage accounts and support.",
      "We are thinking a few months.",
      "We already have a spreadsheet and a small team.",
    ],
    brief: [/\bapp\b/i, /small internal team/i, /accounts and support/i, /a few months/i, /spreadsheet/i],
  },
  {
    name: "nonprofit",
    messages: [
      "We are a nonprofit and want a donation site.",
      "It is for donors and volunteers.",
      "Our greatest need is tracking gifts and volunteers in one place.",
      "Still exploring the timeline.",
      "We cannot add new staff this year.",
    ],
    brief: [/donation/i, /donors and volunteers/i, /gifts and volunteers/i, /still exploring/i, /cannot add new staff/i],
  },
  {
    name: "Israel project",
    messages: [
      "I want to build a small site for a project in Israel.",
      "It is for a local community.",
      "The core need is a clear public home for the work.",
      "The timeline is still open.",
      "A small volunteer group has to be able to update it.",
    ],
    brief: [/small site/i, /local community/i, /public home/i, /still open/i, /small volunteer group/i],
  },
  {
    name: "Tennessee business",
    messages: [
      "We run a business in Tennessee and need a better website.",
      "It is for our customers.",
      "The core need is a site people can trust.",
      "We want to launch this season.",
      "Please keep the current domain.",
    ],
    brief: [/website/i, /\bcustomers\b/i, /people can trust/i, /this season/i, /current domain/i],
  },
  {
    name: "browser",
    messages: [
      "I am just browsing.",
      "No project yet. What kinds of things do you build?",
    ],
  },
];

function context(state: IntakeState) {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.fields)) {
    if (typeof value === "string" && value.trim()) fields[key] = value;
  }
  return {
    clientContext: {
      phase: state.phase,
      mode: state.mode,
      fields,
    },
  };
}

export default defineEval({
  description: "Guided intake stays short, asks at most one question, and ends in a Build Brief.",
  tags: ["intake"],
  timeoutMs: 900_000,
  async test(t) {
    for (const persona of PERSONAS) {
      let state = advanceIntake(INITIAL_INTAKE_STATE, persona.messages[0]);
      let turn = await t.send(persona.messages[0], context(state));
      let last = turn.reply ?? "";
      assertClean(t, last);
      assertNoConsultingName(t, last);
      for (const message of persona.messages.slice(1)) {
        state = advanceIntake(state, message);
        turn = await turn.session.send(message, context(state));
        last = turn.reply ?? "";
        assertClean(t, last);
        assertNoConsultingName(t, last);
        t.check(
          questionCount(last),
          satisfies((value) => Number(value) <= 1, `${persona.name} asks at most one question`),
        );
        if (state.phase !== "summary" && state.phase !== "complete") {
          t.check(
            sentenceCount(last),
            satisfies((value) => {
              const count = Number(value);
              return count >= 1 && count <= 6;
            }, `${persona.name} stays brief`),
          );
        }
      }
      if (persona.brief) {
        t.check(last, includes(/build brief/i));
        t.check(last, includes(/contact form/i));
        for (const pattern of persona.brief) {
          t.check(last, includes(pattern));
        }
        t.check(
          last,
          satisfies(
            (value) => !/I (can|will) send|I have sent|I emailed|I submitted/i.test(String(value)),
            "does not claim to send the brief",
          ),
        );
      }
    }

    let budget = INITIAL_INTAKE_STATE;
    budget = advanceIntake(budget, "I want to build a member app for my bookstore.");
    let budgetTurn = await t.send("I want to build a member app for my bookstore.", context(budget));
    assertClean(t, budgetTurn.reply);
    assertNoConsultingName(t, budgetTurn.reply);
    budget = advanceIntake(budget, "What budget should we plan for?");
    budgetTurn = await budgetTurn.session.send("What budget should we plan for?", context(budget));
    const budgetReply = budgetTurn.reply ?? "";
    assertClean(t, budgetReply);
    assertNoConsultingName(t, budgetReply);
    t.check(budgetReply, satisfies((value) => !/\d/.test(String(value)), "budget reply has no digits"));
    t.check(
      budgetReply,
      satisfies((value) => !/\$|usd|dollar|euro|£|€/i.test(String(value)), "budget reply has no currency"),
    );
    t.check(budgetReply, includes(/scoped individually/i));
    t.check(
      budgetReply,
      satisfies(
        (value) => /bookstore|app|need/i.test(String(value)),
        "budget reply still talks about the build",
      ),
    );
    t.check(
      questionCount(budgetReply),
      satisfies((value) => Number(value) <= 1, "budget reply asks at most one question"),
    );
    t.succeeded();
  },
});
