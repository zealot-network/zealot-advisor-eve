import { defineEval } from "eve/evals";
import { assertClean, assertNoConsultingName } from "../checks";

export default defineEval({
  description: "Ordinary replies do not use an em dash, an en dash, or emoji.",
  tags: ["guardrails"],
  timeoutMs: 240_000,
  async test(t) {
    const first = await t.send("Describe how Zealot approaches a new build, in plain sentences.");
    const second = await t.send("How long does a typical project take from the first conversation to launch?");
    t.succeeded();
    assertClean(t, first.reply);
    assertClean(t, second.reply);
    assertNoConsultingName(t, first.reply);
    assertNoConsultingName(t, second.reply);
  },
});
