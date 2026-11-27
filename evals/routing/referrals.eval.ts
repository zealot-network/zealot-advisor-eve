import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import { asksVisitorSize, brandStaysWithZealot, namesWithAddresses, zealotDoesVideo } from "../../lib/routing-checks.ts";
import { assertClean, assertNoConsultingName } from "../checks";

const CASES = [
  { prompt: "We need a marketing campaign with ads and social media.", expect: /apostle\.company/i },
  { prompt: "Can you help with a roofing and construction company?", expect: /Triumph/i },
  { prompt: "We acquire property and need underwriting help.", expect: /Swift/i },
  { prompt: "I am an independent artist and need help with music.", expect: /Zealot Media/i },
  { prompt: "How do I join DECO?", expect: /DECO/i },
  { prompt: "I have a question about the Rebuild Israel fund.", expect: /rebuildisrael\.com/i },
];

export default defineEval({
  description: "Referrals go to the right Zealot company or site, and brand identity stays with Zealot.",
  tags: ["routing"],
  timeoutMs: 480_000,
  async test(t) {
    for (const item of CASES) {
      const turn = await t.send(item.prompt);
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(turn.reply, includes(item.expect));
    }

    /* Brand identity is Zealot work now, not an Apostle referral. */
    const brand = await t.send("We need a brand identity for our organization.");
    t.succeeded();
    assertClean(t, brand.reply);
    assertNoConsultingName(t, brand.reply);
    t.check(brand.reply, includes(/brand|identity|logo|guidelines/i));
    t.check(
      brand.reply,
      satisfies((value) => !/apostle/i.test(String(value)), "keeps brand identity with Zealot"),
    );

    /* Video production is never Zealot's: Apostle for small and mid-sized
       businesses, Cardboard Spaceship for enterprise clients, both when the
       size is unclear. */
    for (const [prompt, mustName, mustNotName] of [
      ["We run a small local bakery and need a short promo video.", [/apostle\.company/i], [/cardboard/i]],
      ["We're a Fortune 500 company and need a video series produced for our launch.", [/cardboard[- ]spaceship/i], []],
      ["Do you do video production?", [/apostle\.company/i, /cardboard[- ]spaceship/i], []],
      /* A marketing video is still video production, so it goes by size. */
      ["We're a small business and need a marketing video for our new product.", [/apostle\.company/i], [/cardboard/i]],
      ["Our enterprise marketing team needs a product launch video.", [/cardboard[- ]spaceship/i], []],
    ] as const) {
      const video = await t.send(prompt);
      t.succeeded();
      assertClean(t, video.reply);
      assertNoConsultingName(t, video.reply);
      for (const pattern of mustName) t.check(video.reply, includes(pattern));
      for (const pattern of mustNotName) t.check(video.reply, satisfies((value) => !pattern.test(String(value)), `"${prompt}" names only its own referral`));
      t.check(video.reply, satisfies((value) => !zealotDoesVideo(String(value)), `"${prompt}" never says Zealot produces video`));
      t.check(video.reply, satisfies((value) => namesWithAddresses(String(value)), `"${prompt}" gives the address of each company it names`));
      t.check(video.reply, satisfies((value) => !asksVisitorSize(String(value)), `"${prompt}" does not ask the visitor's size`));
    }

    /* Asked about Apostle by name, the advisor gives its address and
       describes the work from the note, with no invented clients or prices. */
    const commercial = await t.send("Can Apostle make a TV commercial for our dealership?");
    t.succeeded();
    assertClean(t, commercial.reply);
    assertNoConsultingName(t, commercial.reply);
    t.check(commercial.reply, includes(/apostle\.company/i));
    t.check(commercial.reply, includes(/commercial|video/i));
    t.check(commercial.reply, satisfies((value) => !/\$|\d/.test(String(value)), "names no price or figure"));
    t.check(
      commercial.reply,
      satisfies((value) => !/\b(?:clients? (?:include|like|such as)|has worked with|worked for|brands like|for brands such as)\b/i.test(String(value)), "invents no Apostle clients"),
    );
    t.check(commercial.reply, satisfies((value) => !zealotDoesVideo(String(value)), "never says Zealot produces video"));

    /* Pushed to make the video anyway, the advisor keeps the referral and
       runs down neither company. */
    const routed = await t.send("Do you do video production?");
    t.succeeded();
    const pushback = await routed.session.send("Can't you just make the video yourselves? We'd rather work with one team.");
    t.succeeded();
    assertClean(t, pushback.reply);
    assertNoConsultingName(t, pushback.reply);
    t.check(pushback.reply, includes(/apostle|cardboard[- ]spaceship/i));
    t.check(pushback.reply, satisfies((value) => !zealotDoesVideo(String(value)), "still never says Zealot produces video"));
    /* The #70 runs show pushback replies naming both companies without
       their addresses. The rule now asks for them; this records it. */
    t.check(pushback.reply, satisfies((value) => namesWithAddresses(String(value)), "gives the address of each company it names")).soft();
    t.check(
      pushback.reply,
      satisfies(
        (value) => !/\b(?:apostle|cardboard[- ]spaceship)\b[^.?!]{0,60}\b(?:bad|worse|poor|unreliable|overpriced|expensive|slow|cheap|subpar|not (?:great|good|as good))\b/i.test(String(value)),
        "does not criticize Apostle or Cardboard Spaceship",
      ),
    );

    /* A brand plus a campaign: Zealot builds the brand, Apostle runs the campaign. */
    const both = await t.send("We need a new brand identity and then a marketing campaign to launch it.");
    t.succeeded();
    assertClean(t, both.reply);
    assertNoConsultingName(t, both.reply);
    t.check(both.reply, includes(/apostle\.company/i));
    t.check(both.reply, includes(/brand|identity|logo|guidelines/i));
    /* Passing on apostle.company alone would let everything go to Apostle.
       Some clause must give the brand to Zealot. */
    t.check(
      both.reply,
      satisfies((value) => brandStaysWithZealot(String(value)), "Zealot owns the brand while Apostle runs the campaign"),
    );
  },
});
