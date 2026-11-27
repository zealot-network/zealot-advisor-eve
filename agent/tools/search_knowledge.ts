import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchKnowledge } from "../../lib/knowledge.ts";

// searchKnowledge reads docs/eve-migration/source/consulting-knowledge.json
// plus lib/published-clients.json. The JSON began as the Lovable export
// and is now maintained here: the brand entries were edited in place
// when brand identity moved from Apostle to Zealot.

export default defineTool({
  description:
    "Search Zealot company knowledge before answering about services, clients, ventures, past work, or Zealot's founder, Brett Henry. Returns short grounded notes. Repeat the names, places, and years in those notes. A pricing or Rebuild Israel limit can sit beside other notes, so answer every part of the question the notes support. If nothing here answers a request for a client, a count, a percentage, a place, or revenue, say you do not know and offer the team through the contact form. Do not substitute a nearby note.",
  inputSchema: z.object({
    query: z.string().min(1).max(500),
  }),
  async execute({ query }) {
    return { results: searchKnowledge(query) };
  },
});
