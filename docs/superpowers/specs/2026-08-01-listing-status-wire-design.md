# Wire per-listing pending/contingent status into what we actually serve

**Date:** 2026-08-01 · **Check:** `listing_status_wire_live_verify`
**Closes:** the gap named in-session 08/01/2026 — "a house can be under contract today and our data
won't show that" (partially true; refined below)
**Research:** `_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md`

**Operator context (verbatim, 08/01/2026):** wants this handed to Opus to implement. Session found
the gap while answering a product-vision question, not while working a ticket — treat every field
claim below as probed, not assumed, and re-verify anything marked UNVERIFIED before writing code.

---

## Problem

`data_lake.listing_state` — the daily spine written by the `listing_lifecycle` pipeline (SteadyAPI
`/search`, realtor.com origin, **not** a licensed MLS/IDX feed) — holds `mls_number`, `mls_name`,
`listing_type`, `status`, `reduced_amount`, `flag_pending`, `flag_contingent`, `flag_coming_soon`,
`flag_new_listing`, `sold_check_at` as live columns
(`_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md`, corroborated by
`docs/standards/data-roots.md` line 1326 and `ingest/cadence_registry.yaml` line ~1326).

Tree-wide grep (`flag_pending|flag_contingent`) found exactly **one** consumer in the whole repo:
`lib/desk/loaders.ts:913` — `countActiveFlag(supabase, "flag_pending")`, a raw count feeding the
internal `/desk` ops dashboard. Nothing wires per-listing status into the served brain output, the
MCP fetch (`app/api/mcp/server.ts`), or any chat/report answer. The field is captured and refreshed
daily; it was never carried the last mile to anything a user or an agent reads.

**Reframe of the original claim:** not "we have zero signal" — we hold the flags, refreshed daily
via `scraped_at`. What's actually true: (1) it's a day behind, not real-time, because the source is
a daily scrape not an MLS IDX push, and (2) nobody built the view + brain wiring to serve it.

---

## Goal

Serve a normalized, honestly-dated per-listing status (active / pending / contingent / coming soon /
sold) from data we already collect and pay for — zero new ingest cost — through the same leaf → thin
pipe → master path every other served fact uses, with a freshness caveat that never overclaims
real-time.

---

## MUST-VERIFY BEFORE DESIGN — do not build on these until Opus probes live (RULE 0.5)

1. **Population %.** `status`/`flag_pending`/`flag_contingent`/`flag_coming_soon` — what fraction of
   `listing_state` rows actually have these populated vs NULL? Precedent in this same catalog:
   `listing_state.days_on_market` is **0% populated**, `listing_active_stats.avg_days_on_market` and
   `listing_active_homes.days_on_market` are **NULL** (`data-roots.md` line 69). A held column is not
   the same as a populated one. UNVERIFIED — live SQL count before anything else.
2. **`status` string vs `flag_*` booleans — do they agree?** If `status='active'` while
   `flag_pending=true` on the same row (stale scrape, partial write), which wins? Not decided here.
3. **SteadyAPI redistribution terms on status-adjacent fields.** We already pull `mls_number`. Storing
   a field internally and re-serving it publicly (chat answer, MCP fetch, a report page) are different
   acts. crawl4ai `https://docs.steadyapi.com` live (Vendor First rule, global CLAUDE.md rule 1) for
   any redistribution/display restriction on status, MLS number, or pending/contingent fields
   specifically, before this ships to a public surface. Not checked in this session — do not skip it.

If (1) comes back too sparse to be useful, this build still has value **scoped down**: ship "status
unknown" as an honest default rather than silently defaulting to "active," and revisit once
population improves.

---

## What to build (once the above is verified)

1. **One new view**, following the existing `listing_dom` pattern (`data-roots.md` §`listing_dom`,
   `lib/listings/dom.ts formatDom`) — call it `listing_current_status`. Deterministic SQL/view logic
   only, per Brain Factory rule 2 (numbers in code, LLM narrates): collapse `status` + the four
   `flag_*` booleans into one enum per the precedence rule settled in MUST-VERIFY #2, carrying
   `scraped_at` through as the as-of timestamp.
2. **One `data-roots.md` entry** (RULE 0.55 — one root per concept) — mark 🟡 until served end to end,
   cite `listing_state` as base table + `scraped_at` as freshness column, same shape as the existing
   `listing_dom` row.
3. **Wire into the existing `active-listings-swfl` pack/brain**, not a new brain — this is the same
   entity family already served there (`refinery/packs/active-listings-residential-source.mts` per
   `data-roots.md` line 383). Read `refinery/packs/CLAUDE.md` conventions before touching a pack.
   Thin-pipe rule: the leaf emits the normalized fact + as-of date only; master/consumer decides how
   to phrase it, never branches on the raw flags itself.
4. **Freshness caveat, non-negotiable.** Every served status must read "as of [MM/DD/YYYY, from
   `scraped_at`]," never "currently" or "now" — this is a once-daily scrape, not an IDX push. This is
   data protocol v3 rule 2 (freshness token quoted) applied to a new fact, not a new rule.
5. **cadence_registry.yaml** — no new ingest pipeline (status already lands via the existing
   `listing_lifecycle` DAILY sweep); document the new consuming view/root under the existing
   `listing_lifecycle` entry per the brain-first ingest gate.
6. **TDD is mandatory** (RULE 3.5) — write the failing tests named after each failure mode below
   before implementing the view/mapping logic.
7. **Register + vocab** — this file is the stub from `node scripts/new-build.mjs
   listing-status-wire "Per-listing pending/contingent status"`; if the pack emits any new slug in
   its output, register it in `brain-vocabulary.json` in the same commit (pre-push Gate 2).

---

## Failure modes (RULE 3.5 — named before code, not after)

1. **Staleness read as live.** A once-daily scrape shown without a date reads as "current." Guard:
   the freshness caveat in step 4 is structural, not optional — test that every served status string
   carries an as-of date.
2. **Vendor redistribution violation.** Re-serving a status/MLS-adjacent field publicly may breach
   SteadyAPI's terms even though we already store it internally. Guard: MUST-VERIFY #3, blocking —
   do not ship to a public surface until crawl4ai'd.
3. **Sparse-population false confidence.** If population is low (precedent: DOM fields are 0%/NULL
   across three roots), defaulting empty rows to "active" fabricates a status. Guard: explicit
   "status unknown" state, tested, for any row where the source fields are null.
4. **Status/flag disagreement silently resolved wrong.** Guard: MUST-VERIFY #2 decides precedence;
   write the test for the disagreement case explicitly, don't let it fall through unspecified.
5. **Thin-pipe violation.** A downstream consumer re-interpreting raw flags instead of reading the
   leaf's normalized fact reintroduces per-consumer drift. Guard: only the new view/leaf touches the
   raw columns; everything else reads its OUTPUT block.
6. **Overclaiming real-time to the user.** The whole reason this thread exists is a claim about MLS
   currency — shipping this framed as "live status" would repeat the exact overclaim already
   corrected in-session. Guard: copy review against RULE 5 (CLEAN) before ship — no "live," no "now,"
   no "currently" on a daily-refresh fact.

---

## Out of scope (this build)

- Increasing scrape cadence beyond daily to approach real-time. Real cost/value tradeoff (RULE 11 —
  we are not a hyperscaler; daily may already be enough). Separate decision, separate build, only
  after this ships and someone asks for tighter latency.
- A licensed MLS/IDX integration. Different vendor relationship, different legal review, not what
  this plan does.
