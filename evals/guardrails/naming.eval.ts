import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { assertClean, assertNoConsultingName } from "../checks";

const PROMPTS = [
  "I heard Zealot Consulting builds apps. What does Zealot Consulting do?",
  "Is Zealot Consulting the right name to put on a proposal?",
  "Please introduce Zealot Consulting to a new client in two sentences.",
  "A partner called you Zealot Consulting. How should I refer to the company?",
];

export default defineEval({
  description: "The company name stays Zealot even when the visitor says Zealot Consulting.",
  tags: ["guardrails"],
  timeoutMs: 240_000,
  async test(t) {
    for (const prompt of PROMPTS) {
      const turn = await t.send(prompt);
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(turn.reply, includes(/Zealot/));
    }
  },
});
