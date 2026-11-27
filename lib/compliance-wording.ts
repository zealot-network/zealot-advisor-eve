/*
 * One list of compliance standards and claim wording, shared by the
 * knowledge scrub (lib/knowledge.ts) and the eval backstop
 * (lib/claim-detectors.ts), so the two cannot drift apart.
 */

/* Standards and agreements, with the spellings people use: hyphens, extra
   spaces, Roman numerals, "ISO/IEC". BAA is matched separately, case
   sensitive, so "BaaS platforms" is not a business associate agreement. */
export const STANDARD_SOURCE = String.raw`hipaa|hippa|soc[-\s]*(?:2|ii)|iso(?:\/iec)?[-\s]*27001|gdpr|ccpa|hitrust|fedramp|pci(?:[-\s]*dss)?|business[-\s]+associates?(?:[-\s]+agreements?)?|zero[-\s]+data[-\s]+retention|trust[-\s]+centers?`;

export const STANDARD = new RegExp(String.raw`\b(?:${STANDARD_SOURCE})\b`, "i");
export const BAA = /\bBAAs?\b/;

/* "compliant", "certified", and the like count only when tied to a
   standard, as a predicate ("is compliant"), or as "fully compliant" or "in
   full compliance", so "a compliant entity" in a DAO case study is left
   alone. */
export const TIED_CLAIM = new RegExp(
  String.raw`\b(?:${STANDARD_SOURCE})[-\s]*(?:compliant|certified|ready|approved|audited)\b` +
    String.raw`|\b(?:compliant|certified|certifications?|attested|attestations?|audited|accredited)\b[^.!?\n]{0,30}\b(?:${STANDARD_SOURCE})\b` +
    String.raw`|\bfully compliant\b|\bin (?:full )?compliance\b` +
    /* "Zealot is compliant.", "systems are compliant and audited": a
       predicate, not "a compliant entity". */
    String.raw`|\b(?:is|are|stays?|remains?|be|been|being|was|were)\s+(?:fully |now |also |all |completely |always )?(?:compliant|certified|accredited|audited)\b` +
    /* ... ending the phrase, so "is accredited investors" is not a claim. */
    String.raw`(?=\s*(?:[.,;:!?)]|$|(?:and|or|with|by|under|for|to|in|at|every|each|annually|yearly)\b))`,
  "i",
);

/** The first compliance wording in a text: its index, or -1. */
export function firstComplianceWording(text: string): number {
  const hits = [STANDARD.exec(text), BAA.exec(text), TIED_CLAIM.exec(text)]
    .filter((hit): hit is RegExpExecArray => hit !== null)
    .map((hit) => hit.index);
  return hits.length > 0 ? Math.min(...hits) : -1;
}
