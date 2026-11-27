# Zealot Build Advisor

The agent that greets visitors on [zealot.company](https://zealot.company), built with [eve](https://eve.dev).

Zealot is a strategy and build firm. Most visitors arrive with a half-formed idea: a website, an internal tool, an AI system. The advisor talks with them, learns what they actually need, looks at their company's public site, and turns the conversation into a build brief the team can act on. The brief lands in Slack. The visitor never fills out a form.

This repo is the agent folder from the live site, pulled out so it can be read on its own.

## What it does

1. **Talks the project through.** An intake guide (`lib/intake.ts`) steers each turn through phases: what they want, who it is for, what exists today, and what done looks like.
2. **Researches the visitor's company.** When a visitor shares their site, `research_prospect_site` reads the public pages and `search_prospect_news` checks recent news. Fetches are limited to public addresses, and private and internal hosts are refused after DNS resolution. A word list keeps sensitive headlines (breaches, lawsuits) out of the reply. Each research feature is off until `PROSPECT_RESEARCH` turns it on.
3. **Checks agent readiness.** The advisor pulls the visitor's site score from Vercel's Is Agentic scan and walks through the top issues. `check_agent_readiness` picks up the result when a scan is still running.
4. **Answers from Zealot's own notes.** `search_knowledge` and `founder_view` answer questions about Zealot's work and its founder from a fixed knowledge base. Nothing gets invented.
5. **Writes the build brief.** A hook (`agent/hooks/build-brief.ts`) catches the finished brief when a turn settles and posts it to Slack as a durable step.

## How it is built on eve

| Piece | File | eve feature |
|---|---|---|
| Agent and model | `agent/agent.ts` | `defineAgent`, `defineDynamic` model routing through AI Gateway |
| System prompt | `agent/instructions.md` | Markdown instructions |
| Operator-only prompt | `agent/instructions/operator-web-search.ts` | `defineInstructions` with `defineDynamic` |
| Tools | `agent/tools/*.ts` | `defineTool` with zod schemas |
| Chat channel | `agent/channels/eve.ts` | `eveChannel` with Vercel OIDC auth, BotID, per-session grants and message limits |
| Site API channel | `agent/channels/site-api.ts` | `defineChannel` routes for contact, lead capture and MCP |
| Brief delivery | `agent/hooks/build-brief.ts` | `defineHook` on `session.started` and `turn.settled`, with a `"use step"` send |
| Cleanup | `agent/schedules/purge-session-grants.ts` | `defineSchedule` on Vercel Schedules |
| Tests | `evals/` | `eve eval` with LLM judges |

### Locked down on purpose

The advisor talks to the public, so it gets only what it needs.

- `defaultTools: false` turns off eve's built-in bash, file and fetch tools. Only the tools written for this agent are available.
- `tool: false` hides the built-in subagent tool.
- Web search exists, but only for the production deployment's own runtime token, and only when an operator turns it on. Visitors never get it.
- Every visitor session is claimed by one principal and checked on each message, so one visitor cannot read or write another's session.
- Retrieved pages are treated as data. The injection evals plant instructions in a prospect's site and check that the advisor ignores them.

## Evals

23 eval suites cover what matters for a public-facing agent:

- **guardrails/**: no pricing, no invented clients or outcomes, no compliance claims, no em dashes, prompt-injection resistance, and news filtering
- **intake/**: persona walkthroughs from first message to finished brief
- **knowledge/**: facts about Zealot and its founder, scored by an LLM judge
- **routing/**: referrals to partner companies, events, and video requests
- **voice/**: tone

```sh
npm run eval:list
npm run eval        # calls the model, so it costs money
```

## Run it

Node 24 or later.

```sh
npm install
cp .env.example .env   # add AI_GATEWAY_API_KEY at minimum
npm run dev            # eve dev
```

In local development, sessions are held in memory when no `DATABASE_URL` is set. Preview and production require the database. Eval sessions under `eve dev` can stub tools (`lib/local-stubs.ts`), which is how the injection evals plant content without fetching real sites.

## Notes

- This is a snapshot of the agent from the zealot.company codebase. The website itself is not included.
- `src/lib/` and `scripts/` hold the few shared helpers and test fixtures the agent and evals import.

Built by [Zealot](https://zealot.company) for the [eve Builder Challenge](https://eve.dev/challenge).
