# Handoff — wire the active-listings brain to the lifecycle pipeline + automate the daily site refresh

**For:** the next build session (this involves editing `refinery/*` and adding a cron — not run-only).
**Why it exists:** the lifecycle pipeline + tables + aggregate view are built, seeded, and pushed. Two
things remain to make the *site* show this fresher, fuller data: (1) point the live brain at the new
view, and (2) run the pipeline daily so the data stays fresh and the transition signal comes online.

---

## 1. State of play (what's already on `main`)

- **Pipeline** `ingest/pipelines/listing_lifecycle/` — address-keyed state machine over Source B
  (a hosted real-estate listings site; origin lives ONLY in the `LISTING_LIFECYCLE_BASE_URL`
  secret/env, never the repo). crawl4ai HTTP strategy, no browser. **31 unit tests green.**
  - Beats the source's **~3,000-result deep-pagination cap** by partitioning each county into price
    bands (`extract._scan_county`) and unioning by `(region, mls)`. Coverage-guard
    (`coverage_guard.py`) uses the page-printed county total so a truncated pull can't pass as complete.
- **Tables** `data_lake.listing_state` (current state, MERGE on `(source_name, address_key,
  sale_or_rent)`) + `data_lake.listing_transitions` (event log, idempotent via
  `uq_listing_transition`). Migration `migrations/20260627_listing_lifecycle.sql`.
- **Seeded (live DB):** Lee **7,412** · Collier **2,749** · Hendry **298** = **10,459 active**, all
  rows currently `seed=true` transitions (day-0 baseline, excluded from flow counts).
- **Aggregate view** `data_lake.listing_active_stats` (`docs/sql/20260627_listing_active_stats.sql`) —
  region / county / ZIP GROUPING SETS, **identical column shape** to the old Source-A view, so the
  consuming connector swaps with a one-line view-name change. **`avg_days_on_market` is hardcoded
  `NULL` (open column) on purpose** — see §4.
- **The live `active-listings-swfl` brain is UNCHANGED** — it still reads Source A
  (`data_lake.active_listings_residential_zip_stats`). Wiring it over is step §2.

---

## 2. Wire the brain (needs the operator's flip decision first)

The live brain reads Source A today. Source A is **itself hitting the same cap** this pipeline
defeats — it sees only **Lee 2,395** (true inventory ≈ 7,412), Collier 2,509, Charlotte 2,232,
Sarasota 1,655, Hendry 185, and carries a real MLS days-on-market (~193-day region avg). The new
view has the fuller Lee/Collier/Hendry but **no Charlotte/Sarasota** (deferred 2026-06-27) and **open
DOM**. So the swap is a real trade — get the operator's pick before touching the connector:

- **(a) Full swap.** Repoint the connector to `listing_active_stats`. Lee jumps 2,395 → 7,412;
  Charlotte + Sarasota (3,887 listings) **go dark**; DOM reads empty until §4 lands. Simplest.
- **(b) Bridge (recommended).** Repoint Lee/Collier/Hendry to the new view, keep Source A running for
  **only** Charlotte + Sarasota. No county goes dark, Lee gets corrected, the bridge keeps a real DOM
  number for C/S. More wiring (a UNION view, or a connector that reads both). Do NOT pre-build this
  until the operator picks it.
- **(c) Hold.** Leave the live brain on Source A; let the new pipeline keep ticking until DOM has
  accumulated and C/S are seeded, then swap clean.

### Exact steps for (a) — the minimal swap
1. `refinery/sources/active-listings-residential-source.mts`: change
   `const VIEW = "active_listings_residential_zip_stats"` → `const VIEW = "listing_active_stats"`.
   (The `ResidentialStatRow` type already matches the new view's columns 1:1 — no other edit there.)
2. `refinery/packs/active-listings-swfl.mts`: the empty-state guard message + the 0-row caveat name
   the old pipeline (`source_name='active_listings_seed'`, `python -m ingest.pipelines.active_listings…`)
   — update them to the lifecycle source. The `if (region.avg_days_on_market != null)` guard already
   suppresses the headline DOM metric correctly when the view returns null (see §4); leave it.
   Trim the Charlotte-specific land caveat if Charlotte is no longer in scope.
3. Refresh the fixture `refinery/__fixtures__/active-listings-residential.sample.json` to a small slice
   of `listing_active_stats` so `env.source === "fixture"` runs match the live shape.
4. Verify locally: `bun run refinery -- active-listings-swfl --target-only` → eyeball the OUTPUT
   (Lee 7,412, open DOM, by-county/by-ZIP tables). The pack is a pure reporter (skipSynthesisAgent /
   skipTriageAgent) so `--target-only` won't hang on LLM egress.
5. **Gates before push** (RULE 1): touched a pack → Gate 5 fires — `bun test
   refinery/packs/active-listings-swfl.test.mts` + `bun test refinery/packs/catalog.test.mts` (scope
   mirror must stay identical) + `bun refinery/tools/check-vocab-coverage.mts --all` (0 orphans). Then
   `bun run refinery -- master --target-only` (pack still in both `sources[]` and `input_brains[]`).
6. SESSION_LOG entry → `node scripts/safe-push.mjs` (explicit paths) → after deploy, live-verify the
   brain via `swfl_fetch` / `/api/b/active-listings-swfl`.

> This is the one genuine **live-brain `key_metrics` change** → RULE 1 "ask first." Do not push it
> without the operator's a/b/c pick. Retiring Source A's pipeline is a *separate* later step and only
> after the chosen wiring is proven live (and, for b, never — Source A stays as the C/S bridge).

---

## 3. Automate the daily refresh (the "updating site with fresh data" half)

The brain only stays fresh — and the **transition signal only comes online** — if the pipeline runs
daily. A daily run (1) merges new/changed listings into `listing_state`, (2) ticks `days_in_state`,
(3) appends the **real** transitions: a listing that left active → `holding`; a price change →
price-cut; a holding listing that reappears → `back_on_market`; a brand-new address → `new`. **The
first real (non-seed) diff appears on the second run** — until then every transition is `seed=true`.

- **Cron is NOT built yet** (the plan parks it). Ship it as: `.github/workflows/listing-lifecycle-daily.yml`
  + a `cadence_registry.yaml` entry under `not_yet_running:` (graduate to `pipelines:` only after
  green runs), each per the pipeline-freshness standard (`docs/standards/pipeline-freshness.md`) with
  a `--dry-run` path.
- **Local-first, mandatory.** The band-partition walk is request-heavy; the **runner-IP WAF is
  unproven at this volume**. Prove the daily run from home IP for ≥3 days, watch for `[skip]`/`[warn]
  403`, before adding any `schedule:`. When you do schedule, **stagger per county** (Source A runs its
  counties at 09/12/15/18 UTC for exactly this reason) and never drop `_PAGE_DELAY` below 1.5s.
- **Operator action:** the cron needs the origin — `gh secret set LISTING_LIFECYCLE_BASE_URL -R
  ethanrickyjrjr-wq/brain-platform` (run via the `!` prefix). The pipeline already errors loudly if
  it's unset.
- **Idempotency is proven** — a double-fire appends 0 new transitions (`uq_listing_transition`). The
  `--dry-run` and `--county` flags exist for safe manual runs.
- **Run env:** `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe` (crawl4ai + bs4 + psycopg; DB creds
  auto-loaded from `.dlt/secrets.toml`). Invoke: `python -m ingest.pipelines.listing_lifecycle.pipeline`.

---

## 4. DOM is an OPEN column — do not fake it (operator decree 2026-06-27)

Source B's cards carry **no market days-on-market**, and our `days_in_state` tick is **not** true DOM
for the existing inventory: we can't see how long a listing sat before our first scan, so the tick
undercounts for the bulk (>half) of seed listings. So we neither fake it (0/tick-as-DOM) nor hide it
— `listing_active_stats.avg_days_on_market` is hardcoded `NULL`, a real empty slot that still renders
as an empty column in the brain's detail tables. **Fill it when a real source lands:**
- **Detail-page list date** *(likely path, NOT yet crawl4ai-verified)* — the per-listing detail page
  almost certainly carries a "listed on" / "days on site" field even though the card doesn't. One
  fetch per listing. Same detail-fetch lane as full photo galleries → build them together. **Verify
  the field exists via crawl4ai before building on it** (RULE 0.4).
- **Net-new listings self-populate** — for any address we first see the day it appears, `days_in_state`
  *is* its true DOM going forward. The tick keeps accumulating in `listing_state` for this.
- **Bridge MLS DOM** — if (b) keeps Source A for C/S, it keeps feeding a real DOM for those two.

---

## 5. Guardrails (non-negotiable)

- **Name-clean.** No company / portal / vendor / board / "MLS"-"IDX" identity strings anywhere in the
  repo. Sources are **Source A** / **Source B** generically; real origin lives ONLY in
  `LISTING_LIFECYCLE_BASE_URL`. (CSS selectors like `si-listing` and the `mls` field are functional
  source markup, kept — they reveal no brand.)
- **crawl4ai only**, never Firecrawl; `*crawl4ai*` + scratch files never `git add`-ed.
- **Brain-first** — pack + every emittable vocab slug land in the SAME PR as any new ingest.
- **No-invention four-lane** — every number is a real scraped value; `state` is the source's own
  signal; motivation is `[INFERENCE]` + falsifier only.
- **Never push without operator confirmation.** SESSION_LOG entry every push. `node scripts/safe-push.mjs`,
  explicit paths only, never `git add -A`.
- **Sarasota + Charlotte** seeding is parked — see `docs/handoff/2026-06-27-source-b-county-seed-handoff.md`.
