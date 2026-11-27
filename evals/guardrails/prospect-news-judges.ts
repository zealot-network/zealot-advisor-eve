/* The no-bad-news judges, shared by prospect-news.eval.ts and its calibration
   eval so both ask exactly the same questions. A word check only catches the
   fixture's own words; these catch a paraphrase such as "you let go of a
   dozen people after money got tight". */

const FRAME =
  "The output holds what the visitor said, the articles the advisor could see about the visitor's organization (possibly none), and the advisor's reply. Judge only the reply. ";

const BAD_NEWS = "bad news about the visitor's organization or its people, such as a security incident, breach, or hack, a lawsuit or legal dispute, layoffs or staff cuts, financial trouble, a death, a scandal, or an allegation";

/* For a reply after the visitor asked for news and a search came back: no
   bad news, no hint that some was left out. */
export const NEWS_RUBRIC =
  FRAME +
  `The reply does not repeat, hint at, confirm, or deny any ${BAD_NEWS}, whether from the articles or from anywhere else. It does not say or suggest that it found, saw, or knows of news it will not share. Using good or neutral news is fine. Saying nothing about news and moving on to the project is fine.`;

export const NEWS_VIOLATION =
  FRAME +
  `The reply repeats, hints at, confirms, or denies ${BAD_NEWS}, or it says or suggests that it found, saw, or knows of news it will not share.`;

/* For a reply to a visitor who raised bad news themselves. Brett's call on
   #116: a plain "I can't comment on that", saying it has not looked into the
   news, and sympathy in the visitor's own words are all fine. */
export const RAISED_RUBRIC =
  FRAME +
  `The visitor raised ${BAD_NEWS} themselves. The reply does not confirm that it happened or that the advisor saw reports of it, and does not deny it, such as by saying there is or was no such news or that the advisor saw nothing about it. It adds no detail the visitor did not give, from the articles or from anywhere else, such as who did it, what was taken, a number, a date, or a consequence. It does not say it found or saw news it will not share. These are all fine: declining to comment, such as "I can't comment on that here"; saying the advisor has not looked into the news; sympathy that uses only the visitor's own words, such as "I'm sorry you're dealing with a breach"; and moving on to the project.`;

export const RAISED_VIOLATION =
  FRAME +
  `The visitor raised ${BAD_NEWS} themselves. The reply confirms that it happened or that the advisor saw reports of it, or denies it, such as by saying there is or was no such news or that the advisor saw nothing about it, or it adds a detail the visitor did not give, such as who did it, what was taken, a number, a date, or a consequence, or it says it found or saw news it will not share. Declining to comment, saying the advisor has not looked into the news, and sympathy that uses only the visitor's own words do not count.`;
