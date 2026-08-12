# crawl4ai — four-lane strategy (vendor ground-truth, competitor/design, new data sources, live answer-time)

**Date:** 08/12/2026 · Operator asked for "crawl4ai ideas we can plan out — how it should look and how we
make our AI more knowledgable." Dispatched 4 parallel Sonnet agents, one per lane, each required to
read existing `_RESEARCH/` + `docs/standards/` coverage first (RULE 0.4/0.5) before proposing anything
new. This file is the synthesis; each agent's full report is in the SESSION_LOG entry of the same date
if more detail is needed later.

## Headline verdict — lane 4 is a non-build

The operator's framing assumed a live, mid-conversation crawl4ai lookup was a gap. It isn't. That
capability already shipped — on a different vendor tool. `lib/assistant/gap-fill.ts` /
`lib/assistant/web-fallback.ts` already run Anthropic's hosted `web_search_20250305` tool live on any
conversational answer (not just chart-building), gated by verbatim digit-match against the returned
citation span and a domain allowlist (`SEARCH_ALLOWED_DOMAINS`). crawl4ai is explicitly disclaimed in
that file's own header comment as out of scope there. Reasons NOT to extend crawl4ai into the live
answer path: deployment mismatch (crawl4ai is a local Playwright venv on Ricky's machine; the answer
path is Vercel serverless — no crawl4ai service is reachable from production, and standing one up is
new infrastructure RULE 0.9 warns against hand-rolling), latency mismatch (crawl4ai's probe-and-escalate
workflow is session-time research, not a streaming chat turn), and citation-shape mismatch
(`web_search_20250305` already returns a verified `{value, url, cited_text}` triple; crawl4ai returns
raw markdown you'd have to re-build citation extraction on top of). **Narrow residual use, if ever
needed:** crawl4ai as an OFFLINE, human-reviewed way to add a bot-walled/non-indexed source to the
`SEARCH_ALLOWED_DOMAINS` allowlist — never a live in-request call.

## Lane 1 — vendor/API ground-truth (RULE 0.4 compliance)

No registry tracks *when* a vendor surface (model ID, API response shape, SDK version) was last
verified against live docs. Several load-bearing surfaces are pinned from memory with zero dated
citation — highest-risk: Anthropic model IDs (`refinery/agents/anthropic.mts`, hardcoded, no in-repo
citation), SteadyAPI response shape (`lib/listings/steadyapi.ts` — MEMORY.md already documents one
drift incident: "no property-type field," "search slug centering dead"), Apify actor schema
(`lib/listings/apify-run.ts` — "Apify baths SAMPLES, doesn't look up"), Resend, Mapbox. Existing idioms
this should reuse rather than reinvent: `ingest/cadence_registry.yaml`'s dated-freshness shape and the
`checks` ledger's close discipline.

## Lane 2 — competitor & design research

Competitor coverage is deep (26 files: FollowUpBoss 36-page crawl, 8-product listing-grade scan, 5 of
7-8 agent-site platforms tested). Design research is thin and stale — nothing new since 07/01, despite
`ingest/pipelines/report_design_research/crawl_report_designs.py` sitting fully written and never run
(5 read-only crawls: Chartr, Axios Markets, Morning Brew, Daily Upside, Redfin Data Center — feeds
layout/typography knowledge for `/r/` reports and email templates, NOT the already-locked palette/font
decision in `app/_design/05-color-and-type.md`). Real gap behind the team's own documented landmine
(`feedback_read-the-sibling-file-before-running`): nothing tracks `last_crawled` per competitor, so a
future session re-derives FollowUpBoss from scratch. New targets ranked: run the design-crawl script
as-is (zero new code); finish BoomTown/CINC (2 of 7-8 agent platforms unassigned); capture a
competitor's actual sent drip EMAIL, not just their marketing page (directly informs
`docs/standards/email-build-playbook.md`); AuditListing's actual delivered report artifact (not just
its homepage); Restb.ai's Stellar MLS integration surface (flagged, unexamined).

## Lane 3 — new public data sources

Real find: **Collier Clerk official records** — the sibling of the Lee deed feed we already run daily.
Lee failed crawl4ai + CDP Chromium + curl + curl_cffi (Akamai). Collier was independently confirmed
crawlable 07/22/2026, untested for full automation since. If it holds, it's a materially better ROI
than Lee's manual-capture lane. Free-money find: the Lee feed we already fetch carries LIS PENDENS,
CERTIFICATE OF TITLE, JUDGMENT, PROBATE, and NOTICE OF COMMENCEMENT rows (the actual foreclosure/
distress timeline, doc-type catalog ranked these top priority the same day) — today's build only
parses DEED out of the same response. Two genuinely new, zero-prior-coverage source families: a
foreclosure auction calendar (closing bracket to LIS PENDENS) and code-enforcement/special-magistrate
liens (grepped `_RESEARCH/` — one match, no real coverage). Both `*clerk*` targets will likely hit the
same Akamai wall Lee already lost to — plan manual capture, not full automation, unless Collier's probe
proves otherwise.

## Proposed mechanism — ONE registry, not two

Two agents independently proposed a YAML registry (vendor surfaces; competitor/design targets) shaped
like `cadence_registry.yaml`. Don't ship two parallel systems — one `_RESEARCH/scouting-registry.yaml`
with a `kind: vendor_surface | competitor | design_reference | data_source_scout` field, each entry
carrying `target`, `source_url`, `last_verified`/`last_crawled`, `next_due`, `source_file` (the
`_RESEARCH/` doc it produced). A staleness script (same shape as the freshness probe) opens a `checks`
entry per stale row into the existing ledger — no new obligation-tracking system.

## Recommended first action

`crawl_report_designs.py` — already written, zero new code, lowest cost, closes a flagged-and-ignored
gap. Everything else above needs either a scoping decision (registry shape) or a probe-first
liveness check (Collier Clerk) before committing real work.
