# Outreach Brand Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 12 files, keywords: schema, architecture

**Goal:** Outreach emails resolve each recipient's brand curated-fixture-first (fixture ≥ 0.75 → live scrape → low-confidence fixture → house), and a pilot script grows `fixtures/real-estate-brands/` from 28 to ~100 brokerages via Brandfetch bulk + crawl4ai verify.

**Architecture:** The resolver is a pure wrapper around the outreach engine's existing `enrich` dependency-injection seam (`CampaignDeps.enrich` in `lib/email/outreach/campaign.ts` — `composeCampaign` is NOT modified). A loader reads the fixtures folder at CLI runtime; the pilot is a standalone script that emits new fixture files in the existing schema, never overwriting curated ones.

**Tech Stack:** TypeScript (bun:test), node:fs, existing `enrichBrand` (`lib/prospects/enrich-brand.ts`), Brandfetch Brand API v2 (verified live 07/10/2026), crawl4ai (verification lane, manual follow-up).

**Spec:** `docs/superpowers/specs/2026-07-10-outreach-brand-injection-design.md`
**Check:** `outreach_brand_injection_live_verify`

## Global Constraints

- NO invented colors, ever — a brokerage with no fetchable brand stays absent (RULE 0.7 lint applies to output, not here, but the fixtures feed sendable email: every hex traces to a `source_url`).
- Every new fixture company must appear in `fixtures/real-estate-brands/dbpr-all-corps-lee-collier.json` (06/26 handoff hard rule); unconfirmed API results go to `fixtures/real-estate-brands/unconfirmed/`, never `index.json`.
- API-sourced fixtures: `brand.status: "api"`, `brand.confidence` capped at **0.7** (API never outranks a crawl; resolver trust bar is 0.75, so `"api"` rows intentionally do NOT auto-win over a live scrape).
- Curated fixture files are NEVER overwritten by the pilot (skip if `<slug>.json` exists).
- With an empty fixtures list the resolver must be byte-identical to `enrichBrand` pass-through (tripwire test).
- Brandfetch key: operator-owned free dev account ($0 spend cap); key lives in `.env.local` as `brandfetch_key=…`, read at script runtime, NEVER committed, NEVER `NEXT_PUBLIC`.
- All requests for the domain `brandfetch.com` are quota-free (vendor-verified 07/10/2026) — use it for probes/tests.
- Deno rules don't apply (nothing under `supabase/functions`); `bun test` + `bunx next build` are the gates (never `npx tsc`).
- Commits: explicit paths only, no `git add -A`, SESSION_LOG entry before any push, push only on operator instruction.

---

### Task 1: Fixture loader (`lib/email/outreach/brand-fixtures.ts`)

**Files:**
- Modify: `lib/email/outreach/targets.ts:84` (export `normalizeDomain` — currently module-private)
- Create: `lib/email/outreach/brand-fixtures.ts`
- Test: `lib/email/outreach/brand-fixtures.test.ts`

**Interfaces:**
- Consumes: `fixtures/real-estate-brands/index.json` (`{ brokerages: [{ slug, file, … }] }`) + per-brand files (schema: `docs/handoff/2026-06-26-real-estate-brand-folder.md`; gold standard `fixtures/real-estate-brands/century-21.json`).
- Produces (Task 2 + Task 5 rely on these exact names):

```ts
export interface BrandFixture {
  slug: string;
  company_name: string;
  domain?: string;
  dbpr_name?: string;
  brand: {
    status: "official_guide" | "curated" | "crawled" | "api";
    palette: {
      primaryColor: string;
      accentColor?: string;
      textColor?: string;
      backdropColor?: string;
    };
    confidence: number; // 0..1
    logo_url?: string | null;
    source_url?: string;
    fonts?: string[];
    notes?: string;
  };
}
export interface LoadResult {
  fixtures: BrandFixture[];
  skipped: { file: string; reason: string }[];
}
export async function loadBrandFixtures(dir: string): Promise<LoadResult>;
export function validateFixture(raw: unknown): { ok: true; fixture: BrandFixture } | { ok: false; reason: string };
```

- [ ] **Step 1: Export `normalizeDomain` from targets.ts**

In `lib/email/outreach/targets.ts` line 84, change `function normalizeDomain(` to `export function normalizeDomain(`. Run `bun test lib/email/outreach/` — all existing tests still pass (16+).

- [ ] **Step 2: Write the failing tests**

```ts
// lib/email/outreach/brand-fixtures.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBrandFixtures, validateFixture } from "./brand-fixtures";

const GOOD = {
  slug: "test-realty",
  company_name: "Test Realty",
  domain: "testrealty.com",
  brand: {
    status: "crawled",
    palette: { primaryColor: "#219653", accentColor: "#FFCA00" },
    confidence: 0.85,
    logo_url: "https://testrealty.com/logo.png",
    source_url: "https://testrealty.com",
  },
};

async function writeDir(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brand-fx-"));
  const index = {
    brokerages: Object.keys(files)
      .filter((f) => f.endsWith(".json") && f !== "index.json")
      .map((f) => ({ slug: f.replace(/\.json$/, ""), file: f })),
  };
  await writeFile(join(dir, "index.json"), JSON.stringify(index));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  }
  return dir;
}

describe("validateFixture", () => {
  test("accepts the gold-standard shape", () => {
    const r = validateFixture(GOOD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fixture.slug).toBe("test-realty");
  });
  test("rejects a bad hex", () => {
    const bad = structuredClone(GOOD);
    bad.brand.palette.primaryColor = "green";
    expect(validateFixture(bad).ok).toBe(false);
  });
  test("rejects out-of-range confidence", () => {
    const bad = structuredClone(GOOD);
    bad.brand.confidence = 1.5;
    expect(validateFixture(bad).ok).toBe(false);
  });
  test("rejects a missing palette", () => {
    expect(validateFixture({ slug: "x", company_name: "X", brand: { status: "api", confidence: 0.5 } }).ok).toBe(false);
  });
});

describe("loadBrandFixtures", () => {
  test("loads valid fixtures listed in index.json", async () => {
    const dir = await writeDir({ "test-realty.json": GOOD });
    const { fixtures, skipped } = await loadBrandFixtures(dir);
    expect(fixtures.length).toBe(1);
    expect(fixtures[0]!.domain).toBe("testrealty.com");
    expect(skipped.length).toBe(0);
  });
  test("skips malformed files loudly, loads the rest", async () => {
    const dir = await writeDir({ "test-realty.json": GOOD, "broken.json": "{not json" });
    const { fixtures, skipped } = await loadBrandFixtures(dir);
    expect(fixtures.length).toBe(1);
    expect(skipped.length).toBe(1);
    expect(skipped[0]!.file).toBe("broken.json");
  });
  test("missing index.json → empty result, no throw", async () => {
    const dir = await mkdtemp(join(tmpdir(), "brand-fx-empty-"));
    const { fixtures, skipped } = await loadBrandFixtures(dir);
    expect(fixtures).toEqual([]);
    expect(skipped.length).toBe(1); // index.json itself reported
  });
  test("loads the REAL repo folder without errors", async () => {
    const { fixtures, skipped } = await loadBrandFixtures("fixtures/real-estate-brands");
    expect(fixtures.length).toBeGreaterThanOrEqual(25);
    expect(skipped.filter((s) => s.file !== "agents.json" && s.file !== "dbpr-all-corps-lee-collier.json").length).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test lib/email/outreach/brand-fixtures.test.ts`
Expected: FAIL — `Cannot find module './brand-fixtures'`

- [ ] **Step 4: Implement the loader**

```ts
// lib/email/outreach/brand-fixtures.ts
//
// Loads fixtures/real-estate-brands/ (curated brokerage brand profiles) for the
// outreach brand resolver. Script/CLI runtime ONLY — node:fs, never bundle client-side.
// A malformed file is skipped and reported, never a crash: outreach must not die
// because one brand file rotted.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface BrandFixture {
  slug: string;
  company_name: string;
  domain?: string;
  dbpr_name?: string;
  brand: {
    status: "official_guide" | "curated" | "crawled" | "api";
    palette: {
      primaryColor: string;
      accentColor?: string;
      textColor?: string;
      backdropColor?: string;
    };
    confidence: number;
    logo_url?: string | null;
    source_url?: string;
    fonts?: string[];
    notes?: string;
  };
}

export interface LoadResult {
  fixtures: BrandFixture[];
  skipped: { file: string; reason: string }[];
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const STATUSES = new Set(["official_guide", "curated", "crawled", "api"]);

export function validateFixture(raw: unknown): { ok: true; fixture: BrandFixture } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not an object" };
  const f = raw as Record<string, unknown>;
  if (typeof f.slug !== "string" || !f.slug) return { ok: false, reason: "missing slug" };
  if (typeof f.company_name !== "string" || !f.company_name) return { ok: false, reason: "missing company_name" };
  const brand = f.brand as Record<string, unknown> | undefined;
  if (!brand || typeof brand !== "object") return { ok: false, reason: "missing brand" };
  if (!STATUSES.has(String(brand.status))) return { ok: false, reason: `bad status "${String(brand.status)}"` };
  const conf = brand.confidence;
  if (typeof conf !== "number" || conf < 0 || conf > 1) return { ok: false, reason: "confidence not in 0..1" };
  const palette = brand.palette as Record<string, unknown> | undefined;
  if (!palette || typeof palette !== "object") return { ok: false, reason: "missing palette" };
  if (typeof palette.primaryColor !== "string" || !HEX_RE.test(palette.primaryColor)) {
    return { ok: false, reason: `bad primaryColor "${String(palette.primaryColor)}"` };
  }
  for (const key of ["accentColor", "textColor", "backdropColor"] as const) {
    const v = palette[key];
    if (v !== undefined && (typeof v !== "string" || !HEX_RE.test(v))) {
      return { ok: false, reason: `bad ${key} "${String(v)}"` };
    }
  }
  return { ok: true, fixture: raw as BrandFixture };
}

export async function loadBrandFixtures(dir: string): Promise<LoadResult> {
  const fixtures: BrandFixture[] = [];
  const skipped: LoadResult["skipped"] = [];
  let entries: { slug?: string; file?: string }[];
  try {
    const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
    entries = Array.isArray(index?.brokerages) ? index.brokerages : [];
  } catch (err) {
    skipped.push({ file: "index.json", reason: err instanceof Error ? err.message : String(err) });
    return { fixtures, skipped };
  }
  for (const entry of entries) {
    const file = entry.file ?? `${entry.slug}.json`;
    try {
      const raw = JSON.parse(await readFile(join(dir, file), "utf8"));
      const v = validateFixture(raw);
      if (v.ok) fixtures.push(v.fixture);
      else skipped.push({ file, reason: v.reason });
    } catch (err) {
      skipped.push({ file, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  for (const s of skipped) {
    console.error(`[brand-fixtures] skipped ${s.file}: ${s.reason}`);
  }
  return { fixtures, skipped };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test lib/email/outreach/brand-fixtures.test.ts`
Expected: PASS (8 tests). If the "REAL repo folder" test fails, a real fixture file is malformed — FIX THE FIXTURE FILE (report it), don't loosen the validator. (`agents.json`/`dbpr-all-corps-lee-collier.json` are not in `index.json.brokerages`, so they never reach the loader; the filter in that test is belt-and-suspenders.)

- [ ] **Step 6: Commit**

```bash
git add lib/email/outreach/brand-fixtures.ts lib/email/outreach/brand-fixtures.test.ts lib/email/outreach/targets.ts
git commit -m "feat(outreach): brand fixture loader + validation (fixtures/real-estate-brands)"
```

---

### Task 2: Fixture-first resolver (`lib/email/outreach/brand-resolver.ts`)

**Files:**
- Modify: `lib/prospects/enrich-brand.ts:3-10` (extend the `source` union — additive)
- Create: `lib/email/outreach/brand-resolver.ts`
- Test: `lib/email/outreach/brand-resolver.test.ts`

**Interfaces:**
- Consumes: `BrandFixture` + `normalizeDomain` (Task 1); `BrandEnrichment` from `lib/prospects/enrich-brand.ts`.
- Produces (Task 3 relies on this exact signature):

```ts
export function makeFixtureFirstEnrich(opts: {
  fixtures: BrandFixture[];
  liveEnrich: (domain: string) => Promise<BrandEnrichment>;
  fixtureTrust?: number; // default 0.75
  scrapeTrust?: number;  // default 0.5
}): (domain: string) => Promise<BrandEnrichment>;
```

Resolution ladder (spec §A): fixture ≥ fixtureTrust → live scrape (trusted at ≥ scrapeTrust with a primary) → fixture at any confidence beating the scrape's → the scrape result as-is (campaign's own threshold then routes to house brand). `composeCampaign` is NOT touched: fixture provenance flows because `brandSource` echoes `enriched.source`.

- [ ] **Step 1: Extend the `BrandEnrichment.source` union**

In `lib/prospects/enrich-brand.ts`, change:

```ts
  source: "direct-scrape+haiku" | "fallback";
```

to:

```ts
  source: "direct-scrape+haiku" | "fallback" | `fixture:${string}`;
```

Run: `bun test lib/prospects/` — existing tests pass unchanged (additive union).

- [ ] **Step 2: Write the failing tests**

```ts
// lib/email/outreach/brand-resolver.test.ts
import { describe, expect, test } from "bun:test";
import type { BrandEnrichment } from "@/lib/prospects/enrich-brand";
import type { BrandFixture } from "./brand-fixtures";
import { makeFixtureFirstEnrich } from "./brand-resolver";

const FX = (over: Partial<BrandFixture["brand"]> = {}, domain = "john-r-wood.com"): BrandFixture => ({
  slug: "john-r-wood",
  company_name: "John R. Wood Properties",
  domain,
  brand: {
    status: "crawled",
    palette: { primaryColor: "#219653", accentColor: "#FFCA00" },
    confidence: 0.85,
    logo_url: "https://johnrwood.com/logo.png",
    source_url: "https://johnrwood.com",
    ...over,
  },
});

const scrapeResult = (confidence: number): BrandEnrichment => ({
  primary: "#111111",
  secondary: "#222222",
  logo_url: "https://scraped/logo.png",
  confidence,
  source: "direct-scrape+haiku",
  company_name: "Scraped Name",
});

function liveStub(result: BrandEnrichment) {
  const calls: string[] = [];
  const fn = async (domain: string) => {
    calls.push(domain);
    return result;
  };
  return { fn, calls };
}

describe("makeFixtureFirstEnrich", () => {
  test("high-confidence fixture wins WITHOUT calling the live scrape", async () => {
    const live = liveStub(scrapeResult(0.9));
    const enrich = makeFixtureFirstEnrich({ fixtures: [FX()], liveEnrich: live.fn });
    const r = await enrich("john-r-wood.com");
    expect(r.source).toBe("fixture:john-r-wood");
    expect(r.primary).toBe("#219653");
    expect(r.secondary).toBe("#FFCA00");
    expect(r.company_name).toBe("John R. Wood Properties");
    expect(r.confidence).toBe(0.85);
    expect(live.calls.length).toBe(0); // no scrape spend when the fixture is trusted
  });

  test("domain matching is normalized (www./scheme/case)", async () => {
    const live = liveStub(scrapeResult(0.9));
    const enrich = makeFixtureFirstEnrich({ fixtures: [FX()], liveEnrich: live.fn });
    const r = await enrich("https://WWW.John-R-Wood.com/agents");
    expect(r.source).toBe("fixture:john-r-wood");
  });

  test("low-confidence fixture: scrape runs and a trusted scrape wins", async () => {
    const live = liveStub(scrapeResult(0.8));
    const enrich = makeFixtureFirstEnrich({
      fixtures: [FX({ status: "api", confidence: 0.6 })],
      liveEnrich: live.fn,
    });
    const r = await enrich("john-r-wood.com");
    expect(r.source).toBe("direct-scrape+haiku");
    expect(live.calls).toEqual(["john-r-wood.com"]);
  });

  test("low-confidence fixture still beats a WEAKER scrape", async () => {
    const live = liveStub(scrapeResult(0.2));
    const enrich = makeFixtureFirstEnrich({
      fixtures: [FX({ status: "api", confidence: 0.6 })],
      liveEnrich: live.fn,
    });
    const r = await enrich("john-r-wood.com");
    expect(r.source).toBe("fixture:john-r-wood");
    expect(r.confidence).toBe(0.6);
  });

  test("no fixture → exact live pass-through (byte parity tripwire)", async () => {
    const result = scrapeResult(0.3);
    const live = liveStub(result);
    const enrich = makeFixtureFirstEnrich({ fixtures: [], liveEnrich: live.fn });
    const r = await enrich("unknown.com");
    expect(r).toEqual(result); // identical object content — resolver adds nothing
    expect(live.calls).toEqual(["unknown.com"]);
  });

  test("fixture without a domain never matches", async () => {
    const fx = FX();
    delete fx.domain;
    const live = liveStub(scrapeResult(0.9));
    const enrich = makeFixtureFirstEnrich({ fixtures: [fx], liveEnrich: live.fn });
    const r = await enrich("john-r-wood.com");
    expect(r.source).toBe("direct-scrape+haiku");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test lib/email/outreach/brand-resolver.test.ts`
Expected: FAIL — `Cannot find module './brand-resolver'`

- [ ] **Step 4: Implement the resolver**

```ts
// lib/email/outreach/brand-resolver.ts
//
// Fixture-first brand resolution for outreach. Wraps the CampaignDeps.enrich seam:
// curated fixture (>= fixtureTrust) → live scrape → weaker fixture → scrape as-is.
// composeCampaign is untouched; provenance rides BrandEnrichment.source as
// `fixture:<slug>` and surfaces in the run report's brandSource column.
import type { BrandEnrichment } from "@/lib/prospects/enrich-brand";
import type { BrandFixture } from "./brand-fixtures";
import { normalizeDomain } from "./targets";

export interface ResolverOpts {
  fixtures: BrandFixture[];
  liveEnrich: (domain: string) => Promise<BrandEnrichment>;
  /** Fixture confidence at/above which we trust it outright (no scrape). Default 0.75. */
  fixtureTrust?: number;
  /** Scrape confidence at/above which a scrape beats a weak fixture. Default 0.5. */
  scrapeTrust?: number;
}

function fixtureToEnrichment(f: BrandFixture): BrandEnrichment {
  return {
    primary: f.brand.palette.primaryColor,
    secondary: f.brand.palette.accentColor ?? null,
    logo_url: f.brand.logo_url ?? null,
    confidence: f.brand.confidence,
    source: `fixture:${f.slug}`,
    company_name: f.company_name,
  };
}

export function makeFixtureFirstEnrich(opts: ResolverOpts): (domain: string) => Promise<BrandEnrichment> {
  const fixtureTrust = opts.fixtureTrust ?? 0.75;
  const scrapeTrust = opts.scrapeTrust ?? 0.5;
  const byDomain = new Map<string, BrandFixture>();
  for (const f of opts.fixtures) {
    const key = f.domain ? normalizeDomain(f.domain) : undefined;
    if (key) byDomain.set(key, f);
  }

  return async (domain: string): Promise<BrandEnrichment> => {
    const key = normalizeDomain(domain);
    const fixture = key ? byDomain.get(key) : undefined;

    if (fixture && fixture.brand.confidence >= fixtureTrust) {
      return fixtureToEnrichment(fixture);
    }
    const live = await opts.liveEnrich(domain);
    if (live.confidence >= scrapeTrust && live.primary) return live;
    if (fixture && fixture.brand.confidence > live.confidence) {
      return fixtureToEnrichment(fixture);
    }
    return live;
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test lib/email/outreach/brand-resolver.test.ts`
Expected: PASS (6 tests)

Note: `normalizeDomain(raw)` returns `string | undefined` and handles scheme/`www.`/path/case (targets.ts). If the normalized-matching test fails on the path segment (`/agents`), check what `normalizeDomain` does with paths BEFORE changing anything — mirror its behavior on the fixture side rather than writing a second normalizer.

- [ ] **Step 6: Run the full outreach + prospects suites**

Run: `bun test lib/email/outreach/ lib/prospects/`
Expected: ALL PASS (existing 16+ outreach, enrich-brand suites untouched)

- [ ] **Step 7: Commit**

```bash
git add lib/email/outreach/brand-resolver.ts lib/email/outreach/brand-resolver.test.ts lib/prospects/enrich-brand.ts
git commit -m "feat(outreach): fixture-first brand resolver wrapping the enrich seam"
```

---

### Task 3: CLI wiring + DRY smoke (`scripts/email/outreach-campaign.mts`)

**Files:**
- Modify: `scripts/email/outreach-campaign.mts:32-36` (imports) and `:200-206` (deps) and the summary print
- Test: DRY-run smoke (manual command, zero sends, zero paid calls)

**Interfaces:**
- Consumes: `loadBrandFixtures` (Task 1), `makeFixtureFirstEnrich` (Task 2), existing `enrichBrand`/`composeCampaign`/run-report.
- Produces: run report rows whose `brandSource` can now be `fixture:<slug>`; summary line `fixture_resolved: N`.

- [ ] **Step 1: Wire the resolver into the CLI**

In `scripts/email/outreach-campaign.mts`, add imports next to line 34:

```ts
import { loadBrandFixtures } from "@/lib/email/outreach/brand-fixtures";
import { makeFixtureFirstEnrich } from "@/lib/email/outreach/brand-resolver";
```

Replace the `composeCampaign` deps (line ~200):

```ts
  const { fixtures, skipped } = await loadBrandFixtures("fixtures/real-estate-brands");
  console.log(`brand fixtures: ${fixtures.length} loaded${skipped.length ? `, ${skipped.length} skipped` : ""}`);

  const { messages, summary } = await composeCampaign(rows, {
    enrich: makeFixtureFirstEnrich({ fixtures, liveEnrich: enrichBrand }),
    buildContent,
    siteOrigin: SITE_ORIGIN,
```

(keep the remaining deps lines exactly as they are — `confidenceThreshold`, `postalAddress`).

Where the CLI prints the summary, add one line after it:

```ts
  const fixtureResolved = messages.filter((m) => m.brandSource.startsWith("fixture:")).length;
  console.log(`fixture-resolved brands: ${fixtureResolved}/${messages.length}`);
```

(If `ComposedMessage.brandSource` is typed narrower than `string` and the compiler complains about `startsWith`, widen NOTHING — the Task 2 union extension makes `fixture:${string}` part of the type; use `String(m.brandSource).startsWith(...)` only if genuinely needed.)

- [ ] **Step 2: DRY smoke run — fixture-resolved recipient, zero paid calls**

Create a scratch CSV OUTSIDE the repo (contact lists never commit), e.g. `%TEMP%\smoke-brand.csv`:

```csv
email,name,domain,zip
smoke-test@example.com,Test Agent,john-r-wood.com,33901
```

Run: `bun scripts/email/outreach-campaign.mts --csv <path-to-smoke-brand.csv> --campaign smoke-brand`
(Check the CLI's actual arg names at the top of `main()` before running — use whatever `arg()` defines; DRY_RUN is the default.)

Expected:
- `brand fixtures: 2x loaded` (25+)
- `fixture-resolved brands: 1/1`
- `outreach-runs/<stamp>/run-report.json` row has `"brandSource": "fixture:john-r-wood"`, `"primary": "#219653"`, `"usedHouseBrand": false`
- the preview HTML uses the green (#219653) as the brand primary
- NO Haiku/scrape call happened (fixture ≥ 0.75 short-circuits — verify no scrape log line)

- [ ] **Step 3: Full gates**

Run: `bun test lib/email/` then `bunx eslint scripts/email/outreach-campaign.mts lib/email/outreach/` then `bunx next build`
Expected: suites green (1385+ lib/email), eslint clean, build green (loader is script-context only — if `next build` complains about `node:fs` in a client bundle, something imported `brand-fixtures.ts` from app code: that is a bug, fix the import, not the loader).

- [ ] **Step 4: Commit**

```bash
git add scripts/email/outreach-campaign.mts
git commit -m "feat(outreach): CLI resolves brands fixture-first; run report gains fixture_resolved"
```

---

### Task 4: Brandfetch probe + response mapper (`scripts/outreach/pilot-lib.mts`)

**Files:**
- Create: `scripts/outreach/pilot-lib.mts` (pure functions — no I/O)
- Create: `scripts/outreach/__fixtures__/brandfetch-sample.json` (REAL probe output, committed)
- Test: `scripts/outreach/pilot-lib.test.mts`

**Interfaces:**
- Consumes: raw Brandfetch Brand API v2 JSON (endpoint verified live 07/10/2026: `GET https://api.brandfetch.io/v2/brands/domain/{domain}`, Bearer auth; response skeleton: `{ name, domain, logos: [{ formats: [{ src, background, … }], … }], colors: [{ hex, … }], fonts: [{ name }], qualityScore }` — the reference page ELIDES enum/tag fields, which is why Step 1 probes the real thing).
- Produces (Task 5 relies on):

```ts
export interface BrandfetchBrand { /* pinned from the probe in Step 1 */ }
export function mapToCandidateFixture(raw: BrandfetchBrand, opts: { slug: string; dbprName?: string }): BrandFixture | null;
export function slugFromDomain(domain: string): string;
```

- [ ] **Step 1: Probe the live API with the quota-free domain (operator key required)**

Precondition (operator): free dev account at developers.brandfetch.com, key added to `.env.local` as `brandfetch_key=…`, spend cap set to $0. **If the key is not in `.env.local` yet, STOP this task and do Task 5's dry-run-only steps; resume here when the key lands.**

```powershell
$key = (Select-String -Path .env.local -Pattern '^brandfetch_key=(.+)$').Matches[0].Groups[1].Value
Invoke-RestMethod -Uri "https://api.brandfetch.io/v2/brands/domain/brandfetch.com" -Headers @{ Authorization = "Bearer $key" } | ConvertTo-Json -Depth 8 | Out-File scripts/outreach/__fixtures__/brandfetch-sample.json -Encoding utf8
```

`brandfetch.com` lookups are quota-free (vendor-verified 07/10/2026). Read the saved JSON and NOTE the real discriminators (e.g. whether `logos[]` entries carry `type`/`theme`, whether `colors[]` carry `type: "brand" | "accent" | …`). Update the mapping rules in Step 3 to the REAL fields — the rules below are the default for the skeleton-only case.

- [ ] **Step 2: Write the failing tests (against the committed probe file)**

```ts
// scripts/outreach/pilot-lib.test.mts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateFixture } from "@/lib/email/outreach/brand-fixtures";
import { mapToCandidateFixture, slugFromDomain } from "./pilot-lib";

const sample = JSON.parse(readFileSync(join(import.meta.dir, "__fixtures__", "brandfetch-sample.json"), "utf8"));

describe("slugFromDomain", () => {
  test("kebab-cases the registrable name", () => {
    expect(slugFromDomain("JohnRWood.com")).toBe("johnrwood");
    expect(slugFromDomain("premier-sothebys.com")).toBe("premier-sothebys");
  });
});

describe("mapToCandidateFixture", () => {
  test("maps the real probe payload to a VALID fixture", () => {
    const fx = mapToCandidateFixture(sample, { slug: "brandfetch" });
    expect(fx).not.toBeNull();
    const v = validateFixture(fx!);
    expect(v.ok).toBe(true);
    expect(fx!.brand.status).toBe("api");
    expect(fx!.brand.confidence).toBeLessThanOrEqual(0.7);
    expect(fx!.brand.source_url).toContain("brandfetch");
    expect(fx!.brand.palette.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  test("no colors → null (NEVER an invented palette)", () => {
    const gutted = { ...sample, colors: [] };
    expect(mapToCandidateFixture(gutted, { slug: "x" })).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify fail, then implement the mapper**

Run: `bun test scripts/outreach/pilot-lib.test.mts` → FAIL (module missing). Then:

```ts
// scripts/outreach/pilot-lib.mts
//
// Pure mapping from Brandfetch Brand API v2 payloads to candidate BrandFixture files.
// Rules (adjust ONLY per the committed probe file's real discriminators):
//   primary  = the color marked type:"brand" if that field exists, else colors[0]
//   accent   = the next distinct color (type:"accent" preferred when present)
//   logo_url = first logos[] format src, preferring SVG/PNG with transparent background
//   confidence = min(0.7, qualityScore-derived) — "api" NEVER exceeds 0.7 (spec cap)
// No colors → null. We never invent a palette.
import type { BrandFixture } from "@/lib/email/outreach/brand-fixtures";

export interface BrandfetchBrand {
  name?: string;
  domain?: string;
  logos?: { type?: string; theme?: string; formats?: { src?: string; format?: string; background?: string }[] }[];
  colors?: { hex?: string; type?: string; brightness?: number }[];
  fonts?: { name?: string }[];
  qualityScore?: number;
}

export function slugFromDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]!
    .split(".")
    .slice(0, -1)
    .join("-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function mapToCandidateFixture(
  raw: BrandfetchBrand,
  opts: { slug: string; dbprName?: string },
): BrandFixture | null {
  const colors = (raw.colors ?? []).filter((c) => typeof c.hex === "string" && HEX6.test(c.hex!));
  if (colors.length === 0) return null;
  const primary = colors.find((c) => c.type === "brand") ?? colors[0]!;
  const accent = colors.find((c) => c !== primary && c.type === "accent") ?? colors.find((c) => c !== primary);

  let logoUrl: string | null = null;
  for (const logo of raw.logos ?? []) {
    for (const f of logo.formats ?? []) {
      if (!f.src) continue;
      if (!logoUrl) logoUrl = f.src;
      if (f.background === "transparent" && (f.src.endsWith(".svg") || f.src.endsWith(".png"))) {
        logoUrl = f.src;
        break;
      }
    }
  }

  const quality = typeof raw.qualityScore === "number" ? raw.qualityScore : 0.5;
  const confidence = Math.min(0.7, Math.max(0.3, Math.round(quality * 100) / 100));

  return {
    slug: opts.slug,
    company_name: raw.name ?? opts.slug,
    domain: raw.domain,
    ...(opts.dbprName ? { dbpr_name: opts.dbprName } : {}),
    brand: {
      status: "api",
      palette: {
        primaryColor: primary.hex!,
        ...(accent?.hex ? { accentColor: accent.hex } : {}),
      },
      confidence,
      logo_url: logoUrl,
      source_url: `https://api.brandfetch.io/v2/brands/domain/${raw.domain ?? opts.slug} (fetched ${new Date().toISOString().slice(0, 10)})`,
      ...(raw.fonts?.length ? { fonts: raw.fonts.map((f) => f.name).filter((n): n is string => !!n) } : {}),
      notes: "Brandfetch Brand API candidate — crawl4ai-verify before emailing this brokerage.",
    },
  };
}
```

NOTE on `qualityScore`: the reference shows it as a number but not its RANGE (123 placeholder). Check the probe file: if it's 0..1 use it directly as above; if 0..100 divide by 100. Pin whichever the probe shows and say so in a comment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/outreach/pilot-lib.test.mts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/outreach/pilot-lib.mts scripts/outreach/pilot-lib.test.mts scripts/outreach/__fixtures__/brandfetch-sample.json
git commit -m "feat(outreach): brandfetch probe fixture + pure candidate-fixture mapper"
```

---

### Task 5: Pilot CLI (`scripts/outreach/brand-pilot.mts`)

**Files:**
- Create: `scripts/outreach/brand-pilot.mts`
- Test: dry-run smoke (no key needed) + one live single-domain run (key + operator go)

**Interfaces:**
- Consumes: `mapToCandidateFixture`/`slugFromDomain` (Task 4), `validateFixture`/`loadBrandFixtures` (Task 1), `fixtures/real-estate-brands/dbpr-all-corps-lee-collier.json` (corp confirmation), `.env.local` `brandfetch_key`.
- Produces: new `fixtures/real-estate-brands/<slug>.json` files (`status:"api"`), `index.json` entries, `fixtures/real-estate-brands/unconfirmed/<slug>.json` for non-DBPR-confirmed brands, and a run report `outreach-runs/brand-pilot-<stamp>.json`.

Modes:
- `--rank <RE_rgn7.csv>` → prints top brokerages by active Lee/Collier licensee count (Employer's Name frequency) — the fetch worklist. The DBPR file is downloaded manually: `curl -L -o RE_rgn7.csv "https://www2.myfloridalicense.com/sto/file_download/extracts/RE_rgn7.csv"` (keep it OUTSIDE the repo).
- `--domains <file>` → one domain per line, the fetch list (domains curated by operator/session from the rank output; name→domain automation is deliberately OUT — wrong-domain brands are worse than none).
- Default DRY: prints the plan (which domains would fetch, which are skipped as already-curated). `--live` + key present → real fetches.

- [ ] **Step 1: Write the CLI**

```ts
// scripts/outreach/brand-pilot.mts
//
// Brand-at-scale pilot: Brandfetch bulk → candidate fixtures (status:"api", conf ≤ 0.7).
// SAFE BY DEFAULT — dry-run unless --live AND brandfetch_key is in .env.local.
// NEVER overwrites an existing fixture file. Companies not in the DBPR corp list land
// in unconfirmed/, not index.json (06/26 hard rule).
//
// Usage:
//   bun scripts/outreach/brand-pilot.mts --rank <RE_rgn7.csv>
//   bun scripts/outreach/brand-pilot.mts --domains <domains.txt> [--live]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadBrandFixtures, validateFixture } from "@/lib/email/outreach/brand-fixtures";
import { mapToCandidateFixture, slugFromDomain, type BrandfetchBrand } from "./pilot-lib";

const BRANDS_DIR = "fixtures/real-estate-brands";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const LIVE = process.argv.includes("--live");

async function readKey(): Promise<string | undefined> {
  try {
    const env = await readFile(".env.local", "utf8");
    return env.match(/^brandfetch_key=(.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function rankMode(csvPath: string): Promise<void> {
  const text = await readFile(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const iEmployer = header.findIndex((h) => h.includes("employer") && h.includes("name"));
  const iCounty = header.findIndex((h) => h.includes("county"));
  const iStatus = header.findIndex((h) => h.includes("primary") && h.includes("status"));
  if (iEmployer < 0 || iCounty < 0) {
    throw new Error(`RE_rgn7 header not recognized — inspect the CSV first. Saw: ${header.join(" | ")}`);
  }
  const counts = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cells = line.split(","); // NOTE: verify the real file has no quoted commas before trusting this split
    const county = cells[iCounty]?.trim().toLowerCase();
    if (county !== "lee" && county !== "collier") continue;
    if (iStatus >= 0 && !/current/i.test(cells[iStatus] ?? "")) continue;
    const employer = cells[iEmployer]?.trim();
    if (!employer) continue;
    counts.set(employer, (counts.get(employer) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100);
  for (const [name, n] of top) console.log(`${String(n).padStart(6)}  ${name}`);
  console.log(`\n${counts.size} distinct employers; top 100 above. Curate domains into a --domains file.`);
}

async function fetchMode(domainsPath: string): Promise<void> {
  const key = await readKey();
  const domains = (await readFile(domainsPath, "utf8"))
    .split(/\r?\n/)
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d && !d.startsWith("#"));

  const { fixtures } = await loadBrandFixtures(BRANDS_DIR);
  const held = new Set(fixtures.map((f) => f.domain).filter(Boolean));
  const corpText = await readFile(join(BRANDS_DIR, "dbpr-all-corps-lee-collier.json"), "utf8");
  const corpHaystack = corpText.toUpperCase();

  const plan = domains.map((d) => ({
    domain: d,
    slug: slugFromDomain(d),
    action: held.has(d)
      ? "skip: fixture already held"
      : existsSync(join(BRANDS_DIR, `${slugFromDomain(d)}.json`))
        ? "skip: file exists (never overwrite)"
        : "fetch",
  }));
  for (const p of plan) console.log(`${p.action.padEnd(32)} ${p.domain}`);
  const toFetch = plan.filter((p) => p.action === "fetch");
  console.log(`\n${toFetch.length}/${domains.length} to fetch.`);

  if (!LIVE || !key) {
    console.log(!key ? "No brandfetch_key in .env.local — dry-run only." : "DRY RUN (pass --live to fetch).");
    return;
  }

  await mkdir(join(BRANDS_DIR, "unconfirmed"), { recursive: true });
  const report: object[] = [];
  const indexPath = join(BRANDS_DIR, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));

  for (const p of toFetch) {
    const res = await fetch(`https://api.brandfetch.io/v2/brands/domain/${p.domain}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    console.log(
      `${p.domain}: HTTP ${res.status} (quota ${res.headers.get("x-api-key-approximate-usage") ?? "?"}/${res.headers.get("x-api-key-quota") ?? "?"})`,
    );
    if (res.status === 429) {
      console.error("Quota reached — stopping.");
      break;
    }
    if (!res.ok) {
      report.push({ domain: p.domain, status: res.status });
      continue;
    }
    const raw = (await res.json()) as BrandfetchBrand;
    const fx = mapToCandidateFixture(raw, { slug: p.slug });
    if (!fx) {
      report.push({ domain: p.domain, status: "no-colors" });
      continue;
    }
    const v = validateFixture(fx);
    if (!v.ok) {
      report.push({ domain: p.domain, status: `invalid: ${v.reason}` });
      continue;
    }
    const confirmed = corpHaystack.includes((fx.company_name ?? "").toUpperCase());
    const outPath = confirmed
      ? join(BRANDS_DIR, `${p.slug}.json`)
      : join(BRANDS_DIR, "unconfirmed", `${p.slug}.json`);
    await writeFile(outPath, JSON.stringify(fx, null, 2) + "\n");
    if (confirmed) {
      index.brokerages.push({
        slug: p.slug,
        company_name: fx.company_name,
        type: "unknown",
        counties: [],
        primary: fx.brand.palette.primaryColor,
        accent: fx.brand.palette.accentColor ?? null,
        confidence: fx.brand.confidence,
        file: `${p.slug}.json`,
      });
    }
    report.push({ domain: p.domain, status: confirmed ? "written" : "unconfirmed", file: outPath });
    await new Promise((r) => setTimeout(r, 250));
  }

  await writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir("outreach-runs", { recursive: true });
  await writeFile(join("outreach-runs", `brand-pilot-${stamp}.json`), JSON.stringify(report, null, 2));
  console.log(`\nReport: outreach-runs/brand-pilot-${stamp}.json`);
  console.log("NEXT: crawl4ai-verify the top-20 send targets before any email uses an \"api\" fixture at trust.");
}

const rank = arg("rank");
const domains = arg("domains");
if (rank) await rankMode(rank);
else if (domains) await fetchMode(domains);
else console.log("Usage: --rank <RE_rgn7.csv> | --domains <file> [--live]");
```

- [ ] **Step 2: Dry-run smoke (no key needed)**

Create `%TEMP%\pilot-domains.txt`:

```
john-r-wood.com
mvprealty.com
some-new-brokerage.com
```

Run: `bun scripts/outreach/brand-pilot.mts --domains %TEMP%\pilot-domains.txt`
Expected: `skip: fixture already held` for the two held domains, `fetch` for the new one, then "dry-run only"/"DRY RUN" line, ZERO network calls, zero files written.

- [ ] **Step 3: Rank-mode smoke (needs the DBPR file)**

```powershell
curl -L -o "$env:TEMP\RE_rgn7.csv" "https://www2.myfloridalicense.com/sto/file_download/extracts/RE_rgn7.csv"
bun scripts/outreach/brand-pilot.mts --rank "$env:TEMP\RE_rgn7.csv"
```

Expected: top-100 employer list with counts. **First run: eyeball the raw CSV header + a few rows first** — if employer names contain quoted commas, the naive `split(",")` undercounts; switch the parser to reuse `splitCsvLine` from `lib/email/outreach/targets.ts` (export it, same pattern as `normalizeDomain`) BEFORE trusting the ranking.

- [ ] **Step 4: Single-domain live probe (operator key + go required)**

Run: `bun scripts/outreach/brand-pilot.mts --domains <file-with-ONE-new-domain> --live`
Expected: HTTP 200 + quota header line, one candidate fixture written (confirmed → `fixtures/real-estate-brands/`, else `unconfirmed/`), `index.json` updated, report file written. Re-run `bun test lib/email/outreach/brand-fixtures.test.ts` — the "REAL repo folder" test still passes (the new file validates).

- [ ] **Step 5: Commit (pilot code + any confirmed fixture files from the probe)**

```bash
git add scripts/outreach/brand-pilot.mts fixtures/real-estate-brands/
git commit -m "feat(outreach): brand-pilot CLI — DBPR ranking + Brandfetch bulk candidates"
```

---

### Task 6: Final gates + live-verify evidence

**Files:**
- Modify: `SESSION_LOG.md` (entry), `_AUDIT_AND_ROADMAP/build-queue.md` (sync)

- [ ] **Step 1: Full test + lint + build gates**

Run: `bun test lib/email/ lib/prospects/ scripts/outreach/` then `bunx eslint lib/email/outreach/ scripts/outreach/ scripts/email/outreach-campaign.mts` then `bunx next build`
Expected: all green.

- [ ] **Step 2: Live-verify evidence (closes `outreach_brand_injection_live_verify`)**

One real DRY outreach run (Task 3 Step 2 command) over a CSV whose recipients include ≥1 fixture-held domain: run-report shows `brandSource: "fixture:<slug>"` with the fixture's exact `primary` hex, preview HTML renders those colors. Save the run-report path as evidence, then:

```bash
node scripts/check.mjs close outreach_brand_injection_live_verify
```

(If the operator wants the check to stay open until a LIVE send uses a fixture brand, leave it open and note the DRY evidence in the check instead — ask, don't assume.)

- [ ] **Step 3: SESSION_LOG + build-queue sync + commit**

Append the SESSION_LOG entry (what shipped, test counts, evidence path); sync `_AUDIT_AND_ROADMAP/build-queue.md`; commit docs. Push ONLY on operator instruction.

---

## Deliberately OUT (spec §Out-of-scope + rulings)

- Contact factory → `docs/handoff/2026-07-10-agent-contact-factory-handoff.md` (`agent_contact_factory_build`). NOTE for that build: extra CSV columns (`brokerage`, `license_number`) require extending the header-detection `KNOWN` list in `targets.ts` — an unknown header cell makes the parser treat the header as data.
- Brokerage-NAME matching in the resolver — cut (YAGNI): the factory fills `domain` from its brokerage join, so domain matching covers it; `dbpr_name` stays in fixtures for the factory's use.
- T1 brand-offer copy line + demo-email compliance footer — ride the funnel demo email build (its 13 commits own `renderDripEmail`); arrival brand preload already works via `buildArrivalUrl({ brand })`.
- Name→domain automation (Brandfetch Search API) — manual domain curation for the pilot; wrong-domain brands are worse than none.
- logo.dev — fallback vendor only if Brandfetch free tier disappoints.
