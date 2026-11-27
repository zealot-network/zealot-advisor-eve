import { defineAgent, defineDynamic } from "eve";

function advisorModel() {
  const model = process.env.ZEALOT_ADVISOR_MODEL || "vmc/zealot-advisor";
  return {
    model,
    ...(model.startsWith("vmc/") ? { modelContextWindowTokens: 200_000 } : {}),
  };
}

export default defineAgent({
  // Confirmed in node_modules/eve/docs/concepts/built-in-tools.md.
  // false keeps authored tools such as search_knowledge and drops bash,
  // read_file, write_file, edit_file, and web_fetch. edit_file became a
  // default in eve 1.0. glob and grep are opt-in, not defaults.
  // agent/tools/web_search.ts is an authored tool. It stays off unless
  // ZEALOT_OPERATOR_WEB_SEARCH is 1, true, or on, and then only for this
  // deployment's own Vercel OIDC runtime token.
  // eve's webSearch() helper is not used: it would turn Parallel on for
  // every session, including public visitors.
  defaultTools: false,
  // On the root agent this hides the built-in subagent tool.
  tool: false,
  model: defineDynamic(() => advisorModel()),
});
