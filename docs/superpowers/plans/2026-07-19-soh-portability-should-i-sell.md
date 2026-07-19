# SOH Portability + Cost-of-Waiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 16 files, keywords: migration, schema, architecture

**Goal:** Two-tier Save-Our-Homes section on `/r/should-i-sell/[zip]` — an always-on ZIP line off published brain tables plus an address-gated per-parcel portability calculator — and the cited tax-bill link-out that resolves `should_i_sell_property_tax_source`.

**Architecture:** Pure statute math in one lib module; two small nullable loaders (published-brain reader + untyped `data_lake` parcel lookup); one client component; page wiring. Zero new ingest, zero pack changes, zero paid calls.

**Tech Stack:** Next.js App Router (server page + "use client" component), supabase-js untyped service-role client (`.schema("data_lake")`), bun:test, existing report-shell UI idioms.

**Spec:** `docs/superpowers/specs/2026-07-19-soh-portability-should-i-sell-design.md` (approved 07/19/2026; evidence section carries the verbatim statute/PT-112 facts and probe results).

## Global Constraints

- Statute constants verbatim, each with source-URL comment: port cap **$500,000** and both transfer formulas from s. 193.155(8)(a)/(b) F.S.; annual cap **lesser of 3% or CPI** from s. 193.155(1); window **3 years from Jan 1 of abandonment year**, DR-501T by **March 1** (DOR PT-112 R. 08/24).
- Never invent a number: no millage, no estimated bill, no defaulted insurance, no assumed next-home price. Optional inputs start `useState("")`.
- As-of dates MM/DD/YYYY, stated once. No brain slugs / `§` / "ZIP-level" in rendered strings (no-invention test enforces).
- Projections mirror `spread-calc.ts` exactly: linear proration `(1 + rate × months/12)`, `[INFERENCE]` tag, named basis, falsifier. The two projections share one page — they must agree in method.
- All commits local until the final task; push is ONE bundle (spec commit `cd891c21` + build) via `OPERATOR_APPROVED_PUSH=1 node scripts/safe-push.mjs` (operator decree "bundle with build. go", this conversation, 07/19/2026). Explicit `git add` paths only — never `-A`.
- Citation URLs are verified-in-session homepages: FDOR data portal `https://floridarevenue.com/dataPortal`, statute page on `leg.state.fl.us`, PT-112 PDF, `https://county-taxes.net/fl-lee/property-tax`, `https://collier.county-taxes.com/public`.
- Scope: Lee + Collier only. Any other county → the new section quietly renders nothing new.

---

### Task 1: Pure statute math — `soh-portability.ts`

**Files:**
- Create: `lib/should-i-sell/soh-portability.ts`
- Test: `lib/should-i-sell/soh-portability.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (used by Tasks 4–5):
  `SOH_PORT_CAP: 500000` · `SOH_ANNUAL_CAP_FRACTION: 0.03` · `PORT_WINDOW_YEARS: 3` ·
  `SOH_SOURCES: { statute: {label,url}; dorGuide: {label,url} }` ·
  `SOH_PROJECTION_TAG/BASIS/FALSIFIER: string` ·
  `sohBenefit(jvHmstd: number, avHmstd: number): number` ·
  `portableAmount(benefit: number): number` ·
  `portForNextHome(args: {oldJv: number; oldAv: number; nextHomePrice: number}): {newAssessed: number; portedReduction: number; downsized: boolean} | null` ·
  `projectSoh(args: {jv: number; av: number; yoyFraction: number; months: 6|12}): {projectedJv: number; projectedAv: number; projectedBenefit: number; projectedPortable: number; excessOverCap: number}`

- [ ] **Step 1: Write the failing test**

```ts
// lib/should-i-sell/soh-portability.test.ts
import { describe, expect, test } from "bun:test";
import {
  SOH_PORT_CAP,
  SOH_ANNUAL_CAP_FRACTION,
  PORT_WINDOW_YEARS,
  SOH_SOURCES,
  SOH_PROJECTION_TAG,
  SOH_PROJECTION_BASIS,
  SOH_PROJECTION_FALSIFIER,
  sohBenefit,
  portableAmount,
  portForNextHome,
  projectSoh,
} from "./soh-portability";

describe("constants match the cited statute", () => {
  test("values + sources", () => {
    expect(SOH_PORT_CAP).toBe(500_000);
    expect(SOH_ANNUAL_CAP_FRACTION).toBe(0.03);
    expect(PORT_WINDOW_YEARS).toBe(3);
    expect(SOH_SOURCES.statute.url).toContain("leg.state.fl.us");
    expect(SOH_SOURCES.dorGuide.url).toContain("floridarevenue.com");
    expect(SOH_PROJECTION_TAG).toBe("[INFERENCE]");
    expect(SOH_PROJECTION_BASIS).toContain("3%");
    expect(SOH_PROJECTION_FALSIFIER.length).toBeGreaterThan(0);
  });
});

describe("sohBenefit", () => {
  test("gap and clamp", () => {
    expect(sohBenefit(400_000, 250_000)).toBe(150_000);
    expect(sohBenefit(250_000, 400_000)).toBe(0); // assessed never exceeds just → clamp
    expect(sohBenefit(0, 0)).toBe(0);
  });
});

describe("portableAmount", () => {
  test("caps at $500k", () => {
    expect(portableAmount(150_000)).toBe(150_000);
    expect(portableAmount(600_000)).toBe(500_000);
    expect(portableAmount(-5)).toBe(0);
  });
});

describe("portForNextHome — s. 193.155(8)(a)/(b) exactly", () => {
  test("upsize: full gap ports", () => {
    const r = portForNextHome({ oldJv: 400_000, oldAv: 250_000, nextHomePrice: 500_000 })!;
    expect(r.downsized).toBe(false);
    expect(r.portedReduction).toBe(150_000);
    expect(r.newAssessed).toBe(350_000);
  });
  test("upsize: gap over cap clips to $500k", () => {
    const r = portForNextHome({ oldJv: 900_000, oldAv: 300_000, nextHomePrice: 1_000_000 })!;
    expect(r.portedReduction).toBe(500_000);
    expect(r.newAssessed).toBe(500_000);
  });
  test("equal just value is the (a) branch (>=)", () => {
    const r = portForNextHome({ oldJv: 400_000, oldAv: 250_000, nextHomePrice: 400_000 })!;
    expect(r.downsized).toBe(false);
    expect(r.newAssessed).toBe(250_000);
  });
  test("downsize: proportional", () => {
    const r = portForNextHome({ oldJv: 400_000, oldAv: 250_000, nextHomePrice: 300_000 })!;
    expect(r.downsized).toBe(true);
    expect(r.newAssessed).toBe(187_500); // 300k/400k × 250k
    expect(r.portedReduction).toBe(112_500);
  });
  test("downsize: cap raises assessed so the difference equals $500k", () => {
    const r = portForNextHome({ oldJv: 3_000_000, oldAv: 1_000_000, nextHomePrice: 2_000_000 })!;
    expect(r.newAssessed).toBe(1_500_000); // 2M/3M×1M=666,667 → diff 1,333,333 > 500k → 2M−500k
    expect(r.portedReduction).toBe(500_000);
  });
  test("non-positive inputs → null", () => {
    expect(portForNextHome({ oldJv: 0, oldAv: 0, nextHomePrice: 300_000 })).toBeNull();
    expect(portForNextHome({ oldJv: 400_000, oldAv: 250_000, nextHomePrice: 0 })).toBeNull();
  });
});

describe("projectSoh — linear proration mirroring spread-calc", () => {
  test("12 months", () => {
    const r = projectSoh({ jv: 400_000, av: 250_000, yoyFraction: 0.05, months: 12 });
    expect(r.projectedJv).toBe(420_000);
    expect(r.projectedAv).toBe(257_500); // 250k × 1.03 ceiling case
    expect(r.projectedBenefit).toBe(162_500);
    expect(r.projectedPortable).toBe(162_500);
    expect(r.excessOverCap).toBe(0);
  });
  test("6 months prorates", () => {
    const r = projectSoh({ jv: 400_000, av: 250_000, yoyFraction: 0.05, months: 6 });
    expect(r.projectedJv).toBe(410_000); // 400k × (1 + 0.05×0.5)
    expect(r.projectedAv).toBe(253_750); // 250k × (1 + 0.03×0.5)
  });
  test("falling market: assessed never exceeds just", () => {
    const r = projectSoh({ jv: 260_000, av: 255_000, yoyFraction: -0.1, months: 12 });
    expect(r.projectedJv).toBe(234_000);
    expect(r.projectedAv).toBe(234_000); // clamped to projectedJv
    expect(r.projectedBenefit).toBe(0);
  });
  test("gap crossing the cap reports the excess", () => {
    const r = projectSoh({ jv: 1_500_000, av: 900_000, yoyFraction: 0.2, months: 12 });
    expect(r.projectedJv).toBe(1_800_000);
    expect(r.projectedAv).toBe(927_000);
    expect(r.projectedBenefit).toBe(873_000);
    expect(r.projectedPortable).toBe(500_000);
    expect(r.excessOverCap).toBe(373_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/should-i-sell/soh-portability.test.ts`
Expected: FAIL — cannot resolve `./soh-portability`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/should-i-sell/soh-portability.ts
//
// Save-Our-Homes portability math — PURE statute arithmetic, no I/O, no invention.
// Every constant and formula is verbatim from the cited primary source (fetched
// in-session 07/19/2026; evidence in the design spec):
//   • s. 193.155, Florida Statutes — annual cap (1); transfer formulas (8)(a)/(8)(b).
//   • Florida DOR PT-112 (R. 08/24) — 3-year window from Jan 1 of the abandonment
//     year; DR-501T filed with DR-501 by March 1.
// Projection method mirrors spread-calc.ts (linear proration) so the two
// projections on the page agree in method; assessed growth uses the 3% CEILING
// case (the statute caps at the lesser of 3% or CPI) and says so in the basis.

/** s. 193.155(8)(a)/(b) F.S. — maximum transferable assessment difference. */
export const SOH_PORT_CAP = 500_000;
/** s. 193.155(1) F.S. — annual assessed growth cap: lesser of 3% or CPI. 3% = ceiling case. */
export const SOH_ANNUAL_CAP_FRACTION = 0.03;
/** PT-112: establish the new homestead within 3 years of Jan 1 of the abandonment year. */
export const PORT_WINDOW_YEARS = 3;

export const SOH_SOURCES = {
  statute: {
    label: "s. 193.155, Florida Statutes",
    url: "http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0100-0199/0193/Sections/0193.155.html",
  },
  dorGuide: {
    label: "Florida DOR, Save Our Homes guide PT-112",
    url: "https://floridarevenue.com/property/Documents/pt112.pdf",
  },
} as const;

export const SOH_PROJECTION_TAG = "[INFERENCE]";
export const SOH_PROJECTION_BASIS =
  "Based on this area's median sale price change over the past year (Redfin Data Center, via SWFL Data Gulf), with your assessed value grown at the 3% statutory ceiling (the cap is the lesser of 3% or CPI).";
export const SOH_PROJECTION_FALSIFIER =
  "This assumes the past year's price trend continues; a market shift — or a CPI reading under 3% — would change it.";

/** The SOH benefit: homestead just value minus homestead assessed value, floored at 0. */
export function sohBenefit(jvHmstd: number, avHmstd: number): number {
  return Math.max(0, jvHmstd - avHmstd);
}

/** What can port in the buy-equal-or-up case: the benefit, capped at $500,000. */
export function portableAmount(benefit: number): number {
  return Math.min(SOH_PORT_CAP, Math.max(0, benefit));
}

export interface NextHomePort {
  newAssessed: number;
  portedReduction: number;
  downsized: boolean;
}

/**
 * s. 193.155(8) transfer, both branches:
 *   (a) next ≥ oldJv:  assessed = next − min($500k, oldJv − oldAv)
 *   (b) next < oldJv:  assessed = (next ÷ oldJv) × oldAv; if next − assessed > $500k,
 *       assessed is raised so the difference equals exactly $500k.
 */
export function portForNextHome(args: {
  oldJv: number;
  oldAv: number;
  nextHomePrice: number;
}): NextHomePort | null {
  const { oldJv, oldAv, nextHomePrice } = args;
  if (oldJv <= 0 || oldAv <= 0 || nextHomePrice <= 0) return null;
  if (nextHomePrice >= oldJv) {
    const portedReduction = portableAmount(sohBenefit(oldJv, oldAv));
    return { newAssessed: nextHomePrice - portedReduction, portedReduction, downsized: false };
  }
  let newAssessed = (nextHomePrice / oldJv) * oldAv;
  if (nextHomePrice - newAssessed > SOH_PORT_CAP) newAssessed = nextHomePrice - SOH_PORT_CAP;
  return { newAssessed, portedReduction: nextHomePrice - newAssessed, downsized: true };
}

export interface SohProjection {
  projectedJv: number;
  projectedAv: number;
  projectedBenefit: number;
  projectedPortable: number;
  excessOverCap: number;
}

/** Project the gap forward: just value at the area trend, assessed at the 3% ceiling,
 *  assessed clamped to just (s. 193.155(2)). Linear proration, like spread-calc. */
export function projectSoh(args: {
  jv: number;
  av: number;
  yoyFraction: number;
  months: 6 | 12;
}): SohProjection {
  const frac = args.months / 12;
  const projectedJv = args.jv * (1 + args.yoyFraction * frac);
  const projectedAv = Math.min(projectedJv, args.av * (1 + SOH_ANNUAL_CAP_FRACTION * frac));
  const projectedBenefit = Math.max(0, projectedJv - projectedAv);
  return {
    projectedJv,
    projectedAv,
    projectedBenefit,
    projectedPortable: Math.min(SOH_PORT_CAP, projectedBenefit),
    excessOverCap: Math.max(0, projectedBenefit - SOH_PORT_CAP),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/should-i-sell/soh-portability.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/should-i-sell/soh-portability.ts lib/should-i-sell/soh-portability.test.ts
git commit -m "feat(should-i-sell): SOH portability statute math — pure, cited, tested"
```

---

### Task 2: Parcel lookup — `load-parcel-soh.ts` + lookup index

**Files:**
- Create: `lib/should-i-sell/load-parcel-soh.ts`
- Create: `migrations/20260719_parcels_addr_lookup_idx.sql`
- Modify: `verification/supabase-untyped-allowlist.json` (add `"lib/should-i-sell/load-parcel-soh.ts"` in alphabetical position)
- Test: `lib/should-i-sell/load-parcel-soh.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClientUntyped` from `@/utils/supabase/service-role` (same idiom as `lib/buyer-leverage/zip-benchmark.ts`).
- Produces (used by Tasks 4–5):
  `interface ParcelSohRow { address: string; jv: number; jvHmstd: number; avHmstd: number; homesteaded: boolean; assessmentYear: number | null; county: "Lee" | "Collier" }` ·
  `loadParcelSoh(zip: string, address: string, countyNames: string[], deps?: ParcelSohDeps): Promise<ParcelSohRow | null>` ·
  `normalizeStreetAddress(input: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// lib/should-i-sell/load-parcel-soh.test.ts
import { describe, expect, test } from "bun:test";
import { loadParcelSoh, normalizeStreetAddress, type RawParcelRow } from "./load-parcel-soh";

describe("normalizeStreetAddress", () => {
  test("uppercases, trims to the street line, collapses spaces", () => {
    expect(normalizeStreetAddress("123  Main St, Fort Myers, FL 33901")).toBe("123 MAIN ST");
    expect(normalizeStreetAddress(" 45 palm ave ")).toBe("45 PALM AVE");
  });
  test("strips trailing unit tokens", () => {
    expect(normalizeStreetAddress("123 Main St Unit 4B")).toBe("123 MAIN ST");
    expect(normalizeStreetAddress("123 Main St Apt 12")).toBe("123 MAIN ST");
    expect(normalizeStreetAddress("123 Main St #7")).toBe("123 MAIN ST");
  });
});

const ROW: RawParcelRow = {
  phy_addr1: "123 MAIN ST",
  jv: "400000",
  jv_hmstd: 380000,
  av_hmstd: "250000",
  assessment_year: 2025,
};

describe("loadParcelSoh", () => {
  test("single match maps + coerces string numerics", async () => {
    const r = await loadParcelSoh("33901", "123 Main St, Fort Myers", ["Lee"], {
      fetchRows: async () => [ROW],
    });
    expect(r).not.toBeNull();
    expect(r!.county).toBe("Lee");
    expect(r!.jv).toBe(400_000);
    expect(r!.jvHmstd).toBe(380_000);
    expect(r!.avHmstd).toBe(250_000);
    expect(r!.homesteaded).toBe(true);
    expect(r!.assessmentYear).toBe(2025);
  });
  test("no match → null", async () => {
    const r = await loadParcelSoh("33901", "9 Nowhere Rd", ["Lee"], { fetchRows: async () => [] });
    expect(r).toBeNull();
  });
  test("two matches (multi-unit) → null, never a guess", async () => {
    const r = await loadParcelSoh("33901", "123 Main St", ["Lee"], {
      fetchRows: async () => [ROW, { ...ROW, jv_hmstd: 100000 }],
    });
    expect(r).toBeNull();
  });
  test("non-homesteaded parcel maps with homesteaded=false", async () => {
    const r = await loadParcelSoh("33901", "123 Main St", ["Lee"], {
      fetchRows: async () => [{ ...ROW, jv_hmstd: 0, av_hmstd: 0 }],
    });
    expect(r!.homesteaded).toBe(false);
  });
  test("straddle ZIP: falls through county order to the county that matches", async () => {
    const calls: string[] = [];
    const r = await loadParcelSoh("34134", "123 Main St", ["Collier", "Lee"], {
      fetchRows: async (county) => {
        calls.push(county);
        return county === "Lee" ? [ROW] : [];
      },
    });
    expect(calls).toEqual(["Collier", "Lee"]);
    expect(r!.county).toBe("Lee");
  });
  test("non-core county names are skipped", async () => {
    const r = await loadParcelSoh("33935", "123 Main St", ["Hendry"], {
      fetchRows: async () => [ROW],
    });
    expect(r).toBeNull();
  });
  test("fetch failure → null, never throws", async () => {
    const r = await loadParcelSoh("33901", "123 Main St", ["Lee"], {
      fetchRows: async () => {
        throw new Error("boom");
      },
    });
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/should-i-sell/load-parcel-soh.test.ts`
Expected: FAIL — cannot resolve `./load-parcel-soh`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/should-i-sell/load-parcel-soh.ts
//
// Address → FDOR parcel row for the SOH portability calculator. Single-row honesty:
// exactly one normalized-address match in the ZIP or nothing (a multi-unit ambiguity
// is a null, never a guess). County candidates come from the ZIP's crosswalk county
// list, tried in order (straddle ZIPs try both); only Lee/Collier are queryable.
// KNOWN-DEBT(data_lake): lee_parcels / collier_parcels live in the data_lake schema,
// outside the typed client — same untyped service-role read as zip-benchmark.ts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

const PARCEL_TABLE = { Lee: "lee_parcels", Collier: "collier_parcels" } as const;
type CoreCounty = keyof typeof PARCEL_TABLE;

export interface RawParcelRow {
  phy_addr1: string | null;
  jv: number | string | null;
  jv_hmstd: number | string | null;
  av_hmstd: number | string | null;
  assessment_year: number | string | null;
}

export interface ParcelSohRow {
  address: string;
  jv: number;
  jvHmstd: number;
  avHmstd: number;
  homesteaded: boolean;
  assessmentYear: number | null;
  county: CoreCounty;
}

export interface ParcelSohDeps {
  fetchRows?: (county: CoreCounty, zip: string, normalizedAddr: string) => Promise<RawParcelRow[]>;
}

/** "123  Main St Unit 4B, Fort Myers, FL" → "123 MAIN ST" (street line, no unit). */
export function normalizeStreetAddress(input: string): string {
  const street = input.split(",")[0] ?? "";
  return street
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(#|APT|UNIT|STE|LOT)\s*\S*$/i, "");
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

async function defaultFetchRows(
  county: CoreCounty,
  zip: string,
  normalizedAddr: string,
): Promise<RawParcelRow[]> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema("data_lake")
    .from(PARCEL_TABLE[county])
    .select("phy_addr1,jv,jv_hmstd,av_hmstd,assessment_year")
    .eq("phy_zipcd", zip)
    .ilike("phy_addr1", normalizedAddr)
    .limit(2);
  return (data ?? []) as RawParcelRow[];
}

/** One parcel or nothing — never throws, never guesses. */
export async function loadParcelSoh(
  zip: string,
  address: string,
  countyNames: string[],
  deps: ParcelSohDeps = {},
): Promise<ParcelSohRow | null> {
  const fetchRows = deps.fetchRows ?? defaultFetchRows;
  const normalized = normalizeStreetAddress(address);
  if (!normalized) return null;
  const candidates = countyNames.filter((c): c is CoreCounty => c === "Lee" || c === "Collier");
  for (const county of candidates) {
    try {
      const rows = await fetchRows(county, zip, normalized);
      if (rows.length !== 1) continue; // 0 = no match; 2 = ambiguous multi-unit → nothing
      const r = rows[0];
      const jv = num(r.jv);
      const jvHmstd = num(r.jv_hmstd) ?? 0;
      const avHmstd = num(r.av_hmstd) ?? 0;
      if (jv == null) continue;
      return {
        address: r.phy_addr1 ?? normalized,
        jv,
        jvHmstd,
        avHmstd,
        homesteaded: jvHmstd > 0,
        assessmentYear: num(r.assessment_year),
        county,
      };
    } catch {
      // fall through to the next candidate; a fetch failure is a null, never a throw
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/should-i-sell/load-parcel-soh.test.ts`
Expected: PASS.

- [ ] **Step 5: Lookup index migration (idempotent), applied directly**

```sql
-- migrations/20260719_parcels_addr_lookup_idx.sql
-- Address-lookup path for /r/should-i-sell SOH calculator: eq(phy_zipcd) + ilike(phy_addr1)
-- against 556k (Lee) / 291k (Collier) rows. Composite btree covers the eq + pattern anchor.
CREATE INDEX IF NOT EXISTS idx_lee_parcels_zip_addr
  ON data_lake.lee_parcels (phy_zipcd, phy_addr1);
CREATE INDEX IF NOT EXISTS idx_collier_parcels_zip_addr
  ON data_lake.collier_parcels (phy_zipcd, phy_addr1);
```

Apply via the supabase MCP `apply_migration` (name `parcels_addr_lookup_idx`), then verify:
`SELECT indexname FROM pg.pg_indexes WHERE schemaname='data_lake' AND indexname LIKE 'idx_%_parcels_zip_addr'` via the lake MCP → expect both names.

- [ ] **Step 6: Add the allowlist entry** — `"lib/should-i-sell/load-parcel-soh.ts"` into `verification/supabase-untyped-allowlist.json` (keep the array sorted).

- [ ] **Step 7: Commit**

```bash
git add lib/should-i-sell/load-parcel-soh.ts lib/should-i-sell/load-parcel-soh.test.ts migrations/20260719_parcels_addr_lookup_idx.sql verification/supabase-untyped-allowlist.json
git commit -m "feat(should-i-sell): address->parcel SOH loader (data_lake, untyped-allowlisted) + lookup index"
```

---

### Task 3: ZIP line loader — `load-zip-soh.ts`

**Files:**
- Create: `lib/should-i-sell/load-zip-soh.ts`
- Modify: `lib/should-i-sell/load-market-snapshot.ts` (export the private `asOfMdy` helper — one-word change: `function asOfMdy` → `export function asOfMdy`)
- Test: `lib/should-i-sell/load-zip-soh.test.ts`

**Interfaces:**
- Consumes: `loadParsedBrain(slug): Promise<ParsedBrain | null>` from `../fetch-brain`; `asOfMdy` from `./load-market-snapshot`.
- Produces (used by Tasks 4–5):
  `interface ZipSohLine { sohGapMedianPct: number; homesteadedCount: number | null; medianJv: number | null; county: "Lee" | "Collier"; source: { label: string; url: string; asOf: string } }` ·
  `loadZipSoh(zip: string, countyNames: string[], deps?: { loadBrain?: (slug: string) => Promise<ParsedBrain | null> }): Promise<ZipSohLine | null>`

Table map (probed 07/19/2026, both live): `properties-lee-value` → detail table `lee_parcels_by_zip`; `properties-collier-value` → `collier_parcels_by_zip`. Shared columns: `parcel_count`, `homesteaded_count`, `median_jv`, `soh_gap_median_pct`. **Same definition both counties** (median (jv_hmstd − av_hmstd)/jv_hmstd per table notes) — the spec's Lee-proxy nuance applies only to the county-level key metric, corrected in Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// lib/should-i-sell/load-zip-soh.test.ts
import { describe, expect, test } from "bun:test";
import { loadZipSoh } from "./load-zip-soh";
import type { ParsedBrain } from "../../refinery/render/speaker.mts";

function brainWith(tableId: string, zip: string, pct: number | null): ParsedBrain {
  return {
    output: {
      detail_tables: [
        {
          id: tableId,
          title: "t",
          grain: "zip",
          columns: [],
          rows: [
            {
              key: zip,
              label: zip,
              cells: { parcel_count: 100, homesteaded_count: 60, median_jv: 300000, soh_gap_median_pct: pct },
            },
          ],
          source: { url: "https://example.test/src", fetched_at: "2026-07-19T02:00:00Z", tier: 2, citation: "FDOR" },
        },
      ],
    },
  } as unknown as ParsedBrain;
}

describe("loadZipSoh", () => {
  test("Lee row maps with MM/DD/YYYY as-of", async () => {
    const r = await loadZipSoh("33904", ["Lee"], {
      loadBrain: async (slug) =>
        slug === "properties-lee-value" ? brainWith("lee_parcels_by_zip", "33904", 37.9) : null,
    });
    expect(r).not.toBeNull();
    expect(r!.county).toBe("Lee");
    expect(r!.sohGapMedianPct).toBe(37.9);
    expect(r!.homesteadedCount).toBe(60);
    expect(r!.source.asOf).toBe("07/19/2026");
  });
  test("ZIP missing from primary county's table falls through to the other county", async () => {
    const r = await loadZipSoh("34134", ["Collier"], {
      loadBrain: async (slug) =>
        slug === "properties-lee-value" ? brainWith("lee_parcels_by_zip", "34134", 30.1) : brainWith("collier_parcels_by_zip", "99999", 1),
    });
    expect(r!.county).toBe("Lee"); // straddle drift covered
  });
  test("null gap cell (no homesteaded parcels) → null line", async () => {
    const r = await loadZipSoh("33904", ["Lee"], {
      loadBrain: async () => brainWith("lee_parcels_by_zip", "33904", null),
    });
    expect(r).toBeNull();
  });
  test("brain unavailable → null", async () => {
    const r = await loadZipSoh("33904", ["Lee"], { loadBrain: async () => null });
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/should-i-sell/load-zip-soh.test.ts`
Expected: FAIL — cannot resolve `./load-zip-soh`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/should-i-sell/load-zip-soh.ts
//
// The always-on ZIP line for the SOH section — read off ALREADY-PUBLISHED brain
// output (no ingest, no metered calls), the same seam as load-market-snapshot.
// County candidates from the crosswalk list first, then the other core county:
// the per-ZIP parcel tables place straddle ZIPs by their own primary-county rule,
// so a ZIP can live in the "other" county's table. Nullable end-to-end.
import { loadParsedBrain } from "../fetch-brain";
import type { ParsedBrain } from "../../refinery/render/speaker.mts";
import { asOfMdy } from "./load-market-snapshot";

const COUNTY_BRAIN = {
  Lee: { slug: "properties-lee-value", tableId: "lee_parcels_by_zip" },
  Collier: { slug: "properties-collier-value", tableId: "collier_parcels_by_zip" },
} as const;
type CoreCounty = keyof typeof COUNTY_BRAIN;

export interface ZipSohLine {
  sohGapMedianPct: number;
  homesteadedCount: number | null;
  medianJv: number | null;
  county: CoreCounty;
  source: { label: string; url: string; asOf: string };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function loadZipSoh(
  zip: string,
  countyNames: string[],
  deps: { loadBrain?: (slug: string) => Promise<ParsedBrain | null> } = {},
): Promise<ZipSohLine | null> {
  const loadBrain = deps.loadBrain ?? loadParsedBrain;
  const named = countyNames.filter((c): c is CoreCounty => c === "Lee" || c === "Collier");
  const candidates = [...named, ...(["Lee", "Collier"] as const).filter((c) => !named.includes(c))];
  for (const county of candidates) {
    try {
      const brain = await loadBrain(COUNTY_BRAIN[county].slug);
      const table = brain?.output?.detail_tables?.find((t) => t.id === COUNTY_BRAIN[county].tableId);
      const row = table?.rows.find((r) => r.key === zip);
      const pct = num(row?.cells["soh_gap_median_pct"]);
      if (row == null || pct == null) continue;
      return {
        sohGapMedianPct: pct,
        homesteadedCount: num(row.cells["homesteaded_count"]),
        medianJv: num(row.cells["median_jv"]),
        county,
        source: {
          label: `FDOR Statewide Cadastral — ${county} County tax roll`,
          url: "https://floridarevenue.com/dataPortal",
          asOf: asOfMdy(table?.source?.fetched_at),
        },
      };
    } catch {
      // next candidate — a load failure is a missing line, never a throw
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/should-i-sell/load-zip-soh.test.ts` then `bun test lib/should-i-sell/load-market-snapshot.test.ts` (the export change must not break it).
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/should-i-sell/load-zip-soh.ts lib/should-i-sell/load-zip-soh.test.ts lib/should-i-sell/load-market-snapshot.ts
git commit -m "feat(should-i-sell): ZIP-grain SOH line loader off published value-brain tables"
```

---

### Task 4: Client component — `SohPortability.tsx`

**Files:**
- Create: `components/should-i-sell/SohPortability.tsx`

**Interfaces:**
- Consumes: everything Task 1 exports; `ZipSohLine` (Task 3); `ParcelSohRow` (Task 2); `monthYearLabel` from `@/lib/should-i-sell/format-period`.
- Produces: default export `SohPortability(props: { place: string; zipLine: ZipSohLine | null; parcel: ParcelSohRow | null; yoyFraction: number | null; yoyAsOf: string })` — returns `null` when `zipLine` and `parcel` are both null.

- [ ] **Step 1: Write the component** (style idioms copied from `SellNowVsWait.tsx`: local `SectionTitle`, `Field`, `usd`, `parseMoney`, `glass-card-modern`, 6/12 toggle)

```tsx
"use client";
// components/should-i-sell/SohPortability.tsx
//
// "Your tax break, and what moving does to it" — the Save-Our-Homes section.
//   • ZIP line: sourced median gap for the area (published county tax-roll table).
//   • Per-parcel (address-gated by the page): the seller's OWN gap, what ports
//     under the $500k statute cap, the 3-year clock, and an [INFERENCE]-tagged
//     cost-of-waiting projection. One optional user input (next-home price) —
//     blank shows the buy-equal-or-up maximum, never an assumed price.
// Every figure: county roll, cited trend, statute constant, or user-entered.
import { useMemo, useState, type ReactNode } from "react";
import {
  SOH_PORT_CAP,
  SOH_PROJECTION_TAG,
  SOH_PROJECTION_BASIS,
  SOH_PROJECTION_FALSIFIER,
  sohBenefit,
  portableAmount,
  portForNextHome,
  projectSoh,
  SOH_SOURCES,
} from "@/lib/should-i-sell/soh-portability";
import type { ZipSohLine } from "@/lib/should-i-sell/load-zip-soh";
import type { ParcelSohRow } from "@/lib/should-i-sell/load-parcel-soh";
import { monthYearLabel } from "@/lib/should-i-sell/format-period";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight text-gulf-teal">{children}</h2>;
}

const usd = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface SohPortabilityProps {
  place: string;
  zipLine: ZipSohLine | null;
  parcel: ParcelSohRow | null;
  yoyFraction: number | null;
  yoyAsOf: string;
}

export default function SohPortability(props: SohPortabilityProps) {
  const { place, zipLine, parcel, yoyFraction, yoyAsOf } = props;
  const [months, setMonths] = useState<6 | 12>(12);
  const [nextPrice, setNextPrice] = useState("");

  const benefit = parcel && parcel.homesteaded ? sohBenefit(parcel.jvHmstd, parcel.avHmstd) : null;
  const nextHomePrice = parseMoney(nextPrice);
  const port = useMemo(() => {
    if (!parcel || !parcel.homesteaded || nextHomePrice == null) return null;
    return portForNextHome({ oldJv: parcel.jvHmstd, oldAv: parcel.avHmstd, nextHomePrice });
  }, [parcel, nextHomePrice]);
  const projection = useMemo(() => {
    if (!parcel || !parcel.homesteaded || yoyFraction == null) return null;
    return projectSoh({ jv: parcel.jvHmstd, av: parcel.avHmstd, yoyFraction, months });
  }, [parcel, yoyFraction, months]);

  if (!zipLine && !parcel) return null;

  return (
    <section className="mt-10">
      <SectionTitle>Your tax break, and what moving does to it</SectionTitle>

      {zipLine && (
        <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-300">
          Homesteaded owners in {place} typically have{" "}
          <span className="font-mono text-white">{zipLine.sohGapMedianPct.toFixed(1)}%</span> of
          their homestead&rsquo;s market value shielded from taxable assessment by Florida&rsquo;s
          Save Our Homes cap
          {zipLine.homesteadedCount != null
            ? ` (across ${fmtInt(zipLine.homesteadedCount)} homesteaded parcels)`
            : ""}
          {zipLine.source.asOf ? `, as of ${zipLine.source.asOf}` : ""}. That shield does not
          transfer with a sale — a buyer restarts at market value the following January 1. What can
          move is yours: sell, and up to {usd(SOH_PORT_CAP)} of that gap can port to your next
          Florida homestead.
        </p>
      )}

      {parcel && !parcel.homesteaded && (
        <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-400">
          The county roll shows no homestead on this parcel, so Save Our Homes portability
          doesn&rsquo;t apply to it. Recently bought or filed? The roll lags — check with the
          county property appraiser.
        </p>
      )}

      {parcel && parcel.homesteaded && benefit != null && (
        <div className="mt-5 rounded-xl glass-card-modern border border-white/10 px-4 py-4">
          <p className="text-sm text-gray-300">
            Your Save Our Homes gap today:{" "}
            <span className="font-mono text-lg font-bold text-white">{usd(benefit)}</span>{" "}
            <span className="text-gray-500">
              — homestead market value {usd(parcel.jvHmstd)} minus assessed {usd(parcel.avHmstd)}
              {parcel.assessmentYear != null ? ` (county roll, ${parcel.assessmentYear})` : ""}.
            </span>
          </p>

          <p className="mt-3 text-sm text-gray-300">
            If you sell and buy at or above {usd(parcel.jvHmstd)}, up to{" "}
            <span className="font-mono text-white">{usd(portableAmount(benefit))}</span> ports to
            your next Florida homestead
            {benefit > SOH_PORT_CAP ? (
              <span className="text-[#e08158]">
                {" "}
                — {usd(benefit - SOH_PORT_CAP)} of your gap is above the {usd(SOH_PORT_CAP)} cap
                and does not transfer
              </span>
            ) : (
              ""
            )}
            . Buy for less and the ported share shrinks proportionally.
          </p>

          <div className="mt-3 max-w-xs">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Price of the home you&rsquo;d buy next (optional)
            </span>
            <input
              inputMode="decimal"
              value={nextPrice}
              placeholder="e.g. 550,000"
              onChange={(e) => setNextPrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-gulf-teal/60 focus:outline-none focus:ring-1 focus:ring-gulf-teal/40"
            />
          </div>
          {port && (
            <p className="mt-3 text-sm text-gray-300">
              At {usd(nextHomePrice!)}: <span className="font-mono text-white">{usd(port.portedReduction)}</span>{" "}
              ports{port.downsized ? " (downsizing is proportional)" : ""}, so your next home
              starts assessed at <span className="font-mono text-white">{usd(port.newAssessed)}</span>{" "}
              instead of {usd(nextHomePrice!)}.
            </p>
          )}

          <p className="mt-3 text-xs leading-5 text-gray-500">
            The clock: establish your next Florida homestead within 3 years of January 1 of the
            year you leave this one, and file the transfer form (DR-501T) with your homestead
            application by March 1 — miss it and the ported amount is $0. Sources:{" "}
            <a href={SOH_SOURCES.dorGuide.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">
              {SOH_SOURCES.dorGuide.label}
            </a>
            {" · "}
            <a href={SOH_SOURCES.statute.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">
              {SOH_SOURCES.statute.label}
            </a>
            .
          </p>
        </div>
      )}

      {parcel && parcel.homesteaded && projection && (
        <div className="mt-4 rounded-xl glass-card-modern border border-white/10 px-4 py-4">
          <div className="inline-flex overflow-hidden rounded-lg border border-white/10">
            {[6, 12].map((mo) => (
              <button
                key={mo}
                type="button"
                onClick={() => setMonths(mo as 6 | 12)}
                className={`px-4 py-1.5 text-sm ${
                  months === mo ? "bg-gulf-teal/20 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {mo} months
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-500">
            <span className="font-mono text-gulf-teal">{SOH_PROJECTION_TAG}</span>{" "}
            {SOH_PROJECTION_BASIS} {SOH_PROJECTION_FALSIFIER}
            {yoyAsOf ? ` (trend through ${monthYearLabel(yoyAsOf) || yoyAsOf}.)` : ""}
          </p>
          <p className="mt-2 text-sm text-gray-300">
            Waiting {months} months, your gap is projected at{" "}
            <span className="font-mono text-white">{usd(projection.projectedBenefit)}</span>, of
            which <span className="font-mono text-white">{usd(projection.projectedPortable)}</span>{" "}
            could port.
            {projection.excessOverCap > 0 && (
              <span className="text-[#e08158]">
                {" "}
                {usd(projection.excessOverCap)} would sit above the cap, unportable.
              </span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Type-check via test suite** — Run: `bun test lib/should-i-sell/` (component compiles under the bundler on import in Task 5; here just confirm libs still green).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/should-i-sell/SohPortability.tsx
git commit -m "feat(should-i-sell): SOH portability client section — gap, port math, clock, cost-of-waiting"
```

---

### Task 5: Page wiring + tax link-out + guards

**Files:**
- Modify: `app/r/should-i-sell/[zip]/page.tsx`
- Modify: `components/should-i-sell/SellNowVsWait.tsx` (tax link-out prop)
- Modify: `lib/should-i-sell/property-tax.ts` (STATUS comment only)
- Modify: `lib/should-i-sell/no-invention.test.ts` (cover the new component + constants)
- Modify: `docs/superpowers/specs/2026-07-19-soh-portability-should-i-sell-design.md` (data-roots nuance correction)

**Interfaces:**
- Consumes: `loadZipSoh`, `loadParcelSoh`, `SohPortability`, `SOH_SOURCES`.
- Produces: the rendered section between MarketSnapshot and the spread; citations extended.

- [ ] **Step 1: Page wiring** — in `app/r/should-i-sell/[zip]/page.tsx`:

Imports to add:

```tsx
import { loadZipSoh } from "@/lib/should-i-sell/load-zip-soh";
import { loadParcelSoh } from "@/lib/should-i-sell/load-parcel-soh";
import { SOH_SOURCES } from "@/lib/should-i-sell/soh-portability";
import SohPortability from "@/components/should-i-sell/SohPortability";
```

Extend the top-level parallel load (line ~75):

```tsx
const [stress, snapshot, zipSoh] = await Promise.all([
  loadSellerStressRead(zip, { place }),
  loadMarketSnapshot(zip, { place }),
  loadZipSoh(zip, res.county_names),
]);
```

In the `addr` branch, hoist `yoyFraction` and add the parcel load (replacing the existing two-way `Promise.all`):

```tsx
let parcelSoh: Awaited<ReturnType<typeof loadParcelSoh>> = null;
let yoyFraction: number | null = null;
if (addr) {
  const [comps, yoy, parcel] = await Promise.all([
    compsForAddress(addr),
    loadZipYoyFraction(zip),
    loadParcelSoh(zip, addr, res.county_names),
  ]);
  yoyFraction = yoy;
  parcelSoh = parcel;
  // …existing v0Estimate/tax/spread logic unchanged, using yoyFraction…
}
```

Tax link-out per county (Lee/Collier only; both URLs verified in-session 07/19/2026):

```tsx
const TAX_LOOKUP: Record<string, { label: string; url: string }> = {
  Lee: { label: "Lee County Tax Collector", url: "https://county-taxes.net/fl-lee/property-tax" },
  Collier: { label: "Collier County Tax Collector", url: "https://collier.county-taxes.com/public" },
};
const taxLookup = TAX_LOOKUP[res.county_names[0] ?? ""] ?? null;
```

Pass `taxLookup={taxLookup}` to `<SellNowVsWait …>`. Render the new section between `{snapshot && <MarketSnapshot …>}` and the spread block:

```tsx
<SohPortability
  place={place}
  zipLine={zipSoh}
  parcel={parcelSoh}
  yoyFraction={yoyFraction}
  yoyAsOf={snapshot?.housing?.source.asOf ?? stress?.dataThrough ?? ""}
/>
```

Citations additions (after the existing pushes):

```tsx
if (zipSoh) sources.push({ label: zipSoh.source.label, url: zipSoh.source.url });
if (parcelSoh?.homesteaded) {
  sources.push({ label: SOH_SOURCES.dorGuide.label, url: SOH_SOURCES.dorGuide.url });
  sources.push({ label: SOH_SOURCES.statute.label, url: SOH_SOURCES.statute.url });
}
```

- [ ] **Step 2: SellNowVsWait link-out** — add to `SellNowVsWaitProps`: `taxLookup: { label: string; url: string } | null;` and under the Property-tax `Field` (after the grid div, or as a sibling under that field's hint) render:

```tsx
{taxLookup && (
  <p className="mt-1 text-xs text-gray-500">
    <a href={taxLookup.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">
      Look up your exact bill — {taxLookup.label} ↗
    </a>
  </p>
)}
```

(Place it directly beneath the Property-tax `Field` by wrapping that field + link in a `<div>` inside the grid cell.)

- [ ] **Step 3: property-tax.ts STATUS update** — replace the `STATUS (2026-07-17)` comment block's endpoint TODO with the probe result (keep the contract unchanged):

```
// STATUS (2026-07-19): PROBED — no fetchable per-parcel bill exists. Both counties run
// Grant Street TaxSys (Lee: county-taxes.net/fl-lee/property-tax; Collier:
// collier.county-taxes.com/public); Collier sits behind Cloudflare bot verification and
// Lee is a client-rendered app — neither is a dependable server-fetch at request time.
// Resolution shipped with the SOH build: the spread's tax field stays user-entry and
// renders a cited per-county link-out. Future upgrade lane: TaxSys /public/reports bulk
// files (check taxsys_bulk_reports_probe). This module stays a null-returning contract.
```

- [ ] **Step 4: no-invention.test.ts extension** —
  - Add `"components/should-i-sell/SohPortability.tsx"` to `COMPONENTS`.
  - Add `"properties-lee-value"` and `"properties-collier-value"` to `BRAIN_SLUGS`.
  - New tests:

```ts
import {
  SOH_PORT_CAP,
  SOH_SOURCES,
  SOH_PROJECTION_TAG,
  SOH_PROJECTION_BASIS,
} from "./soh-portability";

test("SOH constants match their cited primary sources", () => {
  expect(SOH_PORT_CAP).toBe(500_000);
  expect(SOH_SOURCES.statute.url).toContain("leg.state.fl.us");
  expect(SOH_SOURCES.dorGuide.url).toContain("floridarevenue.com");
  expect(SOH_PROJECTION_TAG).toBe("[INFERENCE]");
  expect(SOH_PROJECTION_BASIS).toContain("3%");
});

test("the SOH UI never defaults the next-home price (no invented input)", () => {
  const src = code("components/should-i-sell/SohPortability.tsx");
  expect(src).toContain('useState("")'); // nextPrice starts empty
  expect(src.toLowerCase()).toContain("optional");
});
```

- [ ] **Step 5: Spec nuance correction** — in the spec's Data-roots section, replace the "Definitional nuance" sentence with: both per-ZIP tables share the homestead-portion definition (median (jv_hmstd − av_hmstd)/jv_hmstd, per each table's own note); the just-vs-taxable proxy applies only to Lee's county-level key metric, which this build does not read.

- [ ] **Step 6: Run the full surface test suite**

Run: `bun test lib/should-i-sell/`
Expected: ALL PASS (spread-calc, derive-v0, format-period, property-tax, load-stress-read, load-market-snapshot, condo-share, soh-portability, load-parcel-soh, load-zip-soh, no-invention).

- [ ] **Step 7: Production build**

Run: `bunx next build`
Expected: compiles clean (this is the typecheck gate — never `npx tsc`).

- [ ] **Step 8: Commit**

```bash
git add app/r/should-i-sell/[zip]/page.tsx components/should-i-sell/SellNowVsWait.tsx lib/should-i-sell/property-tax.ts lib/should-i-sell/no-invention.test.ts docs/superpowers/specs/2026-07-19-soh-portability-should-i-sell-design.md
git commit -m "feat(should-i-sell): wire SOH section + county tax-bill link-out; extend no-invention guards"
```

---

### Task 6: Ship + live-verify + ledger

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)
- No other file changes — this task is verification + bookkeeping.

- [ ] **Step 1: Pick real verify addresses from the lake** (never invented) — via the lake MCP:
`SELECT phy_addr1, phy_zipcd FROM pg.data_lake.lee_parcels WHERE phy_zipcd = '33904' AND jv_hmstd > 0 AND av_hmstd > 0 AND jv_hmstd > av_hmstd LIMIT 3` and the same against `pg.data_lake.collier_parcels` with `phy_zipcd = '34112'`. Note one Lee + one Collier address.

- [ ] **Step 2: SESSION_LOG entry** (top of file): what shipped, the probe outcome, checks closed/opened, commits in the bundle.

- [ ] **Step 3: Push the bundle** (spec commit `cd891c21` + Tasks 1–5 + session log, one push):

```bash
git add SESSION_LOG.md
git commit -m "docs(log): SOH portability build shipped — session entry"
OPERATOR_APPROVED_PUSH=1 node scripts/safe-push.mjs
```

Operator authorization: "bundle with build. go" (07/19/2026, this conversation). If safe-push's rebase pulls in foreign commits, STOP and disclose before completing the push (per the safe-push landmine memory).

- [ ] **Step 4: Live-verify on served bytes** (after Vercel deploy completes, ~2–3 min):
  - `https://www.swfldatagulf.com/r/should-i-sell/33904` → ZIP line renders with a real pct + "as of MM/DD/YYYY".
  - Same URL with `?address=<the Lee address from Step 1>` → gap figure, portable line, clock, projection with `[INFERENCE]`.
  - `https://www.swfldatagulf.com/r/should-i-sell/34112?address=<the Collier address>` → same for Collier.
  - A non-homesteaded address → the honest no-homestead line.
  Capture curl/grep output as proof.

- [ ] **Step 5: Close the checks with proof**

```bash
node scripts/check.mjs close soh_portability_should_i_sell_live_verify
node scripts/check.mjs close steady20_soh_cost_of_waiting_calc
node scripts/check.mjs close should_i_sell_property_tax_source
```

(Each close cites the live-verify evidence; the answer-proof/pre-push gates' printed instructions win if they demand a specific proof format.)

---

## Self-Review (done at write time)

- **Spec coverage:** Tier 1 → Task 3+5; Tier 2 → Tasks 1, 2, 4, 5; tax link-out + STATUS → Task 5; checks bookkeeping + live-verify → Task 6; spec's Lee-nuance correction → Task 5 Step 5. `taxsys_bulk_reports_probe` was already opened in-session. No gaps.
- **Placeholder scan:** none — all code complete, all commands exact.
- **Type consistency:** `ParcelSohRow`/`ZipSohLine`/`NextHomePort` names and shapes match across Tasks 2/3/4/5; `taxLookup` prop name consistent between page and component.
