# HANDOFF 2026-08-02 — DOM backfill + why one paid call yields 3 of 64 fields

**Operator, verbatim:** "I don't understand how many times we have looked at this and said bring in
everything and we bring in 3???? Nothing fucking makes sense."

That question has a mechanical answer. It is in section 1. Everything else follows from it.

---

## 1. WHY WE BRING IN 3 — it is one line of code, not a series of oversights

`ingest/pipelines/listing_lifecycle/extract_api.py:564-586`, `fetch_sold_event()`:

```
    data = r.json()
    ...
    return classify_off_market(data, since=since, at=at)
```

**The raw body goes out of scope at the `return`.** `classify_off_market` returns a small dict —
`{outcome, reason, sold_price, sold_date, event_name, current_status, listed_date}`. That dict is
the ONLY thing any caller downstream ever sees: the backfill, `pipeline.py`, `transitions.py`, all
of it.

So when anyone decides "bring in everything," the person doing the work is standing downstream of a
boundary that already threw the data away, and the other 58 fields are not merely unused — they are
**unreachable from where the work happens.** Adding one field means changing the extractor's return
contract, which looks like refactoring someone else's module, so nobody does it. The scope decision
was frozen into a function signature on the day this was built for a different purpose (classifying
why a listing went off-market), and every later "get more" decision died at that line without anyone
noticing it was the obstacle.

**This is why the same finding gets re-discovered and never shipped.** It is not memory failure. The
architecture makes the correct action invisible.

**The fix is therefore NOT "remember to parse more fields." It is: stop discarding the body at the
fetch boundary.** Persist the raw response once; every future field becomes a free SQL query against
bytes we already own, instead of a code change nobody is positioned to make.

---

## 2. THE EXACT CENSUS (counted, not estimated)

**Evidence:** 4 live calls 08/02/2026, all HTTP 200, one property per lifecycle state so a
sold/withdrawn property exposes fields a for-sale one hides — `1102741290` active, `1617896233`
holding, `1440538288` sold, `1667459937` withdrawn. Field paths unioned across all four.
(A 5th earlier call, `5200800427`, seeded the first tree.)

**64 distinct field paths. PERSIST 3. Read-and-discard 3. Never touch 58.**

Per family: `property_history[]` 15 · `statistics` 20 · `meta` 13 · `tax_history[]` 8 ·
`building_permits[]` 7 · `body.status` 1.

The 3 persisted: `property_history[].listing.list_date` -> `listed_date` (the backfill's only write);
`property_history[].price` -> `sold_price` and `property_history[].date` -> `sold_date`, sold path
only. The 3 read but never stored: `meta.current_status`, `body.status`,
`property_history[].event_name`.

**Honest deflation of the 58:** 7 are an exact duplicate (`statistics.permits.recent[]` repeats
`building_permits[]`), 8 duplicate `statistics` rollups up into `meta`, 4 are envelope
(`meta.version/copywrite/status/property_id`). **39 genuinely distinct useful fields are paid for and
discarded on every single call.**

Full field list: `_RESEARCH/data-and-ingest/2026-08-02-property-tax-history-full-scope.md`
(indexed in `_RESEARCH/INDEX.md`).

**Landmine:** `building_permits[].effective_date` is `"Mar 8, 2021"` — a human string. Every other
date in the response is ISO. Parse it explicitly or it lands as garbage.

---

## 3. WHAT WAS ALREADY ON RECORD AND GOT MISSED (read this before re-deriving anything)

- **`_ASSISTANT/SCRATCHPAD.md` lines 1684-1714 — "FULL-SCOPE CENSUS — RUN LIVE 07/22/2026 (2 calls)."**
  Already named `days_after_listed`, `price_sqft`, `price_change_percentage`,
  `last_status_change_date`, `last_update_date`; already stated `tax_history`, `building_permits`,
  and `statistics` are never read. **This session burned 5 paid calls re-deriving it.** The scratchpad
  is printed at session start. What 08/02 genuinely ADDED: that entry says `building_permits` and
  `statistics` were "never inspected" and left `assessment`/`market_value` unexpanded — so their
  field names (7 + 20 + 6) and the exact 64/3/58 count are new; the rest was not.
- **`docs/steadyapi-capability-census.md` §3 item 2** ranks `building_permits[]` as should-get #2,
  "ZERO new calls … just parse + persist what's already in hand." Written 07/16. Never shipped.
- **Open check `dom_backfill_repull_17k`** (listing-lifecycle, 14d untouched): *"Re-pull 17,127 wiped
  listed_dates (vendor re-probe ~17.2k calls) — parked until operator go."* **This is exactly this
  job**, already scoped, and its ~17.2k matches the 17,880 measured today. The operator's "we have
  more SteadyAPI credits" IS the go it was parked for. Use this check, not a new one.
- **Open check `assistant_property_urgency_tax_history_wiring`** (due Aug 12, 17d untouched) already
  names `/property-tax-history (list_date, last_update_date)` for per-listing DOM.
- **Open check `should_i_sell_property_tax_source`** (15d untouched) is premised on *"no live
  per-parcel county tax-bill feed found."* **That premise is false** — this endpoint returns
  `tax_history[].year` + `tax_amount` + assessment/market value, and `should-i-sell` calls
  `fetchPropertyTaxAnnual`, a stub returning null, commented "stubbed until a confirmed live
  per-parcel endpoint lands." Caveat before serving: it is the vendor's annual tax amount, not the
  county bill with millage broken out — validate against a known parcel first.
- **Open check `permits_spine_thin_collier_missing`** (7d untouched) states `data_lake.collier_permits`
  DOES NOT EXIST and permit-history products are "NOT buildable on current data" — while
  `building_permits[]` rides free on a call we already make, in Collier, unread since 07/16.

---

## 4. STATE OF THE CRONS (the operator's load-bearing demand)

Verified live via `gh workflow list --all --limit 200`:

- `Nightly Chain` -> **`disabled_manually`** (311550406)
- `ingest-listing-lifecycle` -> **`disabled_manually`** (303232889)

**STILL OWED — operator must run it (agent classifier-blocked), check
`engine_enabled_kill_switch_owed`:**

```
gh variable set ENGINE_ENABLED --body false --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
```

Why the two disables are NOT sufficient: on 07/19 a `repository_dispatch` fired the chain **despite
the workflow being disabled at the API**. The Vercel cron `/api/cron/nightly-chain-dispatch`
(`vercel.json`, `23 4 * * *`) still fires nightly. `ENGINE_ENABLED` is a job-level `if:` inside
`listing-lifecycle-daily.yml:76`, evaluated at runtime regardless of trigger route — the only lever
proven to hold against that path.

**Cost of leaving it off:** listing freshness stops landing nightly. Fine for a day; do not leave it
silently.

---

## 5. THE WIPE — fixed, and the trap that is still armed

07/19: chain run 29673245885 re-upserted 17,540 rows; `upsert_state`'s blanket
`SET listed_date = EXCLUDED.listed_date` nulled **17,127 of ~29.1k** vendor list dates from the 07/18
15-hour backfill. `/search` never returns a list date, so every sweep row carried NULL.

**Fixed and confirmed on `origin/main`** — `git log origin/main -S'_ENRICH_ONLY_COLS' --
ingest/pipelines/listing_lifecycle/distill.py` -> `51fc9950`; working tree byte-identical.
`upsert_state` now COALESCEs `_ENRICH_ONLY_COLS = ("listed_date", "baths")`.

**STILL ARMED:** every OTHER column in `_STATE_COLS` still gets a blanket `EXCLUDED` overwrite and
`/search` sets them to `None` (`extract_api.py:194`). **Any new scalar written onto `listing_state`
that is not added to `_ENRICH_ONLY_COLS` in the SAME commit gets nulled by the next sweep.** Already
happened twice — `listed_date` (17,127 rows, 07/19) and `baths` (34,139 of 34,478, 07/26).

Related: `listing_state.days_on_market` is 0% populated and marked DELETE-after-live in
`docs/standards/data-roots.md:69,267`. **Never write to it.** The root is the `listing_dom` view,
which derives DOM from `listed_date` at read time.

---

## 6. MEASURED GAP (live SQL 08/02/2026, `source_name='api_feed'`)

```
undated                21458
undated_no_pid             0
undated_no_zip             3
undated_active_sale    17882
active_sale_no_pid         0
all_rows               34904
```

- Backfill reaches **17,880** of 17,882 undated active-sale rows. **2 are unreachable** — the target
  query filters `zip_code IS NOT NULL` and 3 rows lack a ZIP (2 of them active-sale).
- `undated_no_pid = 0` — nothing is unreachable for a missing property_id. That risk does not exist
  (check `dom_backfill_unreachable_no_pid_count` closed with this evidence).
- **3,576 undated rows sit OUTSIDE the backfill's scope** (`state='active' AND sale_or_rent='sale'`):
  holding, sold, withdrawn, rentals. Relevant to the sold-side history and the unbuilt
  `listing_dom_historical` root. Operator decision, not a bug.
- `listing_dom`: total 34,904 (exact match to api_feed rows), floored 17,149, negative_dom 0.
  `data-roots.md:90` recorded ~63% floored; it is 49% now.

---

## 7. BUILD ORDER — operator chose "full build, typed tables for all 5 families"

The paid calls are the only irreversible part; parsing is free. So the calls get paid ONCE.

**Step 1 — kill the discard, then land raw. DO THIS FIRST.** Give `fetch_sold_event` a sibling that
returns the raw body (today it cannot — section 1). Migration for
`data_lake.steadyapi_property_history_raw (property_id PK, address_key, county, body JSONB,
fetched_at)`, idempotent `ON CONFLICT (property_id) DO UPDATE`. Extend the backfill so each probe
writes BOTH the guarded `listed_date` UPDATE (unchanged, proven) and the raw insert.
`fold_updates` discards the body by explicit design — that is the line to change.

**Step 2 — run it.** ~17,880 calls, ~5h at the module-enforced ~1 req/s (`_MIN_INTERVAL_S = 1.05`).
Idempotent + resumable (`listed_date IS NULL` on both the target query and the UPDATE); chunk with
`--limit`; `_write_with_retry` survives the pooler blip that killed the 07/18 run at row ~18k.
Quota: 50,000/mo, ~13-16k/mo current burn — confirm headroom on the vendor dashboard first (no quota
headers exist on responses; the dashboard is the only authority). Track under
**`dom_backfill_repull_17k`**, not a new check.

**Step 3 — typed tables from stored bytes, ZERO calls.** Parse `tax_history`, `building_permits`,
`property_history` out of the JSONB. One-to-many, so they do NOT belong on `listing_state`.
Brain-first gate: each needs its consuming pack in the same PR. RULE 3.5 brainstorm +
failure-modes section + TDD all still owed — this step is NOT specced.

**Step 4 — scalars onto `listing_state`** (`days_after_listed`, `last_status_change_date`,
`source_name`), each added to `_ENRICH_ONLY_COLS` in the SAME commit (section 5).

**Step 5 — re-enable:** `gh variable set ENGINE_ENABLED --body true`, then
`gh workflow enable ingest-listing-lifecycle`, then `gh workflow enable nightly-chain.yml`.

---

## 8. NOT DONE — nothing here is reported as whole

- `ENGINE_ENABLED=false` — classifier-blocked, operator must run it
- Raw landing migration — not written
- The backfill run — NOT started (correctly gated behind step 1)
- Typed tables, brains, scalars, `_ENRICH_ONLY_COLS` additions — none written
- No spec / brainstorm / TDD for steps 3-4
- `cadence_registry` `source_scope` for listing_lifecycle still omits the 4 unread families
  (check `listing_lifecycle_source_scope_missing_families`)
- `docs/steadyapi-capability-census.md` §4 still lists per-listing DOM as a vendor ceiling —
  `days_after_listed` contradicts it; not yet corrected
- Nothing committed, nothing pushed

## 9. CHECKS TOUCHED THIS SESSION

Opened: `engine_enabled_kill_switch_owed` (defect) · `steadyapi_pth_raw_landing_before_backfill`
(task) · `listing_lifecycle_source_scope_missing_families` (defect).
Closed: `dom_backfill_unreachable_no_pid_count` with the SQL in section 6.
**Should have been used instead of opening new ones: `dom_backfill_repull_17k`.**
