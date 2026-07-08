# Showing Prep Packet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 11 tasks, 17 files, keywords: migration, schema, architecture

**Goal:** One click on an address builds an agent-facing **Showing Prep Packet** — a coded-grid EmailDoc that always renders (subject listing + comps comparison + a comp/subject map + a per-ZIP market snapshot + one gated AI commentary paragraph + a disclosure slot), persisted as a `block-canvas` deliverable and reachable from both a homepage/project pill and the assistant.

**Architecture:** A **dedicated, first-class build path** — not routed through the existing SnapshotItem deliverable-narrative pipeline (structurally incompatible with a coded grid; see Deviations). `gatherShowingPrepData(address)` does four-lane, best-effort, never-throws sourcing (`resolveSubjectListing` + `compsForAddress` + best-effort comp geocode/photo enrich + `housing-swfl` per-ZIP snapshot). `buildShowingPrepDoc(data, current)` is a PURE coded-grid EmailDoc builder where every section degrades to an empty cell (never broken, never invented). `assembleShowingPrepDoc` adds the one AI commentary paragraph and gates it with the existing block-level no-invention lint `lintAuthoredProse`. Both a project pill (`POST /api/projects` `kind:"showing-prep"` → build route) and the assistant (email-lab AI route branch) call the same assembler; the result persists as a `deliverables` row `template:"block-canvas"` and renders through the existing `renderEmailDocHtml` blast path.

**Tech Stack:** TypeScript, Next.js App Router, Supabase (Postgres), Bun test runner, Mapbox Static Images API (existing `aerialUrl` contract), Anthropic Haiku (existing `getAnthropic`/`resolveEmailModel`). No new dependencies, no schema migration.

---

## Deviations from the approved spec (verified against live code — read before building)

The spec (`docs/superpowers/specs/2026-07-08-showing-prep-packet-design.md`) is operator-approved, but four of its code assumptions are wrong. Each was verified by reading the actual source. These deviations are **binding** — the spec's wording is the intent; these are the correct mechanics.

1. **Build path — ONE new EmailDoc path, gated by `lintAuthoredProse` (NOT `freezeSnapshot→buildDeliverableNarrative→gateNarrative`).** The spec names two disjoint pipelines. `buildDeliverableNarrative`/`gateNarrative` (`lib/deliverable/build.ts`) operate on `SnapshotItem[]` and emit a prose `Narrative` — they cannot touch an EmailDoc's blocks, and `gateNarrative` is never called standalone. A coded-grid packet is an `EmailDoc` (like `lib/email/listing-flyer.ts`), so the no-invention **structural guarantee** is preserved with the sibling block-level lint `lintAuthoredProse` (`lib/email/author-doc.ts:920`, "gateNarrative philosophy applied to blocks"). We keep the guarantee; we do not force the incompatible pipeline.
2. **Market snapshot source = `housing-swfl`, read as a per-ZIP detail row (NOT `market-heat-swfl`, NOT a `frame` item).** `market-heat-swfl` has **no** months-of-inventory and **no** sold data (list-side only). `housing-swfl` carries per-ZIP `months_of_supply`, `inventory` (active), `homes_sold` (sold) in its `housing_by_zip` detail table. Per-ZIP values are read via `loadParsedBrain("housing-swfl")` + `output.detail_tables` (NOT `bindFrameSpec`/`metric_keys`, which bind region-aggregate only). **Pending count is never emitted at any grain** — drop it. **Market type is not a per-ZIP field** — infer it from `months_of_supply` (`< 3` seller's / `> 6` buyer's). The section is **omitted** when the ZIP row is missing or thin-sample (`low_sample` / null) — never shown stale.
3. **Comp map + per-comp photos are best-effort, degrade gracefully — the comp source carries neither.** `/nearby-home-values` (`lib/listings/steadyapi.ts:284`) explicitly returns **no per-comp lat/lon and no photo** (`NearbyComp` has neither). Only the subject gets coordinates (from `geocodeAddress`). So: the map always plots the **subject** pin; **comps are geocoded best-effort** via Mapbox (`geocodeAddress`, no Steady cost) and plotted when they resolve; **top-N comps are photo-enriched best-effort** via `resolveSubjectListing(comp address)` for one-sheets, and any comp without a photo falls into the comparison grid. Nothing refuses; every degraded path renders. (This adds bounded, best-effort Mapbox geocodes + up to `PHOTO_ENRICH_N` extra listing lookups — logged, not silent.)
4. **Disclosure slot = an empty `image` block placeholder (EmailDoc has no file/attachment block).** `BlockType` (`lib/email/doc/types.ts:13`) has no `file` type. v1 emits an empty `image` block captioned "Attach seller disclosure (optional)" — the same drag-drop mechanic the flyer uses for its photo slot. A native in-canvas PDF-drop block, and PDF text extraction, are fast-follows.

---

## Global Constraints

- **New path, additive only.** Do NOT modify `lib/email/listing-flyer.ts`, `lib/email/build-doc.ts`, `lib/listings/resolve-subject.ts`, or their tests — a parallel session holds repolith claims on them (per session-start). This plan only *imports* `resolveSubjectListing`/`compsForAddress` read-only and creates new `showing-prep-*` files. The one shared-file edit is `app/api/projects/route.ts` (one line) and `app/api/email-lab/ai/route.ts` (one added branch) — neither is claimed.
- **Never invent a number; never refuse a build.** Four-lane sourcing (RULE 0.7): our data → user upload → named web → user figure. A gap is an empty cell filled from the next lane, never a fabricated value and never a blocked build. The only hard stop is an invented number.
- **Structural no-invention guarantee.** The one AI paragraph is gated by `lintAuthoredProse` against the real numbers actually on the packet — not by a system-prompt promise alone.
- **Lee (12071) + Collier (12021) footprint** for the subject-resolution and comp gates (existing behavior of `resolveSubjectListing`/`compsForAddress`); an out-of-footprint or unresolved address degrades to an address-only skeleton, never a refusal.
- **As-of dates render MM/DD/YYYY**, stated once; never the raw freshness token.
- **Answers/blocks carry no internal ids, MLS numbers, or vendor names** (existing scrub in `comp-helper`/`resolve-subject`). Citations say "SWFL Data Gulf" / "realtor.com" only.
- **Verify with `bunx next build`**, not `npx tsc`. Stage explicit paths only — never `git add -A`.
- **Register the build before coding:** `node scripts/new-build.mjs showing-prep-packet "Showing Prep Packet"` (opens the `showing_prep_packet_live_verify` check; the spec stub already exists — if `new-build.mjs` errors on an existing spec, open the check manually: `node scripts/check.mjs open showing-prep-packet showing_prep_packet_live_verify "Showing Prep Packet live verify"`).

---

### Task 1: Showing-prep intent detector

**Files:**
- Create: `lib/email/showing-prep-intent.ts`
- Test: `lib/email/showing-prep-intent.test.ts`

**Interfaces:**
- Produces: `isShowingPrepPrompt(prompt: string): boolean`. Tasks 10 consumes it. Kept tight (the exact "showing prep" / "prep packet" wording), so it never collides with the New-Listing/Just-Sold recipes.

- [ ] **Step 1: Write the failing test**

Create `lib/email/showing-prep-intent.test.ts`:

```ts
import { test, expect } from "bun:test";
import { isShowingPrepPrompt } from "./showing-prep-intent";

test("matches the showing-prep recipe wording", () => {
  expect(isShowingPrepPrompt("Build a showing prep packet for 123 Main St")).toBe(true);
  expect(isShowingPrepPrompt("make me a showing-prep packet for my 2pm")).toBe(true);
  expect(isShowingPrepPrompt("prep packet for 16447 Rainbow Meadows Ct")).toBe(true);
});

test("does not match new-listing / just-sold / market-update wording", () => {
  expect(isShowingPrepPrompt("Build a new-listing announcement email for 123 X Rd")).toBe(false);
  expect(isShowingPrepPrompt("Build a just-sold email for 123 X Rd")).toBe(false);
  expect(isShowingPrepPrompt("my monthly market update on home prices")).toBe(false);
});

test("empty / nullish is false, never throws", () => {
  expect(isShowingPrepPrompt("")).toBe(false);
  expect(isShowingPrepPrompt(undefined as unknown as string)).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/showing-prep-intent.test.ts`
Expected: FAIL — `isShowingPrepPrompt` is not exported.

- [ ] **Step 3: Implement the minimal code**

Create `lib/email/showing-prep-intent.ts`:

```ts
// lib/email/showing-prep-intent.ts
//
// Detect the "Showing Prep Packet" recipe in a build prompt — the agent's own
// internal prep document for a showing (comps + subject + market snapshot), NOT a
// buyer-facing listing flyer. Kept tight ("showing prep" / "prep packet") so it
// never overlaps the New-Listing / Just-Sold / Coming-Soon recipes.

const SHOWING_PREP_RECIPE = /\b(showing[-\s]?prep|prep\s+packet)\b/i;

export function isShowingPrepPrompt(prompt: string): boolean {
  return !!prompt && SHOWING_PREP_RECIPE.test(prompt);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/showing-prep-intent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/showing-prep-intent.ts lib/email/showing-prep-intent.test.ts
git commit -m "feat(email): detect the Showing Prep Packet recipe"
```

---

### Task 2: Per-ZIP market snapshot reader (`housing-swfl`)

**Files:**
- Create: `lib/listings/market-snapshot.ts`
- Test: `lib/listings/market-snapshot.test.ts`

**Interfaces:**
- Consumes: `loadParsedBrain` (`lib/fetch-brain.ts:153`) — injectable for tests.
- Produces: `interface MarketSnapshot { zip: string; monthsOfSupply: number | null; activeInventory: number | null; homesSold: number | null; medianSalePrice: number | null; medianDom: number | null; marketType: "Seller's market" | "Buyer's market" | "Balanced" | null; asOf: string; lowSample: boolean }` and `async function marketSnapshotForZip(zip: string, deps?: { load?: typeof loadParsedBrain }): Promise<MarketSnapshot | null>`. Task 4 consumes it. Returns `null` when the ZIP row is missing OR thin-sample (`low_sample === true`) OR `months_of_supply` is null — so the caller OMITS the section rather than showing a hollow/stale one.

- [ ] **Step 1: Write the failing test**

Create `lib/listings/market-snapshot.test.ts`:

```ts
import { test, expect } from "bun:test";
import { marketSnapshotForZip } from "./market-snapshot";
import type { ParsedBrain } from "@/refinery/render/speaker.mts";

// Minimal ParsedBrain stub: only the fields marketSnapshotForZip reads.
function brainWithZipRow(cells: Record<string, unknown>): ParsedBrain {
  return {
    freshness_token: "SWFL-housing-swfl-20260701",
    output: {
      detail_tables: [
        {
          id: "housing_by_zip",
          grain: "zip",
          columns: [],
          rows: [{ key: "33908", label: "33908", cells }],
          source: { citation: "Redfin via SWFL Data Gulf", url: "https://www.redfin.com" },
        },
      ],
    },
  } as unknown as ParsedBrain;
}

test("returns the ZIP's snapshot with market type inferred from months_of_supply", async () => {
  const load = async () =>
    brainWithZipRow({
      months_of_supply: 2.1,
      inventory: 140,
      homes_sold: 66,
      median_sale_price: 489000,
      median_dom: 41,
      low_sample: false,
    });
  const snap = await marketSnapshotForZip("33908", { load });
  expect(snap).not.toBeNull();
  expect(snap!.monthsOfSupply).toBe(2.1);
  expect(snap!.activeInventory).toBe(140);
  expect(snap!.homesSold).toBe(66);
  expect(snap!.marketType).toBe("Seller's market"); // < 3
  expect(snap!.asOf).toBe("07/01/2026"); // MM/DD/YYYY from the freshness token
});

test("infers a buyer's market above 6 months and balanced between", async () => {
  const buyer = await marketSnapshotForZip("33908", {
    load: async () => brainWithZipRow({ months_of_supply: 7.5, homes_sold: 30, low_sample: false }),
  });
  expect(buyer!.marketType).toBe("Buyer's market");
  const bal = await marketSnapshotForZip("33908", {
    load: async () => brainWithZipRow({ months_of_supply: 4.5, homes_sold: 30, low_sample: false }),
  });
  expect(bal!.marketType).toBe("Balanced");
});

test("returns null on a thin-sample row (never shown stale)", async () => {
  const snap = await marketSnapshotForZip("33908", {
    load: async () => brainWithZipRow({ months_of_supply: 2.0, homes_sold: 3, low_sample: true }),
  });
  expect(snap).toBeNull();
});

test("returns null when months_of_supply is null (nothing solid to show)", async () => {
  const snap = await marketSnapshotForZip("33908", {
    load: async () => brainWithZipRow({ months_of_supply: null, homes_sold: 40, low_sample: false }),
  });
  expect(snap).toBeNull();
});

test("returns null on a missing ZIP row, and never throws when the brain is absent", async () => {
  expect(await marketSnapshotForZip("00000", { load: async () => brainWithZipRow({ months_of_supply: 2 }) })).toBeNull();
  expect(await marketSnapshotForZip("33908", { load: async () => null })).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/listings/market-snapshot.test.ts`
Expected: FAIL — `lib/listings/market-snapshot.ts` does not exist.

- [ ] **Step 3: Implement the minimal code**

Create `lib/listings/market-snapshot.ts`:

```ts
// lib/listings/market-snapshot.ts
//
// Per-ZIP "Local Market Snapshot" read from the housing-swfl brain's baked
// `housing_by_zip` detail table (Redfin, 90-day rolling). Deviation #2 from the
// Showing Prep spec: housing-swfl — NOT market-heat-swfl (no months-of-inventory,
// no sold data there) — and read as a DETAIL ROW (loadParsedBrain), not a frame
// (metric_keys bind region-aggregate only). Pending count is never emitted, so it
// is not surfaced. Market type is INFERRED from months_of_supply (< 3 seller's,
// > 6 buyer's, else balanced). Returns null — so the caller OMITS the section —
// when the ZIP row is missing, thin-sample, or months_of_supply is null.
// Empty-tolerant: never throws.

import { loadParsedBrain } from "@/lib/fetch-brain";
import { asOfFromToken } from "@/lib/project/as-of";

export interface MarketSnapshot {
  zip: string;
  monthsOfSupply: number | null;
  activeInventory: number | null;
  homesSold: number | null;
  medianSalePrice: number | null;
  medianDom: number | null;
  marketType: "Seller's market" | "Buyer's market" | "Balanced" | null;
  /** MM/DD/YYYY, from the brain's freshness token. */
  asOf: string;
  lowSample: boolean;
}

const HOUSING_ZIP_TABLE = "housing_by_zip";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function marketTypeFrom(mos: number | null): MarketSnapshot["marketType"] {
  if (mos == null) return null;
  if (mos < 3) return "Seller's market";
  if (mos > 6) return "Buyer's market";
  return "Balanced";
}

export async function marketSnapshotForZip(
  zip: string,
  deps: { load?: typeof loadParsedBrain } = {},
): Promise<MarketSnapshot | null> {
  const want = String(zip ?? "").match(/\d{5}/)?.[0];
  if (!want) return null;
  const load = deps.load ?? loadParsedBrain;

  const brain = await load("housing-swfl").catch(() => null);
  if (!brain) return null;

  const tables = brain.output?.detail_tables ?? [];
  const table = tables.find((t) => t.id === HOUSING_ZIP_TABLE);
  const row = table?.rows.find((r) => r.key === want);
  if (!row) return null;

  const cells = row.cells as Record<string, unknown>;
  if (cells.low_sample === true) return null; // thin sample — never shown stale
  const monthsOfSupply = num(cells.months_of_supply);
  if (monthsOfSupply == null) return null; // nothing solid to anchor the section

  return {
    zip: want,
    monthsOfSupply,
    activeInventory: num(cells.inventory),
    homesSold: num(cells.homes_sold),
    medianSalePrice: num(cells.median_sale_price),
    medianDom: num(cells.median_dom),
    marketType: marketTypeFrom(monthsOfSupply),
    asOf: asOfFromToken(brain.freshness_token) ?? brain.freshness_token,
    lowSample: false,
  };
}
```

> Implementer note: confirm `asOfFromToken` returns `MM/DD/YYYY` (it is the same helper `fetch-brain.ts` uses for freshness display). If its format differs, format the token's trailing `YYYYMMDD` to `MM/DD/YYYY` locally — never surface the raw token.

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/listings/market-snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/listings/market-snapshot.ts lib/listings/market-snapshot.test.ts
git commit -m "feat(listings): per-ZIP market snapshot from housing-swfl detail row"
```

---

### Task 2b: Confirm `asOfFromToken` shape (guard step, no code if already MM/DD/YYYY)

**Files:** Read only: `lib/project/as-of.ts`

- [ ] **Step 1:** Open `lib/project/as-of.ts`, read `asOfFromToken`. Confirm it maps a `SWFL-…-YYYYMMDD` token to `MM/DD/YYYY`. If it does, no change — Task 2's test already asserts `"07/01/2026"` and will have passed. If it returns a different format (e.g. "Jul 1"), replace the `asOf` line in `market-snapshot.ts` with a local `YYYYMMDD → MM/DD/YYYY` formatter and update the Task 2 test's expected value accordingly, then re-run `bun test lib/listings/market-snapshot.test.ts`.
- [ ] **Step 2 (only if changed): Commit**

```bash
git add lib/listings/market-snapshot.ts lib/listings/market-snapshot.test.ts
git commit -m "fix(listings): format market-snapshot as-of to MM/DD/YYYY"
```

---

### Task 3: Multi-pin static map URL builder

**Files:**
- Create: `lib/listings/listings-map.ts`
- Test: `lib/listings/listings-map.test.ts`

**Interfaces:**
- Produces: `interface MapPin { lat: number; lon: number; role: "subject" | "comp" }` and `function listingsMapUrl(pins: MapPin[], opts?: { width?: number; height?: number }): string | null`. Task 5 consumes it. Returns `null` with no `MAPBOX_TOKEN`, no valid pins, or coords out of Web-Mercator range — so a missing token degrades to "no map", never a broken image. Mirrors `lib/listings/aerial.ts`'s verified URL contract, extended to multiple markers + auto-fit.

- [ ] **Step 1: Vendor-first — verify the multi-marker + auto-fit contract (RULE 0.4)**

Run: `crawl4ai https://docs.mapbox.com/api/maps/static-images/`
Confirm verbatim, before writing the builder: (a) multiple markers are comma-separated in the `{overlay}` path segment, each `pin-s-{label}+{color}({lon},{lat})` (lon first); (b) `auto` replaces the `{lon},{lat},{zoom}` center segment to auto-fit all overlays; (c) the `@2x` retina + `{width}x{height}` bounds are 1–1280. Record the confirmed contract in a one-line comment at the top of `listings-map.ts` with today's date (mirrors `aerial.ts`'s pinned-contract comment). If any detail differs from the code below, adjust the URL template to match the docs — the docs win.

- [ ] **Step 2: Write the failing test**

Create `lib/listings/listings-map.test.ts`:

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { listingsMapUrl } from "./listings-map";

const prev = process.env.MAPBOX_TOKEN;
beforeAll(() => {
  process.env.MAPBOX_TOKEN = "pk.test";
});
afterAll(() => {
  if (prev === undefined) delete process.env.MAPBOX_TOKEN;
  else process.env.MAPBOX_TOKEN = prev;
});

test("builds an auto-fit street map with a subject pin and comp pins", () => {
  const url = listingsMapUrl([
    { lat: 26.5, lon: -81.9, role: "subject" },
    { lat: 26.51, lon: -81.91, role: "comp" },
  ]);
  expect(url).toContain("api.mapbox.com/styles/v1/mapbox/streets-v12/static/");
  expect(url).toContain("/auto/"); // auto-fit, not a fixed center/zoom
  expect(url).toContain("-81.9,26.5"); // subject: lon FIRST
  expect(url).toContain("access_token=pk.test");
});

test("returns null when there is no valid subject/comp pin", () => {
  expect(listingsMapUrl([])).toBeNull();
  expect(listingsMapUrl([{ lat: NaN, lon: -81.9, role: "subject" }])).toBeNull();
  expect(listingsMapUrl([{ lat: 999, lon: -81.9, role: "subject" }])).toBeNull();
});

test("returns null with no MAPBOX_TOKEN (degrades to no map, never broken)", () => {
  const saved = process.env.MAPBOX_TOKEN;
  delete process.env.MAPBOX_TOKEN;
  expect(listingsMapUrl([{ lat: 26.5, lon: -81.9, role: "subject" }])).toBeNull();
  process.env.MAPBOX_TOKEN = saved;
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun test lib/listings/listings-map.test.ts`
Expected: FAIL — `lib/listings/listings-map.ts` does not exist.

- [ ] **Step 4: Implement the minimal code**

Create `lib/listings/listings-map.ts` (adjust the template only if Step 1's crawl showed a different contract):

```ts
// lib/listings/listings-map.ts
//
// Pure Mapbox Static Images URL builder for a comps map — subject + comp pins on a
// street map, auto-fit to all pins. Sibling to lib/listings/aerial.ts (single-pin
// satellite); same verified URL contract, extended to multiple markers + `auto`.
//
// URL contract pinned against docs.mapbox.com/api/maps/static-images (RULE 0.4,
// <VERIFY DATE FROM STEP 1>):
//   GET styles/v1/mapbox/streets-v12/static/{markers}/auto/{w}x{h}@2x?access_token=
//   - markers: comma-separated pin-s-{label}+{color}({lon},{lat}); lon FIRST.
//   - `auto` fits the viewport to every overlay (no manual center/zoom).
//   - width/height 1-1280; @2x retina.

const MAPBOX_STATIC = "https://api.mapbox.com/styles/v1/mapbox";
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

const SUBJECT_COLOR = "e11d48"; // rose — the subject
const COMP_COLOR = "0ea5e9"; // sky — a comp

export interface MapPin {
  lat: number;
  lon: number;
  role: "subject" | "comp";
}

function valid(p: MapPin): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= -85.0511 &&
    p.lat <= 85.0511 &&
    p.lon >= -180 &&
    p.lon <= 180
  );
}

export function listingsMapUrl(
  pins: MapPin[],
  opts: { width?: number; height?: number } = {},
): string | null {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  const good = (pins ?? []).filter(valid);
  if (good.length === 0) return null;

  const width = opts.width ?? 600;
  const height = opts.height ?? 360;
  // Subject as a larger labeled pin ("s"); comps as small dots. Subject first.
  const ordered = [...good].sort((a, b) => (a.role === "subject" ? -1 : 0) - (b.role === "subject" ? -1 : 0));
  const markers = ordered
    .map((p) => {
      const lon = round6(p.lon);
      const lat = round6(p.lat);
      return p.role === "subject"
        ? `pin-l-star+${SUBJECT_COLOR}(${lon},${lat})`
        : `pin-s+${COMP_COLOR}(${lon},${lat})`;
    })
    .join(",");

  return `${MAPBOX_STATIC}/streets-v12/static/${markers}/auto/${width}x${height}@2x?access_token=${token}`;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun test lib/listings/listings-map.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/listings/listings-map.ts lib/listings/listings-map.test.ts
git commit -m "feat(listings): multi-pin auto-fit static map URL for comps"
```

---

### Task 4: Four-lane sourcing orchestrator

**Files:**
- Create: `lib/listings/showing-prep-source.ts`
- Test: `lib/listings/showing-prep-source.test.ts`

**Interfaces:**
- Consumes: `resolveSubjectListing` (`lib/listings/resolve-subject.ts`), `compsForAddress` + `RenderComp` (`lib/assistant/comp-helper.ts`), `geocodeAddress` (`lib/geo/geocode-address.ts`), `marketSnapshotForZip` (Task 2), `MapPin` (Task 3). All injectable via a `deps` object so the test never touches Mapbox/SteadyAPI/disk.
- Produces:

```ts
export interface CompOneSheet {
  comp: RenderComp;
  photoUrl: string;        // present only for enriched one-sheet comps
}
export interface ShowingPrepData {
  address: string;
  subject: ListingFacts | null;    // null => address-only skeleton
  subjectPin: MapPin | null;       // from geocode; null when unresolved
  zip: string | null;
  comps: RenderComp[];             // all comps (comparison grid source)
  oneSheets: CompOneSheet[];       // best-effort photo-enriched top-N (subset of comps)
  compPins: MapPin[];              // best-effort geocoded comp pins
  snapshot: MarketSnapshot | null; // Task 2; null => section omitted
  asOf: string;                    // MM/DD/YYYY (comps.asOf)
}
export async function gatherShowingPrepData(address: string, deps?: GatherDeps): Promise<ShowingPrepData>;
```

Task 5 (builder) and Task 6 (assembler) consume `ShowingPrepData`. **Never throws; always returns a fully-formed object** (every field degraded, never absent) — this is the "works for every build" guarantee.

- [ ] **Step 1: Write the failing test**

Create `lib/listings/showing-prep-source.test.ts`:

```ts
import { test, expect } from "bun:test";
import { gatherShowingPrepData } from "./showing-prep-source";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { CompResult, RenderComp } from "@/lib/assistant/comp-helper";
import type { GeocodedAddress } from "@/lib/geo/geocode-address";

const SUBJECT: ListingFacts = {
  address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
  city: "Fort Myers",
  state: "FL",
  zip: "33908",
  price: "$489,000",
  beds: "3",
  baths: "2",
  sqft: "1840",
  photos: ["https://cdn/subject.jpg"],
  sourceUrl: "https://www.swfldatagulf.com",
};

const COMPS: RenderComp[] = [
  { addressLine: "101 A St", city: "Fort Myers", beds: 3, baths: 2, sqft: 1800, status: "sold", price: 475000, priceKind: "sold", priceDate: "2026-06-01" },
  { addressLine: "202 B St", city: "Fort Myers", beds: 4, baths: 3, sqft: 2200, status: "for_sale", price: 520000, priceKind: "last_list", priceDate: null },
];

function deps(over: Partial<Parameters<typeof gatherShowingPrepData>[1]> = {}) {
  return {
    geocode: async (t: string): Promise<GeocodedAddress | null> =>
      t.includes("Rainbow")
        ? { lat: 26.5, lon: -81.9, matchedAddress: t, zip: "33908", county: "Lee", countyFips: "12071" }
        : { lat: 26.51, lon: -81.91, matchedAddress: t, zip: "33908", county: "Lee", countyFips: "12071" },
    resolveSubject: async () => SUBJECT,
    comps: async (): Promise<CompResult> => ({ comps: COMPS, asOf: "07/08/2026", needs: [] }),
    snapshot: async () => null,
    enrichPhoto: async (c: RenderComp) => (c.addressLine === "101 A St" ? "https://cdn/comp1.jpg" : null),
    photoEnrichN: 2,
    ...over,
  };
}

test("assembles a full packet from all lanes; never throws", async () => {
  const data = await gatherShowingPrepData(SUBJECT.address, deps());
  expect(data.subject?.price).toBe("$489,000");
  expect(data.subjectPin).toEqual({ lat: 26.5, lon: -81.9, role: "subject" });
  expect(data.zip).toBe("33908");
  expect(data.comps).toHaveLength(2);
  expect(data.compPins.length).toBe(2); // both comps geocoded
  expect(data.oneSheets).toHaveLength(1); // only comp 1 had a photo
  expect(data.oneSheets[0].photoUrl).toBe("https://cdn/comp1.jpg");
  expect(data.asOf).toBe("07/08/2026");
});

test("degrades to an address-only skeleton on a subject miss (still returns comps)", async () => {
  const data = await gatherShowingPrepData(SUBJECT.address, deps({ resolveSubject: async () => null }));
  expect(data.subject).toBeNull();
  expect(data.comps).toHaveLength(2); // comps still gathered
  expect(data.subjectPin).not.toBeNull(); // geocode still gives a subject pin
});

test("degrades to nothing but an address when every lane misses; never throws", async () => {
  const data = await gatherShowingPrepData("nowhere", {
    geocode: async () => null,
    resolveSubject: async () => null,
    comps: async () => ({ comps: [], asOf: "07/08/2026", needs: [] }),
    snapshot: async () => null,
    enrichPhoto: async () => null,
  });
  expect(data.address).toBe("nowhere");
  expect(data.subject).toBeNull();
  expect(data.subjectPin).toBeNull();
  expect(data.comps).toHaveLength(0);
  expect(data.oneSheets).toHaveLength(0);
  expect(data.compPins).toHaveLength(0);
  expect(data.snapshot).toBeNull();
});

test("a thrown lane is swallowed — the packet still builds", async () => {
  const data = await gatherShowingPrepData(SUBJECT.address, deps({
    comps: async () => { throw new Error("steady down"); },
    snapshot: async () => { throw new Error("brain missing"); },
  }));
  expect(data.subject?.price).toBe("$489,000"); // other lanes unaffected
  expect(data.comps).toHaveLength(0);
  expect(data.snapshot).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/listings/showing-prep-source.test.ts`
Expected: FAIL — `lib/listings/showing-prep-source.ts` does not exist.

- [ ] **Step 3: Implement the minimal code**

Create `lib/listings/showing-prep-source.ts`:

```ts
// lib/listings/showing-prep-source.ts
//
// Four-lane, best-effort, NEVER-THROWS sourcing for a Showing Prep Packet. Runs
// the subject lane (resolveSubjectListing), the comps lane (compsForAddress), the
// map lane (geocode the subject + best-effort geocode each comp — Deviation #3: the
// comp source carries no lat/lon), the photo lane (best-effort enrich the top-N
// comps into one-sheets — the comp source carries no photo either), and the market
// snapshot lane (housing-swfl per ZIP). Every lane degrades independently; the
// returned ShowingPrepData is ALWAYS fully formed (empty, never absent) so the
// packet builds for every address. Nothing here invents a number.

import { resolveSubjectListing } from "@/lib/listings/resolve-subject";
import { compsForAddress, type CompResult, type RenderComp } from "@/lib/assistant/comp-helper";
import { geocodeAddress, type GeocodedAddress } from "@/lib/geo/geocode-address";
import { marketSnapshotForZip, type MarketSnapshot } from "./market-snapshot";
import type { MapPin } from "./listings-map";
import type { ListingFacts } from "@/lib/email/listing-scrape";

export interface CompOneSheet {
  comp: RenderComp;
  photoUrl: string;
}

export interface ShowingPrepData {
  address: string;
  subject: ListingFacts | null;
  subjectPin: MapPin | null;
  zip: string | null;
  comps: RenderComp[];
  oneSheets: CompOneSheet[];
  compPins: MapPin[];
  snapshot: MarketSnapshot | null;
  asOf: string;
}

export interface GatherDeps {
  geocode?: (text: string) => Promise<GeocodedAddress | null>;
  resolveSubject?: (address: string) => Promise<ListingFacts | null>;
  comps?: (address: string) => Promise<CompResult>;
  snapshot?: (zip: string) => Promise<MarketSnapshot | null>;
  /** Best-effort photo for a comp's one-sheet — defaults to resolving the comp
   *  address to its own for-sale record (which carries a photo). */
  enrichPhoto?: (comp: RenderComp) => Promise<string | null>;
  /** How many top comps to photo-enrich into one-sheets (default 3). */
  photoEnrichN?: number;
}

/** Best-effort: resolve a comp address to its own listing photo. Bounded + cached
 *  downstream (resolveSubjectListing hour-caches its SteadyAPI call). Null on any miss. */
async function defaultEnrichPhoto(comp: RenderComp): Promise<string | null> {
  const facts = await resolveSubjectListing(`${comp.addressLine}, ${comp.city}, FL`).catch(() => null);
  return facts?.photos[0] ?? null;
}

const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export async function gatherShowingPrepData(
  address: string,
  deps: GatherDeps = {},
): Promise<ShowingPrepData> {
  const addr = String(address ?? "").trim();
  const geocode = deps.geocode ?? geocodeAddress;
  const resolveSubject = deps.resolveSubject ?? resolveSubjectListing;
  const comps = deps.comps ?? compsForAddress;
  const snapshot = deps.snapshot ?? marketSnapshotForZip;
  const enrichPhoto = deps.enrichPhoto ?? defaultEnrichPhoto;
  const photoEnrichN = deps.photoEnrichN ?? 3;

  // Lanes run concurrently; each degrades to its own empty value on miss/throw.
  const [geo, subject, compResult] = await Promise.all([
    safe(Promise.resolve(geocode(addr)), null),
    safe(Promise.resolve(resolveSubject(addr)), null),
    safe(Promise.resolve(comps(addr)), { comps: [], asOf: "", needs: [] } as CompResult),
  ]);

  const zip = geo?.zip ?? subject?.zip ?? null;
  const subjectPin: MapPin | null =
    geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)
      ? { lat: geo.lat, lon: geo.lon, role: "subject" }
      : null;

  const allComps = compResult.comps ?? [];

  // Map lane — best-effort geocode each comp (no Steady cost). A comp that fails to
  // geocode simply isn't pinned; the map still renders the subject + whatever resolved.
  const compGeos = await Promise.all(
    allComps.map((c) => safe(Promise.resolve(geocode(`${c.addressLine}, ${c.city}, FL`)), null)),
  );
  const compPins: MapPin[] = compGeos
    .filter((g): g is GeocodedAddress => !!g && Number.isFinite(g.lat) && Number.isFinite(g.lon))
    .map((g) => ({ lat: g.lat, lon: g.lon, role: "comp" as const }));

  // Photo lane — best-effort enrich the top-N comps into one-sheets. A comp with no
  // photo is simply absent from oneSheets and lands in the comparison grid (Task 5).
  const topN = allComps.slice(0, photoEnrichN);
  const enriched = await Promise.all(
    topN.map(async (c) => {
      const photoUrl = await safe(Promise.resolve(enrichPhoto(c)), null);
      return photoUrl ? ({ comp: c, photoUrl } as CompOneSheet) : null;
    }),
  );
  const oneSheets = enriched.filter((o): o is CompOneSheet => o !== null);

  const snap = zip ? await safe(Promise.resolve(snapshot(zip)), null) : null;

  return {
    address: addr,
    subject,
    subjectPin,
    zip,
    comps: allComps,
    oneSheets,
    compPins,
    snapshot: snap,
    asOf: compResult.asOf || "",
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/listings/showing-prep-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/listings/showing-prep-source.ts lib/listings/showing-prep-source.test.ts
git commit -m "feat(listings): four-lane never-throws sourcing for the showing prep packet"
```

---

### Task 5: The coded-grid packet builder (PURE)

**Files:**
- Create: `lib/email/showing-prep-doc.ts`
- Test: `lib/email/showing-prep-doc.test.ts`

**Interfaces:**
- Consumes: `ShowingPrepData`/`CompOneSheet` (Task 4), `listingsMapUrl`/`MapPin` (Task 3), `MarketSnapshot` (Task 2), `RenderComp` (comp-helper), EmailDoc primitives (`createBlock`, `heroPhotoBlock`, `DEFAULT_GLOBAL_STYLE`, `EmailBlock`, `EmailDoc`, `StatItem`, `BlockLayout`).
- Produces: `function buildShowingPrepDoc(data: ShowingPrepData, current: EmailDoc): EmailDoc` and `export const SHOWING_PREP_COMMENTARY_MARKER: string` (the caption sentinel on the empty commentary `text` block so the assembler in Task 6 knows which block to fill). PURE — no I/O, invents nothing; every section degrades to an empty cell or is omitted, never broken. Task 6 consumes both.

Fixed section order (Deviations #3, #4 applied):
1. Header (sticky — `keepOrDefault`)
2. Subject hero photo (real photo → `heroPhotoBlock`; else empty `image` block = drag-drop slot)
3. Subject hero (kicker "Showing Prep" + price + address; address-only when no subject)
4. Subject spec strip (beds/baths/sqft — empty cells, never 0)
5. Comp/subject **map** (`image` kind:"chart" with the `listingsMapUrl`; omitted entirely when no pin resolves)
6. Per-comp **one-sheets** (top-N enriched comps: photo + price + specs) — a `listing` block each
7. Comps **comparison grid** (`list` block: one row per remaining comp — price + specs, source scrubbed)
8. **Market snapshot** stat strip + a source line (omitted when `snapshot` is null)
9. Empty **commentary** `text` block (marker caption; Task 6 fills it, gated)
10. **Disclosure** slot — empty `image` block captioned "Attach seller disclosure (optional)"
11. Agent card (sticky — `keepOrDefault`)
12. Footer (sticky, CAN-SPAM — `keepOrDefault`, `static`)

- [ ] **Step 1: Write the failing test**

Create `lib/email/showing-prep-doc.test.ts`:

```ts
import { test, expect } from "bun:test";
import { buildShowingPrepDoc, SHOWING_PREP_COMMENTARY_MARKER } from "./showing-prep-doc";
import { SEED_DOCS } from "./doc/default-docs";
import type { ShowingPrepData } from "@/lib/listings/showing-prep-source";
import type { RenderComp } from "@/lib/assistant/comp-helper";

function currentDoc() {
  return SEED_DOCS.find((s) => s.id === "market-spotlight")!.build();
}

const COMPS: RenderComp[] = [
  { addressLine: "101 A St", city: "Fort Myers", beds: 3, baths: 2, sqft: 1800, status: "sold", price: 475000, priceKind: "sold", priceDate: "2026-06-01" },
  { addressLine: "202 B St", city: "Fort Myers", beds: 4, baths: 3, sqft: 2200, status: "for_sale", price: 520000, priceKind: "last_list", priceDate: null },
];

const FULL: ShowingPrepData = {
  address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
  subject: {
    address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
    city: "Fort Myers", state: "FL", zip: "33908",
    price: "$489,000", beds: "3", baths: "2", sqft: "1840",
    photos: ["https://cdn/subject.jpg"], sourceUrl: "https://www.swfldatagulf.com",
  },
  subjectPin: { lat: 26.5, lon: -81.9, role: "subject" },
  zip: "33908",
  comps: COMPS,
  oneSheets: [{ comp: COMPS[0], photoUrl: "https://cdn/comp1.jpg" }],
  compPins: [{ lat: 26.51, lon: -81.91, role: "comp" }],
  snapshot: {
    zip: "33908", monthsOfSupply: 2.1, activeInventory: 140, homesSold: 66,
    medianSalePrice: 489000, medianDom: 41, marketType: "Seller's market",
    asOf: "07/01/2026", lowSample: false,
  },
  asOf: "07/08/2026",
};

// Note: MAPBOX_TOKEN is unset in this test → listingsMapUrl returns null → the map
// section is omitted. That is the correct degrade; a separate assertion below sets it.
test("leads with a Showing Prep kicker + subject price/address and a spec strip", () => {
  const doc = buildShowingPrepDoc(FULL, currentDoc());
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.type === "hero" && hero.props.kicker).toBe("Showing Prep");
  expect(hero?.type === "hero" && hero.props.value).toBe("$489,000");
  expect(hero?.type === "hero" && (hero.props.label ?? "")).toContain("Rainbow Meadows");
  const stats = doc.blocks.find((b) => b.type === "stats");
  expect(stats?.type === "stats" && stats.props.stats.map((s) => s.label)).toEqual(["Beds", "Baths", "Sq Ft"]);
});

test("renders a one-sheet listing block for the photo-enriched comp and a grid for the rest", () => {
  const doc = buildShowingPrepDoc(FULL, currentDoc());
  const listings = doc.blocks.filter((b) => b.type === "listing");
  expect(listings).toHaveLength(1);
  expect(listings[0].type === "listing" && listings[0].props.photoUrl).toBe("https://cdn/comp1.jpg");
  const list = doc.blocks.find((b) => b.type === "list");
  // The remaining comp (202 B St, not one-sheeted) lands in the comparison grid.
  expect(list?.type === "list" && JSON.stringify(list.props.items)).toContain("202 B St");
});

test("renders the market snapshot stat strip with market type; omits it when snapshot is null", () => {
  const withSnap = buildShowingPrepDoc(FULL, currentDoc());
  const stats = withSnap.blocks.filter((b) => b.type === "stats");
  // spec strip + snapshot strip = 2 stats blocks
  expect(stats.length).toBe(2);
  const snapStrip = stats[1];
  expect(snapStrip.type === "stats" && JSON.stringify(snapStrip.props.stats)).toContain("Seller's market");

  const noSnap = buildShowingPrepDoc({ ...FULL, snapshot: null }, currentDoc());
  expect(noSnap.blocks.filter((b) => b.type === "stats").length).toBe(1); // only the spec strip
});

test("always includes an empty commentary slot and a disclosure slot", () => {
  const doc = buildShowingPrepDoc(FULL, currentDoc());
  const commentary = doc.blocks.find((b) => b.type === "text" && b.props.caption === SHOWING_PREP_COMMENTARY_MARKER);
  expect(commentary).toBeDefined();
  expect(commentary?.type === "text" && commentary.props.body).toBe(""); // empty — Task 6 fills it
  const disclosure = doc.blocks.find(
    (b) => b.type === "image" && (b.props.caption ?? "").includes("Attach seller disclosure"),
  );
  expect(disclosure).toBeDefined();
  expect(disclosure?.type === "image" && disclosure.props.url).toBe(""); // empty drag-drop slot
});

test("degrades to an address-only skeleton (no subject) and still builds every fixed block", () => {
  const doc = buildShowingPrepDoc(
    { ...FULL, subject: null, subjectPin: null, comps: [], oneSheets: [], compPins: [], snapshot: null },
    currentDoc(),
  );
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.type === "hero" && (hero.props.label ?? "")).toContain("Rainbow Meadows"); // falls back to the typed address
  expect(hero?.type === "hero" && hero.props.value).toBe(""); // no invented price
  // Footer always survives (CAN-SPAM), and is static.
  const footer = doc.blocks.find((b) => b.type === "footer");
  expect(footer?.layout?.static).toBe(true);
  // No comps → no listing/list blocks, but the doc still built.
  expect(doc.blocks.some((b) => b.type === "listing")).toBe(false);
  expect(doc.blocks.length).toBeGreaterThan(4);
});

test("every block carries a grid layout that stacks without overlap", () => {
  const doc = buildShowingPrepDoc(FULL, currentDoc());
  let y = 0;
  for (const b of doc.blocks) {
    expect(b.layout).toBeDefined();
    expect(b.layout?.x).toBe(0);
    expect(b.layout?.w).toBe(12);
    expect(b.layout?.y).toBe(y);
    y += b.layout?.h ?? 0;
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/showing-prep-doc.test.ts`
Expected: FAIL — `lib/email/showing-prep-doc.ts` does not exist.

- [ ] **Step 3: Implement the minimal code**

Create `lib/email/showing-prep-doc.ts`:

```ts
// lib/email/showing-prep-doc.ts
//
// Turn ShowingPrepData into the coded-grid Showing Prep Packet EmailDoc — an
// AGENT-FACING prep document (comps + subject + market snapshot), NOT a buyer-facing
// flyer. Its own dedicated build path (Deviation #1): a coded grid like
// listing-flyer.ts, gated later by lintAuthoredProse (Task 6), never the SnapshotItem
// deliverable pipeline. PURE: returns a NEW doc, mutates nothing, invents nothing —
// every section degrades to an empty cell or is omitted, never a broken graphic and
// never a fabricated number. Brand/identity (header, agent card, footer, globalStyle)
// is sticky, lifted from the doc on the canvas.

import { createBlock } from "./doc/default-docs";
import { heroPhotoBlock } from "./inject-photo";
import { listingsMapUrl, type MapPin } from "@/lib/listings/listings-map";
import type { RenderComp } from "@/lib/assistant/comp-helper";
import type { ShowingPrepData } from "@/lib/listings/showing-prep-source";
import type { MarketSnapshot } from "@/lib/listings/market-snapshot";
import type { BlockLayout, EmailBlock, EmailDoc, StatItem } from "./doc/types";

/** Caption sentinel on the empty commentary text block — the assembler (Task 6)
 *  finds the block to fill by this marker, so no positional coupling. */
export const SHOWING_PREP_COMMENTARY_MARKER = "__showing_prep_commentary__";

const DISCLOSURE_LABEL = "Attach seller disclosure (optional)";

function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

function withCommas(n?: string): string | undefined {
  if (!n) return undefined;
  const digits = n.replace(/[^\d]/g, "");
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : undefined;
}

function usd(n: number | null): string {
  return n == null ? "" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** "sold $475,000 · 06/01/2026" / "list $520,000" / "est. $480,000" — labeled by
 *  kind so an AVM/last-list is never called a sale (comp-helper's honesty rule). */
function compPricePhrase(c: RenderComp): string {
  if (c.price == null) return "price n/a";
  const money = usd(c.price);
  if (c.priceKind === "sold") {
    const d = c.priceDate ? isoToMDY(c.priceDate) : null;
    return `sold ${money}${d ? ` · ${d}` : ""}`;
  }
  if (c.priceKind === "estimate") return `est. ${money}`;
  return `list ${money}`;
}

function isoToMDY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

function compSpec(c: RenderComp): string {
  return [
    c.beds != null ? `${c.beds} bd` : "",
    c.baths != null ? `${c.baths} ba` : "",
    c.sqft != null ? `${c.sqft.toLocaleString("en-US")} sqft` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function snapshotCells(s: MarketSnapshot): StatItem[] {
  const cells: StatItem[] = [];
  if (s.marketType) cells.push({ value: s.marketType, label: "Market" });
  cells.push({ value: String(s.monthsOfSupply), label: "Months supply" });
  if (s.homesSold != null) cells.push({ value: String(s.homesSold), label: "Sold (90d)" });
  if (s.activeInventory != null) cells.push({ value: String(s.activeInventory), label: "Active" });
  return cells.slice(0, 3); // stats block caps at 3 cells
}

export function buildShowingPrepDoc(data: ShowingPrepData, current: EmailDoc): EmailDoc {
  const { subject } = data;
  const blocks: EmailBlock[] = [];
  let y = 0;
  const at = <T extends EmailBlock>(b: T, h: number, opts?: Partial<BlockLayout>): T => ({
    ...b,
    layout: { x: 0, y, w: 12, h, ...opts },
  });
  const push = (b: EmailBlock, h: number, opts?: Partial<BlockLayout>) => {
    blocks.push(at(b, h, opts));
    y += h;
  };

  const addressLine =
    subject?.address ??
    ([subject?.city, subject?.state].filter(Boolean).join(", ") || data.address || undefined);

  // 1. Header — sticky brand.
  push(keepOrDefault(current, "header"), 2);

  // 2. Subject hero photo — real photo, else empty drag-drop image slot.
  push(
    subject?.photos[0]
      ? heroPhotoBlock({ url: subject.photos[0], alt: subject.address ?? "Subject property", linkUrl: subject.sourceUrl })
      : { id: createBlock("image").id, type: "image", props: { url: "", kind: "photo", alt: subject?.address ?? "Subject property" } },
    6,
  );

  // 3. Subject hero — kicker + price + address (address-only when no subject; no invented price).
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: { kicker: "Showing Prep", value: subject?.price ?? "", label: addressLine ?? "" },
    },
    3,
  );

  // 4. Subject spec strip — empty cells, never a 0, never invented.
  const specCells: StatItem[] = [
    { value: subject?.beds ?? "", label: "Beds" },
    { value: subject?.baths ?? "", label: "Baths" },
    { value: withCommas(subject?.sqft) ?? "", label: "Sq Ft" },
  ];
  push({ id: createBlock("stats").id, type: "stats", props: { stats: specCells } }, 2);

  // 5. Comp/subject MAP — omitted entirely when no pin resolves (never a broken graphic).
  const pins: MapPin[] = [...(data.subjectPin ? [data.subjectPin] : []), ...data.compPins];
  const mapUrl = listingsMapUrl(pins);
  if (mapUrl) {
    push(
      {
        id: createBlock("image").id,
        type: "image",
        props: { url: mapUrl, kind: "chart", alt: "Subject and nearby comps", caption: "Subject (★) and nearby comps" },
      },
      5,
    );
  }

  // 6. Per-comp ONE-SHEETS — the photo-enriched top comps (a `listing` card each).
  for (const { comp, photoUrl } of data.oneSheets) {
    push(
      {
        id: createBlock("listing").id,
        type: "listing",
        props: {
          photoUrl,
          price: usd(comp.price),
          beds: comp.beds != null ? String(comp.beds) : undefined,
          baths: comp.baths != null ? String(comp.baths) : undefined,
          sqft: comp.sqft != null ? String(comp.sqft) : undefined,
          address: [comp.addressLine, comp.city].filter(Boolean).join(", "),
          badge: comp.priceKind === "sold" ? "Sold comp" : "Comp",
        },
      },
      6,
    );
  }

  // 7. Comparison GRID — every comp NOT already a one-sheet (source scrubbed by comp-helper).
  const oneSheetKeys = new Set(data.oneSheets.map((o) => o.comp.addressLine));
  const gridComps = data.comps.filter((c) => !oneSheetKeys.has(c.addressLine));
  if (gridComps.length) {
    push(
      {
        id: createBlock("list").id,
        type: "list",
        props: {
          title: "Nearby comps",
          items: gridComps.slice(0, 8).map((c) => ({
            lead: [c.addressLine, c.city].filter(Boolean).join(", "),
            text: [compSpec(c), compPricePhrase(c)].filter(Boolean).join(" — "),
          })),
        },
      },
      5,
    );
  }

  // 8. Market snapshot — stat strip + a source line; omitted when null (never stale).
  if (data.snapshot) {
    push({ id: createBlock("stats").id, type: "stats", props: { stats: snapshotCells(data.snapshot) } }, 2);
    push(
      {
        id: createBlock("text").id,
        type: "text",
        props: { body: `Local market snapshot for ${data.snapshot.zip}, as of ${data.snapshot.asOf}. Source: SWFL Data Gulf.`, align: "left" },
      },
      2,
    );
  }

  // 9. Commentary — empty; the assembler (Task 6) authors + lints one paragraph in here.
  push(
    { id: createBlock("text").id, type: "text", props: { body: "", align: "left", caption: SHOWING_PREP_COMMENTARY_MARKER } },
    4,
  );

  // 10. Disclosure slot — empty image block (the drag-drop mechanic; Deviation #4).
  push(
    { id: createBlock("image").id, type: "image", props: { url: "", kind: "photo", alt: DISCLOSURE_LABEL, caption: DISCLOSURE_LABEL } },
    3,
  );

  // 11. Agent card — sticky.
  push(keepOrDefault(current, "agent-card"), 4);

  // 12. Footer — sticky, CAN-SPAM, static.
  push(keepOrDefault(current, "footer"), 3, { static: true });

  return { globalStyle: { ...current.globalStyle }, blocks };
}
```

> Implementer note: `ImageProps` has no `caption` restriction and `TextProps` does not declare `caption` — but block props are open options (types.ts: "props are options, never a required set"). If `EmailDocSchema` (`./doc/schema.ts`) strips an unknown `caption` off a `text` block, switch the commentary marker to a dedicated known field the schema keeps on `text` (e.g. detect the single empty `text` block with `align:"left"` and empty `body` positioned before the disclosure image), OR store the marker on the block `id` prefix (`createBlock("text")` then override `id` to start with `sp-commentary-`). Verify against `schema.ts` in Step 4; adjust the marker mechanism + the Task 6 finder together if needed.

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/showing-prep-doc.test.ts`
Expected: PASS. If a schema round-trip test elsewhere strips `caption` on `text`, apply the marker fallback from the implementer note and re-run.

- [ ] **Step 5: Commit**

```bash
git add lib/email/showing-prep-doc.ts lib/email/showing-prep-doc.test.ts
git commit -m "feat(email): coded-grid Showing Prep Packet builder (degrades every section)"
```

---

### Task 6: Commentary author + `lintAuthoredProse` gate + assembler

**Files:**
- Create: `lib/email/showing-prep-assemble.ts`
- Test: `lib/email/showing-prep-assemble.test.ts`

**Interfaces:**
- Consumes: `buildShowingPrepDoc`/`SHOWING_PREP_COMMENTARY_MARKER` (Task 5), `ShowingPrepData` (Task 4), `lintAuthoredProse` (`lib/email/author-doc.ts:920`), `getAnthropic`/`resolveEmailModel`/`agentsAreMocked` (existing).
- Produces: `async function assembleShowingPrepDoc(data: ShowingPrepData, current: EmailDoc): Promise<EmailDoc>`. This is the ONE entry both triggers (Task 8 pill route, Task 10 assistant branch) call. It builds the coded grid, authors one commentary paragraph from ONLY the real numbers on the packet, drops it into the marked block, and runs `lintAuthoredProse` (structural no-invention guarantee, Deviation #1) — any sentence with an unanchored number is stripped. Never throws; offline/no-key builds skip the AI paragraph entirely.

- [ ] **Step 1: Write the failing test**

Create `lib/email/showing-prep-assemble.test.ts`:

```ts
import { test, expect } from "bun:test";
import { assembleShowingPrepDoc } from "./showing-prep-assemble";
import { SHOWING_PREP_COMMENTARY_MARKER } from "./showing-prep-doc";
import { SEED_DOCS } from "./doc/default-docs";
import type { ShowingPrepData } from "@/lib/listings/showing-prep-source";

function currentDoc() {
  return SEED_DOCS.find((s) => s.id === "market-spotlight")!.build();
}

const DATA: ShowingPrepData = {
  address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
  subject: {
    address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
    city: "Fort Myers", state: "FL", zip: "33908",
    price: "$489,000", beds: "3", baths: "2", sqft: "1840",
    photos: [], sourceUrl: "https://www.swfldatagulf.com",
  },
  subjectPin: null, zip: "33908", comps: [], oneSheets: [], compPins: [],
  snapshot: { zip: "33908", monthsOfSupply: 2.1, activeInventory: 140, homesSold: 66, medianSalePrice: 489000, medianDom: 41, marketType: "Seller's market", asOf: "07/01/2026", lowSample: false },
  asOf: "07/08/2026",
};

test("commentary block never contains an unanchored number (lint gate)", async () => {
  // Force the author to fabricate — the injected model returns a bogus number.
  const doc = await assembleShowingPrepDoc(DATA, currentDoc(), {
    authorCommentary: async () => "This home is worth $999,999 with 12 offers pending.",
  });
  const c = doc.blocks.find((b) => b.type === "text" && b.props.caption === SHOWING_PREP_COMMENTARY_MARKER);
  const body = (c?.type === "text" && c.props.body) || "";
  expect(body).not.toContain("$999,999"); // stripped — never invented
  expect(body).not.toContain("12 offers");
});

test("commentary block keeps a paragraph whose numbers all anchor to the packet", async () => {
  const doc = await assembleShowingPrepDoc(DATA, currentDoc(), {
    authorCommentary: async () => "Listed at $489,000 in a market running 2.1 months of supply.",
  });
  const c = doc.blocks.find((b) => b.type === "text" && b.props.caption === SHOWING_PREP_COMMENTARY_MARKER);
  const body = (c?.type === "text" && c.props.body) || "";
  expect(body).toContain("$489,000");
  expect(body).toContain("2.1");
});

test("no-key / offline build skips the AI paragraph and still returns a valid doc", async () => {
  const doc = await assembleShowingPrepDoc(DATA, currentDoc(), { authorCommentary: async () => null });
  const c = doc.blocks.find((b) => b.type === "text" && b.props.caption === SHOWING_PREP_COMMENTARY_MARKER);
  expect(c?.type === "text" && c.props.body).toBe("");
  expect(doc.blocks.some((b) => b.type === "footer")).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/showing-prep-assemble.test.ts`
Expected: FAIL — `lib/email/showing-prep-assemble.ts` does not exist.

- [ ] **Step 3: Implement the minimal code**

Create `lib/email/showing-prep-assemble.ts`:

```ts
// lib/email/showing-prep-assemble.ts
//
// The ONE entry both Showing Prep triggers call (the project pill route + the
// assistant branch). Builds the coded grid (buildShowingPrepDoc), authors ONE
// commentary paragraph from ONLY the real numbers already on the packet, drops it
// into the marked block, and gates it with lintAuthoredProse — the block-level
// no-invention lint (Deviation #1: this is the structural guarantee, not an
// AI-virtue one; a sentence with any number NOT on the packet is stripped). Never
// throws; an offline / no-key build simply ships with the commentary blank.

import { buildShowingPrepDoc, SHOWING_PREP_COMMENTARY_MARKER } from "./showing-prep-doc";
import { lintAuthoredProse } from "./author-doc";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { resolveEmailModel } from "./model-router";
import { agentsAreMocked } from "@/refinery/agents/anthropic.mts";
import type { EmailDoc, EmailBlock } from "./doc/types";
import type { ShowingPrepData } from "@/lib/listings/showing-prep-source";

/** Every real number/string on the packet — the anchor set the commentary must not
 *  exceed. Nothing here is invented; each value came from a resolved lane. */
function packetAnchors(data: ShowingPrepData): string[] {
  const out: string[] = [];
  const s = data.subject;
  if (s) {
    if (s.price) out.push(s.price);
    if (s.beds) out.push(s.beds);
    if (s.baths) out.push(s.baths);
    if (s.sqft) out.push(s.sqft);
    if (s.address) out.push(s.address);
  }
  for (const c of data.comps) {
    if (c.price != null) out.push(String(c.price));
    if (c.beds != null) out.push(String(c.beds));
    if (c.baths != null) out.push(String(c.baths));
    if (c.sqft != null) out.push(String(c.sqft));
  }
  const snap = data.snapshot;
  if (snap) {
    out.push(String(snap.monthsOfSupply));
    if (snap.activeInventory != null) out.push(String(snap.activeInventory));
    if (snap.homesSold != null) out.push(String(snap.homesSold));
    if (snap.medianSalePrice != null) out.push(String(snap.medianSalePrice));
    if (snap.medianDom != null) out.push(String(snap.medianDom));
    if (snap.marketType) out.push(snap.marketType);
    out.push(snap.zip);
  }
  return out;
}

/** Default commentary author — one Haiku call, facts-only system prompt. Returns
 *  null on no key / mock / any failure (the lint is the hard guard regardless). */
async function defaultAuthorCommentary(data: ShowingPrepData): Promise<string | null> {
  if (agentsAreMocked()) return null;
  const anchors = packetAnchors(data);
  if (anchors.length === 0) return null;
  try {
    const client = getAnthropic("email_build");
    const res = await client.messages.create({
      model: resolveEmailModel("haiku"),
      max_tokens: 300,
      system:
        "You write ONE short paragraph of connective prose for a real-estate agent's " +
        "internal showing-prep document. Use ONLY the facts provided. Do NOT state any " +
        "number, price, or statistic that is not in the facts. No hype, no invented " +
        "claims, no source names, plain text.",
      messages: [
        {
          role: "user",
          content: `Facts you may use (quote numbers verbatim):\n${anchors.join("\n")}\n\nWrite one paragraph tying the subject to the comps and the local market.`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : null;
  } catch {
    return null;
  }
}

/** Drop `paragraph` into the marked commentary text block. */
function fillCommentary(doc: EmailDoc, paragraph: string): EmailDoc {
  const blocks = doc.blocks.map((b): EmailBlock => {
    if (b.type === "text" && (b.props as { caption?: string }).caption === SHOWING_PREP_COMMENTARY_MARKER) {
      return { ...b, props: { ...b.props, body: paragraph.slice(0, 2000) } };
    }
    return b;
  });
  return { ...doc, blocks };
}

export interface AssembleDeps {
  /** Injectable author — tests pass a stub; default is the Haiku call. */
  authorCommentary?: (data: ShowingPrepData) => Promise<string | null>;
}

export async function assembleShowingPrepDoc(
  data: ShowingPrepData,
  current: EmailDoc,
  deps: AssembleDeps = {},
): Promise<EmailDoc> {
  let doc = buildShowingPrepDoc(data, current);

  const author = deps.authorCommentary ?? defaultAuthorCommentary;
  const paragraph = await author(data).catch(() => null);
  if (paragraph) {
    doc = fillCommentary(doc, paragraph);
    // Structural no-invention gate: strip any sentence with a number NOT on the packet.
    const anchors = packetAnchors(data);
    doc = lintAuthoredProse(doc, anchors).stripped;
  }
  return doc;
}
```

> Implementer note: confirm `resolveEmailModel`'s accepted argument (`lib/email/model-router.ts`) — the flyer path uses an `EMAIL_MODEL_HAIKU` constant. If `resolveEmailModel` takes no `"haiku"` string, import and use the same Haiku constant `build-doc.ts` uses (do not add a new model id — verify against the model-router). This is the one vendor-surface (model id) to confirm in-session per RULE 0.4.

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/showing-prep-assemble.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/showing-prep-assemble.ts lib/email/showing-prep-assemble.test.ts
git commit -m "feat(email): assemble + lint-gate the Showing Prep Packet commentary"
```

---

### Task 7: Accept `kind:"showing-prep"` on project create

**Files:**
- Modify: `app/api/projects/route.ts:43`
- Test: `app/api/projects/route.test.ts` (new — thin unit test of the kind mapping, if a route test harness exists; else fold the assertion into Task 11's build verification)

**Interfaces:**
- Produces: `POST /api/projects` now maps `body.kind === "showing-prep"` to a stored `kind:"showing-prep"` (same `subject_address` handling as `"listing"`). Task 8's route reads a project of this kind.

- [ ] **Step 1: Implement the change**

In `app/api/projects/route.ts`, replace the `kind` line (currently line 43) and extend the address-parse guard to cover both address-bearing kinds:

```ts
  // `kind` is distinct from `project_type`. "listing" markets a listing to buyers;
  // "showing-prep" is the agent's own internal showing prep document. Both anchor a
  // subject_address; anything else (incl. absent/bogus) is "general".
  const kind =
    body?.kind === "listing" ? "listing" : body?.kind === "showing-prep" ? "showing-prep" : "general";
  const typedAddress =
    typeof body?.subject_address === "string" ? body.subject_address.trim() || null : null;
  const subject_address =
    kind !== "general" && !typedAddress && title ? extractAddress(title) : typedAddress;
```

- [ ] **Step 2: Verify the typecheck + any existing route test**

Run: `bun test app/api/projects` (runs any existing route tests; skips cleanly if none)
Run: `bunx next build` deferred to Task 11 — for now confirm no TS error in this file via your editor/LSP.
Expected: no regression; the `"listing"` path is byte-identical, `"showing-prep"` now stored.

- [ ] **Step 3: Commit**

```bash
git add app/api/projects/route.ts
git commit -m "feat(projects): accept kind:showing-prep on create"
```

---

### Task 8: Build + persist route (the pill's build step)

**Files:**
- Create: `app/api/projects/[id]/showing-prep/route.ts`

**Interfaces:**
- Consumes: `assembleShowingPrepDoc` (Task 6). Mirrors `app/api/projects/[id]/ai-material/route.ts`'s persist shape exactly (service-role insert into `deliverables`, `template:"block-canvas"`, `narrative:EMPTY_NARRATIVE`, `items_snapshot:[]`).
- Produces: `POST /api/projects/[id]/showing-prep` → builds the packet from the project's `subject_address` and inserts a `block-canvas` deliverable; returns `{ id }`. Task 9's pill calls it.

- [ ] **Step 1: Implement the route**

Create `app/api/projects/[id]/showing-prep/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { seedById } from "@/lib/email/doc/default-docs";
import { gatherShowingPrepData } from "@/lib/listings/showing-prep-source";
import { assembleShowingPrepDoc } from "@/lib/email/showing-prep-assemble";

export const runtime = "nodejs";
export const maxDuration = 30;

const EMPTY_NARRATIVE = { exec_summary: "", sections: [], inference_notes: [] };

/**
 * POST /api/projects/[id]/showing-prep — build the Showing Prep Packet for a
 * project's subject_address and persist it as a block-canvas deliverable. Never a
 * dead end: an unresolved address still builds an address-only skeleton.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: project } = await db
    .from("projects")
    .select("id, subject_address")
    .eq("id", id)
    .single();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const address = (project.subject_address as string | null) ?? "";

  // Start from the standard branded seed (sticky header/agent-card/footer/globalStyle),
  // then build the packet grid over it. Never throws — every lane degrades.
  const current = seedById("market-spotlight")!.build();
  const data = await gatherShowingPrepData(address);
  const doc = await assembleShowingPrepDoc(data, current);

  const newId = crypto.randomUUID();
  const admin = createServiceRoleClient();
  const { error } = await admin.from("deliverables").insert({
    id: newId,
    project_id: id,
    user_id: user.id,
    template: "block-canvas",
    doc,
    data_as_of: new Date().toISOString(),
    narrative: EMPTY_NARRATIVE,
    items_snapshot: [],
    status: "ready",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: newId }, { status: 201 });
}
```

> Implementer note: confirm `seedById("market-spotlight")` exists (the ai-material route uses `seedById(pickSeedId(...))`). If `"market-spotlight"` is not a valid seed id, use the same default seed the ai-material route falls back to (read `./pick-seed.ts`). The seed only supplies sticky brand blocks; the packet overwrites the body.

- [ ] **Step 2: Verify**

Deferred to Task 11 (`bunx next build`). Confirm no TS errors in your editor.

- [ ] **Step 3: Commit**

```bash
git add "app/api/projects/[id]/showing-prep/route.ts"
git commit -m "feat(projects): build+persist route for the Showing Prep Packet"
```

---

### Task 9: The homepage/project pill

**Files:**
- Create: `app/project/ShowingPrepButton.tsx`
- Modify: wherever `NewListingButton` is rendered (grep: `NewListingButton`) — add `<ShowingPrepButton />` beside it.

**Interfaces:**
- Consumes: `POST /api/projects` (Task 7) + `POST /api/projects/[id]/showing-prep` (Task 8). Near-copy of `NewListingButton.tsx`: one address input → create the `showing-prep` project → trigger the build → route to the new deliverable (or `projectHome(id)`).

- [ ] **Step 1: Implement the component**

Create `app/project/ShowingPrepButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { projectHome } from "@/lib/project/tool-tabs";

/**
 * Showing Prep entry. Creates a project with kind:"showing-prep" anchored to an
 * address, immediately builds the packet (comps + subject + market snapshot), and
 * routes to the project. The address is required here (unlike New Listing) — the
 * packet is address-driven — but a bad/out-of-footprint address still builds an
 * address-only skeleton, never an error.
 */
export function ShowingPrepButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const subject = address.trim();
    if (!subject) return;
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: subject, kind: "showing-prep", subject_address: subject }),
      });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id?: string };
      if (!id) return;
      // Build the packet, then land on the project.
      await fetch(`/api/projects/${id}/showing-prep`, { method: "POST" }).catch(() => null);
      router.push(projectHome(id));
    } catch {
      // leave the form open so the user can retry
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-gulf-teal px-4 py-2 text-sm font-medium text-gulf-teal transition-opacity hover:opacity-90"
      >
        Showing prep
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void create();
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Showing address"
        aria-label="Showing address"
        autoFocus
        className="rounded-full border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-gulf-teal focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-gulf-teal px-4 py-2 text-sm font-medium text-[#04121b] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Building…" : "Build packet"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Wire it beside `NewListingButton`**

Run: `Grep "NewListingButton" app` to find the render site. In that file, import and render `<ShowingPrepButton />` next to `<NewListingButton />` (same container). Show the exact edit in the commit.

- [ ] **Step 3: Verify** — deferred to Task 11 (`bunx next build`).

- [ ] **Step 4: Commit**

```bash
git add app/project/ShowingPrepButton.tsx <the render-site file>
git commit -m "feat(project): Showing Prep pill — one-click packet from an address"
```

---

### Task 10: Conversational trigger (assistant branch)

**Files:**
- Modify: `app/api/email-lab/ai/route.ts`

**Interfaces:**
- Consumes: `isShowingPrepPrompt` (Task 1), `gatherShowingPrepData` (Task 4), `assembleShowingPrepDoc` (Task 6). Adds a branch BEFORE the existing `authorDoc`/`buildContentDoc` dispatch: when the prompt is a showing-prep ask and carries an address (`body.scope?.address`, or an address parsed from the prompt), build the packet and return it as the doc payload — same response shape the canvas already consumes. Does NOT touch `build-doc.ts` (parallel-session claimed).

- [ ] **Step 1: Implement the branch**

In `app/api/email-lab/ai/route.ts`, add imports:

```ts
import { isShowingPrepPrompt } from "@/lib/email/showing-prep-intent";
import { gatherShowingPrepData } from "@/lib/listings/showing-prep-source";
import { assembleShowingPrepDoc } from "@/lib/email/showing-prep-assemble";
import { EmailDocSchema } from "@/lib/email/doc/schema";
```

In the `POST` handler, immediately before the existing `isAuthor ? authorDoc(...) : buildContentDoc(...)` dispatch, insert:

```ts
    // Showing Prep Packet — a dedicated build path (not authorDoc). Fires only on the
    // showing-prep recipe with a subject address; returns the coded packet doc.
    const spAddress =
      (typeof body.scope?.address === "string" && body.scope.address.trim()) || "";
    if (isShowingPrepPrompt(prompt) && spAddress) {
      const current = EmailDocSchema.safeParse(body.doc);
      const base = current.success ? current.data : seedById("market-spotlight")!.build();
      const data = await gatherShowingPrepData(spAddress);
      const doc = await assembleShowingPrepDoc(data, base);
      return NextResponse.json({ applied: true, doc });
    }
```

> Implementer note: match the exact success-response shape this route already returns for `authorDoc` (read the handler — it likely returns `{ httpStatus, payload }` and `NextResponse.json(payload, { status })`, where `payload` carries `{ applied, doc }`). Mirror it precisely; the snippet above is the intent, not necessarily the literal return. Confirm `seedById` is already imported here (the route seeds elsewhere) or import it. `body.scope?.address` is the same field the New-Listing address lane reads.

- [ ] **Step 2: Verify** — deferred to Task 11 (`bunx next build`), plus a manual assistant test in Task 11.

- [ ] **Step 3: Commit**

```bash
git add app/api/email-lab/ai/route.ts
git commit -m "feat(email-lab): assistant builds a Showing Prep Packet on request"
```

---

### Task 11: Full verification, SESSION_LOG, check

**Files:** `SESSION_LOG.md`, `_AUDIT_AND_ROADMAP/build-queue.md`

- [ ] **Step 1: Full test suite**

Run: `bun test`
Expected: all green, including every new `showing-prep-*` / `market-snapshot` / `listings-map` test.

- [ ] **Step 2: Vercel-truth typecheck**

Run: `bunx next build`
Expected: clean build, no type errors.

- [ ] **Step 3: SESSION_LOG entry (before push)**

Append a top-of-file entry to `SESSION_LOG.md`: shipped the Showing Prep Packet as a dedicated coded-grid build path (subject + comps grid + best-effort comp map + best-effort per-comp one-sheets + housing-swfl per-ZIP snapshot + lint-gated commentary + disclosure slot), pill + assistant triggers, persisted as block-canvas. Record the four deviations from the spec (lintAuthoredProse gate not gateNarrative; housing-swfl not market-heat-swfl; best-effort map/photos degrade; image-block disclosure slot) and the fast-follows (native PDF-drop block + extraction; comp-photo lane cost; pending-count needs a housing-swfl pack change).

- [ ] **Step 4: Sync the build queue + commit**

```bash
git add SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs: SESSION_LOG — Showing Prep Packet shipped (dedicated coded-grid path)"
```

- [ ] **Step 5: Push (operator-confirmed per house rules), then close the offline portion of the check**

Push via `node scripts/safe-push.mjs` (only after operator confirmation — no autonomous push). Then:

Run: `node scripts/check.mjs close showing_prep_packet_live_verify`

Note: this closes the OFFLINE-verified portion. The LIVE verify — build a packet for one real Lee address and one real Collier address, confirm the packet renders on the grid, the map shows the subject (+ any resolved comps), one-sheets appear for photo-enriched comps, the snapshot section shows/omits correctly, the commentary carries no invented number, and the disclosure slot accepts a drop — is operator-run (it spends live SteadyAPI/Mapbox/Anthropic calls; do not simulate it or spend paid credits without approval). Leave a fresh `checks` entry open for the live verify if it can't be run in this session (no silent deferral, RULE 2.4).

---

## Self-review

- **Spec coverage:** problem (agent showing prep) → the whole packet path; v1 data scope (comps + subject) → Tasks 4/5; disclosure upload → Task 5 slot (Deviation #4); new project kind → Task 7; persisted project through the real render path → Tasks 8 + block-canvas + `renderEmailDocHtml`; conversational + pill triggers → Tasks 9/10; comp map + one-sheets + market snapshot → Tasks 2/3/4/5 (best-effort per Deviation #3); error handling "empty cell never broken" → every degrade branch in Tasks 4/5; testing → each task's `bun test` + Task 11.
- **Corrections vs spec:** four deviations documented up front, each verified against source — market source (housing-swfl), gate mechanism (lintAuthoredProse), map/photo feasibility (best-effort), disclosure block (image slot).
- **Type consistency:** `ShowingPrepData`/`CompOneSheet`/`MapPin`/`MarketSnapshot`/`RenderComp`/`ListingFacts` names and shapes are used identically across Tasks 2–6; `SHOWING_PREP_COMMENTARY_MARKER` is defined in Task 5 and consumed in Task 6.
- **Open implementer confirmations (in-session, cheap):** `asOfFromToken` format (2b); `EmailDocSchema` keeping the `text.caption` marker (5); `resolveEmailModel` Haiku arg (6); `seedById("market-spotlight")` validity (8); the email-lab route's exact success-response shape (10); Mapbox multi-marker/`auto` contract via crawl4ai (3). None block the plan; each is a verify-then-adjust step already written into its task.
