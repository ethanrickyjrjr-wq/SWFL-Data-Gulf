# Task 01 — `[AUDIT-FIX C2]` Locate the REAL rent/vacancy data path

**Why this task exists:** The source plan said `buildChartForIntent` should "read `corridor_profiles` exactly as `app/embed/charts/page.tsx:130` does." **That is wrong.** The audit found that query (`embed/charts/page.tsx:129-134`) selects `corridor_name, character_chart, character_facts, character_speculative` — NOT rent or vacancy. Asking-rent is loaded from a **`corridor-rents.json` fixture** (~embed lines 156-160). You must find the truth before coding Task 02, or you'll build against a column that doesn't exist.

**This is investigation, not code. Output a short findings note that Task 02 consumes.**

- [ ] **Step 1: Read `app/embed/charts/page.tsx` end-to-end.** Identify exactly where asking-rent values come from (the fixture path), what shape they're in, and what corridors/ZIPs they cover. Confirm whether vacancy is in the same fixture, a different one, or derived.

```bash
# find the fixture(s)
ls fixtures/ | grep -i -E 'rent|vacan|corridor'
```

- [ ] **Step 2: `[LB-R1]` — the source MUST be live; a fixture cannot carry an honest `freshness_token`.** A filed chart becomes a `ProjectItem` and the whole moat depends on every filed item being pinned with a REAL citation + freshness token. A chart built from `corridor-rents.json` (a static file) **cannot** honestly carry a token — a freshness badge on fixture data still lies (this is the env-swfl phantom-data bug). **Decision is therefore forced, not a recommendation:**
  - **Asking-rent → use the LIVE brain.** `refinery/sources/zori-source.mts` + `rentals-swfl`'s `rentals_by_zip` detail_table (ZORI, real ingested data — confirmed live, SESSION_LOG 2026-06-10 §F-1). Source via `fetchBrain("rentals-swfl")` and carry the brain's freshness token. **The `corridor-rents.json` fixture is FORBIDDEN as a fileable-chart source.** (The embed page may keep using it for its character display; the chart producer may not.)
  - **NEVER** attach a `freshness_token` to fixture-derived data. Record this prohibition in the findings note as a hard rule.

- [ ] **Step 3: Vacancy → DEFER (no clean live residential source).** Confirmed: vacancy only appears in CRE/marketbeat surfaces (`marketbeat_pdf` is ODD-parked, not reliably live) and broker scrapes — no clean live residential vacancy-by-ZIP source like ZORI. **Mark `vacancy` DEFERRED in `buildChartForIntent` (return `null`)** — same discipline as `vitals`. Do NOT source it from a fixture or a parked pipeline. If you discover a genuinely live vacancy source in-session, you may light it; otherwise it stays deferred. Note the decision.

```bash
grep -rIl -E 'vacanc' refinery/packs/ refinery/sources/ | head   # confirm: CRE/marketbeat only
```

- [ ] **Step 4: Locate the flood-AAL source.** Plan says "from env brain detail table via `fetchBrain`." Confirm `fetchBrain` exists and the env brain exposes an AAL-by-ZIP detail_table; record the exact accessor.

- [ ] **Step 5: Write the findings note** at `docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/session-2-charts-tierB-inchat__SONNET/FINDINGS-datapaths.md` listing, per scope (`asking-rent`, `vacancy`, `zhvi`, `flood-aal`, `vitals`): the real source, the accessor, and whether it's LIVE or DEFERRED. Task 02 codes directly against this.

- [ ] **Step 6: Commit the findings note.**

```bash
git add docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/session-2-charts-tierB-inchat__SONNET/FINDINGS-datapaths.md
git commit -m "docs(charts): [AUDIT-FIX C2] real rent/vacancy/aal data-path findings"
```
