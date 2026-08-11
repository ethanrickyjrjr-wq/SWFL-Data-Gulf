# READY TO PASTE — `lean-verifier/LEDGER.md`

**Why this is a file and not an edit:** brain-platform's `check-project-path.mjs` hook blocks
cross-project writes (Rule 8), and LEDGER.md lives in `lean-verifier`. The call is written and
final; it needs applying from a lean-verifier session (or by hand).

**Action:** replace the `steadyapi_sale_grain_agreement_candidate_unresearched` row under **OPEN**
with everything between the rules below.

Evidence: `brain-platform/_RESEARCH/data-and-ingest/2026-08-04-steadyapi-leepa-sale-grain-proportion-call.md`

---

**BOUND WITH EVIDENCE — live-verify pending**

| Surface | Pair · grain | The call, 08/04/2026 |
|---|---|---|
| SteadyAPI↔LeePA sale agreement | `steadyapi_listing_events` ↔ `leepa_parcels`, joined via `lee_parcels` address_key + the 07/19 strap crosswalk · **parcel, MONTH grain** | **DEFINITIONAL WATCH (class-13 shape) — not a kill, not a mismatch error.** Ran live from a brain-platform session 08/04/2026, zero paid vendor calls. **Gate passed:** the join lane exists — 6,620 of 9,654 Lee properties = **68.57%** (37 street-less `L…` keys excluded as structurally ineligible, not counted as failures). The address_key SQL port was proven **500/500 = 100.00% parity** against `address_key.py` on a unit/directional/punctuation-weighted sample *before* any match rate was believed. Fan-out guard load-bearing: 10,158 ambiguous county keys, worst = 2,862 parcels behind one key. **Agreement on 6,186 unambiguous pairs:** price exact **80.33%** (4,969); price+month exact **64.97%** (4,019); of the 4,969 price-agreeing pairs **97.10% land within one month** (delta 0→4,019, −1→806, −2→74, −3→25, thin tail). On the 4,400 month-agreeing pairs: exact 4,019 (91.34%), within $100 4,228 (96.09%), >10% apart only 75 (1.70%). Four buckets reconcile to 6,186 with zero nulls; 2.1 re-run in-session returned byte-identical `(6186, 4969, 4019)`. **The residual disagreement is structural, and all three causes were predictable before the query ran:** the county date is month-truncated (T10); `leepa_parcels` holds only the LATEST sale while **81.64% of matched properties have ≥2 sold events**; and the county roll lags (steady newer 1,464 vs leepa newer 322). None is an error in either source — which is exactly why this is a watch and not a mismatch family. **Independence holds** — SteadyAPI serves realtor.com, LeePA is the county appraiser's own roll, genuinely different upstreams. **No error contract asserted today:** there are 381 same-month price disagreements (8.66% of same-month pairs), 75 of them >10% — non-zero, so a mismatch contract would be red from day one. Those 381 need triage first (land parcels, partial-interest and multi-parcel deeds are all plausible and visible in the eyeball sample — e.g. steady $18,000 vs county $10,128 on a Lehigh lot). Asserting a defect before that triage would assert something we have not shown. Coverage floor is defined **over the matched intersection (6,186 pairs)**, never over "sold properties in Lee County": the backfill was active-sale-only, so a sold-population denominator would be a fabricated number. **Ceiling:** no outcome today reaches PROVEN — re-observation needs a cron-triggered probe and crons are OFF by design. Reachable now: OPEN → bound-with-evidence, live-verify pending Step 5. |

**FLOOR COMPOSITION — recorded so a re-observation is not comparing against a black box.** Of STEP
1's 6,620 matched properties: **343** have no priced `Sold` event (expected — the backfill was
active-sale scoped, so a never-closed listing contributes history but no sale), **73** matched a
parcel carrying no `last_sale_amount`, **18** were dropped by the ambiguity guard, and **6,186** land
in the floor. 343 + 73 + 18 + 6,186 = 6,620, reconciles exactly. If the floor moves, this is the
decomposition to re-run first.

**CORRECTION to this ledger's own framing (08/04/2026).** The OPEN row called this "the first
sub-monthly agreement surface." **It cannot be one.** `leepa_parcels.last_sale_date` carries exactly
**one distinct day-of-month across all 528,505 populated rows — the 1st, zero exceptions**
(`docs/standards/data-roots.md` T10, re-confirmed live 08/04). The county side caps this pair at
MONTH grain permanently, whatever day precision SteadyAPI has.

**This nearly produced a fabricated finding.** The authored `.sql` compared
`leepa_sale_date = steady_sale_date` at day grain. That scores **99 of 6,186 = 1.60%** — which is
just ≈1/30, the odds a real sale fell on the 1st — and would read as the two sources being
irreconcilable. The honest month-grain number is **4,019**. The day-delta distribution on
price-agreeing pairs is near-flat (0→99, −1→71, −2→76, −3→78, −4→74, −5→95, −6→111, −7→109, −8→107,
−9→137, −10→100), i.e. it measures the calendar, not the data. The author could not have known: the
`.sql` was written in a checkout with no DB reach. Sub-monthly on this pair would require
`lee_deed_official_records` (day grain, `record_date`) — which holds **zero rows** and is parked
under Operation Dumbo Drop behind Akamai.

**DEFERRED finding, promoted to a check rather than left as prose.** The 3,034 unmatched Lee
properties are **85.00% condos**: marked `UNIT<n>` 2,271 (74.85%), unmarked trailing-unit smush 308
(10.15%), no unit token 455 (15.00%). The direct test settles the cause — **2,196 of the 2,271
marked-unit misses (96.70%) reach a parcel the moment the unit is stripped**, so the property IS on
the county roll and only the unit grain is missing. That is a condo-grain gap, not an absent parcel
and not normalizer drift. Same family as Marco Island 0/360 (06/30/2026) and the DEFERRED
unmarked-trailing-unit smush named in `address_key.py`'s own docstring. Lifting the match rate from
68.57% is a condo-unit-matching sub-project, not a normalizer tweak.

**ORDERING RULE this call depends on — belongs in both LEDGER.md and the playbook.** Step 5 (cron
re-enable) **must not land before raw-insert is wired into the nightly path**. Re-enable first and
the lane resumes parse-and-discard: the `artifact` half of `check(claim, artifact)` stops being
retained, any contract bound on `steadyapi_property_history_raw` goes stale, then vacuously green —
precisely the failure adoption item 2 exists to prevent.

---
