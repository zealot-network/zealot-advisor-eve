import { defineTool } from "eve/tools";
import { z } from "zod";
import { FOUNDER_QUESTION_KINDS, FOUNDER_VIEW_SUBJECTS, founderView } from "../../lib/knowledge.ts";

// The only way the advisor reads Brett's faith, politics, or view of Israel.
// search_knowledge never returns them (lib/founder.json "views"). The advisor
// says what the question is about, and the note comes back only for his own
// belief, so a question that only borrows the word gets no belief at all.

export default defineTool({
  description:
    "Get Zealot founder Brett Henry's own words on one subject: his faith, his politics, or his view of Israel. Call it only when the visitor asks about Brett himself on that subject. First say what the visitor wants to know, then set asks_about. The note comes back only for his_belief. Answer only that note, in one or two sentences in its own words, and do not argue. Never call it to add to another answer.",
  inputSchema: z.object({
    subject: z.enum(FOUNDER_VIEW_SUBJECTS),
    wants_to_know: z.string().min(1).max(200).describe("In a few words, what the visitor wants to know. Write this before asks_about."),
    asks_about: z
      .enum(FOUNDER_QUESTION_KINDS)
      .describe(
        "his_belief: the visitor wants to know his faith, his politics, including his party, or his view of Israel itself, and nothing else would answer the question. personal_detail: which church he attends or who he votes for, even when the question is about his faith or his politics. something_else: the visitor wants to know anything else, such as about a client, a project, a market, real estate, a place, a school, an investment, a vote in an organization, or how Brett works, even when the question uses a word from the subject. When in doubt, choose something_else.",
      ),
  }),
  async execute({ subject, asks_about }) {
    return founderView(subject, asks_about);
  },
});
