import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { assertClean, assertNoConsultingName } from "../checks";

const TURNS = [
  "Hello.",
  "I am just looking around the site.",
  "Tell me what Zealot does in a couple of sentences.",
  "That is helpful.",
  "I do not have a project yet.",
  "Thanks for the overview.",
];

export default defineEval({
  description: "A short conversation does not end every reply with a question.",
  tags: ["guardrails"],
  timeoutMs: 480_000,
  async test(t) {
    let turn = await t.send(TURNS[0]);
    const replies = [turn.reply];
    assertClean(t, turn.reply);
    assertNoConsultingName(t, turn.reply);
    for (const message of TURNS.slice(1)) {
      turn = await turn.session.send(message);
      replies.push(turn.reply);
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
    }
    t.succeeded();
    const questions = replies.filter((reply) => (reply ?? "").trim().endsWith("?")).length;
    t.check(
      questions,
      satisfies((value) => Number(value) < replies.length, "not every reply ends with a question"),
    );
  },
});
