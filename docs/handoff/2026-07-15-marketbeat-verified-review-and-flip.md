# HANDOFF — MarketBeat verified-gate review, corruption fix, and scoped flip

**Written 07/15/2026.** Follow-up to the same-day audit
(`docs/handoff/2026-07-15-marketbeat-pdf-ingest-audit-handoff.md`) and the Medical Office
build. Triggered by discovering that every quarterly C&W/Colliers/Lee row in
`data_lake.marketbeat_swfl` has `verified=false`, which `refinery/sources/marketbeat-swfl-source.mts`
and `refinery/packs/cre-swfl.mts` both gate on — meaning none of this data has ever reached the
`cre-swfl` brain. Operator directive: "write follow up so we get another set of eyes on it and
fixed so it runs correctly and then flip it."

---

## 1. Method

Two independent review passes, each a fresh subagent with **no access to the extraction code**
(`ingest/pipelines/marketbeat_pdf/extractor.py`) — briefed to read the source PDFs by eye and
compare field-by-field against `data_lake.marketbeat_swfl`, specifically hunting for a shifted or
mismatched column (a totals-only check can't catch that; see the original audit's finding 1.2 on
zero test coverage).

- **Industrial** (existing pipeline, live since 2026-06-09): 3 quarters checked (2025-Q1, 2025-Q4,
  2026-Q1) — the only quarters whose source PDFs are still on the live C&W hub. 6 submarkets ×
  3 quarters, vacancy/absorption/rent, 18 combos.
- **Medical Office** (built this session): all 4 loaded quarters checked (2024-Q3, 2025-Q1,
  2025-Q3, 2026-Q1). 9 submarket/quarter/field combos across all four PDFs, plus explicit checks
  for leaked transaction rows and all-null rows.

## 2. What the review found

### 2.1 Industrial — a real parser bug, not a Medical-specific issue

`extractor.py`'s `_parse_cw_text` had the same defect as the one caught and fixed in the new
Medical parser during build: the "stop at `SOUTHWEST FLORIDA TOTAL`" check was **dead code** — the
generic `_SKIP_RE` (which also matches that line) ran first and silently consumed it, so the loop
kept walking into the "Key Lease/Sale Transactions" tables below the real submarket table. A
transaction's city tag (e.g. "17990 Curry Preserve Dr / Charlotte County / Primer / 27,000 / New
Lease") re-matched a real submarket name and got collected as a second, garbage "Charlotte County"
row — which then **overwrote the correct row via `ON CONFLICT DO UPDATE`**, since both share the
same `(source_name, sector, submarket, quarter)` key.

Confirmed live: Charlotte County was silently null across every field for 3 of 9 quarters
checked; North Naples had a stray unrelated transaction SF figure (18,400 / 38,000) land in
`deliveries` for 2 of 6 quarters checked, with every other field null. This was **repeatable, not
a one-off** — roughly 1-in-3 on the affected rows.

**Fixed** (`extractor.py`): reordered the totals-boundary check ahead of `_SKIP_RE`, same fix
already applied to the Medical parser. Re-extracted and re-verified against the reviewer's exact
PDF reads for Charlotte County and North Naples across all 3 available quarters — exact match.
Re-loaded with `--force`.

### 2.2 Medical Office — a report-generation layout the new parser didn't know about

Q3 2024's PDF uses a **9-column layout** (an extra "YTD OVERALL NET ABSORPTION" column between
current-quarter absorption and YTD leasing activity) that Q1 2025+ reports dropped. The new
`_parse_cw_medical_text` assumed a fixed 8 columns, so on the 9-column layout it silently
truncated collection one column short and mis-assigned `under_construction` and
`asking_rent_full_service` by one slot. Confirmed live: Outlying Collier County Q3 2024 showed a
"$40,000/SF" rent in the database — that number was actually the submarket's under-construction
square footage; the real $37.00 rent was dropped entirely. Affected all 16 of 16 Q3 2024
submarket rows.

**Fixed** (`extractor.py`): detects the 9-column layout from the header text and shifts the
`under_construction`/rent indices accordingly; also recovers the genuine
`ytd_absorption_sqft` figure for 9-column quarters (previously dropped, not just shifted — this
report generation actually reports it, Q1 2025+ doesn't). Re-verified against the reviewer's exact
figures for Charlotte County, Estero, and Outlying Collier County — exact match. Re-loaded with
`--force`. Ran a regression check on the three already-clean quarters (Q1 2025/Q3 2025/Q1 2026) —
identical totals before/after, no change.

### 2.3 What the review confirmed clean

No column-shift pattern in either sector once the two bugs above are accounted for — every other
field the reviewers checked (60+ individual field comparisons across both sectors) matched the
PDFs exactly, including the W/D→`asking_rent_nnn` mapping for industrial and the vacancy/absorption
mapping for medical office. No leaked transaction rows found in Medical Office beyond the two bugs
above. `Lehigh` vs `Lehigh Acres` and one odd-looking North Fort Myers absorption figure were
checked and confirmed to be the source PDF's own labeling/data, not pipeline defects.

## 3. What got flipped

Scoped `UPDATE ... SET verified = true` to exactly the quarters reviewed and re-verified after the
fix — see `docs/sql/20260715_marketbeat_swfl_verify_reviewed_quarters.sql`. Confirmed live via
direct query after running:

- `cw_marketbeat` / `industrial` / 2025-Q1, 2025-Q4, 2026-Q1 — 49 rows
- `cw_marketbeat` / `medical_office` / 2024-Q3, 2025-Q1, 2025-Q3, 2026-Q1 — 64 rows

**113 rows now `verified=true`.** Industrial is already in `marketbeat-swfl-source.mts`'s
`SURFACED_SECTORS` allowlist, so once `cre-swfl` rebuilds, its vacancy/absorption/rent numbers for
these 3 quarters should surface with zero further code changes.

## 4. What's still dark, and why

- **Industrial 2024-Q1 through Q4 (60 rows).** Their source PDFs are no longer on the live C&W
  hub archive (confirmed live: the hub's Industrial archive only goes back to Q1 2025) so they
  cannot be independently re-verified right now. One of these quarters (2024-Q2, Charlotte County)
  is already confirmed to have the same null-row corruption via a wider query — so the other
  "clean-looking" 2024 rows are **not caught, not verified-clean**. Left `verified=false`. Needs
  either locating the original 2024 PDFs (wherever the 2026-06-09 manual ODD drop sourced them
  from) or accepting a lower-confidence spot-check some other way.
- **Colliers (`colliers_industrial`, 132 rows) and Lee & Associates (`lee_associates`, 20 rows).**
  Untouched this pass — zero review, zero flip. Same `verified=false` gate blocks them from the
  brain exactly like the C&W data did before today.
- **Medical Office is loaded and flipped but not wired into the brain.** `SURFACED_SECTORS` in
  `marketbeat-swfl-source.mts` is still `['retail','industrial','office']` — `medical_office` needs
  to be added. Its rent lives in the new `asking_rent_full_service` column, which the source
  connector's `MarketbeatRow`/`MarketbeatSwflNormalized` types and `fetchLive()` select clause
  don't carry yet, and `cre-swfl.mts`'s per-sector fan-out (`refinery/packs/cre-swfl.mts:1155+`)
  only emits a rent slug off `asking_rent_nnn`. Wiring this properly means: extend the source
  connector's select + normalized type, extend the pack's fan-out to also emit a
  `asking_rent_full_service_marketbeat_<slug>_medical_office`-style slug, and register that new
  slug family in `brain-vocabulary.json` in the same commit (Gate 2 pre-push hook requirement) —
  not done this pass, deliberately, so Medical doesn't ship with vacancy/absorption but silently
  missing its rent (the most interesting number in that report).
- **Submarket/corridor aliasing needs no new work.** Checked `refinery/lib/marketbeat-submarket-aliases.mts`
  — it's keyed purely on submarket name, not sector, and every submarket name Medical Office uses
  (including both "Lehigh" and "Lehigh Acres") is already a registered key from the existing
  Industrial coverage. Non-issue.
- **Scope note (operator directive mid-session):** Lee + Collier county coverage is what matters;
  Charlotte County / Punta Gorda data stays in the lake as-is but the brain doesn't need to focus
  on it. This is already how `marketbeat-submarket-aliases.mts` treats Charlotte County (empty
  corridor array — county-grain only, no corridor-level enrichment). One stale ghost row
  (`industrial` / `Punta Gorda` / 2026-Q1, every field null) is a leftover from a pre-fix load —
  the new parser no longer produces it, but upserts never delete rows a corrected extraction stops
  emitting. Harmless (all-null, `verified=false`, out of brain scope) — left in place, not chased
  further per operator direction.

## 5. Next step — the actual "get the data" gate

Flipping `verified` is a DB write, reversible, already done. **Nothing customer-facing changes
until `cre-swfl` rebuilds** (`--target-only`, per `refinery/packs/CLAUDE.md`) — that's the step
that touches live `/api/b/*` output, which needs an explicit go-ahead per CLAUDE.md RULE 1. Once
approved: rebuild `cre-swfl`, then query the built brain/citations to confirm Industrial's
vacancy/absorption/rent numbers for 2025-Q1/2025-Q4/2026-Q1 actually surface — that's the real
"done," not the verified flag.

Medical Office needs the wiring described in §4 before it can be flipped-and-rebuilt the same way
— tracked in check `marketbeat_medical_wiring_followup` (updated with this session's findings).
