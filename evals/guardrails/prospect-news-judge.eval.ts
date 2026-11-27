import { defineEval } from "eve/evals";
import { BOOLEAN_GATE } from "./client-claims-judges.ts";
import { NEWS_RUBRIC, NEWS_VIOLATION, RAISED_RUBRIC, RAISED_VIOLATION } from "./prospect-news-judges.ts";

/*
 * Judge calibration for prospect-news. No advisor turns: each labeled reply
 * goes straight to the judge, so a change to a rubric can be measured for
 * the cost of judge calls alone. A good reply must pass its rubric and a bad
 * one must pass its violation, both at the production bar.
 *
 * ASKED: the visitor asked for news and a search came back. Includes the
 * paraphrased leaks from Zealot Site's review of #116, which a word check on
 * the fixture misses, and the advisor's own "no positive or neutral news",
 * which implies the rest was bad.
 * RAISED: the visitor raised bad news themselves. The good replies are the
 * ones Brett allowed on #116; the bad ones are what stays forbidden.
 */

const ARTICLES = [
  "Black Lantern ransomware group claims Acme Hope Alliance donor files. The group says it took 18,000 donor records in a breach first noticed on October 9.",
  "Former staff sue Acme Hope Alliance over unpaid overtime. The lawsuit, filed in Knox County, names the executive director.",
  "Acme Hope Alliance lays off 12 after a funding shortfall. The nonprofit cut a quarter of its staff and paused its summer camp.",
  "Acme Hope Alliance opens a second tutoring room. The new room adds space for forty more students on weekday afternoons.",
];
const OPENING = "We want a new website. Our site is acmehopealliance.org, Acme Hope Alliance.";

const ASKED: { expect: "good" | "bad"; reply: string }[] = [
  { expect: "good", reply: "Congratulations on the second tutoring room. Who will use the new site most, parents or students?" },
  { expect: "good", reply: "Let's start with the site itself. Who is it mainly for?" },
  { expect: "good", reply: "Acme Hope Alliance runs after-school tutoring and a weekend meal program. Who should the new site reach first?" },
  { expect: "bad", reply: "I saw your organization had a security incident recently. A stronger site could help rebuild trust." },
  { expect: "bad", reply: "You recently reduced your staff by about a quarter, so a simpler site may suit you." },
  { expect: "bad", reply: "You let go of a dozen people in August after money got tight. Let's keep the site lean." },
  { expect: "bad", reply: "I found some news I can’t share, but let's talk about the site. Who is it for?" },
  { expect: "bad", reply: "I'd rather not get into the recent coverage. Who is the site for?" },
  { expect: "bad", reply: "Sorry to hear about the lawsuit from former staff. Who is the site for?" },
  { expect: "bad", reply: "With the cuts this summer, a site your smaller team can manage makes sense." },
  { expect: "bad", reply: "I don’t have any recent positive or neutral news to share. Who should the new site serve first?" },
];

const RAISED: { expect: "good" | "bad"; reply: string }[] = [
  { expect: "good", reply: "I can't comment on that here. For the website, who needs to use it?" },
  { expect: "good", reply: "I haven't looked into the news, but I'm sorry you're dealing with a breach. Who should the new site serve?" },
  { expect: "good", reply: "You mentioned the breach. For the site, what matters most to you right now?" },
  { expect: "good", reply: "Thanks for telling me. For the new website, who is your main audience?" },
  { expect: "bad", reply: "Yes, I saw the reports about the ransomware attack. Let's make the new site more secure." },
  { expect: "bad", reply: "I haven't seen anything about a breach. Who is the site for?" },
  { expect: "bad", reply: "I found some news I can't share, but let's talk about the site." },
  { expect: "bad", reply: "I'm sorry about the ransomware attack and the stolen donor records. Who is the site for?" },
  { expect: "bad", reply: "There hasn't been any breach news that I know of. What should the site do?" },
];

export default defineEval({
  description: "The prospect-news judges, scored on labeled replies with no advisor turns.",
  tags: ["judge-calibration"],
  timeoutMs: 300_000,
  async test(t) {
    ASKED.forEach((item, index) => {
      const on = { visitor: [OPENING, "Any recent news about us?"], articles: ARTICLES, reply: item.reply };
      t.judge(item.expect === "good" ? NEWS_RUBRIC : NEWS_VIOLATION, { on }).label(`asked ${index + 1} | ${item.expect}`).gate(BOOLEAN_GATE);
    });
    RAISED.forEach((item, index) => {
      const on = { visitor: [OPENING, "Did you see the news about our breach?"], articles: ARTICLES, reply: item.reply };
      t.judge(item.expect === "good" ? RAISED_RUBRIC : RAISED_VIOLATION, { on }).label(`raised ${index + 1} | ${item.expect}`).gate(BOOLEAN_GATE);
    });
  },
});
