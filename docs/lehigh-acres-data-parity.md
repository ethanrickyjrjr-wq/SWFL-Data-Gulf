# Lehigh Acres — data-parity roadmap (catch up to Fort Myers / Naples)

**Goal:** give Lehigh Acres (Lee County CDP, ~114k residents) the same depth of data
attention the Fort Myers and Naples corridors get. As of 2026-06-06 Lehigh has **two
corridors live** in `corridor_profiles` — **Lee Blvd** and **Joel Blvd** — both with
NULL CRE metrics.

Written 2026-06-06. Evidence below is from live lake/DB queries this session, not memory.

---

## What Lehigh ALREADY has (parity at ZIP / county grain — inherited, no work)

Lehigh is Lee County, and its six ZIPs (`33936, 33971, 33972, 33973, 33974, 33976`)
are present in the ZIP-grained datasets. It inherits everything county/metro-level
**automatically** — same as any Fort Myers ZIP:

| Surface                                            | Coverage                      | Evidence                 |
| -------------------------------------------------- | ----------------------------- | ------------------------ |
| ZORI rent index                                    | all 6 ZIPs, 17–52 rows each   | `zori_swfl` query        |
| LeePA parcels (just_value / last_sale / use_codes) | Lee County corpus             | `*_2026_05_30` views     |
| Redfin market, macro-swfl, labor-demand-swfl       | county / metro grain          | inherited                |
| safety-swfl (property crime)                       | Lee County rate               | inherited (county grain) |
| env-swfl flood AAL                                 | per-ZIP NFIP                  | inherited (ZIP grain)    |
| city_pulse corridor news                           | **now flowing** (2 corridors) | `city_pulse_corridors`   |

**So the parity gap is NOT ZIP/county data — it is corridor-grain CRE depth.**

---

## Gaps — most important → least

### 1. CRE corridor metrics (cap_rate / vacancy / asking rent / absorption) — HIGHEST

The single visible gap. `/r/cre-swfl/lee-blvd-lehigh-acres` and `.../joel-blvd-lehigh-acres`
render an **empty metrics table**; every Fort Myers / Naples corridor shows a full one.

- **Why blocked:** no broker (MarketBeat) survey coverage for Lehigh → no auto-source.
- **Path:** Operation Dumbo Drop **manual drop**. Consumer is already null-tolerant
  (`buildMetricRows()` gates each metric `!== null`), so this is a **zero-code graduation**:
  hand-key cap_rate / vacancy_rate_pct / asking_rent_psf / absorption_sqft + `metrics_period`
  - `metrics_verified_date` + per-metric `*_source_url` into the two `corridor_profiles` rows.
- **Do NOT inherit a regional cap_rate** — fixture spread is 5.8–8.5; stamping one = an
  invented number (RULE 3 / no-invention).
- **Tracked:** check `lehigh_cre_metrics` (cre-swfl, due 2026-09-30).

### 2. Permit-activity corridor z-scores — HIGH (precise blocker found)

Fort Myers corridors carry permit-velocity z-scores from the centroid+radius join.
Lehigh now has centroids, **but the join still produces zero**, for a concrete reason:

- `data_lake.lee_building_permits` holds **29 permits in Lehigh ZIPs** — but **all 29 have
  NULL lat/lon** (`with_geocode = 0`). The corridor join is geometric (centroid + radius),
  so ungeocoded rows never attach.
- Compounding: only **119 total Lee permits** in the table — consistent with permits-swfl
  v1 being first-page-only (permits-swfl v2 pagination is a separate active project).
- **Action:** (a) backfill lat/lon for the Lehigh permits (geocode `address` → point);
  (b) land permits-swfl v2 so volume is real. Then z-scores light up with no pack change.
- **Tracked:** check `lehigh_permit_geocode`.

### 3. Broker / qualitative narrative (`character_broker_narrative`) — MEDIUM

Both Lehigh rows have a basic `character` line but no broker narrative. Richer FM/Naples
corridors carry the broker view.

- **Path:** run the type-conditional corridor-character generator (already shipped) for
  the two Lehigh corridors — produces the speculative, self-disclaimed voice block.
- **Tracked:** check `lehigh_broker_narrative`.

### 4. ZIP-drill render verification — LOW (data exists; confirm UX)

The 6 Lehigh ZIPs have ZORI / parcel / flood data, so the reads should already work.

- **Action:** smoke-test `/r/zip-report/{33936,33971,33972,33973,33974,33976}`; confirm
  housing / env ZIP-drill renders them and that they're in the provenance allowlist.
- Not yet a check — open one only if a ZIP renders blank.

### 5. MarketBeat submarket enrichment — LOWEST (parked, zero-code-ready)

Requires a broker survey region for Lehigh that does not exist today (same documented
zero-row state as Estero / Fort Myers Beach). The `"Lehigh Acres"` submarket alias is
already registered, so if a broker region ever appears it is a zero-code graduation.

- **No action** until broker data exists.

---

## Sequence

1 (manual data drop) and 2 (permit geocode + v2) are the real parity moves; 3 is a
generated nicety; 4 is verification; 5 is parked. Closing 1 + 2 makes a Lehigh corridor
page indistinguishable in depth from a Fort Myers one.
