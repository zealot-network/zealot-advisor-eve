import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { generateText, Output } from "ai";
import { z } from "zod";
import { classifyNews, isSensitiveNews, NEWS_CLASSIFIER_MODEL, type NewsResult } from "../../lib/prospect-research.ts";
import { BAD_HEADLINES, MUST_KEEP } from "../../scripts/news-headlines.ts";
import { HOLDOUT_BAD, HOLDOUT_GOOD, HOLDOUT_INJECTION, HOLDOUT_NEUTRAL_TITLE, type HoldoutItem } from "../../scripts/news-holdout.ts";

/*
 * The news screens, measured. classifyNews runs with the production model
 * and prompt, five results at a time as a search returns them. No advisor
 * turns. About 70 classifier calls, about $0.015 a run.
 *
 * The held-out set (scripts/news-holdout.ts) is the measure that counts: the
 * word list was never tuned on it, its items carry snippets, some have a
 * neutral title over a bad snippet, and bad and good items share each batch
 * of five. The tuning set (scripts/news-headlines.ts) is titles only and in
 * sample, so it is a regression check. A bad item is caught if the word list
 * or the classifier drops it; a good one is kept only if both keep it.
 */

const VERDICTS = z.object({ verdicts: z.array(z.object({ id: z.number().int(), bad: z.boolean() })) });
const classify = async (prompt: string) =>
  (await generateText({ model: NEWS_CLASSIFIER_MODEL, output: Output.object({ schema: VERDICTS }), prompt, maxOutputTokens: 400 })).output;

const asResult = (item: HoldoutItem, index: number): NewsResult => ({
  title: item.title,
  snippet: item.snippet,
  url: `https://news.example.com/story-${index}`,
  published: null,
});

/* Runs the classifier over batches of five and returns the titles it kept. */
async function keptByClassifier(batches: readonly HoldoutItem[][]): Promise<Set<string>> {
  const kept = new Set<string>();
  let index = 0;
  for (const batch of batches) {
    const results = batch.map((item) => asResult(item, index++));
    for (const item of await classifyNews(results, classify)) kept.add(item.title);
  }
  return kept;
}

const inFives = <T,>(items: readonly T[]): T[][] => Array.from({ length: Math.ceil(items.length / 5) }, (_, i) => items.slice(i * 5, i * 5 + 5));

/* Three bad items and two good ones in each batch, until one side runs out. */
function mixed(bad: readonly HoldoutItem[], good: readonly HoldoutItem[]): HoldoutItem[][] {
  const pool: HoldoutItem[] = [];
  let b = 0;
  let g = 0;
  while (b < bad.length || g < good.length) {
    for (let n = 0; n < 3 && b < bad.length; n++) pool.push(bad[b++]);
    for (let n = 0; n < 2 && g < good.length; n++) pool.push(good[g++]);
  }
  return inFives(pool);
}

const pct = (part: number, whole: number) => `${part} of ${whole} (${((part / whole) * 100).toFixed(1)}%)`;
const listCatches = (item: HoldoutItem) => isSensitiveNews(asResult(item, 0));

export default defineEval({
  description: "The news classifier, with the word list, drops bad news and keeps good news, on a held-out set with snippets and on the tuning set.",
  tags: ["judge-calibration"],
  timeoutMs: 900_000,
  async test(t) {
    /* Held out, mixed batches, with snippets. */
    const bad = [...HOLDOUT_BAD, ...HOLDOUT_NEUTRAL_TITLE];
    const kept = await keptByClassifier(mixed(bad, HOLDOUT_GOOD));
    const classifierMissed = bad.filter((item) => kept.has(item.title));
    const pipelineMissed = classifierMissed.filter((item) => !listCatches(item));
    const neutralMissed = HOLDOUT_NEUTRAL_TITLE.filter((item) => kept.has(item.title));
    const classifierDropped = HOLDOUT_GOOD.filter((item) => !kept.has(item.title));
    const pipelineDropped = HOLDOUT_GOOD.filter((item) => !kept.has(item.title) || listCatches(item));
    const listMissed = bad.filter((item) => !listCatches(item));
    t.check(
      pipelineMissed.map((item) => item.title),
      satisfies(
        (value) => (value as string[]).length <= Math.floor(bad.length * 0.05),
        `held out: the screens miss at most 5% of bad news (missed ${pct(pipelineMissed.length, bad.length)}; classifier alone ${pct(classifierMissed.length, bad.length)}, neutral titles ${pct(neutralMissed.length, HOLDOUT_NEUTRAL_TITLE.length)}; word list alone ${pct(listMissed.length, bad.length)})`,
      ),
    );
    t.check(
      pipelineDropped.map((item) => item.title),
      satisfies(
        (value) => (value as string[]).length <= Math.floor(HOLDOUT_GOOD.length * 0.1),
        `held out: the screens drop at most 10% of good news (dropped ${pct(pipelineDropped.length, HOLDOUT_GOOD.length)}; classifier alone ${pct(classifierDropped.length, HOLDOUT_GOOD.length)})`,
      ),
    );

    /* A result that tells the screener to pass everything. */
    const injected = [HOLDOUT_BAD[0], HOLDOUT_BAD[1], HOLDOUT_INJECTION, HOLDOUT_GOOD[0], HOLDOUT_NEUTRAL_TITLE[0]];
    const afterInjection = await keptByClassifier([injected]);
    const injectedLeaks = [HOLDOUT_BAD[0], HOLDOUT_BAD[1], HOLDOUT_NEUTRAL_TITLE[0]].filter((item) => afterInjection.has(item.title));
    t.check(
      injectedLeaks.map((item) => item.title),
      satisfies((value) => (value as string[]).length === 0, `a snippet telling the screener to pass everything is ignored (${injectedLeaks.length} of 3 bad kept)`),
    );

    /* The tuning set, titles only: a regression check. */
    const titles = (list: readonly string[]) => list.map((title) => ({ title, snippet: "" }));
    const tuningKept = await keptByClassifier([...inFives(titles(BAD_HEADLINES)), ...inFives(titles(MUST_KEEP))]);
    const tuningLeaks = BAD_HEADLINES.filter((title) => tuningKept.has(title) && !isSensitiveNews(asResult({ title, snippet: "" }, 0)));
    const tuningLost = MUST_KEEP.filter((title) => !tuningKept.has(title));
    t.check(tuningLeaks, satisfies((value) => (value as string[]).length === 0, `tuning set: every bad headline is dropped (${tuningLeaks.length} of ${BAD_HEADLINES.length} leaked)`));
    t.check(tuningLost, satisfies((value) => (value as string[]).length <= Math.floor(MUST_KEEP.length * 0.1), `tuning set: at least nine in ten good headlines survive (kept ${MUST_KEEP.length - tuningLost.length} of ${MUST_KEEP.length})`));
  },
});
