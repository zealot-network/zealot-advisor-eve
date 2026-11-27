export type IntakePhase =
  | 'welcome'
  | 'build'
  | 'audience'
  | 'need'
  | 'timeline'
  | 'extras'
  | 'summary'
  | 'complete'
  | 'freeform';

export type ProjectType =
  | 'app'
  | 'web'
  | 'brand'
  | 'ai'
  | 'israel'
  | 'tennessee'
  | 'strategy'
  | 'events'
  | 'other';

export interface IntakeFields {
  project_type?: ProjectType | string;
  project_description?: string;
  audience?: string;
  core_need?: string;
  timeline?: string;
  constraints?: string;
  budget_band?: string;
  geography?: 'israel' | 'tennessee' | 'other';
}

export interface IntakeState {
  phase: IntakePhase;
  fields: IntakeFields;
  mode: 'guided' | 'freeform';
  started: boolean;
}

export interface QuickReplyChip {
  id: string;
  label: string;
  fields?: Partial<IntakeFields>;
  /** Message sent when the chip is tapped */
  message: string;
}

export const INITIAL_INTAKE_STATE: IntakeState = {
  phase: 'welcome',
  fields: {},
  mode: 'guided',
  started: false,
};

export const WELCOME_MESSAGE =
  "Shalom. Tell me what you're dreaming up. Almost anything is on the table. Or pick a starting point below.";

export const QUICK_REPLY_CHIPS: QuickReplyChip[] = [
  {
    id: 'app',
    label: 'I want to build an app',
    message: 'I want to build an app',
    fields: { project_type: 'app' },
  },
  {
    id: 'web',
    label: 'I want to build a website',
    message: 'I want to build a website',
    fields: { project_type: 'web' },
  },
  {
    id: 'brand',
    label: 'I need a brand identity',
    message: 'I need a brand identity',
    fields: { project_type: 'brand' },
  },
  {
    id: 'ai',
    label: 'I want to add AI to something we already have',
    message: 'I want to add AI to something we already have',
    fields: { project_type: 'ai' },
  },
  {
    id: 'israel',
    label: "I'm building something for or in Israel",
    message: "I'm building something for or in Israel",
    fields: { project_type: 'israel', geography: 'israel' },
  },
  {
    id: 'tennessee',
    label: "I'm building a Tennessee business",
    message: "I'm building a Tennessee business",
    fields: { project_type: 'tennessee', geography: 'tennessee' },
  },
  {
    id: 'events',
    label: "I'm planning an event",
    message: "I'm planning an event",
    fields: { project_type: 'events' },
  },
  {
    id: 'strategy',
    label: 'I need strategy or consulting',
    message: 'I need strategy or consulting',
    fields: { project_type: 'strategy' },
  },
  {
    id: 'unsure',
    label: "I'm not sure yet. Help me figure it out.",
    message: "I'm not sure yet. Help me figure it out.",
    fields: { project_type: 'other' },
  },
];

const PHASE_ORDER: IntakePhase[] = [
  'welcome',
  'build',
  'audience',
  'need',
  'timeline',
  'extras',
  'summary',
  'complete',
];

export function nextPhase(current: IntakePhase): IntakePhase {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return current;
  return PHASE_ORDER[idx + 1];
}

/** Map intake project type to contact form service value */
export function projectTypeToService(projectType?: string): string {
  switch (projectType) {
    case 'web':
      return 'web';
    case 'app':
      return 'app';
    case 'brand':
      return 'brand';
    case 'ai':
      return 'ai';
    case 'israel':
      return 'israel';
    case 'tennessee':
      return 'tennessee';
    case 'strategy':
      return 'strategy';
    // An event brief from the advisor lands on Event Planning & Hosting.
    case 'events':
      return 'events';
    default:
      return 'other';
  }
}

export function formatBuildBrief(fields: IntakeFields): string {
  const lines = [
    'BUILD BRIEF (from chat)',
    '────────────────',
    fields.project_description || fields.project_type
      ? `Building: ${fields.project_description || fields.project_type}`
      : null,
    fields.audience ? `For: ${fields.audience}` : null,
    fields.core_need ? `Core need: ${fields.core_need}` : null,
    fields.timeline ? `Timeline: ${fields.timeline}` : null,
    fields.constraints ? `Notes: ${fields.constraints}` : null,
    fields.geography ? `Geography: ${fields.geography}` : null,
    fields.budget_band ? `Engagement size: ${fields.budget_band}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

export function phasePromptHint(phase: IntakePhase): string {
  switch (phase) {
    case 'welcome':
    case 'build':
      return 'Ask what they want to build. Encourage them. One question.';
    case 'audience':
      return 'Ask who this is for (team, customers, community, investors, congregation).';
    case 'need':
      return 'Ask the single biggest organizational need this solves.';
    case 'timeline':
      return 'Ask about timeline: weeks, months, or still exploring.';
    case 'extras':
      return 'Ask if there is anything else: constraints, existing tools, or engagement size band. Do not invent dollar amounts.';
    case 'summary':
      return 'Summarize their Build Brief in a short clear block. Affirm Zealot can build it if it is the right fit. Invite them to the contact form.';
    case 'complete':
      return 'They have a brief. Offer to keep answering questions or point to the contact form.';
    default:
      return 'Help them clarify what to build. One useful question if needed.';
  }
}

/** Same step the chat uses when a visitor taps a Build Path chip. */
export function applyChipIntake(chip: QuickReplyChip): IntakeState {
  return {
    started: true,
    mode: 'guided',
    phase: 'build',
    fields: { ...chip.fields },
  };
}

/**
 * Same step the chat uses before it sends a typed message.
 * The returned phase is the phase the agent sees, which is already advanced.
 */
export function advanceIntake(prev: IntakeState, content: string): IntakeState {
  if (prev.mode === 'freeform') {
    return {
      ...prev,
      started: true,
      fields: captureFieldForPhase('build', content, prev.fields),
    };
  }

  if (prev.phase === 'welcome') {
    return {
      ...prev,
      started: true,
      fields: {
        ...prev.fields,
        project_description: content.trim(),
      },
      phase: 'audience',
    };
  }

  if (prev.phase === 'summary' || prev.phase === 'complete') {
    return {
      ...prev,
      started: true,
      phase: 'complete',
      fields: captureFieldForPhase('extras', content, prev.fields),
    };
  }

  const fields = captureFieldForPhase(prev.phase, content, prev.fields);
  return {
    ...prev,
    started: true,
    fields,
    phase: nextPhase(prev.phase),
  };
}

/** Heuristic field capture from the latest user message for the current phase */
export function captureFieldForPhase(
  phase: IntakePhase,
  content: string,
  fields: IntakeFields
): IntakeFields {
  const trimmed = content.trim();
  if (!trimmed) return fields;

  switch (phase) {
    case 'welcome':
    case 'build':
      return {
        ...fields,
        project_description: fields.project_description || trimmed,
      };
    case 'audience':
      return { ...fields, audience: trimmed };
    case 'need':
      return { ...fields, core_need: trimmed };
    case 'timeline':
      return { ...fields, timeline: trimmed };
    case 'extras':
      return { ...fields, constraints: trimmed };
    default:
      return fields;
  }
}
