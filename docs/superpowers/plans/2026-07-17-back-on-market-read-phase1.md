# Back on Market read — Phase 1 (Lane 1 ZIP read) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 8 files, keywords: architecture

**Goal:** Ship the address/ZIP-first "Back on the Market" read that answers "how often do deals fall through and homes come back *here*" from data we already publish — no ingest work.

**Architecture:** A server page at `/r/back-on-market?q=<zip|address>` resolves the input to a Lee/Collier ZIP, a loader reads that ZIP's cancellation/relist/delist rates from the already-live `seller-stress-swfl` brain output, and a client component renders them with a buyer/seller toggle, a cited national frame, and a provenance panel. Empty-tolerant end to end; Lane 2 (per-home relist fact) is a later phase.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, `bun:test`, existing `loadParsedBrain` / `resolveZip` / `geocodeAddress` helpers.

**Spec:** `docs/superpowers/specs/2026-07-17-back-on-market-read-design.md`
**Research (LOCAL/gitignored):** `docs/steadyapi-research/2026-07-17-back-on-market-surface-research.md`
**Closes:** build check `back_on_market_read_live_verify`

## Global Constraints

- **Never invent a number.** Every figure names a real source (our data → upload → named web source → user figure). A gap degrades to the next lane, never a guess. (FOCUS rule 1 / RULE 0.7)
- **Never the word "stigmatized"** in any user-facing string — legal term of art (FL Statute 689.25). Internal research label only.
- **Never assert a specific home's fall-through reason** in Lane 1 (it is ZIP-grain context only).
- **As-of dates are MM/DD/YYYY, stated once.** Never the raw `SWFL-…` token.
- **Never frame the product as "ZIP-level."** Grain and source are unconstrained (FOCUS rule 3).
- **Plain output, sourced.** Citations read "SWFL Data Gulf" / the named web source; never a vendor deep-link.
- **Verify with `bunx next build`, not `npx tsc`.** Lint: `react-hooks/set-state-in-effect` is a hard error.
- **Core scope is Lee (12071) + Collier (12021).** Out-of-scope input degrades to an ask, never a fabricated rate.

---

### Task 1: `loadBackOnMarketZip` loader + national-frame constant

**Files:**
- Create: `lib/back-on-market/national-frame.ts`
- Create: `lib/back-on-market/load-zip.ts`
- Test: `lib/back-on-market/load-zip.test.ts`

**Interfaces:**
- Consumes: `loadParsedBrain(id)` from `lib/fetch-brain` — returns `{ output: { detail_tables?: {id, title, rows: {key, cells}[], source: {url, citation, fetched_at} }[] } }`.
- Produces:
  - `NATIONAL_FALLTHROUGH` (const, `lib/back-on-market/national-frame.ts`).
  - `interface BackOnMarketZip { zip; place; cancellationRatePct: number|null; relistRatePct: number|null; delistRatePct: number|null; stressScore: number|null; asOf: string; source: {label:string; url:string} }`
  - `loadBackOnMarketZip(zip: string, deps?: { loadBrain?: typeof loadParsedBrain; place?: string }): Promise<BackOnMarketZip | null>`

- [ ] **Step 1: Write the national-frame constant** (verified value, cited — NOT invented)

```ts
// lib/back-on-market/national-frame.ts
//
// The national contract-cancellation frame — a Lane-3 named-source figure, VERIFIED
// via crawl4ai of the live Redfin /news/ page 07/17/2026 (not a search summary).
// Real, cited, dated. REFRESH MONTHLY (Redfin publishes ~mid-month); bump `asOf` +
// the value together, never edit one alone. Never rendered without its as-of date.
export const NATIONAL_FALLTHROUGH = {
  ratePct: 13.6,
  asOf: "05/01/2026",
  note: "unchanged for four straight months; the U.S. rate has held 13.4–14% for two years — about 1 in 7 deals, the current normal, not a spike",
  leaders:
    "Atlanta led at 18.8%; Fort Worth, TX and Jacksonville, FL were close behind (~18%), and 3 of the 10 highest-cancellation metros were in Florida",
  source: {
    label: "Redfin",
    url: "https://www.redfin.com/news/contract-cancellations-may-2026/",
  },
} as const;
```

- [ ] **Step 2: Write the failing loader test**

```ts
// lib/back-on-market/load-zip.test.ts
import { expect, test } from "bun:test";
import { loadBackOnMarketZip } from "./load-zip";

// A minimal fake seller-stress brain: one scored ZIP (33904), one suppressed (33999).
const fakeBrain = {
  output: {
    detail_tables: [
      {
        id: "seller_stress_by_zip",
        title: "SWFL seller stress by ZIP — 2026-03-01 (vs 2019–2021 baseline)",
        source: {
          url: "https://www.redfin.com/news/data-center/",
          citation: "Redfin Data Center — price_drops, contract_cancellations, delistings_relistings.",
          fetched_at: "2026-07-12T04:17:26Z",
        },
        rows: [
          { key: "33904", label: "33904", cells: {
            cancellation_rate_pct: 14.2, share_relisted_pct: 6.1,
            share_delisted_pct: 11.8, seller_stress_score: 71 } },
          { key: "33999", label: "33999", cells: {
            cancellation_rate_pct: null, share_relisted_pct: null,
            share_delisted_pct: null, seller_stress_score: null } },
        ],
      },
    ],
  },
};
const deps = { loadBrain: async () => fakeBrain as never, place: "Cape Coral" };

test("reads a scored ZIP's rates + as-of from the seller-stress table", async () => {
  const r = await loadBackOnMarketZip("33904", deps);
  expect(r).not.toBeNull();
  expect(r!.cancellationRatePct).toBe(14.2);
  expect(r!.relistRatePct).toBe(6.1);
  expect(r!.delistRatePct).toBe(11.8);
  expect(r!.asOf).toBe("03/01/2026"); // parsed from the table title, MM/DD/YYYY
  expect(r!.source.label).toContain("Redfin");
});

test("a suppressed ZIP returns the row with null rates (never a guessed number)", async () => {
  const r = await loadBackOnMarketZip("33999", deps);
  expect(r).not.toBeNull();
  expect(r!.cancellationRatePct).toBeNull();
});

test("a ZIP absent from the table returns null (caller degrades)", async () => {
  const r = await loadBackOnMarketZip("00000", deps);
  expect(r).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test lib/back-on-market/load-zip.test.ts`
Expected: FAIL — "Cannot find module './load-zip'".

- [ ] **Step 4: Write the loader**

```ts
// lib/back-on-market/load-zip.ts
//
// Lane 1 read: a ZIP's contract-cancellation / relist / delist rates, straight off the
// already-live seller-stress-swfl brain output (its `seller_stress_by_zip` detail table).
// Zero ingest, zero metered calls. Empty-tolerant: an absent ZIP → null; a suppressed ZIP
// → the row with null rates (NEVER a guessed number). The as-of is the Redfin data period
// parsed from the table title, written MM/DD/YYYY (the number is ~4 months lagged by
// Redfin's rolling monthly cadence — that date is stated plainly, it is not "today").
import { loadParsedBrain } from "../fetch-brain";

export interface BackOnMarketZip {
  zip: string;
  place: string;
  cancellationRatePct: number | null;
  relistRatePct: number | null;
  delistRatePct: number | null;
  stressScore: number | null;
  asOf: string;
  source: { label: string; url: string };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** First ISO date in the table title → MM/DD/YYYY; fallback to the source fetched_at date. */
function asOfFrom(title: string, fetchedAt: string): string {
  const iso = title.match(/(\d{4})-(\d{2})-(\d{2})/) ?? fetchedAt.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[2]}/${iso[3]}/${iso[1]}` : "";
}

export async function loadBackOnMarketZip(
  zip: string,
  deps: { loadBrain?: typeof loadParsedBrain; place?: string } = {},
): Promise<BackOnMarketZip | null> {
  const loadBrain = deps.loadBrain ?? loadParsedBrain;
  const brain = await loadBrain("seller-stress-swfl");
  const table = brain?.output?.detail_tables?.find((t) => t.id === "seller_stress_by_zip");
  if (!table) return null;
  const row = table.rows.find((r) => r.key === zip);
  if (!row) return null;
  return {
    zip,
    place: deps.place ?? zip,
    cancellationRatePct: num(row.cells["cancellation_rate_pct"]),
    relistRatePct: num(row.cells["share_relisted_pct"]),
    delistRatePct: num(row.cells["share_delisted_pct"]),
    stressScore: num(row.cells["seller_stress_score"]),
    asOf: asOfFrom(table.title ?? "", table.source?.fetched_at ?? ""),
    source: { label: table.source?.citation ?? "Redfin Data Center", url: table.source?.url ?? "" },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test lib/back-on-market/load-zip.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/back-on-market/national-frame.ts lib/back-on-market/load-zip.ts lib/back-on-market/load-zip.test.ts
git commit -m "feat(back-on-market): Lane 1 ZIP loader + national frame constant"
```

---

### Task 2: `BackOnMarketRead` component (both-sides toggle, provenance)

**Files:**
- Create: `components/back-on-market/BackOnMarketRead.tsx`
- Test: `components/back-on-market/back-on-market-read.test.tsx`

**Interfaces:**
- Consumes: `BackOnMarketZip` (Task 1), `NATIONAL_FALLTHROUGH` (Task 1).
- Produces: `default function BackOnMarketRead({ data }: { data: BackOnMarketZip })` — a client component with an internal buyer/seller toggle.

- [ ] **Step 1: Write the failing render test**

```tsx
// components/back-on-market/back-on-market-read.test.tsx
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import BackOnMarketRead from "./BackOnMarketRead";
import type { BackOnMarketZip } from "@/lib/back-on-market/load-zip";

const data: BackOnMarketZip = {
  zip: "33904", place: "Cape Coral",
  cancellationRatePct: 14.2, relistRatePct: 6.1, delistRatePct: 11.8, stressScore: 71,
  asOf: "03/01/2026", source: { label: "Redfin Data Center", url: "https://www.redfin.com/news/data-center/" },
};

test("renders the local rate, the as-of date, and never the word stigmatized", () => {
  const html = renderToStaticMarkup(<BackOnMarketRead data={data} />);
  expect(html).toContain("14.2");
  expect(html).toContain("03/01/2026");
  expect(html).toContain("Cape Coral");
  expect(html.toLowerCase()).not.toContain("stigmatiz");
});

test("renders the cited national frame value", () => {
  const html = renderToStaticMarkup(<BackOnMarketRead data={data} />);
  expect(html).toContain("13.6");
  expect(html).toContain("Redfin");
});

test("a suppressed ZIP shows the neutral truth without a fabricated rate", () => {
  const html = renderToStaticMarkup(<BackOnMarketRead data={{ ...data, cancellationRatePct: null, relistRatePct: null, delistRatePct: null }} />);
  expect(html.toLowerCase()).toContain("no fault of");
  expect(html).not.toContain("14.2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test components/back-on-market/back-on-market-read.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// components/back-on-market/BackOnMarketRead.tsx
"use client";
//
// The Back on the Market read. One engine, a buyer/seller toggle. Shows the LOCAL
// contract-cancellation / relist rate (our data) against the national frame (cited),
// then the neutral truth: a returned listing is usually buyer-side, no fault of the
// seller, and often means leverage. NEVER the word "stigmatized"; NEVER a per-home
// reason (this is ZIP-grain context). Every number carries its source + as-of.
import { useState } from "react";
import { NATIONAL_FALLTHROUGH } from "@/lib/back-on-market/national-frame";
import type { BackOnMarketZip } from "@/lib/back-on-market/load-zip";

const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

export default function BackOnMarketRead({ data }: { data: BackOnMarketZip }) {
  const [side, setSide] = useState<"buyer" | "seller">("buyer");
  const hasLocal = data.cancellationRatePct != null;

  return (
    <section className="bom-read">
      <div className="bom-toggle" role="tablist" aria-label="Point of view">
        <button role="tab" aria-selected={side === "buyer"} className={`filter-pill${side === "buyer" ? " active" : ""}`} onClick={() => setSide("buyer")}>Buying</button>
        <button role="tab" aria-selected={side === "seller"} className={`filter-pill${side === "seller" ? " active" : ""}`} onClick={() => setSide("seller")}>Selling</button>
      </div>

      <h1 className="bom-hero">
        {hasLocal
          ? <>About <strong>{pct(data.cancellationRatePct)}</strong> of pending deals in {data.place} fall out of contract</>
          : <>How often deals fall through in {data.place}</>}
      </h1>
      {hasLocal && (
        <p className="bom-sub">
          Relists {pct(data.relistRatePct)} · delistings {pct(data.delistRatePct)} — as of {data.asOf}.
        </p>
      )}

      <p className="bom-truth">
        A home back on the market has usually fallen out of contract for buyer-side reasons —
        financing, cold feet, an appraisal or inspection gap, and in Southwest Florida often
        insurance — <strong>no fault of the seller</strong>. Nationally {NATIONAL_FALLTHROUGH.ratePct}%
        of deals fall through ({NATIONAL_FALLTHROUGH.note}; {NATIONAL_FALLTHROUGH.leaders}), so a
        return to market is common, not a red flag.
      </p>

      <p className="bom-side">
        {side === "buyer"
          ? "For a buyer: a returned listing is often leverage, not damaged goods — the seller is motivated and the deal history is public. What it does not tell you is why this specific contract ended; the record does not say, and neither will we."
          : "For a seller: a relist is common here — the numbers above are the context to hand a buyer up front. Leverage cuts both ways; the story is the market, not your home."}
      </p>

      <details className="bom-sources">
        <summary>Where these numbers come from</summary>
        <ul>
          <li>Local rates: SWFL Data Gulf, from {data.source.label} — as of {data.asOf}.</li>
          <li>National: {NATIONAL_FALLTHROUGH.source.label}, as of {NATIONAL_FALLTHROUGH.asOf} — {NATIONAL_FALLTHROUGH.source.url}.</li>
        </ul>
      </details>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test components/back-on-market/back-on-market-read.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/back-on-market/BackOnMarketRead.tsx components/back-on-market/back-on-market-read.test.tsx
git commit -m "feat(back-on-market): both-sides read component with provenance"
```

---

### Task 3: Page route `/r/back-on-market`

**Files:**
- Create: `app/r/back-on-market/page.tsx`
- Test: `app/r/back-on-market/resolve-q.test.ts`

**Interfaces:**
- Consumes: `loadBackOnMarketZip` (Task 1), `BackOnMarketRead` (Task 2), `resolveZip` (`refinery/lib/zip-resolver.mts`), `geocodeAddress` (`lib/geo/geocode-address`).
- Produces: `resolveQtoZip(q, deps)` (pure, exported for test) + the default page.

- [ ] **Step 1: Write the failing resolver test**

```ts
// app/r/back-on-market/resolve-q.test.ts
import { expect, test } from "bun:test";
import { resolveQToZip } from "./page";

test("a bare 5-digit query is used as the ZIP directly", async () => {
  const r = await resolveQToZip("33904", { geocode: async () => null });
  expect(r).toEqual({ zip: "33904", place: undefined });
});

test("an address is geocoded to its ZIP", async () => {
  const r = await resolveQToZip("326 Shore Dr, Fort Myers", {
    geocode: async () => ({ zip: "33905", countyFips: "12071", matchedAddress: "326 Shore Dr" }) as never,
  });
  expect(r?.zip).toBe("33905");
});

test("an empty query resolves to null", async () => {
  const r = await resolveQToZip("", { geocode: async () => null });
  expect(r).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test app/r/back-on-market/resolve-q.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the page + resolver**

```tsx
// app/r/back-on-market/page.tsx
//
// The Back on the Market read route: /r/back-on-market?q=<zip|address>. Resolves the
// input to a Lee/Collier ZIP (bare 5-digit used directly; an address geocoded), loads
// that ZIP's Lane-1 rates, and renders the both-sides read. Empty-tolerant: no q, an
// out-of-scope place, or a ZIP with no row → a plain ask, never a fabricated rate.
import { geocodeAddress, type GeocodeFn } from "@/lib/geo/geocode-address";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { loadBackOnMarketZip } from "@/lib/back-on-market/load-zip";
import BackOnMarketRead from "@/components/back-on-market/BackOnMarketRead";

const BARE_ZIP = /^\d{5}$/;

/** q → { zip, place } or null. Pure; the geocoder is injectable for tests. */
export async function resolveQToZip(
  q: string,
  deps: { geocode?: GeocodeFn } = {},
): Promise<{ zip: string; place?: string } | null> {
  const s = (q ?? "").trim();
  if (!s) return null;
  if (BARE_ZIP.test(s)) return { zip: s, place: undefined };
  const geo = await geocodeAddress(s, deps.geocode ? { geocode: deps.geocode } : {});
  if (!geo?.zip) return null;
  return { zip: geo.zip, place: undefined };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const resolved = await resolveQToZip(q);
  const inScope = resolved ? resolveZip(resolved.zip).in_scope : false;
  const data = resolved && inScope ? await loadBackOnMarketZip(resolved.zip) : null;

  if (!data) {
    return (
      <main className="bom-empty">
        <h1>Back on the Market</h1>
        <p>Enter a Lee or Collier County ZIP or address to see how often deals fall through and homes come back there.</p>
      </main>
    );
  }
  return <main><BackOnMarketRead data={data} /></main>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test app/r/back-on-market/resolve-q.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify the build compiles**

Run: `bunx next build`
Expected: build succeeds, `/r/back-on-market` in the route list.

- [ ] **Step 6: Commit**

```bash
git add app/r/back-on-market/page.tsx app/r/back-on-market/resolve-q.test.ts
git commit -m "feat(back-on-market): /r/back-on-market read route (address/ZIP-first)"
```

---

### Task 4: No-invention / naming guard

**Files:**
- Test: `lib/back-on-market/no-invention.test.ts`

**Interfaces:**
- Consumes: the three source modules (Tasks 1–2) as text.

- [ ] **Step 1: Write the guard test**

```ts
// lib/back-on-market/no-invention.test.ts
// Structural guard: no user-facing string in this surface may use the legal term
// "stigmatiz*", and Lane 1 copy must never assert a per-home reason ("this home
// fell through", "the seller was"). Cheap, catches a regression at edit time.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const files = [
  "components/back-on-market/BackOnMarketRead.tsx",
  "lib/back-on-market/national-frame.ts",
  "lib/back-on-market/load-zip.ts",
];

test("no surface string uses the legal term 'stigmatized'", () => {
  for (const f of files) {
    expect(readFileSync(f, "utf8").toLowerCase()).not.toContain("stigmatiz");
  }
});

test("Lane 1 copy never claims a specific home's reason", () => {
  const html = readFileSync("components/back-on-market/BackOnMarketRead.tsx", "utf8").toLowerCase();
  for (const banned of ["this home fell through", "the seller was motivated", "this contract fell through because"]) {
    expect(html).not.toContain(banned);
  }
});
```

- [ ] **Step 2: Run the guard test**

Run: `bun test lib/back-on-market/no-invention.test.ts`
Expected: PASS (both tests).

- [ ] **Step 3: Commit**

```bash
git add lib/back-on-market/no-invention.test.ts
git commit -m "test(back-on-market): no-invention + never-stigmatized guard"
```

---

## Phase-1 exit / live-verify

- [ ] Run the full new suite: `bun test lib/back-on-market components/back-on-market app/r/back-on-market`
- [ ] `bunx next build` clean.
- [ ] Live-verify (closes `back_on_market_read_live_verify`): serve a prod build, open `/r/back-on-market?q=33904` (a real Cape Coral ZIP), screenshot both buyer/seller views, confirm the shown cancellation rate equals the live `seller-stress-swfl` value for that ZIP and the as-of date renders MM/DD/YYYY. Then `node scripts/check.mjs close back_on_market_read_live_verify`.
- [ ] SESSION_LOG entry before any push.

## Deferred to later phases (NOT Phase 1)

- **Entry point:** a link/affordance from the ZIP report or a HeroBar mode into `/r/back-on-market`. Phase 1 ships the route standalone (shareable/bookmarkable); wiring is small follow-up.
- **Phase 2:** flicker-resistant relist detector (≥7d off-market) + relist count in `listing_transitions_recent_zip_stats` + a `relist_rate` metric on `listing-momentum-swfl` (brain-first gate).
- **Phase 3:** Lane 2 per-home relist fact overlay on the page.
- **Phase 4:** "Send it" → `lib/deliverable/recipes/back-on-market.ts` built on `buildLifecycleEmail`.

## Self-review

- **Spec coverage:** Lane 1 data (Task 1), both-sides framing + provenance (Task 2), address-first route + degradation (Task 3), never-stigmatized/no-reason boundary (Tasks 2+4), MM/DD/YYYY as-of (Tasks 1+2). Lane 2 / detector / deliverable are explicitly deferred with their own phases. ✓
- **Placeholder scan:** every step has real code/commands. ✓
- **Type consistency:** `BackOnMarketZip` fields and `NATIONAL_FALLTHROUGH` keys are identical across Tasks 1–4; `resolveQToZip` / `loadBackOnMarketZip` signatures match their call sites. ✓
