# Why Isn't It Selling v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 26 files, keywords: migration, schema, architecture

**Goal:** Ship the free seller diagnostic — a deterministic check engine over our own lake, a public `/r/why-isnt-it-selling` route, and a dark-shipped watch store — per spec `docs/superpowers/specs/2026-07-19-why-isnt-it-selling-design.md`.

**Architecture:** Pure check functions (`lib/why-not-selling/checks/*`) take injected rows and return `CheckResult`s; a server loader assembles inputs from `data_lake.listing_dom`, three new SQL functions, the parcel tables, `zhvi_swfl`, published brain output, and `listing_transitions`; the route mirrors the back-on-market report shell. Watches are stored in `public.report_watches` (RLS deny-all); no email sends in v1 (dark gate).

**Tech Stack:** Next.js App Router (server components), Supabase service-role (untyped for `data_lake`), Postgres SQL functions, bun:test, `bun scripts/run-migration.ts` for migrations.

## Global Constraints

- **No invented numbers.** Every rendered figure carries `{ source, asOf }`; a missing input makes the check `unavailable` (omitted), never guessed.
- **As-of dates render MM/DD/YYYY.**
- **DOM wording goes through `formatDom` / `formatSoldSpell` (`lib/listings/dom.ts`) — no other file composes DOM phrasing.**
- **ZHVI is labeled "typical home value", NEVER "median"** (data-roots T2).
- **No system nouns on the page** (no brain ids, no table names, no "master").
- **Layout uses `h-full`/`dvh`, never `h-screen`.**
- **`data_lake` reads use `createServiceRoleClientUntyped()`** (`@/utils/supabase/service-role`) — the typed client does not cover that schema.
- **Empty-tolerant everywhere:** any read error → null → check omitted; never throw to the page.
- **Agent opt-in checkbox defaults OFF** (explicit opt-IN; consent text + timestamp stored).
- **Email sending is DARK in v1:** no send call anywhere; `wins_watch_email_live` gates the wire-up later.
- **Subject-home reads are Lee/Collier only** (`isCoreScope`); Hendry gets no subject read.
- **Migrations are idempotent** (`CREATE OR REPLACE` / `IF NOT EXISTS`), applied via `bun scripts/run-migration.ts docs/sql/<file>.sql`.
- **Git: stage explicit paths only** (parallel sessions share the index). Commit per task; NO push (operator pushes after review).
- **Judgment constants are documented at the definition site** (flag thresholds, sample floors) — they are design values from the spec, not derived data.

## File Structure

```
docs/sql/20260719_wins_functions.sql        3 SQL functions over listing_dom
docs/sql/20260719_report_watches.sql        watch table + RLS
lib/listings/typed-address.ts               "#x" -> "Unit x" normalizer (extracted copy #2)
lib/why-not-selling/types.ts                CheckResult/SubjectHome/input shapes
lib/why-not-selling/checks/market-speed.ts  check 1
lib/why-not-selling/checks/cumulative-time.ts  check 2
lib/why-not-selling/checks/price-cuts.ts    check 3
lib/why-not-selling/checks/price-position.ts   check 4
lib/why-not-selling/checks/anchor-gap.ts    check 5
lib/why-not-selling/checks/competition.ts   check 6
lib/why-not-selling/checks/cross-check.ts   check 7
lib/why-not-selling/cut-history.ts          listing_transitions cut events read
lib/why-not-selling/parcel-read.ts          lee_parcels/collier_parcels sale fact
lib/why-not-selling/zhvi-change.ts          zhvi_swfl % change since purchase
lib/why-not-selling/watch-store.ts          pure watch create/confirm/unsubscribe
lib/why-not-selling/load-report.ts          server loader assembling WinsReport
app/r/_components/resolve-q.ts             resolveQToZip extracted (copy #2)
app/r/why-isnt-it-selling/page.tsx          the route
components/why-not-selling/WinsRead.tsx     render checks + honesty block + watch form
app/api/report-watch/route.ts               POST create watch
app/api/report-watch/confirm/route.ts       GET confirm
app/api/report-watch/unsubscribe/route.ts   GET unsubscribe
```

Each `checks/*.ts` file has a sibling `.test.ts`. All lib tests are `bun:test`.

---

### Task 1: SQL — three functions + watch table

**Files:**
- Create: `docs/sql/20260719_wins_functions.sql`
- Create: `docs/sql/20260719_report_watches.sql`

**Interfaces:**
- Produces (RPC row shapes later tasks rely on):
  - `zip_band_dom_median(p_zip text)` → rows `{ band: number, price_lo: number, price_hi: number, median_dom: number|null, sample_size: number }`
  - `zip_active_stale_share(p_zip text)` → one row `{ active_count: number, exact_count: number, over_90: number, over_180: number }`
  - `zip_price_position(p_zip text, p_price numeric, p_ppsf numeric)` → one row `{ price_pctile: number|null, ppsf_pctile: number|null, price_n: number, ppsf_n: number }`
  - `public.report_watches` table.

- [ ] **Step 1: Write `docs/sql/20260719_wins_functions.sql`**

```sql
-- docs/sql/20260719_wins_functions.sql
-- Why Isn't It Selling v1 — read-time aggregates over data_lake.listing_dom.
-- Floored rows are EXCLUDED from every median/percentile denominator that claims
-- "typical" (they are lower bounds; including them understates typical DOM).
-- Apply: bun scripts/run-migration.ts docs/sql/20260719_wins_functions.sql

CREATE OR REPLACE FUNCTION data_lake.zip_band_dom_median(p_zip text)
RETURNS TABLE (band int, price_lo numeric, price_hi numeric, median_dom numeric, sample_size bigint)
LANGUAGE sql STABLE AS $$
  WITH active AS (
    SELECT list_price::numeric AS price, dom_days, dom_is_floor
    FROM data_lake.listing_dom
    WHERE sale_or_rent = 'sale' AND state = 'active' AND zip_code = p_zip
      AND list_price IS NOT NULL AND list_price > 0
  ), banded AS (
    SELECT ntile(5) OVER (ORDER BY price) AS band, price, dom_days, dom_is_floor FROM active
  )
  SELECT band, min(price), max(price),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY dom_days)
      FILTER (WHERE dom_is_floor = false AND dom_days IS NOT NULL),
    count(*) FILTER (WHERE dom_is_floor = false AND dom_days IS NOT NULL)
  FROM banded GROUP BY band ORDER BY band;
$$;

CREATE OR REPLACE FUNCTION data_lake.zip_active_stale_share(p_zip text)
RETURNS TABLE (active_count bigint, exact_count bigint, over_90 bigint, over_180 bigint)
LANGUAGE sql STABLE AS $$
  SELECT count(*),
         count(*) FILTER (WHERE dom_is_floor = false AND dom_days IS NOT NULL),
         count(*) FILTER (WHERE dom_is_floor = false AND dom_days >= 90),
         count(*) FILTER (WHERE dom_is_floor = false AND dom_days >= 180)
  FROM data_lake.listing_dom
  WHERE sale_or_rent = 'sale' AND state = 'active' AND zip_code = p_zip;
$$;

CREATE OR REPLACE FUNCTION data_lake.zip_price_position(p_zip text, p_price numeric, p_ppsf numeric)
RETURNS TABLE (price_pctile numeric, ppsf_pctile numeric, price_n bigint, ppsf_n bigint)
LANGUAGE sql STABLE AS $$
  WITH active AS (
    SELECT list_price::numeric AS price,
           CASE WHEN sqft IS NOT NULL AND sqft > 0
                THEN list_price::numeric / sqft ELSE NULL END AS ppsf
    FROM data_lake.listing_dom
    WHERE sale_or_rent = 'sale' AND state = 'active' AND zip_code = p_zip
      AND list_price IS NOT NULL AND list_price > 0
  )
  SELECT
    CASE WHEN count(*) > 0 AND p_price IS NOT NULL
         THEN round(100.0 * count(*) FILTER (WHERE price <= p_price) / count(*), 0) END,
    CASE WHEN count(ppsf) > 0 AND p_ppsf IS NOT NULL
         THEN round(100.0 * count(*) FILTER (WHERE ppsf IS NOT NULL AND ppsf <= p_ppsf) / count(ppsf), 0) END,
    count(*), count(ppsf)
  FROM active;
$$;

GRANT EXECUTE ON FUNCTION data_lake.zip_band_dom_median(text) TO service_role;
GRANT EXECUTE ON FUNCTION data_lake.zip_active_stale_share(text) TO service_role;
GRANT EXECUTE ON FUNCTION data_lake.zip_price_position(text, numeric, numeric) TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Write `docs/sql/20260719_report_watches.sql`**

```sql
-- docs/sql/20260719_report_watches.sql
-- Watch store for the Why Isn't It Selling report. RLS deny-all: RLS enabled with
-- ZERO policies — only service_role (bypasses RLS) touches it. Sending is DARK in
-- v1; rows accumulate unconfirmed until wins_watch_email_live closes.
-- Apply: bun scripts/run-migration.ts docs/sql/20260719_report_watches.sql
CREATE TABLE IF NOT EXISTS public.report_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  address_key text NOT NULL,
  zip text NOT NULL,
  query_text text NOT NULL,
  confirm_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  last_sent_at timestamptz,
  agent_optin_at timestamptz,
  consent_text text,
  UNIQUE (email, address_key)
);
ALTER TABLE public.report_watches ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.report_watches TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Apply both migrations**

Run: `bun scripts/run-migration.ts docs/sql/20260719_wins_functions.sql && bun scripts/run-migration.ts docs/sql/20260719_report_watches.sql`
Expected: both apply without error. Run each a SECOND time — must also succeed (idempotent).

- [ ] **Step 4: Verify live with one probe each**

Run (via the Supabase MCP or a Bun.SQL scratch script):
`SELECT * FROM data_lake.zip_band_dom_median('33914');` → 5 rows, bands 1–5, sample sizes > 0.
`SELECT * FROM data_lake.zip_active_stale_share('33914');` → one row, active_count > 0.
`SELECT * FROM data_lake.zip_price_position('33914', 500000, 300);` → one row with percentiles.
`SELECT count(*) FROM public.report_watches;` → 0.

- [ ] **Step 5: Commit**

```bash
git add docs/sql/20260719_wins_functions.sql docs/sql/20260719_report_watches.sql
git commit -m "feat(wins): SQL aggregates over listing_dom + report_watches store" -- docs/sql/20260719_wins_functions.sql docs/sql/20260719_report_watches.sql
```

---

### Task 2: typed-address extraction + engine types

**Files:**
- Create: `lib/listings/typed-address.ts`, `lib/listings/typed-address.test.ts`
- Modify: `lib/back-on-market/relist-fact.ts` (repoint its internal `#x → Unit x` normalization to the new module; behavior unchanged)
- Create: `lib/why-not-selling/types.ts`

**Interfaces:**
- Produces: `normalizeTypedUnits(street: string): string` — rewrites `#201` → `Unit 201` before `addressKey` derivation (the relist-fact round-trip rule; this is copy #2, so it extracts).
- Produces (used by every later task):

```ts
export type CheckStatus = "flag" | "clear" | "unavailable";
export interface CheckFigure { label: string; value: string; source: string; asOf: string; }
export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  headline: string | null; // null iff unavailable
  detail: string | null;
  figures: CheckFigure[];
}
export interface SubjectHome {
  addressKey: string; display: string; zip: string;
  city: string | null; county: string | null;
  listPrice: number | null; sqft: number | null;
  domDays: number | null; domIsFloor: boolean; cdomDays: number | null;
  listedDate: string | null; propertyId: string | null; status: string | null;
}
export interface ZipDomMedian { medianDom: number; sampleSize: number; asOf: string; }
export interface BandRow { band: number; priceLo: number; priceHi: number; medianDom: number | null; sampleSize: number; }
export interface StaleShare { activeCount: number; exactCount: number; over90: number; over180: number; asOf: string; }
export interface PricePosition { pricePctile: number | null; ppsfPctile: number | null; priceN: number; ppsfN: number; }
export interface ParcelFact { salePrice: number; saleYear: number; saleMonth: number; yearBuilt: number | null; livingAreaSqft: number | null; county: "Lee" | "Collier"; }
export interface ZhviChange { pctChange: number; fromMdy: string; asOf: string; }
export interface CutEvent { at: string; price: number; delta: number; }
/** Shared sample floor: a ZIP aggregate below this many exact rows is suppressed. Judgment value (spec §checks). */
export const MIN_ZIP_SAMPLE = 8;
/** Band aggregates tolerate a smaller floor (quintiles of one ZIP). Judgment value. */
export const MIN_BAND_SAMPLE = 5;
```

- [ ] **Step 1: Write the failing test** (`lib/listings/typed-address.test.ts`)

```ts
import { test, expect } from "bun:test";
import { normalizeTypedUnits } from "./typed-address";

test("rewrites #-form units to Unit-form", () => {
  expect(normalizeTypedUnits("14977 Rivers Edge Ct #217")).toBe("14977 Rivers Edge Ct Unit 217");
  expect(normalizeTypedUnits("15756 Modena St")).toBe("15756 Modena St");
  expect(normalizeTypedUnits("100 Main St # 5")).toBe("100 Main St Unit 5");
});
```

- [ ] **Step 2: Run it** — `bun test lib/listings/typed-address.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** (`lib/listings/typed-address.ts`)

```ts
// lib/listings/typed-address.ts — the ONE "#x -> Unit x" boundary normalizer for
// user-TYPED addresses. Extracted from lib/back-on-market/relist-fact.ts (copy #2:
// the Why Isn't It Selling loader needs the identical round-trip). The stored
// address_key derives from the vendor permalink's word-form unit ("UNIT201");
// addressKey matches neither "#201" nor "# 201", so typed input rewrites first.
export function normalizeTypedUnits(street: string): string {
  return street.replace(/#\s*(\w+)/g, "Unit $1").replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Repoint relist-fact** — in `lib/back-on-market/relist-fact.ts`, replace its inline `#x → Unit x` replacement with `normalizeTypedUnits(...)` imported from `@/lib/listings/typed-address`. Read the file first; the normalization sits where the typed street is prepared before `addressKey(street, zip)`. Keep the docstring, note the extraction.

- [ ] **Step 5: Write `lib/why-not-selling/types.ts`** exactly as the Interfaces block above (with the file-header comment `// lib/why-not-selling/types.ts — shared shapes for the Why Isn't It Selling check engine.`).

- [ ] **Step 6: Run** `bun test lib/listings/typed-address.test.ts lib/back-on-market` → all PASS (relist-fact's existing tests still green).

- [ ] **Step 7: Commit**

```bash
git add lib/listings/typed-address.ts lib/listings/typed-address.test.ts lib/back-on-market/relist-fact.ts lib/why-not-selling/types.ts
git commit -m "feat(wins): typed-unit normalizer extracted (copy #2) + check engine types" -- lib/listings/typed-address.ts lib/listings/typed-address.test.ts lib/back-on-market/relist-fact.ts lib/why-not-selling/types.ts
```

---

### Task 3: checks 1–2 — market speed + cumulative time

**Files:**
- Create: `lib/why-not-selling/checks/market-speed.ts` + `market-speed.test.ts`
- Create: `lib/why-not-selling/checks/cumulative-time.ts` + `cumulative-time.test.ts`

**Interfaces:**
- Consumes: `formatDom` from `@/lib/listings/dom`; types from `../types`.
- Produces:
  - `marketSpeed(subject: SubjectHome, zipMedian: ZipDomMedian | null, bands: BandRow[] | null): CheckResult`
  - `cumulativeTime(subject: SubjectHome, relist: { date: string; daysOffMarket: number } | null): CheckResult` (relist shape = the `RelistFact` fields the check needs)

**Rules (from spec):** speed flags when `domDays >= 1.5 × medianDom` with `sampleSize >= MIN_ZIP_SAMPLE`; the subject's own band figure renders only when that band's `sampleSize >= MIN_BAND_SAMPLE`. DOM phrases come from `formatDom` verbatim. Cumulative flags when `cdomDays - domDays >= 14` (the same story-changing threshold `formatDom` uses). Missing inputs → `unavailable`.

- [ ] **Step 1: Write failing tests** (`market-speed.test.ts`)

```ts
import { test, expect } from "bun:test";
import { marketSpeed } from "./market-speed";
import { formatDom } from "../../listings/dom";
import type { SubjectHome, ZipDomMedian, BandRow } from "../types";

const subject = (over: Partial<SubjectHome> = {}): SubjectHome => ({
  addressKey: "15756MODENAST:34114", display: "15756 Modena St", zip: "34114",
  city: "Naples", county: "Collier", listPrice: 600000, sqft: 2000,
  domDays: 212, domIsFloor: false, cdomDays: 212, listedDate: "2025-12-19",
  propertyId: "1", status: "for_sale", ...over,
});
const median: ZipDomMedian = { medianDom: 102, sampleSize: 900, asOf: "07/19/2026" };
const bands: BandRow[] = [
  { band: 3, priceLo: 550000, priceHi: 700000, medianDom: 120, sampleSize: 40 },
];

test("flags a home sitting 1.5x the ZIP typical; headline uses formatDom wording", () => {
  const r = marketSpeed(subject(), median, bands);
  expect(r.status).toBe("flag");
  expect(r.headline).toContain(formatDom({ domDays: 212, isFloor: false })!);
  expect(r.figures.some((f) => f.value.includes("102"))).toBe(true);
});

test("clear when at/below typical", () => {
  expect(marketSpeed(subject({ domDays: 60, cdomDays: 60 }), median, bands).status).toBe("clear");
});

test("unavailable when the ZIP sample is under the floor", () => {
  const r = marketSpeed(subject(), { ...median, sampleSize: 3 }, null);
  expect(r.status).toBe("unavailable");
  expect(r.figures.length).toBe(0);
});

test("floored subject renders the honest floor phrase", () => {
  const r = marketSpeed(subject({ domIsFloor: true }), median, bands);
  expect(r.headline).toContain("212+");
});
```

(`cumulative-time.test.ts`)

```ts
import { test, expect } from "bun:test";
import { cumulativeTime } from "./cumulative-time";
import type { SubjectHome } from "../types";

const subject = (dom: number, cdom: number): SubjectHome => ({
  addressKey: "K:33904", display: "123 SE 10th Pl", zip: "33904", city: "Cape Coral",
  county: "Lee", listPrice: 400000, sqft: 1500, domDays: dom, domIsFloor: false,
  cdomDays: cdom, listedDate: "2026-06-01", propertyId: "2", status: "for_sale",
});

test("flags a relist hiding 14+ prior days; both numbers in figures", () => {
  const r = cumulativeTime(subject(12, 140), { date: "06/01/2026", daysOffMarket: 21 });
  expect(r.status).toBe("flag");
  expect(r.figures.some((f) => f.value.includes("140"))).toBe(true);
});

test("clear when cumulative ~= current", () => {
  expect(cumulativeTime(subject(60, 60), null).status).toBe("clear");
});

test("unavailable when cdom unknown", () => {
  expect(cumulativeTime(subject(60, null as unknown as number), null).status).toBe("unavailable");
});
```

- [ ] **Step 2: Run** `bun test lib/why-not-selling/checks` → FAIL (modules missing).

- [ ] **Step 3: Implement both checks.** Shape (market-speed shown; cumulative-time follows the same pattern):

```ts
// lib/why-not-selling/checks/market-speed.ts — check 1: subject DOM vs the ZIP's
// typical (exact-only median) and the subject's own price band. DOM wording via
// formatDom ONLY. Flag threshold 1.5x is a spec judgment value.
import { formatDom } from "../../listings/dom";
import { MIN_BAND_SAMPLE, MIN_ZIP_SAMPLE } from "../types";
import type { BandRow, CheckResult, SubjectHome, ZipDomMedian } from "../types";

const SPEED_FLAG_RATIO = 1.5;

export function marketSpeed(
  subject: SubjectHome, zipMedian: ZipDomMedian | null, bands: BandRow[] | null,
): CheckResult {
  const base = { id: "market-speed", title: "Market speed" };
  const domPhrase = formatDom({ domDays: subject.domDays, isFloor: subject.domIsFloor, cdomDays: subject.cdomDays });
  if (!domPhrase || !zipMedian || zipMedian.sampleSize < MIN_ZIP_SAMPLE) {
    return { ...base, status: "unavailable", headline: null, detail: null, figures: [] };
  }
  const figures = [
    { label: "This home", value: domPhrase, source: "SWFL Data Gulf", asOf: zipMedian.asOf },
    { label: `Typical in ${subject.zip} (active listings)`, value: `${Math.round(zipMedian.medianDom)} days`, source: "SWFL Data Gulf", asOf: zipMedian.asOf },
  ];
  const band = subject.listPrice != null && bands
    ? bands.find((b) => subject.listPrice! >= b.priceLo && subject.listPrice! <= b.priceHi) : undefined;
  if (band && band.medianDom != null && band.sampleSize >= MIN_BAND_SAMPLE) {
    figures.push({ label: "Homes priced like this one here", value: `${Math.round(band.medianDom)} days typical`, source: "SWFL Data Gulf", asOf: zipMedian.asOf });
  }
  const flagged = subject.domDays != null && subject.domDays >= SPEED_FLAG_RATIO * zipMedian.medianDom;
  return {
    ...base,
    status: flagged ? "flag" : "clear",
    headline: flagged
      ? `${domPhrase} — typical for an active listing in ${subject.zip} is ${Math.round(zipMedian.medianDom)} days.`
      : `${domPhrase} — in line with the ${Math.round(zipMedian.medianDom)}-day typical for ${subject.zip}.`,
    detail: null,
    figures,
  };
}
```

`cumulative-time.ts`: unavailable when `cdomDays == null || domDays == null`; flag when `cdomDays - domDays >= 14`; headline states current-spell phrase (via `formatDom`, passing `cdomDays` so the relist context rides along) and, when a relist fact is present, adds "returned to market MM/DD/YYYY after N days off." Figures: current spell, cumulative, and (when present) the relist date. Sources "SWFL Data Gulf".

- [ ] **Step 4: Run** `bun test lib/why-not-selling/checks` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/why-not-selling/checks/market-speed.ts lib/why-not-selling/checks/market-speed.test.ts lib/why-not-selling/checks/cumulative-time.ts lib/why-not-selling/checks/cumulative-time.test.ts
git commit -m "feat(wins): market-speed + cumulative-time checks" -- lib/why-not-selling/checks
```

---

### Task 4: cut-history read + checks 3–4 — price cuts + price position

**Files:**
- Create: `lib/why-not-selling/cut-history.ts` + `cut-history.test.ts`
- Create: `lib/why-not-selling/checks/price-cuts.ts` + `price-cuts.test.ts`
- Create: `lib/why-not-selling/checks/price-position.ts` + `price-position.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClientUntyped` from `@/utils/supabase/service-role`; types from `../types`.
- Produces:
  - `loadCutHistory(addressKey: string, deps?: { fetchRows?: (key: string) => Promise<CutRow[]> }): Promise<CutEvent[]>` where `CutRow = { at: string|null; price: number|null; price_delta: number|null; from_state: string|null; to_state: string|null }`
  - `priceCuts(subject: SubjectHome, cuts: CutEvent[], zipCutShare: { pct: number; source: string; asOf: string } | null, speedFlagged: boolean): CheckResult`
  - `pricePosition(subject: SubjectHome, pos: PricePosition | null, asOf: string): CheckResult`

**Rules:** a cut event is a `listing_transitions` row with `from_state === to_state` and `price_delta < 0` (transitions.py:68–72 contract; the two-column compare happens client-side because PostgREST can't compare columns). `priceCuts` flags when the home is speed-flagged AND has zero cuts ("sitting long, price never moved"); otherwise states the cut facts plainly. The `price-reduced.ts` prohibition applies: never a WHY, only events. `pricePosition` flags when `pricePctile >= 80` with `priceN >= 10`; renders $/sqft percentile only when `ppsfN >= 10` and subject has sqft.

- [ ] **Step 1: Failing tests.** `cut-history.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadCutHistory } from "./cut-history";

test("keeps only same-state negative-delta rows, oldest first", async () => {
  const rows = [
    { at: "2026-05-01", price: 590000, price_delta: -10000, from_state: "active", to_state: "active" },
    { at: "2026-03-01", price: 600000, price_delta: -15000, from_state: "active", to_state: "active" },
    { at: "2026-04-01", price: 600000, price_delta: null, from_state: "holding", to_state: "active" },
    { at: "2026-06-01", price: 605000, price_delta: 15000, from_state: "active", to_state: "active" },
  ];
  const cuts = await loadCutHistory("K:33904", { fetchRows: async () => rows });
  expect(cuts.map((c) => c.at)).toEqual(["2026-03-01", "2026-05-01"]);
});

test("empty-tolerant: fetch error -> []", async () => {
  const cuts = await loadCutHistory("K:33904", { fetchRows: async () => { throw new Error("x"); } });
  expect(cuts).toEqual([]);
});
```

`price-cuts.test.ts`: three cases — speed-flagged + zero cuts → `flag` with headline "price has not moved"; two cuts → `clear` with a figure per cut (`$15,000 on 03/01/2026` formatting, MM/DD/YYYY) plus the ZIP cut-share figure when provided; no subject price → `unavailable`.
`price-position.test.ts`: three cases — pctile 91/n=40 → `flag`, headline "priced above 91% of active listings in 33904"; pctile 55 → `clear`; `pos=null` or `priceN < 10` → `unavailable`.

- [ ] **Step 2: Run** `bun test lib/why-not-selling` → new tests FAIL.

- [ ] **Step 3: Implement.** `cut-history.ts` default fetch:

```ts
const db = createServiceRoleClientUntyped();
const { data } = await db.schema("data_lake").from("listing_transitions")
  .select("at, price, price_delta, from_state, to_state")
  .eq("address_key", addressKey).eq("sale_or_rent", "sale")
  .order("at", { ascending: true }).limit(200);
```
then filter `from_state === to_state && (price_delta ?? 0) < 0`, map to `CutEvent`, wrap the whole body in try/catch → `[]`.

- [ ] **Step 4: Run** `bun test lib/why-not-selling` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/why-not-selling/cut-history.ts lib/why-not-selling/cut-history.test.ts lib/why-not-selling/checks/price-cuts.ts lib/why-not-selling/checks/price-cuts.test.ts lib/why-not-selling/checks/price-position.ts lib/why-not-selling/checks/price-position.test.ts
git commit -m "feat(wins): cut-history read + price-cuts and price-position checks" -- lib/why-not-selling
```

---

### Task 5: parcel + ZHVI reads + check 5 — anchor gap

**Files:**
- Create: `lib/why-not-selling/parcel-read.ts` + `parcel-read.test.ts`
- Create: `lib/why-not-selling/zhvi-change.ts` + `zhvi-change.test.ts`
- Create: `lib/why-not-selling/checks/anchor-gap.ts` + `anchor-gap.test.ts`

**Interfaces:**
- Consumes: `addressKey` from `@/lib/listings/address-key`; `normalizeTypedUnits` from `@/lib/listings/typed-address`.
- Produces:
  - `loadParcelFact(street: string, zip: string, county: "Lee"|"Collier", deps?): Promise<ParcelFact | null>`
  - `loadZhviChange(zip: string, saleYear: number, saleMonth: number, deps?): Promise<ZhviChange | null>`
  - `anchorGap(subject: SubjectHome, parcel: ParcelFact | null, zhvi: ZhviChange | null): CheckResult`

**Rules (spec):**
- Parcel table by county: `data_lake.lee_parcels` / `data_lake.collier_parcels`. Candidate fetch: `.eq("phy_zipcd", zip).ilike("phy_addr1", `${streetNumber} %`)` where `streetNumber` = leading digits of the street; match client-side on `addressKey(normalizeTypedUnits(phy_addr1), zip) === addressKey(normalizeTypedUnits(street), zip)`. Known miss class: condo units (Marco 0/360) → return null → check omitted.
- Omit when `multi_parcel_sale_1` is non-null and not `'N'` (price isn't the home's own) or when `sale_prc1 < 1000` (FDOR non-arm's-length placeholder prices). Judgment guards, documented at the definition site.
- `loadZhviChange`: from `data_lake.zhvi_swfl` (`zip_code, period_end, home_value`), baseline = first row with `period_end >= <saleYear>-<saleMonth>-01` (must be within 92 days of that date, else null); latest = max `period_end`. `pctChange = (latest - baseline) / baseline * 100`.
- `anchorGap` figures: "Purchased MM/YYYY for $X" (source "Lee County property records" / "Collier County property records"), "Typical home value in <zip> since then" `+Y%` (source "Zillow ZHVI (typical home value)" — NEVER the word median), "What the current ask implies" `+Z%` where `Z = (listPrice - salePrice)/salePrice*100`. Flag when `Z - Y >= 10` (judgment). No conclusion sentence beyond the numbers ("the ask implies +38% since 06/2021; typical here moved +14%").

- [ ] **Step 1: Failing tests.**
`parcel-read.test.ts` — injected `fetchCandidates` returning two rows (one exact address-key match with `sale_prc1: 610000, sale_yr1: 2021, sale_mo1: 6, actual_year_built: 1998, living_area_sqft: 2100, multi_parcel_sale_1: null`, one non-matching) → returns the matching `ParcelFact`; a `multi_parcel_sale_1: "Y"` row → null; `sale_prc1: 100` → null; fetch throws → null.
`zhvi-change.test.ts` — injected series `[{period_end:"2021-06-30", home_value: 400000}, {period_end:"2026-06-30", home_value: 456000}]` with sale 2021-06 → `pctChange` 14 (±0.1), `fromMdy: "06/2021"`; baseline gap > 92 days → null.
`anchor-gap.test.ts` — sale $610k 06/2021, ask $819k (implies +34.3%), zhvi +14% → `flag`, figures contain all three; zhvi null → `unavailable`; parcel null → `unavailable`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** per the rules above (each loader wrapped try/catch → null; every read `.limit(50)` on candidates).

- [ ] **Step 4: Run** `bun test lib/why-not-selling` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/why-not-selling/parcel-read.ts lib/why-not-selling/parcel-read.test.ts lib/why-not-selling/zhvi-change.ts lib/why-not-selling/zhvi-change.test.ts lib/why-not-selling/checks/anchor-gap.ts lib/why-not-selling/checks/anchor-gap.test.ts
git commit -m "feat(wins): parcel + ZHVI reads and anchor-gap check" -- lib/why-not-selling
```

---

### Task 6: checks 6–7 — competition + cross-check

**Files:**
- Create: `lib/why-not-selling/checks/competition.ts` + `competition.test.ts`
- Create: `lib/why-not-selling/checks/cross-check.ts` + `cross-check.test.ts`

**Interfaces:**
- Consumes: `MarketSnapshot` type from `@/lib/should-i-sell/load-market-snapshot` (its `housing` half: `monthsOfSupply`, `saleToListPct`, `medianDom` + `source`; its `momentum` half feeds Task 4's cut share at the loader level).
- Produces:
  - `competition(stale: StaleShare | null, snapshot: MarketSnapshot | null, zip: string): CheckResult`
  - `crossCheck(zipMedian: ZipDomMedian | null, heat: { medianDom: number; asOf: string } | null, zip: string): CheckResult`

**Rules:** competition flags when `over90 / exactCount >= 0.4` (with `exactCount >= MIN_ZIP_SAMPLE`) OR `monthsOfSupply >= 9`; figures: active count, 90+/180+ counts (source "SWFL Data Gulf"), months of supply + sale-to-list + sold DOM labeled with the snapshot's own source label ("Redfin Data Center", sold-side — the figure labels say "of SOLD homes" so list-side and sold-side never blur). `crossCheck` never flags: status `clear` (or `unavailable` when either side is missing), one line: "Our live daily read: N days · realtor.com's monthly figure for <zip>: M days (as of <asOf>)" — the discrepancy-reporting rule made visible.

- [ ] **Step 1: Failing tests** — competition: 45% over-90 → flag; healthy → clear; `stale=null` and `snapshot=null` → unavailable; snapshot-only (stale null) still renders the sold-side figures with the Redfin source label. cross-check: both present → clear with both numbers; either missing → unavailable.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/why-not-selling/checks/competition.ts lib/why-not-selling/checks/competition.test.ts lib/why-not-selling/checks/cross-check.ts lib/why-not-selling/checks/cross-check.test.ts
git commit -m "feat(wins): competition + realtor.com cross-check checks" -- lib/why-not-selling/checks
```

---

### Task 7: resolve-q extraction + the report loader

**Files:**
- Create: `app/r/_components/resolve-q.ts`
- Modify: `app/r/back-on-market/page.tsx` (import `resolveQToZip` from the new module; delete the local copy; its signature is unchanged)
- Create: `lib/why-not-selling/load-report.ts` + `load-report.test.ts`

**Interfaces:**
- Consumes: everything produced in Tasks 1–6, plus `loadMarketSnapshot` (`@/lib/should-i-sell/load-market-snapshot`), `resolveRelistFact` (`@/lib/back-on-market/relist-fact`), `loadParsedBrain` (`@/lib/fetch-brain`), `healFlooredRows` (`@/lib/listings/select`), `isCoreScope` (`@/refinery/lib/core-scope.mts`), `cityForZip` (`@/lib/swfl-zip-city`), `resolveZip` (`@/refinery/lib/zip-resolver.mts`).
- Produces:

```ts
export interface WinsReport {
  kind: "home" | "area";
  zip: string;
  place: string;
  subject: SubjectHome | null;       // null for area reads
  subjectMiss: boolean;              // address given but no active listing matched
  checks: CheckResult[];             // home: up to 7; area: competition + cross-check
  areaFigures: CheckFigure[];        // area context strip (both kinds)
}
export async function loadWinsReport(q: string, deps?: Partial<WinsDeps>): Promise<WinsReport | null>
```

`WinsDeps` carries every injectable read (subject fetch, RPCs, snapshot, cuts, parcel, zhvi, heat, relist, geocode) so the test never touches the network. `loadWinsReport` returns null only for empty/out-of-scope q (the route then renders the plain ask).

**Assembly order (all reads `Promise.all`-parallel where independent):**
1. `resolveQToZip(q)` → zip; `isCoreScope(zip)` gate.
2. Address form? derive `addressKey(normalizeTypedUnits(street), zip)`; fetch subject from `data_lake.listing_dom`: `.select("address_key, street_address, city, county, zip_code, list_price, sqft, status, state, sale_or_rent, dom_days, dom_is_floor, cdom_days, listed_date, property_id").eq("address_key", key).eq("sale_or_rent","sale").eq("state","active").maybeSingle()`. On hit with `dom_is_floor`, call `healFlooredRows([row])` (the existing ≤3-probe heal), then map to `SubjectHome`.
3. RPCs (`db.schema("data_lake").rpc("zip_band_dom_median", { p_zip: zip })` etc.), `loadMarketSnapshot(zip)`, market-heat read: `loadParsedBrain("market-heat-swfl")` → `detail_tables` id `market_heat_by_zip` → row key `zip` → `cells["median_dom"]`, as-of from the table title (same `asOfMdy` approach as load-market-snapshot).
4. ZIP median for checks: prefer the RPC-backed `zip_active_dom_median` (same call pattern as `lib/buyer-leverage/zip-benchmark.ts` — read that file and reuse its fetch shape).
5. Subject-only reads: `loadCutHistory(key)`, `loadParcelFact(street, zip, county)`, then `loadZhviChange(zip, parcel.saleYear, parcel.saleMonth)`, `resolveRelistFact(q)`.
6. Build `checks` in spec order [market-speed, cumulative-time, price-cuts, price-position, anchor-gap, competition, cross-check], keep `status !== "unavailable"` plus ALWAYS keep competition/cross-check slots (they may be unavailable too — drop those as well; "omitted, never guessed").
7. `areaFigures`: active count, ZIP typical DOM, 90+/180+ share, cut share — each with source + asOf.

- [ ] **Step 1: Extract `resolveQToZip`** into `app/r/_components/resolve-q.ts` (verbatim function from `app/r/back-on-market/page.tsx:25-35`, exported; page imports it). Run `bun test app/r lib/back-on-market` (any existing page tests) → green.
- [ ] **Step 2: Failing loader tests** — with full injected deps: (a) address hit → `kind: "home"`, 7 checks when all inputs present; (b) address miss → `kind: "area"`, `subjectMiss: true`, only area checks; (c) bare ZIP → area, `subjectMiss: false`; (d) out-of-scope ZIP → null; (e) a dep that throws → its check absent, loader still returns.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** `bun test lib/why-not-selling app/r` → PASS.
- [ ] **Step 6: Commit**

```bash
git add app/r/_components/resolve-q.ts app/r/back-on-market/page.tsx lib/why-not-selling/load-report.ts lib/why-not-selling/load-report.test.ts
git commit -m "feat(wins): report loader + resolveQToZip extraction" -- app/r/_components/resolve-q.ts app/r/back-on-market/page.tsx lib/why-not-selling/load-report.ts lib/why-not-selling/load-report.test.ts
```

---

### Task 8: the route + render component

**Files:**
- Create: `app/r/why-isnt-it-selling/page.tsx`
- Create: `components/why-not-selling/WinsRead.tsx`

**Interfaces:**
- Consumes: `loadWinsReport`, `WinsReport` (Task 7); `ReportShell, ReportHeader, ReportFooter, Meta` from `app/r/_components/report-shell`; `resolveQToZip` from `app/r/_components/resolve-q`.
- Produces: the public page at `/r/why-isnt-it-selling?q=<zip|address>` (+ `watch=saved` banner param).

**Page rules (spec):** mirror `app/r/back-on-market/page.tsx` structure exactly — `runtime="nodejs"`, `dynamic="force-dynamic"`, empty/out-of-scope → the plain ask with the entry form (copy: "Why isn't it selling? Enter your address — we'll read the market's answer from the data." placeholder like back-on-market's). `WinsRead` renders: subject header (display address, place), the check cards (title, headline, figures each as "label: value · source, as of MM/DD/YYYY"), the area strip, then the ALWAYS-rendered honesty block:

> What the data can't see: condition, photos, staging, and what buyers said after showings. Those live with people, not records — it's exactly where a good local agent earns their fee.

followed by the watch form (POST `/api/report-watch`): email input, hidden `address_key`/`zip`/`q`, and the agent opt-in checkbox — **unchecked by default**, label exactly: "Have one vetted local agent review this report with me (optional)". `subjectMiss` renders: "We don't see an active listing at this address — here's the area read." No system nouns anywhere; DOM strings arrive pre-formatted from the checks.

- [ ] **Step 1: Build `WinsRead.tsx`** (server component, props `{ report: WinsReport; q: string; watchSaved: boolean }`) with the sections above, styling copied from `components/back-on-market/BackOnMarketRead.tsx` classes (read it first; reuse its card/figure classes verbatim).
- [ ] **Step 2: Build `page.tsx`** mirroring back-on-market's `Page` shape: parse `q` + `watch` from `searchParams`, `loadWinsReport(q)`, null → ask-form shell, else `<WinsRead …/>`.
- [ ] **Step 3: Verify:** `bunx next build` → green (this is the standard verification, not `npx tsc`).
- [ ] **Step 4: Commit**

```bash
git add app/r/why-isnt-it-selling/page.tsx components/why-not-selling/WinsRead.tsx
git commit -m "feat(wins): /r/why-isnt-it-selling route + WinsRead" -- app/r/why-isnt-it-selling components/why-not-selling
```

---

### Task 9: watch store + API routes (dark sender)

**Files:**
- Create: `lib/why-not-selling/watch-store.ts` + `watch-store.test.ts`
- Create: `app/api/report-watch/route.ts`
- Create: `app/api/report-watch/confirm/route.ts`
- Create: `app/api/report-watch/unsubscribe/route.ts`

**Interfaces:**
- Produces:

```ts
export interface WatchInput { email: string; addressKey: string; zip: string; queryText: string; agentOptin: boolean; }
export const AGENT_OPTIN_CONSENT_TEXT = "Have one vetted local agent review this report with me (optional)";
export function validateWatchInput(form: Record<string, unknown>): WatchInput | null;
export async function createWatch(input: WatchInput, deps?): Promise<"saved" | "exists" | "error">;
export async function confirmWatch(token: string, deps?): Promise<boolean>;
export async function unsubscribeWatch(token: string, deps?): Promise<boolean>;
```

**Rules:** `validateWatchInput` — email must match a plain `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, zip `/^\d{5}$/`, addressKey non-empty, else null. `createWatch` upserts with `onConflict: "email,address_key", ignoreDuplicates: true`; when `agentOptin`, sets `agent_optin_at = now`, `consent_text = AGENT_OPTIN_CONSENT_TEXT`. **No email is sent anywhere in this task — the sender is dark by spec; `confirmed_at` stays null until `wins_watch_email_live` wires the confirmation flow.** Routes are thin: POST parses `await req.formData()`, calls the store, 303-redirects to `/r/why-isnt-it-selling?q=<q>&watch=saved` (or `watch=invalid`); the GET routes read `?token=`, call confirm/unsubscribe, return a plain-text 200 ("Confirmed."/"Unsubscribed.") or 400.

- [ ] **Step 1: Failing tests** for `validateWatchInput` (good input → object with `agentOptin` true only when the checkbox value is `"on"`; bad email/zip → null) and `createWatch`/`confirmWatch`/`unsubscribeWatch` with an injected db stub (saved path passes the exact consent text; duplicate → "exists"; throw → "error").
- [ ] **Step 2: Run** `bun test lib/why-not-selling/watch-store.test.ts` → FAIL. **Step 3: Implement store + routes.** **Step 4: Run** → PASS; `bunx next build` → green.
- [ ] **Step 5: Commit**

```bash
git add lib/why-not-selling/watch-store.ts lib/why-not-selling/watch-store.test.ts app/api/report-watch
git commit -m "feat(wins): watch store + API routes (sender dark by design)" -- lib/why-not-selling/watch-store.ts lib/why-not-selling/watch-store.test.ts app/api/report-watch
```

---

### Task 10: finish line — build, follow-up checks, session log

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)
- Modify: `_AUDIT_AND_ROADMAP/build-queue.md` (sync per RULE 1)

- [ ] **Step 1: Full verify:** `bun test lib/why-not-selling lib/listings app/r && bunx next build` → all green.
- [ ] **Step 2: Open the spec's follow-up checks** (spec §Follow-up):

```bash
node scripts/check.mjs open brain-platform stale_listing_radar_build "Agent Stale-Listing Radar ($19.99/mo intro) — own brainstorm+spec; fence = feed/volume features; distress overlay candidate: LeePA delinquent-tax layer 21 (10,964 parcels, face_value) joins lee_parcels via current_strap — see leepa_delinquent_tax_layer_unused (spec 2026-07-19-why-isnt-it-selling-design.md)"
node scripts/check.mjs open brain-platform parcel_owner_fields_probe "FDOR layer: census owner-name/mailing-address field availability (full-scope-first), update cadence_registry source_scope before any pull"
node scripts/check.mjs open brain-platform wins_print_mail_addon "Radar print-and-mail add-on — verify PostGrid/Lob per-piece pricing live before speccing"
node scripts/check.mjs open brain-platform wins_direct_mail_loop "Our direct-mail loop to the 180+day cohort with personalized report links"
node scripts/check.mjs open brain-platform wins_watch_email_live "Wire + light the watch confirmation/delta emails: operator sample approval + platform postal address are the gates"
```

- [ ] **Step 3: SESSION_LOG entry** (top of file): what shipped (engine, route, watch store dark), what's gated (live-verify waits on the de-floored book; emails dark), check ids opened/closed. Commit `SESSION_LOG.md` + `_AUDIT_AND_ROADMAP/build-queue.md` with explicit paths.
- [ ] **Step 4: STOP — no push.** Show the operator `git log --oneline` for the task commits and ask for the push decision (operator pushes or approves `node scripts/safe-push.mjs`).
- [ ] **Step 5: Post-deploy (after operator pushes + Vercel deploys + backfill verified):** run the live-verify — a real long-DOM address renders ≥5 checks with real figures/sources/as-ofs; a bare ZIP renders the area read; then `node scripts/check.mjs close why_isnt_it_selling_live_verify`.

---

## Self-Review (done at plan time)

- **Spec coverage:** engine checks 1–7 → Tasks 3–6; route/render + honesty block + opt-in → Task 8; SQL trio + watch table → Task 1; track-it (store, dark sender) → Task 9; follow-up checks + sequencing gate → Task 10. The spec's "confirmation email" is explicitly deferred behind `wins_watch_email_live` (dark-sender rule) — Task 9 notes it.
- **Placeholders:** none; every code step carries real code or an exact recipe with file:line references.
- **Type consistency:** `CheckResult`/`SubjectHome`/`ParcelFact`/`ZhviChange`/`CutEvent`/`MIN_ZIP_SAMPLE` defined once in Task 2 and consumed by name everywhere; RPC row shapes fixed in Task 1 and mirrored in Task 7's fetches.
