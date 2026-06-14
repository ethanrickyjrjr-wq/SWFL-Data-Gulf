# §F — Crisp ZIP rows for ZIP-native brains

**Phase 3 · ~1 day per pack · depends on: §C contract (`detail_tables` grain="zip") · status: not started**
Read [`README.md`](./README.md) §0 first. **Two independent Claudes** — one per pack.

---

## Goal
Today rentals + permits emit per-ZIP data only as `key_metrics` slugs for the *extreme* ZIPs
(top heating/cooling, top-AAL). That makes them branch-(b) hits for a handful of ZIPs and
branch-(c) fallbacks for the rest. Emit full per-ZIP `detail_tables` so they become branch-(a)
true-ZIP rows for **every** ZIP they hold — the same shape housing-swfl already ships.

## §F-1 — `rentals-swfl`
- File: `refinery/packs/rentals-swfl.mts`. It already loads the full `ZoriZipRow[]` via
  `zoriSource`. Emit a `detail_tables` entry `{ id:"rentals_by_zip", grain:"zip", … }` with **ALL
  ZORI ZIPs**, not just `topHeating ∪ topCooling`. Mirror housing's `housing_by_zip` table shape.

## §F-2 — `permits-swfl` (Lee only)
- File: `refinery/packs/permits-swfl.mts`. Emit a `detail_tables` entry `{ grain:"zip", … }` for
  **Lee permits only** — Collier permits have **no `zip_code`** column (verified caveat). A
  Collier ZIP must stay branch-(c) with a corridor/county label; the Lee table's `coverage_label`
  / note says "Lee permits only."

## Critical: add ROWS, not new slugs
- Detail-table rows add **no metric slugs** (verified: `refinery/vocab/patterns.mts`
  `raw_slug_patterns` machinery applies to `key_metrics`, not detail rows).
- `permits-swfl`'s existing per-ZIP slugs are **literal `slug_index` entries, not
  pattern-registered** — do NOT add new per-ZIP slugs here; add detail rows.
- After the change, run `bun refinery/tools/check-vocab-coverage.mts --all` (the `--all` form is
  mandatory) — it must report 0 orphans.

## Acceptance
- After §F-1: `assembleLocationDossier` returns a branch-(a) true-ZIP rentals row for an
  ordinary (non-extreme) SWFL ZIP.
- After §F-2: same for a Lee permits ZIP; a Collier ZIP still gets the corridor/county-labeled
  permits line (no fabricated ZIP).
- `bun refinery/tools/check-vocab-coverage.mts --all` → 0 orphans, in the same commit as the pack.
