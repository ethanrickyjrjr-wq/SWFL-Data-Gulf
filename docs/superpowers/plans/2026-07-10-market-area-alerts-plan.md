# Market-Area Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 11 tasks, 26 files, keywords: migration, architecture

**Spec:** `docs/superpowers/specs/2026-07-10-market-area-alerts-design.md` (APPROVED + 07/10/2026 research amendments folded in). Read it before starting any task.

**Goal:** Replace the weekly-read AI content pipeline with a deterministic event-fired engine: alert emails when a real market event fires in a subscriber's market area, a movement-gated weekly roundup, and a baseline welcome email on signup — every number a held, citable figure; zero LLM calls in the loop.

**Architecture:** New pure detector/composer modules under `lib/email/zip-events/` (mirroring the `watch-delta.ts` discipline: no DB/disk/Date.now/network, injected inputs, fail closed). One committed market-area fixture groups the 58 Lee+Collier ZIPs. Detection state = one snapshot row per ZIP in a new `market_event_snapshots` table, advanced ONLY after a confirmed send. The existing weekly-read subscriber table, cadence, batch send, unsubscribe, and webhook plumbing all stay; only the runner's content path swaps.

**Tech Stack:** TypeScript (Next.js app + Bun scripts), bun:test, Supabase (service-role via `createServiceRoleClient`), Resend batch send, migrations via Bun.SQL (`migrations/*.sql`, psql is NOT installed).

## Global Constraints

- **Footprint = 58 Lee (12071) + Collier (12021) ZIPs only.** Charlotte/Sarasota/Glades/Hendry never appear anywhere (fixture, copy, coverage claims).
- **No LLM in this pipeline.** Numbers computed in code; copy is slotted template micro-copy. `buildContentDoc` is NOT called by this engine.
- **Never invent a number.** Missing input ⇒ no event (fail closed). Every fact carries a `source` string.
- **Pure-core discipline:** modules in `lib/email/zip-events/` take injected inputs — NO DB, NO disk, NO `Date.now()`, NO network. Adapters live in the runner/state module.
- **All thresholds are named exported constants marked `[PROVISIONAL]`** (operator-tunable; tuned later on per-trigger engagement data).
- **Subject contract:** number + place name inside the first 37 characters (Gmail-app truncation); ZIP-grain event ⇒ subscriber's own place named, area label otherwise.
- **Snapshot advances ONLY after a confirmed send.** A failed send never swallows an event. DRY_RUN mutates nothing.
- **ONE render root:** `renderEmailDocHtml` (`lib/email/render-email-doc.ts`). Never a new renderer.
- **Customer-clean copy:** no internal ids (area_id/zip-events/trigger slugs) in rendered emails; as-of date MM/DD/YYYY stated once.
- **Migrations idempotent** (`create table if not exists` etc.), run via Bun.SQL, row count verified after.
- **Commit style:** stage explicit paths only, never `git add -A`. Push only via `node scripts/safe-push.mjs` WITH operator confirmation (house rule: never push without explicit confirmation).
- **lib/email/CLAUDE.md conventions apply** (h-full/dvh, CAN-SPAM postal footer stays, send-is-the-paywall).

---

## File Structure

```
fixtures/swfl-market-areas.json                 committed, generated, human-reviewed
scripts/geo/build-market-areas.mts              generator (run once, output committed)
lib/email/zip-events/types.ts                   MarketEvent + snapshot types (pure data)
lib/email/zip-events/market-areas.ts            fixture loader + areaForZip (+ .test.ts)
lib/email/zip-events/detect.ts                  threshold-cross / rank-flip / lifecycle-burst /
                                                nearby-news detectors + constants (+ .test.ts)
lib/email/zip-events/heat.ts                    heat rank + heat-shift detector (+ .test.ts)
lib/email/zip-events/gate.ts                    movement gate + fill ladder + alert/roundup
                                                batching (+ .test.ts)
lib/email/zip-events/compose.ts                 events → EmailDoc + subject contract (+ .test.ts)
lib/email/zip-events/webhook.ts                 ma-tag engagement extract (+ .test.ts)
lib/email/zip-events/state.ts                   snapshot load/assemble/advance (thin adapter)
migrations/20260711_market_event_snapshots.sql  snapshot state
migrations/20260711_market_alert_engagement.sql per-recipient × per-trigger engagement rows
scripts/email/weekly-read-run.mts               MODIFIED: content path swaps to composer;
                                                baseline + alert + weekly classes
lib/email/weekly-read/send.ts                   MODIFIED: per-message extra tags
app/api/webhooks/resend/route.ts                MODIFIED: engagement insert for ma-tagged events
.github/workflows/weekly-read.yml               MODIFIED: dispatch-DRY daily cadence comment
components/email/DigestSubscribe.tsx            MODIFIED: alert-promise copy reframe
```

Everything in `lib/email/zip-events/` is importable by both the Next app and Bun scripts (same pattern as `lib/email/weekly-read/`).

---

### Task 1: Event + snapshot types (pure data)

**Files:**
- Create: `lib/email/zip-events/types.ts`

**Interfaces:**
- Consumes: nothing (imports from no one — mirrors `lib/email/doc/types.ts` discipline).
- Produces: `MarketEvent`, `MarketFact`, `MarketEventType`, `MarketEventClass`, `MarketEventGrain`, `MetricKey`, `ZipMetricsSnapshot`, `METRIC_LABELS`, `METRIC_UNITS` — every later task imports these.

No test cycle (pure declarations, no behavior). One step.

- [ ] **Step 1: Write the types file and commit**

```typescript
// lib/email/zip-events/types.ts
//
// Market-area alerts data model (spec 2026-07-10-market-area-alerts-design.md).
// PURE data — no imports, no I/O. Detection state is one ZipMetricsSnapshot per
// ZIP (market_event_snapshots.payload); a MarketEvent is a typed, fact-backed
// occurrence a detector derived from comparing a STORED snapshot to fresh data.
// Missing input ⇒ no event — an absent metric is null, never a guessed number.

export type MarketEventType =
  | "threshold_cross"
  | "rank_flip"
  | "lifecycle_burst"
  | "nearby_news"
  | "heat_shift";

/** alert = fires standalone (≤1 email/day); weekly = roundup material;
 *  baseline = the one-time welcome snapshot (first issue after signup). */
export type MarketEventClass = "alert" | "weekly" | "baseline";

export type MarketEventGrain = "zip" | "area" | "city" | "county";

/** One held, citable figure. `source` names where the number lives (e.g.
 *  "SWFL Data Gulf listing lifecycle" / "SWFL Data Gulf ranked signals") —
 *  it rides the collapsed source list, never inline copy. */
export interface MarketFact {
  label: string;
  from?: number | null;
  to?: number | null;
  value: number | null;
  unit: string; // "$", " days", "%", "" — display suffix/prefix hint
  source: string;
}

export interface MarketEvent {
  type: MarketEventType;
  grain: MarketEventGrain;
  area_id: string;
  zip?: string;
  class: MarketEventClass;
  facts: MarketFact[];
}

/** The deltable per-ZIP metrics the engine tracks. Extend here + METRIC_LABELS
 *  together — a key without a label is a compile error downstream. */
export type MetricKey =
  | "median_sale_price"
  | "median_dom"
  | "actives"
  | "sold_count_30d"
  | "sale_to_list_ratio";

export const METRIC_LABELS: Record<MetricKey, string> = {
  median_sale_price: "Median sale price",
  median_dom: "Median days on market",
  actives: "Active listings",
  sold_count_30d: "Homes sold (30 days)",
  sale_to_list_ratio: "Sale-to-list ratio",
};

export const METRIC_UNITS: Record<MetricKey, string> = {
  median_sale_price: "$",
  median_dom: " days",
  actives: "",
  sold_count_30d: "",
  sale_to_list_ratio: "%",
};

/** The stored per-ZIP detection state — "the facts last shown". Heat inputs are
 *  per-ZIP so an area's previous heat rank is recomputable deterministically
 *  from stored rows (no separate area snapshot). */
export interface ZipMetricsSnapshot {
  zip: string;
  /** YYYY-MM-DD the underlying data was as-of when captured. */
  as_of: string;
  metrics: Record<MetricKey, number | null>;
  /** Position (1-based) in the ranked signal pool's headline metric, or null. */
  rank_position: number | null;
  /** Heat inputs at capture time (nulls preserved — an area missing inputs is
   *  EXCLUDED from the heat rank, never zero-filled). */
  heat: {
    median_dom_trend: number | null;
    sale_to_list_ratio: number | null;
    price_momentum_pct: number | null;
    sold_momentum_pct: number | null;
  };
}
```

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep zip-events` — expect no output (file compiles). Note the house rule: full verification is `bunx next build`, run at integration tasks; a grep-scoped tsc pass is enough for a pure declaration file.

```bash
git add lib/email/zip-events/types.ts
git commit -m "feat(zip-events): market-area alert event + snapshot types"
```

---

### Task 2: Market-area fixture — generator, committed fixture, loader

**Files:**
- Create: `scripts/geo/build-market-areas.mts`
- Create: `fixtures/swfl-market-areas.json` (generator output, committed after operator eyeball)
- Create: `lib/email/zip-events/market-areas.ts`
- Test: `lib/email/zip-events/market-areas.test.ts`

**Interfaces:**
- Consumes: `resolveZip(zip): ZipResolution` from `@/refinery/lib/zip-resolver.mts` (fields used: `in_scope`, `primary_county`, `places[{place, match}]`, `barrier.classification`); `fixtures/swfl-zip-county.json` (100 entries; filter to counties 12071/12021 → the 58); `fixtures/swfl-zip-centroids.json` (`entries[{zip, lat, lng}]`); `haversineMi(lat1, lng1, lat2, lng2)` from the same resolver module.
- Produces: `MarketArea` interface, `loadMarketAreas(): MarketArea[]`, `areaForZip(zip: string): MarketArea | null` — consumed by Tasks 4–8.

- [ ] **Step 1: Write the failing loader test**

```typescript
// lib/email/zip-events/market-areas.test.ts
import { describe, expect, test } from "bun:test";
import { areaForZip, loadMarketAreas } from "./market-areas";

describe("market-areas fixture", () => {
  test("covers exactly the 58 Lee+Collier ZIPs, each in exactly one area", () => {
    const areas = loadMarketAreas();
    const zips = areas.flatMap((a) => a.zips);
    expect(zips.length).toBe(58);
    expect(new Set(zips).size).toBe(58);
    for (const a of areas) {
      expect(["12071", "12021"]).toContain(a.county);
      expect(a.zips.length).toBeGreaterThanOrEqual(1);
      expect(a.zips.length).toBeLessThanOrEqual(6);
    }
    // ~12-18 named areas (spec)
    expect(areas.length).toBeGreaterThanOrEqual(10);
    expect(areas.length).toBeLessThanOrEqual(20);
  });

  test("barrier lock: Sanibel is not in a mainland area", () => {
    const sanibel = areaForZip("33957"); // Sanibel
    expect(sanibel).not.toBeNull();
    const cape = areaForZip("33904"); // Cape Coral
    expect(cape).not.toBeNull();
    expect(sanibel!.area_id).not.toBe(cape!.area_id);
  });

  test("county lock: no area mixes Lee and Collier ZIPs", () => {
    // county field is single-valued per area by construction; verify member ZIPs agree
    for (const a of loadMarketAreas()) {
      expect(new Set([a.county]).size).toBe(1);
    }
  });

  test("areaForZip returns null for out-of-footprint ZIP", () => {
    expect(areaForZip("33440")).toBeNull(); // Hendry — never implied coverage
  });

  test("labels are customer-clean (no ids, no underscores)", () => {
    for (const a of loadMarketAreas()) {
      expect(a.label).not.toMatch(/[_§]|area_id/);
      expect(a.label.length).toBeGreaterThan(3);
    }
  });
});
```

- [ ] **Step 2: Run it — expect module-not-found FAIL**

Run: `bun test lib/email/zip-events/market-areas.test.ts`
Expected: FAIL — cannot resolve `./market-areas`.

- [ ] **Step 3: Write the generator**

```typescript
// scripts/geo/build-market-areas.mts
//
// Groups the 58 Lee+Collier ZIPs into named market areas and writes the
// committed fixture fixtures/swfl-market-areas.json. Rules, in order (spec §1):
//   1. Place anchor  — resolveZip primary place → that place's area.
//   2. Barrier lock  — barrier-classified ZIPs never merge with mainland areas.
//   3. Nearest-anchor fill — unplaced ZIPs join nearest anchor by centroid,
//      county-locked, capped at MAX_JOIN_MILES.
//   4. Band flag     — a distance-joined ZIP whose 180-day median sold price is
//      >BAND_RATIO_MAX off (or <1/BAND_RATIO_MAX of) the area's median-of-medians
//      is emitted with needs_review (listed loudly), never silently auto-joined.
//      Sold prices come from data_lake listing_transitions via service role; run
//      with --skip-band to emit geography-only (band flags then all empty, noted).
//
// Usage: bun scripts/geo/build-market-areas.mts [--skip-band]
// Output is COMMITTED and human-reviewed — a subscriber's market area must not
// churn week to week. Regenerate only deliberately; snapshot test diffs must be
// intentional.

import { readFile, writeFile } from "node:fs/promises";
import { haversineMi, resolveZip } from "../../refinery/lib/zip-resolver.mts";
import { createServiceRoleClient } from "../../utils/supabase/service-role";

const MAX_JOIN_MILES = 12; // [PROVISIONAL] operator-tunable join cap
const BAND_RATIO_MAX = 2; // [PROVISIONAL] median-price band flag threshold
const FOOTPRINT_COUNTIES = new Set(["12071", "12021"]); // Lee + Collier ONLY

interface Centroid {
  zip: string;
  lat: number;
  lng: number;
}

function slugify(place: string): string {
  return place.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function labelFor(place: string): string {
  // Customer-clean label; islands read as themselves, mainland as "the X market".
  return `the ${place} market`;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function soldMediansByZip(zips: string[]): Promise<Map<string, number>> {
  const db = createServiceRoleClient();
  const out = new Map<string, number>();
  const since = "2026-01-11"; // 180 days before generation date; stamped in fixture note
  for (const zip of zips) {
    const { data, error } = await db
      .from("listing_transitions")
      .select("sold_price")
      .eq("zip_code", zip)
      .eq("to_state", "sold")
      .gte("sold_date", since)
      .not("sold_price", "is", null);
    if (error) throw new Error(`sold query ${zip}: ${error.message}`);
    const m = median((data ?? []).map((r) => r.sold_price as number));
    if (m !== null) out.set(zip, m);
  }
  return out;
}

async function main(): Promise<void> {
  const skipBand = process.argv.includes("--skip-band");

  const countyRaw = JSON.parse(await readFile("fixtures/swfl-zip-county.json", "utf8"));
  const centroidRaw = JSON.parse(await readFile("fixtures/swfl-zip-centroids.json", "utf8"));
  const centroids = new Map<string, Centroid>(
    (centroidRaw.entries as Centroid[]).map((e) => [e.zip, e]),
  );

  // The 58: county fixture filtered to Lee+Collier (spec: crosswalk file ≠ coverage).
  const footprint: string[] = (countyRaw.entries ?? countyRaw)
    .filter((e: { counties?: string[]; county?: string }) => {
      const cs: string[] = e.counties ?? (e.county ? [e.county] : []);
      return cs.some((c) => FOOTPRINT_COUNTIES.has(c));
    })
    .map((e: { zip: string }) => e.zip);

  interface Draft {
    area_id: string;
    label: string;
    county: string;
    anchor_place: string;
    barrier: boolean;
    zips: string[];
    needs_review: string[];
  }
  const areas = new Map<string, Draft>();
  const unplaced: string[] = [];

  // Rule 1 + 2: place anchor, barrier tracked per area.
  for (const zip of footprint) {
    const res = resolveZip(zip);
    if (!res.in_scope || !res.primary_county || !FOOTPRINT_COUNTIES.has(res.primary_county)) {
      continue; // out-of-footprint safety — never emitted
    }
    const place = (res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null;
    const isBarrier = res.barrier.classification !== null;
    if (!place) {
      unplaced.push(zip);
      continue;
    }
    const id = slugify(place);
    const cur = areas.get(id) ?? {
      area_id: id,
      label: labelFor(place),
      county: res.primary_county,
      anchor_place: place,
      barrier: isBarrier,
      zips: [],
      needs_review: [],
    };
    cur.zips.push(zip);
    areas.set(id, cur);
  }

  // Rule 3: nearest-anchor fill — county-locked, barrier-locked, distance-capped.
  const joined: string[] = [];
  for (const zip of unplaced) {
    const res = resolveZip(zip);
    const c = centroids.get(zip);
    if (!c) {
      console.error(`NEEDS_REVIEW: ${zip} has no centroid — left unassigned`);
      continue;
    }
    const zipBarrier = res.barrier.classification !== null;
    let best: { d: number; area: Draft } | null = null;
    for (const area of areas.values()) {
      if (area.county !== res.primary_county) continue; // county lock
      if (area.barrier !== zipBarrier) continue; // barrier lock (both directions)
      const anchorCentroid = centroids.get(area.zips[0]);
      if (!anchorCentroid) continue;
      const d = haversineMi(c.lat, c.lng, anchorCentroid.lat, anchorCentroid.lng);
      if (d <= MAX_JOIN_MILES && (!best || d < best.d)) best = { d, area };
    }
    if (best) {
      best.area.zips.push(zip);
      joined.push(zip);
    } else {
      console.error(`NEEDS_REVIEW: ${zip} joined no area (county/barrier/distance) — listed`);
    }
  }

  // Rule 4: band flag on distance-joined ZIPs only.
  if (!skipBand) {
    const medians = await soldMediansByZip(footprint);
    for (const area of areas.values()) {
      const areaMedian = median(area.zips.map((z) => medians.get(z)).filter((v): v is number => v != null));
      if (areaMedian === null) continue;
      for (const zip of area.zips) {
        if (!joined.includes(zip)) continue;
        const m = medians.get(zip);
        if (m == null) continue;
        const ratio = m / areaMedian;
        if (ratio > BAND_RATIO_MAX || ratio < 1 / BAND_RATIO_MAX) {
          area.needs_review.push(zip);
          console.error(`NEEDS_REVIEW: ${zip} median ${m} vs area ${areaMedian} (x${ratio.toFixed(2)})`);
        }
      }
    }
  } else {
    console.error("NOTE: --skip-band — band flags not computed this run.");
  }

  // Enforce 3-6 member target by splitting oversized areas? NO — split is a human
  // decision. Oversized areas are listed for the operator eyeball instead.
  for (const a of areas.values()) {
    if (a.zips.length > 6) console.error(`REVIEW SIZE: ${a.area_id} has ${a.zips.length} ZIPs (>6)`);
  }

  const fixture = {
    source:
      "Generated by scripts/geo/build-market-areas.mts from fixtures/swfl-zip-county.json (Lee 12071 + Collier 12021 = 58 ZIPs), fixtures/swfl-zip-centroids.json (Census TIGER centroids), refinery/lib/zip-resolver.mts places + barrier classification, and 180-day sold medians from the listing lifecycle lake (band flag).",
    rules:
      "1 place-anchor; 2 barrier-lock; 3 county-locked nearest-anchor fill capped at MAX_JOIN_MILES; 4 band flag >x2 median ratio emitted needs_review, never silently joined.",
    generated_date: "2026-07-10",
    areas: [...areas.values()]
      .sort((a, b) => a.area_id.localeCompare(b.area_id))
      .map(({ barrier: _b, ...rest }) => ({ ...rest, zips: rest.zips.sort() })),
  };
  await writeFile("fixtures/swfl-market-areas.json", JSON.stringify(fixture, null, 2) + "\n");
  console.log(`Wrote ${areas.size} areas covering ${[...areas.values()].reduce((n, a) => n + a.zips.length, 0)} ZIPs.`);
}

main().catch((err) => {
  console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
```

- [ ] **Step 4: Run the generator, eyeball the fixture, fix flags**

Run: `bun scripts/geo/build-market-areas.mts`
Expected: `Wrote N areas covering 58 ZIPs.` plus any `NEEDS_REVIEW`/`REVIEW SIZE` lines. If the ZIP count ≠ 58, the county-fixture filter is wrong — STOP and check `fixtures/swfl-zip-county.json` field names (`counties` vs `county`) before proceeding. **Operator eyeball is part of this step:** show the fixture + review lines; hand-adjust area membership in the JSON if ruled (the fixture is the artifact of record, the generator is its provenance).

- [ ] **Step 5: Write the loader**

```typescript
// lib/email/zip-events/market-areas.ts
//
// Committed-fixture loader for market areas (fixtures/swfl-market-areas.json).
// Static import (Next + Bun both bundle JSON) — a subscriber's market area is a
// stable, citable fixture fact, never runtime clustering.

import fixture from "@/fixtures/swfl-market-areas.json";

export interface MarketArea {
  area_id: string;
  label: string;
  county: string; // "12071" | "12021"
  anchor_place: string;
  zips: string[];
  needs_review: string[];
}

const AREAS: MarketArea[] = (fixture as { areas: MarketArea[] }).areas;
const BY_ZIP = new Map<string, MarketArea>();
for (const a of AREAS) for (const z of a.zips) BY_ZIP.set(z, a);

export function loadMarketAreas(): MarketArea[] {
  return AREAS;
}

/** null = out of footprint (never implied coverage — Hendry etc. resolve null). */
export function areaForZip(zip: string): MarketArea | null {
  return BY_ZIP.get(zip) ?? null;
}
```

If `@/fixtures/*` doesn't resolve, check how `lib/pulse/nearby.ts` imports `swfl-zip-centroids.json` and copy that exact import style.

- [ ] **Step 6: Run tests — expect PASS**

Run: `bun test lib/email/zip-events/market-areas.test.ts`
Expected: 5 pass. If the barrier test fails, ZIP 33957's `barrier.classification` came back null — verify with `bun -e "import {resolveZip} from './refinery/lib/zip-resolver.mts'; console.log(resolveZip('33957').barrier)"` and adjust the generator's barrier source, not the test.

- [ ] **Step 7: Commit**

```bash
git add scripts/geo/build-market-areas.mts fixtures/swfl-market-areas.json lib/email/zip-events/market-areas.ts lib/email/zip-events/market-areas.test.ts
git commit -m "feat(zip-events): committed market-area fixture + generator + loader"
```

---

### Task 3: Core detectors — threshold-cross, rank-flip, lifecycle-burst, nearby-news

**Files:**
- Create: `lib/email/zip-events/detect.ts`
- Test: `lib/email/zip-events/detect.test.ts`

**Interfaces:**
- Consumes: `MarketEvent`, `MarketFact`, `MetricKey`, `METRIC_LABELS`, `METRIC_UNITS`, `ZipMetricsSnapshot` (Task 1); `MarketArea` (Task 2).
- Produces (Tasks 6–8 rely on these exact signatures):
  - `detectThresholdCross(prev: ZipMetricsSnapshot | null, fresh: ZipMetricsSnapshot, area: MarketArea): MarketEvent[]`
  - `detectRankFlip(prevPos: number | null, freshPos: number | null, zip: string, area: MarketArea): MarketEvent | null`
  - `detectLifecycleBurst(w: LifecycleWindow, area: MarketArea): MarketEvent[]`
  - `detectNearbyNews(items: AreaNewsItem[], area: MarketArea): MarketEvent[]`
  - constants: `THRESHOLD_PCT_BAND`, `PRICE_ROUND_LEVEL_USD`, `RANK_TOP_N`, `RANK_JUMP_K`, `BURST_PRICE_CUTS_N`, `SURGE_RATIO`, `NOTABLE_SALE_AREA_RATIO`
  - `LifecycleWindow { zip; price_cuts; new_listings; trailing_weekly_new_listings; notable_sale: { sold_price; area_median_sale_price } | null }`
  - `AreaNewsItem { title; zip; distance_band; published_at }`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/email/zip-events/detect.test.ts
import { describe, expect, test } from "bun:test";
import type { ZipMetricsSnapshot } from "./types";
import type { MarketArea } from "./market-areas";
import {
  BURST_PRICE_CUTS_N,
  detectLifecycleBurst,
  detectNearbyNews,
  detectRankFlip,
  detectThresholdCross,
  RANK_TOP_N,
  SURGE_RATIO,
  THRESHOLD_PCT_BAND,
} from "./detect";

const AREA: MarketArea = {
  area_id: "cape-coral",
  label: "the Cape Coral market",
  county: "12071",
  anchor_place: "Cape Coral",
  zips: ["33904", "33914"],
  needs_review: [],
};

function snap(metrics: Partial<ZipMetricsSnapshot["metrics"]>): ZipMetricsSnapshot {
  return {
    zip: "33904",
    as_of: "2026-07-09",
    metrics: {
      median_sale_price: null,
      median_dom: null,
      actives: null,
      sold_count_30d: null,
      sale_to_list_ratio: null,
      ...metrics,
    },
    rank_position: null,
    heat: {
      median_dom_trend: null,
      sale_to_list_ratio: null,
      price_momentum_pct: null,
      sold_momentum_pct: null,
    },
  };
}

describe("detectThresholdCross", () => {
  test("fires when a metric moves ≥ the pct band", () => {
    const prev = snap({ median_sale_price: 400_000 });
    const fresh = snap({ median_sale_price: 400_000 * (1 + THRESHOLD_PCT_BAND + 0.01) });
    const events = detectThresholdCross(prev, fresh, AREA);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("threshold_cross");
    expect(events[0].zip).toBe("33904");
    expect(events[0].facts[0].from).toBe(400_000);
  });

  test("fires on a round-level cross even under the pct band", () => {
    const prev = snap({ median_sale_price: 449_000 });
    const fresh = snap({ median_sale_price: 451_000 }); // crosses 450k
    expect(detectThresholdCross(prev, fresh, AREA).length).toBe(1);
  });

  test("fails closed: null previous metric or missing snapshot emits nothing", () => {
    const fresh = snap({ median_sale_price: 500_000 });
    expect(detectThresholdCross(null, fresh, AREA)).toEqual([]);
    expect(detectThresholdCross(snap({}), fresh, AREA)).toEqual([]);
  });

  test("identical inputs → identical events (pure)", () => {
    const prev = snap({ median_dom: 40 });
    const fresh = snap({ median_dom: 50 });
    expect(detectThresholdCross(prev, fresh, AREA)).toEqual(detectThresholdCross(prev, fresh, AREA));
  });
});

describe("detectRankFlip", () => {
  test("fires on entering top-N", () => {
    const e = detectRankFlip(RANK_TOP_N + 4, RANK_TOP_N, "33904", AREA);
    expect(e?.type).toBe("rank_flip");
  });
  test("null on no previous position (first run) — fail closed", () => {
    expect(detectRankFlip(null, 2, "33904", AREA)).toBeNull();
  });
  test("null on a 1-place wiggle", () => {
    expect(detectRankFlip(10, 9, "33904", AREA)).toBeNull();
  });
});

describe("detectLifecycleBurst", () => {
  test("price-cut burst at the N threshold", () => {
    const events = detectLifecycleBurst(
      { zip: "33904", price_cuts: BURST_PRICE_CUTS_N, new_listings: 0, trailing_weekly_new_listings: 0, notable_sale: null },
      AREA,
    );
    expect(events.some((e) => e.class === "alert")).toBe(true);
  });
  test("new-listing surge needs a real trailing baseline (fail closed at 0)", () => {
    const events = detectLifecycleBurst(
      { zip: "33904", price_cuts: 0, new_listings: 12, trailing_weekly_new_listings: 0, notable_sale: null },
      AREA,
    );
    expect(events).toEqual([]);
  });
  test("surge fires at ratio", () => {
    const events = detectLifecycleBurst(
      { zip: "33904", price_cuts: 0, new_listings: Math.ceil(8 * SURGE_RATIO), trailing_weekly_new_listings: 8, notable_sale: null },
      AREA,
    );
    expect(events.length).toBe(1);
  });
});

describe("detectNearbyNews", () => {
  test("maps items to one weekly-class area event; empty in → empty out", () => {
    expect(detectNearbyNews([], AREA)).toEqual([]);
    const events = detectNearbyNews(
      [{ title: "Bridge repair funded", zip: "33904", distance_band: "0-2mi", published_at: "2026-07-08" }],
      AREA,
    );
    expect(events.length).toBe(1);
    expect(events[0].grain).toBe("area");
    expect(events[0].class).toBe("weekly");
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `bun test lib/email/zip-events/detect.test.ts`

- [ ] **Step 3: Implement**

```typescript
// lib/email/zip-events/detect.ts
//
// Pure v1 detectors (spec §2). Discipline mirrors lib/project/watch-delta.ts:
// NO DB, NO disk, NO Date.now(), NO network; missing input ⇒ no event; identical
// inputs ⇒ identical events. Every threshold is a named exported constant,
// [PROVISIONAL] operator-set v1 — tuned later on per-trigger engagement data.

import type { MarketArea } from "./market-areas";
import {
  METRIC_LABELS,
  METRIC_UNITS,
  type MarketEvent,
  type MetricKey,
  type ZipMetricsSnapshot,
} from "./types";

export const THRESHOLD_PCT_BAND = 0.05; // [PROVISIONAL] ±5% move vs stored snapshot
export const PRICE_ROUND_LEVEL_USD = 50_000; // [PROVISIONAL] round-level grid for prices
export const RANK_TOP_N = 5; // [PROVISIONAL] "entered the top N"
export const RANK_JUMP_K = 3; // [PROVISIONAL] "moved ≥ K places"
export const BURST_PRICE_CUTS_N = 3; // [PROVISIONAL] cuts per window = a burst
export const SURGE_RATIO = 1.5; // [PROVISIONAL] new listings vs trailing weekly baseline
export const NOTABLE_SALE_AREA_RATIO = 2; // [PROVISIONAL] sold ≥ 2x area median

const SOURCE_LAKE = "SWFL Data Gulf listing lifecycle";
const SOURCE_RANK = "SWFL Data Gulf ranked signals";
const SOURCE_PULSE = "SWFL Data Gulf local pulse";

/** Alert-class metrics: a cross here fires standalone; the rest ride the weekly. */
const ALERT_METRICS: ReadonlySet<MetricKey> = new Set(["median_sale_price", "median_dom"]);

function crossedRoundLevel(from: number, to: number, grid: number): boolean {
  return Math.floor(from / grid) !== Math.floor(to / grid);
}

export function detectThresholdCross(
  prev: ZipMetricsSnapshot | null,
  fresh: ZipMetricsSnapshot,
  area: MarketArea,
): MarketEvent[] {
  if (prev === null) return []; // first run seeds, never fires
  const events: MarketEvent[] = [];
  for (const key of Object.keys(fresh.metrics) as MetricKey[]) {
    const from = prev.metrics[key];
    const to = fresh.metrics[key];
    if (from == null || to == null || from === 0) continue; // fail closed
    const pctMove = Math.abs(to - from) / Math.abs(from);
    const roundCross =
      key === "median_sale_price" && crossedRoundLevel(from, to, PRICE_ROUND_LEVEL_USD);
    if (pctMove < THRESHOLD_PCT_BAND && !roundCross) continue;
    events.push({
      type: "threshold_cross",
      grain: "zip",
      area_id: area.area_id,
      zip: fresh.zip,
      class: ALERT_METRICS.has(key) ? "alert" : "weekly",
      facts: [
        { label: METRIC_LABELS[key], from, to, value: to, unit: METRIC_UNITS[key], source: SOURCE_LAKE },
      ],
    });
  }
  return events;
}

export function detectRankFlip(
  prevPos: number | null,
  freshPos: number | null,
  zip: string,
  area: MarketArea,
): MarketEvent | null {
  if (prevPos == null || freshPos == null) return null; // fail closed
  const enteredTop = freshPos <= RANK_TOP_N && prevPos > RANK_TOP_N;
  const jumped = prevPos - freshPos >= RANK_JUMP_K;
  if (!enteredTop && !jumped) return null;
  return {
    type: "rank_flip",
    grain: "zip",
    area_id: area.area_id,
    zip,
    class: "weekly",
    facts: [
      { label: "Regional signal rank", from: prevPos, to: freshPos, value: freshPos, unit: "", source: SOURCE_RANK },
    ],
  };
}

export interface LifecycleWindow {
  zip: string;
  /** Counts aggregated AT SOURCE from listing transitions for the window. */
  price_cuts: number;
  new_listings: number;
  /** Average weekly new listings over the trailing baseline period; 0 = no baseline held. */
  trailing_weekly_new_listings: number;
  notable_sale: { sold_price: number; area_median_sale_price: number | null } | null;
}

export function detectLifecycleBurst(w: LifecycleWindow, area: MarketArea): MarketEvent[] {
  const events: MarketEvent[] = [];
  if (w.price_cuts >= BURST_PRICE_CUTS_N) {
    events.push({
      type: "lifecycle_burst",
      grain: "zip",
      area_id: area.area_id,
      zip: w.zip,
      class: "alert",
      facts: [{ label: "Price cuts this week", value: w.price_cuts, unit: "", source: SOURCE_LAKE }],
    });
  }
  // Surge needs a REAL baseline: trailing 0 fails closed (no invented denominator).
  if (w.trailing_weekly_new_listings > 0 && w.new_listings >= w.trailing_weekly_new_listings * SURGE_RATIO) {
    events.push({
      type: "lifecycle_burst",
      grain: "zip",
      area_id: area.area_id,
      zip: w.zip,
      class: "weekly",
      facts: [
        { label: "New listings this week", from: w.trailing_weekly_new_listings, to: w.new_listings, value: w.new_listings, unit: "", source: SOURCE_LAKE },
      ],
    });
  }
  if (
    w.notable_sale &&
    w.notable_sale.area_median_sale_price != null &&
    w.notable_sale.area_median_sale_price > 0 &&
    w.notable_sale.sold_price >= w.notable_sale.area_median_sale_price * NOTABLE_SALE_AREA_RATIO
  ) {
    events.push({
      type: "lifecycle_burst",
      grain: "zip",
      area_id: area.area_id,
      zip: w.zip,
      class: "weekly",
      facts: [{ label: "Notable sale", value: w.notable_sale.sold_price, unit: "$", source: SOURCE_LAKE }],
    });
  }
  return events;
}

export interface AreaNewsItem {
  title: string;
  zip: string;
  distance_band: string;
  published_at: string; // YYYY-MM-DD
}

export function detectNearbyNews(items: AreaNewsItem[], area: MarketArea): MarketEvent[] {
  if (items.length === 0) return [];
  return [
    {
      type: "nearby_news",
      grain: "area",
      area_id: area.area_id,
      class: "weekly",
      facts: items.map((i) => ({ label: i.title, value: null, unit: "", source: SOURCE_PULSE })),
    },
  ];
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test lib/email/zip-events/detect.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/email/zip-events/detect.ts lib/email/zip-events/detect.test.ts
git commit -m "feat(zip-events): pure v1 detectors — threshold-cross, rank-flip, lifecycle-burst, nearby-news"
```

---

### Task 4: Heat rank + heat-shift detector

**Files:**
- Create: `lib/email/zip-events/heat.ts`
- Test: `lib/email/zip-events/heat.test.ts`

**Interfaces:**
- Consumes: `ZipMetricsSnapshot` (Task 1), `MarketArea` (Task 2), `MarketEvent` (Task 1).
- Produces:
  - `HEAT_WEIGHTS = { pace: 0.4, tightness: 0.3, momentum: 0.3 }` `[PROVISIONAL]`, `HEAT_TOP_N = 3` `[PROVISIONAL]`
  - `areaHeatInputs(area: MarketArea, snaps: Map<string, ZipMetricsSnapshot>): AreaHeatInput | null` — averages member-ZIP heat fields; null when ANY component has zero contributing ZIPs (excluded, never zero-filled)
  - `rankAreaHeat(inputs: AreaHeatInput[]): AreaHeatRank[]` — deterministic, ties broken by area_id
  - `detectHeatShift(prevRanks: AreaHeatRank[], freshRanks: AreaHeatRank[]): MarketEvent[]` — enter/leave county top `HEAT_TOP_N`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/email/zip-events/heat.test.ts
import { describe, expect, test } from "bun:test";
import { areaHeatInputs, detectHeatShift, HEAT_TOP_N, rankAreaHeat, type AreaHeatInput } from "./heat";
import type { MarketArea } from "./market-areas";
import type { ZipMetricsSnapshot } from "./types";

function input(area_id: string, v: number): AreaHeatInput {
  // Lower DOM trend = hotter (pace); higher ratio/momentum = hotter.
  return { area_id, median_dom_trend: -v, sale_to_list_ratio: 90 + v, price_momentum_pct: v, sold_momentum_pct: v };
}

describe("rankAreaHeat", () => {
  test("deterministic ordering, hotter first, ties by area_id", () => {
    const ranks = rankAreaHeat([input("b", 2), input("a", 2), input("c", 9)]);
    expect(ranks.map((r) => r.area_id)).toEqual(["c", "a", "b"]);
    expect(ranks[0].position).toBe(1);
  });

  test("missing-input areas are EXCLUDED, not zero-filled", () => {
    const partial: AreaHeatInput = { area_id: "x", median_dom_trend: null, sale_to_list_ratio: 95, price_momentum_pct: 1, sold_momentum_pct: 1 };
    const ranks = rankAreaHeat([input("a", 5), partial]);
    expect(ranks.map((r) => r.area_id)).toEqual(["a"]);
  });
});

describe("areaHeatInputs", () => {
  const AREA: MarketArea = { area_id: "t", label: "t", county: "12071", anchor_place: "T", zips: ["1", "2"], needs_review: [] };
  function snapWithHeat(zip: string, heat: ZipMetricsSnapshot["heat"]): ZipMetricsSnapshot {
    return { zip, as_of: "2026-07-09", metrics: { median_sale_price: null, median_dom: null, actives: null, sold_count_30d: null, sale_to_list_ratio: null }, rank_position: null, heat };
  }
  test("averages held members; null when a component has no contributor", () => {
    const snaps = new Map([
      ["1", snapWithHeat("1", { median_dom_trend: -2, sale_to_list_ratio: 96, price_momentum_pct: 3, sold_momentum_pct: 1 })],
      ["2", snapWithHeat("2", { median_dom_trend: -4, sale_to_list_ratio: 98, price_momentum_pct: null, sold_momentum_pct: 3 })],
    ]);
    const got = areaHeatInputs(AREA, snaps);
    expect(got?.median_dom_trend).toBe(-3);
    expect(got?.price_momentum_pct).toBe(3); // one contributor is enough
    const empty = areaHeatInputs(AREA, new Map());
    expect(empty).toBeNull();
  });
});

describe("detectHeatShift", () => {
  test("fires on entering/leaving the top N; quiet otherwise", () => {
    const prev = rankAreaHeat([input("a", 9), input("b", 8), input("c", 7), input("d", 6)]);
    const fresh = rankAreaHeat([input("d", 9), input("a", 8), input("b", 7), input("c", 6)]);
    const events = detectHeatShift(prev, fresh);
    const ids = events.map((e) => e.area_id).sort();
    expect(ids).toEqual(["c", "d"]); // d entered top-3, c left
    expect(detectHeatShift(fresh, fresh)).toEqual([]);
  });
  test("first run (empty prev) emits nothing — fail closed", () => {
    expect(detectHeatShift([], rankAreaHeat([input("a", 1)]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test lib/email/zip-events/heat.test.ts`

- [ ] **Step 3: Implement**

```typescript
// lib/email/zip-events/heat.ts
//
// Deterministic market-area heat rank (spec: "the signature block"). Score =
// fixed weights over normalized ranks of pace (median DOM trend — falling is
// hotter), tightness (sale-to-list ratio — higher is hotter), momentum (price +
// sold-count movement — higher is hotter). All fields from held snapshots.
// Research grounding: realtor.com hottest-ZIPs = demand(views, NOT held) +
// pace(held) — this rank is OUR lake-derived variant, named and cited as ours,
// never presented as realtor.com's. Ranked within Lee + Collier only.

import type { MarketArea } from "./market-areas";
import type { MarketEvent, ZipMetricsSnapshot } from "./types";

export const HEAT_WEIGHTS = { pace: 0.4, tightness: 0.3, momentum: 0.3 }; // [PROVISIONAL]
export const HEAT_TOP_N = 3; // [PROVISIONAL] county top-3 membership drives heat-shift

const SOURCE_HEAT = "SWFL Data Gulf market-area heat rank";

export interface AreaHeatInput {
  area_id: string;
  median_dom_trend: number | null;
  sale_to_list_ratio: number | null;
  price_momentum_pct: number | null;
  sold_momentum_pct: number | null;
}

export interface AreaHeatRank {
  area_id: string;
  position: number; // 1 = hottest
  score: number;
}

function avg(nums: number[]): number | null {
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Average member-ZIP heat fields. A component with ≥1 contributing ZIP is held;
 *  an area where EVERY component is null returns null (excluded from the rank). */
export function areaHeatInputs(
  area: MarketArea,
  snaps: Map<string, ZipMetricsSnapshot>,
): AreaHeatInput | null {
  const members = area.zips.map((z) => snaps.get(z)).filter((s): s is ZipMetricsSnapshot => !!s);
  const pick = (f: (h: ZipMetricsSnapshot["heat"]) => number | null) =>
    avg(members.map((m) => f(m.heat)).filter((v): v is number => v != null));
  const out: AreaHeatInput = {
    area_id: area.area_id,
    median_dom_trend: pick((h) => h.median_dom_trend),
    sale_to_list_ratio: pick((h) => h.sale_to_list_ratio),
    price_momentum_pct: pick((h) => h.price_momentum_pct),
    sold_momentum_pct: pick((h) => h.sold_momentum_pct),
  };
  const anyHeld =
    out.median_dom_trend != null ||
    out.sale_to_list_ratio != null ||
    out.price_momentum_pct != null ||
    out.sold_momentum_pct != null;
  return anyHeld ? out : null;
}

/** Normalized-rank score. An area missing ANY component is EXCLUDED (spec:
 *  missing-input areas excluded, not zero-filled) — a partial score would
 *  silently reweight the formula. */
export function rankAreaHeat(inputs: AreaHeatInput[]): AreaHeatRank[] {
  const complete = inputs.filter(
    (i) =>
      i.median_dom_trend != null &&
      i.sale_to_list_ratio != null &&
      i.price_momentum_pct != null &&
      i.sold_momentum_pct != null,
  );
  if (complete.length === 0) return [];

  // rank01: 1 = best in field for this component, 0 = worst; deterministic.
  const rank01 = (vals: number[], v: number, higherIsHotter: boolean): number => {
    const sorted = [...vals].sort((a, b) => (higherIsHotter ? b - a : a - b));
    const pos = sorted.indexOf(v);
    return sorted.length === 1 ? 1 : 1 - pos / (sorted.length - 1);
  };
  const doms = complete.map((i) => i.median_dom_trend as number);
  const ratios = complete.map((i) => i.sale_to_list_ratio as number);
  const momenta = complete.map((i) => (i.price_momentum_pct as number) + (i.sold_momentum_pct as number));

  const scored = complete.map((i) => ({
    area_id: i.area_id,
    score:
      HEAT_WEIGHTS.pace * rank01(doms, i.median_dom_trend as number, false) + // falling DOM = hot
      HEAT_WEIGHTS.tightness * rank01(ratios, i.sale_to_list_ratio as number, true) +
      HEAT_WEIGHTS.momentum *
        rank01(momenta, (i.price_momentum_pct as number) + (i.sold_momentum_pct as number), true),
  }));
  scored.sort((a, b) => b.score - a.score || a.area_id.localeCompare(b.area_id));
  return scored.map((s, idx) => ({ ...s, position: idx + 1 }));
}

export function detectHeatShift(prevRanks: AreaHeatRank[], freshRanks: AreaHeatRank[]): MarketEvent[] {
  if (prevRanks.length === 0) return []; // first run — fail closed
  const prevTop = new Set(prevRanks.filter((r) => r.position <= HEAT_TOP_N).map((r) => r.area_id));
  const freshTop = new Set(freshRanks.filter((r) => r.position <= HEAT_TOP_N).map((r) => r.area_id));
  const events: MarketEvent[] = [];
  for (const r of freshRanks) {
    const was = prevTop.has(r.area_id);
    const is = freshTop.has(r.area_id);
    if (was === is) continue;
    const prevPos = prevRanks.find((p) => p.area_id === r.area_id)?.position ?? null;
    events.push({
      type: "heat_shift",
      grain: "area",
      area_id: r.area_id,
      class: "weekly",
      facts: [{ label: "Heat rank", from: prevPos, to: r.position, value: r.position, unit: "", source: SOURCE_HEAT }],
    });
  }
  return events;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test lib/email/zip-events/heat.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/email/zip-events/heat.ts lib/email/zip-events/heat.test.ts
git commit -m "feat(zip-events): deterministic area heat rank + heat-shift detector"
```

---

### Task 5: Movement gate, fill ladder, alert/roundup batching

**Files:**
- Create: `lib/email/zip-events/gate.ts`
- Test: `lib/email/zip-events/gate.test.ts`

**Interfaces:**
- Consumes: `MarketEvent` (Task 1), `MarketArea` (Task 2).
- Produces:
  - `selectWeeklyContent(subjectZip: string, area: MarketArea, events: MarketEvent[]): WeeklySelection` where `WeeklySelection = { send: boolean; used: MarketEvent[]; fill_grains: ("zip"|"area"|"city"|"county")[]; skip_reason?: "flat_week" }`
  - `pickDailyAlert(events: MarketEvent[], subjectZip: string, area: MarketArea): MarketEvent[]` — the alert-class events for ONE subscriber's single daily alert email (empty = no alert)
  - `alertAbsorbsRoundup(alertSentAtIso: string | null, nowIso: string): boolean` — true when an alert already went out inside `ROUNDUP_ABSORB_HOURS`
  - `ROUNDUP_ABSORB_HOURS = 24` `[PROVISIONAL]`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/email/zip-events/gate.test.ts
import { describe, expect, test } from "bun:test";
import type { MarketArea } from "./market-areas";
import type { MarketEvent } from "./types";
import { alertAbsorbsRoundup, pickDailyAlert, selectWeeklyContent } from "./gate";

const AREA: MarketArea = { area_id: "cape-coral", label: "the Cape Coral market", county: "12071", anchor_place: "Cape Coral", zips: ["33904", "33914"], needs_review: [] };

function ev(over: Partial<MarketEvent>): MarketEvent {
  return { type: "threshold_cross", grain: "zip", area_id: "cape-coral", zip: "33904", class: "weekly", facts: [{ label: "x", value: 1, unit: "", source: "s" }], ...over };
}

describe("selectWeeklyContent — fill ladder", () => {
  test("subject-ZIP events lead; sibling-area events fill", () => {
    const subject = ev({ zip: "33904" });
    const sibling = ev({ zip: "33914" });
    const sel = selectWeeklyContent("33904", AREA, [sibling, subject]);
    expect(sel.send).toBe(true);
    expect(sel.used[0]).toBe(subject); // subject ZIP first
    expect(sel.fill_grains).toContain("zip");
  });

  test("quiet ZIP fills from area/city/county grains", () => {
    const news = ev({ type: "nearby_news", grain: "area", zip: undefined });
    const county = ev({ grain: "county", zip: undefined });
    const sel = selectWeeklyContent("33904", AREA, [news, county]);
    expect(sel.send).toBe(true);
    expect(sel.fill_grains).toEqual(expect.arrayContaining(["area", "county"]));
  });

  test("flat week = NO send with reported skip, never a padded email", () => {
    const sel = selectWeeklyContent("33904", AREA, []);
    expect(sel.send).toBe(false);
    expect(sel.skip_reason).toBe("flat_week");
    expect(sel.used).toEqual([]);
  });

  test("events from another area never leak in", () => {
    const foreign = ev({ area_id: "naples", zip: "34102" });
    expect(selectWeeklyContent("33904", AREA, [foreign]).send).toBe(false);
  });
});

describe("pickDailyAlert", () => {
  test("returns only alert-class events for the subscriber's area", () => {
    const a = ev({ class: "alert" });
    const w = ev({ class: "weekly" });
    const foreign = ev({ class: "alert", area_id: "naples" });
    expect(pickDailyAlert([a, w, foreign], "33904", AREA)).toEqual([a]);
  });
  test("baseline class never rides an alert", () => {
    expect(pickDailyAlert([ev({ class: "baseline" })], "33904", AREA)).toEqual([]);
  });
});

describe("alertAbsorbsRoundup", () => {
  test("alert within the window absorbs; outside does not; null never absorbs", () => {
    expect(alertAbsorbsRoundup("2026-07-10T02:00:00Z", "2026-07-10T13:00:00Z")).toBe(true);
    expect(alertAbsorbsRoundup("2026-07-08T02:00:00Z", "2026-07-10T13:00:00Z")).toBe(false);
    expect(alertAbsorbsRoundup(null, "2026-07-10T13:00:00Z")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test lib/email/zip-events/gate.test.ts`

- [ ] **Step 3: Implement**

```typescript
// lib/email/zip-events/gate.ts
//
// Movement gate + fill ladder + alert/roundup batching (spec §3-4). Pure.
// Ladder: subject ZIP events → market-area sibling events → city pulse →
// county trends. A genuinely flat week ⇒ NO send (reported skip) — never a
// padded or bare email. Alerts batch to ≤1/subscriber/day (Zillow overnight-
// queue pattern); an alert inside the roundup window absorbs the roundup.

import type { MarketArea } from "./market-areas";
import type { MarketEvent, MarketEventGrain } from "./types";

export const ROUNDUP_ABSORB_HOURS = 24; // [PROVISIONAL]

export interface WeeklySelection {
  send: boolean;
  used: MarketEvent[];
  fill_grains: MarketEventGrain[];
  skip_reason?: "flat_week";
}

export function selectWeeklyContent(
  subjectZip: string,
  area: MarketArea,
  events: MarketEvent[],
): WeeklySelection {
  const inArea = events.filter(
    (e) => e.area_id === area.area_id && (e.class === "weekly" || e.class === "alert"),
  );
  const subject = inArea.filter((e) => e.zip === subjectZip);
  const siblings = inArea.filter((e) => e.zip != null && e.zip !== subjectZip);
  const areaGrain = inArea.filter((e) => e.zip == null && e.grain === "area");
  const city = inArea.filter((e) => e.grain === "city");
  const county = inArea.filter((e) => e.grain === "county");

  const used = [...subject, ...siblings, ...areaGrain, ...city, ...county];
  if (used.length === 0) return { send: false, used: [], fill_grains: [], skip_reason: "flat_week" };

  const fill_grains = [...new Set(used.map((e) => (e.zip != null ? "zip" : e.grain)))] as MarketEventGrain[];
  return { send: true, used, fill_grains };
}

/** The alert-class events that justify TODAY's single alert email for this
 *  subscriber. Empty = no alert today. Baseline never rides an alert. */
export function pickDailyAlert(events: MarketEvent[], subjectZip: string, area: MarketArea): MarketEvent[] {
  return events.filter(
    (e) =>
      e.class === "alert" &&
      e.area_id === area.area_id &&
      (e.zip == null || area.zips.includes(e.zip)),
  );
}

export function alertAbsorbsRoundup(alertSentAtIso: string | null, nowIso: string): boolean {
  if (!alertSentAtIso) return false;
  const dtMs = new Date(nowIso).getTime() - new Date(alertSentAtIso).getTime();
  return dtMs >= 0 && dtMs <= ROUNDUP_ABSORB_HOURS * 3600 * 1000;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test lib/email/zip-events/gate.test.ts`
Note the subject-ZIP-first assertion uses object identity (`toBe`) — the selection must preserve the input event objects, not clone them.

- [ ] **Step 5: Commit**

```bash
git add lib/email/zip-events/gate.ts lib/email/zip-events/gate.test.ts
git commit -m "feat(zip-events): movement gate, fill ladder, alert/roundup batching"
```

---

### Task 6: Composer — subject contract + deterministic EmailDoc

**Files:**
- Create: `lib/email/zip-events/compose.ts`
- Test: `lib/email/zip-events/compose.test.ts`

**Interfaces:**
- Consumes: `MarketEvent`, `MarketFact`, `ZipMetricsSnapshot`, `METRIC_LABELS`, `METRIC_UNITS` (Task 1); `MarketArea` (Task 2); `AreaHeatRank` (Task 4); `WeeklySelection` (Task 5); `EmailDoc` type from `@/lib/email/doc/types`; `renderEmailDocHtml` from `@/lib/email/render-email-doc` (in tests only — golden render); `deriveEmailDocSubject` NOT used (subject is computed here, deterministically).
- Produces (runner consumes):
  - `SUBJECT_LEAD_MAX = 37` (Gmail-app visible chars — research fold-in 07/10/2026)
  - `subjectFor(events: MarketEvent[], subscriberPlace: string | null, areaLabel: string): string`
  - `composeAlertDoc(input: ComposeInput): EmailDoc`
  - `composeWeeklyDoc(input: ComposeWeeklyInput): EmailDoc`
  - `composeBaselineDoc(input: ComposeBaselineInput): EmailDoc`
  - `INSIDER_EVERY_N_ISSUES = 4` `[PROVISIONAL]`, `shouldIncludeInsider(issuesSent: number): boolean`
  - Input shapes:
    - `ComposeInput { events: MarketEvent[]; subscriberZip: string; subscriberPlace: string | null; area: MarketArea; asOf: string /* MM/DD/YYYY */ }`
    - `ComposeWeeklyInput extends ComposeInput { heatRanks: AreaHeatRank[]; areaLabelsById: Record<string, string>; insider: { title: string; rows: { label: string; value: string }[]; source: string } | null }`
    - `ComposeBaselineInput { subscriberZip; subscriberPlace; area; asOf; snapshot: ZipMetricsSnapshot; heatPosition: number | null; recentEvents: MarketEvent[] }`

**Copy rules enforced here (write them as tests):** no hedge-encoding of numbers; as-of date appears exactly once, MM/DD/YYYY; sources ride a final `sources` block; no internal ids anywhere in rendered output; NNN never appears (no jargon); insider card copy names a specific outcome, flagged "usually part of the paid tier".

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/email/zip-events/compose.test.ts
import { describe, expect, test } from "bun:test";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import type { MarketArea } from "./market-areas";
import type { MarketEvent } from "./types";
import {
  composeAlertDoc,
  composeBaselineDoc,
  composeWeeklyDoc,
  INSIDER_EVERY_N_ISSUES,
  shouldIncludeInsider,
  SUBJECT_LEAD_MAX,
  subjectFor,
} from "./compose";

const AREA: MarketArea = { area_id: "cape-coral", label: "the Cape Coral market", county: "12071", anchor_place: "Cape Coral", zips: ["33904", "33914"], needs_review: [] };

const CUT_BURST: MarketEvent = {
  type: "lifecycle_burst", grain: "zip", area_id: "cape-coral", zip: "33904", class: "alert",
  facts: [{ label: "Price cuts this week", value: 3, unit: "", source: "SWFL Data Gulf listing lifecycle" }],
};

describe("subjectFor — the research-pinned contract", () => {
  test("number + place land inside the first 37 chars", () => {
    const s = subjectFor([CUT_BURST], "Cape Coral", AREA.label);
    const lead = s.slice(0, SUBJECT_LEAD_MAX);
    expect(lead).toMatch(/3/);
    expect(lead).toMatch(/Cape Coral/);
  });
  test("ZIP-grain event names the subscriber's own place, not the area label", () => {
    const s = subjectFor([CUT_BURST], "Cape Coral", "the Southwest Lee market");
    expect(s).toContain("Cape Coral");
    expect(s).not.toContain("Southwest Lee");
  });
  test("area-grain event falls back to the area label", () => {
    const areaEv: MarketEvent = { ...CUT_BURST, grain: "area", zip: undefined, type: "heat_shift", facts: [{ label: "Heat rank", from: 5, to: 2, value: 2, unit: "", source: "s" }] };
    expect(subjectFor([areaEv], null, AREA.label)).toContain("Cape Coral market");
  });
  test("no internal ids or system nouns ever", () => {
    const s = subjectFor([CUT_BURST], "Cape Coral", AREA.label);
    expect(s).not.toMatch(/area_id|cape-coral|zip-events|threshold|_/);
  });
});

describe("composeAlertDoc golden", () => {
  test("renders through the ONE render root with facts, as-of once, sources block", async () => {
    const doc = composeAlertDoc({ events: [CUT_BURST], subscriberZip: "33904", subscriberPlace: "Cape Coral", area: AREA, asOf: "07/10/2026" });
    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("Price cuts this week");
    expect((html.match(/07\/10\/2026/g) ?? []).length).toBe(1); // as-of exactly once
    expect(html).toContain("SWFL Data Gulf");
    expect(html).not.toMatch(/cape-coral|area_id/); // customer-clean
  });
});

describe("composeWeeklyDoc", () => {
  test("includes heat leaderboard + insider card when provided, flagged plainly", async () => {
    const doc = composeWeeklyDoc({
      events: [CUT_BURST], subscriberZip: "33904", subscriberPlace: "Cape Coral", area: AREA, asOf: "07/10/2026",
      heatRanks: [{ area_id: "cape-coral", position: 1, score: 0.9 }, { area_id: "naples", position: 2, score: 0.7 }],
      areaLabelsById: { "cape-coral": "the Cape Coral market", naples: "the Naples market" },
      insider: { title: "Flood-exposure detail for 33904", rows: [{ label: "AAL per insured property", value: "$1,214" }], source: "SWFL Data Gulf flood model" },
    });
    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("Cape Coral market");
    expect(html).toContain("usually part of the paid tier");
    expect(html).toContain("Flood-exposure detail");
  });
});

describe("composeBaselineDoc", () => {
  test("welcome snapshot: held metrics + heat position, no invented values", async () => {
    const doc = composeBaselineDoc({
      subscriberZip: "33904", subscriberPlace: "Cape Coral", area: AREA, asOf: "07/10/2026",
      snapshot: { zip: "33904", as_of: "2026-07-10", metrics: { median_sale_price: 405_000, median_dom: 41, actives: 220, sold_count_30d: null, sale_to_list_ratio: null }, rank_position: 4, heat: { median_dom_trend: null, sale_to_list_ratio: null, price_momentum_pct: null, sold_momentum_pct: null } },
      heatPosition: 2,
      recentEvents: [],
    });
    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("405,000");
    expect(html).toContain("41");
    expect(html).not.toContain("Homes sold"); // null metric NOT rendered — never zero-filled
  });
});

describe("shouldIncludeInsider", () => {
  test(`every ${INSIDER_EVERY_N_ISSUES}th issue`, () => {
    expect(shouldIncludeInsider(INSIDER_EVERY_N_ISSUES - 1)).toBe(true); // 0-based: the Nth send
    expect(shouldIncludeInsider(0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test lib/email/zip-events/compose.test.ts`

- [ ] **Step 3: Implement**

Build docs from `EmailDoc` block literals — copy the exact doc-construction pattern from `lib/email/zip-seed.ts` (`buildZipSeedDoc`) for block factories and required doc fields; the block types available are in `lib/email/doc/types.ts` (`"hero" | "stats" | "text" | "list" | "metric-card" | "divider" | "sources" | "footer"` among others). Core shape:

```typescript
// lib/email/zip-events/compose.ts
//
// Deterministic events → EmailDoc composer (spec §3). NO LLM anywhere: copy is
// slotted template micro-copy around held numbers (describeWatchEvent precedent).
// Subject contract (research fold-in 07/10/2026): number + place inside the
// first SUBJECT_LEAD_MAX chars; ZIP-grain ⇒ subscriber's own place; area label
// fallback. As-of date MM/DD/YYYY exactly once; sources ride the sources block.

import type { EmailDoc } from "@/lib/email/doc/types";
import type { AreaHeatRank } from "./heat";
import type { MarketArea } from "./market-areas";
import type { MarketEvent, ZipMetricsSnapshot } from "./types";
import { METRIC_LABELS, METRIC_UNITS } from "./types";

export const SUBJECT_LEAD_MAX = 37; // Gmail-app visible chars (Backlinko, 07/10/2026)
export const INSIDER_EVERY_N_ISSUES = 4; // [PROVISIONAL]

export function shouldIncludeInsider(issuesSent: number): boolean {
  return issuesSent > 0 && (issuesSent + 1) % INSIDER_EVERY_N_ISSUES === 0;
}

/** Deterministic subject: leads with the headline event's number + place. */
export function subjectFor(
  events: MarketEvent[],
  subscriberPlace: string | null,
  areaLabel: string,
): string {
  const lead = events[0];
  if (!lead) return `Your market update`;
  const place = lead.zip != null && subscriberPlace ? subscriberPlace : areaLabel;
  const f = lead.facts[0];
  switch (lead.type) {
    case "lifecycle_burst":
      return `${f.value} ${f.label.toLowerCase()} in ${place}`.replace(" this week in", " in");
    case "threshold_cross":
      return `${place}: ${f.label.toLowerCase()} now ${formatValue(f.value, f.unit)}`;
    case "rank_flip":
      return `${place} jumps to #${f.to} in SWFL`;
    case "heat_shift":
      return `${place} enters the hottest markets`;
    case "nearby_news":
      return `${events.length} local updates for ${place}`;
  }
}
// …formatValue, block factories, composeAlertDoc, composeWeeklyDoc,
// composeBaselineDoc — full bodies written at implementation, following
// zip-seed's doc/block construction verbatim. HARD RULES the tests enforce:
//   - null facts/metrics are OMITTED (never rendered as 0 or "n/a")
//   - as-of line rendered once, in the header text block
//   - every distinct fact.source deduped into ONE trailing "sources" block
//   - insider card carries the literal flag "usually part of the paid tier"
//     and a specific-outcome title (caller provides; composer never invents)
//   - baseline doc: metrics stats block (held only) + heat position line +
//     recent-events list + one low-key paid line (single sentence, no button)
```

The implementer writes the block-factory bodies by copying `buildZipSeedDoc`'s construction (same file builds hero/stats/text/sources blocks from `loadRankedZipSignals` data — read it first). Every test in Step 1 must pass unmodified; the tests are the contract, the zip-seed file is the style guide.

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test lib/email/zip-events/compose.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/email/zip-events/compose.ts lib/email/zip-events/compose.test.ts
git commit -m "feat(zip-events): deterministic composer — subject contract, alert/weekly/baseline docs"
```

---

### Task 7: Snapshot state — migration + adapter

**Files:**
- Create: `migrations/20260711_market_event_snapshots.sql`
- Create: `lib/email/zip-events/state.ts`
- Test: none for the thin adapter itself (DB calls); the assembly's pure helpers are already covered (Tasks 3–4). Migration verified by row-count query.

**Interfaces:**
- Consumes: `ZipMetricsSnapshot` (Task 1); `createServiceRoleClient` from `@/utils/supabase/service-role`; `loadRankedZipSignals(zip)` from `@/lib/zip-report/load-ranked-signals` (rank position source); `listing_transitions`/`listing_state` tables (aggregate at source — COUNT/median queries only, never raw-row hauls; memory rule `aggregate-at-source-not-fetch-rows`).
- Produces (runner consumes):
  - `loadStoredSnapshots(db, zips: string[]): Promise<Map<string, ZipMetricsSnapshot>>`
  - `assembleFreshSnapshot(db, zip: string, asOf: string): Promise<ZipMetricsSnapshot>` — every metric it cannot compute is null (fail closed)
  - `assembleLifecycleWindow(db, zip: string, area: MarketArea): Promise<LifecycleWindow>`
  - `advanceSnapshots(db, snaps: ZipMetricsSnapshot[], sentAtIso: string): Promise<void>` — upsert; called ONLY after confirmed sends

- [ ] **Step 1: Write the migration**

```sql
-- migrations/20260711_market_event_snapshots.sql
-- Detection state for market-area alerts (spec 2026-07-10-market-area-alerts-design.md):
-- ONE row per ZIP — the facts last shown + heat inputs + as-of. Advanced ONLY after a
-- confirmed send (Property Watch lesson: never stamp without a real send).
-- Idempotent; run via Bun.SQL (psql not installed).

create table if not exists market_event_snapshots (
  zip text primary key,
  payload jsonb not null,          -- ZipMetricsSnapshot (lib/email/zip-events/types.ts)
  as_of date not null,             -- underlying data as-of
  advanced_at timestamptz,         -- last confirmed-send advance; null = seeded only
  updated_at timestamptz not null default now()
);

comment on table market_event_snapshots is
  'Market-area alerts: per-ZIP last-shown snapshot; advances only after confirmed send.';
```

- [ ] **Step 2: Run the migration via Bun.SQL and verify**

Follow the exact pattern in memory `reference_run-migrations-via-bun-sql.md` (Bun.SQL with creds from `.dlt/secrets.toml`). Then verify:
`select count(*) from market_event_snapshots;` → expect `0` (table exists, empty).

- [ ] **Step 3: Write the adapter**

```typescript
// lib/email/zip-events/state.ts
//
// The ONLY impure module in zip-events: snapshot load/assemble/advance.
// Aggregates AT SOURCE (count/median queries) — never hauls raw transition rows.
// Every metric that cannot be computed is null; detectors fail closed on null.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRankedZipSignals } from "@/lib/zip-report/load-ranked-signals";
import type { LifecycleWindow } from "./detect";
import type { MarketArea } from "./market-areas";
import type { MetricKey, ZipMetricsSnapshot } from "./types";

type Db = SupabaseClient; // match createServiceRoleClient's return type; adjust if typed

export async function loadStoredSnapshots(
  db: Db,
  zips: string[],
): Promise<Map<string, ZipMetricsSnapshot>> {
  const { data, error } = await db
    .from("market_event_snapshots")
    .select("zip, payload")
    .in("zip", zips);
  if (error) throw new Error(`load snapshots: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.zip as string, r.payload as ZipMetricsSnapshot]));
}

/** Fresh per-ZIP metrics. Windows: current = trailing 30 days; momentum compares
 *  the trailing 30 days to the 30 before it. All from listing_state/transitions
 *  aggregates + the ranked signal pool. Unavailable ⇒ null, never a guess. */
export async function assembleFreshSnapshot(db: Db, zip: string, asOf: string): Promise<ZipMetricsSnapshot> {
  // Implementation notes for the engineer (each block wrapped so one failed
  // source nulls its metrics rather than sinking the ZIP):
  //  - median_sale_price / sold_count_30d / momentum: two windowed aggregate
  //    queries on listing_transitions (to_state='sold', zip_code=zip), selecting
  //    ONLY sold_price + sold_date; medians computed over ≤ the window's rows for
  //    this one ZIP (small); price_momentum_pct = (m30 - mPrev30)/mPrev30 * 100.
  //  - actives + median_dom + sale_to_list_ratio: listing_state aggregates for
  //    this ZIP (status active; dom from list_date; ratio only where both
  //    sold_price and list_price held).
  //  - rank_position: loadRankedZipSignals(zip) → position of the headline
  //    signal (index in `ranked` + 1); null when out of scope or empty.
  //  - median_dom_trend: current median_dom minus the prior stored snapshot's is
  //    NOT computed here (that would smuggle state) — it is current-window DOM
  //    minus prior-window DOM from the same two-window query.
  // The exact queries follow watch-scan.mts's listing_transitions access
  // (KNOWN-DEBT note there: tables typed public, live in data_lake).
  throw new Error("implemented per notes above");
}

export async function assembleLifecycleWindow(db: Db, zip: string, area: MarketArea): Promise<LifecycleWindow> {
  // price_cuts: count listing_transitions where zip_code=zip, price_delta<0, at >= now-7d
  // new_listings: count where from_state is null, same window
  // trailing_weekly_new_listings: count over the prior 8 weeks / 8 (0 when none)
  // notable_sale: max sold_price in window + area median from the 180d medians
  //   of member ZIPs (same aggregate the fixture generator uses); null when absent
  throw new Error("implemented per notes above");
}

export async function advanceSnapshots(db: Db, snaps: ZipMetricsSnapshot[], sentAtIso: string): Promise<void> {
  for (const s of snaps) {
    const { error } = await db.from("market_event_snapshots").upsert({
      zip: s.zip,
      payload: s,
      as_of: s.as_of,
      advanced_at: sentAtIso,
      updated_at: sentAtIso,
    });
    if (error) throw new Error(`advance snapshot ${s.zip}: ${error.message}`);
  }
}
```

The two `throw` bodies are written out at implementation time following the inline query notes — they are DB aggregation plumbing with no new decisions. Verify each aggregate returns plausible numbers for one known-busy ZIP (33904) by running a scratch Bun script before wiring the runner.

- [ ] **Step 4: Scratch-verify against live data**

Run a throwaway script (scratchpad, not committed) that calls `assembleFreshSnapshot(db, "33904", today)` and prints the result. Expected: non-null `median_sale_price`, `actives`; momentum fields may be null early — that's correct fail-closed behavior, not a bug.

- [ ] **Step 5: Commit**

```bash
git add migrations/20260711_market_event_snapshots.sql lib/email/zip-events/state.ts
git commit -m "feat(zip-events): snapshot state — migration + assemble/load/advance adapter"
```

---

### Task 8: Runner — content-path swap + baseline + daily alerts

**Files:**
- Modify: `scripts/email/weekly-read-run.mts` (content path + classes; safety ladder/env names UNCHANGED)
- Modify: `lib/email/weekly-read/send.ts:25-32` (`WeeklyReadOutgoing` gains optional `tags`)
- Test: `lib/email/weekly-read/send.test.ts` (extend); runner verified by DRY_RUN end-to-end

**Interfaces:**
- Consumes: everything above; `finalizeIssueHtml` + `FinalizeOpts` from `@/lib/email/weekly-read/issue` (CTA + unsubscribe + postal footer — REUSED); `shouldSend`/`afterSend` from cadence; `buildWeeklyReadBatches`/`sendWeeklyReadBatches` from send; `resolveZip`; `areaForZip`; `loadPulseNearby(zip)` from `@/lib/pulse/nearby` for city fill.
- Produces: the runner's send classes — `baseline` (issues_sent === 0), `alert` (any `pickDailyAlert` result, ≤1/day), `weekly` (due + gate passes). Removes: `buildWeeklyIssue`/`buildContentDoc` imports (the AI path — deleted from THIS runner only; the engine keeps powering lab/agent deliverables).

- [ ] **Step 1: Extend send.ts with per-message tags (failing test first)**

Add to `lib/email/weekly-read/send.test.ts`:

```typescript
test("extra tags ride each message alongside wid", () => {
  const batches = buildWeeklyReadBatches({
    messages: [{ subscriberId: "s1", email: "a@b.c", subject: "s", html: "UNSUB_TOKEN_HERE_x", tags: [{ name: "ma", value: "i-1" }, { name: "trigger", value: "lifecycle_burst" }, { name: "area", value: "cape-coral" }] }],
    from: "T <t@t.co>",
    unsubBase: "https://x.y",
  });
  const tags = batches[0][0].tags;
  expect(tags).toContainEqual({ name: "wid", value: "s1" });
  expect(tags).toContainEqual({ name: "trigger", value: "lifecycle_burst" });
});
```

(Use the real `UNSUBSCRIBE_TOKEN` constant in the html field — copy how existing tests in that file construct messages.) Run: `bun test lib/email/weekly-read/send.test.ts` → new test FAILS (tags not a field).

Then in `lib/email/weekly-read/send.ts`: add `tags?: Array<{ name: string; value: string }>` to `WeeklyReadOutgoing` and change the tag line in `buildWeeklyReadBatches` to:

```typescript
      tags: [{ name: "wid", value: m.subscriberId }, ...(m.tags ?? [])],
```

Run tests → PASS. Commit:

```bash
git add lib/email/weekly-read/send.ts lib/email/weekly-read/send.test.ts
git commit -m "feat(weekly-read): per-message extra tags on batch sends"
```

- [ ] **Step 2: Rewrite the runner's content path**

`scripts/email/weekly-read-run.mts` keeps its skeleton (env, gates, preview-first, live ladder, batch send, cursor advance) and swaps the middle. The new flow, per run (daily):

```typescript
// Replaces the "ONE engine build per distinct due ZIP" section and imports.
// REMOVE: buildWeeklyIssue, buildContentDoc imports. ADD:
import { areaForZip, loadMarketAreas } from "@/lib/email/zip-events/market-areas";
import { detectLifecycleBurst, detectNearbyNews, detectRankFlip, detectThresholdCross } from "@/lib/email/zip-events/detect";
import { areaHeatInputs, detectHeatShift, rankAreaHeat } from "@/lib/email/zip-events/heat";
import { alertAbsorbsRoundup, pickDailyAlert, selectWeeklyContent } from "@/lib/email/zip-events/gate";
import { composeAlertDoc, composeBaselineDoc, composeWeeklyDoc, shouldIncludeInsider, subjectFor } from "@/lib/email/zip-events/compose";
import { advanceSnapshots, assembleFreshSnapshot, assembleLifecycleWindow, loadStoredSnapshots } from "@/lib/email/zip-events/state";
import { finalizeIssueHtml } from "@/lib/email/weekly-read/issue";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { loadPulseNearby } from "@/lib/pulse/nearby";

// Per run:
// 1. FOOTPRINT pass (58 ZIPs, subscriber-independent — scales with geography):
//    stored = await loadStoredSnapshots(db, all58)
//    fresh[zip] = await assembleFreshSnapshot(db, zip, today)   (failure → skip ZIP, log)
//    events = per ZIP: detectThresholdCross(stored.get(zip) ?? null, fresh[zip], area)
//           + detectRankFlip(stored.get(zip)?.rank_position ?? null, fresh[zip].rank_position, zip, area)
//           + detectLifecycleBurst(await assembleLifecycleWindow(db, zip, area), area)
//    area events: detectNearbyNews(newsByArea, area) from loadPulseNearby per anchor ZIP;
//    heat: prevRanks = rankAreaHeat(areas.map(a => areaHeatInputs(a, stored)).filter(Boolean))
//          freshRanks = same over fresh; events += detectHeatShift(prevRanks, freshRanks)
// 2. SUBSCRIBER pass (per due/active subscriber):
//    class = issues_sent === 0                             → baseline
//          | pickDailyAlert(events, zip, area).length > 0  → alert (≤1/day: the runner runs
//            once daily, so one run = one alert email; absorb check below)
//          | shouldSend(cursor, now) && selectWeeklyContent(...).send → weekly
//          | else skip (reported: "no_event" | "flat_week" | "not_due")
//    weekly is SKIPPED when alertAbsorbsRoundup(alertSentAtIsoThisRun, now.toISOString())
//    doc = composeBaselineDoc / composeAlertDoc / composeWeeklyDoc (insider via
//          shouldIncludeInsider(rec.issues_sent); insider content: one detail-table
//          morsel loaded from loadRankedZipSignals' sources — the runner passes it in,
//          the composer never fetches)
//    html = finalizeIssueHtml(await renderEmailDocHtml(doc), { ctaUrl, postalAddress })
//    subject = subjectFor(usedEvents, place, area.label)
//    out.tags = [{ name: "ma", value: issueId }, { name: "trigger", value: leadEvent.type },
//                { name: "area", value: area.area_id }, { name: "class", value: cls }]
// 3. Preview-first, gates, DRY_RUN, live ladder — UNCHANGED (same code paths).
// 4. AFTER confirmed live send only:
//    advanceSnapshots(db, sentZipsFresh, now.toISOString()) — only ZIPs whose
//    subscribers actually got a send; afterSend cursor + issues_sent+1 as today.
//    DRY_RUN advances NOTHING (existing behavior).
```

Preserve: `preSendGates`, preview files per ZIP (now per subscriber-class: `zip-33904-alert.html`), `run-report.json` shape plus new fields `{ class, trigger }` per row, the `WEEKLY_READ_APPROVED`/postal/From refusal ladder verbatim.

- [ ] **Step 3: DRY_RUN end-to-end**

Run: `bun scripts/email/weekly-read-run.mts`
Expected: previews written under `weekly-read-runs/<stamp>/`, `run-report.json` rows carry `class` + `trigger`, zero sends, zero DB mutations (verify: `select count(*) from market_event_snapshots` unchanged). First run seeds nothing (snapshots advance only on live send) and every subscriber with `issues_sent=0` previews a BASELINE doc — open one preview HTML and eyeball: held numbers present, no nulls rendered, as-of once, unsubscribe token present.

- [ ] **Step 4: Verify with the real build**

Run: `bunx next build` (house rule — not `npx tsc`). Expected: clean build; the app imports nothing from the runner, but compose/market-areas/state are app-visible modules and must compile.

- [ ] **Step 5: Commit**

```bash
git add scripts/email/weekly-read-run.mts
git commit -m "feat(zip-events): runner — deterministic content path, baseline/alert/weekly classes"
```

---

### Task 9: Engagement tracking — migration, webhook extract, route wiring

**Files:**
- Create: `migrations/20260711_market_alert_engagement.sql`
- Create: `lib/email/zip-events/webhook.ts`
- Test: `lib/email/zip-events/webhook.test.ts`
- Modify: `app/api/webhooks/resend/route.ts` (insert BEFORE the existing weekly-read suppression early-return at route.ts:76-90)

**Interfaces:**
- Consumes: Resend webhook payload shape (`payload.type`, `payload.data.tags` as a plain `Record<string,string>` — see `lib/email/weekly-read/webhook.ts` NOTE); existing `extractWeeklyReadAction` stays untouched (suppression keeps working).
- Produces: `extractMarketAlertEngagement(payload): MarketAlertEngagement | null` where `MarketAlertEngagement = { wid: string; issue_id: string; trigger: string | null; area_id: string | null; event: "opened" | "clicked" | "bounced" | "complained" | "delivered" }`.

**PINNED (spec, 07/10/2026): rows are per-recipient × per-trigger** — `wid` + `trigger` + `area_id` on every row, so "which of your contacts opened the price-cut alert" is a QUERY when the agent tier ships. Never aggregate away.

- [ ] **Step 1: Migration**

```sql
-- migrations/20260711_market_alert_engagement.sql
-- Per-recipient × per-trigger engagement for market-area alerts (`ma` tag).
-- PINNED paid-tier prerequisite: recipient identity + trigger on EVERY row.
-- Idempotent; run via Bun.SQL.

create table if not exists market_alert_engagement (
  id bigint generated always as identity primary key,
  wid text not null,               -- weekly_read_subscribers.id (send-time tag)
  issue_id text not null,          -- runner-assigned issue id (`ma` tag value)
  trigger text,                    -- detector type that caused the send
  area_id text,                    -- market area
  event text not null check (event in ('opened','clicked','bounced','complained','delivered')),
  occurred_at timestamptz not null default now()
);

create index if not exists market_alert_engagement_wid_idx on market_alert_engagement (wid);
create index if not exists market_alert_engagement_trigger_idx on market_alert_engagement (trigger, event);
```

Run via Bun.SQL; verify `select count(*) from market_alert_engagement;` → 0.

- [ ] **Step 2: Failing extract test**

```typescript
// lib/email/zip-events/webhook.test.ts
import { describe, expect, test } from "bun:test";
import { extractMarketAlertEngagement } from "./webhook";

const base = { data: { tags: { wid: "s1", ma: "i-77", trigger: "lifecycle_burst", area: "cape-coral" } } };

describe("extractMarketAlertEngagement", () => {
  test("maps opened/clicked with full tag context", () => {
    const got = extractMarketAlertEngagement({ ...base, type: "email.opened" });
    expect(got).toEqual({ wid: "s1", issue_id: "i-77", trigger: "lifecycle_burst", area_id: "cape-coral", event: "opened" });
  });
  test("null without the ma tag (wid-only weekly-read legacy sends untouched)", () => {
    expect(extractMarketAlertEngagement({ type: "email.opened", data: { tags: { wid: "s1" } } })).toBeNull();
  });
  test("null on irrelevant event types", () => {
    expect(extractMarketAlertEngagement({ ...base, type: "email.sent" })).toBeNull();
  });
});
```

Run: `bun test lib/email/zip-events/webhook.test.ts` → FAIL.

- [ ] **Step 3: Implement extract**

```typescript
// lib/email/zip-events/webhook.ts
//
// Pure mapping: Resend outbound event tagged `ma` → one per-recipient ×
// per-trigger engagement row. Mirrors extractWeeklyReadAction's shape.
// Suppression (bounce/complaint → status flip) stays in the weekly-read
// extract — this module ONLY records engagement.

const EVENTS: Record<string, "opened" | "clicked" | "bounced" | "complained" | "delivered"> = {
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivered": "delivered",
};

export interface MarketAlertEngagement {
  wid: string;
  issue_id: string;
  trigger: string | null;
  area_id: string | null;
  event: (typeof EVENTS)[string];
}

export function extractMarketAlertEngagement(payload: {
  type?: string;
  data?: { tags?: Record<string, string> };
}): MarketAlertEngagement | null {
  const tags = payload.data?.tags;
  const wid = tags?.["wid"];
  const issueId = tags?.["ma"];
  if (!wid || !issueId) return null;
  const event = payload.type ? EVENTS[payload.type] : undefined;
  if (!event) return null;
  return { wid, issue_id: issueId, trigger: tags?.["trigger"] ?? null, area_id: tags?.["area"] ?? null, event };
}
```

Run tests → PASS.

- [ ] **Step 4: Wire the route**

In `app/api/webhooks/resend/route.ts`, IMMEDIATELY BEFORE the existing `extractWeeklyReadAction` block (route.ts:76), insert — and note it must NOT return early, so bounce/complaint still falls through to the suppression flip below it:

```typescript
  // Market-area alerts engagement: `ma`-tagged sends record per-recipient ×
  // per-trigger rows (paid-tier prerequisite — pinned in the 07/10/2026 spec).
  // No early return: a bounce/complaint continues into the wid suppression flip.
  const maEngagement = extractMarketAlertEngagement(event as unknown as ResendWebhookPayload);
  if (maEngagement) {
    try {
      const db = createServiceRoleClient();
      await db.from("market_alert_engagement").insert({
        wid: maEngagement.wid,
        issue_id: maEngagement.issue_id,
        trigger: maEngagement.trigger,
        area_id: maEngagement.area_id,
        event: maEngagement.event,
      });
    } catch (err) {
      console.error(`[resend-webhook] ma engagement insert failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
```

(Match the surrounding file's client acquisition — if the route already holds a service-role client in scope, reuse it instead of creating another.) **Operator note for the live-verify:** open/click events require open+click tracking enabled on the Resend domain/webhook config — confirm in the Resend dashboard before the first live send.

- [ ] **Step 5: Build + commit**

Run: `bunx next build` → clean.

```bash
git add migrations/20260711_market_alert_engagement.sql lib/email/zip-events/webhook.ts lib/email/zip-events/webhook.test.ts app/api/webhooks/resend/route.ts
git commit -m "feat(zip-events): per-recipient x per-trigger engagement rows from ma-tagged sends"
```

---

### Task 10: Workflow cadence + signup copy reframe

**Files:**
- Modify: `.github/workflows/weekly-read.yml` (cadence comment: weekly Tuesday → daily; still dispatch-only DRY)
- Modify: `components/email/DigestSubscribe.tsx` (alert-promise copy)
- Test: `components/email/DigestSubscribe.test.ts` (update copy assertions)

- [ ] **Step 1: Workflow cadence comment**

In `.github/workflows/weekly-read.yml`, replace the commented schedule lines (weekly-read.yml:14-15) with:

```yaml
  # schedule:
  #   - cron: "0 11 * * *" # daily 11:00 UTC (~7am ET) — detector pass + due sends
```

Everything else stays (DRY hardcoded, dispatch-only until operator-approved live cycles; the runner itself decides baseline/alert/weekly per subscriber). Update the workflow `name:` to `Market Area Alerts Cadence` and the top comment to note the deterministic engine (no ANTHROPIC_API_KEY needed at all now — remove that env note line, the engine is LLM-free).

- [ ] **Step 2: DigestSubscribe reframe**

Read `components/email/DigestSubscribe.tsx` + its test first. Change the visible promise copy to the alert framing ruled in the spec — headline promise: "Get alerted when this market moves." supporting line: "Real events in this ZIP and its neighbors — price shifts, listing surges, market heat. Quiet weeks stay quiet." Update `DigestSubscribe.test.ts` copy assertions to match. Do NOT touch the Phase D funnel module (spec: separate follow-up commit after this ships).

- [ ] **Step 3: Test + build**

Run: `bun test components/email/DigestSubscribe.test.ts` → PASS. `bunx next build` → clean.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/weekly-read.yml components/email/DigestSubscribe.tsx components/email/DigestSubscribe.test.ts
git commit -m "feat(zip-events): daily cadence comment + alert-promise signup copy"
```

---

### Task 11: Full verification + session-loop closeout

**Files:**
- Modify: `SESSION_LOG.md` (top entry), `_AUDIT_AND_ROADMAP/build-queue.md` (sync)

- [ ] **Step 1: Full test + build sweep**

Run: `bun test lib/email/zip-events/ lib/email/weekly-read/ components/email/DigestSubscribe.test.ts` → all pass.
Run: `bunx next build` → clean.
Run: `bun scripts/email/weekly-read-run.mts` (DRY) one final time; attach the run-report path to the SESSION_LOG entry.

- [ ] **Step 2: Session loop**

- SESSION_LOG.md: what shipped, preview-report path, what's next (operator live-verify).
- Build queue: mark market-area-alerts built-pending-verify.
- Checks: `market_area_alerts_live_verify` stays OPEN (operator-run: real subscriber receives an event-fired email, every number traces to a held row, webhook logs tagged open/click rows, flat-week dry-run shows reported skip). Do NOT close it from a dev session (`public.checks` is prod evidence, not dev attestation).

- [ ] **Step 3: Commit + hold for push**

```bash
git add SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs(session-log): market-area alerts engine built — pending operator live-verify"
```

Then STOP and show the operator `git log --oneline` — push only on explicit confirmation (`node scripts/safe-push.mjs`), per house rule.

---

## Self-review notes (done at plan time)

- **Spec coverage:** fixture+generator (T2), detectors (T3), heat (T4), gate/fill/absorb (T5), composer + subject contract + baseline + insider (T6), snapshot state + advance-on-send (T7), runner + classes + safety ladder (T8), tags + per-recipient×trigger engagement + webhook (T9), cadence + capture reframe (T10), live-verify prep (T11). Paid-tier notes and funnel calibration are spec-recorded, no v1 task — correct per spec's out-of-scope.
- **Known thin spots, deliberate:** `compose.ts` block-factory bodies and `state.ts` aggregate query bodies are specified by contract + tests + a named in-repo style source (`buildZipSeedDoc`, `watch-scan.mts`) rather than verbatim code — both are mechanical transcriptions of existing in-repo patterns, and the tests in their tasks are the acceptance gate. Everything else is complete code.
- **Type consistency check:** `MarketEvent.class` includes `"baseline"` (types) and gate excludes it from alerts (T5 test); `WeeklyReadOutgoing.tags` optional (T8) matches T9's tag reads (`wid`/`ma`/`trigger`/`area`); `ZipMetricsSnapshot.heat` field names match `areaHeatInputs` reads; `AreaHeatRank {area_id, position, score}` consistent T4→T6→T8.
- **Out of scope honored:** no agent-branded build, no ops dashboard (tags only), no subscriber-tunable thresholds, no SMS, nothing outside Lee+Collier, activation/daily-digest untouched.
