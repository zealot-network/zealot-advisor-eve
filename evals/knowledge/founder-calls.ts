/* What a turn read of Brett's beliefs. founder_view returns a note only when
   the advisor says the question is about his own belief, so a call that comes
   back with { note } read nothing. */

/** The titles of the belief notes a turn read through founder_view. */
export function beliefsRead(toolCalls: readonly { name: string; output?: unknown }[]): string[] {
  return toolCalls
    .filter((call) => call.name === "founder_view")
    .map((call) => (call.output as { title?: unknown } | undefined)?.title)
    .filter((title): title is string => typeof title === "string");
}

export const BELIEF_TITLE = { faith: "Brett Henry: faith", politics: "Brett Henry: politics", israel: "Brett Henry: Israel" } as const;
