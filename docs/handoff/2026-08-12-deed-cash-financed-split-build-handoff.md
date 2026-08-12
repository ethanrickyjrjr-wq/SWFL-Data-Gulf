# Cash-vs-financed split — build handoff

**Date:** 08/12/2026 · **For:** the next session (Sonnet is fine — this is bounded implementation)
**Spec:** `docs/superpowers/specs/2026-08-12-deed-cash-financed-split-design.md`
**Check:** `deed_cash_financed_split_live_verify` (open, no signal attached yet)

---

## What is already done — do not redo any of it

1. **The design exists and its failure modes are named**, seven of them, each with a guard. Read the
   spec before writing a line. Do not re-brainstorm; the operator approved going straight to build.
2. **The three measurable failure modes were measured live 08/12/2026** against
   `data_lake.lee_deed_official_records` (creds `.dlt/secrets.toml`). All three came back inside
   tolerance. The numbers below are real query output — reuse them, do not re-derive them unless you
   are changing the method:
   - **FM-1, pairing window — SETTLED, the curve is flat.** Deed side deduped to one row per
     `(record_date, parcel_strap)` → 3,031 rows. Mortgage pairs by window: same-day **1,179** ·
     +1d **1,179** · +3d **1,182** · +7d **1,182** · −3/+14d **1,182**. Widening to seventeen days
     buys 3 pairs out of 3,031 (0.1%). **Use same-day. The window is not a parameter worth carrying.**
   - **FM-2, unclassifiable** — 180 of 3,229 arm's-length deeds carry no strap = **5.57%**, inside
     the 15% suppression floor. Ship the floor anyway; it guards a future window, not this one.
   - **FM-3, double-count** — 3,049 raw strap-carrying rows collapse to 3,031 distinct
     `(record_date, parcel_strap)` = 0.6%. One `distinct` fixes it.
3. **The headline the build must reproduce:** financed **1,182 / 3,031 = 39.0%**,
   no-recorded-financing **61.0%**, over 07/13–08/11/2026 (22 business days).
   If your view returns something materially different, your view is wrong — stop and find out why
   before shipping it.
4. **The catalog is corrected** — `docs/standards/data-roots.md` line 86 + trap T10 now state the
   real span, split, and the broken parcel join. Trust it.
5. **The LOAD cron is enabled** — `.github/workflows/ingest-lee-deed-official-records.yml`, daily
   11:17 UTC. FETCH is still manual (Akamai). The span grows only when a human drops a raw file.

---

## What to build — in this order

### Step 1 — TDD the classifier (hard gate, RULE 3.5)

`superpowers:test-driven-development`. One failing test per deterministic failure mode, **named after
the failure mode it targets**, then implement to green:

- a fixture with a deliberately split deed/mortgage pair → asserts cash share is monotonically
  non-increasing as the window widens (FM-1's guard survives even though the curve measured flat —
  the guard is what stops a future regression, not a description of today)
- a fixture with 20% strap-absent rows → asserts the metric **suppresses** rather than publishing a
  skewed share (FM-2)
- a fixture with one strap carrying two mortgages → asserts the deed counts **once** (FM-3)

`unclassifiable` is its own third class. Never fold it into either side.

### Step 2 — the view

`lee_deed_purchase_financing_v`, SQL in `docs/sql/` following the `steadyapi_*_v` house pattern.
One row per arm's-length DEED (`consideration_usd > 100`), carrying `record_date`, `parcel_strap`,
`consideration_usd`, and `financing_class` ∈ `financed` / `no_recorded_financing` / `unclassifiable`.
Pair via **EXISTS**, never a join — a fan-out is FM-3 walking back in. Mortgage side is
`doc_type LIKE 'MORTGAGE%'` (there are three variants live: `MORTGAGE`, `MORTGAGE WITHOUT INTANGIBLE
TAX`, `MORTGAGE WITHOUT TAX` — 2,216 + 306 + 186; matching only `= 'MORTGAGE'` undercounts financing
by roughly 18% and inflates the cash number, so this is a real trap).

Apply directly (RULE 1: migrations run directly, idempotent, verify row count after).

### Step 3 — source + pack + vocab, ONE commit

Extend `refinery/sources/lee-deed-records-source.mts` and `refinery/packs/lee-deed-records-swfl.mts`.
Two new metrics:

- `deed_no_recorded_financing_share_lee` — intensive, ratio, `direction: "stable"`
- `deed_arms_length_paired_mortgage_lee` — extensive, count

**Gate 2 blocks the push if the vocab slug is not registered in `brain-vocabulary.json` in the SAME
commit.** Audit with `bun refinery/tools/check-vocab-coverage.mts --all`.

Reuse the pack's existing caveat machinery rather than inventing new prose: the span-based
thin-backfill caveat (FM-6) and the party-truncation caveat are already written. Add the span/date
range into the new metrics' own citation strings so the number never implies "today" (FM-5 — the
`stale-source-served-silently` shape is at 6 strikes; this build guards its own surface only and the
spec says so).

While you are in the pack: its **zero-row branch is now dead code** — it was written when the table
held nothing and still tells the reader to run a manual load. Either delete it or make it honest.

### Step 4 — rebuild one brain

`OPERATOR_APPROVED_PAID_RUN=1 node scripts/dispatch-rebuild.mjs lee-deed-records-swfl --reason "<decree>"`
and commit the auto-appended acceptance entry the same session. **Never `master --force`** (RULE 1).

### Step 5 — live-verify and close

Fetch the real response, confirm the metric slug is in it, then
`node scripts/check.mjs close deed_cash_financed_split_live_verify`.
A green test run is **not** evidence (RULE 0.8 §4). Attach a signal while you are there —
`.claude/skills/check-signal/SKILL.md` for the false-pass traps.

---

## Two operator questions still open

Both live at the bottom of the spec; do not decide them yourself.

1. Does this number face customers now, or stay internal until the history clears a stated span
   floor? (My read in the spec: internal — 22 days of anything is the easiest way to look foolish
   with a true number.)
2. Nothing else. Question 1 in the spec was resolved by the measurement above.

---

## Explicitly out of scope

No UI. No Collier — **there is no Collier deed feed at all**, so every surface this touches must be
labeled Lee-only. No parcel-table enrichment: the `parcel_strap` ⇄ `lee_parcels` normalization is
still broken (0 rows on a direct join, measured 08/12/2026) and this build was chosen precisely
because it routes around that. If you find yourself needing assessed value, you have left the scope
— that is task 1 of `docs/handoff/2026-08-12-lee-deed-data-investigation-queue.md`.

No identity work. This is a market statistic, not a person statistic, and that is the reason it is
safe to build now — see `_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md`
§6 for what the owner-targeting lane costs.
