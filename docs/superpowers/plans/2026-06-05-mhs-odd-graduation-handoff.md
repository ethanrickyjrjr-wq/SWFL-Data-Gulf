# MHS → ODD Graduation — Build Handoff

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:executing-plans` (or
> `superpowers:subagent-driven-development`) to implement this task-by-task. Steps use
> checkbox (`- [ ]`) syntax. **Brain pack OUTPUT-shape / key_metrics-math changes need an
> Opus diff-review before push (CLAUDE.md RULE 1).**

**Status:** READY TO BUILD — operator decisions locked, drift checks cleared (2026-06-05, Opus 4.8 session).
**Origin:** the MHS (Maxwell, Hendry & Simmons) 2026 CRE Data Book — the **first live Operation Dumbo Drop graduation** (manual PDF → lake).
**Recipe internals (authoritative):** `docs/littlebird-notes/2026-06-05.md` (CT's geometry/extraction spec — Bonita regression, dual-signal absorption sign, 3-recipe schema). **This file does NOT re-spec the extraction — it adds the locked decisions, the verified constraints, the ODD scaffold, and the owner split.**
**Trackers:** checks `odd_scaffold_ready`, `ian_retrodiction_demo`. ODD standard: `docs/superpowers/plans/2026-06-05-operation-dumbo-drop.md`.

---

## 0. Locked operator decisions (do not re-litigate)

| #     | Decision         | Locked value                                                                                                                                    | Build consequence                                                                                                                                                                                                                                          |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Period-stamp     | **Option C — manual `report_date` param at ingest.**                                                                                            | **Reject any absorption row with `prior_12mo_ending = NULL`.** Undated absorption is useless for a rolling-window brain.                                                                                                                                   |
| **2** | Charlotte County | **Include ONLY as a Charlotte-FIPS / Charlotte-geo slug. NEVER fold into Lee/Collier** (geometry-space mixing is forbidden). Else exclude.      | New canonical slug mapped to Charlotte County FIPS (12015) — own geo. Not a CRE-submarket alias of any Lee/Collier corridor.                                                                                                                               |
| **3** | MHS cadence      | **ANNUAL** — verified Vendor-First via `mhsappraisal.com/market-trends-2026` (2026 Data Book, published **2026-03-13**, PDF under `/2026/03/`). | `prior_12mo` windows are **NON-OVERLAPPING** year-over-year — no inter-report overlap-dedup needed. Cadence entry `cadence_days: 365`. The internal "QTD 2026" / "Prior 12 Months" labels are snapshots _inside_ the annual book, not a quarterly cadence. |

---

## 1. Drift checks — VERIFIED this session (constraints the build MUST honor)

- **#1 — Ian outcome resolver is price-free. ✅ CONFIRMED.** `refinery/packs/properties-lee-value.mts:106-162` computes sale-velocity from `sales_count` per `sale_year` (z-score on counts; `velocityCurrentPer1k = currentSalesCount/totalParcels*1000`); SOH-gap uses assessed values (`soh_gap_median_pct`). The parcels query (`buildLeepaSource`, line 182) selects `folioid, just_value, taxable_value, cap_difference, last_sale_date, use_code` — **`last_sale_amount` is NOT selected and never enters velocity math.** It exists only as a latent `ParcelRaw` type field (line 58). **CONSTRAINT:** the Ian resolver reuses this count/date path — **NEVER read `last_sale_amount`.** (Whether that column is NULL or populated is therefore moot for the demo — see open item O1.)
- **#2 — MHS↔MarketBeat double-count risk. ⚠️ REAL — must fix before CRE graduation.** `cre-swfl.mts` reads `marketbeatSwflSource` as _one row per submarket per latest verified quarter_ with **no cross-source dedup** (none needed today — MHS isn't wired). `source_tag` guards skill-score contamination, **NOT** underlying-row double-count. **CONSTRAINT:** when MHS CRE-submarket rows land, the consumer MUST dedupe by **(submarket, period)** before any median, with an explicit source-precedence rule — see open item O2 (Opus/operator decision).
- **#3 — Same-PR consumer rule satisfiable. ✅.** All three consumer packs already exist: `refinery/packs/{cre-swfl,permits-swfl,rentals-swfl}.mts`. Each MHS recipe ships its ingest + the pack edit that consumes it in the **same PR** (brain-first / no-Tier-2-without-consuming-brain).
- **#4 — skill-baseline denominator now cited. ✅ DONE this session.** `refinery/lib/backtest/skill-baseline.mts` denominator docstring now cites the persistence-null lift methodology (`docs/superpowers/plans/2026-06-03-row-tier/HANDOFF.md` item 2) + gating check `flywheel_backtest_decision_function`. Tests 29/29.

**Ledger correction (do not re-split):** `b5d92e2` is **one revert unit** — `refinery/lib/backtest/` + the COND 1/2 polarity audit + `brain-vocabulary.json`/`loader.mts`/`grade-config-polarity.test.mts` landed together.

---

## 2. The ODD scaffold — every MHS recipe ships all 5 seams (mirror `marketbeat_swfl`)

Canonical template: `ingest/cadence_registry.yaml` lines ~451-462 (`marketbeat_swfl`, parked). For **each** of the 3 recipes (CRE-submarket, Permits, Multi-Family):

1. **Empty-tolerant consumer** — pack reads the MHS source and tolerates zero rows (cre-swfl already does this for MarketBeat; replicate for permits-swfl + rentals-swfl). Ships green before any drop.
2. **Parked cadence entry** under `not_yet_running: / parked: true`, **probe-excluded**:
   ```yaml
   - name: mhs_<recipe> # e.g. mhs_cre_submarket / mhs_permits / mhs_multifamily
     parked: true
     lane: tier-2
     cadence_days: 365 # ANNUAL — MHS Data Book, ~Q1/March release (verified 2026-06-05)
     tolerance_multiplier: 1.5
     freshness_table: data_lake.mhs_<recipe>
     freshness_column: _ingested_at # confirm the DDL uses _ingested_at, not inserted_at (marketbeat trap)
     expected_rows_min: 1
     note: "DORMANT — Operation Dumbo Drop. Source: MHS annual CRE Data Book (mhsappraisal.com, manual PDF, geometry-extracted). Graduation = move to pipelines: after first manual drop. Consumer <pack> empty-tolerant. Period-stamp Option C (manual report_date; reject NULL prior_12mo_ending)."
   ```
3. **Tier-1 cold target first** — manual drop lands as Tier-1 Supabase Storage Parquet; promotion to Tier-2 `data_lake.*` only with the consuming pack (already in the same PR).
4. **Provenance** — `source_tag: "odd_extract"` on every row, **plus** a distinguishing provenance column (`source_name: "mhs_2026_databook"` + `report_date` + `source_url`) so MHS never blends blind with MarketBeat manual drops. (Per the ODD doc's multi-source note — keep `source_tag` as the 3-value union; carry source identity in a sibling column.)
5. **Idempotent merge + correct `freshness_column`** — `merge` + `primary_key` so re-running a drop never duplicates; DDL freshness column matches the cadence entry.

---

## 3. Build tasks — owner split (Sonnet plans+builds · Opus designs/reviews · Opus+operator decides)

### Recipe 1 — CRE-submarket → `cre-swfl` (build first)

- [ ] **(Opus+operator)** Resolve **O2** source-precedence: on a (submarket, period) collision between MHS and MarketBeat, which wins? (Recommend MHS geometry-confirmed > MarketBeat broker-survey, but it's an OUTPUT-math call.)
- [ ] **(Sonnet)** DDL `data_lake.mhs_cre_submarket` (+ Tier-1 parquet target) with `_ingested_at`, `source_tag`, `source_name`, `report_date`, `prior_12mo_ending`, submarket, sector, metric cols. Idempotent merge keys = (submarket, sector, prior_12mo_ending).
- [ ] **(Sonnet)** Parked cadence entry `mhs_cre_submarket` per §2.
- [ ] **(Sonnet, per CT's `littlebird-notes/2026-06-05.md`)** Geometry extractor recipe — header-match → col-7 absorption, **dual-signal negative (parens path + color-canary)**, Bonita regression fix first, Lely=0, period-stamp Option C (reject NULL). _Happens in the env that holds `drop/mhs-market-trends-2026.pdf` + `_build_geometry.py` — not present on `main`._
- [ ] **(Sonnet build + Opus diff-review — RULE 1)** Wire MHS source into `cre-swfl.mts` with the **(submarket, period) dedup** from drift #2 + the precedence rule. This changes cre-swfl OUTPUT/median math → Opus review mandatory.
- [ ] **(Sonnet)** Charlotte FIPS-only slug (decision #2) in the submarket→canonical map; tests.

### Recipe 2 — Permits → `permits-swfl` (own PR)

- [ ] **(Sonnet)** Separate **jurisdiction→canonical-place crosswalk** (NOT the CRE submarket table) — Unincorporated Lee/Collier/Charlotte, Cape Coral, Naples, Marco Island, Punta Gorda, **Town of Fort Myers Beach**. Stamp `calendar_year=2025` (confirmed full-year).
- [ ] **(Sonnet)** DDL + parked cadence `mhs_permits` + empty-tolerant wiring into `permits-swfl.mts` (+ Opus review if it changes OUTPUT shape).

### Recipe 3 — Multi-Family → `rentals-swfl` (own PR, last)

- [ ] **(Opus+operator)** Confirm `rentals-swfl` is the intended MF consumer (pack exists) + resolve MF period definition ("QTD 2026" underdetermined — apply Option C manual stamp).
- [ ] **(Sonnet)** County-grain DDL (Lee/Collier/Charlotte) + parked cadence `mhs_multifamily` + empty-tolerant wiring (+ Opus review on OUTPUT change).

### Independent — resilience (Sonnet, any time)

- [ ] **(Sonnet)** `freeze_watchdog_parse_error_hardening` — `master_is_stale()` returns False on parse error → make it fail-loud on unparseable master frontmatter (pattern established by `f9ae300`).

---

## 4. Ian retrodiction demo (`ian_retrodiction_demo`) — OPUS, standalone

- **Owner: Opus** (the scope tripwire is easy to trip).
- Run the **already-shipped** `computeBacktestCall` (`refinery/lib/backtest/decision-fn.mts`) on **ONE** event (Hurricane Ian). N≈1-2 — **illustrative demo, NOT moat proof; does NOT lift the Track-B HOLD.**
- **Outcomes = TDT collections + LeePA sale-velocity/volume ONLY.** Sale-velocity reuses the price-free `properties-lee-value` count path (drift #1) — **NEVER `last_sale_amount`.**
- As-of inputs: ALFRED LAUS initial vintages (real cron, **clean Tier-1 — not ODD**; keep the `source_tag="lake_tier1"` partition intact).
- **TRIPWIRE — STOP if the work grows into:** a reusable backtest harness, a generalized event-manifest, or a generalized vintage-resolver. That is held scope (`row_tier_build_remaining`).

---

## 5. Open items I could NOT close (need operator or the PDF-env)

- **O1 — LeePA `last_sale_amount` NULL-state discrepancy.** Operator states 100% NULL; memory `leepa-no-sale-price` records "VERIFIED POPULATED 2026-06-04 (528,130/548,798 rows)." **Moot for the demo** (velocity path never reads it — drift #1). Needs a live DB count to reconcile the memory; not run this session (non-blocking + scope). → flag for memory hygiene.
- **O2 — MHS vs MarketBeat source-precedence** on (submarket, period) collision. OUTPUT-math decision → Opus + operator (see Recipe 1 task 1).
- **O3 — Exact data cutoff inside the 2026 PDF** (the value to stamp as `prior_12mo_ending`). Page shows publish date 2026-03-13; the data cutoff needs eyes-on-PDF cover/footer (CT's Copilot check, LB item D). Option C (manual stamp) covers it operationally.
- **O4 — Extraction lives in the PDF env.** `drop/mhs-market-trends-2026.pdf` + `_build_geometry.py` are NOT on `main` (this machine). The geometry recipes run where the PDF lives (CT's env); the **repo-side ODD scaffold (§2) can ship here now**, ahead of the drop.
