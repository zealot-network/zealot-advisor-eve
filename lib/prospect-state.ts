import { defineState } from "eve/context";
import { INITIAL_PROSPECT, type ProspectState } from "./prospect-research.ts";

/**
 * Per-conversation prospect research state: the one organization site
 * research is locked to, and how much of the page and search budget is used.
 * eve keeps it with the session, so it survives restarts and redeploys.
 */
export const prospect = defineState<ProspectState>("zealot.prospect", () => ({ ...INITIAL_PROSPECT }));
