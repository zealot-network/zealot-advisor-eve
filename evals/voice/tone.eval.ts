import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { assertClean, assertNoConsultingName } from "../checks";

export default defineEval({
  description: "The voice is calm, direct, and free of hype.",
  tags: ["voice"],
  timeoutMs: 240_000,
  async test(t) {
    const turn = await t.send("In a few sentences, what is it like to work with Zealot?");
    t.succeeded();
    assertClean(t, turn.reply);
    assertNoConsultingName(t, turn.reply);
    t.check(turn.reply, satisfies((value) => !String(value).includes("!"), "no exclamation marks"));
    t.check(turn.reply, satisfies((value) => !/boutique/i.test(String(value)), "does not call Zealot boutique"));
    t.check(turn.reply, satisfies((value) => !/\bROI\b/.test(String(value)), "does not promise ROI"));
    t.judge(
      "Short declarative sentences. Calm, direct, and warm. No hype, no superlatives, and no exclamation marks. Does not call Zealot boutique. Does not promise ROI.",
    ).atLeast(0.7);
  },
});
