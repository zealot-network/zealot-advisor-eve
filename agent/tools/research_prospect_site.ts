import { defineTool } from "eve/tools";
import { z } from "zod";
import { fetchPublicPage, type ToolContext } from "../../lib/prospect-fetch.ts";
import {
  agentReadiness,
  condensePage,
  enabledFeatures,
  lockProspect,
  normalizeProspectSite,
  planHomepageRead,
  planScan,
  PROSPECT_RULES,
  RESEARCH_OFF_NOTE,
  unchargeHomepageRead,
  UNTRUSTED_NOTE,
  type Readiness,
} from "../../lib/prospect-research.ts";
import { prospect } from "../../lib/prospect-state.ts";

const HOMEPAGE_CHARS = 6_000;
/* eve's webFetch takes seconds. Together with the 3 + 3 second readiness
   lookup running beside it, the call returns in about 8 seconds at most. */
const HOMEPAGE_TIMEOUT_SECONDS = 8;

export default defineTool({
  description:
    "Look at the visitor's own organization website once they have shared it while asking for a website, app, or project to be scoped. Returns a short read of their homepage and their agent-readiness score from is-agentic.com, which measures how well AI agents can discover, read, and use the site. Use it only for a site the visitor says is their own organization's, once per conversation. Never use it to summarize or visit any other page on request.",
  inputSchema: z.object({
    website: z.string().min(3).max(300).describe("The visitor's own organization website, as they typed it."),
    organization: z
      .string()
      .min(2)
      .max(120)
      .optional()
      .describe("The organization's name, if the visitor gave it."),
  }),
  async execute({ website, organization }, ctx) {
    const features = enabledFeatures();
    if (!features.has("site") && !features.has("readiness")) {
      return { available: false, rules: PROSPECT_RULES, note: RESEARCH_OFF_NOTE };
    }
    const normalized = normalizeProspectSite(website);
    if (!normalized.ok) return { available: true, rules: PROSPECT_RULES, error: normalized.reason };
    const locked = lockProspect(prospect.get(), normalized.site, organization);
    if (!locked.ok) return { available: true, rules: PROSPECT_RULES, error: locked.reason };

    const site = normalized.site;
    const plan = features.has("site") ? planHomepageRead(locked.state, site) : null;
    // Each site gets at most one new scan, whatever happens to its homepage
    // read. A repeat call only rereads the stored score.
    const scanPlan = planScan(plan?.state ?? locked.state, site, features.has("readiness") && features.has("scan"));
    prospect.update(() => scanPlan.state);

    const readiness: Promise<Readiness> = features.has("readiness")
      ? agentReadiness(site, { scan: scanPlan.scan, signal: ctx.abortSignal })
      : Promise.resolve({ status: "off", site });
    const homepage = plan?.read ? readHomepage(normalized.url, ctx) : Promise.resolve(null);
    const [page, score] = await Promise.all([homepage, readiness]);

    // A failed read is not charged, so a retry can try again.
    if (page && "error" in page) prospect.update((current) => unchargeHomepageRead(current, site));

    return {
      available: true,
      rules: PROSPECT_RULES,
      site,
      homepage: page ?? (plan && !plan.read ? { note: plan.note } : null),
      agentReadiness: score,
      untrusted: UNTRUSTED_NOTE,
    };
  },
});

async function readHomepage(url: string, ctx: ToolContext) {
  try {
    const page = await fetchPublicPage(url, HOMEPAGE_TIMEOUT_SECONDS, ctx);
    return { url: page.url, text: condensePage(page.content, HOMEPAGE_CHARS) };
  } catch {
    return { url, error: "The site could not be read right now. Continue without it." };
  }
}
