# SteadyAPI ↔ LeePA/FDOR — sale-grain proportion call

**Date:** 08/04/2026 · **Ran from:** brain-platform session (the `.sql` was authored in
`lean-verifier`, which has no DB reach) · **Cost:** zero paid vendor calls — every byte was
already bought by the Step 1/2 backfill and typed by Step 3 family A.
**Ledger row:** `steadyapi_sale_grain_agreement_candidate_unresearched` (OPEN, due 08/03/2026).
**Method file:** `lean-verifier/research/2026-08-03-steadyapi-sale-grain-proportion-call.sql`.

Read alongside [[project_data-roots-catalog-check-first]] — T10 in `docs/standards/data-roots.md`
is the single fact that decides how this call has to be written.

---

## Headline

The join lane **exists** (68.57%) and the sources **agree** where they meet. This is a
**definitional watch**, not a mismatch error and not a kill. But the call is only honest at
**month grain**, and the handed SQL compared at **day grain** — which would have reported
99 agreeing pairs out of 6,186 and read as total disagreement.

---

## The correction that mattered

`docs/standards/data-roots.md` **T10** says every sale date we serve is month grain.
Re-confirmed live in preflight 0.8:

```
rows_with_date | distinct_days_of_month | oldest      | newest
528505         | 1                      | 1900-01-01  | 2026-06-01
```

**One** distinct day-of-month across 528,505 populated `leepa_parcels.last_sale_date` rows —
the 1st, zero exceptions. Steady's sold events carry all 31 (0.8b: 47,631 rows, 31 distinct days).

So `leepa_sale_date = steady_sale_date` can only be true when the real sale fell on the 1st —
about 1 pair in 30, **by arithmetic, carrying no information about whether the sources agree**.
Measured: 99 of 6,186 = 1.60%. The honest comparison is `date_trunc('month', ...)`, which gives
4,019 of 6,186 = 64.97%. Reporting the day-grain number as an agreement rate would have been a
fabricated finding built from a real query.

This is exactly what RULE 0.55 exists to catch: the `.sql` was written without DB reach, so its
author could not know the county side had no day precision to compare against.

---

## What was checked, in order

### STEP 0 — preflight (all confirmed live 08/04/2026)

| Check | Result |
|---|---|
| 0.1 date column | `leepa_parcels.last_sale_date`, type `date` — the file's ASSUMED name was correct |
| 0.2 family A parsed | 235,383 events · 17,859 properties · 1800-01-01 → 2026-08-03 |
| 0.3 event vocabulary | exact token is **`Sold`** — 47,631 rows, all priced. (`Price Changed` 58,727 · `Listed` 58,329 · `Listing removed` 49,531 · `Listed for rent` 10,262 · `Price Changed for rent` 6,760 · `Relisted` 4,143) |
| 0.4 county split | Lee 136,160 events / 9,691 properties · Collier 91,146 / 7,128 · Hendry 8,077 / 1,040 |
| 0.5 LeePA population | 548,798 rows · 547,972 with strap · 528,013 usable for this pair |
| 0.7 key format | `strap` and `parcel_id` both 17 chars, same shape; 542,445 of 547,972 strap rows reach `lee_parcels` |

### The stale-key branch — checked and RULED OUT

`address_key.py`'s docstring warns the 06/30/2026 hardening **changed the key format**, and
family A copied `address_key` through from the backfill rather than recomputing it. If the Steady
side held pre-canonicalization keys, a low match rate would mean *"needs a re-key"*, not *"no join
lane"* — a different finding and a different ledger row. Measured (0.6):

```
total_keys | longform_suffix_keys | longform_directional_keys | streetless_keys
17859      | 16                   | 85                        | 175
```

16 and 85 out of 17,859, and those look like street *names* (WESTWIND contains WEST), not
directionals. Samples are current canonical format (`10006SKYVIEWWAYUNIT205:33913`). **The Steady
side does not need re-keying.** Negative result, worth keeping so nobody re-derives it.

### STEP 0b — the address_key port, and the proof it is a port

The county side has no `address_key`, so joining means computing one in SQL — a port of
`ingest/pipelines/listing_lifecycle/address_key.py`. An unproven port is a second source of error
wearing a checker's hat.

**Parity: 500/500 = 100.00%**, sampled deliberately over units, directionals, long suffixes and
punctuation (a parity check on clean `123 MAIN ST` rows proves nothing). Because parity holds, the
match rate below is attributable to the data, not to the translation.

**Key collisions on the county side (0b.4)** — 459,799 distinct keys · **10,158 ambiguous** ·
106,442 parcels behind them · **worst single key = 2,862 parcels**. Condo stacks whose county
address carries no unit. The ambiguity guard is load-bearing: without it the STEP 2 join fans out
one Steady property into N rows and nothing errors.

### STEP 1 — the join gate

```
steady_lee_properties | matched | unmatched | match_pct
9654                  | 6620    | 3034      | 68.57
```

Plus 37 street-less `L<property_id>:<zip>` keys, excluded from the denominator — they can never
match a parcel address, so leaving them in would depress the rate with a population already known
to be ineligible.

**68.57% is not near zero: the join lane exists.** No kill for "no join lane."

---

### STEP 2 — sale-grain agreement (matched pairs only)

6,544 pairs built; **6,186 unambiguous** after the fan-out guard (358 rows / 18 properties excluded).

```
pairs | price_exact | price_exact_pct | both_exact_MONTH | month_pct | both_exact_DAY | leepa_date_null
6186  | 4969        | 80.33           | 4019             | 64.97     | 99             | 0
```

**The day-grain column is the whole reason this call needed rewriting.** 99 vs 4,019.

Four buckets at month grain, reconciling exactly to 6,186 with zero nulls:

| bucket | pairs |
|---|---|
| price ok + month ok | 4,019 |
| price ok + month drift | 950 |
| month ok + price differs | 381 |
| different event entirely | 836 |

**2.2 month drift on price-agreeing pairs** — 0 → 4,019 · −1 → 806 · −2 → 74 · −3 → 25, then a thin
tail. **4,825 of 4,969 = 97.10% within one month.** A tight cluster is the signature of a
definitional gap; a fat tail would have meant different events.

**2.2b day drift, same population** — 0 → 99 · −1 → 71 · −2 → 76 · −3 → 78 · −4 → 74 · −5 → 95 ·
−6 → 111 · −7 → 109 · −8 → 107 · −9 → 137 · −10 → 100. Near-flat, i.e. the county's "1st of month"
against a uniformly distributed real sale day. Direct empirical proof that day-grain comparison on
this pair measures the calendar, not the data.

**2.3 price delta on the 4,400 month-agreeing pairs** — exact 4,019 (91.34%) · ≤$100 209 · ≤$1k 35 ·
≤1% 7 · ≤10% 55 · **>10% 75 (1.70%)**. Within $100 = 4,228 = 96.09%.

**2.4 staleness direction (month grain)** — leepa newer 322 · **steady newer 1,464** · same month
4,400. The county roll is the lagging side, consistent with T10's newest month being 06/01/2026.

**2.5 multi-sale exposure — the ceiling on any contract here.** Only **1,136 of 6,186 (18.36%)**
matched properties have exactly one sold event. **5,050 (81.64%) have two or more**, and
`leepa_parcels` carries only the latest sale, so for those the comparison is structurally truncated
to the most recent transaction. Distribution: 1→1,136 · 2→1,479 · 3→1,383 · 4→998 · 5→614 · 6→341 ·
7→147 · 8→56 · 9→25 · 10→7.

**Two-pass discipline:** 2.1 re-run in the same session returned `(6186, 4969, 4019)` — identical.

### The 3,034 misses, quantified over the full population (not the 50-row sample)

| miss mode | properties | pct |
|---|---|---|
| a. marked unit (`UNIT<n>`) | 2,271 | 74.85% |
| c. no unit token at all | 455 | 15.00% |
| b. unmarked trailing unit (smush) | 308 | 10.15% |

**85.00% of misses carry a unit.** And the direct test: of the 2,271 marked-unit misses,
**2,196 (96.70%) reach a parcel once the unit is stripped.** The property is on the county roll —
only the unit grain is missing. That is a condo-grain gap, not an absent parcel and not normalizer
drift. It is the same condo/multi-unit grain family already logged repeatedly (Marco Island 0/360
06/30, `listing_state.property_type` 07/06–07) and the DEFERRED smush in `address_key.py`'s own
docstring.

Residue sample (`M3`) is mixed: some are still condos in unrecognized unit forms
(`26311STST0702E`, `3045ESTEROBLVD6A`), the rest look like Lehigh Acres / Babcock new construction
(`485824THSTSW`, `474327THSTSW`, `19232GENTRYPL`, `19263GENTRYPL`).

---

## THE CALL — outcome (b), DEFINITIONAL WATCH

Not a kill. Not a mismatch error. **Bound with evidence; live-verify pending.**

The join lane exists (68.57%) and where the two sources meet they agree: price exact on 80.33% of
6,186 unambiguous pairs, price+month exact on 64.97%, and 97.10% of price-agreeing pairs land within
one month. Every part of the residual disagreement is structural and was predictable before the
query ran:

1. **The county date is month-truncated** (T10, re-confirmed live) — no day precision exists to
   compare against.
2. **LeePA carries only the latest sale**, while 81.64% of matched properties have two or more sold
   events — the comparison is truncated by construction on most of the population.
3. **The county roll lags** (steady newer 1,464 vs leepa newer 322).

None of these is an error in either source, which is why this is a watch and not a mismatch family.

### One correction the ledger itself needs

The OPEN row hoped this "would be the first sub-monthly agreement surface." **It cannot be.**
`leepa_parcels.last_sale_date` has exactly one distinct day-of-month across all 528,505 populated
rows. The county side caps this pair at **month grain**, permanently, regardless of Steady's day
precision. Sub-monthly would require `lee_deed_official_records` (day grain, `record_date`) — which
holds **zero rows** and is parked under Operation Dumbo Drop behind Akamai.

### What the 6,186 floor is made of (measured, so a re-observation isn't comparing to a black box)

A coverage floor bound to a bare number rots: the next session sees 6,186 move and can't tell which
cause moved it. Decomposing STEP 1's 6,620 matched properties:

| outcome | properties |
|---|---|
| no priced `Sold` event on the property | 343 |
| matched parcel carries no `last_sale_amount` | 73 |
| ambiguous key (fan-out guard) | 18 |
| **lands in the floor** | **6,186** |

343 + 73 + 18 + 6,186 = 6,620 — reconciles exactly. The dominant drop is the **343 properties with
no priced sold event at all**, which is expected: the backfill was active-sale scoped, so a listing
that has never closed contributes history but no `Sold`.

### Scope caveat that must survive into any contract

The 17,875 raw bodies came from an **active-sale** backfill. Sold events are the histories *of those
properties* — this is not a sample of the sold population. Any coverage floor is therefore defined
**over the matched intersection (6,186 unambiguous pairs)**, never over "sold properties in Lee
County." A floor over the sold population would be a fabricated denominator.

### Why no error contract is asserted today

The precedent surfaces bound a mismatch contract that sits at 0. This pair has **381 same-month
price disagreements (8.66% of same-month pairs), 75 of them >10%** — non-zero, so an error contract
would be red from day one. Those 381 need triage first (land parcels, partial-interest deeds,
multi-parcel sales are all plausible and all visible in the eyeball sample, e.g. steady $18,000 vs
county $10,128 on a Lehigh lot). Asserting an error contract before that triage would be asserting a
defect we have not shown to be a defect.

### Ceiling — stated plainly

No outcome today reaches PROVEN. Re-observation requires a cron-triggered probe and crons are OFF by
design (Nightly Chain + ingest-listing-lifecycle disabled). Reachable today: **OPEN →
bound-with-evidence, live-verify pending**.

### Ordering rule this call depends on

**Step 5 (cron re-enable) must not land before raw-insert is wired into the nightly path.** Re-enable
first and the lane resumes parse-and-discard: the `artifact` half of `check(claim, artifact)` stops
being retained, any contract bound on `steadyapi_property_history_raw` goes stale, then vacuously
green — precisely the failure adoption item 2 exists to prevent.

---

## ADDENDUM 08/04/2026 — the 381 triage + the condo-gap close

Written from a brain-platform close-out session working the handoff at
`docs/superpowers/handoffs/2026-08-04-steadyapi-leepa-close-out-handoff.md`. §1's ledger-apply claim
was independently re-verified (commit `563c8a7` on `steadyapi-leepa-sale-grain-call-0804`, pushed;
sha256 of both copies of this file matched byte-for-byte) before anything below was trusted.

### The 381 triage — reran `sale_pairs` live, two-pass identical: (6186, 4969, 4019, 381)

`leepa_parcels.use_code` / `use_description` exist directly (no port needed from `lee_parcels.dor_uc`) —
FDOR NAL codes confirmed live: `00`=VACANT RESIDENTIAL, `01`=SINGLE FAMILY, `04`=CONDOMINIUM, plus a
long tail of vacant-* codes (`10`, `40`, `70`, `80`, grazing land). Classified all 381 on the four
named hypotheses from the handoff, **plus a fifth the handoff didn't name and the eyeball sample
forced**: de-minimis rounding, where `steady_price` and `leepa_price` sit within 1% of each other
(e.g. $829,600 vs $829,522, ratio 1.000) — not a disagreement, a reporting-precision artifact.

| bucket | pairs | pct of 381 |
|---|---|---|
| 1 vacant/land (`use_description ILIKE '%VACANT%'`) | 61 | 16.01% |
| 2 nominal (`leepa_price <= $1,000`) | 0 | 0% |
| 3 multi-parcel (ratio ≈ 2/3/4) | 3 | 0.79% |
| 4 partial-interest (ratio ≈ 0.25/0.5/0.75/1.33) | 8 | 2.10% |
| 5 de-minimis rounding (≤1% delta) | 232 | 60.89% |
| 6 close but not de-minimis (1–10% delta) | 46 | 12.07% |
| 7 TRUE UNEXPLAINED (>10% delta, none of the above) | 31 | 8.14% |

Reconciles exactly: 61+0+3+8+232+46+31 = 381.

**91.86% (350/381) land in a named, testable class.** Per the handoff's own decision rule ("if bucket
5 is small, say <50 ... an error contract becomes assertable on the excluded-class remainder"): 31 < 50.

**The 31 residual, read by eye:** dominated by low-dollar sales ($4,800–$45,000) on parcels whose
**current** `use_code` reads `01 SINGLE FAMILY RESIDENTIAL`. Lee County home resales don't run that
low — these read as lots sold vacant and built out afterward. FDOR NAL `use_code` is a **point-in-time
snapshot of today's use**, not a use-code history, so the vacant/land test (bucket 1) structurally
cannot see a parcel that was vacant *at the time of that historical sale* but has since been improved.
This is a stated limitation of the test, not a claim that all 31 are vacant-at-sale — a few outliers
(ratio 33.97×, 3.05×) don't fit that story and stay genuinely unexplained.

### DECISION — error contract IS assertable, on the excluded-class remainder

Outcome (per §2.3 of the handoff): assert a mismatch/error contract on `sale_pairs` pairs where
`leepa_sale_month = steady_sale_month`, excluding: `use_description ILIKE '%VACANT%'`, `leepa_price <=
$1,000`, ratio within 2% of an integer 2–4, ratio within 2% of {0.25, 0.5, 0.75, 1.33}, and price delta
≤1% of `steady_price`. On that remainder the contract asserts price agreement within 10%; the residual
77 pairs (46 + 31, 1.24% of the 6,186-pair floor) are the honest red-rate this contract ships with —
stated, not hidden. Building the contract itself is follow-up ingest work, not this session's scope.

### The condo-grain gap — CLOSED as (a), measured-and-deferred

Checked live: `data_lake.lee_parcels.phy_addr2` (the only plausible secondary-address-line column) is
**0 of 556,083 rows populated** — not sparse, **entirely empty**. No other unit/suffix column exists on
the table (checked `column_name ~* 'unit|apt|suite'`). The county roll carries no unit information in
any form. Per the handoff's own stated condition, option (b) (attempt the unit match now) is therefore
**impossible**, and (a) is the only honest close: the 68.57% match rate stands as a measured ceiling
with a known, structural cause (unit grain absent on the county side), not an unknown. It is not a
normalizer bug and not fixable by a normalizer tweak.

`marco_condo_price_cluster_unverified` does **not** close or reframe from this finding — it's a
different county (Collier, not Lee), a different mechanism (suspiciously low **listing prices**
suggesting a type-filter leak or rent-as-sale bug, not a parcel-join miss), and a different data path
(active listings, not the SteadyAPI↔LeePA sale-grain pair). Checked, no overlap.

