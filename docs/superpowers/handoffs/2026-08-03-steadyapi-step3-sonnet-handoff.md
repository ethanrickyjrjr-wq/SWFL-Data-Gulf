# HANDOFF — SteadyAPI Step 3 typed families (for Sonnet, 08/03/2026)

**Mission:** parse the three typed families OUT of the 17,875 raw bodies we already own. ZERO paid
calls. Build order **A → B → C, one family per PR**. Operator decree binding this work (08/02,
verbatim in playbook §STEP 3): "JUST GET EVERYTHING DONE CORRCTLY BEFORE WE BRING IN. THIS IS NOT
A RUSH."

**The one document that rules this build:**
`docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md` §STEP 3 — authority + validation
design is LOCKED there. This handoff adds the live-verified state and the traps; when in doubt the
playbook wins.

---

## 1. STATE — LIVE VERIFIED 08/03/2026 (read-only SQL against prod, this session)

- Steps 1 + 2 are **DONE**. `data_lake.steadyapi_property_history_raw` holds **17,875 bodies**,
  newest `fetched_at` 08/03 01:11 UTC. `undated_active_sale` = **0** (DOM backfill fully de-floored;
  check `dom_backfill_listed_date_live_verify` closed with this evidence).
- Typed tables `steadyapi_listing_events` / `steadyapi_tax_history` / `steadyapi_property_permits`:
  `to_regclass` NULL for all three. **You start clean.**
- Family coverage (denominator 17,875 bodies):
  - **A** `property_history[]` — 17,859 bodies non-empty (99.9%) · **235,383 event rows**
  - **B** `tax_history[]` — 16,514 bodies non-empty (92.4%) · **273,051 year-rows**
  - **C** `building_permits[]` — 12,946 bodies non-empty (72.4%) · **79,281 permit rows**
    (county spines for comparison: `lee_building_permits` 303 rows · `collier_building_permits` 4,975, stale 04/30/2026)

## 2. ⚠️ TRAP #1 — THE JSON ENVELOPE (cost this session a wasted probe; don't repeat it)

The stored jsonb is the FULL response envelope `{meta, body}`. Every family array lives at
**`body -> 'body' -> '<family>'`**, NOT top-level. `body->'property_history'` returns NULL on all
17,875 rows — a naive parser reads the entire table as EMPTY and nothing errors. Correct paths:

```
body->'body'->'property_history'
body->'body'->'tax_history'
body->'body'->'building_permits'
```

`body->'body'->'statistics'` = vendor-computed rollups (validation-only, never a root).
`meta.property_id` duplicates the PK. Put a non-empty-parse assertion in each family's tests so an
envelope change fails loud instead of landing zero rows green.

## 3. FIELD INVENTORY (from the 64-field census — full doc:
`_RESEARCH/data-and-ingest/2026-08-02-property-tax-history-full-scope.md`, gitignored, Read by path)

- **A. `property_history[]` element:** `date, event_name, price, price_change,
  price_change_percentage, price_sqft, days_after_listed, source_name, listing{}` where
  `listing.* = listing_id, list_price, status, list_date, last_status_change_date, last_update_date`.
  `source_name` = originating MLS board (e.g. "CoconutCoast"). `days_after_listed` = vendor's own
  per-event DOM.
- **B. `tax_history[]` element:** `year, tax_amount, assessment{total, building, land},
  market_value{total, building, land}` — ~9-year series per property.
- **C. `building_permits[]` element:** `permit_type, project_type_1, project_type_2,
  project_type_3, project_name, effective_date, status`.
  **TRAP #2:** `effective_date` = `"Mar 8, 2021"` — human string, NOT ISO (every other date in the
  body is ISO). Parse explicitly with a test fixture or it lands as garbage.
- Census note "Collier, where our LEEPA lane does not reach" is STALE — playbook corrected it:
  `collier_parcels` IS the FDOR pull; Collier valuation is covered. Playbook wins.

## 4. AUTHORITY DESIGN (locked — do not re-litigate, ratify in data-roots on each ship)

- **THE COVERAGE LAW:** Steady rows exist only for probed (listed/sold) properties. A Steady table
  is NEVER the authority for a county-wide statistic; county sources stay authority where they
  exist. Steady = per-property depth + gap-fill + validation. Lee dominates row counts by design
  (book: Lee 24,548 · Collier 9,142 · Hendry 1,214) — expected asymmetry, not a defect. Each
  consuming pack carries this caveat in its OUTPUT.
- **A → `steadyapi_listing_events` (sole source, IS the root).** Serves the 08/01 listing-status
  wire design + should-i-sell. The computed `listing_dom` view STAYS the DOM root; vendor
  `days_after_listed` is a VALIDATION column, never a second root.
- **B → `steadyapi_tax_history` (NOT a valuation root, ever).** Assessed/market value authority
  stays `leepa_parcels` / `collier_parcels`. B's two jobs: (1) third cross-source agreement family
  — `steady_tax ↔ county valuation` contract in `ingest/quality/quality_registry.yaml`, same
  two-class discipline as leepa↔fdor; (2) intended home for ANNUAL TAX PAID (`tax_amount` by year —
  no built root exists; `fetchPropertyTaxAnnual` is a stub, check `should_i_sell_property_tax_source`).
  Validate vendor `tax_amount` against a known county tax bill BEFORE serving; caveat vendor annual
  tax ≠ county bill.
- **C → `steadyapi_property_permits` (root for "permits on THIS probed property").** County spines
  remain the area-wide lane; serves but does NOT close `permits_spine_thin_collier_missing`.
- **JOIN LANE (B/C contracts):** Steady keys on `property_id`/`address_key`; county parcels on
  strap/`parcel_id` + site address. Address matching burned us before (Marco Island 0/360, 06/30).
  MEASURE the match rate on the Lee overlap FIRST; contracts assert only on matched pairs and report
  match rate as its own coverage metric.

## 5. SHIP DISCIPLINE — every family PR contains ALL of (brain-first gate is hook-enforced)

1. `superpowers:brainstorming` + named failure modes (RULE 3.5), then
   `node scripts/new-build.mjs <slug> "<label>"` to register the build.
2. TDD (`superpowers:test-driven-development`) — failing tests first, named after failure modes,
   in `ingest/tests/` next to the existing listing_lifecycle suites. Include: envelope-path
   non-empty assertion; idempotent re-parse (run twice, same row count); C's human-date fixture.
3. Migration — idempotent SQL via `new Bun.SQL` (psql NOT installed), `sslmode=require`, creds
   `.dlt/secrets.toml`, ending `GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
   NOTIFY pgrst, 'reload schema';` (pattern: `migrations/20260802_steadyapi_property_history_raw.sql`).
4. The parser (SQL out of stored jsonb — zero paid calls) — idempotent, re-runnable, one-to-many
   stays in its OWN table, NEVER onto `listing_state`.
5. Consuming `PackDefinition` in the same PR (brain-first ingest gate) + vocab registration if new
   slugs (Gate 2) — with the coverage-law caveat in its output.
6. Quality-registry contract (B and C; A has no county twin — its validation column is internal).
7. `ingest/cadence_registry.yaml` entry + `docs/standards/data-roots.md` ratification: flip the
   family's 🔴 to 🟢 in the `steadyapi_property_history_raw` section (~line 398).
8. SESSION_LOG entry before push · `node scripts/safe-push.mjs` · explicit paths only · close/open
   checks same session (RULE 0.8).

## 6. ENVIRONMENT — read before you start

- **Crons are OFF by design** (`Nightly Chain` + `ingest-listing-lifecycle` disabled;
  `engine_enabled_kill_switch_owed` still operator-owed). Step 3 needs NO crons — parsing is
  one-shot against stored bytes. Re-enable is Step 5, NOT yours.
  **ANNOTATED 08/04/2026 (not rewritten — this line was already stale when written):**
  `engine_enabled_kill_switch_owed` was closed (`state=done`) same day it was opened, 08/02/2026 —
  it asked the operator to turn the flag OFF, which happened. The re-enable obligation this
  paragraph is actually pointing at lives under a distinct check, `engine_enabled_off_all_crons_dark`
  (opened 08/03/2026), which was still open as of this annotation.
- **Step 4 is NOT yours either** — scalars onto `listing_state` (`days_after_listed` etc.) carry
  the `_ENRICH_ONLY_COLS` twice-fired gun (wiped `listed_date` 07/19, `baths` 07/26). Step 3's
  own tables don't touch that merge path; that's the point of separate tables.
- **A parallel user-data lane is in flight on main** (`lib/listings-user/`, user_listings
  migrations, `app/api/b/[slug]/route.ts` edge-cache). Don't touch those files; commit with
  explicit paths only; if your session overlaps a live one, worktree per RULE 1.5.
- **Provenance:** user-facing `source_tag`/citations say **"realtor.com"**, NEVER "SteadyAPI".
- Tracking check: `steadyapi_step3_typed_families_spec` (open). Related open checks:
  `should_i_sell_property_tax_source` (B), `permits_spine_thin_collier_missing` (C, stays open),
  `marco_condo_price_cluster_unverified` (separate Sonnet triage item, not part of Step 3).

## 7. FIRST HOUR (family A)

1. Read playbook §STEP 3 + this handoff + `data-roots.md` ~line 398 section.
2. Brainstorm family A per RULE 3.5 (schema: one row per (property_id, event) — pick the event
   identity key deliberately; events have no vendor ID, so dedupe key design IS the brainstorm's
   hard question) + failure modes + `new-build.mjs`.
3. Write the failing tests (envelope path, idempotency, event-key stability).
4. Migration + parser + pack + registry + data-roots flip, one PR.
5. Evidence to paste on close: typed row count vs the 235,383 expected events, and one spot-check
   property traced raw → typed.
