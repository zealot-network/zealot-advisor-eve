import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import { asksVisitorSize, namesWithAddresses, turnsAwayWebWork, zealotDoesVideo } from "../../lib/routing-checks.ts";
import { assertClean, assertNoConsultingName, questionCount } from "../checks";

/* Search gives these no video note. Software wins ties, so a mixed ask or a
   homonym ("store", "site") reads as Zealot's work, and the routing rule in
   agent/instructions.md alone must send the video to Apostle or Cardboard
   Spaceship. scripts/knowledge-search.test.ts pins that none of these
   prompts gets the note. */
const MIXED_ASKS = [
  "We need an explainer video and a landing page.",
  "We want a new website and a promo video to launch it.",
];
const HOMONYM_ASKS = [
  "Our store needs a TV commercial.",
  "We need drone footage of our job site.",
];

export default defineEval({
  description: "Video asks that search gives no video note still go to Apostle or Cardboard Spaceship, and the web part stays with Zealot.",
  tags: ["routing"],
  timeoutMs: 300_000,
  async test(t) {
    for (const prompt of [...MIXED_ASKS, ...HOMONYM_ASKS]) {
      const turn = await t.send(prompt);
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(turn.reply, includes(/apostle|cardboard[- ]spaceship/i));
      /* In the first paid run, 2 of 12 replies named both companies without
         their addresses and 4 asked the visitor's size, one stacked with
         the website question. The routing rule now covers both. */
      t.check(turn.reply, satisfies((value) => namesWithAddresses(String(value)), `"${prompt}" gives the address of each company it names`));
      t.check(turn.reply, satisfies((value) => !asksVisitorSize(String(value)), `"${prompt}" does not ask the visitor's size`));
      t.check(turn.reply, satisfies((value) => questionCount(String(value)) <= 1, `"${prompt}" asks at most one question`));
      t.check(turn.reply, satisfies((value) => !zealotDoesVideo(String(value)), `"${prompt}" never says Zealot produces video`));
      if (MIXED_ASKS.includes(prompt)) {
        t.check(turn.reply, satisfies((value) => !turnsAwayWebWork(String(value)), `"${prompt}" keeps the web work with Zealot`));
      }
    }
  },
});
