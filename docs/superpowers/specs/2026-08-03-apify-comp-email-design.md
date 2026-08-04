# Apify comp email — design (08/03/2026)

**Slug:** `apify-comp-email` · **Check:** `apify_comp_email_live_verify`
**Brief:** `_ASSISTANT/2026-08-03-apify-comp-email-HANDOFF.md` (operator decree, same day)

---

## 1. What is being built, and what is NOT

The operator's shape (handoff §1) maps onto the EXISTING `market-comps` recipe's chrome with
**one insertion and one relabel**. It is not a new email type.

| Operator asked for | Status |
|---|---|
| 1. Photo of the home being sold | ALREADY BUILT — `buildLifecycleEmail({photo: facts.photos[0]})` |
| 2. Specs strip "like things are now" | ALREADY BUILT — `compsSpecs()`; handoff §1 explicitly forbids a new spec component |
| 3. **Description of the home being sold** | **NEW — this build** |
| 4. Comps with real thumbnails | BUILT but STARVED — `comp-photos.ts` only resolves inside the nightly sweep window; a 6–12-month comp lookback mostly predates it |
| 5. Positive commentary, agent's voice, bottom | ALREADY BUILT — `authorCompsCase()` + claim gate |
| 6. "Find Out More" button | **RELABEL — this build** (`ctaLabel`) |

**NOT in this build** (RULE 0.6 proportion — each gets a check, not code):
- The bulk price-0 sold backfill (handoff §2). Different job, different cadence.
- The `one-api` detail actor (step 2). Deferred behind a check — see §3.
- Any carousel. Handoff §8 settled it: not buildable in email.

### The load-bearing decision: Apify is an ENRICHMENT lane, never a comp source

`market-comps` derives its set from `compsForAddress`, then runs `isComparableHome` →
`isNotSubjectAddress` → `isFreshSale` → `buildPriceCase` → `auditClaims`. Substituting Apify as the
comp SOURCE would force every one of those guards to be re-reasoned, including the claim gate that
exists because this exact recipe once shipped an inverted comparison.

So Apify records are keyed onto the EXISTING `RenderComp` set through the canonical
`compPhotoKey`/`addressKey` normalizer (never a second one) and fill exactly two holes: **a missing
photo** and **a missing subject description**. Every guard above is untouched.

---

## 2. Vendor contract — VERIFIED IN-SESSION 08/03/2026

Fetched live via `fetch-actor-details` (global RULE 1: a committed handoff is a hypothesis, not
authority). `moving_beacon-owner1/realtor-com-property-scraper`, actor id `T5QRnLKtyvzxjWVRH`.

Confirms the handoff: `locations` (array, **required**), `listing_type` enum
`for_sale|for_rent|sold|pending`, `date_from`/`date_to` as `YYYY-MM-DD`, `max_results_per_location`,
`mls_only`, `min_price`/`max_price`/`min_beds`/`min_sqft`, `past_days`.

**Two facts the handoff did NOT carry, both material:**
1. **`radius` (miles) only works when the location is a SPECIFIC ADDRESS — not a city or ZIP.** A
   comp pull centered on the subject house must pass the full street address, not `["33914"]`.
   Passing a ZIP with a radius silently ignores the radius.
2. **`property_type` filters at the SOURCE** and its enum includes `land`. The vacant-lot problem
   `isComparableHome` was written to solve can be narrowed before we are billed for the row.

**Pricing (live):** PAY_PER_EVENT — `$0.01` per result **plus** `$0.00005` per actor start (per GB
of memory, min 1). The handoff quoted only the per-result price. Immaterial at this volume, but the
cost gate below counts the real number.

---

## 3. Cost gate — operator ceiling is $7

- Apify is called **only on a lake miss**, never speculatively.
- `max_results_per_location` is ALWAYS set. An unset value means "unlimited up to 10k" — at
  $0.01/result that is a $100 run from one typo. This is the single largest cost risk in the build.
- Results are **persisted on first fetch** and read from our own table thereafter; coverage
  compounds and the same address is never bought twice.
- **Never in a scheduled/cron path** (memory: `no-paid-search-in-scheduled-ingest`). Build-time only.
- **Step 2 (`one-api` detail actor, $0.007) is DEFERRED.** The subject of this email is an ACTIVE
  listing, and handoff §3 proved `text` IS populated in the bulk call for for-sale listings. The
  detail actor is only needed for an already-SOLD subject. Gated behind a check rather than built.

---

## 4. FAILURE MODES — every way this breaks, and the guard that stops it

RULE 3.5 (locked 07/20/2026): no design is approved without this section. A guard is a test, a
validation, a gate, or a lint — never a prompt instruction.

| # | Failure | Guard |
|---|---|---|
| F1 | **Partial photo coverage silently ships a photo-less table.** `compsMiddle` renders images only when `comps.every(c => thumbnails.get(...))`. Fill 4 of 6 and the reader gets ZERO photos — requirement #4 disappears with no error anywhere. | Resolve photos BEFORE choosing the comp set: coverage gates comp *selection*, not rendering. `selectPhotographedComps()` prefers photographed comps up to `MAX_COMPS`. **Test:** 4-of-6 coverage ships 4 comps all with photos, never 6 with none. |
| F2 | **A 3,000-char MLS description blows the email.** §0.1 caps text at ~20 lines; §0.3 gives Gmail a ~102KB clip and NO `<details>` support, so an accordion is not available. | `truncateDescription()` cuts at a SENTENCE boundary under a hard char cap. **Test:** a 3,000-char input returns ≤ cap and never ends mid-sentence. |
| F3 | **Truncation silently strips the virtual-staging disclosure.** Handoff §5: "if we republish remarks, that sentence rides along — do not strip it." It sits at the END of the remarks, exactly where a truncator cuts. | The disclosure is detected and re-appended AFTER the cut. **Test:** a long description whose final sentence is the staging disclosure still contains it after truncation. |
| F4 | **The description lands in the narrative slot and is eaten — or eats the narrator.** `fillNarrative` SKIPS a text block that already has content; this is the landmine that shipped 2,000 chars of raw MLS copy on 07/13. | The description is its OWN block in the recipe's `middle`, never the narrative slot. **Test:** the narrator's paragraph and the description both survive in the built doc. |
| F5 | **The description is unsourced prose in an email governed by a no-invention gate.** | It is vendor-verbatim, never model-touched, and carries its own attribution line. The narrator never receives it (it is not in `narratorClaims`), so it cannot be paraphrased into a claim. **Test:** the built description block's text is a literal substring of the source remarks. |
| F6 | **An empty Apify run is treated as an error and fails the build.** Handoff §4: 2 of 5 store actors tested were junk; empty runs are the normal failure shape. | Every fetch path is empty-tolerant: no creds / no rows / any throw → `[]`, never a throw. Mirrors `fetchLakePhotoRows`. **Test:** a throwing client yields `[]` and the build still lands. |
| F7 | **Runaway spend from an unbounded run.** See §3. | `max_results_per_location` is required by the typed input builder — it cannot be omitted. **Test:** the built actor input always carries a positive cap. |
| F8 | **`alt_photos` is parsed as an array and yields garbage.** The vendor returns a comma-space-joined STRING (handoff §3, proven). | `parseAltPhotos()` splits the string; a non-string input returns `[]`. **Test:** both shapes. |
| F9 | **`radius` silently ignored** because the location was a ZIP (vendor fact, §2). | The input builder takes a subject ADDRESS when a radius is set. **Test:** radius present ⟹ location is not a bare ZIP. |
| F10 | **A comp borrows the wrong house's photo.** Two houses share a street name in different cities. | Keying reuses `compPhotoKey` (street core + city), the SAME normalizer as lane 1 — never a second one. **Test:** same street, different city, no match. |
| F11 | **The send arrives unbranded** — `applyBrand` is browser-only, so every non-Lab path ships no logo, no colors, empty CAN-SPAM address (open defect `applybrand_no_server_side_caller`). | The send script applies the house brand server-side explicitly, the proven `tmp-listings-showcase-send.mts` pattern. Not a fix for the underlying defect — that check stays open. |
| F12 | **A new root is built and never catalogued** — scratchpad 0ae, three times already. | `docs/standards/data-roots.md` + `ingest/cadence_registry.yaml` `source_scope` land in the SAME commit as the code. |

---

## 5. FULL-SCOPE-FIRST (locked 07/14/2026)

The full field list the source exposes, stated BEFORE ingest code, written into
`cadence_registry.yaml` `source_scope`. From the live schema + handoff §3's proven run output:

**We pull (confirmed_total):** `street/city/state/zip_code`, `sold_price`, `last_sold_date`,
`list_price`, `list_date`, `days_on_mls`, `beds`, `full_baths`, `half_baths`, `sqft`, `year_built`,
`lot_sqft`, `price_per_sqft`, `style`, `property_url`, `primary_photo`, `alt_photos`, `text`.

**Available and NOT pulled (source_ceiling):** `county`, `fips_code`, latitude/longitude,
`hoa_fee`, `tax` + full `tax_history`, `assessed_value`, `estimated_value`, `stories`,
`parking_garage`, `new_construction`, `mls` / `mls_id` / `mls_status`, `agent_name` /
`agent_email` / `agent_phones`, broker + office, `nearby_schools`, and the `financial` /
`compact` alternate `output_format`s.

`agent_email` / `agent_phones` are deliberately unpulled — a licensee contact list is a separate
decision with its own consent posture, not a side effect of a comp fetch.

---

## 6. Where the data lands

**A new table, NOT `data_lake.listing_state`.** Probed 08/03/2026: the nightly sweep's
`plan_off_market_checks` re-probes only rows IT moved to `holding`, and its upsert/transition
machinery is keyed on the vendor's own `property_id`, which an Apify record does not carry.
Inserting there would put untracked rows inside a state machine that cannot own them.

Landed as its own root, stamped with `source_tag`, read as a SECOND LANE inside the existing
`resolveCompPhotos` resolver — one resolver, two lanes (handoff §5: "extend it, do not write a
second photo resolver").

---

## 7. TDD order

Failing test named after the failure mode, then implement to green (RULE 3.5).
F8 → F2 → F3 → F10 → F1 → F6/F7/F9 → F4/F5 wiring → send.
