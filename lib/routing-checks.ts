/* Reply checks for the routing evals. These are pattern backstops, not a
   parser: they read English with regular expressions and will never be
   complete. A wrong verdict fails or passes one eval check for a human to
   read in the run. It never changes what the advisor says, since nothing
   at runtime imports this file. The free tests in
   scripts/knowledge-search.test.ts pin each case below.

   A negation counts only for the verb it governs, inside its own clause.
   "Zealot does not produce video" declines video. "We can't wait to shoot
   your video" and "Zealot will make the video, it won't take long" do not,
   and "We don't make videos, but we build websites" declines only the
   video.

   Known limits, not chased:
   - The subject must be "Zealot" or "we". "Our team can shoot it" and
     "Video is not something we do" are not read.
   - A pronoun object is not read: "we can shoot it" names no video.
   - The verb must be within 40 characters of its subject and the object
     within 30 characters of the verb.
   - A comma splits a clause only before a new subject or a contrast word,
     so two clauses joined by a bare comma without a subject stay one.
   - A negation governs a verb only through the listed adverbs,
     auxiliaries, and raisers ("want to", "plan to", "set up to").
   - "all of the video" is a claim, while "for the video launch" is not: a
     preposition blocks only when it heads the object's own phrase.
   - Idioms other than "make sure" are taken literally.
   - A word that is both a verb and a noun or adjective ("record", "film")
     can take the object from the verb before it.
   - asksVisitorSize reads "How big are you" only on its own or with "as
     a company", so a continuation with no organization word ("How big are
     you in staff terms?") is missed. One that names small business or
     enterprise, headcount, or employees is still caught by those forms. */
const SENTENCE = /(?<=[.!?])\s+/;
/* Semicolons, colons, and contrast words end a clause. A comma ends one
   only before a new subject, so "Zealot will make the video, it won't take
   long" splits while "We design, shoot, and edit video" and "We make
   short, punchy videos" stay whole. Plain "and" does not split, so "We
   will build the site and make the video" stays one claim. */
const CLAUSE =
  /(?<=[.!?])\s+|\s*[;:]\s+|,\s+(?=(?:(?:and|but|so|or|then|yet)\s+)?(?:zealot|we|apostle|cardboard|they|it|you|i|he|she|this|that|these|there|our|your|their)\b)|,?\s+(?:but|while|whereas|although|though|however|yet)\b,?\s*/i;

const SUBJECT = /\b(?:zealot|we)\b/gi;
/* Between the subject and the verb, another actor takes the verb: "We
   recommend Apostle to shoot the commercial", "We'll have them shoot it",
   "We'll have another team shoot the video". */
const ACTOR_BEFORE_VERB = /\b(?:apostle|cardboard|spaceship|they|them|another|partners?|someone)\b/i;
/* Between the verb and the object, "them" is a dative and "another" a
   determiner: "We'll shoot them a video", "Zealot can make another video"
   are claims. A named company there is still a referral. */
const ACTOR_BEFORE_OBJECT = /\b(?:apostle|cardboard|spaceship|they|partners?|someone)\b/i;
const NEGATOR = String.raw`(?:not|never|cannot|no longer|[a-z]+n['\u2019]t)`;
const HAS_NEGATOR = new RegExp(String.raw`\b${NEGATOR}\b`, "i");
/* A preposition blocks only when it heads the object's own phrase: "the
   brand work for the video launch" is not a video claim, while "we do
   on-site video" is. */
const PREPOSITION_HEAD = /\b(?:for|to|with|about|around|behind|into|on|than)\s+(?:(?:the|a|an|our|your|their|its|this|that|these|those|my)\s+)?(?:[\w'-]+\s+){0,2}$/i;
/* A verb between this verb and the object takes the object, and a referral
   verb never makes a claim: "We can handle the website and refer the video
   to Apostle". A later listed verb gets its own hit, so "We can handle the
   website and make the video" is still a claim. */
const REFERRAL_VERB = String.raw`refers?|referr(?:ed|ing)|sends?|sending|routes?|routing|pass(?:es|ing)?|recommends?|recommending|connects?|connecting|forwards?|forwarding|introduces?|introducing|steers?|steering|(?:points?|pointing|hands?|handing|directs?|directing)(?=\s+(?:the|it|this|that|you|them|those|your|off)\b)`;
const ADVERB = String.raw`(?:currently|really|actually|ever|typically|usually|directly|personally|ourselves|itself|also|yet|always|generally|normally|in house)`;
const AUX = String.raw`(?:(?:be|been|being)\s+)?`;
/* "doesn't want to produce", "are not going to be making", "don't plan to
   offer", "isn't set up to produce", "is not the right fit to shoot". */
const RAISER = String.raw`(?:(?:going|wants?|plans?|planning|intends?|intending|looking|able|set up|equipped|positioned|built|staffed|structured|designed|the right (?:fit|team|firm|partner))\s+to\s+${AUX})?`;

type VerbHit = { governed: boolean };

/* Each place in the clause where Zealot or "we" is the subject of one of
   the verbs and one of the objects follows within a few words, with
   whether a negation governs that verb. */
function verbHits(clause: string, verbs: string, objects: string): VerbHit[] {
  const verb = new RegExp(String.raw`\b(?:${verbs})\b`, "gi");
  const object = new RegExp(String.raw`^([^.?!]{0,30}?)\b(?:${objects})\b`, "i");
  /* "doesn't produce or shoot video" and "don't design, shoot, or edit
     video": the negation covers the series. An item is a listed verb with
     its object or one other word. */
  const series = String.raw`(?:(?:(?:${verbs})(?:\s+[\w']+){0,3}?|[a-z]+)(?:,\s+(?:(?:or|and|nor)\s+)?|\s+(?:or|and|nor)\s+))*`;
  const governed = new RegExp(String.raw`\b${NEGATOR}\s+(?:${ADVERB}\s+){0,2}${AUX}${RAISER}(?:${ADVERB}\s+)?${series}$`, "i");
  const closerVerb = new RegExp(String.raw`\b(?:${verbs}|${REFERRAL_VERB})\b`, "i");
  const hits: VerbHit[] = [];
  for (const match of clause.matchAll(verb)) {
    const start = match.index ?? 0;
    const before = clause.slice(0, start);
    const subject = [...before.matchAll(SUBJECT)].at(-1);
    if (!subject) continue;
    const between = before.slice((subject.index ?? 0) + subject[0].length);
    if (between.length > 40 || ACTOR_BEFORE_VERB.test(between)) continue;
    const after = clause.slice(start + match[0].length).match(object);
    if (!after || HAS_NEGATOR.test(after[1]) || PREPOSITION_HEAD.test(after[1]) || ACTOR_BEFORE_OBJECT.test(after[1]) || closerVerb.test(after[1])) continue;
    hits.push({ governed: governed.test(before) });
  }
  return hits;
}

const clauses = (reply: string) => reply.split(SENTENCE).flatMap((sentence) => sentence.split(CLAUSE));

/* The brand-plus-campaign check. A reply passes when some clause gives the
   brand to Zealot ("we" counts) without naming Apostle and without
   declining it. A clause, not a sentence: "Zealot can build the brand
   identity, and Apostle can run the launch campaign." is one correct
   sentence.

   Split only at clause boundaries. "then" splits only after a comma or a
   semicolon or as "and then", never as an adverb between subject and verb,
   so "Zealot would then build the brand identity" stays one clause. A
   determiner "no" is not a decline: "Zealot builds the brand, no agency
   needed" passes. */
const BRAND_CLAUSE = /(?<=[.!?])\s+|,\s+(?:and then|and|while|but|then)\s+|;\s+(?:then\s+)?|\s+and then\s+|\s+while\s+/i;
const ZEALOT = /\b(?:zealot|we)\b/i;
const BRAND = /\b(?:brand|identity|logo|guidelines)\b/i;
const APOSTLE = /\bapostle\b/i;
const BRAND_VERBS = String.raw`builds?|building|do|does|doing|handles?|handling|creates?|creating|designs?|designing|develops?|developing|makes?|making|take on|takes on|taking on|takes?|taking|offers?|offering|owns?|keeps?|covers?|provides?|works? on`;
const BRAND_OBJECTS = String.raw`brands?|branding|identity|identities|logos?|guidelines`;

export function brandStaysWithZealot(reply: string): boolean {
  return reply
    .split(BRAND_CLAUSE)
    .some((clause) => ZEALOT.test(clause) && BRAND.test(clause) && !APOSTLE.test(clause)
      && !verbHits(clause, BRAND_VERBS, BRAND_OBJECTS).some((hit) => hit.governed));
}

/* Video production is never Zealot's. True when a clause says Zealot or
   "we" produces, makes, shoots, films, or captures a video, commercial,
   footage, film, spot, or reel, and no negation governs that verb. */
const VIDEO_VERBS = String.raw`produces?|producing|do|does|doing|offers?|offering|makes?(?! sure)|making(?! sure)|shoots?|shooting|handles?|handling|films?|filming|creates?|creating|captures?|capturing|edits?|editing|records?|recording`;
const VIDEO_OBJECTS = String.raw`videos?|commercials?|footage|films?|spots?|reels?`;

export function zealotDoesVideo(reply: string): boolean {
  return clauses(reply).some((clause) => verbHits(clause, VIDEO_VERBS, VIDEO_OBJECTS).some((hit) => !hit.governed));
}

/* Websites and landing pages are Zealot's work. True when a clause says
   Zealot or "we" will not build one: the negation must govern a verb whose
   object is the web work, so "Zealot does not produce video, but we build
   websites." is fine. */
const WEB_VERBS = String.raw`builds?|building|do|does|doing|makes?|making|handles?|handling|offers?|offering|creates?|creating|designs?|designing|take on|takes on|take|takes`;
const WEB_OBJECTS = String.raw`websites?|landing pages?|web ?pages?|sites?`;

export function turnsAwayWebWork(reply: string): boolean {
  return clauses(reply).some((clause) => verbHits(clause, WEB_VERBS, WEB_OBJECTS).some((hit) => hit.governed));
}

/* Each video company the reply names comes with its address:
   apostle.company for Apostle, cardboard-spaceship.com for Cardboard
   Spaceship. */
export function namesWithAddresses(reply: string): boolean {
  const apostleOk = !/\bapostle\b/i.test(reply.replace(/apostle\.company/gi, "")) || /apostle\.company/i.test(reply);
  const cardboardOk = !/\bcardboard[- ]spaceship\b/i.test(reply.replace(/cardboard-spaceship\.com/gi, "")) || /cardboard-spaceship\.com/i.test(reply);
  return apostleOk && cardboardOk;
}

/* A question about the visitor's own size: "What size is your
   organization?", "Which best describes your organization?", "how large is
   the organization", "Are you a small business or an enterprise?". It must
   be about the organization (company, business, organization, team, staff,
   employees, headcount, revenue), so project questions such as "How many
   people will use the app?" or "What size should the hero image be?" pass.
   Naming both companies and which fits which answers size, so the rule
   says not to ask it. */
const ORG = String.raw`(?:organization|organisation|business|company|team|staff|firm|agency|clinic|practice)`;
const SIZE_QUESTION = new RegExp(
  [
    String.raw`\bhow (?:large|big) (?:is |are )?(?:your|the) ${ORG}\b`,
    /* "How big are you?" ends there; "How big are you thinking for the
       first version?" is about the project. */
    String.raw`\bhow (?:large|big) are (?:you|y'all)(?: as an? ${ORG})?\s*\?`,
    String.raw`\bwhat(?: is|['\u2019]s)? (?:the )?size (?:is |are )?(?:of )?(?:your|the) ${ORG}\b`,
    String.raw`\b(?:your|the) ${ORG}['\u2019]?s size\b`,
    String.raw`\bwhich (?:\w+ )?(?:best )?describes (?:your|the) ${ORG}\b`,
    String.raw`\bhow many (?:employees|staff|team members|people (?:work|are) (?:at|on|in|for) (?:your|the) ${ORG})\b`,
    String.raw`\bheadcount\b`,
    /* Revenue is the visitor's own: "your revenue", "the company's
       revenue". "The revenue model" or "your revenue target" is about the
       project. */
    String.raw`\b(?:your|the ${ORG}['\u2019]?s|your ${ORG}['\u2019]?s) (?:annual |yearly |current )?revenue\b(?! (?:model|target|goal|stream|streams|share|split|plan|forecast)\b)`,
    String.raw`\bsmall(?:er)?(?: or mid[- ]sized)? (?:business |company |organization )?or (?:an? )?(?:larger|enterprise|big)\b`,
    String.raw`\bare you (?:a |an )?(?:small|mid[- ]sized|enterprise|large)\b`,
  ].join("|"),
  "i",
);

export function asksVisitorSize(reply: string): boolean {
  return reply
    .split(/(?<=[.!?])\s+/)
    .some((sentence) => sentence.trim().endsWith("?") && SIZE_QUESTION.test(sentence));
}

/* Zealot works its network to fill the room, but it never promises a
   turnout (Brett, Nov 20, 2026). True when a statement promises one:
   - Zealot, "we", "I", or the network guarantees, promises, commits to, or
     ensures a crowd, a number, or "that";
   - Zealot or "we" delivers, gets you, brings in, draws, or packs a crowd or
     a number of people;
   - Zealot, "we", or the network will fill the room or the venue;
   - "count on a full house", "you can expect a full house", "Expect around
     300 guests", "300 is no problem", "300 people will show up", "we'll make
     sure the room is full", "a packed room is no problem", and Zealot's own
     forecast, "We expect around 300 guests".
   A question or an "if" clause states no promise, and a clause that
   disclaims one ("won't promise", "can't guarantee", "without promising",
   "guarantee nothing") is not read for one. So "It won't promise a specific
   turnout", "Do you expect around 300 guests?", and "We'll get you a venue
   shortlist within 2 weeks" pass, while "We can't guarantee a number, but
   we'll fill the room" fails on its second clause. "It works that network to
   fill the room" names an effort, not a result. */
const AUDIENCE = String.raw`(?:turnouts?|attendance|attendees|crowds?|headcounts?|seats|guests|people|rsvps|(?:a|the) (?:full|packed) (?:room|house))`;
const COUNT = String.raw`\d[\d,]*`;
const PEOPLE = String.raw`(?:${COUNT}\s+(?:people|guests|attendees|seats|rsvps)|${AUDIENCE})`;
const SUBJECT_PROMISE = String.raw`\b(?:we|zealot|i|our network|the network|its network|zealot['’]s network)(?:['’]ll|['’]d| will| would| can| could| are going to| is going to| do)?\s+(?:absolutely\s+|definitely\s+|certainly\s+|easily\s+)?`;
const TURNOUT_PROMISES = [
  new RegExp(String.raw`${SUBJECT_PROMISE}(?:guarantees?|promises?|commits? to|ensures?)\s+(?:you\s+)?(?:that|it|this)\b`, "i"),
  new RegExp(String.raw`${SUBJECT_PROMISE}(?:guarantees?|promises?|commits? to|ensures?)\s+(?:you\s+)?(?:[\w'-]+\s+){0,2}?(?:${PEOPLE}|${COUNT})`, "i"),
  new RegExp(String.raw`${SUBJECT_PROMISE}(?:delivers?|get you|gets you|bring in|brings in|bring you|brings you|draws?|pack|packs)\s+(?:[\w'-]+\s+){0,2}?${PEOPLE}`, "i"),
  new RegExp(String.raw`${SUBJECT_PROMISE}fill (?:the|your|any|every|that|this) (?:room|house|venue|hall)\b`, "i"),
  /\bfill (?:any|every) room\b/i,
  new RegExp(String.raw`\bcount on (?:a |an |the )?(?:${PEOPLE}|${COUNT})`, "i"),
  new RegExp(String.raw`(?:^|\byou (?:can|will|should|['’]ll) )expect (?:around |about |at least |over |up to |roughly |nearly |close to )?(?:${PEOPLE})`, "i"),
  new RegExp(String.raw`\b(?:${COUNT}(?:\s+(?:people|guests|attendees))?|(?:a|the) (?:full|packed) (?:room|house))(?: is|['’]s| will be| would be) (?:no problem|not a problem|easy|doable|a given|guaranteed|assured|certain|no issue)\b`, "i"),
  new RegExp(String.raw`\b${COUNT}\s+(?:people|guests|attendees)\s+(?:will|['’]ll|are going to)\s+(?:show up|come|attend|be there|turn out)\b`, "i"),
  /* Zealot's own forecast of people, not of time: "We expect around 300
     guests", "Zealot anticipates a full house", but not "We estimate 2
     weeks for venue scouting". */
  new RegExp(String.raw`\b(?:we|zealot|i)(?:['’]d| would| will| can)?\s+(?:expects?|anticipates?|projects?|predicts?|estimates?|forecasts?)\s+(?:around |about |at least |over |up to |roughly |nearly |close to )?(?:a |an |the )?${PEOPLE}`, "i"),
  new RegExp(String.raw`${SUBJECT_PROMISE}(?:make sure|ensure|see to it)\s+(?:that\s+)?(?:the|your|every)\s+(?:room|venue|house|hall|seat)s?\s+(?:is|are|will be)\s+(?:full|packed|filled)\b`, "i"),
];
const TURNOUT_DISCLAIMER = new RegExp(
  String.raw`\b(?:${NEGATOR}|unable|without|in no position)\b[^.?!]{0,40}\b(?:guarantee\w*|promis\w*|commit\w*|predict\w*|assur\w*|ensur\w*|fill\w*|count on)\b|\bno (?:guarantees?|promises?)\b|\b(?:guarantee|promise|commit)\w*\s+(?:to\s+)?(?:nothing|none)\b`,
  "i",
);

export function promisesTurnout(reply: string): boolean {
  return reply
    .split(SENTENCE)
    .filter((sentence) => !sentence.trim().endsWith("?"))
    .flatMap((sentence) => sentence.split(CLAUSE))
    .map((clause) => clause.trim())
    .filter((clause) => clause && !/^(?:if|when|whether|unless)\b/i.test(clause))
    .some((clause) => !TURNOUT_DISCLAIMER.test(clause) && TURNOUT_PROMISES.some((pattern) => pattern.test(clause)));
}

/* Paid promotion of an event goes to Apostle (Brett, Nov 20, 2026). True
   when a clause has Zealot or "we" run, manage, place, or buy ads, a
   campaign, social media, or paid promotion, or advertise the event, and no
   negation governs that verb. "We recommend Apostle to run the ads" and
   "Apostle, a Zealot portfolio company, handles campaigns" are referrals. */
const ADS_VERBS = String.raw`runs?|running|manages?|managing|handles?|handling|places?|placing|buys?|buying|creates?|creating|do|does|doing|launch|launches|launching|take on|takes on|set up|sets up`;
const ADS_OBJECTS = String.raw`ads?|advertising|campaigns?|social media|facebook|instagram|promotion|marketing`;
const ADVERTISE_VERBS = String.raw`advertises?|advertising`;
const ADVERTISE_OBJECTS = String.raw`events?|galas?|fundraisers?|evenings?|nights?|it|them|on facebook|on instagram|on social media`;
/* "Apostle, a Zealot portfolio company, handles campaigns" names Apostle as
   the one who handles them, so the appositive is read without "Zealot". */
const PORTFOLIO_APPOSITIVE = /\b(?:a|the) zealot portfolio company\b|\bzealot['\u2019]s portfolio company\b/gi;

export function zealotRunsAds(reply: string): boolean {
  const text = reply.replace(PORTFOLIO_APPOSITIVE, "a portfolio company");
  return clauses(text).some((clause) =>
    verbHits(clause, ADS_VERBS, ADS_OBJECTS).some((hit) => !hit.governed)
    || verbHits(clause, ADVERTISE_VERBS, ADVERTISE_OBJECTS).some((hit) => !hit.governed));
}

/* The event itself stays with Zealot. True when a clause has Zealot or "we"
   plan, host, scout, organize, handle, help with, take on, or fill the
   event, its venue, its invitations, or the room, or keep the event, with no
   negation governing that verb, or when the reply says the event stays with
   Zealot, in the instructions' own words. */
const EVENT_VERBS = String.raw`plans?|planning|hosts?|hosting|scouts?|scouting|organi[sz]es?|organi[sz]ing|coordinates?|coordinating|handles?|handling|takes? care of|taking care of|works? on|working on|fills?|filling|sends?|sending|runs?|running|keeps?|keeping|helps? with|helping with|takes? on|taking on|covers?|covering`;
const EVENT_OBJECTS = String.raw`events?|galas?|fundraisers?|evenings?|nights?|venues?|locations?|invitations?|invites?|guest lists?|logistics|planning|the room|messaging|networking|network`;
const STAYS_WITH_ZEALOT = /\b(?:events?|galas?|fundraisers?|planning|the event itself|the gala itself)\b[^.?!]{0,60}\bstays?\s+with\s+(?:zealot|us)\b/i;

export function keepsEventWithZealot(reply: string): boolean {
  if (STAYS_WITH_ZEALOT.test(reply)) return true;
  return clauses(reply).some((clause) => verbHits(clause, EVENT_VERBS, EVENT_OBJECTS).some((hit) => !hit.governed));
}

/* True when the reply hands the event itself to Apostle: Apostle plans,
   hosts, or runs the gala, or the gala is sent to Apostle. Apostle running
   the ads for the gala is the right referral, so a campaign word between
   the verb and the event keeps it one. */
const APOSTLE_RUNS_EVENT = /\bapostle\b[^.?!]{0,60}?\b(?:plans?|planning|hosts?|hosting|organi[sz]e\w*|coordinat\w*|handles?|handling|runs?|running|takes? on)\b([^.?!]{0,30}?)\b(?:events?|galas?|fundraisers?|evenings?|nights?|logistics|venues?|invitations?)\b/gi;
const EVENT_TO_APOSTLE = /\b(?:send|sends|sending|refer|refers|referring|point|points|pointing|hand|hands|handing|pass|passes|passing)\s+(?:you\s+|the\s+|your\s+|this\s+)?(?:whole\s+|entire\s+)?(?:event|gala|fundraiser|evening|thing|project)\b[^.?!]{0,20}\bto apostle\b/i;
const CAMPAIGN_WORD = /\b(?:ads?|advertising|campaigns?|social|promotion|promotional|marketing|publicity)\b/i;

export function eventGoesToApostle(reply: string): boolean {
  /* The address's dot is not a sentence end. */
  const text = reply.replace(/\bapostle\.company\b/gi, "apostle-site");
  if (EVENT_TO_APOSTLE.test(text)) return true;
  for (const match of text.matchAll(APOSTLE_RUNS_EVENT)) {
    if (!CAMPAIGN_WORD.test(match[1] ?? "")) return true;
  }
  return false;
}

/* Organizations a reply names that the question did not: two or more
   capitalized words in a row within one sentence, joined at most by "for",
   "of", "and", "the", or "&", with at least one word that is not Zealot's
   own or a place it names. "Acme Hope Alliance" counts; "Middle
   Tennessee", "Brett Henry", "The Zealot Team", and "Event Planning &
   Hosting" do not. A one-word name is not read. */
const OWN_WORDS = new Set([
  "zealot", "apostle", "brett", "henry", "middle", "tennessee", "nashville", "israel", "israeli",
  "god", "lord", "event", "planning", "hosting", "build", "brief", "contact", "form", "team", "company",
]);
const SENTENCE_OPENERS = new Set(["i", "we", "our", "the", "a", "an", "yes", "no", "that", "this", "for", "in", "at", "if", "when", "while", "so", "and", "but", "you", "your", "it", "its"]);
const CAPITALIZED_RUN = /\b[A-Z][\w'’&-]*(?:\.[A-Za-z][\w'’&-]*)*(?:\s+(?:(?:for|of|and|the|&)\s+)?[A-Z][\w'’&-]*(?:\.[A-Za-z][\w'’&-]*)*)+/g;

export function unlistedOrganizations(reply: string, question: string): string[] {
  const asked = question.toLowerCase();
  const found: string[] = [];
  for (const sentence of reply.split(/(?<=[.!?])\s+/)) {
    for (const match of sentence.matchAll(CAPITALIZED_RUN)) {
      const words = match[0].split(/\s+/).filter((word) => /^[A-Z]/.test(word));
      while (words.length > 0 && SENTENCE_OPENERS.has(words[0].toLowerCase())) words.shift();
      if (words.length < 2) continue;
      const plain = words.map((word) => word.replace(/['’]s$/i, "").toLowerCase());
      if (plain.every((word) => OWN_WORDS.has(word))) continue;
      if (asked.includes(match[0].toLowerCase())) continue;
      found.push(match[0]);
    }
  }
  return found;
}
