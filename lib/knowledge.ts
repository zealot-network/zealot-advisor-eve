import knowledgeFile from "../docs/eve-migration/source/consulting-knowledge.json" with { type: "json" };
import publishedFile from "./published-clients.json" with { type: "json" };
import founderFile from "./founder.json" with { type: "json" };
import synonymFile from "../docs/eve-migration/source/synonym-mappings.json" with { type: "json" };
import { BAA, STANDARD, TIED_CLAIM, firstComplianceWording } from "./compliance-wording.ts";

interface KnowledgeEntry {
  title: string;
  description: string;
  topics: string[];
  expertise_areas: string[];
  related_projects?: string[];
  display_priority: number;
}

interface SynonymMapping {
  term: string;
  synonyms: string[];
}

const BEHAVIORAL_TITLES = new Set([
  "Zealot Cross-Project Operating Patterns",
  "Zealot Operating Philosophy",
  "Zealot Reasoning Mode Switches",
  "Zealot Capabilities & Boundaries",
  "Zealot Decision Lens",
]);

const PRICING_TITLE = "Pricing and Cost Questions";
const REBUILD_TITLE = "Rebuild Israel - Land Entitlement Fund";

const PRICING_PUBLIC =
  "Zealot does not publish fees. Engagements are scoped individually. Offer a conversation with the team through the contact form. Do not state a fee, a range, or any figure.";

const REBUILD_PUBLIC =
  "Rebuild Israel is a Zealot client. Zealot built its brand identity, investor communications, website, and operational systems. Fund V is closed to new investment, and a new fund is in development. Brett Henry led the brand development, the investor communications, and the operating setup. Michael Lynch leads investor relationships. Send fund questions to rebuildisrael.com. Do not give investment advice.";

// Also applied to prospect research text in lib/prospect-research.ts.
export const SENSITIVE_FACT =
  /limited partnership|reg(?:ulation)?\s*d|\b506\b|minimum investment|fund structure|offering type|raise size|\breturns\b|\$\s?\d|\bfree\s+\d+\s+minute\b/i;

/* Brand identity is Zealot work. Marketing campaigns are not: they go
   to Apostle, the Zealot portfolio company for campaigns. A message can
   ask for both, so each gets its own forced note. */
const BRAND_TITLE = "Zealot brand development";
const BRAND_BLURB =
  "Zealot does brand development directly: logo and identity systems, brand guidelines and templates, and pitch decks and investor materials. The same team builds the website and app, so nothing gets lost in a handoff. Brand work includes Rebuild Israel, Ten Boom Coffee, and the Jack Hayford Legacy Library.";
/* Video production is never Zealot's. Without this, a small-business video
   question retrieved only the Cardboard Spaceship note (the one entry that
   says "video production"), pulling against the routing rule. */
const VIDEO_TITLE = "Video production goes to Apostle or Cardboard Spaceship";
const VIDEO_BLURB =
  "Zealot does not produce video. Video production, including marketing and promo videos, goes to Apostle at apostle.company for small and mid-sized businesses and to Cardboard Spaceship at cardboard-spaceship.com for enterprise clients.";
/* A video to be produced. Software wins ties: a request that names
   something Zealot builds is never a video request, whatever video words it
   also has. "Can you create a film review website?" and "Make us an app
   that edits video with AI" are Zealot's work. A deliverable inside a short
   trailing "for our ..." phrase names the audience, not the ask, so "Can you
   make a promo video for our app launch?" is still video. Otherwise video
   intent needs a production signal, and a software frame cancels it unless
   a production verb governs the video itself. A missed video ask only loses
   this retrieval hint, since the routing rule still applies; a false one
   would turn away software work. */
/* An event Zealot might plan and host, as a noun: "our gala", "the fundraiser". */
const EVENT_NOUN = "(?:events?|galas?|fundraisers?|banquets?|benefits?|dinners?|concerts?|conferences?|awareness nights?)";
const VIDEO_NOUN = String.raw`(?:videos?|commercials?|films?|reels?|shorts|footage|spots?|documentar(?:y|ies)|explainers?|animations?)`;
const PRODUCTION_VERB = new RegExp(
  String.raw`\b(?:make|makes|making|produce|produces|producing|shoot|shoots|shooting|film|films|filming|edit|edits|editing|create|creates|creating|animate|animates|animating)\b[^.?!]{0,25}\b${VIDEO_NOUN}\b` +
    /* ... when the noun is the thing made, not a modifier of software: "make
       a video editor app" and "create a video player" are software. */
    String.raw`(?! (?:editing |streaming |sharing |hosting |upload |uploading |call |calling |chat |conferencing |recording )?(?:apps?|editors?|players?|tools?|platforms?|sites?|website|features?|generators?|librar(?:y|ies)|plugins?|software|sdks?|apis?|integrations?|widgets?|components?)\b)`,
  "i",
);
const PRODUCTION_SIGNAL = new RegExp(
  String.raw`\b(?:video production|videograph\w*|film crew|video content|video ads?|video series|brand film|feature films?|(?:promo|promotional|marketing|explainer|launch|brand|product|social media|short form|corporate|training|event|testimonial|music) videos?)\b` +
    String.raw`|\b(?:tv|television|web|online|video|social|youtube) commercials?\b|\bcommercials\b|\ba commercial (?:for|spot)\b|\bcommercial (?:spot|shoot)\b` +
    String.raw`|\b(?:youtube|instagram|tiktok|facebook|social(?: media)?|video|vertical) (?:shorts|reels)\b|\b(?:shorts|reels) (?:for|on) (?:youtube|instagram|tiktok|facebook|social(?: media)?)\b` +
    String.raw`|\bai[- ](?:generated|assisted|powered)? ?video (?:production|content|ads?|work)\b` +
    String.raw`|\bfilm(?:ing|ed)? (?:our|my|a|an|the|your|us|it|them|this|that)\b|\bfilming\b|\b(?:film|video) shoots?\b` +
    String.raw`|\b(?:do|does) (?:you|zealot|apostle|they) (?:do|make|produce|offer|shoot)\b[^.?!]{0,20}\b${VIDEO_NOUN}\b` +
    String.raw`|\b(?:need|needs|want|wants|looking for|require|requires)\b[^.?!]{0,30}\b(?:videos?|footage)\b` +
    /* Recording a video is production too, but weaker: "users record video in
       the app" is software, so this is a signal a software frame cancels. */
    String.raw`|\brecord(?:s|ing)?\b[^.?!]{0,25}\b(?:videos?|footage)\b` +
    String.raw`|\b(?:\d+[- ]second|tv|television|radio|broadcast) spots?\b|\bspots? (?:for|on) (?:local )?(?:tv|television|broadcast|the air)\b` +
    String.raw`|\b(?:animated|animation) videos?\b|\bmotion graphics\b|\bdocumentar(?:y|ies)\b` +
    /* A video of or for an event: "a video for our gala". */
    String.raw`|\bvideos? (?:for|of|from|at|about) (?:our|the|my|a|an|this|their|your) (?:[\w'-]+ ){0,2}${EVENT_NOUN}\b`,
  "i",
);
const SOFTWARE_FRAME =
  /\b(?:apps?|application|platform|features?(?! films?\b)|users?|upload\w*|players?|embed\w*|onboarding|homepage|dashboard|portal|tools?|editor|software|generators?|api|sdk|plugins?|integration|streaming|conferencing|background)\b|\b(?:add|build|integrate|put)\b[^.?!]{0,40}\b(?:to|into|in|on) (?:our|the|your|a) (?:app|site|website|product|platform|page)\b|\bvideo (?:calls?|visits?|chats?|consults?|consultations?|appointments?|meetings?)\b/i;

/* Something Zealot builds. A visitor's video business asking for one is
   Zealot's client, as Cardboard Spaceship was. "On site" is a place, a
   feature film is a film, and "booking a videographer" books a person. */
const SOFTWARE_DELIVERABLE =
  /\b(?:web ?sites?|(?<!\b(?:on|off) )sites?|apps?|applications?|platforms?|tools?|portals?|dashboards?|systems?|software|features?(?! films?\b)|plugins?|apis?|integrations?|stores?|crms?|databases?|bots?|agents?|landing pages?|web ?pages?|home ?pages?|intranets?|booking(?! (?:a|an|the|our|my|your|us|them)\b))\b/i;
/* "for our app launch", "for my video production company": up to four
   words after the sentence's first words, ending at a sentence end, a comma
   or other clause mark, or a joining word, as in "a promo video for our
   app, and we need it by June". The phrase names the audience, so neither
   the deliverable check nor the software frame reads it. */
const TRAILING_FOR_PHRASE =
  /(?<=\w )for (?:our|my|the|your|its|their|this|that|a|an)(?: [\w']+){1,4}(?=\s*(?:[.?!,;:]|$)|\s+(?:and|but|so|because|which|who|that|before|by|to)\b)/gi;

export function isVideoQuery(query: string): boolean {
  /* "video-call app" reads as "video call app". */
  const text = query.replace(/[-\u2010\u2011]/g, " ");
  const ask = text.replace(TRAILING_FOR_PHRASE, " ");
  if (SOFTWARE_DELIVERABLE.test(ask)) return false;
  const governed = PRODUCTION_VERB.test(text);
  if (!governed && !PRODUCTION_SIGNAL.test(text)) return false;
  return governed || !SOFTWARE_FRAME.test(ask);
}

/* An event to plan, host, or fill. A strong signal puts the event note
   first, as the brand, campaign, and video notes are put first. The note
   also ranks normally, on whole event phrases only (see eventNoteScore), so
   its own words ("hosting", "networking", "location") never rank it for
   "web hosting", "network security", or "What is your location?". */
const EVENT_TITLE = "Event Planning & Hosting";
const STRONG_EVENT_NOUN = String.raw`(?:galas?|fundraisers?|fundraising (?:events?|dinners?|nights?|galas?|banquets?|breakfasts?|luncheons?|lunch(?:es)?)|banquets?|benefit (?:dinners?|concerts?|nights?|events?|galas?|auctions?)|awareness (?:nights?|events?|evenings?|days?|walks?)|conferences?|charity (?:dinners?|events?|galas?|balls?|auctions?|luncheons?|lunch(?:es)?)|luncheons?|receptions?)`;
const EVENT_SIGNAL = new RegExp(
  [
    String.raw`\b${STRONG_EVENT_NOUN}\b`,
    /* "event planning", "event planners", "event management". */
    String.raw`\bevents? (?:planning|planners?|management|managers?|hosting|coordinat\w*|organi[sz]\w*)\b`,
    /* An event with a determiner: "our event", "an event in Nashville". */
    String.raw`\b(?:our|the|an|a|my|this|that|their|your|next|upcoming)\s+(?:[\w'-]+\s+){0,2}?events?\b`,
    /* Events as the work: "Do you do events?", "plan pro-Israel events". */
    String.raw`\b(?:do|does|doing|plan|plans|planning|host|hosts|hosting|run|runs|running|organi[sz]e|organi[sz]es|organi[sz]ing|manage|manages|managing|coordinate|coordinates|coordinating|put on|putting on|throw|throwing|hold|holding|help with|help us with|helping with)\s+(?:[\w'-]+\s+){0,2}?events?\b`,
    /* Events, then the work: "key events this year we need help hosting". */
    String.raw`\bevents?\b[^.?!]{0,40}\b(?:hosting|planning|organi[sz]ing|managing|running|coordinating)\b`,
    /* A place or a room: "scout a location", "find a venue", "a venue for our dinner", "fill the room". */
    String.raw`\b(?:scout|scouts|scouting|find|finding|book|booking|pick|picking|choose|choosing|secure|securing)\s+(?:a|an|the|our)\s+(?:location|venue)s?\b|\bvenues?\s+for\s+(?:our|the|an?|my|this|their)\b|\b(?:location|venue) scouting\b|\bfill(?:ing)? (?:a|the|our|any|every|that) room\b|\binvite lists?\b|\bguest lists?\b`,
  ].join("|"),
  "i",
);
/* "event" in the software sense, and the idiom: one short list. */
const SOFTWARE_EVENT = new RegExp(
  String.raw`\bin the event (?:that|of)\b|\bevent driven\b` +
    String.raw`|\b(?:track|tracks|tracking|log|logs|logging|send|sends|sending|trigger|triggers|triggering|fire|fires|firing|emit|emits|emitting)\s+(?:[\w'-]+\s+){0,2}?events?\b` +
    String.raw`|\b(?:analytics|webhooks?|ga4|mixpanel|posthog|segment|amplitude|stripe|calendar|conversion|error|click|custom)\s+events?\b` +
    String.raw`|\bevents?\s+(?:tracking|logging|logs?|data|streams?|streaming|handlers?|listeners?|bus|loops?|sourcing|schemas?|apis?|tables?|webhooks?|triggers?|properties)\b` +
    String.raw`|\bevents?\s+(?:to|in|into|from)\s+(?:ga4|google analytics|mixpanel|posthog|segment|amplitude)\b|\bconference calls?\b|\b(?:video|web) conferenc\w*`,
  "gi",
);
/* Someone else's event that the visitor only goes to, attends, speaks at,
   or exhibits at: "We're going to tech events", "I'm speaking at a
   conference". It applies only when the visitor asks Zealot for nothing and
   the event is not theirs, so "Can you help us get people to attend our
   event?" and "the conference we are hosting" keep the event. A planning
   verb in between keeps it too: "We're going to host an event". */
const PLANNING_VERB = String.raw`(?:host|hosts|hosting|plan|plans|planning|run|runs|running|throw|throwing|hold|holding|organi[sz]e|organi[sz]es|organi[sz]ing|manage|manages|managing|coordinate|coordinates|coordinating|put|putting|do|doing|have|having|help|helping)`;
const ATTENDING_ONLY = new RegExp(
  String.raw`\b(?:go|goes|going|went|attend|attends|attending|attended|speak|speaks|speaking|spoke|exhibit|exhibits|exhibiting)\s+(?:to\s+|at\s+)?(?:(?!(?:${PLANNING_VERB}|our|my|us)\b)[\w'-]+\s+){0,2}?(?:events?|conferences?)\b(?!\s+(?:that\s+|which\s+)?(?:we|i)\b)`,
  "gi",
);
const ASKS_ZEALOT = /\b(?:can|could|will|would|do|does) (?:you|zealot)\b|\bhelp (?:us|me)\b|\bzealot\b/i;
const withoutSoftwareEvents = (query: string) => {
  const text = query.replace(/[-\u2010\u2011]/g, " ").replace(SOFTWARE_EVENT, " ");
  return ASKS_ZEALOT.test(text) ? text : text.replace(ATTENDING_ONLY, " ");
};

export function isEventQuery(query: string): boolean {
  return EVENT_SIGNAL.test(withoutSoftwareEvents(query));
}

/* A video of or for an event is a video ask: "a video for our gala", "a
   video of our fundraiser". The event only names what the video is about. */
const VIDEO_OF_EVENT = new RegExp(
  String.raw`\bvideos?\s+(?:for|of|from|at|about)\s+(?:our|the|my|a|an|this|their|your)\s+(?:[\w'-]+\s+){0,2}?(?:${STRONG_EVENT_NOUN}|events?)\b`,
  "gi",
);

/* The event note ranks on whole event phrases found in the question, so a
   word inside one of its phrases ("location" in "location scouting",
   "fund" in "fundraisers") never ranks it. */
const phrasePattern = (phrase: string) => {
  const words = phrase.toLowerCase().split(/\s+/);
  const last = words.pop()!.replace(/s$/, "");
  return new RegExp(String.raw`\b${[...words, `${last}s?`].join(String.raw`\s+`)}\b`, "i");
};
function eventNoteScore(entry: KnowledgeEntry, query: string): number {
  const text = withoutSoftwareEvents(query);
  const topics = (entry.topics || []).filter((topic) => phrasePattern(topic).test(text)).length;
  const expertise = (entry.expertise_areas || []).filter((area) => phrasePattern(area).test(text)).length;
  return topics * 15 + expertise * 12;
}

/* A build asked for, as opposed to one the visitor already has: "need a
   website", "build a ticketing system", "an event registration site". "We
   already have a website" and "for our app launch" ask for no build. When a
   build is asked for, the build notes come first and the event or consulting
   note comes right after the top one, so a two-part ask keeps both halves. */
const HAVE_DELIVERABLE = new RegExp(
  String.raw`\b(?:already\s+)?(?:have|has|had|own|owns|use|uses|using)\s+(?:a|an|our|the|my|their)\s+(?:[\w'-]+\s+){0,2}?${SOFTWARE_DELIVERABLE.source.replace(/^\\b/, "").replace(/\\b$/, "")}\b`,
  "gi",
);
export function asksForBuild(query: string): boolean {
  const text = query.replace(/[-‐‑]/g, " ").replace(TRAILING_FOR_PHRASE, " ").replace(HAVE_DELIVERABLE, " ");
  return SOFTWARE_DELIVERABLE.test(text);
}

/* Advice with no build attached: "Can you advise our board on operations?",
   "We need a fractional COO.", "Do you do strategic planning?", "Do you help
   with partnerships?" The consulting note shares only "operations" or
   "planning" with such an ask, while other notes carry those words in their
   titles, so the ask needs this. */
const CONSULTING_TITLE = "Traditional Business Consulting";
const ADVICE_WORD = String.raw`(?:advis(?:e|es|ing|or|ors|ory)|advice|consult(?:s|ing|ant|ants|ation|ations)?|counsel)`;
const ADVICE_TOPIC = String.raw`(?:boards?|leadership|executives?|operations|strateg(?:y|ies|ic)|partnerships?|growth|organi[sz]ations?|business(?:es)?|nonprofits?|ministr(?:y|ies)|churche?s?|compan(?:y|ies)|founders?|ceos?)`;
const ADVICE_QUERY = new RegExp(
  String.raw`\b${ADVICE_WORD}\b[^.?!]{0,60}\b${ADVICE_TOPIC}\b` +
    String.raw`|\b${ADVICE_TOPIC}\b[^.?!]{0,40}\b${ADVICE_WORD}\b` +
    String.raw`|\bfractional (?:coo|cto|cfo|cmo|ceo|cro|executives?|leaders?|leadership|c suite)\b` +
    String.raw`|\bstrateg(?:ic|y) planning\b|\bplanning (?:our|the|a|your) (?:[\w'-]+ ){0,2}(?:strategy|roadmap|growth)\b` +
    String.raw`|\bpartnership (?:strategy|strategies|planning)\b|\bstrategic partnerships?\b|\bthink(?:ing)? through (?:our |the |a |any )?partnerships?\b|\bhelp(?:s|ing)? (?:us )?with (?:our |the |a |any )?partnerships?\b`,
  "i",
);

export function isAdviceQuery(query: string): boolean {
  return ADVICE_QUERY.test(query.replace(/[-‐‑]/g, " "));
}

const MARKETING_TITLE = "Marketing campaigns go to Apostle";
const MARKETING_BLURB =
  "Zealot does not run marketing campaigns such as ads, social media, or ongoing promotion. Those go to Apostle at apostle.company, a Zealot portfolio company. Zealot can still build the brand, website, app, and systems behind a campaign.";

const entries = [
  ...(knowledgeFile as { entries: KnowledgeEntry[] }).entries,
  ...(publishedFile as { entries: KnowledgeEntry[] }).entries,
  ...(founderFile as { entries: KnowledgeEntry[] }).entries,
];
const mappings = (synonymFile as { mappings: SynonymMapping[] }).mappings;

const synonymMap = new Map<string, string[]>();
for (const mapping of mappings) {
  synonymMap.set(mapping.term.toLowerCase(), mapping.synonyms.map((item) => item.toLowerCase()));
}

export function withReferralDomains(text: string): string {
  if (/apostle/i.test(text) && !/apostle\.company/i.test(text)) {
    return `${text} Apostle's site is apostle.company.`;
  }
  return text;
}

function scrubVisitorText(text: string): string {
  return text
    .replace(/\u2014/g, ". ")
    .replace(/\u2013/g, ". ")
    .replace(/\bROI\b/g, "results")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\.\s+\./g, ".")
    .trim();
}

// Names Zealot has no relationship with. Any knowledge sentence that names
// one is dropped before it reaches the model. Set UNAFFILIATED_NAMES to a
// comma-separated list; the public copy ships empty.
const UNAFFILIATED = (process.env.UNAFFILIATED_NAMES ?? "")
  .split(",")
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);

function stripUnaffiliated(text: string): string {
  if (UNAFFILIATED.length === 0) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => !UNAFFILIATED.some((name) => sentence.toLowerCase().includes(name)));
  if (kept.length === 0) return "Zealot has no information about that person.";
  return kept.join(" ");
}

/* Misspellings visitors type, fixed in the whole query before any scoring,
   so a misspelled question ranks exactly like the correct one for every
   entry. Brett typed "HIPPA". */
const SPELLING_FIXES: ReadonlyArray<readonly [RegExp, string]> = [[/\bhippa\b/gi, "HIPAA"]];

function fixSpelling(query: string): string {
  return SPELLING_FIXES.reduce((text, [pattern, fix]) => text.replace(pattern, fix), query);
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "who", "how",
  "which", "when", "does", "did", "has", "have", "been", "are", "was",
  "were", "you", "your", "about", "into", "over", "under", "than", "then",
  "them", "they", "their", "its", "not", "but", "can", "will", "just", "our",
  "any", "all", "out", "why", "also", "per", "via", "today", "kind", "work",
  "worked", "long", "part", "doing", "done", "tell", "please", "much", "many",
  "some", "more", "most", "very", "only", "such", "those", "these", "there",
  "here", "would", "could", "should", "one", "company",
]);

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9.+]+/)
    /* Keep inner dots (allisrael.chat) but drop sentence periods, so
       "identity." matches "identity". */
    .map((token) => token.trim().replace(/^\.+|\.+$/g, ""))
    .filter((token) => token.length >= 3 || token === "ai" || token === "ui" || token === "ux");
}

function queryTokens(query: string): string[] {
  return tokenize(query).filter((token) => !STOPWORDS.has(token));
}

function addPhrase(target: Set<string>, phrase: string): void {
  for (const part of tokenize(phrase)) target.add(part);
}

function expandTokens(tokens: string[], query: string): string[] {
  const expanded = new Set(tokens);
  const lower = query.toLowerCase();
  for (const [term, synonyms] of synonymMap) {
    const termHit = term.includes(" ") ? lower.includes(term) : tokens.includes(term);
    const synonymHit = synonyms.some((synonym) => (
      synonym.includes(" ") ? lower.includes(synonym) : tokens.includes(synonym)
    ));
    if (!termHit && !synonymHit) continue;
    addPhrase(expanded, term);
    for (const synonym of synonyms) addPhrase(expanded, synonym);
  }
  return [...expanded];
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function containsNeedle(haystack: string, needle: string): boolean {
  const lower = haystack.toLowerCase();
  if (needle.length <= 2) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`).test(lower);
  }
  return lower.includes(needle);
}

function fieldHit(values: string[], needles: string[]): number {
  let hits = 0;
  for (const value of values) {
    if (needles.some((needle) => containsNeedle(value, needle))) hits += 1;
  }
  return hits;
}

function phraseBoost(query: string, title: string, description: string): number {
  const tokens = queryTokens(query);
  const titleLower = title.toLowerCase();
  const blob = `${title}\n${description}`.toLowerCase();
  const titleWords = queryTokens(title);
  const overlap = titleWords.filter((token) => tokens.includes(token));
  let boost = 0;
  if (titleWords.length >= 2 && overlap.length === titleWords.length) boost += 300;
  else if (overlap.length >= 2) boost += 40 * overlap.length;
  for (const token of tokens) {
    if (
      token.length >= 6
      && token !== "zealot"
      && token !== "consulting"
      && titleLower.includes(token)
    ) boost += 220;
  }
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const left = tokens[index];
    const right = tokens[index + 1];
    if (!left || !right || left.length < 3 || right.length < 4) continue;
    const pattern = new RegExp(
      `(?:^|[^a-z0-9])${escapeRegExp(left)}[^a-z0-9]+${escapeRegExp(right)}(?:[^a-z0-9]|$)`,
      "i",
    );
    if (pattern.test(blob)) boost += 120;
  }
  return boost;
}

function isPricingQuery(query: string): boolean {
  return /\b(price|pricing|cost|costs|fee|fees|rate|rates|hourly|ballpark|budget|quote|expensive|afford|how much|\$)\b/i.test(query);
}

/* "Rebuild's fund", "Rebuild’s new fund", "rebuild funds". Not "rebuild
   fundraising", which is build work. */
function isRebuildQuery(query: string): boolean {
  return /rebuild israel|rebuild(?:['’]s)?\s+(?:new\s+|next\s+)?funds?\b|rebuildisrael|\bfund\s+v\b|land entitlement|should i invest|fund structure|minimum investment|raise size/i.test(query);
}

/* "Brand new" is not a brand request. */
function isBrandQuery(query: string): boolean {
  return /\b(re)?brand(s|ing|ed)?\b(?![\s-]+new\b)|\blogos?\b|visual identity|style guide/i.test(query);
}

const SOCIAL_CHANNEL = "(?:socials|social(?: media)?|instagram|facebook|tiktok|linkedin|youtube|x|twitter)";

/* Fundraising, capital, and giving campaigns are not marketing campaigns, so
   "run our capital campaign" is not an Apostle referral. */
const NOT_MARKETING_CAMPAIGN = "(?!(?:capital|fundrais\\w*|donor|donation|giving|stewardship|annual)\\b)";

/* An event Zealot might plan and host. Zealot plans and fills the event, and
   paid promotion of it (ads, social media campaigns) goes to Apostle, as
   Brett decided on Nov 20, 2026. */

/* Asking someone to do the marketing: run, manage, or grow a channel, or a
   campaign by name. These count even beside a build request, as in "a new
   logo and someone to run our Instagram". */
const CAMPAIGN_INTENT = new RegExp(
  [
    "marketing campaigns?",
    "ad campaigns?",
    "paid media",
    "media buying",
    "ongoing promotion",
    `\\brun(?:ning)?\\s+(?:our\\s+|the\\s+|my\\s+)?${NOT_MARKETING_CAMPAIGN}(?:\\w+\\s+)?(?:ads|campaigns?)\\b`,
    `\\b(?:run(?:ning)?|manag(?:e|ing)|handl(?:e|ing)|post(?:ing)?\\s+(?:on|to))\\s+(?:our|my|the)\\s+${SOCIAL_CHANNEL}\\b`,
    `\\bgrow(?:ing)?\\s+(?:us\\s+|our\\s+\\w+\\s+)?(?:on|across)\\s+${SOCIAL_CHANNEL}\\b`,
    // Direct object: "grow our Instagram", "grow our social media following".
    `\\bgrow(?:ing)?\\s+(?:our|my|the)\\s+${SOCIAL_CHANNEL}\\b`,
    // Promoting an event: "advertise our gala", "get the word out about our
    // event", "marketing for our fundraiser", "social media for our gala".
    `\\b(?:promot|advertis|publici[sz]|market)(?:e|es|ed|ing)?\\s+(?:our|the|my|this|their|your|an?)\\s+(?:[\\w'’-]+\\s+){0,2}${EVENT_NOUN}\\b`,
    `\\bget(?:ting)? the word out (?:about|for|on) (?:our|the|my|this|their|your|an?)\\s+(?:[\\w'’-]+\\s+){0,2}${EVENT_NOUN}\\b`,
    `\\b(?:marketing|ads?|promotion|publicity|social media)\\s+(?:for|about|around|of)\\s+(?:our|the|my|this|their|your|an?)\\s+(?:[\\w'’-]+\\s+){0,2}${EVENT_NOUN}\\b`,
  ].join("|"),
  "gi",
);

/* Marketing words that are campaign work on their own ("we need social media
   management") but can also just name what a build is about. */
const CAMPAIGN_TOPIC =
  /advertising|\b(?:paid|google|facebook|meta|instagram|digital|online) ads\b|social media (?:management|manager|marketing|posts|posting|strategy|campaigns?)/gi;

/* Words that join phrases rather than describe a noun. Neither subject rule
   reaches across them. */
const JOINER = "(?:for|to|of|with|in|on|at|by|that|which|and|or|plus|also)\\b";

/* A topic directly followed by a product or an organization, with at most
   one describing word between, names the subject: "a social media
   management app", "my advertising agency", "a Facebook ads dashboard". A
   joining word ends it, so "social media management for businesses" is
   still campaign work. */
const SUBJECT_NOUN = new RegExp(
  `^[\\s-]+(?:(?!${JOINER})[a-z]+\\s+)?(?:apps?|applications?|platforms?|tools?|software|saas|dashboards?|portals?|websites?|sites?|plugins?|crm|agenc(?:y|ies)|compan(?:y|ies)|firms?|business(?:es)?|startups?|studios?|shops?|clients?|customers?)\\b`,
  "i",
);

/* A product named first and joined by for, that, to, or which, within about
   four words, also makes the campaign words its subject: "an app for social
   media management", "a tool for managing our Facebook ads", "a platform
   that schedules social media posts". The words between can't include a
   coordinating word, so "a website for our church and social media
   management" still wants both, as does "a new website and social media
   management". A person is not a product: "someone to run our Instagram"
   still counts. */
const PRODUCT_BEFORE =
  /\b(?:apps?|applications?|platforms?|tools?|software|saas|dashboards?|portals?|plugins?|crm|bots?|systems?|websites?|sites?|landing pages?)\s+(?:for|that|to|which)\b(?:\s+(?!(?:and|or|plus|also|but)\b)[\w'’-]+){0,3}\s*$/i;

/* Intent to have a campaign run, not any mention of marketing. "A marketing
   website", "marketing automation", "a capital campaign page", "a website for
   my advertising agency", and "a social media management app" are build work
   and stay with Zealot. Campaign words that stand on their own still count
   beside a build request: "a new website and social media management" wants
   both. */
function isMarketingQuery(query: string): boolean {
  const introducedByProduct = (index: number) => PRODUCT_BEFORE.test(query.slice(0, index));
  for (const match of query.matchAll(CAMPAIGN_INTENT)) {
    if (!introducedByProduct(match.index ?? 0)) return true;
  }
  for (const match of query.matchAll(CAMPAIGN_TOPIC)) {
    const index = match.index ?? 0;
    const after = query.slice(index + match[0].length);
    if (!SUBJECT_NOUN.test(after) && !introducedByProduct(index)) return true;
  }
  return false;
}

/* The Avonel Health entry names regulated work and phrases such as "zero
   data retention" and "trust center", which matched questions about
   Zealot's own practices. It is returned only when the question is about
   Avonel, Nell, health, or the kind of work Zealot does for them. */
const AVONEL_TITLE = "Avonel Health";
const AVONEL_QUERY =
  /avonel|\bnell\b|telehealth|health|medical|hipaa|hippa|ivermectin|pharmac|customer support|support agents?|\bevals?\b/i;

export function asksAboutAvonelTopics(query: string): boolean {
  return AVONEL_QUERY.test(query);
}

function mentionsApostle(entry: KnowledgeEntry): boolean {
  return /\bapostle\b/i.test(entry.title) || /\bapostle\b/i.test(entry.description);
}

// "What Zealot Builds" is the canonical answer to what Zealot does. Without
// this, a query like "Zealot services" ranks every note titled "... Services"
// (music, AI integration, real estate) above it, and the reply undersells the
// web and app work the site leads with.
const OVERVIEW_TITLE = "What Zealot Builds";

/* One subject group and one verb set, so "What can your company build?"
   matches exactly like "What can Zealot build?". */
const OVERVIEW_SUBJECT = String.raw`(?:zealot|you|your team|(?:the|your|this) (?:company|team|firm|business))`;
const OVERVIEW_PATTERN = new RegExp(
  String.raw`\b(?:services?|offerings?|capabilit(?:y|ies)` +
    String.raw`|what (?:do(?:es)?|can) ${OVERVIEW_SUBJECT} (?:do|build|make|offer)` +
    String.raw`|what ${OVERVIEW_SUBJECT} (?:do|does|builds?|makes?|offers?)` +
    String.raw`|what (?:kinds?|types?|sorts?) of (?:work|projects?|company|firm|business)` +
    String.raw`|who (?:runs|leads|owns|founded|started) ${OVERVIEW_SUBJECT}` +
    String.raw`|(?:about|tell me about) (?:the|your) (?:company|firm))\b`,
  "i",
);

function isOverviewQuery(query: string): boolean {
  return OVERVIEW_PATTERN.test(query);
}

/* A question about Brett himself goes to his own note first: who he is,
   where he studied, what he built before Zealot. Before this note, "Is Brett
   a Christian?" ranked a client's Jewish-Christian relations work first, and
   "Does Brett have a family?" ranked the family office note.

   Most visitors are founders, owners, and principals themselves, and many
   name other companies, so a question counts only when it is plainly about
   Zealot's founder:
   - it names Brett (not "I'm Brett", "my co-founder Brett", or another
     public Brett) or Mr. Henry;
   - it says "your" or "Zealot's" founder, owner, CEO, or principal, used as
     a person ("your principal services" and "your CEO dashboard" are not);
   - it asks for the founder, owner, or CEO of Zealot or of "your company";
   - or it is the whole question "who is the founder?" or "who runs the
     company?" ("Who is the founder of Triumph Roofing?", "I'm the pastor who
     leads the team at our church", and "Who owns the company website after
     you build it?" are not). */
const FOUNDER_TITLE = "Brett Henry, Founder and Principal";
const BRETT_NAME = /\bbrett\b|\bmr\.? henry\b/i;
const NOT_OUR_BRETT = new RegExp(
  String.raw`\b(?:i'?m|i am|this is)\s+brett\b` +
    String.raw`|\b(?:my|our)\s+(?:[\w-]+\s+){0,2}brett\b` +
    String.raw`|\bbrett\s+(?:favre|kavanaugh|michaels|hull)\b`,
  "i",
);
/* "your principal services", "your CEO dashboard", "your founder's story page": a title used as an adjective. */
const AS_PERSON = String.raw`(?!\s+(?:services?|engineers?|developers?|portals?|dashboards?|products?|plans?|pages?|accounts?|tools?)\b|'s\s+(?:story|page|site|website|profile|photo)\b)`;
const FOUNDER_QUERY = new RegExp(
  String.raw`\b(?:your|zealot'?s|zealot) (?:founder|principal|owner|ceo)\b${AS_PERSON}` +
    String.raw`|\b(?:founder|owner|ceo|principal|head) of (?:zealot|your (?:company|firm|team))\b(?!['’]s)` +
    String.raw`|^\s*(?:and\s+)?who(?:'s| is)? (?:the )?(?:founder|owner|ceo|principal|person behind the company)\s*[?.!]*\s*$` +
    String.raw`|^\s*(?:tell me about|what about) the founder\s*[?.!]*\s*$` +
    String.raw`|\bwho(?:'s| is)? (?:the person )?behind zealot\b(?!['’]s)|\bwho is in charge (?:of|at) zealot\b(?!['’]s)` +
    String.raw`|\bwho (?:runs|leads|owns|founded|created|started) zealot\b(?!['’]s)|\bwhen was zealot founded and by whom\b` +
    String.raw`|^\s*who (?:runs|leads|owns|founded|created|started) (?:it|this|(?:the|your|this) (?:company|firm|team|business))\s*[?.!]*\s*$`,
  "i",
);

function namesOurBrett(query: string): boolean {
  return BRETT_NAME.test(query) && !NOT_OUR_BRETT.test(query);
}

export function isFounderQuery(query: string): boolean {
  return namesOurBrett(query) || FOUNDER_QUERY.test(query);
}

/* Brett's faith, his politics, and his view of Israel. They are not knowledge
   entries, so no search can return one: whether a sentence asks about his own
   belief or about a client, a market, or how he works is the advisor's call,
   and a word match here leaked on "Is Brett conservative when it comes to
   estimates?" and missed "What are Brett Henry's religious beliefs?".

   The founder_view tool has the advisor say what the question is about, and
   returns his note only when it is about what he himself believes. In the
   first eval run the advisor still called a tool that took only the subject
   for "What are Brett's views on Israel real estate?" and "Is Brett
   conservative when it comes to estimates?". */
export const FOUNDER_VIEW_SUBJECTS = ["faith", "politics", "israel"] as const;
export type FounderViewSubject = (typeof FOUNDER_VIEW_SUBJECTS)[number];
export const FOUNDER_QUESTION_KINDS = ["his_belief", "personal_detail", "something_else"] as const;
export type FounderQuestionKind = (typeof FOUNDER_QUESTION_KINDS)[number];
const founderViews = (founderFile as { views: { subject: string; title: string; description: string }[] }).views;

/** Brett's own words on the subject, only when the question is about what he himself believes. */
export function founderView(subject: FounderViewSubject, kind: FounderQuestionKind): { title: string; description: string } | { note: string } {
  if (kind === "personal_detail") {
    return { note: "Brett's notes do not give that. Say you do not have it and name the contact form." };
  }
  if (kind === "something_else") {
    return { note: "That is not about what Brett himself believes. Answer the question from search_knowledge, and do not mention his faith, politics, or view of Israel." };
  }
  const view = founderViews.find((entry) => entry.subject === subject);
  if (!view) throw new Error(`No founder view for ${subject}.`);
  return { title: visitorTitle(view.title), description: visitorDescription({ ...view, topics: [], expertise_areas: [], display_priority: 0 }) };
}

/* When nothing in the query matches any entry, the advisor still gets the
   notes a new visitor should hear about, chosen on purpose rather than by
   display priority: what Zealot builds first, since the advisor leads with
   websites and applications, then the overview. */
const NO_MATCH_TITLES = [OVERVIEW_TITLE, "Zealot Overview"] as const;

export interface KnowledgeHit {
  title: string;
  description: string;
  score: number;
}

/* Rule 8 forbids compliance claims, and in a recorded eval run the advisor
   reused a note's HIPAA and SOC 2 wording on compliance questions even with
   the rule in its prompt. So that wording is cut before the advisor reads a
   note, the way fees and fund terms are. A sentence keeps the part before
   the wording ("It takes extensive evals and security work.") or is
   dropped. The website copy is unchanged. */
/* Lead-ins whose head can stand alone once the wording is cut:
   "It takes extensive evals and security work [to meet HIPAA ...]". Any
   other lead-in drops the whole sentence rather than leave it dangling. */
const LEAD_IN = /(?:,? (?:built|designed|made) (?:to|for)| to (?:meet|satisfy)| under| with| including)(?: the)?$/i;
/* Only abbreviations that never end a sentence: a real sentence ending in
   "etc." or "Inc." must not be glued to the next one. */
const ABBREVIATION = /\b(?:dr|mr|mrs|ms|prof|vs|e\.g|i\.e)\.$/i;
/* A head that cannot stand alone once the wording is cut. */
const DANGLING = /(?:\b(?:and|or|but|nor|in line|in keeping|in accordance|aligned|consistent|according|conformant)|[,&])$/i;
const NEGATION = /\b(?:not|no|never|without|nor)\b|n't\b/i;

function lineSentences(line: string): string[] {
  const out: string[] = [];
  let held = "";
  for (const part of line.split(/(?<=[.!?]) /)) {
    held = held ? `${held} ${part}` : part;
    if (!ABBREVIATION.test(held)) {
      out.push(held);
      held = "";
    }
  }
  if (held) out.push(held);
  return out.filter((sentence) => sentence.trim());
}

/* "Compliance and security expertise." keeps "Security expertise.": only
   a short list of areas ending in "expertise" is rewritten. */
const EXPERTISE_LIST = /^([\w-]+(?:(?:,|,? and|,? &| and| &) [\w-]+)*) expertise\.?$/i;

function withoutComplianceArea(sentence: string): string {
  const list = EXPERTISE_LIST.exec(sentence.trim());
  if (!list) return sentence;
  const areas = list[1].split(/\s*(?:,\s*(?:and|&)?|\band\b|&)\s*/i).map((area) => area.trim()).filter(Boolean);
  const kept = areas.filter((area) => !/^(?:compliance|certifications?)$/i.test(area));
  if (kept.length === areas.length) return sentence;
  if (kept.length === 0) return "";
  const joined = kept.length === 1 ? kept[0] : kept.length === 2 ? `${kept[0]} and ${kept[1]}` : `${kept.slice(0, -1).join(", ")}, and ${kept[kept.length - 1]}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1).toLowerCase()} expertise.`;
}

function scrubSentence(sentence: string): string | null {
  const rewritten = withoutComplianceArea(sentence);
  if (!rewritten) return null;
  const at = firstComplianceWording(rewritten);
  if (at < 0) return rewritten;
  const before = rewritten.slice(0, at).trimEnd();
  /* A negation before the wording would reverse the meaning once cut. */
  if (NEGATION.test(before)) return null;
  const lead = LEAD_IN.exec(before);
  if (!lead) return null;
  const head = rewritten.slice(0, lead.index).replace(/[\s;:]+$/, "");
  const balanced = (head.match(/\(/g) ?? []).length === (head.match(/\)/g) ?? []).length;
  if (head.split(" ").length < 4 || !balanced || DANGLING.test(head)) return null;
  return `${head}.`;
}

/**
 * Rule 8 forbids compliance claims, and in a recorded eval run the advisor
 * reused a note's HIPAA and SOC 2 wording on compliance questions even with
 * the rule in its prompt. So that wording is cut before the advisor reads a
 * note, the way fees and fund terms are. A sentence keeps the part before
 * the wording when a listed lead-in introduces it, and is dropped
 * otherwise. Line breaks are kept. The website copy is unchanged.
 */
export function withoutComplianceWording(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " "))
    .flatMap((line) => {
      if (!line.trim()) return [line];
      const kept = lineSentences(line).map(scrubSentence).filter((sentence): sentence is string => sentence !== null);
      return kept.length > 0 ? [kept.join(" ")] : [];
    })
    .join("\n")
    .trim();
}

/** A note title with any compliance wording removed. */
function visitorTitle(title: string): string {
  if (firstComplianceWording(title) < 0) return scrubVisitorText(title);
  let rest = title;
  for (const pattern of [TIED_CLAIM, STANDARD, BAA]) rest = rest.replace(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`), " ");
  return scrubVisitorText(rest.replace(/^[\s,:-]+|[\s,:-]+$/g, "").replace(/\s{2,}/g, " ")) || "Note";
}

function visitorDescription(entry: KnowledgeEntry): string {
  let text = entry.description;
  if (entry.title === PRICING_TITLE) text = PRICING_PUBLIC;
  else if (entry.title === REBUILD_TITLE) text = REBUILD_PUBLIC;
  else if (SENSITIVE_FACT.test(text)) {
    const kept = text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence && !SENSITIVE_FACT.test(sentence));
    text = kept.join(" ") || "Zealot can speak about this only in general terms.";
  }
  return withReferralDomains(scrubVisitorText(stripUnaffiliated(withoutComplianceWording(text))));
}

export function visitorFacingKnowledge(): KnowledgeHit[] {
  const rows = entries
    .filter((entry) => !BEHAVIORAL_TITLES.has(entry.title))
    .map((entry) => ({
      title: visitorTitle(entry.title),
      description: visitorDescription(entry),
      score: 0,
    }));
  rows.push(
    {
      title: BRAND_TITLE,
      description: scrubVisitorText(BRAND_BLURB),
      score: 0,
    },
    {
      title: MARKETING_TITLE,
      description: withReferralDomains(scrubVisitorText(MARKETING_BLURB)),
      score: 0,
    },
  );
  return rows;
}

/* Score decides the order. Only among notes with exactly the same score
   does the one whose description matches more of the query's words go
   first, so a note that scores higher is never overtaken: for "Who founded
   Zealot? Brett Henry founder." Zealot Overview (founded, brett, henry,
   founder) and Blockchain (brett, henry) tie, and Zealot Overview goes
   first. Otherwise the knowledge file's order stands, since the sort is
   stable. */
export function byScoreThenWords(
  a: { score: number; wordsMatched: number },
  b: { score: number; wordsMatched: number },
): number {
  return b.score - a.score || b.wordsMatched - a.wordsMatched;
}

export function searchKnowledge(query: string): KnowledgeHit[] {
  const trimmed = fixSpelling(query.trim());
  if (!trimmed) return [];

  const pricingQuery = isPricingQuery(trimmed);
  const rebuild = isRebuildQuery(trimmed);
  const campaign = isMarketingQuery(trimmed);
  const video = isVideoQuery(trimmed);
  const asksForApostle = /\bapostle\b/i.test(trimmed);
  /* "Brand new" means new. Score without it so "a brand new website"
     ranks website notes, not brand notes. */
  const scored = trimmed.replace(/\bbrand[\s-]+new\b/gi, "new");
  const tokens = queryTokens(scored);
  const needles = expandTokens(tokens, scored)
    .filter((needle) => needle !== "zealot")
    /* "video visits" or "video calls" is not a video to produce, so the word
       must not rank the Cardboard Spaceship note, the one entry that says
       "video production". */
    .filter((needle) => video || !/^videos?$/.test(needle));
  const ranked = entries
    .filter((entry) => !BEHAVIORAL_TITLES.has(entry.title))
    .filter((entry) => pricingQuery || entry.title !== PRICING_TITLE)
    .filter((entry) => rebuild || entry.title !== REBUILD_TITLE)
    .filter((entry) => !(rebuild && mentionsApostle(entry)))
    /* Apostle runs marketing campaigns, so it surfaces only for campaign
       intent or when the visitor asks about Apostle by name. Its metadata
       shares words with build and brand work, which otherwise ranked it into
       answers about websites, apps, and brand identity. */
    .filter((entry) => campaign || video || asksForApostle || !mentionsApostle(entry))
    .filter((entry) => entry.title !== AVONEL_TITLE || asksAboutAvonelTopics(trimmed))
    /* Brett's note names coffee, Israel, and a DAO, so it would rank into
       answers about those. It comes in only through a founder question. */
    .filter((entry) => entry.title !== FOUNDER_TITLE)
    .map((entry) => {
      const title = visitorTitle(entry.title);
      const description = visitorDescription(entry);
      const priority = entry.display_priority || 0;
      if (entry.title === EVENT_TITLE) {
        /* In a video ask, the event only names what the video is about. */
        const eventText = video ? scored.replace(TRAILING_FOR_PHRASE, " ").replace(VIDEO_OF_EVENT, " ") : scored;
        const eventScore = eventNoteScore(entry, eventText);
        return { title, description, score: eventScore + priority * 0.05, matched: eventScore > 0, wordsMatched: 0 };
      }
      let score = 0;
      score += fieldHit(entry.topics || [], needles) * 15;
      score += fieldHit(entry.expertise_areas || [], needles) * 12;
      score += fieldHit(entry.related_projects || [], needles) * 10;
      score += fieldHit([title], needles) * 10;
      score += fieldHit([description], needles) * 4;
      score += phraseBoost(scored, title, description);
      const wordsMatched = needles.filter((needle) => containsNeedle(description, needle)).length;
      /* An entry must match the query to be returned. Display priority
         only orders entries that matched: alone, it put the
         highest-priority entry, Blockchain & Web3 Consulting, into results
         for questions that never touched it ("Tell me about Cardboard
         Spaceship.", "Is Zealot HIPAA compliant?"). */
      const matched = score > 0;
      score += priority * 0.05;
      return { title, description, score, matched, wordsMatched };
    })
    .filter((entry) => entry.matched)
    .sort(byScoreThenWords)
    .slice(0, 4)
    .map(({ title, description, score }) => ({ title, description, score }));

  const forced: KnowledgeHit[] = [];
  const pricing = entries.find((entry) => entry.title === PRICING_TITLE);
  const fund = entries.find((entry) => entry.title === REBUILD_TITLE);
  if (pricingQuery) {
    forced.push({
      title: PRICING_TITLE,
      description: pricing ? visitorDescription(pricing) : PRICING_PUBLIC,
      score: 1000,
    });
  }
  if (rebuild) {
    forced.push({
      title: REBUILD_TITLE,
      description: fund ? visitorDescription(fund) : REBUILD_PUBLIC,
      score: 1000,
    });
  }
  if (isBrandQuery(trimmed) && !rebuild) {
    forced.push({
      title: BRAND_TITLE,
      description: scrubVisitorText(BRAND_BLURB),
      score: 1000,
    });
  }
  if (isMarketingQuery(trimmed) && !rebuild) {
    forced.push({
      title: MARKETING_TITLE,
      description: withReferralDomains(scrubVisitorText(MARKETING_BLURB)),
      score: 1000,
    });
  }
  if (video && !rebuild) {
    forced.push({
      title: VIDEO_TITLE,
      description: scrubVisitorText(VIDEO_BLURB),
      score: 1000,
    });
  }
  /* The event and consulting notes go first, unless a build is also asked
     for: then they go right after the top build note. */
  const buildAsk = asksForBuild(trimmed);
  const afterTop: KnowledgeHit[] = [];
  const place = (hit: KnowledgeHit) => (buildAsk ? afterTop : forced).push(hit);
  const eventNote = entries.find((entry) => entry.title === EVENT_TITLE);
  /* "a video for our gala" is a video ask: the event only names what the
     video is for, so video routing answers it alone. */
  const eventAsk = isEventQuery(trimmed)
    && !(video && !isEventQuery(trimmed.replace(TRAILING_FOR_PHRASE, " ").replace(VIDEO_OF_EVENT, " ")));
  if (eventNote && eventAsk) {
    place({
      title: visitorTitle(eventNote.title),
      description: visitorDescription(eventNote),
      score: 1000,
    });
  }
  const consulting = entries.find((entry) => entry.title === CONSULTING_TITLE);
  if (consulting && isAdviceQuery(trimmed)) {
    place({
      title: visitorTitle(consulting.title),
      description: visitorDescription(consulting),
      score: 1000,
    });
  }
  const overview = entries.find((entry) => entry.title === OVERVIEW_TITLE);
  if (overview && isOverviewQuery(trimmed)) {
    forced.push({
      title: OVERVIEW_TITLE,
      description: visitorDescription(overview),
      score: 1000,
    });
  }

  /* A question about Brett puts his note ahead of everything else forced,
     What Zealot Builds included. */
  const founder = entries.find((entry) => entry.title === FOUNDER_TITLE);
  if (founder && isFounderQuery(trimmed)) {
    forced.unshift({
      title: visitorTitle(founder.title),
      description: visitorDescription(founder),
      score: 1000,
    });
  }

  const seen = new Set<string>();
  const merged: KnowledgeHit[] = [];
  for (const hit of [...forced, ...ranked.slice(0, 1), ...afterTop, ...ranked.slice(1)]) {
    if (seen.has(hit.title)) continue;
    seen.add(hit.title);
    merged.push(hit);
  }
  if (merged.length > 0) return merged;
  return NO_MATCH_TITLES.flatMap((noMatchTitle) => {
    const entry = entries.find((candidate) => candidate.title === noMatchTitle);
    return entry ? [{ title: visitorTitle(entry.title), description: visitorDescription(entry), score: 0 }] : [];
  });
}
