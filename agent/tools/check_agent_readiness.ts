import { defineTool } from "eve/tools";
import { z } from "zod";
import { agentReadiness, enabledFeatures, RESEARCH_OFF_NOTE } from "../../lib/prospect-research.ts";
import { prospect } from "../../lib/prospect-state.ts";

export default defineTool({
  description:
    "Check again for the visitor's agent-readiness score when research_prospect_site reported that a scan was still running. Works only for the site already researched in this conversation.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const features = enabledFeatures();
    if (!features.has("readiness")) return { available: false, note: RESEARCH_OFF_NOTE };
    const { site } = prospect.get();
    if (!site) return { available: true, error: "No site has been researched in this conversation yet." };
    // A scan already started for this site, so only read the stored report here.
    return { available: true, agentReadiness: await agentReadiness(site, { scan: false, signal: ctx.abortSignal }) };
  },
});
