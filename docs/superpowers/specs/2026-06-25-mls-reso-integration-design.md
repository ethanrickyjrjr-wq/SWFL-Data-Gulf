# MLS / RESO Integration — Design Spec
**Date:** 2026-06-25  
**Status:** Approved  
**Boards targeted:** Bridge (SWFL MLS), Trestle (NABOR)

---

## What Changed From The First Pass

| Item | Old | Corrected |
|---|---|---|
| Auth | Per-user OAuth2 + encrypted token storage | Static Bearer token per board (env var); user provides MemberMlsId only |
| Stats | Statistics endpoint | Doesn't exist — compute from Property feed locally |
| Incremental sync | Timestamp polling | EntityEventSequence (RCP-27) — monotonic int64 |
| Access level | IDX (active-only) | VOW — required for agent's own closed history |
| Sync mechanism | Supabase Edge Function | Vercel cron → Next.js API route (matches existing `/api/cron/*` pattern) |

---

## Auth Model

Bridge and Trestle issue one Bearer token per board to us as a registered vendor.  
Tokens live in Vercel env vars: `RESO_TOKEN_SWFL_MLS`, `RESO_TOKEN_NABOR`, `RESO_BASE_URL_SWFL_MLS`, `RESO_BASE_URL_NABOR`.  
Users never touch credentials. They provide only their `MemberMlsId` (on their license).

---

## Data Layer

### `public.user_mls_connections` (Supabase, RLS by user_id)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid FK | auth.uid() — RLS enforced |
| board_slug | text | `swfl_mls` \| `nabor` |
| member_mls_id | text | agent's MLS ID from their license |
| last_entity_event_sequence | bigint | NULL on first connect; updated after each sync |
| status | text | `pending` \| `active` \| `error` |
| connected_at | timestamptz | |
| last_synced_at | timestamptz | |
| error_message | text | nullable |

No token columns — our Bearer token is an env var.

### `data_lake.user_mls_listings`

Agent's own Property records, filtered by `ListAgentMlsId eq '{member_mls_id}'`.

| Column | Type |
|---|---|
| listing_key | text |
| user_id | uuid |
| board_slug | text |
| list_price | numeric |
| close_price | numeric |
| listing_contract_date | date |
| close_date | date |
| days_on_market | int |
| bedrooms_total | int |
| bathrooms_total | numeric |
| living_area | numeric |
| postal_code | text |
| standard_status | text |
| property_type | text |
| synced_at | timestamptz |
| PK | (listing_key, board_slug) |

### `data_lake.user_mls_stats`

Computed locally from `user_mls_listings` + full VOW feed for agent's coverage ZIPs.

| Column | Type | Notes |
|---|---|---|
| user_id | uuid | |
| board_slug | text | |
| postal_code | text | |
| period_months | int | 24 |
| median_close_price | numeric | |
| avg_days_on_market | numeric | |
| active_count | int | |
| close_count | int | |
| avg_price_per_sqft | numeric | |
| computed_at | timestamptz | |
| PK | (user_id, board_slug, postal_code) | |

---

## `lib/reso/` — Three Files

### `client.ts`
- Reads `RESO_BASE_URL_{BOARD}` + `RESO_TOKEN_{BOARD}` from env
- OData query builder: `$filter`, `$select`, `$top=200&$skip=n`
- Single `get(resource, params)` — returns typed array, handles pagination internally
- Board slug → env var name mapping lives here

### `pull-agent-listings.ts`
```
GET /Property
  ?$filter=ListAgentMlsId eq '{member_mls_id}' and StandardStatus in ('Active','Closed','Pending','ActiveUnderContract')
  &$select=ListingKey,ListPrice,ClosePrice,ListingContractDate,CloseDate,DaysOnMarket,BedroomsTotal,BathroomsTotalInteger,LivingArea,PostalCode,StandardStatus,PropertyType
  &$top=200&$skip=n
```
Paginate until empty page. Upsert into `data_lake.user_mls_listings`.

### `pull-zip-stats.ts`
```
GET /Property
  ?$filter=PostalCode in ({agent_zip_list}) and CloseDate ge {24_months_ago}
  &$select=ClosePrice,ListPrice,DaysOnMarket,PostalCode,CloseDate,LivingArea
  &$top=200&$skip=n
```
Aggregate locally (median, avg DOM, counts, price/sqft). Write to `data_lake.user_mls_stats`.  
ZIP list derived from distinct `postal_code` values in `user_mls_listings` for this user.

> **Note on OData `in` syntax:** Confirm against Bridge sandbox — may need `(StandardStatus eq 'Active' or StandardStatus eq 'Closed')` form if the board's RESO server doesn't support collection `in`.

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/mls/connect` | POST | Create connection record, trigger initial sync, return preview data |
| `/api/mls/sync` | POST | User-triggered sync for one connection_id |
| `/api/mls/sync` | GET | Vercel cron fan-out — syncs all active connections |
| `/api/mls/disconnect` | DELETE | Remove connection + associated data_lake rows |

---

## Sync — `app/api/mls/sync/route.ts`

### POST (full sync for a single connection)
Used by the user-triggered Refresh button. Body: `{ connection_id }`.

1. Load connection from `user_mls_connections`, verify `user_id = auth.uid()`
2. Pull full EntityEvent log since `last_entity_event_sequence`:
   ```
   GET /EntityEvent?$filter=EntityEventSequence gt {last_seq}&$top=500
   ```
3. Batch-fetch changed Property records by `ListingKey`
4. Upsert into `user_mls_listings`
5. Update `last_entity_event_sequence` + `last_synced_at`
6. Re-derive agent ZIP list → recompute `user_mls_stats` via `pull-zip-stats`

### GET (cron fan-out — Vercel cron, authenticated by `CRON_SECRET`)
Called on schedule (every 6h). Loads all `status = 'active'` connections, runs sync for each sequentially (or with controlled concurrency).

---

## UI — `/settings/mls`

Three sequential screens within one route.

### Screen 1: Connect
- Board dropdown: `SWFL MLS (Bridge)` \| `NABOR (Trestle)` — boards without a live env token show `[Coming soon]` but the input still saves and queues
- Input: "Your MLS ID — this is on your license" (label: `MemberMlsId`)
- Connect button → `POST /api/mls/connect` → creates connection record, triggers first sync

### Screen 2: Preview (shown after first sync completes)
- "We found 14 active listings and 47 closed sales."
- "Covering ZIPs: 33901, 33907, 34102."
- Confirm button → sets `status = 'active'`
- Back button → deletes connection (don't hold incomplete connections)

### Screen 3: Status
- Last synced timestamp
- Listing + sale counts
- Coverage ZIPs
- Error state with message (if `status = 'error'`)
- Disconnect button (deletes connection + data for that user+board)
- Refresh button → `POST /api/mls/sync` → shows spinner, refreshes on completion

---

## Brain Integration

MLS data enters the assistant as a **Lane 2 source**: the agent's own data, not the market-wide lake.

- A new `ProjectItem` kind `mls_listing_summary` OR surface via the existing assistant context as a structured data frame injected into the system prompt when a connection is `active`
- FactChip citation label: `[Your MLS listings — SWFL MLS]`
- Collision detection: when `user_mls_stats` overlaps with our lake's housing stats for the same ZIP + period, surface both and note the source
- The brain integration is **Phase 2** — Phase 1 delivers the plumbing (connection, sync, UI) and the data sits in `data_lake.user_mls_stats` ready to be read

---

## Vendor Application (parallel, do now)

1. Register at `bridgedataoutput.com` — Application Profile describing SWFL Data Gulf
2. Email `api@bridgeinteractive.com` — request SWFL MLS + NABOR invite as approved vendor; request VOW feed access
3. Submit "Request information" at `cotality.com/products/trestle`
4. Build targets **Bridge sandbox** while board approval processes (`RESO_BASE_URL_SWFL_MLS` = sandbox URL in dev)

---

## What We Don't Build

- Per-user OAuth flows
- Token refresh rotation
- A pre-aggregated Statistics endpoint call
- Timestamp-based incremental sync
- Supabase Edge Functions (follows Next.js API route pattern)
