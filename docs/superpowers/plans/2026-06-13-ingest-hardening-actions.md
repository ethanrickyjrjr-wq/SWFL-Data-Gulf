# Ingest hardening — action tracker

**This is an action tracker, not a rules doc.** The durable rules live in exactly one
place — **THE BIBLE §0.1 (PROBE FIRST ALWAYS) + §0.2 (the seven standards + enforcement
tags)**. This file only tracks _the work_ of bringing existing pipelines up to those
standards: what's left, who does it, what runs in parallel, and what's done.

**Lifecycle:** when an action ships, strike it (`~~…~~`) or move it to the Done log at
the bottom — same push as the code. A lean tracker that keeps stale rows becomes a second
rules graveyard, and then nobody reads it. Rules are referenced by section number here,
**never paraphrased** (two copies drift; the rotting copy is the one people read).

Origin: the FEMA NFIP fix (2026-06-13) + the re-ingestion-waste audit. Reconciles the
**correctness** axis (BIBLE §0.2 rules 4–5) with the **efficiency** axis (rules 2, 6, 7).

---

## Sequencing facts (measured, not assumed)

- **Dry-run of the Gate-4 block predicate across the whole tree (2026-06-13):** exactly
  **4** `replace` pipelines carry no `ingest.lib.guards` call — `census_cbp`, `faf5`,
  `fdot`, `fl_dbpr_licenses`. `fema` and `fhfa` are already guarded (not flagged). So the
  hook ships in **advise mode**; the block (`BLOCK_REPLACE_WITHOUT_GUARD`) flips to
  `true` **only after those 4 are guarded** and the dry run is clean. (Re-run the dry run:
  it's the node snippet that scans `git ls-files ingest/pipelines` for replace-without-guard.)
- **ArcGIS wide-pull (BIBLE §0.2 rule 6) confirmed in 3 pipelines:** `fdot`, `leepa`, and
  **`fema`** — FEMA has a second `paginate_arcgis(...)` layer pull (`resources.py:249`,
  `pipeline.py:39`) with no `out_fields`, separate from the OData NFIP fetch already fixed.
- **Contention unit = a pipeline's `resources.py`.** One owner per pipeline applies that
  pipeline's {guard + dead-key rename + width fix} together. Audits (read-only) fan out freely.
- The over-frequent crons (`leepa`/`collier_parcels`/`census_cbp`/`fdot` run monthly vs an
  annual source) are idempotent upserts — they corrupt nothing, they just burn runs. Rule 7.

---

## Actions

| # | Action | BIBLE rule | Owner | Parallel? | Status |
|---|--------|-----------|-------|-----------|--------|
| A1 | Non-null guard before the destructive write — ✅ `census_cbp` + `fdot` guarded (assert_min_rows + load-bearing non-null/zero floor). ⛔ `faf5` + `fl_dbpr_licenses` HELD: replace targets MISSING from `data_lake` (open incident) — guarding a broken pull fails loudly; per-touch block protects them | §0.2 #5 | **Sonnet** | by pipeline | ◑ 2 guarded, 2 held |
| A2 | Flip `BLOCK_REPLACE_WITHOUT_GUARD = true` in `check-prepush-gate.mjs` | §0.2 #5 | done | after A1 | ✅ LIVE — post-guard dry run clean (would-block = the 2 held only) |
| A3 | Dead-key audit: non-null % per mapped column on every Tier-2 table → live-verify each 0%/implausible field name vs the vendor → rename in the normalizer | §0.2 #4 | **Opus** adjudicates / **Sonnet** runs per-table | high fan-out, read-only | ◻ open ⚠ lake-MCP slot cap: psycopg/batch, not 25 parallel MCP queries |
| A4 | ArcGIS `outFields` projection (→ `paginate_arcgis_tabular`) for `fdot`, `fema` (the layer pull), `leepa`; add the `out_fields="*"` guardrail to `ingest/lib/arcgis_paginator.py` | §0.2 #6 | **Opus** (owns the shared paginator) | parallel; verify row count holds | ◻ open |
| A5 | `noaa_ghcn_rainfall`: normal run fetches current year only; 3-yr span on `--backfill` | §0.2 #2 | **Sonnet** | parallel (owns noaa) | ◻ open — biggest bandwidth win |
| A6 | `redfin_swfl` + `redfin_collier`: ChunkedEncodingError retry (copy `0021c69`); fix `swfl_search_demand` docstring "weekly"→"monthly" | §0.2 #2 | **Sonnet** | parallel | ◻ open |
| A7 | Over-frequent crons: probe-skip gate **or** monthly→quarterly for `leepa`/`collier_parcels`/`census_cbp`/`fdot` | §0.2 #7 | **Opus** (probe) / trivial (quarterly) | parallel (workflows + new probe script) | ◻ open — quarterly = 5-min quick win |

**Two tracks run concurrently** (Sonnet: A1, A3-runs, A5, A6 ‖ Opus: A3-adjudicate, A4, A7).
Only hard rule: **one owner per pipeline `resources.py`** — `fdot` is Opus's (A4 folds its A1
guard); `noaa` is Sonnet's. Don't double-assign.

**Don't touch (verified clean):** BLS/FRED/Census trailing-window series (revision-safe —
narrowing them breaks revision capture); `collier_parcels` (gold standard); `fhfa`/`faf5`/
`zori`/`zhvi`/`redfin` monolithic-file fetches (no vendor delta API). Recon-only:
`dbpr_sirs_submissions` has a registry entry but no pipeline source under `ingest/pipelines/`.

**Open incidents (HELD — guard/edit blocked by Gate 4 until cleared):** the `replace` targets
of `faf5` (`faf_flows`/`faf_zone_lookup`/`faf_sctg_lookup`) and `fl_dbpr_licenses`
(`fl_dbpr_applicants`) are **MISSING from `data_lake`** (probed 2026-06-13) — they never landed.
Triage the root cause (faf5 Tier-2 never promoted; the DBPR applicants URL likely returns HTML →
`_stream_csv` `[]`) BEFORE adding a guard to or editing those pipelines.

---

## Done log

- ~~A1 (partial): guard `census_cbp` + `fdot`~~ — ✅ 2026-06-13 push 2 (28 pipeline tests green incl. 4 new guard tests). `faf5` + `fl_dbpr_applicants` HELD — replace targets missing from `data_lake`.
- ~~A2: flip Gate-4 block to fail-closed~~ — ✅ 2026-06-13 push 2 (`BLOCK_REPLACE_WITHOUT_GUARD = true`; post-guard dry run clean).
- ~~Fix `.dlt/secrets.toml` (unquoted line 14 broke `tomlkit.parse` → all local dlt dead)~~ — ✅ operator fixed 2026-06-13; `tomlkit.parse` exits 0.
- ~~Promote durable rules into the read-surfaces~~ — ✅ 2026-06-13: BIBLE §0.1 (PROBE FIRST ALWAYS banner) + new §0.2 (seven standards, enforcement-tagged); CLAUDE.md one-hop pointer.
- ~~Extend `check-prepush-gate.mjs` with Gate 4~~ — ✅ 2026-06-13: advise-mode block predicate (exact-string guard detection, `ALLOW_REPLACE_WITHOUT_GUARD=1` override, fail-open) + advise on ArcGIS-wide / OData-no-`$select` / unregistered-cadence (dir-presence only). `node --check` clean; dry-run validated.
- ~~FEMA NFIP: both dead-keys + narrow `$select` + `$top=10000` + ChunkedEncodingError retry~~ — ✅ shipped (`cb2a023`, `0021c69`, `54e349e`).
