# 08b — Contract thresholds: derivations + ADVERSARIAL verdicts

**As-of:** 07/11/2026 · **Source:** research fan-out for `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` §13 (25 opus + 2 sonnet agents, read-only).
**Status:** evidence for Fable 5's build. Every claim below was produced by an agent that read the live files / queried the live DB (SELECT-only) / fetched live vendor docs. Numbers anchored to `03-lake-live-state.md` as the canonical 07/11/2026 fixture.

**This is the load-bearing document.** The exact `content_contracts:` blocks for `quality_registry.yaml`, the defining queries + row-sets for the replay fixtures (spec §9a), the quarantine/abort policy with a real contamination-share, and — critically — an **adversarial verification of each**, which tried to make the contract wrongly fire on a legit row or wrongly miss a known-bad one.

> **READ THE VERDICTS BEFORE IMPLEMENTING.** The `range` contract as originally derived was found **TOO-AGGRESSIVE** — it would hard-quarantine real manufactured-home *sales*. Do not implement the derivation without its verdict's correction.

---


---

# DERIVATION — range

The advisor caught a real mechanical error in my abort justification (a broken land heuristic sends rows to `other`, which my scope *excludes* — so the "land→single_family regression" story doesn't hold). Cutting it and anchoring the threshold purely to observed steady-state. Writing the deliverable.

## Contract thresholds — range

**As-of: 2026-07-11.** Canonical fixture = the `03-lake-live-state.md` dated snapshot (34,703 rows). Live re-queries below were run later the same day (34,935 rows — `active_listings` lands rows through the day) purely to (a) confirm the shape holds and (b) compute the abort share. **Where they differ, 03 is canonical.** The contaminated row-set is bit-stable across both: **91 non-land rows under $20,000, in both.**

---

### 0. FINDING — drift from 03/spec §5: the `other` bucket is *manufactured homes*, not contamination

Spec §5 and 03 §4b both treat "the 91 non-land rows under $20k" as the mislabel set, protected only against the 523 land lots. **That is wrong, and a floor scoped `property_type <> 'land'` would quarantine ~61 legitimate manufactured-home sales.** Three independent lines of evidence:

1. **Primary source.** `ingest/pipelines/listing_lifecycle/extract_api.py:94-98`, verbatim: *"property_type is a request-side FILTER only… With no hint (not matched by any type sweep — **e.g. manufactured/farm, which aren't filterable at all**), falls back to the land heuristic (no beds + a lot_sqft), else **"other"**."* Confirmed by `test_extract_api.py:72`: `assert map_property_type(None) == "other"`. Manufactured homes are **not a filterable SteadyAPI `/search` type**, so they carry no `type_hint`, have beds (land heuristic doesn't fire), and land in `other` **by design**.
2. **Distribution shape.** `other` is *continuous* across the floor — 61 (<$20k) → 74 ($20–30k) → 176 ($30–50k) → 146 ($50–75k), median $129,000. That is a real population. `condo` is *bimodal with a zero-gap*: 9 (<$20k) → **0** ($20–30k) → 5 ($30–50k) → 5,524 (≥$100k). That is the contamination signature.
3. **The rows themselves.** The 61 `other` rows are 2bd/540–1,710 sqft at $2,500–$19,900 in Plaza Del Sol, Avanti Way, Spyglass Ct, Congressional Ct (N. Fort Myers 33903/33917), the Six Lakes-area courts in 33912, 100 Barefoot Williams Rd (Naples 34113), 25501 Trost Blvd (Bonita 34135) — land-lease mobile-home parks. These are **real sale prices**. (Corroborating: `land_manufactured_swfl` is a knowingly-parked pipeline — manufactured grain is an acknowledged SWFL gap.)

**Reconciliation Fable 5 must build the fixture around — the 91 decomposes, it is not replaced:**

| Bucket | n | Verdict |
|---|---|---|
| `land` | 522 (03: 523) | **PROTECTED** — legit cheap lots (already in spec) |
| `other` | 61 | **PROTECTED — NEW.** Manufactured homes in land-lease parks. Spec would have quarantined these. |
| `single_family` | 21 | **VIOLATION** |
| `condo` | 9 | **VIOLATION** |
| **non-land (spec's "91")** | **91** | = 61 protected + **30 true violations** |

**A 4th token exists that 03 §4a does not list:** `residential`, 298 rows, `source_name='lifecycle_seed'` (not `api_feed`), single scrape 2026-06-27, **zero rows under $20k**. Harmless today, but it proves new type tokens appear silently — which is why the scope below is an **exclusion (`NOT IN`)**, never an inclusion allowlist.

**What the floor actually does** (state it this way — do not overclaim "isolates rental mislabels"): the 30 violations are a *mix* — 12 `single_family` at **exactly $5,000** (3–4bd, 1,235–2,381 sqft, Cape Coral/Lehigh — monthly-rent artifacts, incl. degenerate address_keys `FORTMYERS:33966`, `LEHIGHACRES:33971`), 9 `condo` ($1,800–$10,000, incl. the 7-unit 10 Tampa Pl Marco Island cluster — seasonal-rent artifacts), and 9 sqft-NULL `single_family` ($2,000–$14,900, the Hitzing/Mailbox Ave N. Fort Myers cluster — mobile homes **mis-typed** as single_family at the vendor). The contract's job is **"keep non-home-priced rows out of the home-sale median,"** not "find rentals." All 30 should drop from the median regardless of which kind of wrong they are.

---

### 1. The contract — drop into `ingest/quality/quality_registry.yaml`

```yaml
  data_lake.listing_state:
    content_contracts:
      - name: sale_price_floor_typed_residential
        type: range
        col: list_price
        # WHERE-scope. Exclusion, not an allowlist: a new type token (`residential`
        # appeared silently, 298 rows, 2026-06-27) must inherit the floor by default.
        # `land` = legit cheap lots (522 sub-$20k). `other` = MANUFACTURED homes —
        # extract_api.py:97 routes unfilterable manufactured/farm here; 61 legit
        # sub-$20k land-lease-park sales. Both are real; both are excluded.
        where: "sale_or_rent = 'sale' AND property_type NOT IN ('land','other') AND list_price IS NOT NULL"
        op: gte
        min: 20000                 # $20,000
        policy: quarantine
        abort_if:                  # BOTH must hold — see §3
          share_pct_gt: 1.0
          violations_gte: 50
        locus: both                # A: pre-merge on batch · B: at-rest probe (the view has no pipeline)
        severity: error
```

- **No `state` filter.** The Locus-A batch is pre-merge and carries all states (`distill.py:77` `_STATE_COLS` includes `state`, `property_type`, `list_price`, `sale_or_rent` — every predicate is evaluable in-batch). A rental-priced row is wrong regardless of state.
- **No `source_name` filter.** `residential`/`lifecycle_seed` has zero sub-$20k rows, so scoping costs nothing and non-scoping catches a future regression in either writer.
- **No `sqft IS NOT NULL` carve.** It would perfectly separate today's rows (the 21 true rent-artifacts all have sqft; the 9 mis-typed mobile homes don't) — and that is exactly why it must be rejected: it is overfitting to the fixture and would **wrongly miss a rental-priced condo with NULL sqft**. Accept the 9 ambiguous rows in quarantine; quarantine is triage, not deletion, and the real fix for them is a normalizer re-type to `other`.

---

### 2. Defining queries + row-sets (the replay fixture)

**2a. OFFENDING ROWS — Locus B (at-rest, `state='active'`, matches 03's canonical framing): 30 rows.**
```sql
SELECT property_type, list_price, city, zip_code, address_key, beds, sqft
FROM data_lake.listing_state
WHERE state='active' AND sale_or_rent='sale' AND list_price IS NOT NULL
  AND property_type NOT IN ('land','other')
  AND list_price < 20000
ORDER BY property_type, list_price;
```
→ **30 rows**: `condo` 9 ($1,800–$10,000, all sqft-present) · `single_family` 21 (12 sqft-present all at exactly $5,000; 9 sqft-NULL, $2,000–$14,900).
For Locus A (batch, **no state filter** — what `evaluate_batch()` actually sees): drop `state='active'` → **41 rows** (`single_family` 32, `condo` 9). Both counts belong in the fixture; A is the gate, B is the tripwire.

**2b. The spec's "91" — the superset the contract deliberately does NOT fire on in full:**
```sql
SELECT property_type, COUNT(*) n, MIN(list_price) min_p, MEDIAN(list_price) med_p, MAX(list_price) max_p
FROM data_lake.listing_state
WHERE state='active' AND sale_or_rent='sale' AND list_price IS NOT NULL
  AND list_price < 20000 AND property_type <> 'land'
GROUP BY 1;
```
→ `other` 61 ($600 / $15,900 / $19,900) + `single_family` 21 + `condo` 9 = **91**. The fixture must assert the contract flags **30, not 91** — the 61 `other` rows are the false-positive trap.

**2c. PROTECTED SET 1 — the land lots (spec §5 trap #1):**
```sql
SELECT COUNT(*) FROM data_lake.listing_state
WHERE state='active' AND sale_or_rent='sale' AND property_type='land' AND list_price < 20000;
```
→ **522** live (03 canonical: **523**; one row left `active` between the two reads). $700–$19,999, median $18,000. Must be **0 flagged**.

**2d. PROTECTED SET 2 — the manufactured homes (NEW trap, not in spec):**
```sql
SELECT COUNT(*) FROM data_lake.listing_state
WHERE state='active' AND sale_or_rent='sale' AND property_type='other' AND list_price < 20000;
```
→ **61**. $600–$19,900, median $15,900. Must be **0 flagged**.

**2e. PROTECTED SET 3 — LeePA nominal-consideration transfers (spec §5 trap #2):**
```sql
SELECT COUNT(*) AS nonnull, COUNT(*) FILTER (WHERE last_sale_amount BETWEEN 1 AND 9999) AS nominal
FROM data_lake.leepa_parcels;
```
→ **528,130 non-null; 41,510 in $1–9,999** — exactly matches 03 §4d. Protected by **table-scoping only**: no price contract is authored for `leepa_parcels`. The fixture must assert this. (Cost of getting it wrong, measured: a `last_sale_amount >= 20000` contract would quarantine **71,388** legitimate quitclaim/family transfers.)

---

### 3. Policy — `quarantine` default; `abort` iff **share > 1.0% AND violations ≥ 50**

**Real shares (spec §5 Locus A: "never abort a 34k load over 91 rows"):**

| Scope | Violations | Denominator | Share |
|---|---|---|---|
| Corrected (`NOT IN land,other`), active | 30 | 29,546 active+sale | **0.102%** |
| Corrected, vs. today's full sweep batch | 30 | 29,907 | **0.100%** |
| Spec's naive (`<> 'land'`), active | 91 | 29,546 | 0.308% |
| Task's cited figure (91 / all rows) | 91 | 34,703 (03) / 34,935 (live) | 0.262% / 0.260% |

**Default = `quarantine`.** Drop the 30 (or 41 at Locus A), merge the clean rest, write the offenders to a quarantine table for triage. At 0.10% steady-state, abort must never trigger.

**`abort` cutoff = share > 1.0% AND violations ≥ 50.** Both conditions, not either.
- **Share 1.0%** = ~10× observed steady-state (0.100%), and 3× above even the naive-scope worst case (0.308%). It cannot fire on today's data by any scoping. It fires on a *bulk* leak — hundreds of non-home-priced rows on a full sweep — which is the only thing worth killing a run over. (I deliberately do **not** anchor this to a modelled regression magnitude: the most plausible mapping regression routes no-hint rows into `other`, which this contract *excludes*, so the resulting violation share is not derivable from our data. Anchoring to steady-state is the only honest calibration.)
- **`violations ≥ 50` is the load-bearing addition to spec §5's share-only rule.** Batch size is *wildly* variable and the spec's share-only rule breaks on small batches. Full sweep ≈ **20k–30k** rows (03 §6: 21,142 on 07/10; 29,907 touched today). But outage/recovery runs are tiny: **7 rows (07/07), 361 (07/08), 169, 173**. A 169-row recovery batch carrying 3 bad rows = **1.78% share** → a share-only rule at 1.0% would have **aborted a legitimate recovery run**. The 50-violation floor makes that a quarantine instead. It also sits comfortably above the largest steady-state batch violation count observed (30).
- *(Caveat on the denominator: `scraped_at` is overwritten on merge (`distill.py:186`), so per-day row counts are "rows last touched that day," not batch sizes. The 20k–30k full-sweep figure is the real batch; the small numbers are days where most rows weren't re-touched.)*

---

### 4. The discriminating test (how a verifier proves this contract is wrong)

**Wrongly FIRES on a legit row** if the vendor introduces a new low-price `property_type` token outside the two exclusions — exactly the `residential`-appeared-silently risk, and acutely if **manufactured ever gets its own token**: those 61 real land-lease-park sales would move out of `other`, inherit the floor, and be quarantined as contamination. **Wrongly MISSES a known-bad row** if a rental-priced listing lands *inside* the excluded `other` or `land` buckets (a no-`type_hint` seasonal rental falls to `other` by `extract_api.py:97` and is invisible to this floor forever). The single test that discriminates: seed one $7,000 rental-priced row typed `other` (must be **missed** — a known, accepted blind spot) and one $15,000 manufactured-home sale typed `single_family` (must be **flagged** — an accepted false positive). If a future scope change flips either outcome, the contract's exclusion list is no longer tracking the vendor's taxonomy and must be re-derived.

---

# ADVERSARIAL VERIFICATION — range

## Threshold verification — range: **VERDICT: TOO-AGGRESSIVE**

*(Primary failure: the contract drops legitimate rows. It also has a too-loose leak in the same mechanism — documented in §3. The `$20,000` **value** is roughly right; the `property_type` **scope** is unsound.)*

All queries below are SELECT-only against `pg.data_lake.listing_state`, run 2026-07-11 (live: 34,935 rows). Where they differ from `03-lake-live-state.md`, 03 is canonical; the contaminated row-set is bit-stable across both.

---

### 1. THE DECIDING ROWS — the contract's scope contradicts itself

Two rows, one ZIP, `$100` apart, **identical on every attribute the contract can observe**:

| address_key | price | beds | sqft | lot_acres | city/zip | property_type | Contract verdict |
|---|---|---|---|---|---|---|---|
| `19327CONGRESSIONALCT17G:33903` | **$10,000** | 2 | NULL | NULL | N. Fort Myers 33903 | `other` | **PROTECTED** |
| `4324MAILBOXAVE127:33903` | **$9,900** | 2 | NULL | NULL | N. Fort Myers 33903 | `single_family` | **QUARANTINED** |

Query that produced them:
```sql
SELECT property_type, list_price, beds, sqft, lot_acres, city, zip_code, address_key
FROM data_lake.listing_state
WHERE state='active' AND sale_or_rent='sale' AND list_price < 20000
  AND zip_code='33903' AND property_type IN ('other','single_family')
ORDER BY list_price;
```
Full 33903 result — the two buckets **interleave continuously by price**, they do not separate:

```
$5,000  other          2bd 1056sf  9789SPYGLASSCT056G       PROTECTED
$8,900  single_family  1bd NULL    4438HITZINGAVE51         QUARANTINED
$9,900  single_family  2bd NULL    4373HITZINGAVE92         QUARANTINED
$9,900  single_family  2bd NULL    4324MAILBOXAVE127        QUARANTINED
$10,000 other          2bd 1056sf  9804SPYGLASSCT56M        PROTECTED
$10,000 other          2bd NULL    19327CONGRESSIONALCT17G  PROTECTED   <-- twin of 4324MAILBOXAVE127
$10,000 other          2bd 1440sf  9820SPYGLASSCT058E       PROTECTED
$10,900 single_family  2bd NULL    4464MAILBOXAVE143        QUARANTINED
$11,900 single_family  2bd NULL    4270MAILBOXAVE115        QUARANTINED
$11,900 single_family  2bd NULL    4277MAILBOXAVE99         QUARANTINED
$12,000 other          2bd NULL    19440BERMUDACT2E         PROTECTED
$14,900 other          1bd 700sf   19701NTAMIAMITRL28       PROTECTED
$14,900 other          2bd 880sf   17881NTAMIAMITRLLOT7     PROTECTED
$14,900 single_family  1bd NULL    4281HITZINGAVE6          QUARANTINED
$15,900–$19,900: 10 more `other` rows, 2bd, mostly sqft NULL   PROTECTED
```

**Why this is fatal and not a judgment call.** The only difference between the two twin rows is the `property_type` token, and `ingest/pipelines/listing_lifecycle/extract_api.py:91-122` proves that token is **a request-side sweep artifact, not a vendor field**:

> *"`/search` returns NO property-type field on any row (verified live 07/07/2026 against every real-estate endpoint) — property_type is a request-side FILTER only. `type_hint` is the filter value … With no hint … falls back to the land heuristic (no beds + a lot_sqft), else `"other"`."*
> ```python
> if type_hint:            ptype = map_property_type(type_hint)   # :117-118
> elif beds is None and lot_sqft:  ptype = "land"                 # :119-120
> else:                    ptype = "other"                        # :121-122
> ```

So `property_type` here encodes **which sweep happened to return the row**, carrying zero information about whether the row is a home sale. The contract scopes its floor on that token — so it inherits the noise.

**The proposal cannot hold both of its own claims.** Its §0 premise is *"the 61 sub-$20k `other` rows are legit manufactured homes in N. Ft. Myers land-lease parks — the spec would have wrongly quarantined them."* Take that as true, and `4324MAILBOXAVE127:33903` — same city, same ZIP, same beds, same NULL sqft/lot, $100 cheaper — is equally legitimate, and the contract **drops it**. Take it as false, and `19327CONGRESSIONALCT17G:33903` is contamination the contract **passes**. Either way the scope is wrong. No external judgment about what a mobile home "really" sells for is required — the contradiction is internal.

Live counts: **7 of the 21 quarantined `single_family` rows are this Hitzing/Mailbox Ave 33903 cluster** (all sqft-NULL, beds-present, 1–2bd, $8,900–$14,900):
```sql
SELECT list_price, beds, address_key FROM data_lake.listing_state
WHERE state='active' AND sale_or_rent='sale' AND property_type='single_family'
  AND sqft IS NULL AND (address_key ILIKE '%HITZING%' OR address_key ILIKE '%MAILBOX%')
ORDER BY list_price;
-- 7 rows: $8,900 / $9,900 / $9,900 / $10,900 / $11,900 / $11,900 / $14,900
```
The harm is concrete: `policy: quarantine` per the proposal's own §3 *"Drop the 30 … merge the clean rest"* — so these 7 are **removed from the lake**, in a region where `land_manufactured_swfl` is a knowingly-parked pipeline (03 §1d) and manufactured grain is an acknowledged gap. The contract would delete the only manufactured-home rows we hold.

---

### 2. Known-bad rows the contract WRONGLY LETS THROUGH (the too-loose leak, same mechanism)

The proposal justifies protecting `other` by its attribute profile (*"2bd/540–1,710 sqft"*). **Two of the 61 have none of those attributes:**

```sql
SELECT list_price, beds, sqft, lot_acres, city, zip_code, address_key
FROM data_lake.listing_state
WHERE state='active' AND sale_or_rent='sale' AND property_type='other' AND list_price < 20000
ORDER BY list_price ASC LIMIT 2;
```
| address_key | price | beds | sqft | lot_acres | Contract verdict |
|---|---|---|---|---|---|
| `2141SAINTCROIXAVE:33905` (Fort Myers) | **$600** | NULL | NULL | NULL | **PASSES** |
| `11180LAAKSOLN:34114` (Naples) | **$625** | NULL | NULL | NULL | **PASSES** |

By the proposal's own criteria these are not manufactured homes — they have no structure at all, and $600/$625 are canonical monthly-rent magnitudes. The proposal's §2b explicitly folds the `$600` minimum into the "legit manufactured" range. That is an overclaim, and both rows flow straight into `listing_active_stats` (03 §4a: **no property_type filter anywhere in the view**).

---

### 3. Abort-share math — reproduces, with one internal inconsistency in the proposal

```sql
SELECT
 (SELECT COUNT(*) FROM data_lake.listing_state WHERE state='active' AND sale_or_rent='sale' AND list_price IS NOT NULL) AS denom_active,      -- 29,535
 (SELECT COUNT(*) FROM data_lake.listing_state WHERE sale_or_rent='sale' AND list_price IS NOT NULL) AS denom_locusA,                          -- 34,924
 (SELECT COUNT(*) FROM data_lake.listing_state WHERE state='active' AND sale_or_rent='sale' AND list_price<20000 AND property_type NOT IN ('land','other')) AS viol_active,   -- 30
 (SELECT COUNT(*) FROM data_lake.listing_state WHERE sale_or_rent='sale' AND list_price<20000 AND property_type NOT IN ('land','other')) AS viol_locusA;                       -- 41
```

| Claim | Proposal | Live | Status |
|---|---|---|---|
| Violations, Locus B (active) | 30 | **30** | ✓ |
| Violations, Locus A (all states) | 41 | **41** | ✓ |
| Share, Locus B | 0.102% | 30 / 29,535 = **0.1016%** | ✓ reproduces |
| Share, Locus A | "30 / 29,907 = 0.100%" | **41 / 34,924 = 0.117%** | ✗ **internally inconsistent** — mixes a Locus-B numerator (30) with a Locus-A denominator. Secondary; does not move the verdict. |

**The abort rule itself is fine and I am not asking for a change.** `share_pct_gt: 1.0 AND violations_gte: 50` cannot fire on any scoping of today's data (worst case: naive `<> 'land'` = 0.308%), and the `violations_gte: 50` floor correctly protects the small recovery batches (7 / 169 / 173 / 361 rows — 03 §6). Keep both conditions. The defect is upstream of the abort math: **the wrong rows are being counted.**

---

### 4. CORRECTED CONTRACT — drop the `property_type` scope entirely; key on attributes the vendor actually sends

```yaml
  data_lake.listing_state:
    content_contracts:
      # R1 — FOOTPRINT FLOOR. Token-free: a detached-home footprint at a non-home price.
      # Immune to the sweep artifact AND to the `residential`-new-token risk, because it
      # never reads property_type.
      - name: sale_price_floor_home_footprint
        type: range
        col: list_price
        where: "sale_or_rent = 'sale' AND list_price IS NOT NULL
                AND sqft IS NOT NULL AND sqft >= 1000
                AND lot_acres IS NOT NULL AND lot_acres >= 0.10"
        op: gte
        min: 20000
        policy: quarantine
        abort_if: { share_pct_gt: 1.0, violations_gte: 50 }
        locus: both
        severity: error

      # R2 — ZERO-ATTRIBUTE JUNK. No beds, no sqft, no lot, rent-magnitude price.
      # These are the two rows the proposal PROTECTS.
      - name: sale_price_zero_attribute_junk
        type: range
        col: list_price
        where: "sale_or_rent = 'sale' AND list_price IS NOT NULL
                AND beds IS NULL AND sqft IS NULL AND lot_acres IS NULL"
        op: gte
        min: 2000
        policy: quarantine
        abort_if: { share_pct_gt: 1.0, violations_gte: 50 }
        locus: both
        severity: error
```

**Verified hit-counts (both loci):**

| Rule | Locus A (all states — what `evaluate_batch()` sees) | Locus B (active) |
|---|---|---|
| R1 footprint | **17** | 12 |
| R2 zero-attribute | **2** | 2 |
| **Total** | **19 / 34,924 = 0.054%** | 14 / 29,535 = 0.047% |

**R1's robustness does not rest on the footprint inference — it rests on a sentinel-value tell.** `15 of R1's 17 Locus-A hits are at exactly $5,000` (`SELECT ... AND list_price = 5000` → 15). Twelve rows at a bit-identical price with real sqft (1,235–2,381) on real lots (0.10–0.25 ac) in Cape Coral / Lehigh / Fort Myers is a placeholder, not a market. `R1_types_touched = 1` — it hits only `single_family` empirically, while never *reading* the token.

**The 2 non-$5,000 R1 hits are the strongest single argument for R1, and Locus B never sees them:**
```
state='holding'  $2,325  4bd 1,937sf 0.162ac  12312AMBERWAVESRD:33974  (Lehigh Acres)
state='holding'  $2,475  4bd 2,032sf 0.150ac  14882PORTICOBLVD:33905   (Fort Myers)
```
A 4bd/2,000sf house on a 0.15-acre lot at $2,325 is an unmistakable monthly rent. Both sit in `state='holding'` — **the proposal's active-only Locus-B framing is blind to them.** R1 at Locus A catches both.

**I am not claiming R1 is fixture-independent.** A genuine sub-$20k footprint-home sale (burnt shell, teardown) would be a false quarantine. Its two defensible virtues, stated exactly: **(a) it is token-free**, so it cannot be flipped by a vendor sweep change or a new type token, and **(b) its dominant signal is an exact-value cluster, not a price inference.**

---

### 5. What a scalar range provably CANNOT do — do not let R1/R2 be mistaken for the fix

- **The Marco Island / Naples condo cluster (9 rows) is not scalar-separable.** The proposal catches it, but only as a side effect of the unsound token scope, and at the cost of §1's 7 rows. My R1/R2 miss it (1bd, 728–855 sqft, no lot). And a ZIP-relative rule does not rescue it cleanly either: 34145 has 7 sub-$20k rows against a $949,000 non-land median (100× below), but **33912 has 10 sub-$20k rows against a $342,000 median** — the Six Lakes / Iguana Ct / Villa Ct manufactured co-op park, structurally identical to the Marco rent artifacts. Any percentile-of-ZIP-median threshold that catches Marco also flags Six Lakes. **Recommendation: leave the Marco cluster out of the `range` contract, and open a `checks` entry (RULE 2.4) for a ZIP-relative outlier contract type — do not pretend a rescoped floor covers it.**
- **The range contract touches ~0.1% of rows and does not touch the shipping error.** The live 10× median defect is the land blend (03 §4a): land is ~26% of Lee+Collier active-sale inventory and drives ZIP 33972 to a reported *"median asking price $35,000"* against a $354,999 single-family median. The range contract correctly leaves land alone (those lots are legitimately cheap) — which means it is **not** the fix for the number that is currently shipping. That fix is a `property_type` filter on `listing_active_stats`.

---

### 6. Corrected replay fixture (Fable 5 must assert all six)

| Assertion | Expected |
|---|---|
| R1 flags at Locus A | **17** (15 at exactly $5,000; 2 in `state='holding'` at $2,325 / $2,475) |
| R2 flags | **2** (`2141SAINTCROIXAVE:33905` $600, `11180LAAKSOLN:34114` $625) |
| `4324MAILBOXAVE127:33903` ($9,900, 2bd, sqft NULL) | **0 flagged** — and must have the *same* verdict as its twin `19327CONGRESSIONALCT17G:33903`. **This is the regression test for the whole class.** |
| `land` sub-$20k lots | **0 flagged** (522 live / 523 in 03) |
| `other` sub-$20k manufactured, attribute-bearing | **0 flagged** (59 of 61; the 2 attribute-less ones are R2 hits) |
| `leepa_parcels.last_sale_amount` $1–9,999 | **0 flagged** — 41,510 of 528,130 non-null (03 §4d). Protected by table-scoping; no price contract authored. A naive `>= 20000` floor here would quarantine **71,388** legitimate quitclaim/family transfers. |

**Bottom line:** `min: 20000` is defensible. `where: property_type NOT IN ('land','other')` is not — it keys the gate on a request-side sweep artifact (`extract_api.py:117-122`), and the live 33903 rows prove it assigns opposite verdicts to indistinguishable listings. Replace the token scope with the attribute scope (R1 + R2), keep the abort rule as written, and route the Marco cluster to a separate contract type.

---

# DERIVATION — sql_expectation

## Contract thresholds — `sql_expectation` + `range` (derived against the 2026-07-11 lake)

**Anchor:** `docs/audit/2026-07-11-pipeline-problems/03-lake-live-state.md` §4a/§4b/§4d is the **canonical fixture snapshot**. Every threshold below is set against it. Fresh SELECT-only lake queries (run later on 2026-07-11, same day) were used only to (a) confirm the shape still holds and (b) compute the abort share cleanly. Where live counts drift from `03`, both are shown and **`03` is authoritative for the §9a replay fixture.**

| Quantity | `03` canonical (fixture) | Live re-query 2026-07-11 | Note |
|---|---|---|---|
| `listing_state` total rows | 34,703 | 34,935 | `active_listings` lands rows through the day — expected drift |
| Non-land, active/sale, `list_price < 20000` | **91** (other 61 · SF 21 · condo 9) | **91** (other 61 · SF 21 · condo 9) | identical |
| Land, active/sale, `< $20k` (protected) | 523 | 522 | one lot moved/delisted |
| `leepa_parcels.last_sale_amount` $1–9,999 (protected) | 41,510 / 528,130 non-null | **41,510 / 528,130** | byte-identical, unchanged |
| ZIP 33972 blend | land 918 @ $29.5k + SF 385 @ $354,999 → **$35,000** | land 913 + homes 403 → homes median **$359,000** (view now correct) | hotfix `c9748a6c` applied |
| `market_details_swfl` 33972 | sold $30,000 / rent $1,950 = 15.4x | **unchanged** (both captures) | still live-contaminated |

---

## 0. Finding that changes the spec's premise — READ BEFORE SETTING THE FLOOR

**Spec §5 says the `range` contract is "non-land sale price ≥ $20k" and Locus A should "drop 91 bad of 34k." That would delete ~60 rows of real inventory.**

`ingest/pipelines/listing_lifecycle/constants_api.py:73` (verbatim):

> `# ... Land and manufactured/mobile are NOT filterable at all (confirmed in docs); land keeps the existing beds-is-None-and-lot_sqft heuristic, manufactured has no reliable signal yet and falls to "other".`

So `property_type = 'other'` is, **by design**, where manufactured/mobile homes land. The live `other` bucket bears this out: n=1,502, p10 $34,050, median $124,900 — a manufactured-home price band, not a rental band. And the sub-$20k `other` rows are land-lease park inventory with real beds/sqft and null `lot_acres` (you buy the coach, you lease the lot):

```
other | $16,500 | 2bd | 1,710 sqft | North Fort Myers 33903 | "9878 Tamarronct50O"
other | $15,900 | 2bd | 1,250 sqft | North Fort Myers 33903 | "19260 Indianwellsct31H"
other | $14,900 | 2bd |   880 sqft | North Fort Myers 33903 | "17881 Ntamiamitrllot7"
other | $13,500 | 2bd | 1,104 sqft | North Fort Myers 33917 | "635 Wayfarers Way"
```
(Old Bridge Village / Tamiami Village / Pioneer Village — 55+ land-lease parks. A $14,900 sale there is real.)

The cohort is **mixed and not cleanly splittable at load**: the $10k–$19.9k `other` rows read as real manufactured sales; the $600–$3,000 `other` rows (beds/sqft null) read as rental mislabels. There is no reliable in-batch discriminator.

**Therefore:** the blocking floor is scoped to the four **unambiguous** residential types, which contain **30** of the 91 — including the entire Marco Island `10 Tampa Pl` cluster (7 condos @ $6k–$9k, 1bd/728–855 sqft — no Marco condo sells for $7,000). The remaining 61 `other` rows get a **warn-only** contract: visible, never quarantined.

This does **not** conflict with the shipped hotfix. `20260711_listing_active_stats_homes_only.sql:44`'s `list_price >= 20000` is a **display** predicate on a view (the 61 rows stay in the lake, and they move a 21k-row median by ~$0). The Locus-A contract **deletes rows** — a strictly higher bar. Keep both at $20,000 so the view and the contract agree on one number; only the *scope* differs.

---

## 1. The contracts — drop-in for `ingest/quality/quality_registry.yaml`

```yaml
tables:

  data_lake.listing_state:
    content_contracts:

      # C1 — RANGE, BLOCKING. "A sales table contains no rental-priced rows."
      # Scope excludes 'land' (523 legit sub-$20k lots) AND 'other' (manufactured/mobile
      # land-lease sales — constants_api.py:73 routes them here with no type signal).
      - id: listing_state_home_price_floor
        type: range
        locus: both                 # A = pre-merge on the batch; B = at-rest probe
        column: list_price
        where: >
          source_name = 'api_feed'
          AND sale_or_rent = 'sale'
          AND state = 'active'
          AND list_price IS NOT NULL
          AND property_type IN ('single_family','condo','townhouse','multi_family')
        operator: ">="
        threshold: 20000
        policy: quarantine
        abort_share_pct: 5.0        # of in-scope rows in the batch
        abort_min_rows: 25          # BOTH must trip — small batches can never abort
        severity: error

      # C1b — RANGE, WARN-ONLY. The manufactured/mobile bucket. NEVER quarantine.
      - id: listing_state_other_price_floor
        type: range
        locus: probe                # report-only; no Locus-A gate
        column: list_price
        where: >
          source_name = 'api_feed' AND sale_or_rent = 'sale' AND state = 'active'
          AND list_price IS NOT NULL AND property_type = 'other'
        operator: ">="
        threshold: 20000
        policy: flag                # surfaces the count; drops nothing
        severity: warn
        note: >
          Mixed cohort: real land-lease manufactured sales ($10k-$19.9k, beds+sqft present)
          AND probable rental mislabels ($600-$3,000, beds/sqft null). Not separable at load.
          Re-scope to `quarantine` ONLY if PROPERTY_TYPE_MAP gains a working `manufactured` signal.

  data_lake.listing_active_stats:
    content_contracts:

      # C2 — SQL_EXPECTATION, at-rest tripwire on the VIEW. "Median asking price counts homes only."
      # Two legs; the contract FAILS if either returns > 0 rows.
      - id: listing_active_stats_land_blend_tripwire
        type: sql_expectation
        locus: probe                # a view has no pipeline — Locus B is the ONLY option
        grain_filter: "zip_code IS NOT NULL AND county IS NOT NULL AND listing_count >= 30"
        legs:
          - id: leg1_view_definition_regression
            # Shipped ZIP median vs an INDEPENDENT literal re-derivation from listing_state.
            # Correct state == exactly 1.000. Fires the instant land (or the <$20k floor) re-enters.
            expect: "view.median_list_price >= 0.98 * ref.median_homes_only"
          - id: leg2_absolute_floor
            # Property-type-INDEPENDENT backstop: catches label corruption leg1 is blind to.
            expect: "view.median_list_price >= 75000"
        policy: alert               # opens a public.checks row; never drops/aborts
        severity: error

  data_lake.market_details_swfl:
    content_contracts:

      # C3 — SQL_EXPECTATION, cross-column. Sold/rent ratio band.
      # Read the rate AS WRITTEN (data-protocol v3 rule 4): `sold_to_rent_ratio` is the vendor's
      # own sold ÷ ANNUAL rent (verified: 0 of 49 rows deviate >2% from sold/(12*rent)).
      - id: market_details_sold_rent_band
        type: sql_expectation
        locus: both                 # A if run_details' batch carries the 3 columns; else B at-rest.
                                    # Threshold is identical either way.
        where: "median_sold_price IS NOT NULL AND median_rent_price IS NOT NULL"
        expect: "sold_to_rent_ratio BETWEEN 4.0 AND 40.0"   # annual == 48x-480x MONTHLY rent
        policy: quarantine          # withhold the ZIP row; a number we can't stand behind doesn't ship
        abort_share_pct: 5.0
        abort_min_rows: 25          # 54-row table can NEVER abort — see §3 worked example
        severity: error
```

**Threshold derivations, from the live distributions:**

| Threshold | Derivation | Margin |
|---|---|---|
| **C1 `>= $20,000`** | Highest offender in scope = **$14,900** (SF). Lowest retained = **$22,000** (SF, 33905). Condo gap is clean: offenders max $10,000 → lowest retained **$39,900** (4.0x). Townhouse live min $79,900; multi_family $99,000. | 1.34x below lowest retained / 1.34x above highest offender (SF is the tight one — stated honestly). Matches the shipped view's literal → **one authority for the number.** |
| **C2 leg1 `>= 0.98 ×`** | View and reference are the same predicate over the same table → correct state = **exactly 1.000** (verified: 45 ZIPs, `min_ratio = 1.00000`). Tolerance is pure rounding slack. Counterfactual (filter dropped): worst ZIP ratio **0.096** (33972), 0.097 (33974), 0.577 (33909)… worst-case *any* land-bearing ZIP ≤ **0.945**. | 0.98 sits below every correct value (1.000) and above every re-blend value (≤0.945). |
| **C2 leg2 `>= $75,000`** | Lowest **legit** shipped ZIP median (n≥30) = **$139,900** (33903, 543 homes, only 5.8% land — a genuinely cheap ZIP, not contamination). Worst contaminated value pre-hotfix = **$31,360** (33974) / $35,000 (33972). Geometric mean of 35,000 and 139,900 = $69,970. | 1.87x below lowest legit / 2.14x above worst known-bad. |
| **C3 band `4.0 – 40.0` annual** | Ordered live distribution (n=49, latest capture): **1.28** (33972 — bad) · **1.90** (33920 — bad) · ▲**gap 3.7x**▲ · **7.12** (33903 — LEGIT) · 7.38 · 8.39 · 8.42 · … median 11.4 · … **21.14** (33914 — LEGIT max). Lower cut = geometric mean of 1.90 and 7.12 = **3.68 → 4.0**. Economically: price-to-rent < 4 means a home repays its price in <4 years of gross rent — impossible in SWFL. Upper = **40.0** (< 2.5% gross yield — nationally extreme). | Lower: 1.78x below lowest legit / 2.11x above worst bad. Upper: 1.89x above highest legit. |

**Correction to the task's characterization:** "typical 100–200x" undersells the real legit spread. Live monthly `sold ÷ rent` runs **85.5x → 253.7x** (p05 86.7 · p25 116.9 · p50 136.8 · p75 176.1 · p95 229.8). A naive 200x-monthly cap would **false-fire on 33914 Cape Coral (253.7x) and 34105 Naples (240x), both legit.** The band above is data-derived, not derived from that characterization.

---

## 2. Defining queries + row-sets (the Fable-5 replay fixture)

### 2a. C1 — the offending rows (BLOCKING scope): **30 rows**

```sql
SELECT property_type, list_price, beds, sqft, city, zip_code, street_address, address_key
FROM data_lake.listing_state
WHERE source_name = 'api_feed' AND sale_or_rent = 'sale' AND state = 'active'
  AND list_price IS NOT NULL
  AND property_type IN ('single_family','condo','townhouse','multi_family')
  AND list_price < 20000
ORDER BY property_type, list_price;
```
Live + `03`-consistent result — **30 rows, 0 townhouse, 0 multi_family:**

| property_type | n | min | median | max |
|---|---|---|---|---|
| single_family | 21 | $2,000 | $5,000 | $14,900 |
| condo | 9 | $1,800 | $7,000 | $10,000 |

Cleanest individual signal, verbatim (the fixture's hero rows — all 1bd, 728–855 sqft, one building):
```
condo $9,000  Marco Island 34145  "10 Tampapl303"   (855 sqft)
condo $7,000  Marco Island 34145  "10 Tampapl1"     (855 sqft)
condo $7,000  Marco Island 34145  "10 Tampapl404"   (728 sqft)
condo $7,000  Marco Island 34145  "10 Tampapl5"     (728 sqft)
condo $7,000  Marco Island 34145  "10 Tampapl2"     (855 sqft)
condo $7,000  Marco Island 34145  "10 Tampapl3"     (855 sqft)
condo $6,000  Marco Island 34145  "10 Tampapl203"   (855 sqft)
condo $1,800  Fort Myers   33908  "17230 Terraverde Cir #7"
condo $10,000 Naples       34110  "201 Arborlake Dr #205"
single_family $5,000 ×N  Lehigh Acres 33971/33974/33972, Cape Coral 33904, Fort Myers 33901/33966
single_family $2,000 / $3,000  North Fort Myers 33917
```

### 2b. C1 — the WARN-only rows (`other`): **61 rows** (the 91 − 30 remainder)

```sql
SELECT list_price, beds, sqft, lot_acres, city, zip_code, street_address
FROM data_lake.listing_state
WHERE source_name='api_feed' AND sale_or_rent='sale' AND state='active'
  AND property_type = 'other' AND list_price IS NOT NULL AND list_price < 20000
ORDER BY list_price;
```
61 rows ($600–$19,900; 60 core-county + 1 Hendry). **Must NOT be quarantined** — see §0.

### 2c. FALSE-POSITIVE TRAP #1 — 523 legit sub-$20k land lots are PROTECTED

```sql
-- The C1 blocking WHERE-clause, run against the land population. MUST return 0.
SELECT count(*) AS would_be_quarantined
FROM data_lake.listing_state
WHERE source_name='api_feed' AND sale_or_rent='sale' AND state='active'
  AND list_price IS NOT NULL AND list_price < 20000
  AND property_type IN ('single_family','condo','townhouse','multi_family');  -- 'land' NOT in the list
-- -> 30 (none of them land)

-- The protected population itself (03 §4b: 523; live: 522 — one lot moved):
SELECT count(*) FROM data_lake.listing_state
WHERE source_name='api_feed' AND sale_or_rent='sale' AND state='active'
  AND property_type = 'land' AND list_price BETWEEN 1 AND 19999;
-- -> 522  (min $700, median $18,000, max $19,999 — real Lehigh Acres / Golden Gate Estates lots)
```
**Protection mechanism: `property_type` allowlist in the WHERE-scope.** Land is never in scope, so no threshold can reach it.

### 2d. FALSE-POSITIVE TRAP #2 — 41,510 LeePA nominal-consideration transfers are PROTECTED

```sql
SELECT count(*) AS nominal_transfers,
       (SELECT count(*) FROM data_lake.leepa_parcels WHERE last_sale_amount IS NOT NULL) AS nonnull
FROM data_lake.leepa_parcels WHERE last_sale_amount BETWEEN 1 AND 9999;
-- -> 41,510 / 528,130  (7.86%) — EXACTLY matches 03 §4d, unchanged
```
**Protection mechanism: table-scoping.** `quality_registry.yaml` is keyed by physical table; `data_lake.leepa_parcels` carries **no price contract** (only `folioid` not_null/unique, existing). Quitclaims / family transfers / non-arm's-length deeds recorded at nominal consideration are the correct value for that column. Any future price contract on `leepa_parcels` is a **regression** — the acceptance test should assert the contract list for that table stays price-free.

### 2e. C2 — the land-blend tripwire (defining query; **0 rows today**)

```sql
WITH ref AS (   -- independent literal re-derivation; NEVER SELECT from the view here (circular)
  SELECT btrim(county) AS county, zip_code,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY list_price))::bigint AS median_homes_only
  FROM data_lake.listing_state
  WHERE source_name='api_feed' AND state='active' AND sale_or_rent='sale'
    AND list_price IS NOT NULL AND btrim(county) IN ('Lee','Collier')
    AND property_type <> 'land' AND list_price >= 20000 AND zip_code IS NOT NULL
  GROUP BY 1,2
), v AS (
  SELECT county, zip_code, listing_count, median_list_price
  FROM data_lake.listing_active_stats
  WHERE zip_code IS NOT NULL AND county IS NOT NULL AND listing_count >= 30
)
SELECT v.county, v.zip_code, v.listing_count, v.median_list_price, ref.median_homes_only,
       round(v.median_list_price::numeric / ref.median_homes_only, 4) AS ratio
FROM v JOIN ref USING (county, zip_code)
WHERE v.median_list_price < 0.98 * ref.median_homes_only   -- leg 1
   OR v.median_list_price < 75000;                          -- leg 2
```
**Live result 2026-07-11: 45 ZIPs tested, `min_ratio = 1.00000`, min shipped median $139,900, 0 violations — contract PASSES clean post-hotfix.**

**Replay against the `03` pre-hotfix snapshot (the §9a deliberate-failure proof) → leg1 + leg2 both fire:**

| ZIP | listing_count | shipped median | homes-only ref | ratio | leg1 (<0.98) | leg2 (<$75k) |
|---|---|---|---|---|---|---|
| 33972 | 1,325 | $35,000 | $359,000 | **0.0975** | FIRE | FIRE |
| 33974 | 1,981 | $31,360 | $325,000 | **0.0965** | FIRE | FIRE |
| 33909 | 1,291 | $199,000 | $344,840 | 0.577 | FIRE | pass |
| 33993 | 2,170 | $245,000 | $389,900 | 0.628 | FIRE | pass |
| 34117 | 363 | $510,000 | $678,389 | 0.752 | FIRE | pass |
| 33903 (legit, cheapest ZIP) | 543 | $139,900 | $139,900 | 1.000 | pass | pass |

`min listing_count = 30` is load-bearing: it drops the n=1 phantom ZIPs `03` §4a listed (33975 @ $20,000 · 33095 · 33467 · 33792 · 34139) and the cross-county leak (Collier/33971, n=7 — open check `active_listings_zip_county_contamination`).

### 2f. C3 — the sold/rent band (defining query; **2 rows today**)

```sql
SELECT zip_code, county, median_sold_price, median_rent_price, sold_to_rent_ratio,
       round(median_sold_price::numeric / median_rent_price, 1) AS monthly_multiple
FROM data_lake.market_details_swfl
WHERE captured_date = (SELECT max(captured_date) FROM data_lake.market_details_swfl)
  AND median_sold_price IS NOT NULL AND median_rent_price IS NOT NULL
  AND sold_to_rent_ratio NOT BETWEEN 4.0 AND 40.0;
```
**OFFENDERS (both captures, 07/05 + 07/08):**

| zip | county | median_sold | median_rent | `sold_to_rent_ratio` (annual) | monthly |
|---|---|---|---|---|---|
| **33972** | Lee | $30,000 | $1,950 | **1.28** | 15.4x |
| **33920** | Lee | $88,750 | $3,900 | **1.90** | 22.8x |

**33920 (Alva) is a second, previously-unnamed instance of the same bug — `03` §4d only named 33972.** Corroboration from our own inventory: 33920 is **84.3% land** (102 of 121 active/sale rows), all-types median **$26,500** vs homes-only median **$359,000** (only 19 homes). Its vendor sold-aggregate is land-dragged by the same mechanism.

**PROTECTED (the band's false-positive traps) — the two lowest LEGIT ZIPs:**

| zip | county | median_sold | median_rent | annual ratio | monthly | why legit |
|---|---|---|---|---|---|---|
| 33903 | Lee | $149,575 | $1,750 | **7.12** | 85.5x | only **5.8% land**; homes median $139,900 — a genuinely cheap North Fort Myers ZIP |
| 34113 | Collier | $580,000 | $6,547 | **7.38** | 88.6x | only **2.8% land**; homes median $525,000 |
| 33914 | Lee | $520,000 | $2,050 | **21.14** (max) | 253.7x | legit high-multiple Cape Coral — **a 200x-monthly cap would false-fire this** |

5 rows have NULL `median_rent_price` (1 Lee, 4 Collier) — they pass the band **vacuously** via the `IS NOT NULL` scope. That is intentional: a NULL rent is a coverage gap, not a contamination, and `check_freshness`'s volume floor already owns it.

---

## 3. Policy — quarantine vs abort, and the exact share

**Design rule:** abort requires **BOTH** a share breach **AND** an absolute-count breach. A share-only rule makes a 49-row table abort on 3 rows; a count-only rule makes a 34k-row table abort on noise. Both gates together are the only formulation that survives the real batch sizes here.

```
abort  ⇔  (offenders / in_scope_rows_in_batch  >  5.0%)  AND  (offenders  >=  25)
otherwise → quarantine (drop the offending rows, merge the clean rest)
```

**Real contamination shares — computed both ways, so the 5% cut holds under either scoping:**

| Scoping | offenders / in-scope | share | vs 5.0% cut |
|---|---|---|---|
| Task/`03` canonical (91 vs whole table) | 91 / 34,703 | **0.262%** | 19x headroom |
| Refined C1 blocking scope (4 types) | 30 / 19,809 | **0.151%** | **33x headroom** |
| Broad non-land scope (the 91) | 91 / 21,400 | **0.425%** | 12x headroom |
| **Worst single batch** — Lee county sweep, non-land scope | 78 / 14,110 | **0.553%** | **9x headroom** |
| Lee county sweep, C1 blocking scope | 22 / 12,940 | 0.170% | 29x |
| Collier county sweep, C1 blocking scope | 8 / 6,470 | 0.124% | 40x |

**Under every scoping — including the task's own 91 — the share is < 0.6%.** A 5.0% cut therefore **cannot** abort a 34k load over 91 rows (or 30). On a 14,110-row Lee sweep, 5% = **706 rows** — a number reachable only by a genuine feed-shape change (e.g. the vendor's `/search` endpoint starts returning monthly rents). That is exactly the event abort is for.

**`abort_min_rows: 25` — the worked example that proves it's load-bearing.** `market_details_swfl` latest capture = 54 rows / 49 in-scope, 2 offenders = **4.08%** → quarantine (under 5%). If a **third** ZIP went land-contaminated: 3/49 = **6.1% > 5%** → a share-only rule would **abort the entire market-aggregates load over 3 known-bad ZIPs.** The `>= 25` absolute gate blocks that: 3 < 25 → quarantine. A 54-row table can never abort under this policy, which is correct — a tiny table's "share" is not a shape signal.

**Per-contract policy:**

| Contract | Policy | Rationale |
|---|---|---|
| **C1** `listing_state_home_price_floor` | **quarantine** (abort at 5% ∧ ≥25) | 30 unambiguous rental mislabels dropped pre-merge. The clean 19,779 land. |
| **C1b** `listing_state_other_price_floor` | **flag / warn — NEVER quarantine** | Would destroy ~61 rows including real land-lease manufactured sales (§0). Report-only until `PROPERTY_TYPE_MAP` gains a working `manufactured` signal. |
| **C2** `listing_active_stats_land_blend_tripwire` | **alert only** (open a `public.checks` row) | It's a **view**. There is no batch, nothing to quarantine, and nothing to abort. Locus B is the only locus a view has. Its job is to red the table the moment the display predicate regresses. |
| **C3** `market_details_sold_rent_band` | **quarantine** (abort at 5% ∧ ≥25) | Withhold the ZIP row entirely. We cannot decompose a vendor aggregate, so we cannot repair it — and a number we can't stand behind doesn't ship. `market-temperature-swfl` reads 47 ZIPs instead of 49. *(Alternative if row-drop is too blunt: NULL only `median_sold_price` + `sold_to_rent_ratio` and keep DOM/hotness. That is a **repair**, not a quarantine, and needs a fourth policy verb — flagged, not recommended.)* |

---

## 4. The discriminating test — how a verifier makes each contract WRONGLY fire / WRONGLY miss

**C2 leg1 (view-definition regression guard) wrongly MISSES the whole class if the corruption is upstream of the label.** If `property_type` labels flip — land rows written as `single_family` by a normalizer regression — leg1's reference re-derivation inherits the *same* corrupted label, so `ratio ≡ 1.000` and it passes. Leg2 ($75k floor) is the only thing that catches it, and **only in high-land ZIPs**: 33972 would drag to ~$35k (< $75k → FIRE), but a 10%-land ZIP would drag to ~$300k and pass both legs silently. **Leg1 is a view-definition guard; leg2 is the actual contamination catch — do not claim leg1 covers label corruption.** *(A genuinely independent leg would compare the shipped ZIP median against `data_lake.zhvi_zip_latest` for the same ZIP — a source that shares no code path with `property_type`. Not built here; named as the real fix for the blind spot.)*

**C2 wrongly FIRES** on a legit row if the `min listing_count` gate is removed: `03` §4a's n=1 ZIPs (33975 @ $20,000, 33095 @ $28,000, 33467 @ $30,000, 33792 @ $39,900) all sit under the $75k floor and are *correct* one-listing medians — a `listing_count >= 30` gate is the only thing standing between leg2 and 4 guaranteed false positives.

**C1 wrongly FIRES** the instant `'other'` (or `'land'`) is added back to the WHERE-scope — 61 + 522 legit rows quarantined, including real land-lease manufactured-home sales and real Lehigh Acres lots. The `property_type` allowlist **is** the false-positive protection; widening it is the regression. Symmetrically, **C1 wrongly MISSES** a rental mislabel that lands above $20,000 (e.g. a $50k/season Fort Myers Beach luxury rental tagged `sale`) — the exact residual `active_listings/distill.py:131-136` already admits to in its own comment. The floor buys the obvious class, not the tail.

**C3 wrongly MISSES** any ZIP where sold *and* rent are contaminated **proportionally** (both land-dragged, or both rent-scaled) — the ratio stays in band and nothing fires. **C3 wrongly FIRES** on a legit high-yield ZIP if the upper bound is set from the task's "typical 100–200x monthly" characterization rather than the data: a 200x cap kills 33914 (253.7x) and 34105 (240x), both real. The band is derived from the live spread (85.5x–253.7x monthly), and the **only** empty region in that distribution is 22.8x → 85.5x — which is where the 48x-monthly / 4.0-annual floor sits.

---

## 5. Two side-findings for the record (out of scope, but they touch these contracts)

1. **`listing_active_stats` emits two indistinguishable `(county='Lee', zip_code=NULL)` rows** — the `(county)` GROUPING SET (listing_count 14,032) and a real ZIP-less listing (listing_count **1**). Without `GROUPING()`, a consumer reading "the Lee county row" can pick the 1-row phantom. The migration's own NOTE (`20260711_listing_active_stats_homes_only.sql:58-60`) acknowledges the row but not the collision. Scoping C2 to ZIP grain sidesteps it (and is strictly more sensitive than the rollups anyway) — but the view itself should emit a `grain` column.
2. **`sold_to_rent_ratio` is vendor-computed and internally consistent** — 0 of 49 rows deviate >2% from `median_sold_price / (12 × median_rent_price)`. Safe to read as written (data-protocol v3 rule 4). If that ever stops holding, it is itself a feed-shape change worth its own `sql_expectation`.

---

# ADVERSARIAL VERIFICATION — sql_expectation

## Threshold verification — sql_expectation: VERDICT

**Per-contract verdicts (the proposal bundles `range` + `sql_expectation`; both are judged):**

| Contract | Verdict |
|---|---|
| **C1 `listing_state_home_price_floor`** (range, blocking) | **FAILS — TOO-AGGRESSIVE *and* TOO-LOOSE.** It deletes ≥9 verified real for-sale mobile homes and passes 4 verified rental listings. Do not ship as written. |
| **C1b `listing_state_other_price_floor`** (warn-only) | **SOUND but under-scoped** — right policy, wrong population. It protects `other`, but the same cohort also lives in `single_family`. |
| **C2 `listing_active_stats_land_blend_tripwire`** (sql_expectation) | **SOUND thresholds** (0.98 / $75k / `listing_count>=30` all verified live). One real defect: leg1 is **one-sided** — an *inflated* median passes silently. |
| **C3 `market_details_sold_rent_band`** (sql_expectation) | **SOUND.** Band 4.0–40.0 verified against the live n=49 distribution. Two fixes: NULL-ratio three-valued-logic hole; and the pass-side margin is 1.78x, not the 3.7x the proposal implies. |
| **Abort-share math (5% ∧ ≥25)** | **CONFIRMED against live counts.** Denominators reproduce exactly. Abort is unreachable today under any batching — which is the intent. |

---

### 1. C1 is TOO AGGRESSIVE — the row that decides it: a **real, active, for-sale mobile home at $9,900** that C1 quarantines

The proposal's §0 protects manufactured homes by exempting `property_type='other'`, on the strength of `ingest/pipelines/listing_lifecycle/constants_api.py:73` ("manufactured has no reliable signal yet and falls to `other`"). **That premise is only half true, and the missing half is fatal.** `PROPERTY_TYPE_MAP` (`constants_api.py:55-64`) does contain `"manufactured"`/`"mobile"` tokens — and **zero rows in `listing_state` carry `property_type='manufactured'`** (live: `single_family` 13,115 · `land` 7,837 · `condo` 5,640 · `other` 1,591 · `multi_family` 538 · `townhouse` 527). The token never fires because the upstream vendor (realtor.com data) types these units as **"single family home"** — so the manufactured cohort lands in `single_family`, which is squarely **inside C1's blocking scope.**

Live rows C1 would quarantine (`SELECT property_type, list_price, beds, sqft, street_address FROM data_lake.listing_state WHERE source_name='api_feed' AND sale_or_rent='sale' AND state='active' AND property_type IN ('single_family','condo','townhouse','multi_family') AND list_price < 20000`):

| type | price | beds | sqft | address | ZIP |
|---|---|---|---|---|---|
| single_family | **$2,000** | 2 | NULL | 567 Peacect2120 | 33917 |
| single_family | **$3,000** | 3 | NULL | 648 Suwaneedr2190 | 33917 |
| single_family | **$8,900** | 1 | NULL | 4438 Hitzingave51 | 33903 |
| single_family | **$9,900** | 2 | NULL | 4324 Mailboxave127 | 33903 |
| single_family | **$9,900** | 2 | NULL | 4373 Hitzingave92 | 33903 |
| single_family | **$10,900** | 2 | NULL | 4464 Mailboxave143 | 33903 |
| single_family | **$11,900** | 2 | NULL | 4270 Mailboxave115 | 33903 |
| single_family | **$11,900** | 2 | NULL | 4277 Mailboxave99 | 33903 |
| single_family | **$14,900** | 1 | NULL | 4281 Hitzingave6 | 33903 |

**Named outside sources (crawl4ai, 2026-07-11) — all three checked are REAL, ACTIVE, FOR-SALE:**
- **4324 Mailbox Ave #127** — MHVillage: *"Mobile home located at 4324 Mailbox Ave North Fort Myers, FL. 2 beds, 1 baths, **listed for sale at $9900**."* Trulia: *"mobile/manufactured built in 1969… **currently available for sale**, listed by My State MLS on Mar 28, 2026."* realtor.com types it *"single family home for sale"* — the exact mislabel our map inherits.
- **567 Peace Ct #2120** — Trulia: *"2 bed, 2 bath Mobile / Manufactured **listed for $2,000**"*; realtor.com: *"mobile home for sale… in the **River Trails Mobile Home Park**."*
- **648 Suwanee Dr #2190** — Zillow: *"**$3,000** 3 beds, 2 baths manufactured home… built in 1974. MLS #11674570"*; Trulia: *"currently available for sale."*

**And the cohort does not stop at the floor — it runs straight through it.** The identical signature (`single_family`, `sqft IS NULL`, street + lot number) continues above $20,000 with the same park inventory: `6280 Hamiltondrlot20` **$22,000** · `lot14`/`lot13` $23,900 · `lot29` $27,000 · `lot30` $28,900 · `lot12` $29,900 · `lot17` $31,500 (Fort Myers 33905), then **$49,900–$59,900** across ~18 River Trails rows (`447 Suwaneedr2008`, `1041 Myakkadr2098`, `553 Suwaneedr2144`…). **The $20,000 line cuts through the middle of one continuous population of real sales.** It is a cohort-splitter, not a contamination boundary. Quarantine = we delete real SWFL inventory and keep its neighbor.

`property_type` allowlisting — the proposal's *only* false-positive protection ("The `property_type` allowlist **is** the false-positive protection") — is therefore **not a protection at all.** 9 of the 30 rows it calls "unambiguous rental mislabels" are verified real sales. Best-case precision: **21/30 = 70%**.

---

### 2. C1 is ALSO TOO LOOSE — 4 verified **rental** rows sail over the $20,000 floor

Cross-source test: join `listing_state` sale rows to `data_lake.active_listings_residential` rows carrying `listing_type='rent'` on `(zip_code, list_price, beds, sqft)`. That sibling table's rent classifier is the one `03` §4c independently vouches for.

```sql
WITH ls AS (SELECT zip_code,list_price,sqft,beds,property_type,street_address FROM data_lake.listing_state
            WHERE source_name='api_feed' AND sale_or_rent='sale' AND state='active'
              AND property_type IN ('single_family','condo','townhouse','multi_family')
              AND list_price >= 20000 AND sqft IS NOT NULL),
     r  AS (SELECT zip_code,list_price,sqft,beds,street_address FROM data_lake.active_listings_residential
            WHERE listing_type='rent' AND sqft IS NOT NULL)
SELECT * FROM ls JOIN r USING (zip_code,list_price,sqft,beds);   -- -> 4 rows
```

| listing_state (sale, condo) | matched rent row (`listing_type='rent'`) |
|---|---|
| **$39,900** · 1bd/788sf · `201 Arborlakedr2101` · Naples 34110 | 201 Arbor Lake Drive, Unit 2-101 |
| **$40,975** · 1bd/788sf · `201 Arborlakedr2201` | 201 Arbor Lake Drive, Unit 2-201 |
| **$45,000** · 1bd/866sf · `900 Arborlakedr9301` | 900 Arbor Lake Drive, Unit 9-301 (also rents $3,500/mo in the same table → $45,000 = the annual rate) |
| **$49,000** · 1bd/788sf · `900 Arborlake Dr #207` | 900 Arbor Lake Drive, Unit 207 |

These are **annual-rate rentals at Arbor Trace** (Naples 34110), carried into the sale table by `extract_api.py:139`'s hardcoded `"sale_or_rent": "sale"`. C1 catches the same building's `201 Arborlake Dr #205` at $10,000 and **passes the four above it.** *(Dependencies, stated: this leans on the sibling table's rent classifier — vouched in `03` §4c — and on an exact 4-way (zip, price, beds, sqft) match, which does not co-occur by chance. The C1 verdict does not hinge on this leg; §1 already fails it.)*

**And no higher floor can rescue it:** the SAME building has a genuine `listing_type='sale'` row at **$54,900** (`201 Arbor Lake Drive, Unit 2-107`, 1bd/866sf) and another at $95,000. Legit sale $54,900 sits **above** rent $49,000. Price cannot separate this cohort at any threshold.

---

### 3. The structural conclusion — a scalar price floor is the wrong instrument

Two independently verified overlaps kill the whole family of price thresholds:
- **Real manufactured sales span $2,000 → $59,900+** (verified externally at $2,000, $3,000, $9,900) — any floor in that range deletes real inventory.
- **Real rentals reach $49,000 while real sales in the same building start at $54,900** — any floor low enough to spare mobile homes is far too low to catch annual-rate rentals.

The reliable discriminators are **cross-source** (the rent classifier) and **the vendor's own status field** — not price. `sqft`-scoping below is damage control that stops us deleting inventory; it is not a fix for the rental class.

---

### 4. Corrected contract

```yaml
data_lake.listing_state:
  content_contracts:

    # C1 — BLOCKING FLOOR, scoped to rows that carry a sqft. NOT a manufactured test:
    # sqft-null is "missing data" (693 rows in scope, median $439,900) — it only separates
    # the sub-$20k slice, where it splits TRUE-price mobile homes (sqft null, verified real
    # sales at $2k/$3k/$9.9k) from CORRUPTED-price real houses (sqft present — e.g.
    # 526 Wabasso Ave S, Lehigh 33974: carried at $5,000, actually a 1,563sf 2024-built home
    # asking $369,900 (johnrwood MLS 225053370); its `sqft` field even holds lot area, 10,106).
    - id: listing_state_home_price_floor
      type: range
      locus: both
      column: list_price
      where: >
        source_name='api_feed' AND sale_or_rent='sale' AND state='active'
        AND list_price IS NOT NULL AND sqft IS NOT NULL
        AND property_type IN ('single_family','condo','townhouse','multi_family')
      operator: ">="
      threshold: 20000          # unchanged — agrees with the shipped view literal
      policy: quarantine
      abort_share_pct: 5.0
      abort_min_rows: 25
      severity: error
      # live: 21 offenders / 19,116 in-scope = 0.110%. All 21 verified bad. 0 verified-real.

    # C1b — WARN-ONLY, widened. The manufactured / park-inventory cohort, which lives in
    # BOTH `other` AND `single_family` (PROPERTY_TYPE_MAP's `manufactured` token never fires:
    # 0 of 34,935 rows). NEVER quarantine. Also the backstop for the sqft-null blind spot
    # (a sub-$20k rent mislabel with null sqft would pass C1 — 0 occupants today).
    - id: listing_state_low_price_manufactured_watch
      type: range
      locus: probe
      column: list_price
      where: >
        source_name='api_feed' AND sale_or_rent='sale' AND state='active'
        AND list_price IS NOT NULL AND (property_type='other' OR sqft IS NULL)
      operator: ">="
      threshold: 20000
      policy: flag
      severity: warn
      # live: 61 (`other`) + 9 (sqft-null SF) = 70 rows surfaced, 0 dropped.

    # C1c — NEW. The class no price floor can reach: rent listings above the floor.
    - id: listing_state_rent_crosssource_match
      type: sql_expectation
      locus: probe                # active_listings_residential is a daily table, not a batch
      expect: >
        NOT EXISTS (SELECT 1 FROM data_lake.active_listings_residential r
                    WHERE r.listing_type='rent'
                      AND r.zip_code=listing_state.zip_code
                      AND r.list_price=listing_state.list_price
                      AND r.sqft=listing_state.sqft
                      AND coalesce(r.beds,-1)=coalesce(listing_state.beds,-1))
      policy: quarantine
      severity: error
      # live: 4 rows above $20k (Arbor Trace $39,900/$40,975/$45,000/$49,000) + the sub-$20k
      # Marco 10 Tampa Pl cluster. PARTIAL NET, stated honestly: the sibling table covers only
      # 82 ZIPs / 6,592 rent rows and is itself stale (03 §4c) — this is a floor on the leak,
      # not a ceiling. The real fix is a vendor status/listing-type field.
```

**C2 — one change.** Thresholds verified: 45 ZIPs tested, `min_ratio = 1.00000`, min shipped median $139,900 (33903), 0 violations; the `listing_count >= 30` gate is genuinely load-bearing (it alone suppresses the n=1 phantom ZIPs `03` §4a lists). But **leg1 is one-sided** — it fires only when the view median *drops*. A regression that *inflates* it (e.g. the view's `list_price >= 20000` literal fat-fingered to `200000`) passes silently. Make it two-sided: `view.median_list_price BETWEEN 0.98*ref AND 1.02*ref`.

**C3 — SOUND, two fixes.** Live latest capture: 49 in-scope rows, offenders exactly **2** — `33972` (Lee, sold $30,000 / rent $1,950, ratio **1.28**, its inventory 69.3% land, homes-only median $359,000) and `33920` (Lee, $88,750 / $3,900, ratio **1.90**, **84.3% land**). Nearest legit: `33903` at **7.12** (5.8% land) and `34113` at 7.38; max legit `33914` at **21.14** (253.7x monthly — the proposal is right that a naive 200x-monthly cap false-fires it). Fixes: (a) **`sold_to_rent_ratio IS NULL OR NOT BETWEEN 4.0 AND 40.0`** — three-valued logic silently passes a NULL ratio (0 today, live-checked); (b) state the real margin honestly — the pass-side gap is **1.78x** (4.0 → 7.12), not 3.7x. **Named blind spot:** the band catches only *extreme* land-drag. A ZIP dragged to ~$150k sold with a $1,900 rent lands at ratio ~6.6 — inside the band, passes. No live occupant today.

**Abort math — CONFIRMED.** Live denominators reproduce the proposal exactly: Lee 12,940 in-scope / 22 offenders (0.170%), Collier 6,470 / 8 (0.124%), Hendry 399 / 0; total 19,809 / 30 = **0.151%** (corrected scope: 19,116 / 21 = 0.110%). `market_details_swfl`: 49 in-scope / 2 = **4.08%** → under the 5% cut → quarantine, and 2 < 25 so the absolute gate blocks abort independently. **Stronger claim than the proposal makes: abort is unreachable under *any* batching** — only 30 (proposed) / 21 (corrected) offenders exist region-wide, scattered across ~10 ZIPs, so no batch can assemble ≥25 offenders. Abort stays dead until a genuine feed-shape change, which is exactly its purpose. The `5.0% ∧ ≥25` formulation is sound.

**Drift flagged vs `03`:** none in the anchor numbers (leepa 41,510/528,130 byte-identical; the 91/30/61 splits reproduce). The drift is in `03` §4b's *interpretation* — "The 91 non-land rows … are the real mislabel candidates" is wrong for at least 9 of them, and `03` §4b's own hero example (10 Tampa Pl) is right. The spec (`2026-07-11-data-contracts-doctor-design.md` §5) inherits the wrong half: "drop 91 bad of 34k" would delete ~70 real listings.

---

# DERIVATION — enum

All numbers locked. Writing the deliverable.

---

## Contract thresholds — enum

**As-of 2026-07-11.** Canonical fixture = `03-lake-live-state.md`'s dated snapshot; live confirmation queries run this session against `pg.data_lake.*` (SELECT-only). Where live differs from 03, both are reported and **03 is treated as canonical**.

### HEADLINE FINDING — the enum allowlist cannot be authored from 03 §4b's mix, or it quarantines 2,996 legit rows

03 §4a/§4b enumerate six `property_type` values (`single_family/land/condo/other/townhouse/multi_family`). That list is **correct but scope-limited** — 03's query was scoped `active + sale + Lee/Collier + source_name='api_feed'`. The **unscoped** domain has a **7th value, `residential`**, live right now:

```sql
SELECT source_name, property_type, count(*) FROM pg.data_lake.listing_state GROUP BY 1,2;
-- api_feed       / residential :  2,698   (state='holding': Lee 1,799 + Collier 899)
-- lifecycle_seed / residential :    298   (state='active', county='Hendry')
--                        TOTAL :  2,996  = 8.5759% of the table
```

Provenance is airtight — two writers, two vocabularies, one column:
- `listing_lifecycle/extract.py:141` (Source B scrape) emits `"land" if (acres and not beds) else "residential"`.
- `listing_lifecycle/extract_api.py:118` (API feed) emits `map_property_type(...)` → `PROPERTY_TYPE_MAP` (`constants_api.py:54-63`), whose codomain is `{single_family, condo, townhouse, multi_family, manufactured, land}` + `"other"` fallback. **`residential` is not producible on this path.**
- `catchup.py:92-98` **flipped the Source-B seed rows into `source_name='api_feed'`** (a pure `UPDATE source_name`), carrying the foreign token across the source boundary. The 298 left behind under `lifecycle_seed` exactly match `catchup.py:41-44`'s own comment ("Hendry ~298").

Independently confirmed — a perfect three-way identity, zero exceptions:
```sql
SELECT count(*) FILTER (WHERE property_type='residential' AND status IS NULL)      AS a,  -- 2,996
       count(*) FILTER (WHERE property_type='residential' AND status IS NOT NULL)  AS b,  -- 0
       count(*) FILTER (WHERE property_type<>'residential' AND status IS NULL)     AS c,  -- 0
       count(*) FILTER (WHERE property_type='residential' AND property_id IS NULL) AS d   -- 2,996
FROM pg.data_lake.listing_state;
```
`property_type='residential'` ⟺ `status IS NULL` ⟺ `property_id IS NULL`. These are exactly the Source-B-origin rows never re-stamped by an API sweep. They are **legitimate homes** (median $359,900 Lee / $770,000 Collier), not contamination.

**Why 03 didn't see them, and why that is a live latent bug:** all 2,698 `api_feed` residential rows sit in `state='holding'`, and the 298 are Hendry — so all 2,996 fall outside `listing_active_stats`'s WHERE clause today. The shipped hotfix (`docs/sql/20260711_listing_active_stats_homes_only.sql:43`) uses a **denylist** (`property_type <> 'land'`), so `residential` would *pass* if a holding row went active — accidentally correct. But that migration's own comment (line 16-17) enumerates the type domain as the same six values, omitting `residential`. **Anyone who "hardens" that denylist into an allowlist — or authors the enum contract from 03 §4a — silently drops up to 2,698 real homes the moment they re-activate.** That is the enum family's false-positive trap, and it is the exact analogue of the 523-land-lots / 41,510-leepa traps the spec names for `range`.

---

### 1. The contract definition (drop into `ingest/quality/quality_registry.yaml`)

```yaml
tables:
  data_lake.listing_state:
    content_contracts:
      # --- ENUM 1: property_type — the vocabulary-collision guard -------------------
      # Allowlist = the UNION of BOTH writers' code-reachable codomains, not the live
      # 6-value active mix. Authoring from the live active mix quarantines the 2,996
      # legitimate 'residential' rows (extract.py:141 + catchup.py:92 source-flip).
      - name: property_type_allowlist
        type: enum
        column: property_type
        scope: null                      # whole batch / whole table — NOT source-scoped (see §Spec drift)
        allowed:
          - single_family                # PROPERTY_TYPE_MAP (constants_api.py:55)
          - condo
          - townhouse
          - multi_family
          - land                         # map + extract_api.py:121 beds-null heuristic
          - other                        # map_property_type fallback (extract_api.py:70)
          - manufactured                 # in PROPERTY_TYPE_MAP; 0 rows live. Allowed so that WIDENING
                                         # STEADYAPI_TYPE_FILTERS (constants_api.py:74) cannot red the
                                         # nightly chain before the registry catches up.
          - residential                  # LEGACY Source-B token (extract.py:141). 2,996 rows live.
                                         # DO NOT REMOVE until that population is 0.
        allow_null: false                # 0 NULLs live; both writers always set it
        severity: error
        policy: quarantine
        abort_share: 0.10                # abort only if >=10% AND >=500 rows (derivation in §3)
        abort_min_rows: 500
        locus: both

      # --- ENUM 2: sale_or_rent — the sale-only-table guard -------------------------
      # Both writers hardcode 'sale' (extract_api.py:139, extract.py:144). 34,935/34,935
      # live. This is a DRIFT TRIPWIRE, not a contamination catcher — it is blind to the
      # 91 rent-priced rows by construction (they are LABELLED 'sale'). That is range's job.
      - name: sale_or_rent_allowlist
        type: enum
        column: sale_or_rent
        scope: null
        allowed: [sale]
        allow_null: false
        severity: error
        policy: abort                    # ANY 'rent' row in a sale-only table = feed shape change
        abort_share: 0.0                 # zero-tolerance: see §3 for why this one differs
        locus: both

      # --- ENUM 3: source_name — the third-writer / wrong-letter guard --------------
      - name: source_name_allowlist
        type: enum
        column: source_name
        scope: null
        allowed: [api_feed, lifecycle_seed]   # constants_api.py:18, distill.py:71
        allow_null: false
        severity: error
        policy: quarantine
        abort_share: 0.10
        abort_min_rows: 500
        locus: probe                     # source_name is NOT on the batch rows (see §Spec drift)

  # --- ENUM 4: the sibling table that proves the hazard is real ---------------------
  # SAME COLUMN NAME, DIFFERENT VOCABULARY. rental_listings_swfl stores RAW SteadyAPI
  # filter tokens (never passed through PROPERTY_TYPE_MAP). A contract copy-pasted from
  # listing_state to here fires on 100% of rows, and vice-versa.
  data_lake.rental_listings_swfl:
    content_contracts:
      - name: rental_property_type_allowlist
        type: enum
        column: property_type
        scope: null
        allowed: [single_family, condos, apartment, multi_family, townhomes, duplex_triplex, mobile, land]
        allow_null: false
        severity: warn                   # warn: raw vendor vocab is expected to evolve
        policy: quarantine
        locus: probe
      - name: rental_source_tag_allowlist
        type: enum
        column: source_tag
        scope: null
        allowed: ["realtor.com"]         # 14,244/14,244 live
        severity: error
        policy: quarantine
        locus: probe
```

**Live violation count for every contract above: ZERO.** Verified:
```sql
SELECT count(*) AS all_rows,                                                          -- 34,935
  count(*) FILTER (WHERE property_type NOT IN ('single_family','land','condo','other',
                    'townhouse','multi_family','residential'))     AS outside_allowlist, -- 0
  count(*) FILTER (WHERE property_type IS NULL)                    AS null_ptype,        -- 0
  count(*) FILTER (WHERE sale_or_rent NOT IN ('sale'))             AS outside_sor,       -- 0
  count(*) FILTER (WHERE source_name NOT IN ('api_feed','lifecycle_seed')) AS outside_src -- 0
FROM pg.data_lake.listing_state;
```
State this plainly to the operator: **unlike `range` (91 real offenders) and `sql_expectation`, the enum family catches nothing today.** It is a *drift tripwire* whose value is entirely prospective. Selling it as a contamination-catcher would be dishonest — its one historical catch (`residential`) is a population the contract must *protect*, not quarantine.

---

### 2. Defining queries + row-sets (the Fable-5 replay fixture)

**2a. OFFENDING rows — the query.** Returns 0 rows today; parameterize the allowlist from the registry:
```sql
SELECT source_name, address_key, county, zip_code, property_type, sale_or_rent, list_price, state, status
FROM pg.data_lake.listing_state
WHERE property_type IS NULL
   OR property_type NOT IN ('single_family','condo','townhouse','multi_family',
                            'land','other','manufactured','residential');
-- 0 rows, 2026-07-11
```

**2b. PROTECTED rows — the enum family's false-positive trap (MUST pass clean).** This is the fixture that matters:
```sql
SELECT source_name, state, county, count(*) AS n, median(list_price) AS med
FROM pg.data_lake.listing_state
WHERE property_type = 'residential'
GROUP BY 1,2,3 ORDER BY n DESC;
--  api_feed       | holding | Lee     | 1,799 | 359,900   <- legit homes, Source-B origin
--  api_feed       | holding | Collier |   899 | 770,000   <- legit homes, Source-B origin
--  lifecycle_seed | active  | Hendry  |   298 | 327,762.5 <- legit homes, catchup-excluded county
--  TOTAL 2,996 = 8.5759% of listing_state
```
Fixture assertion: `evaluate_batch()` returns these **2,996 rows in `clean`, 0 in `quarantined`.**

**2c. SYNTHETIC violation set (source-faithful, not invented).** There is no live enum contamination, so the deliberate-failure proof is built from the **bypassed-normalizer** class — the single realistic way this contract fires. The tokens are not invented: they are the **live, observed vocabulary of the sibling table**, which is what lands in `listing_state` if a writer skips `PROPERTY_TYPE_MAP`:
```sql
SELECT property_type, count(*) FROM pg.data_lake.rental_listings_swfl GROUP BY 1 ORDER BY 2 DESC;
--  single_family 6,129 | condos 5,592 | apartment 885 | multi_family 671
--  townhomes 582 | duplex_triplex 193 | mobile 190 | land 2      (n=14,244)
```
`condos`, `townhomes`, `duplex_triplex`, `mobile`, `apartment` are all **outside** `listing_state`'s allowlist. A batch stamped with these = 100% violating share → **abort**. That is the fixture for the §9(c) "synthetic >threshold contamination share aborts loud" acceptance test.

**2d. Rows the enum contract must NOT touch (correctly blind).** All three `range`-family traps are *in-allowlist* by `property_type` and therefore invisible to enum — this is correct, not a miss:
- the 91 non-land sub-$20k mislabels (`other`/`single_family`/`condo` — all allowed; they are *labelled* `sale`),
- the 523 legit sub-$20k land lots (`land` — allowed),
- the 41,510 `leepa_parcels` nominal-consideration transfers (different table; **no enum contract authored there**).

*Live-vs-canonical note:* re-running 03 §4b's scope today gives land **479** (03: 523), other **60** (03: 61), single_family **21** (03: 21), condo **9** (03: 9) → non-land **90** (03: **91**); table total **34,935** (03: **34,703**). `active_listings` lands rows through the day, so this is expected drift, not a discrepancy. **03's 91 / 523 / 34,703 remain canonical for the fixture.**

---

### 3. Policy: quarantine vs abort, and the abort-share derivation

**`property_type` + `source_name` → `quarantine`, abort at `share ≥ 10% AND count ≥ 500`.**

A row carrying a token no mapper can produce is **uninterpretable downstream by construction** — every consumer (`listing_active_stats`'s `<> 'land'` denylist, the homes-only filter, per-ZIP `detail_tables`) branches on this column. So offending rows must never merge → quarantine. Abort is reserved for spec §5's own definition: *"the whole feed changed shape."*

Derivation of **10%** — bounded from below and above by live evidence, not taste:

| Bound | Value | Source |
|---|---|---|
| **Floor** — must never abort a 34k load over the range class | **0.2622%** (91/34,703) | 03 §4b; spec §5 Locus A |
| **Must not abort** on one *new legit* vendor type arriving before the registry allowlist is updated | **6.2131%** (`apartment` 885/14,244) — the largest single-type bucket ever observed in this vendor's SWFL data; next `duplex_triplex` 1.3550%, `mobile` 1.3339% | live `rental_listings_swfl` |
| **Must not abort** on the one *real historical* vocabulary collision | **8.5759%** (2,996/34,935 `residential`) | this session |
| **Must abort** on a bypassed normalizer / writer swap | **~100%** | §2c |

10% clears the floor by ~38x, sits above both the largest-plausible-new-type bucket (6.21%) and the one real historical collision (8.58%), and still fires hard on the ~100% shape-change case. Critically, the 8.58% case validates the choice: those rows are **legitimate**, so aborting the load over them would have been *wrong* — at 10% they quarantine-and-warn instead (and with `residential` in the allowlist, they don't even quarantine). A config-lag bug (pipeline widens `STEADYAPI_TYPE_FILTERS` before the registry is updated) degrades to a loud warn, never a nightly-chain outage.

**`abort_min_rows: 500` is not optional.** Batch size varies by three orders of magnitude — 03 §6's own daily table: **7 rows (07-07), 364 (07-08), 8,857 (07-09), 21,142 (07-10)**. Without an absolute floor, **1 bad row in a 7-row catch-up batch = 14.3% → spurious abort of the entire nightly chain.** Abort requires **both** conditions.

**`sale_or_rent` is the deliberate exception → `policy: abort`, `abort_share: 0.0` (zero-tolerance).** Justification: the value is a *hardcoded literal* at both writers (`extract_api.py:139`, `extract.py:144`) — not a mapped field with a tail. There is no gradient. A single `'rent'` row means a rentals feed has been wired into a table whose only consumer view (`listing_active_stats`) hardcodes `sale_or_rent = 'sale'`; that is a shape change at n=1, and the correct response is to stop, not to quarantine one row and merge the rest. This is the one enum contract where "never abort over N rows" does not apply, and the reason should be written into the YAML comment so a future reader doesn't "fix" it to match its siblings.

---

### 4. The discriminating test (one line each)

- **WRONGLY FIRES on a legit row:** a verifier authors the `property_type` allowlist from 03 §4a's six-value active mix (or from `20260711_listing_active_stats_homes_only.sql:16-17`'s comment, which lists the same six) — the contract then quarantines the **2,996 legitimate `residential` homes** (`property_type='residential'` ⟺ `status IS NULL`, median $359,900 Lee / $770,000 Collier), an **8.5759%** violating share that also trips a naive ≤8% abort and kills the nightly load. **Test:** assert `evaluate_batch()` puts all 2,996 in `clean`.
- **WRONGLY MISSES a known-bad row:** the enum contract is *structurally blind* to the 91 rent-priced mislabels — they carry `sale_or_rent='sale'` and in-allowlist `property_type` values, so **no allowlist can ever see them**; if the enum contract is credited with covering §4b, the range contract gets dropped and the $6k–$9k Marco Island cluster ships forever. **Test:** assert `evaluate_batch()` returns the 91-row fixture with **`quarantined == []` for every enum contract**, and that a separate range contract catches them.

---

### Spec drifts / gaps found (for Fable 5)

1. **`evaluate_batch(rows, table)`'s signature is insufficient at Locus A (spec §5).** `source_name` is **not** a batch-row column — `_STATE_COLS` (`distill.py:77-89`) omits it, and `upsert_state` injects it as a **scalar** at merge time (`distill.py:200`). So a Locus-A contract **cannot** evaluate a `scope: source_name = 'api_feed'` predicate per-row. Either the signature needs batch context — `evaluate_batch(rows, table, ctx={"source_name": ...})` — or the merge orchestrator must stamp `source_name` onto rows before the gate. Every enum contract above is therefore authored **unscoped** (`scope: null`); `source_name_allowlist` is `locus: probe` only. This is the one spec correction that blocks Phase-1 coding.
2. **`listing_state` has no `is_seed` / provenance column.** The only way to identify a catchup-flipped Source-B row is the three-way identity `property_type='residential'` ⟺ `status IS NULL` ⟺ `property_id IS NULL`. If a future migration normalizes `residential` → `single_family`, that identity is destroyed and the population becomes unrecoverable — so **any such backfill must add a provenance column first**.
3. **Same column name, two vocabularies, one lake.** `listing_state.property_type` holds *normalized* tokens; `rental_listings_swfl.property_type` holds *raw SteadyAPI* tokens (`condos`, `townhomes`, `duplex_triplex`, `mobile`, `apartment`). Any shared/copy-pasted enum contract fires on 100% of one table. Worth a one-line note in `quality_registry.yaml`'s header. (Also: 2 rows of `property_type='land'` exist in the *rentals* table — a real, if tiny, scope oddity.)
4. **`docs/sql/20260711_listing_active_stats_homes_only.sql:16-17`'s comment is scope-limited and will mislead.** It asserts the domain is `single_family/condo/townhouse/multi_family/land/other` — true *only* within `active + Lee/Collier + api_feed`. Recommend a one-line correction naming `residential` + the holding-state population, so the next reader doesn't convert the denylist to an allowlist and drop 2,698 homes.

---

# ADVERSARIAL VERIFICATION — enum

Advisor is right — I was drifting toward a headline my own evidence disproves. Correcting the frame and writing the deliverable.

---

## Threshold verification — enum: VERDICT (SOUND — allowlist correct; abort policy needs recalibration + one TOO-LOOSE hole)

**As-of 2026-07-11.** All counts below are live SELECT-only queries against `pg.data_lake.*` this session. Where live drifts from `03-lake-live-state.md`, **03 stays canonical** and the drift is noted.

### Headline

I could not break the allowlist. **No live legit row is wrongly quarantined by the proposed contract** — I hunted specifically for one and failed. The allowlist content is SOUND and `residential` is correctly protected. What *is* broken is the **derivation** of `abort_share: 0.10` (wrong denominator + one fictional bound), and there is **one genuine in-config hole, and it is TOO-LOOSE, not too-aggressive**.

---

### 1. Attack: find a LEGIT row the contract wrongly quarantines/aborts — **FAILED (no row found)**

| Candidate legit population | Live count | Verdict under proposed contract |
|---|---|---|
| `residential` (Source-B origin, real homes) | 2,996 | **allowlisted → passes** |
| `land` (real cheap SWFL lots) | 7,837 active | allowlisted → passes |
| 91 sub-$20k non-land mislabels | 90 live (03: 91) | `other`/`single_family`/`condo` — all allowlisted → pass |
| NULL `property_type` / `sale_or_rent` / `source_name` | **0 / 0 / 0** | cannot fire |
| A new legit vendor type | **impossible** — see §2 | cannot fire |

```sql
SELECT count(*) AS all_rows,                                    -- 34,935
  count(*) FILTER (WHERE property_type IS NULL) AS null_ptype,  -- 0
  count(*) FILTER (WHERE sale_or_rent IS NULL)  AS null_sor,    -- 0
  count(*) FILTER (WHERE source_name IS NULL)   AS null_src,    -- 0
  count(DISTINCT property_type) AS n_ptype,                     -- 7
  count(DISTINCT source_name)   AS n_src,                       -- 2
  count(DISTINCT sale_or_rent)  AS n_sor                        -- 1
FROM pg.data_lake.listing_state;
```
Every proposed contract has **zero live violations**. The proposal's own claim on this point is confirmed.

**But its counterfactual is understated, and that matters.** The proposal warns that authoring the allowlist from 03 §4a's six values would "quarantine 2,996 legitimate rows... an 8.5759% violating share that also trips a naive ≤8% abort." At the locus where the contract actually runs, it is **worse than that: it aborts.** See §3.

---

### 2. The 6.21% "new vendor type" bound is **fictional** — and this reframes the whole family

`PROPERTY_TYPE_MAP` (`ingest/pipelines/listing_lifecycle/constants_api.py:54-63`) **already maps the entire rentals-table vocabulary**:

```
"condos" -> condo (:56) · "townhomes" -> townhouse (:57) · "duplex_triplex" -> multi_family (:59)
"mobile" -> manufactured (:60) · "apartment" -> multi_family (:62)
```
and `map_property_type` (`extract_api.py:69-70`) sends **anything unknown to `"other"`**:
```python
def map_property_type(raw: str | None) -> str:
    return PROPERTY_TYPE_MAP.get((raw or "").strip().lower(), "other")
```

So widening `STEADYAPI_TYPE_FILTERS` (`constants_api.py:74`) **cannot emit an out-of-allowlist token**. The scenario the 6.21% (`apartment` 885/14,244) upper bound protects against is **unreachable on the live code path**. The bound anchoring 10% from above does not exist.

**Consequence (the honest through-line):** on `listing_state`, the mapper's codomain is **closed at 7 tokens, all 7 allowlisted**, and NULL is unreachable. Therefore **every enum contract in this proposal is unfalsifiable by data** — its violating share is 0 for *any* vendor input. It can only ever fire via a **code change** (bypassed normalizer, a new `PROPERTY_TYPE_MAP` codomain token, an edited hardcoded literal). That is a **PR-time event — exactly what Phase 2's `check-registry-identity.mts` targets — not a load-time data event.** The enum family is a drift tripwire, and its thresholds are correspondingly low-stakes. The proposal says this ("catches nothing today"); it should say *why*, because the "why" is what makes the threshold argument moot.

---

### 3. Sanity-check the abort-share math — **FAILS: table-share denominator, batch-share locus**

`8.5759% = 2,996/34,935` is a **table** share. `evaluate_batch()` runs on the **per-county merge batch** — `ups` from `diff_states`, inside the county loop:

- `pipeline.py:75` county loop → `:107` `ups, trans = diff_states(prior, scanned, ...)` → `:136` `distill.upsert_state(ups, ...)`
- `transitions.py:44` iterates `set(prior) | set(scanned)` → one upsert per key
- `transitions.py:86` a **departure** rebuilds its upsert from **`prev`**, and `_upsert` (`:98`) copies every field — **so the prior row's `property_type` is carried back into the batch.** This is the live mechanism by which `residential` re-enters a merge batch.

**Measured, today's live merge batches** (`scraped_at = 2026-07-11`):
```sql
SELECT county, count(*) AS batch_rows,
       count(*) FILTER (WHERE property_type='residential') AS resid
FROM pg.data_lake.listing_state WHERE date(scraped_at)=DATE '2026-07-11' GROUP BY 1;
-- Lee 21,138 | resid 0     Collier 7,705 | resid 0     Hendry 1,064 | resid 0
```

**Measured, the 2026-07-01 SteadyAPI-cutover batch** (`|ups| = new + matched + departed`; `first_seen` is insert-only (`distill.py:197`) and the table never deletes (`distill.py:6`), so these reconstruct exactly):

| County | new (first_seen 07-01) | prior (seed 06-27) | departed→holding | `\|ups\|` | residential in batch | **batch share** |
|---|---|---|---|---|---|---|
| **Collier** | 6,084 | 2,749 | 1,090 | **8,833** | **899** | **10.18%** |
| Lee | 15,803 | 7,412 | 2,274 | 23,215 | 1,799 | 7.75% |
| Hendry / `--source scrape` | — | 298 | — | 298 | 298 | **100%** |

*(departures from `listing_transitions`, `to_state='holding'`, `date(at)='2026-07-01'`, joined to `listing_state` — Collier 1,090/899 resid, Lee 2,274/1,799 resid.)*

Three consequences:

1. **The proposal's central safety claim is false.** It states: *"the 8.58% case validates the choice: those rows are legitimate, so aborting the load over them would have been wrong — at 10% they quarantine-and-warn instead."* Under a §4a-authored allowlist, **Collier's 07-01 batch is 10.18% ≥ 10% with 899 ≥ `abort_min_rows: 500` → HARD ABORT of an 8,833-row load**, while Lee at 7.75% merely quarantines. A 10% line **cuts through the middle of a single root-cause event** and splits it across abort/quarantine by county. That is a mis-placed threshold by definition.
2. **The `residential` trap does not live at Locus A.** All 2,996 rows are `state='holding'` — never re-scanned, never in `ups` (resid = 0 in all three live batches). They are visible **only to Locus B**, the at-rest probe. The proposal mis-locates its own centerpiece trap and then derives its threshold from it.
3. **The Source-B path is 100%, not 28.65%.** `extract.py:140` has codomain `{"land", "residential"}` — there is **no `single_family` token in Source-B's vocabulary at all.** So *any* scrape batch is ~100% outside a six-value api-derived allowlist. The surviving `lifecycle_seed` batch is 298/298 = **100%**.

**The real batch-locus distribution of the one historical collision is 7.75% → 10.18% → 100%.** There is no gradient to threshold: reachable violations are bimodal (~0% or ~100%).

---

### 4. Attack: find a KNOWN-BAD row wrongly let through — **FOUND, by design; correct, but must not be credited**

Confirmed live — every known-bad population passes every proposed enum contract:

```sql
SELECT property_type, count(*) AS n, min(list_price), max(list_price)
FROM pg.data_lake.listing_state
WHERE state='active' AND sale_or_rent='sale' AND county IN ('Lee','Collier')
  AND source_name='api_feed' AND list_price < 20000 AND property_type <> 'land';
-- other 60 ($600–$19,900) | single_family 21 ($2,000–$14,900) | condo 9 ($1,800–$10,000)  = 90 rows, ALL allowlisted
```
- The **7 Marco Island `10TAMPAPL*` condos** ($6k–$9k): `condo` + `sale` + `api_feed` — **all three allowlisted → enum passes them.** No allowlist can ever see them; they are *labelled* correctly and *priced* wrong. That is `range`'s job.
- The **material bug (03 §4a)**: 7,837 active land rows, median **$47,500**, ~21% of the region's "active sale" rows — `property_type='land'` is **allowlisted → passes**. Correct: the row is legitimate; the bug is a missing filter in the *view*. Neither `enum` nor `range` catches it — only the Locus-B `sql_expectation` tripwire does.

This is correct behavior, but it means **the enum family's live catch is exactly 0**, and if it is credited with covering §4a/§4b the range + sql_expectation contracts get dropped and the $6k Marco Island cluster ships forever. The proposal says this. Keep that sentence in the deliverable verbatim.

---

### 5. The one genuine in-config gap: **TOO-LOOSE** — `abort_min_rows: 500` permits silent total loss

Abort requires **both** `share ≥ 0.10` **and** `count ≥ 500`. A **100%-contaminated batch below 500 rows therefore never aborts** — every row quarantines, zero rows merge, and the run **exits green**.

- Today's live batches (1,064 / 7,705 / 21,138) all clear 500 — so this is not bleeding now.
- But **03 §6 records a 7-row batch on 2026-07-07** and a 364-row batch on 07-08. `coverage_guard.py:12` (`_DROP_FLOOR = 0.6`) lets a batch shrink to 60% of last-trusted and still pass as "complete."
- This **breaks the proposal's own §2c fixture and spec §9(c)** ("synthetic >threshold contamination share aborts loud") — the fixture only aborts if the synthetic batch happens to be ≥500 rows.

**Fix:** add a `abort_if_no_clean_rows: true` clause — a batch whose clean set is empty aborts regardless of count. Keep `abort_min_rows` as a floor on the *share* branch only.

---

### 6. Two config smells to fix (neither is a live data-loss — do not report them as one)

- **`rental_property_type_allowlist` is the one column with an OPEN codomain.** `ingest/pipelines/rentals/resources.py:52` is `"property_type": desc.get("type")` — a **raw, unmapped vendor field**, with no mapper and no `"other"` fallback (contrast `listing_state`). The proposal authors its allowlist **purely from the live 8-token mix** — the exact sin it indicts elsewhere — and pairs it with `policy: quarantine` + `allow_null: false`. Today this is harmless because it is `locus: probe` (spec §5 Locus B is **report-only, at-rest** — it cannot drop rows). But `policy: quarantine` at `locus: probe` is **incoherent config**, and it becomes a real silent-drop of legitimate rentals the moment anyone promotes it to Locus A: a new realtor.com type, or a missing `type` key (`desc.get("type")` → `None` → NULL → `allow_null: false`), quarantines legit rows. Set `policy: warn`, `allow_null: true`. (`rental_source_tag_allowlist` is fine — `SOURCE_TAG = "realtor.com"` is a hardcoded literal at `rentals/constants.py:22`.)
- **`>=` vs `>` inconsistency.** Spec §5 defines abort as *"violating **share > threshold**"* (strict). The proposal's enum-1 comment says *"abort only if **>=**10%"*. Under the strict spec operator, `sale_or_rent`'s `abort_share: 0.0` is correct zero-tolerance (fires at n≥1). Under the proposal's own inclusive comment, `0.0 >= 0.0` is true on a **clean** batch. This is a comment-vs-spec drift, not a confirmed catastrophe — but it is a one-character difference between "zero-tolerance" and "aborts every nightly run." Express it as `abort_on_any: true`, never as a share of `0.0`.

---

### 7. Corrected contract

**Allowlist: ship as proposed, unchanged.** All 8 tokens verified; `residential` must stay (2,996 live rows; `property_type='residential'` ⟺ `status IS NULL` ⟺ `property_id IS NULL` — confirmed, zero exceptions). `manufactured` correctly included (0 rows live, in `PROPERTY_TYPE_MAP:60`).

**Abort policy — recalibrate:**
```yaml
- name: property_type_allowlist
  # Codomain is CLOSED (constants_api.py:54-63 + extract_api.py:70 "other" fallback):
  # no vendor input can violate this. It fires ONLY on a code change — bypassed normalizer
  # or a new PROPERTY_TYPE_MAP token. Reachable violations are bimodal (~0% or ~100%),
  # so there is no gradient to threshold. Do NOT re-derive this from a live table mix.
  policy: quarantine
  abort_share: 0.50          # was 0.10. The one real historical collision measured AT THE BATCH
                             # LOCUS spans 7.75% (Lee) / 10.18% (Collier) / 100% (scrape path) —
                             # a 10% line ABORTS Collier's 07-01 cutover and merely quarantines
                             # Lee's, splitting one root cause. 0.50 puts the whole event uniformly
                             # on the quarantine side (a human widens the allowlist) and still
                             # fires hard on the ~100% bypassed-normalizer case.
  abort_min_rows: 500        # floor on the SHARE branch only
  abort_if_no_clean_rows: true   # NEW — closes the sub-500 silent-total-loss hole
                                 # (03 §6: a 7-row batch on 07-07; _DROP_FLOOR=0.6 admits shrinkage)
```
Same for `source_name_allowlist`. `sale_or_rent` → `policy: abort, abort_on_any: true` (drop `abort_share: 0.0`).

**Delete from the derivation table:** the `6.2131% apartment` row (unreachable — `apartment` maps to `multi_family` at `constants_api.py:62`) and the `8.5759%` row (wrong denominator — it is a table share, not a batch share).

---

### 8. Drifts from the evidence on disk

- **`extract.py` cite is off by one.** The proposal cites `extract.py:141` for the `property_type` line; it is **`:140`**. (`:144` for `sale_or_rent` is correct.)
- **03 §6's daily "rows scraped" table under-counts every day but the last.** `scraped_at` is overwritten on every upsert (`distill.py:196`), so a row touched 07-08 *and* 07-11 only appears in the 07-11 bucket. 03's 7 / 364 / 8,857 / 21,142 are **lower bounds**, not batch sizes. Today's true batch is 29,907 rows (Lee 21,138 + Collier 7,705 + Hendry 1,064). This does not change 03's conclusions but it does mean **batch size cannot be read off that table** — which is precisely the number `abort_min_rows` is calibrated against.
- **Expected intraday drift (03 canonical):** land 7,837 (03: 7,404), non-land sub-$20k 90 (03: 91), table total 34,935 (03: 34,703). `active_listings` lands rows through the day.
- **Spec-drift #1 in the proposal is CONFIRMED and blocking:** `source_name` is **not** a batch-row column — `_STATE_COLS` (`distill.py:77-89`) omits it and `upsert_state` injects it as a scalar (`distill.py:200`). `evaluate_batch(rows, table)` cannot evaluate a `scope: source_name=...` predicate at Locus A. Signature needs batch context.
