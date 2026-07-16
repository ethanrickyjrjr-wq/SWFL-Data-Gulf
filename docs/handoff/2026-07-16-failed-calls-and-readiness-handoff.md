# HANDOFF — failed-call resilience + known readiness items (07/16/2026, for a fresh Fable 5)

Operator directive (07/16/2026, late): "tackle some of the how-far-off issues we currently know…
make sure we have plenty in the tank for api calls so we don't lose people to failed calls…
get started on what we can and tackle the hidden problems tomorrow once we audit it all."

**Your mission: make API calls stop failing silently and stop wasting quota — the checks below
are your work list. The FULL readiness audit is NOT yours; it runs tomorrow under the
`beta_readiness_and_offer` check. You feed it, you don't run it.**

Every claim in this doc is a pointer, not a fact — verify against code before building
(RULE 0.5; inherited plans are hypotheses). Check descriptions quoted here were live in the
ledger on 07/16/2026; re-read them with `node scripts/check.mjs list`.

---

## 0. COLLISION MAP — read this before touching anything

Multiple sessions worked this repo today (five parallel SteadyAPI research sweeps + a desk/
marketing session + at least one live build session). Do not collide:

- **Live uncommitted foreign work (as of 07/16 late):** `ingest/cadence_registry.yaml` and
  `ingest/pipelines/market_heat_swfl/constants.py` had uncommitted edits from a concurrent
  session (likely working `ingest_market_heat_swfl_column_gap_fill`). Run `git status` FIRST;
  never touch a file with foreign uncommitted edits; if your work overlaps, use a worktree
  (RULE 1.5: `node scripts/worktree.mjs new <label>`). Commit with explicit paths only
  (`git commit -- <paths>`), never `git add -A`. NO push without operator confirmation.
- **The round-5 synthesis track is NOT yours.**
  `docs/superpowers/specs/2026-07-16-round5-synthesis-priorities-design.md` sequences 13 checks
  across today's four research sweeps (zero-cost wins, deadman-switch/schema-fingerprint
  guardrails, three new sources, UX Tier-1 builds). Another session/operator pick works that
  sequence. You take ONLY the failed-calls track below — which that spec does not sequence.
  Bonus: its step-7 gated track (`assistant_property_urgency_tax_history_wiring` + lower-priority
  endpoints) is explicitly blocked on YOUR items P0-A/P0-B resolving — you unblock them.
- **The marketing/Insiders track is NOT yours.**
  `docs/superpowers/plans/2026-07-16-marketing-launch-plan.md` (+ its 07/16 addendum: Issue 001
  distribution, beta tease) and `_FABLE5/` are the desk session's lane.
- **Exception to the market_aggregates fence:** `market_aggregates_details_dropped_fields` is in
  the synthesis's step-1 zero-cost wins — leave it there; don't duplicate it even though it's
  SteadyAPI-adjacent.
- Before opening ANY new check, dedupe against the ledger (~366 rows was today's count).

## 1. Context — what "the tank" means and today's research landscape

The product's user-facing moments ride external calls: on-demand comps + listing detail
(SteadyAPI Real Estate endpoints via `lib/listings/steadyapi.ts`), authored builds (Anthropic,
spend-guarded via `refinery/agents/anthropic.mts` / `ingest/lib/api_usage.py`, daily ceilings),
sends (Resend). A failed call in a user's build session = a lost person; a failed call in a
nightly scan = silently missing data that degrades every later build. Today's five research
sweeps (all in `docs/steadyapi-research/2026-07-16-*.md`) burned SOCIAL-endpoint quota freely
with zero 429s — but the REAL-ESTATE endpoint surface (a different key/tier: `PHOTOS_API`) is
throttled and its quota is UNKNOWN. Don't conflate the two surfaces; the social results say
nothing about the comps tank.

Read before coding (in order):
1. `docs/handoff/2026-07-07-steadyapi-full-scope-handoff.md` — endpoint/scope map + county-seed rationale
2. `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` §Basics — applies to EVERY endpoint: 15 req/s
   global limit, browser User-Agent REQUIRED (default Python UA → 403 before auth, non-JSON
   body; a 403 is NOT a key problem until UA is ruled out), response envelope, error shapes
3. `docs/handoff/2026-07-05-vendor-note-steadyapi-reddit.md` — quirk catalog pattern
4. RULE 0.4: crawl4ai the live SteadyAPI docs for the real-estate endpoints' documented
   rate/retry guidance before designing the backoff — do not code from this doc's memory.
   crawl4ai only, never Firecrawl. Never surface "SteadyAPI"/"realtor.com" in any user output.

## 2. The work list (priority order)

### P0-A. Settle the real-estate quota + the throttled key (checks: `steadyapi_quota_unknown`, `steadyapi-429-rate-limited`)
- Quota check says: no rate-limit headers; a 200-req/month pricing row may or may not be the
  Real Estate API; settle from the ACCOUNT DASHBOARD before any bulk call. The dashboard is
  operator-owned — ask Ricky to read it (suggest he runs the login himself or screenshots the
  plan page; `!`-prefixed commands run in his session). Do not guess the number.
- 429 check says: new PHOTOS_API key authenticates but gets throttled, scans discarded. Diagnose
  in order: UA quirk ruled out? → concurrent scans stepping on the 15 req/s global limit? →
  plan-level monthly cap exhausted? Instrument before concluding.
- Output: the actual quota figure + current burn rate, written to a short findings file under
  `docs/handoff/` — this is the single most important input to tomorrow's audit.

### P0-B. User-facing comps client: retry + graceful degrade (probable NEW check — open it)
- `lib/listings/steadyapi.ts` has ZERO occurrences of retry/backoff/429 handling (grep-verified
  07/16). Inventory every consumer (build path, chat/comp lane, address-spine builds,
  listing-detail) and answer: what does the USER see today when a call 429s or times out?
- Build: bounded retry with jittered backoff (respect 15 req/s; honor the UA rule), then a clean
  degrade that never kills a build — comps section drops with an honest note, never a dead page,
  never an invented figure (four-lane rule: fill from the next lane or omit, never refuse the
  whole build). Test the failure paths, not just the happy path.
- Mind memory landmine: SteadyAPI returns NO property-type field on /search — don't "fix" that
  while in there (`reference_steadyapi-no-property-type-field`, superseded questions are closed).

### P0-C. Scheduled-scan resilience (check: `steadyapi_429_no_retry`)
- `fetch_steadyapi_city` (`ingest/pipelines/listing_lifecycle/extract_api.py`): no retry on
  non-200; a single 429 on any page failed Lee's AND Collier's entire scans on 07/07 (both
  scheduled runs, zero rows each). Add bounded retry/backoff + partial-progress semantics so one
  throttled page can't zero a county. Read `ingest/CLAUDE.md` first (RunBudget, guards, Gate 4);
  respect `classifyTermination`'s TIMEOUT never-retry money guard — don't blanket-retry what the
  doctor deliberately refuses to retry.

### P1-D. Call economy: county-level seed migration (check: `steadyapi_migrate_city_seed_to_county_level`)
- listing_lifecycle sweeps city-by-city while rentals/market_aggregates already use county-level
  location strings — county-level is 1 call vs N AND catches ~4% of Lee listings the curated
  city list drops. Fewer calls, more coverage: directly grows the tank. Design notes already in
  the 07/07 full-scope handoff. This is a data-pipeline change — probe first, dry-run, verify
  row counts, and mind the brain-first + freshness rules in `ingest/CLAUDE.md`.

### P1-E. Protect what the calls already bought (three known data-loss bugs)
- `listing_state_streetless_address_key_collision` — 216 active rows share street-less merge
  keys (city+ZIP), so listings silently overwrite each other. Needs a real identity fallback
  (property_id in the key, or reject street-less rows). Every lost row is a paid call wasted.
- `listing_state_property_type_stuck_buckets` — 4,361 rows (12.4%) outside the real enum;
  deterministic backfill re-sweep, NOT an ML problem. Full diagnosis in the check text.
- `source_totals_migration_apply` (OVERDUE Jul 13) — the source-vs-landed telemetry table is
  applied but writing 0 rows. This ledger is exactly the "how much tank did we use vs bank"
  instrumentation tomorrow's audit needs — find out why it's empty.

### P2-F. Domain-verify UI (only if the above is done or blocked)
- Backend root: `lib/email/sender-config.ts` (built, zero UI — verify that claim first). This is
  a NEW feature surface → RULE 3.5 brainstorm before building, and it has operator sub-items
  parked in `platform_postal_address_operator` (real postal address, DIGEST_SENDER_ADDRESS,
  Resend plan) plus a deliverability coupling in `tracked_links_domain_alignment_on_custom_sender`
  (wrapped links must ride the sender's domain or skip wrapping). If you only get to a design
  doc + punch list, that's still a win for tomorrow.

## 3. Explicitly NOT yours
- The full readiness audit (`beta_readiness_and_offer`) — tomorrow, with the operator.
- Payments/Stripe wiring — operator decisions pending; don't scaffold ahead of them.
- Anthropic spend caps/ceilings — guards exist on every call path; changing limits is an
  operator call. You may REPORT headroom facts if you find them; change nothing.
- The synthesis-sequenced builds, the marketing plan, Insiders composition (see §0).
- Any live SEND of anything. Ever. Operator-gated.

## 4. Session discipline (non-negotiable, hook-enforced)
- SESSION_LOG entry before any push; push only with explicit operator confirmation (a question
  is not authorization). `node scripts/safe-push.mjs` when authorized — and check for foreign
  commits it would carry (ASK before bundling).
- Every parked finding → a `checks` entry the same session (RULE 2.4). Close checks you finish:
  `node scripts/check.mjs close <key>`.
- Migrations: run directly (creds `.dlt/secrets.toml`, via Bun.SQL — psql not installed),
  idempotent, verify row counts.
- Verify TS with `bunx next build` (not npx tsc); Python suites via the repo's pytest lanes.
- Findings for tomorrow's audit land in a dated file under `docs/handoff/` — structured, cited,
  no invented numbers (four-lane rule applies to internal docs too).

## 5. Definition of done for this handoff
1. Quota figure + burn rate settled and written down (operator-assisted) — or a documented
   blocker naming exactly what the operator must fetch.
2. No user-facing build can die from a single throttled comps call (tested degrade path).
3. No scheduled county scan can zero out from a single 429 (tested retry path).
4. The three data-loss checks closed or honestly re-scoped with evidence.
5. County-seed migration landed or a verified reason it shouldn't land.
6. A findings file for tomorrow's audit: what the tank actually holds, what burns it, what the
   failure UX is on every external-call surface you touched.
