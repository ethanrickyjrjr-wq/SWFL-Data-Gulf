# Insiders Edition — Fable 5 flagship monthly + event minis + editorial desk

**Date:** 2026-07-10 (brainstormed 07/09/2026)
**Status:** SPEC — approved section-by-section in brainstorm; awaiting operator spec review
**Check:** `insiders_edition_live_verify`

## Problem

The lake holds years of data, a daily news pipeline, and a synthesis tier — but no
flagship surface that shows the full power of all of it at once. Everything we send
today is short, per-area, Sonnet-quality slot-fill. There is no long-form,
Fable 5-authored editorial that combines our data, big news stories, historical
analogs from anywhere, and clearly-marked forecasts — the "release of full power"
piece a top-tier reader would pay for.

## Goal

A publication, not a digest:

1. **Insiders Edition (monthly flagship)** — a news-anchored briefing authored by
   Fable 5 over the whole lake. Educates and predicts; every number sourced; every
   projection marked.
2. **Minis (event-triggered)** — the same DNA cut to one story, sent when news
   warrants.
3. **The Desk** — a persistent `_FABLE5/` workspace so the issue is curated daily
   across the month (news triage with editorial weights), not generated cold on
   deadline day, and so each new Fable 5 session resumes in ~1 minute.
4. **The Learning Loop** — a retrospective after every send whose findings improve
   the next issue AND get promoted back into user-facing builds (templates, charts,
   voice) via `checks`.

## Operator rulings (07/09/2026 brainstorm)

- **Audience V1:** free — email signup gets the full issue. Teaser/paywall gating is
  a post-launch research task (benchmarks below), not built now.
- **Send gate:** operator approves EVERY send (monthly and minis). The agent never
  sends. Mirrors the weekly-read safety ladder.
- **Format:** news-anchored briefing (not domain report-card, not single essay).
- **Architecture:** Approach A — dedicated issue composer reusing the existing
  guardrail roots; do NOT remodel `buildContentDoc` (probed: it is a 4,096-token
  slot-fill patcher — wrong shape for a 2,000-word issue).
- **Web page:** yes — each issue also lands at a canonical URL. Email is the
  product; the page is the complete/shareable twin (clipping fallback, share link →
  signup box, public proof, future gating switch, future SMS payload).
- **Sequencing:** composer works before subscriber plumbing, so issue #1 can ship
  operator-triggered.
- **Budget (operator ruling 07/10/2026):** do NOT cap early issues at $2–3. Front-load
  quality — give the flagship room to run and impress, learn from the first issues, and
  drive cost down from evidence, not up front. Per-issue ceiling **$20**
  (`INSIDERS_MAX_SPEND_USD`, default 20), enforced as a hard in-run ledger. There is no
  blanket "no paid API calls" rule; the gates that remain are (a) operator gets a
  heads-up before the FIRST live authoring run of this new surface, and (b) operator
  approves every SEND. All spend still routes through the metered client + spend caps.

## Research evidence (RULE 0.4, gathered 07/09/2026)

**Fable 5 API (verified via claude-api skill reference, cached 06/24/2026):**
- Model ID `claude-fable-5` (exact string). $10/1M input, $50/1M output. 1M context,
  **128K max output**. Thinking always on — OMIT the `thinking` param; depth via
  `output_config: {effort}`. No assistant prefill. Stream long outputs.
- Ship the server-side refusal fallback by default:
  `betas: ["server-side-fallback-2026-06-01"]`, `fallbacks: [{model: "claude-opus-4-8"}]`;
  always branch on `stop_reason === "refusal"` before reading content.
- **Requires 30-day data retention** — org config must be verified before the first
  live authoring call (a ZDR org 400s on every request). Fallback if blocked:
  author on `claude-opus-4-8`.
- Cost at $10/$50 per MTok: a two-pass authoring stage (draft + editor, dossier
  cache-read on pass 2) lands ≈ **$6–8/issue typical**; hard per-issue ceiling **$20**
  (operator ruling 07/10/2026 — room to run on early issues; tune down from retro
  evidence). Routed through the existing metered-client spend guards
  (`refinery/agents/anthropic.mts`) like every other Anthropic call path; note the
  guard's default daily cap is $25 (`ANTHROPIC_DAILY_SPEND_CAP_USD`) — issue day may
  need it raised for the run.

**Newsletter gating benchmarks (for the deferred monetization research):**
- beehiiv "State of Paid Newsletters 2026": median free→paid conversion **0.62%**.
- Substack community analyses (stevenscesaon.substack.com, 08/2025): **1–3%** typical
  for small/medium lists. Whop newsletter statistics: ~5%, up to 10% for outliers.
- Onboarding-sequence subscribers convert ~3.4x better than un-onboarded
  (egledigital.medium.com, 10/2025) — relevant when gating research starts.

**Gmail clipping:** long HTML emails are clipped by Gmail (help pages for the exact
threshold were unreachable this session — verify the byte limit during
implementation). The web-page decision does not hinge on it; the "view the full
issue" link is required regardless.

## Section 1 — Content architecture

Working name **"Insiders Edition"** (final name = operator's call; rename is cheap
until the signup surface ships).

Monthly issue skeleton (fixed, so every issue reads as the same publication):

1. **The Read** — Fable 5's lead thesis for the month. Opinion and voice are free;
   numbers are not: every figure names a real source per the four lanes.
2. **The Stories (2–4)** — the month's biggest news events, each broken down:
   what happened (cited article) → what our data says about that exact area
   (including old vintages) → **the analog**: where this pattern played out before,
   anywhere, with named-source figures.
3. **The Dashboard** — 4–6 charts built deterministically from real series. The
   model picks WHICH series tell the month's story; code plots them. The model
   never draws a number.
4. **The Forward Look** — projections/permutations, each explicitly labeled, each
   carrying its audited base value and one falsifier ("this call dies if X").
5. **Sources** — collapsed citation list; as-of date stated once (MM/DD/YYYY).

**Minis:** same skeleton cut to one story (happened → our data → analog → one marked
projection). Five-minute read.

Voice: SWFL Data Gulf editorial — plain language, no system nouns, no jargon,
no hedge-encoding of hard numbers (rules of engagement apply verbatim).

## Section 2 — Pipeline

Three stages; one metered Fable 5 AUTHORING STAGE in the middle (amended 07/10/2026:
up to two passes — draft + editor — inside the same stage, same guardrails, one
shared budget ledger; the deterministic sandwich around it is unchanged).

**2a. Dossier assembly (deterministic, no model).** `lib/email/insiders/dossier.ts`
gathers: master's current dossier + direction call, per-brain OUTPUT sections, the
month's news events (desk-curated picks first — see Section 3 — raw scored events
as backstop), and the historical-series catalog (what is chartable, how far back).
Produces a typed `IssueDossier`.

**2b. Authoring (one stage, 1–2 passes).** `lib/email/insiders/author.ts` —
`claude-fable-5`, streaming, `effort` env-tunable (`INSIDERS_EFFORT`, default
`"xhigh"` — the recommended tier for the hardest agentic work; `"max"` is the dial
for issue #1 if we want the ceiling), refusal fallback per above. **Pass 1 (draft):**
input = dossier + standing rules (cite everything, mark every projection with base +
falsifier, skeleton contract); dossier block carries `cache_control` so pass 2 reads
it at ~10% rate. **Pass 2 (editor):** Fable 5 re-reads its own draft against the
dossier + playbook charge (tighten thesis, kill weak analogs, sharpen falsifiers) and
emits the final doc; skippable via `INSIDERS_SINGLE_PASS=1`. Output: structured
`IssueDoc` — sections of prose with inline source references + chart REQUESTS
(natural-language series asks), never chart data. Structured output enforced
(schema), parse-miss = abort, never ship a partial. Both passes record into one
`IssueBudget` ledger (cap `INSIDERS_MAX_SPEND_USD`, default $20) — breach aborts
before the next call, never mid-issue silence.

**2c. Materialization (deterministic).** Chart requests resolve against real series
through the production bklit email chart path (per the seed-preview NOTICE.md
conventions). The assembled document runs the SAME enforcement roots every email
passes: `gateNarrative` (no-invention lint), narrative-lint, url-lint, citation
root. Then the ONE renderer (`renderEmailDocHtml`) produces (a) the email HTML and
(b) the canonical page at `/r/insiders/[issue]`. **Any lint failure blocks the
issue** — nothing auto-fixes prose; the failure is reported to the operator.

**2d. Runner.** `scripts/email/insiders-run.mts`, cloned from the weekly-read
safety ladder:
1. `DRY_RUN` default true.
2. Preview HTML written unconditionally BEFORE any live branch — no preview, no send.
3. Gate failures abort loudly (reported, never auto-fixed).
4. Live requires `INSIDERS_APPROVED=1` + postal address + verified From. The agent
   never sends; live runs are operator commands.

Cadence: monthly on a GHA cron in DRY_RUN (draft + preview land for review); the
operator flips the flag to send. Minis are commissioned (Section 3), never cron'd.

## Section 3 — The Desk (`_FABLE5/` workspace + daily routine)

Sits beside `_ASSISTANT/` (proven pattern), owned by the Fable 5 sessions:

    _FABLE5/
      FABLE5.md        boot file — ONE page, hard cap
      MINDMAP.md       information map for humans + agents (Section 5)
      playbook.md      accumulated editorial craft; evolves via retros
      desk/2026-07.md  monthly desk log (one file per month)
      retro/           one retrospective per shipped issue

**FABLE5.md is a thin index, not a diary.** Contents: fresh-session read-order,
POINTERS into SESSION_LOG / checks / memory (never copies), and a ≤5-line "state of
the desk" snapshot updated each visit. Duplicating diary surfaces is how boot files
rot; pointing at them keeps it true.

**Daily visit.** A SessionStart hook (pattern: existing SESSION_LOG hook) prints
one line: "Desk: last visited MM/DD · N unreviewed news items." First session of
the day does the triage:
- Pull news items new since the last visit (from the news lake).
- HANDPICK what matters for the publication (editorial judgment — distinct from the
  cron's project-radius scoring).
- Weight each pick 1–5 + one-line why + area touched + candidate series pairing.
- Weight 5 = "may warrant a mini" → propose the mini same-session (draft + preview
  + park for approval). The operator can also commission a mini directly.
- Quiet day → log "nothing desk-worthy" (staleness ≠ silence).

Desk hygiene: entries cite URLs + one-line summaries. Raw crawl output NEVER gets
committed (`*crawl4ai*` gitignore stands). Desk files get a shape-check test so a
malformed log cannot poison issue day.

## Section 4 — The Learning Loop

After every send, `retro/<issue>.md` with three fixed parts:
1. **Tweaks** — small and concrete; applied immediately to `playbook.md` and the
   authoring skeleton so the next issue inherits them.
2. **Promotions** — anything that generalizes to user builds (section format →
   user seed template via the distiller, chart pairing, voice finding). Each
   promotion opens a `checks` entry IN THE SAME SESSION (RULE 2.4 — no silent
   deferrals). This is the channel that feeds Fable 5's growth back into the
   product.
3. **Capability gaps** — data we wished we held, missing chart shapes, sources
   worth adding → build-queue entries. This is the month-over-month expansion
   engine.

The retro also asks: "did MINDMAP.md lie to you this month?" — map drift gets fixed
in the same commit.

## Section 5 — MINDMAP.md

One thorough document, prose + diagram (mermaid), usable by humans as the systems
map and by agents as a boot manual:
- Boot sequence: hooks → SESSION_LOG → checks → TODAY.md → memory → FABLE5.md/desk.
- Information estate: the lake (data_lake.* + brains + synthesis tier), the news
  pipeline (capture → articles → event extraction), web lanes (crawl4ai), user
  surfaces (Email Lab, zip-report, MCP), ops dashboard.
- Four-lane sourcing + where each guardrail bites.
- The full Insiders pipeline: desk → dossier → author → materialize → approve →
  send + page.
- Promotion paths: retro → playbook → templates / checks / build queue.

## Section 6 — Distribution

- **Subscriber lane:** mirror weekly-read's shape — own table, cadence module,
  batching, per-subscriber unsubscribe, CAN-SPAM postal address. (Do not entangle
  with the open email_contacts/public.contacts reconciliation check.)
- **Signup surfaces:** box on each issue page + site placement (exact placement is
  an implementation-plan detail).
- **Canonical pages:** `/r/insiders/[issue]` + archive index. Email carries the
  full issue in V1 with "view the full issue" linking to the page.
- **Gating:** NOT built in V1. Post-launch research task using the benchmarks above
  (options: teaser-free/full-paid, minis-as-perk). The page makes it a switch later.

## Non-goals (V1)

- No paywall/gating. No SMS channel. No auto-send under any configuration.
- No new mandatory pre-materialization gate (C2) — reuse existing lint seams only.
- No changes to `buildContentDoc` or the Email Lab user surface.
- No new news-capture pipeline — the desk consumes the existing one.

## Error handling

- Lint/citation failure → issue blocked, loud report, prior preview untouched.
- Fable 5 refusal → server-side fallback to `claude-opus-4-8`; if the final response
  still refuses, abort with report.
- Structured-output parse miss → abort (never ship a partial or a skeleton).
- Chart request for a nonexistent series → that chart is dropped with a warning in
  the preview report (bar/table fallback offered), never a fabricated series.
- Malformed desk file → shape-check fails, dossier assembler falls back to raw
  scored events and flags the desk file for repair.

## Testing

- Unit: dossier assembler (fixtures → IssueDossier), IssueDoc schema validation,
  chart-request resolution (real series only; unknown series rejected), desk-file
  shape check.
- Integration: full DRY_RUN compose against fixture dossier with the Anthropic call
  mocked deterministically (weekly-read precedent: no API key = mocked build) —
  asserts preview HTML exists, lints ran, no unsourced figures.
- Live-verify slice (operator-run, metered): one real Fable 5 authoring call on a
  small dossier; verify refusal-fallback wiring and spend-guard integration. Closes
  `insiders_edition_live_verify` only after issue #1 preview is approved and sent.

## Phasing

1. **Phase A — Desk + map:** `_FABLE5/` folder (FABLE5.md, MINDMAP.md, playbook
   stub, desk file), SessionStart desk hook, desk shape-check. Daily routine starts
   immediately — desk content accrues before the composer exists.
2. **Phase B — Composer:** dossier assembler → author → materialize → DRY_RUN
   runner. Issue #1 ships operator-triggered (manual send is acceptable for #1).
3. **Phase C — Distribution:** subscriber table + cadence + signup + `/r/insiders`
   pages + GHA cron (DRY_RUN drafts).
4. **Phase D — Minis + loop hardening:** mini commissioning path, retro template,
   promotion→checks wiring.

## Open questions (tracked, not blocking)

- Final publication name (working title: Insiders Edition).
- Org data-retention config vs Fable 5's 30-day requirement — verify before the
  first live authoring call (Phase B live-verify).
- Gmail clipping byte threshold — verify with a named source during Phase C.
