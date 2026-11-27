import { gateway, generateText, Output, stepCountIs } from "ai";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  classifyNews,
  enabledFeatures,
  MAX_SEARCHES,
  NEWS_CLASSIFIER_MODEL,
  newsObjective,
  newsQueryAllowed,
  parallelSearchInputAllowed,
  PROSPECT_RULES,
  RESEARCH_OFF_NOTE,
  shapeNewsResults,
  UNTRUSTED_NOTE,
  type ProspectState,
} from "../../lib/prospect-research.ts";
import { prospect } from "../../lib/prospect-state.ts";

/* One forced call to AI Gateway's Parallel search. The small model only
   relays an objective and the visitor's query that this code wrote; this code
   checks the query before the call, and after it that the relay made exactly
   one call and sent exactly those two values and nothing else. The search
   runs on the provider's side, so a bad call is caught after it ran: its
   results never reach the chat model.
   It uses the same AI Gateway credentials as the chat model, with no Parallel
   key.

   mode "fast" is set here in the tool config on purpose: AI Gateway bills a
   fast search at $0 only when the developer config sets it (a mode the model
   picks is billed), and config values override what the model sends. Free
   fast mode ends Jan 31, 2027; after that it costs the regular $5 per 1,000
   searches. */
const SEARCH_MODEL = "openai/gpt-6-luna-fast";
const SEARCH_TIMEOUT_MS = 15_000;
const CLASSIFY_TIMEOUT_MS = 8_000;
const VERDICTS = z.object({ verdicts: z.array(z.object({ id: z.number().int(), bad: z.boolean() })) });
const UNAVAILABLE = "Search is unavailable right now. Continue without it.";

export default defineTool({
  description:
    "Search recent articles and news about the visitor's own organization, after research_prospect_site has run. The query must name that organization or its website. Use it to learn about their work or recent events so you can ask better questions. A few searches per conversation at most. Never search for anything else.",
  inputSchema: z.object({
    query: z
      .string()
      .min(4)
      .max(200)
      .describe("A search that names the visitor's organization or its website, such as \"Acme Food Bank expansion\"."),
  }),
  async execute({ query }) {
    if (!enabledFeatures().has("news")) return { available: false, rules: PROSPECT_RULES, note: RESEARCH_OFF_NOTE };
    const state = prospect.get();
    if (!state.site) {
      return { available: true, rules: PROSPECT_RULES, error: "Look at the visitor's site with research_prospect_site first." };
    }
    if (state.searches >= MAX_SEARCHES) {
      return { available: true, rules: PROSPECT_RULES, error: "The search limit for this conversation is reached. Continue with what you have." };
    }
    if (!newsQueryAllowed(query, state)) {
      return {
        available: true,
        rules: PROSPECT_RULES,
        error: `Searches must name ${state.organization ?? state.site}. Only articles about the visitor's organization can be searched.`,
      };
    }
    prospect.update((current) => ({ ...current, searches: current.searches + 1 }));
    return fetchProspectNews(query, state);
  },
});

// Parallel search and the classifier both call out. A retryable workflow step
// can run again, so this step does not. Its result is plain JSON.
async function fetchProspectNews(query: string, state: ProspectState) {
  "use step";
  const objective = newsObjective(state);
  try {
    const result = await generateText({
      model: SEARCH_MODEL,
      tools: {
        parallel_search: gateway.tools.parallelSearch({
          mode: "fast",
          maxResults: 5,
          excerpts: { maxCharsPerResult: 400 },
        }),
      },
      toolChoice: { type: "tool", toolName: "parallel_search" },
      stopWhen: stepCountIs(1),
      maxOutputTokens: 200,
      prompt: `Call parallel_search once. Use exactly this objective and these search_queries, and change nothing. objective: ${JSON.stringify(objective)} search_queries: ${JSON.stringify([query])}`,
      abortSignal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    // stepCountIs(1) limits steps, not calls within a step: exactly one
    // call, and its own result, matched by id.
    const call = result.toolCalls.length === 1 ? result.toolCalls[0] : undefined;
    if (!call || !parallelSearchInputAllowed(call.input, state, query)) {
      return { available: true, rules: PROSPECT_RULES, error: "The search did not run as scoped, so no results are shown." };
    }
    // A rate limit on the shared free capacity, or any gateway error,
    // comes back as { error, message } instead of results.
    const output = result.toolResults.find((toolResult) => toolResult.toolCallId === call.toolCallId)?.output as
      | { error?: unknown }
      | undefined;
    if (!output || output.error) return { available: true, rules: PROSPECT_RULES, error: UNAVAILABLE };
    // The word list first, then a reader for what it kept. Both drop bad
    // news; an empty or all-dropped search reads exactly as no results.
    const results = await classifyNews(shapeNewsResults(output), async (prompt) => {
      const verdicts = await generateText({
        model: NEWS_CLASSIFIER_MODEL,
        output: Output.object({ schema: VERDICTS }),
        prompt,
        maxOutputTokens: 400,
        abortSignal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
      });
      return verdicts.output;
    });
    if (results.length === 0) return { available: true, rules: PROSPECT_RULES, error: UNAVAILABLE };
    return { available: true, rules: PROSPECT_RULES, query, results, untrusted: UNTRUSTED_NOTE };
  } catch {
    return { available: true, rules: PROSPECT_RULES, error: UNAVAILABLE };
  }
}
fetchProspectNews.maxRetries = 0;
