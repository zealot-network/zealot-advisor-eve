export function numberTokens(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

function searchHits(output: unknown): { title: string; description: string }[] {
  let value = output;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== "object") return [];
  const list = Array.isArray(value)
    ? value
    : (value as { results?: unknown }).results;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const hit = item as { title?: unknown; description?: unknown };
    return [{
      title: typeof hit.title === "string" ? hit.title : "",
      description: typeof hit.description === "string" ? hit.description : "",
    }];
  });
}

export function proseFromSearchResults(output: unknown): string {
  return searchHits(output)
    .map((hit) => `${hit.title}\n${hit.description}`)
    .join("\n");
}

export function inventedStatistic(reply: string, allowedText: string): boolean {
  const allowed = new Set(numberTokens(allowedText));
  const patterns = [
    /\b\d+(?:\.\d+)?\s*%/g,
    /\$\s*\d/g,
    /\b\d+(?:\.\d+)?\s*(?:clients?|projects?|percent|people|users|companies|engagements?|customers?|sites?|months?|weeks?|days?|hours?|years?|million|billion|thousand)\b/gi,
    /\b(?:over|more than|at least|about|around|nearly|approximately|under|fewer than)\s+\d+/gi,
    /\b\d+(?:\.\d+)?\s*(?:x|times)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of reply.match(pattern) ?? []) {
      if (numberTokens(match).some((token) => !allowed.has(token))) return true;
    }
  }
  return false;
}
