# EMAIL HOMEWORK — COUNTED LIVE 08/05/2026. Two of yesterday's pushed claims were wrong.

**This file is the evidence layer under `docs/superpowers/handoffs/2026-08-04-EMAIL-DATA-TRUTH-HANDOFF.md`.**
That handoff told the next session to RE-COUNT instead of quoting it. This is that re-count. It
found two errors in the handoff itself — one of them in the commit that shipped it (`83f60f94`).

**Every number below came from a live query run 08/05/2026. Re-count before quoting THIS file too.**

---

## CORRECTION 1 — `lee_comp_sales_v` IS NOT BROKEN. The 500 was the PROBE, not the view.

The 08/04 handoff §"Free-lane gaps" says the view "returned HTTP 500 through PostgREST on
08/04/2026" and "needs diagnosing before any comps email is trusted." **That is a probe artifact.**

Four probes, same view, same session:

```
plain    ?select=*&limit=1                         200   1.7s   real row returned
count=planned                                      206   1.9s   real row returned
count=estimated  (Prefer + Range: 0-0)             500   8.1s   57014 statement timeout
count=exact      (Prefer + Range: 0-0)             500   8.1s   57014 statement timeout
```

`Prefer: count=exact` makes PostgREST run `COUNT(*)` over the WHOLE view before the `LIMIT` can
help. The view materializes ~108k rows through a lateral join and blows the 8-second statement
timeout. **A bounded read — which is the only shape the email path issues — is healthy and fast.**

**What is actually broken:** any consumer that asks this view for an exact row count 500s. That is
narrow and real. Check opened: `lee_comp_sales_v_exact_count_times_out`.

**The lesson, and it is the same one twice now:** a probe whose headers change the query is not a
test of the thing you meant to test. The first probe carried `Prefer: count=exact` because it was
copy-pasted from a row-counting script.

---

## CORRECTION 2 — SCHOOLS ARE `<NA>`. Commit `83f60f94` is half wrong.

Yesterday's last commit says *"schools and agent contacts are in the paid response too — no column
for either."* Counted across all 26 rows of `data_lake.apify_property_records`:

```
raw.nearby_schools    key present on 20/26   ALL 20 values are the literal string "<NA>"
raw.tax_history       key present on 20/26   ALL 20 are "<NA>"
raw.builder_name      key present on 20/26   ALL 20 are "<NA>"
raw.builder_id        key present on 20/26   ALL 20 are "<NA>"
raw.list_price_min    key present on 20/26   ALL 20 are "<NA>"
raw.list_price_max    key present on 20/26   ALL 20 are "<NA>"
```

`<NA>` is this vendor's null sentinel (it is already in the store's `NA` set,
`lib/listings/apify-record-store.ts`). **We do not have schools from this actor.**

**Do NOT overcorrect to "Apify has no schools."** Every row in this table came from ONE actor —
`moving_beacon-owner1~realtor-com-property-scraper`, the bulk/search actor, the only id in
`ACTOR_ID`. The handoff attributed schools / `street_view_url` / `property_history[]` to the
**detail** actor, `one-api/realtor-property-scraper`, which has never written a row here. The
honest statement: **the bulk actor returns `<NA>` for schools on every resolved row; the detail
actor is UNPROBED and may not be quoted in either direction.** Check:
`apify_detail_actor_schools_unprobed`.

**The other half of that commit is TRUE** — agent, office and broker contacts are real:

```
agent_name    20/26      agent_email   20/26      agent_phones  20/26  (array of {type,number,ext})
office_name   20/26      office_email  19/26      office_phones 19/26
broker_name   15/26      agent_id      19/26      agent_nrds_id 12/26      office_id 16/26
```

---

## CORRECTION 3 — HOA FEE: 19 non-null, but only **12 are greater than zero**.

The handoff says "`hoa_fee` populated on 19 of 20." Counted:

```
hoa_fee   non-null 19/26   ·   > 0  12/26   ·   exactly 0  7
values: 0, 0, 0, 200, 596, 0, 760, 689, 167, 596, 555, 705, 1326, 175, 0, 0, 1192, 310, 0
```

**DECISION (matches playbook §1.14 "NEVER a zero" and the `assessment_building` precedent in
data-roots):** serve `hoa_fee > 0`. A `0` is NOT "this home has no HOA" — it is indistinguishable
from an unfilled vendor field, and rendering it as "$0/mo HOA" is a fabricated figure. **`0` → OPEN
SLOT.** Real coverage for the HOA cell is therefore **12 of 26 rows (12 of 20 resolved)**, not 19.

---

## THE FULL CENSUS — `data_lake.apify_property_records`, 08/05/2026

**26 rows · 46 columns · 71 distinct keys inside `raw` · 20 rows fully resolved (have `property_id`).**

County: Lee 20, unresolved 6. Status: FOR_SALE 11 · SOLD 11 · PENDING 3.

### The three fields nothing free can give us — all measured, all real

```
alt_photos     20/26 rows    9 to 55 photos    (9,13,22,23,24,24,24,28,32,33,43,44,47,49,49,50,50,50,50,55)
description    20/26 rows    368 to 2,983 chars
half_baths      5/26 rows    values 3,1,1,2,2
```

Our free lane carries ONE photo and no description at all. These two are the largest quality levers
in a listing email and both are already bought and landed.

### Sold-side, already bought

```
sold_price       >0 on 19/26        last_sold_price 19/26        last_sold_date 19/26
estimated_value  >0 on 19/26
```

### The 24 raw keys we pay for and have NO column for

```
mls_id · _source · fips_code · agent_name · _scraped_at · agent_email · office_name · agent_phones ·
_listing_type · agent_mls_set · office_mls_set · _search_location · full_street_line ·
last_update_date · formatted_address · agent_id · office_email · office_phones · office_id ·
broker_name · agent_nrds_id · broker_id · note · recovered_from
```

`note` and `recovered_from` are OURS, not the vendor's — injected by the 08/04 recovery of records
lost to the Postgres 21000 bug. `_source` / `_scraped_at` / `_listing_type` / `_search_location` are
the actor's own run metadata. **The genuinely unpromoted VENDOR fields are the contact block
(agent/office/broker), `fips_code`, `mls_id`, `formatted_address`, `full_street_line`, and
`last_update_date`.**

### Columns that are 0/26 — empty COLUMNS, not empty responses

`assessed_value` and `tax`. The free tax roll (`leepa_parcels` / `collier_parcels`) and
`steadyapi_tax_history` already own both concepts. **Do not pay Apify for them.**

---

## WRITE-BACK — CLOSED. Every paid call lands its row.

Tree-wide grep (`lib/ scripts/ app/ ingest/ .github/`) for `api.apify.com`,
`run-sync-get-dataset-items`, `APIFY_KEY`, `APIFY_TOKEN`, `~realtor`:

**Exactly ONE vendor call site exists — `lib/listings/apify-comps.ts:295`.** `apify-baths.ts`,
`apify-identity.ts` and `listing-description-block.ts` all route through it; none opens its own
connection. `fetchApifyComps` **awaits** `saveApifyRecords(records)` on every non-injected run, with
the awaited-not-fire-and-forget reasoning written into the code. Check
`one_off_paid_pulls_saved_correctly` can close.

**BUT THE READ SIDE IS NOT WIRED.** `fetchCachedRecords` has exactly ONE reader —
`lib/listings/apify-identity.ts`. Ladder step 2 in the 08/04 handoff — *"check
`apify_property_records` by `address_key` BEFORE any call"* — is **not** in force for the baths, the
description, or the gallery lane. Those lanes re-buy a house we already own. That is a build item,
not an audit note. Check: `apify_cache_read_not_wired_to_all_lanes`.

---

## STILL UNPROBED, AND IT GATES ANY PAID WORK

`apify-comps.ts` records a live **403 `platform-feature-disabled: Monthly usage hard limit
exceeded`** on 08/04/2026. Whether that cap is still in force was NOT checked in this pass. Any plan
whose first step is a paid probe is blocked until it is. Check: `apify_monthly_cap_state_unknown`.

---

## WHAT THIS CHANGES IN THE PLAYBOOK

`docs/standards/email-build-playbook.md` §2.1 "Known gaps" says: *"HOA fee, schools, flood zone: no
verified source. Do not claim we have them."* **That line is now wrong in both directions** and is
corrected in the same commit as this file:

- **HOA fee — we DO have a source**, already paid for: 12 of 26 rows carry a real positive fee.
- **Schools — still no source**, and now that is a MEASURED fact (`<NA>` × 20) rather than an
  absence of knowledge. The detail actor stays unprobed.
- **Flood zone — untouched by this pass.** Unverified, unchanged.
