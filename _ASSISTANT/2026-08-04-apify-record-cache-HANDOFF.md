# HANDOFF — wire the Apify record cache into emails, social, and the pages

**Date:** 08/04/2026 · **Session:** listings-digest section cards + the 69-field cache
**Status:** the STORE is built and live-proven. Nothing READS it yet. That is the whole job below.

---

## 0. Read these first, in this order

1. `docs/standards/data-roots.md` → the new section **"EVERY Apify property record — one root, all
   69 fields"**. It is the authority for this table; if this handoff and that catalog ever disagree,
   the catalog wins.
2. `docs/standards/emails.md` §0 — the pre-coding rules card. Any recipe change below obeys it.
3. `lib/listings/apify-record-store.ts` — the write/read root.
4. `_ASSISTANT/SCRATCHPAD.md` top entries 08/04/2026 — four operator gripes from this session and
   what each one actually was.

---

## 1. What shipped (do not rebuild these)

**`data_lake.apify_property_records`** — 46 promoted columns + a `raw` jsonb holding the untouched
record. Keyed `address_key` = normalised `street + city`.

- Write root: `saveApifyRecords()` called from **inside** `fetchApifyComps()`
  (`lib/listings/apify-comps.ts`) — the ONE Apify fetch root, so baths / comp photos / descriptions
  all persist without opting in.
- Read root: `fetchCachedRecords(addressKeys, maxAgeDays = 30)` — **exists, is exported, and NOTHING
  CALLS IT.** That is job #1 below.
- Migration: `bun scripts/migrate-apify-records.mts` (idempotent, includes grants + schema reload).

**Live proof, 08/04/2026:** `ROWS SAVED: 4`, `distinct RAW fields preserved: 69`. Real values now
held that were previously discarded: `hoa_fee` 200 (13630 Brynwood Ln), `last_sold_price` 455000 /
`last_sold_date` 02/02/2021 (5121 Muddy Ln), `style` SINGLE_FAMILY, `year_built`, `days_on_mls`,
**50 `alt_photos` per home**, descriptions 2,081–2,983 chars.

**Also shipped this session** (context for anyone touching the digest):

- `listing-grid` gained `surface: "none" | "card" | "outline"` + `surfaceBg`. Default `"none"` is
  byte-identical to the old markup (proven: 10,311 bytes both ways, pinned by a named test). The
  digest ships `surface: "card"`; the colour is `SECTION_SURFACE_BG = "#EFE6D8"` (warm sand) in
  `lib/email/doc/types.ts`. Lab control is in `BlockInspector` (None / Card / Border only).
- `big-lot` category now requires `lot >= 0.5 ac AND sqft >= 3000`, and moved to **FIRST** in
  `CATEGORIES` because it is now the scarcest.
- The paid bath lane now looks homes up **by address** (`fetchApifyBathsForHomes`), driven off a
  provisional selection pass so we only pay for homes that will become cards.

---

## 2. THE WORK — in dependency order

### 2.1 Read the cache before paying (check `apify_cached_records_unread`)

Today every build re-buys houses already in the table. In `listings-digest.ts` `withBaths()`, before
calling `fetchApifyBathsForHomes`, call `fetchCachedRecords()` on the same address keys and remove
the hits from `stillMissing`.

Guard to name in the test: **a cache hit must not be older than the freshness window for the field
being read.** Specs (beds/baths/sqft/style/year) barely move — a long window is fine. `list_price`,
`mls_status`, `days_on_mls` move constantly — never serve those from a stale row.

### 2.2 Wire `style` into comp comparability (operator decree, still unhonoured)

Operator, 08/04/2026: *"WE AREN'T COMPARING HOUSES BY DOM. IT SHOULD BE DISTANCE/COMPARABILITY …
FOR THE MOST PART, WE WANT SIMILAR SQ FT, STYLE, BEDS AND BATHS SAME OR CLOSE AND POOL OR NO POOL."*

`style` is now a stored column. `isComparableHome` in `lib/deliverable/recipes/market-comps.ts` does
not read it. Wire it. **Do not** let DOM become a ranking factor — narrative colour only.
Pool is still NOT a held field anywhere — check before claiming it.

### 2.3 The email surfaces that should read this table

- **Comp photos** — `resolveCompPhotos` lane 2. The record carries `primary_photo` + up to 50
  `alt_photos`. The catalogued `listing_photo_enrichment` 🔴 is SUPERSEDED by this table; do not
  build it.
- **Listing descriptions** — `description` (2–3k chars) is stored. `truncateDescription` already
  handles the virtual-staging disclosure rule — reuse it, never re-cut.
- **Sold-price history** — `last_sold_price` / `last_sold_date` are real and populated. Cross-check
  against the `lee_deed_official_records` / LEEPA lanes before serving as authority; **do not** let
  this become a second root for sold price without a data-roots decision.
- **HOA fees** — ⚠️ **contradicts our own research file**, which records HOA as "absent vendor-wide."
  That finding was about the OTHER vendor. Correct the research note when you wire this.

### 2.4 Social playbook

`lib/social/CLAUDE.md` is currently being edited by another session — coordinate before touching.
The carousel work has its own handoff: `_ASSISTANT/2026-08-03-social-carousel-apify-HANDOFF.md`.
The relevant new capability: **50 photos per home** makes a real multi-image carousel possible from
held data instead of one hero shot. Check `lib/social/` platform safe-zones before sizing.

### 2.5 Pages

Nothing on the site reads this table. Before adding a page, `docs/standards/data-roots.md` decides
which concept it serves — do not create a second root for sold price, HOA, or photos.

---

## 3. Failure modes already paid for — do not rediscover these

1. **Fire-and-forget writes never land.** The first cut used `void saveApifyRecords(...)`. Build
   processes (CLI + serverless) exit before the write completes: table sat at ZERO rows while every
   call still billed. It is `await`ed now. Do not "optimise" that back.
2. **A new table is invisible to the app without grants.** Creating it over a direct Postgres
   connection is half the job. Without `GRANT USAGE ON SCHEMA` + `GRANT SELECT, INSERT, UPDATE` and
   `NOTIFY pgrst, 'reload schema'`, every write returns an error the caller swallows. Both are in the
   migration now.
3. **Enriching data CHANGES SELECTION.** Filling bath counts made one estate "full-spec"; an earlier
   category ranks full-spec homes higher, took it, and the big-lot section fell under its 4-card
   minimum and VANISHED. Fixed by ordering big-lot first. Any new enrichment must be re-checked
   against section survival, not just against the field it fills.
4. **A sweep is not a lookup.** Asking the vendor for "60 homes in a ZIP" (or a city) returns a
   sample; the homes you want are usually not in it. Ask for the specific address — 1 call, 1 record,
   and it bills LESS than the sweep.
5. **Widening a pool silently breaks every enrichment keyed to the old scope.** The digest pool is
   ZIP-local + city backfill; the bath lookup stayed keyed to the requested ZIP and missed every
   backfilled home. Nothing errored.
6. **Presence in the markup is not visibility.** Two "light card" colours shipped at 3–6% off white,
   were confirmed present by grep five times per email, and were invisible. A surface meant to be
   seen sits ~8–15% off its backdrop.

---

## 4. Open checks this handoff belongs to

- `apify_cached_records_unread` — the cache is written but not read (§2.1)
- `apify_record_cache_live_verify` — the build's live-verify
- `big_lot_sqft_floor_margin` — 3,000 sqft leaves EXACTLY 4 eligible homes in Fort Myers; 2,500
  leaves 6. Operator's knob, not a silent retune.
- `listings_digest_grid_live_verify` — still open; inbox confirmation is the operator's.

---

## 5. Test commands that must stay green

```
bun test lib/deliverable/recipes/listings-digest.test.ts
bun test lib/email/blocks/
bunx next build
bun scripts/migrate-apify-records.mts     # idempotent, safe to re-run
NO_SEND=1 DUMP_PATH=tmp/x.html bun scripts/email/tmp-listings-digest-send.mts
```

The send script takes `SURFACE_BG=#RRGGBB` and `SUBJECT_SUFFIX="…"` for variant proofs.
