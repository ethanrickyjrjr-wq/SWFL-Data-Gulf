# Can the Max subscription pay for our pipeline calls instead of the API key?

Date: 2026-09-15 · Trigger: operator ran `LLM_PROVIDER=claude-code bun refinery/cli.mts master
--resilient` expecting the subscription to pay, then: "WE HAVE MAX PLAN WE DON'T NEED TO PAY MORE
IN FUCKING API COSTS!!!"

Sources crawled live 09/15/2026 via crawl4ai (pinned `C:\Users\ethan\crawl4ai-venv`):
- https://code.claude.com/docs/en/authentication  (precedence list, `claude setup-token`)
- https://code.claude.com/docs/en/agent-sdk/overview  (license and terms)
- https://code.claude.com/docs/en/costs  (subscription vs per-token metering)

## 1. What the operator ran does not exist

`LLM_PROVIDER` is read by NOTHING in this repo. Two greps (tree-wide + `ingest/.venv`): every hit
is crawl4ai's own `cli.py`/`config.py`, litellm internals, or a crawl4ai changelog under
`docs/audit/`. Zero hits in `refinery/`, `lib/`, `app/`, `scripts/`.

The factory has no provider indirection at all. `refinery/agents/anthropic.mts:15-17`:
`agentsAreMocked() { return !env.anthropicApiKey }`. Two states only — key present = metered API,
key absent = deterministic mock. Models are pinned literals at :6-8 (`claude-haiku-4-5` triage,
`claude-sonnet-4-6` synthesis), not env-switchable.

## 2. The mechanism DOES exist (vendor, verbatim)

`claude setup-token` mints a one-year OAuth token; set it as `CLAUDE_CODE_OAUTH_TOKEN`. Vendor:
"This token authenticates with your Claude subscription and requires a Pro, Max, Team, or
Enterprise plan. It can only make model requests." Intended use, vendor's words: "For CI
pipelines, scripts, or other environments where interactive browser login isn't available."

**Precedence trap (the reason a naive attempt silently bills the API anyway).** Documented order:
2. `ANTHROPIC_AUTH_TOKEN` → 3. `ANTHROPIC_API_KEY` → 4. `apiKeyHelper` → 5.
`CLAUDE_CODE_OAUTH_TOKEN` → 6. Anthropic profile → 7. subscription OAuth from `/login`.
`ANTHROPIC_API_KEY` **outranks** the subscription token, and the docs add: "In non-interactive
mode (`-p`), the key is always used when present." Our key lives in the local dotenv file, which
bun loads and which wins over the shell ([[bun-env-precedence]]). Any subprocess inheriting
`process.env` bills the API no matter what token is also set. Also: `--bare` does not read
`CLAUDE_CODE_OAUTH_TOKEN` at all.

## 3. The terms line — the actual blocker, and it is not about cost

Agent SDK overview, verbatim: "Unless previously approved, Anthropic does not allow third party
developers to offer claude.ai login or rate limits for their products, including agents built on
the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead."

Read precisely, it bars offering claude.ai login *or rate limits* **for their products**.

**CORRECTED 09/15/2026, same session — my first read of this was wrong on the product.** Operator:
"USERS DON'T FUCKING READ THE FUCKING BRAINS!! THEY USE THEIR CLAUDE!! OR AI". Verified against our
own contract, `docs/THE-GOAL.md:24`: "**The user's AI.** It reasons over the dossier master hands it
... Everyone has Tier 3." We hand a context bundle to the consumer's OWN model on the consumer's OWN
plan; nobody reads brain prose directly and no end user touches our inference.

So the sentence does not reach this: we would not be offering claude.ai login or claude.ai rate
limits to anyone. Our seat would be building a dataset — ordinary developer automation, the same
shape as the 35-agent sweep and the fix fan-out already run on it. The residual is the seat-window
cost in §4, which is an operating question, not a terms question. Not a slam dunk to zero risk, but
the "customer-facing content" objection I originally raised was a false premise and is withdrawn.

## 4. Second-order: the subscription window is the SAME window the operator codes in

Costs doc: subscription limits are seat-based session and weekly windows, shared across all models
("You've hit your weekly limit"). A 38-45 brain rebuild on `CLAUDE_CODE_OAUTH_TOKEN` draws from the
same allowance as Ricky's own Claude Code sessions. Success mode = the nightly cron locks him out
of his own tool mid-session. Cache lifetime also drops from 1h (subscription) to 5min once usage
credits kick in.

## 5. MEASURED — what we are actually paying (our own `api_usage_log`)

Log span 07/01/2026 → 09/08/2026, 6,122 rows.

- Lifetime total: **$81.42**
- 07/2026 $50.33 · 08/2026 $29.18 · 09/2026 $1.92 (through 09/08)
- Last 30 days: **$6.03** across 697 calls. Largest line: city-pulse distill $2.77.
- **Refinery (synthesis + triage): 48 calls, $12.30 TOTAL, all between 07/07 and 08/10/2026.**
  Nothing since 08/10 — a full master rebuild has not run through the metered path in over a month.

So the refinery is not what is costing money, and the command the operator ran had never been run
successfully in the window either.

CAVEAT (a map is never evidence for its territory): `api_usage_log` records only calls routed
through `logApiUsage`. The 3 GHA `claude-code-action` workflows, `heal-cron-failure.yml`'s raw SDK
call, and anything run with `SKIP_USAGE_LOG=1` are NOT in these totals. $6.03/30d is "what our
instrumented paths recorded", not an invoice. If the real Anthropic bill is materially larger, the
difference is outside this table and has to be chased in the Console.

## 5b. CATALOG lane — our own LLM spend has no catalogued root

Searched `docs/standards/data-roots.md` and `ingest/cadence_registry.yaml` 09/15/2026:
**`api_usage_log` appears in neither.** The catalog governs SWFL data concepts (parcels, listings,
permits), not our own metering, so this is expected rather than a gap in the catalog — but it does
mean the spend concept has no "one root per concept" entry and no source_ceiling line.

Asymmetry worth noting: **Apify spend IS catalogued** — guard root `lib/listings/apify-spend-guard.ts`
(data-roots :340), with three ceilings recorded at :401-402 including the account's own
`maxMonthlyUsageUsd` of $50. Anthropic spend has a guard in code (`spendCaps` / `checkSpendGuard`,
`anthropic.mts:300-311`) but no catalog entry. Combined with §6 below, the Anthropic guard is both
uncatalogued and under-reading.

## 6. 🔴 LIVE DEFECT FOUND — the meter has blind rows

`RATES` (`refinery/agents/anthropic.mts:53-64`) holds four rows: sonnet-4-6, haiku-4-5, opus-4-8,
fable-5. There is **no `claude-sonnet-5` and no `claude-opus-5` row.** `computeCostUsd` returns 0
for an unrecognized model by design (:88-94, "rather than guessing a rate"). Measured consequence
today: **58 `claude-sonnet-5` calls logged at $0.00.** They are invisible to the spend caps in
`checkSpendGuard`. This is the same shape the 07/30 model-routing research flagged as "the finding
that is a defect, not a benchmark" and it is still open. Cheap fix, one commit, two rows.

## 7. OPERATOR ROUND 2 — "we fanned out a sonnet and got it done" / "schedule it" / "Fedora agent"

Both operator claims verified TRUE against our own records:

- **The fan-outs are real and they were free.** 08/27/2026 "fan out 5 sonnets at a time 7 times" =
  35 Sonnet subagents on the HF sweep (SESSION_LOG :555). 08/27-28 "Fan out and fix it all" = 6
  agents, TDD-first, coordinator-verified, 4 of 6 fixed (:474). Those ran as Claude Code subagents
  on the Max seat — which is exactly why **none of them appear in `api_usage_log`.** His instinct
  is right: that work cost $0 in API terms.
- **The Fedora agent already exists and already did a real job at $0.** Hermes (local Ollama,
  `model.default` gpt-oss:20b since 08/09/2026, SESSION_LOG :4189) ran **298 logged calls of
  `ingest_condo_xref` on 08/30/2026 — gpt-oss:20b 180 + gemma4:12b 118 — at $0.00.** Not a
  proposal; a precedent. COUNTER-EVIDENCE on quality, same log (:4177): Hermes's own roadmap pitch
  invented a field (`viewership`), undefined metrics, and nonexistent tables (`lie_parcels`,
  `lee_parcends`). Fine for mechanical matching, measured-unsafe for judgment about our schema.

**`claude-code-action` supports it first-class.** Live `action.yml` 09/15/2026:
`claude_code_oauth_token` — "Claude Code OAuth token (alternative to anthropic_api_key)".

**🔴 THE TRAP THAT KILLS THE OBVIOUS CONFIG.** The action passes BOTH credentials through to the
CLI as env vars: `ANTHROPIC_API_KEY: ${{ inputs.anthropic_api_key || env.ANTHROPIC_API_KEY }}` and
`CLAUDE_CODE_OAUTH_TOKEN: ${{ inputs.claude_code_oauth_token || env.CLAUDE_CODE_OAUTH_TOKEN }}`.
The CLI's documented precedence then puts the API key ABOVE the OAuth token (§2). So a
"belt-and-braces" workflow that passes both **silently keeps billing the API** and the subscription
token is ignored. The key input must be REMOVED, not supplemented — which forces the sequencing:
mint token → set secret → flip workflows. Flipping first breaks the runs.

**SCOPE of the convertible shape (RULE 0.5c) — 3 sites, 1 exempt:**
- `claude-code-automation.yml:30` (passes it as `env:`, uppercase) — convertible
- `claude-deploy-triage.yml:33` (`with: anthropic_api_key`) — convertible
- `chief-of-staff-nightly.yml:58` (`with: anthropic_api_key`; its `schedule:` is commented out
  at :22-23) — convertible
- `heal-cron-failure.yml:190` — NOT convertible. Raw `@anthropic-ai/sdk`; the OAuth token is a
  Claude Code credential, not an SDK one. Stays metered.
- `gh secret list` 09/15/2026: only `ANTHROPIC_API_KEY` exists. No `CLAUDE_CODE_OAUTH_TOKEN` yet.

**THE PART THAT DOES NOT WORK, stated plainly.** Scheduling a Claude Code agent to run
`bun refinery/cli.mts` does NOT make the brain rebuild free. The agent shells out; the pipeline's
own triage/synthesis calls still go through `anthropic.mts` on the API key. Subscription billing
only reaches work the *agent itself* performs. Making the rebuild free means the agent (or Hermes)
performs triage/synthesis and Stage 4's validators still gate the output — a real architecture
change, and the one that walks into the §3 terms line because brains are customer-facing content.

## VERDICT — REVISED 09/15/2026 after the §3 correction: ADOPT, SEQUENCED

The original verdict leaned on a terms objection that turned out to rest on a false premise about
who reads the brains (§3). With that withdrawn, the remaining objections are operational, not legal,
and the operator has twice named the direction. Revised:

1. **DO IT — the 3 GHA `claude-code-action` workflows move to `CLAUDE_CODE_OAUTH_TOKEN`.** Terms-
   clean under any reading (internal dev work), vendor-supported first-class, and it converts the
   spend bucket our own log cannot even see. **Blocked only on a browser step the operator must do:
   `claude setup-token`, then `gh secret set CLAUDE_CODE_OAUTH_TOKEN`.** The API-key input must be
   REMOVED in the same edit, never left alongside — §7's precedence trap makes a both-credentials
   config silently keep billing the API.
2. **The brain rebuild on the seat is now a legitimate target, but it is an architecture change,
   not a config flip.** Scheduling an agent to run `refinery/cli.mts` changes nothing — the
   pipeline's own calls still use the key (§7). Free means the agent performs triage/synthesis with
   Stage 4's validators still gating. Real work; needs its own build with the operator's word.
3. **RULE 11 caution, downgraded not dropped:** measured metered spend is $6.03/30d. The prize is
   the UNMEASURED bucket (3 agent workflows + interactive sessions), which is why item 1 leads.
4. **NORTH STAR #5** (adopt nothing new, through 09/18/2026) does not bite: this adopts no new
   vendor, tool, or dependency — it changes which credential an already-installed action presents.
5. **DO NOW, unblocked, $0:** add the `claude-sonnet-5` and `claude-opus-5` rows to `RATES`. A spend
   guard that prices two current models at zero is not a guard. Verify rates live before writing.
