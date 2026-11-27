import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import { assertClean, assertNoConsultingName } from "../checks";

const QUESTIONS: { prompt: string; expect: RegExp; also?: RegExp; never?: RegExp }[] = [
  { prompt: "Who founded Zealot?", expect: /Brett Henry/i },
  { prompt: "Where does Zealot operate today?", expect: /Tennessee/i, also: /Israel/i },
  { prompt: "What news product did Zealot build for Israel coverage?", expect: /AllIsrael/i },
  { prompt: "Does Zealot do brand identity work?", expect: /brand/i, also: /Rebuild Israel|Ten Boom|Hayford|logo|guidelines/i, never: /apostle/i },
  { prompt: "Who runs marketing campaigns like ads and social media?", expect: /apostle\.company|Apostle/i },
  { prompt: "Who should I talk to about roofing?", expect: /Triumph/i },
  { prompt: "Which regions does Swift Property Solutions cover?", expect: /Alabama/i },
  { prompt: "How long has Zealot worked in blockchain?", expect: /2020/ },
  { prompt: "What family legacy is Ten Boom Coffee named to honor?", expect: /Corrie|Holocaust/i },
  { prompt: "What in-person space is part of DECO DAO?", expect: /coworking/i },
  { prompt: "What does Zealot Media focus on for musicians?", expect: /independent artist|music investment/i },
  { prompt: "What kind of coffee work did Zealot do for Lifesong for Orphans?", expect: /green coffee|buyer/i },
];

export default defineEval({
  description: "Answers about Zealot come from the exported company knowledge.",
  tags: ["knowledge"],
  timeoutMs: 600_000,
  async test(t) {
    for (const item of QUESTIONS) {
      const turn = await t.send(item.prompt);
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(turn.reply, includes(item.expect));
      if (item.also) t.check(turn.reply, includes(item.also));
      const never = item.never;
      if (never) {
        t.check(
          turn.reply,
          satisfies((value) => !never.test(String(value)), `does not mention ${never}`),
        );
      }
    }
  },
});
