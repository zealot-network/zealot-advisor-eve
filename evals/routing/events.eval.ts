import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import knowledge from "../../docs/eve-migration/source/consulting-knowledge.json" with { type: "json" };
import published from "../../lib/published-clients.json" with { type: "json" };
import { inventedStatistic, proseFromSearchResults } from "../../lib/fabrication.ts";
import { eventGoesToApostle, keepsEventWithZealot, namesWithAddresses, promisesTurnout, unlistedOrganizations, zealotRunsAds } from "../../lib/routing-checks.ts";
import { assertClean, assertNoConsultingName, plainApostrophes, questionCount } from "../checks";

/* Events, as Brett set them on Nov 20, 2026: organizations can retain
   Zealot to plan and host fundraising and awareness events (location
   scouting, messaging, networking, invitations). Zealot has a large
   pro-Israel network across Middle Tennessee and works it to fill the room,
   without promising a turnout. Paid promotion of an event goes to Apostle.
   The note is "Event Planning & Hosting" in consulting-knowledge.json,
   and scripts/knowledge-search.test.ts pins that search finds it and every
   reply check below. Each probe runs in its own session, and each that asks
   about Zealot's work must search the notes, as the KNOWLEDGE rule says. */
const ENQUIRY = "We're an organization planning a fundraising and awareness event in Nashville next spring. Is that something Zealot can help with?";
const PROMOTION = "Can Zealot run Facebook ads and a social media campaign to promote our fundraising gala?";
const TURNOUT = "Can you guarantee at least 300 people will show up to our gala?";
const PRICE = "What would it cost to have Zealot plan and host our fundraiser?";
const CLIENTS = "Which organizations have you hosted fundraising events for? Name a couple.";
/* The marketing session's two chips (Brett, Nov 20, 2026). Each enters the
   build phase with its project type, and lib/intake.ts replaces the build
   wording for it. */
const CHIP_EVENT = "I'm planning an event";
const CHIP_STRATEGY = "I need strategy or consulting";
const chip = (projectType: string) => ({ clientContext: { phase: "build", mode: "guided", fields: { project_type: projectType } } });

/* A question about a build: a question sentence that names building, a
   website, an app, or a platform. BUILD PATH tells the advisor to ask
   whether the organization already has a website, so that question is not
   a build question. */
const BUILD_QUESTION = /\b(?:build|building|built|website|web site|site|app|apps|application|platform)\b/i;
const HAS_WEBSITE_QUESTION = /\b(?:already have|have|has)\s+(?:a|an)\s+(?:website|web site|site)\b|\b(?:existing|current)\s+(?:website|web site|site)\b/gi;
const asksAboutBuild = (reply: string) => reply.split(/(?<=[.!?])\s+/).some((sentence) => sentence.trim().endsWith("?") && BUILD_QUESTION.test(sentence.replace(HAS_WEBSITE_QUESTION, " ")));

/* A refusal to name past hosts: "can't name", "won't share", "don't have
   that". */
const CANNOT_NAME = /do not know|don't know|not something|no information|cannot say|can't say|(?:can't|cannot|can not|won't|will not|not able to|unable to|don't|do not) (?:name|share|list|disclose)|don't have|do not have/i;

/* Organizations the notes name. None of them is an event Zealot hosted, so
   naming one in reply to the client probe is invented. */
const GENERIC = /\b(?:platforms|apps|applications|systems|sites|dashboards|bases|tools|boxes|bots|deployments|portals|recovery|automation|marketplaces|wallets|consultation)$/i;
const ORGANIZATIONS = [
  ...knowledge.entries.flatMap((entry) => entry.related_projects ?? []),
  ...published.entries.map((entry) => entry.title.split(":")[0]),
].filter((name) => name !== "Zealot" && !GENERIC.test(name));

type ToolCalls = readonly { name: string; output?: unknown }[];

const searched = (toolCalls: ToolCalls) => toolCalls.some((call) => call.name === "search_knowledge");

function allowedText(question: string, toolCalls: ToolCalls): string {
  const notes = toolCalls
    .filter((call) => call.name === "search_knowledge")
    .map((call) => proseFromSearchResults(call.output))
    .join("\n");
  return `${question}\n${notes}`;
}

export default defineEval({
  description: "Event asks get Zealot's event work from the notes, paid promotion goes to Apostle, no turnout, price, or past host is given, and the event and strategy chips get intake about the event or the advice, not a build.",
  tags: ["routing"],
  timeoutMs: 360_000,
  async test(t) {
    {
      const turn = await (await t.session()).send(ENQUIRY);
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(searched(turn.toolCalls), satisfies(Boolean, "enquiry: searched the notes"));
      t.check(turn.reply, satisfies((value) => /location|venue|messag|network|invit/i.test(String(value)), "enquiry: describes the event work or the network from the note"));
      t.check(turn.reply, satisfies((value) => questionCount(String(value)) <= 1, "enquiry: asks at most one question"));
      t.check(turn.reply, satisfies((value) => !promisesTurnout(String(value)), "enquiry: promises no turnout"));
      t.check(turn.reply, satisfies((value) => !inventedStatistic(String(value), allowedText(ENQUIRY, turn.toolCalls)), "enquiry: no invented number"));
      t.check(turn.reply, satisfies((value) => !/\bapostle\b/i.test(String(value)), "enquiry: keeps the event with Zealot and names no referral")).soft();
    }
    {
      const turn = await (await t.session()).send(PROMOTION);
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(searched(turn.toolCalls), satisfies(Boolean, "promotion: searched the notes"));
      t.check(turn.reply, includes(/apostle\.company/i));
      t.check(turn.reply, satisfies((value) => namesWithAddresses(String(value)), "promotion: gives the address of each company it names"));
      t.check(turn.reply, satisfies((value) => !zealotRunsAds(String(value)), "promotion: never says Zealot runs the ads or the campaign"));
      t.check(turn.reply, satisfies((value) => !eventGoesToApostle(String(value)), "promotion: does not hand the event itself to Apostle"));
      t.check(turn.reply, satisfies((value) => keepsEventWithZealot(String(value)), "promotion: keeps planning the event with Zealot"));
      t.check(turn.reply, satisfies((value) => questionCount(String(value)) <= 1, "promotion: asks at most one question"));
    }
    {
      const turn = await (await t.session()).send(TURNOUT);
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(searched(turn.toolCalls), satisfies(Boolean, "turnout: searched the notes"));
      t.check(turn.reply, satisfies((value) => !promisesTurnout(String(value)), "turnout: promises no turnout"));
      t.check(turn.reply, satisfies((value) => /network/i.test(String(value)), "turnout: names the network instead")).soft();
      t.check(turn.reply, satisfies((value) => !inventedStatistic(String(value), allowedText(TURNOUT, turn.toolCalls)), "turnout: no invented number"));
      t.check(turn.reply, satisfies((value) => questionCount(String(value)) <= 1, "turnout: asks at most one question"));
    }
    {
      const turn = await (await t.session()).send(PRICE);
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(turn.reply, satisfies((value) => !/\d/.test(String(value)), "price: no digits"));
      t.check(turn.reply, satisfies((value) => !/\$|usd|dollar|euro|£|€/i.test(String(value)), "price: no currency"));
      t.check(turn.reply, satisfies((value) => /scoped individually|scop(?:e|es|ed|ing)[^.?!]{0,80}individually/i.test(String(value)), "price: engagements are scoped individually"));
      t.check(turn.reply, satisfies((value) => /conversation|contact form|the team/i.test(String(value)), "price: offers a conversation with the team"));
    }
    {
      const turn = await (await t.session()).send(CLIENTS);
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(searched(turn.toolCalls), satisfies(Boolean, "clients: searched the notes"));
      t.check(turn.reply, satisfies((value) => {
        const text = plainApostrophes(String(value)).toLowerCase();
        return !ORGANIZATIONS.some((name) => text.includes(plainApostrophes(name).toLowerCase()));
      }, "clients: names no organization from the notes as an event host"));
      t.check(turn.reply, satisfies((value) => unlistedOrganizations(plainApostrophes(String(value)), CLIENTS).length === 0, "clients: names no organization the question did not"));
      t.check(turn.reply, satisfies((value) => CANNOT_NAME.test(plainApostrophes(String(value))), "clients: says it cannot name them"));
      t.check(turn.reply, satisfies((value) => /team|contact|brett/i.test(String(value)), "clients: offers the team"));
    }
    {
      const turn = await (await t.session()).send(CHIP_EVENT, chip("events"));
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(searched(turn.toolCalls), satisfies(Boolean, "event chip: searched the notes"));
      t.check(turn.reply, satisfies((value) => questionCount(String(value)) === 1, "event chip: asks one question"));
      t.check(turn.reply, satisfies((value) => !asksAboutBuild(String(value)), "event chip: asks about the event, not a build"));
      t.check(turn.reply, satisfies((value) => !promisesTurnout(String(value)), "event chip: promises no turnout"));
    }
    {
      const turn = await (await t.session()).send(CHIP_STRATEGY, chip("strategy"));
      t.succeeded();
      assertClean(t, turn.reply);
      assertNoConsultingName(t, turn.reply);
      t.check(searched(turn.toolCalls), satisfies(Boolean, "strategy chip: searched the notes"));
      t.check(turn.reply, satisfies((value) => questionCount(String(value)) === 1, "strategy chip: asks one question"));
      t.check(turn.reply, satisfies((value) => !asksAboutBuild(String(value)), "strategy chip: asks about the advice, not a build"));
      t.check(turn.reply, satisfies((value) => !/\bconsultanc(?:y|ies)\b|\bconsulting (?:firm|company|agency)\b/i.test(String(value)), "strategy chip: never calls Zealot a consultancy"));
    }

  },
});
