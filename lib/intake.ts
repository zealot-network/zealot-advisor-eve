const PHASES = new Set([
  "welcome",
  "build",
  "audience",
  "need",
  "timeline",
  "extras",
  "summary",
  "complete",
  "freeform",
]);

const FIELD_KEYS = [
  "project_type",
  "project_description",
  "audience",
  "core_need",
  "timeline",
  "constraints",
  "budget_band",
  "geography",
] as const;

/* The event and strategy chips (project_type events and strategy) enter
   the same phases as a build, and the client files each answer by phase:
   build on the "Building" line, audience on "For", then need, timeline, and
   constraints. So each type asks its own questions in those slots: for an
   event, what it is and its cause, who it is for, the help needed, the date,
   then the city, the size hoped for, and constraints. */
const SUMMARY_RULES =
  "If the visitor named a compliance, security, or contract requirement, record it in their words as their requirement, do not say Zealot will meet it, and say Brett will confirm what Zealot can commit to. Do not claim that you sent, emailed, or submitted anything. Do not ask a question.";
const EVENT_HINTS: Record<string, string> = {
  welcome: "Ask what the event is and the cause it serves. Reply in 2 or 3 short sentences. Ask at most one question.",
  build: "Ask what the event is and the cause it serves. Reply in 2 or 3 short sentences. Ask at most one question. Do not ask who it is for yet.",
  audience: "Ask who the event is for: the guests they hope to bring and the community it serves. Reply in 2 or 3 short sentences. Ask at most one question. Do not ask what help they need yet.",
  need: "Ask what help they need most: location scouting, messaging, networking, or invitations. Reply in 2 or 3 short sentences. Ask at most one question. Do not ask about the date yet.",
  timeline: "Ask when the event is: a date, a season, or still open. Reply in 2 or 3 short sentences. Ask at most one question.",
  extras: "Ask about the city, the size they hope for, or any constraints. Never promise a turnout. Do not invent dollar amounts. Reply in 2 or 3 short sentences. Ask at most one question.",
  summary: `Write the Build Brief now. The reply must contain the words Build Brief and the words contact form. Repeat every collected value in the visitor's own words. Say Zealot can plan and host the event if it is the right fit. Never promise a turnout. ${SUMMARY_RULES}`,
};
const STRATEGY_HINTS: Record<string, string> = {
  welcome: "Ask what they want advice on. Reply in 2 or 3 short sentences. Ask at most one question.",
  build: "Ask what they want advice on: strategy, partnerships, fractional leadership, growth, or something else. Do not steer them toward a website or app. Reply in 2 or 3 short sentences. Ask at most one question. Do not ask who it is for yet.",
  audience: "Ask who the advice is for: the leaders, the team, or the organization. Reply in 2 or 3 short sentences. Ask at most one question. Do not ask about the organizational need yet.",
  need: "Ask the single greatest organizational need the advice should address. Reply in 2 or 3 short sentences. Ask at most one question. Do not ask about timeline yet.",
  timeline: "Ask about timing: weeks, months, or still exploring. Reply in 2 or 3 short sentences. Ask at most one question.",
  extras: "Ask what they have tried or any constraints. Do not invent dollar amounts. Reply in 2 or 3 short sentences. Ask at most one question.",
  summary: `Write the Build Brief now. The reply must contain the words Build Brief and the words contact form. Repeat every collected value in the visitor's own words. Say the team can scope the advice if it is the right fit. Do not say Zealot will build anything, and never call Zealot a consultancy. ${SUMMARY_RULES}`,
};

export function phasePromptHint(phase: string, projectType?: string): string {
  const typed = projectType === "events" ? EVENT_HINTS[phase] : projectType === "strategy" ? STRATEGY_HINTS[phase] : undefined;
  if (typed) return typed;
  switch (phase) {
    case "welcome":
      return "Ask what they want to build. Reply in 2 or 3 short sentences. Ask at most one question.";
    case "build":
      return "Ask what they want to build. If a type is already chosen, ask for a little more detail about the build itself. Reply in 2 or 3 short sentences. Ask at most one question. Do not ask who it is for yet.";
    case "audience":
      return "Ask who this is for. Reply in 2 or 3 short sentences. Ask at most one question. Do not ask about the organizational need yet.";
    case "need":
      return "Ask the single greatest organizational need this solves. Reply in 2 or 3 short sentences. Ask at most one question. Do not ask about timeline yet.";
    case "timeline":
      return "Ask about timeline: weeks, months, or still exploring. Reply in 2 or 3 short sentences. Ask at most one question.";
    case "extras":
      return "Ask about constraints or existing tools. Do not invent dollar amounts. Reply in 2 or 3 short sentences. Ask at most one question.";
    case "summary":
      return "Write the Build Brief now. The reply must contain the words Build Brief and the words contact form. Repeat every collected value in the visitor's own words, and keep the noun phrase they used for what they are building. Do not swap in a synonym. Affirm Zealot can build it if it is the right fit. If the visitor named a compliance, security, or contract requirement, record it in their words as their requirement, do not say Zealot will meet it, and say Brett will confirm what Zealot can commit to. Do not claim that you sent, emailed, or submitted anything. Do not ask a question.";
    case "complete":
      return "They have a brief. Offer to keep answering questions or point to the contact form. Stay within 4 sentences.";
    default:
      return "Answer in 2 to 4 sentences. Ask one question only when it moves the conversation forward, or offer the contact form.";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/* Two quick replies start intake for work that is not a build: "I'm
   planning an event" sets project_type events, and "I need strategy or
   consulting" sets strategy (the marketing session's chips, approved by
   Brett on Nov 20, 2026). phasePromptHint asks each type's own questions;
   this adds what holds across the phases. The brief keeps the name Build
   Brief, since agent/hooks/build-brief.ts and the evals key on it. */
const EVENTS_GUIDANCE =
  "If project_type is events, the visitor is planning an event, not a build. Search the notes and describe Zealot's event work from them. Never promise attendance, a headcount, or a turnout. Paid promotion of the event, such as ads and social media campaigns, goes to Apostle at apostle.company.";
const STRATEGY_GUIDANCE =
  "If project_type is strategy, the visitor wants advice, not a build. Search the notes and describe Zealot's consulting from them before you ask. Do not steer them toward a website or app unless they ask for one. Never call Zealot a consultancy or a consulting firm.";

export function projectTypeGuidance(projectType: string | undefined): string {
  if (projectType === "events") return EVENTS_GUIDANCE;
  if (projectType === "strategy") return STRATEGY_GUIDANCE;
  return "";
}

export function buildIntakeGuidance(clientContext: unknown): string {
  const record = asRecord(clientContext);
  if (!record) return "";

  const phase = typeof record.phase === "string" && PHASES.has(record.phase)
    ? record.phase
    : "welcome";
  const mode = record.mode === "freeform" ? "freeform" : "guided";
  const rawFields = asRecord(record.fields) ?? {};
  const fields: Record<string, string> = {};
  for (const key of FIELD_KEYS) {
    const value = rawFields[key];
    if (typeof value === "string") {
      const trimmed = value.trim().slice(0, 500);
      if (trimmed) fields[key] = trimmed;
    }
  }

  const phaseHint = phasePromptHint(phase, fields.project_type);
  const typeGuidance = projectTypeGuidance(fields.project_type);
  const collected = Object.entries(fields)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return `

BUILD PATH CONTEXT
Mode: ${mode}. Current phase: ${phase}.
Phase instruction: ${phaseHint}
${collected ? `Collected so far:\n${collected}` : "Nothing collected yet."}
If project_type is brand, treat it as Zealot work: brand identity and brand development, often alongside a website or app. If the visitor mainly wants marketing campaigns, such as ads, social media, or ongoing promotion, refer that part to Apostle at apostle.company and keep the brand, web, app, AI, or systems work with Zealot.
${typeGuidance ? `${typeGuidance}\n` : ""}When phase is summary, the reply is the Build Brief. It must contain the words Build Brief and contact form, and it must repeat each collected value exactly as written above.`;
}
