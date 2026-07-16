# Desk Wire Zillow Links + ZIP Pressure Scatter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 9 files, keywords: architecture

**Goal:** PRICE CUT / CLOSED wire items on `/desk` link out to Zillow address pages, and the dead space in the Movers card becomes a per-ZIP pressure scatter built from data the page already loads.

**Architecture:** One pure URL-builder module owns the (unofficial, live-verified) Zillow address-slug contract; loaders attach it to wire items via a new `lookupHref` field that is rendered as the headline link but deliberately excluded from filed notes (`href` stays provenance-only). The scatter is a server-rendered SVG component fed by a new additive `MoversData.pressure` array computed from the already-loaded momentum rows — zero new queries, zero client JS.

**Tech Stack:** Next.js App Router (server components), TypeScript, Tailwind, bun:test. No chart library — hand-rolled SVG, matching the desk's house style.

**Spec:** `docs/superpowers/specs/2026-07-16-desk-wire-links-pressure-scatter-design.md`

## Global Constraints

- Zillow URL shape (verified live via crawl4ai 07/16/2026, both forms):
  `https://www.zillow.com/homes/{street-slug}-{city-slug},-FL_rb/` and
  `https://www.zillow.com/homes/{street-slug}-{city-slug},-FL-{zip}_rb/`.
- `FlashItem.href` = provenance only. The Zillow link rides `lookupHref`; `flashNoteText` (filed notes → can reach client deliverables) must keep reading ONLY `href`. Do not touch `FileFlashItem.tsx`.
- Scatter palette (dataviz-validated on surface `#0a1419`, all six checks pass): Lee `#33a89f`, Collier `#bd852a`, unknown county `#807e76` (neutral — never guess a county). Fixed assignment by entity, never by order-of-appearance.
- Shares are percentages 0–100 (`fmtPct` renders `25.7%`). Never recompute; plot as held.
- Noise guard: ZIPs with `active_listing_count < MOVERS_MIN_ACTIVE` (= 50, from `lib/desk/mappers.ts`) are excluded from the scatter, stated in the caption.
- `SourceLabel` on cuts/closings stays `"SWFL Data Gulf"` — unchanged.
- Verify with `bunx next build` (never `npx tsc`). Commit with explicit paths only (shared index — `git add <paths>` then `git commit -- <paths>`). NO push — operator confirms pushes.

---

### Task 1: Zillow address-URL builder (pure, TDD)

**Files:**
- Create: `lib/desk/portal-link.ts`
- Test: `lib/desk/portal-link.test.ts`

**Interfaces:**
- Produces: `zillowAddressUrl(street: string | null | undefined, city: string | null | undefined, zip?: string | null): string | undefined` — Task 2 imports this from `@/lib/desk/portal-link`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/desk/portal-link.test.ts
import { describe, expect, test } from "bun:test";
import { zillowAddressUrl } from "./portal-link";

describe("zillowAddressUrl", () => {
  test("round-trips the live-verified address (no ZIP)", () => {
    expect(zillowAddressUrl("4836 SW 29th Ave", "Cape Coral")).toBe(
      "https://www.zillow.com/homes/4836-SW-29th-Ave-Cape-Coral,-FL_rb/",
    );
  });

  test("appends a 5-digit ZIP when held (live-verified form)", () => {
    expect(zillowAddressUrl("4836 SW 29th Ave", "Cape Coral", "33914")).toBe(
      "https://www.zillow.com/homes/4836-SW-29th-Ave-Cape-Coral,-FL-33914_rb/",
    );
  });

  test("strips unit punctuation — a literal # would truncate the URL path", () => {
    expect(zillowAddressUrl("605 Galleon Dr #B", "Naples")).toBe(
      "https://www.zillow.com/homes/605-Galleon-Dr-B-Naples,-FL_rb/",
    );
  });

  test("collapses whitespace runs and trims", () => {
    expect(zillowAddressUrl("  19794   Thsts ", "Naples")).toBe(
      "https://www.zillow.com/homes/19794-Thsts-Naples,-FL_rb/",
    );
  });

  test("multi-word city hyphenates", () => {
    expect(zillowAddressUrl("1337 Bradford Rd", "Fort Myers")).toBe(
      "https://www.zillow.com/homes/1337-Bradford-Rd-Fort-Myers,-FL_rb/",
    );
  });

  test("missing street or city -> undefined (row renders plain, like today)", () => {
    expect(zillowAddressUrl(null, "Naples")).toBeUndefined();
    expect(zillowAddressUrl("605 Galleon Dr", null)).toBeUndefined();
    expect(zillowAddressUrl(undefined, undefined)).toBeUndefined();
    expect(zillowAddressUrl("   ", "Naples")).toBeUndefined();
    expect(zillowAddressUrl("#", "Naples")).toBeUndefined();
  });

  test("malformed ZIP is ignored, not appended", () => {
    expect(zillowAddressUrl("605 Galleon Dr", "Naples", "339")).toBe(
      "https://www.zillow.com/homes/605-Galleon-Dr-Naples,-FL_rb/",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/desk/portal-link.test.ts`
Expected: FAIL — cannot resolve `./portal-link`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/desk/portal-link.ts — external portal lookup URLs for wire items.
//
// The listing lake holds NO vendor detail URL by design (incognito source),
// so wire items link out via an ADDRESS lookup on a public portal. Zillow's
// address-slug scheme was verified live 07/16/2026 (crawl4ai), with and
// without the ZIP suffix. Unofficial contract — this file is its single
// owner, so a format change is a one-file fix.
//
// These URLs are navigation conveniences, NEVER provenance: they ride
// FlashItem.lookupHref, which flashNoteText deliberately does not include.

/** "605 Galleon Dr #B" -> "605-Galleon-Dr-B". A literal `#` would truncate
 *  the URL path as a fragment, so everything outside [A-Za-z0-9 ] drops. */
function slugify(part: string): string {
  return part
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function zillowAddressUrl(
  street: string | null | undefined,
  city: string | null | undefined,
  zip?: string | null,
): string | undefined {
  const s = street ? slugify(street) : "";
  const c = city ? slugify(city) : "";
  if (!s || !c) return undefined;
  const z = zip && /^\d{5}$/.test(zip) ? `-${zip}` : "";
  return `https://www.zillow.com/homes/${s}-${c},-FL${z}_rb/`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/desk/portal-link.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/desk/portal-link.ts lib/desk/portal-link.test.ts
git commit -m "feat(desk): zillow address-url builder — live-verified slug contract, one owner" -- lib/desk/portal-link.ts lib/desk/portal-link.test.ts
```

---

### Task 2: Wire items carry `lookupHref`; FlashFeed renders it

**Files:**
- 🔴 Modify: `lib/desk/types.ts` (FlashItem, ~line 158)
- 🔴 Modify: `lib/desk/loaders.ts` (`loadNotableCuts` ~line 436, `loadClosings` ~line 482, imports ~line 38)
- Modify: `app/desk/_components/FlashFeed.tsx`
- Do NOT touch: `app/desk/_components/FileFlashItem.tsx` (`flashNoteText` reading only `href` IS the provenance guarantee)

**Interfaces:**
- Consumes: `zillowAddressUrl` from Task 1.
- Produces: `FlashItem.lookupHref?: string` — rendered by FlashFeed as `it.href ?? it.lookupHref`.

- [ ] **Step 1: Add the field to `FlashItem` in `lib/desk/types.ts`**

After the existing `href?: string;` line:

```ts
  href?: string;
  /** External ADDRESS-LOOKUP convenience (e.g. Zillow) — never provenance.
   *  Renders as the headline link when `href` is absent; deliberately NOT
   *  included in filed notes (flashNoteText reads only `href`). */
  lookupHref?: string;
```

- [ ] **Step 2: Attach it in `loadNotableCuts` (`lib/desk/loaders.ts`)**

Add the import near the other `./` imports at the top of the file:

```ts
import { zillowAddressUrl } from "./portal-link";
```

In the `.map((r, i) => {` return object (after `sourceLabel: SPINE_SOURCE,`):

```ts
          sourceLabel: SPINE_SOURCE,
          lookupHref: zillowAddressUrl(r.street_address, r.city, r.zip_code),
```

- [ ] **Step 3: Attach it in `loadClosings`**

`SoldStateRow` gains the ZIP:

```ts
interface SoldStateRow {
  listing_id: string;
  street_address: string | null;
  city: string | null;
  zip_code: string | null;
  list_price: number | null;
}
```

The `listing_state` join select adds the column:

```ts
        .select("listing_id, street_address, city, zip_code, list_price")
```

The `items.push({...})` gains (after `sourceLabel: display.source,`):

```ts
        sourceLabel: display.source,
        lookupHref: zillowAddressUrl(state?.street_address, state?.city, state?.zip_code),
```

- [ ] **Step 4: Render in `FlashFeed.tsx`**

Inside the `items.map((it) => {` callback, compute the link next to `kind`:

```tsx
        const kind = KIND_STYLE[it.kind];
        const link = it.href ?? it.lookupHref;
```

Replace the two `it.href` usages in the JSX with `link`:

```tsx
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate text-sm text-gray-200 hover:text-gulf-teal hover:underline"
                >
                  {it.headline}
                </a>
              ) : (
                <span className="min-w-0 truncate text-sm text-gray-200">{it.headline}</span>
              )}
```

- [ ] **Step 5: Run the tests**

Run: `bun test lib/desk/portal-link.test.ts`
Expected: PASS (guards the contract the loaders now depend on).

- [ ] **Step 6: Commit**

```bash
git add lib/desk/types.ts lib/desk/loaders.ts app/desk/_components/FlashFeed.tsx
git commit -m "feat(desk): price-cut + closed wire items link to zillow via lookupHref — provenance href untouched" -- lib/desk/types.ts lib/desk/loaders.ts app/desk/_components/FlashFeed.tsx
```

---

### Task 3: ZIP pressure scatter under Movers

**Files:**
- 🔴 Modify: `lib/desk/types.ts` (add `PressurePoint`, extend `MoversData`)
- 🔴 Modify: `lib/desk/loaders.ts` (movers block ~line 1039)
- Create: `app/desk/_components/ZipPressureScatter.tsx`
- Modify: `app/desk/_components/MoversBoard.tsx`

**Interfaces:**
- Consumes: `momentum.zips: MomentumRow[]` (fields: `zip_code`, `county`, `active_listing_count`, `price_reduced_share`, `new_listing_share` — all nullable), `MOVERS_MIN_ACTIVE` (= 50) and `fmtPct` from `@/lib/desk/mappers`.
- Produces: `PressurePoint { zip: string; county: string | null; cutShare: number; newShare: number; activeCount: number }`; `MoversData.pressure?: PressurePoint[]`; `<ZipPressureScatter points={PressurePoint[]} />`.

- [ ] **Step 1: Types (`lib/desk/types.ts`)**

Above `MoversData`:

```ts
/** One core ZIP's numeric momentum pair for the pressure scatter. Shares are
 *  percentages (0–100) as held — the chart never recomputes a rate. */
export interface PressurePoint {
  zip: string;
  county: string | null;
  cutShare: number;
  newShare: number;
  activeCount: number;
}
```

Inside `MoversData` (after `minActive: number;`):

```ts
  /** Cut share vs new-listing share for every qualifying core ZIP (same
   *  min-active noise guard as the boards) — additive; absent hides the chart. */
  pressure?: PressurePoint[];
```

- [ ] **Step 2: Build the rows in `lib/desk/loaders.ts`**

Inside the `movers` object literal (after `newListingShare: toMoverRows(...),`):

```ts
          pressure: momentum.zips
            .filter(
              (r) =>
                r.zip_code != null &&
                (r.active_listing_count ?? 0) >= MOVERS_MIN_ACTIVE &&
                typeof r.price_reduced_share === "number" &&
                Number.isFinite(r.price_reduced_share) &&
                typeof r.new_listing_share === "number" &&
                Number.isFinite(r.new_listing_share),
            )
            .map((r) => ({
              zip: r.zip_code as string,
              county: r.county,
              cutShare: r.price_reduced_share as number,
              newShare: r.new_listing_share as number,
              activeCount: r.active_listing_count ?? 0,
            })),
```

(`MOVERS_MIN_ACTIVE` is already imported at the top of loaders.ts.)

- [ ] **Step 3: Create `app/desk/_components/ZipPressureScatter.tsx`**

```tsx
import type { PressurePoint } from "@/lib/desk/types";
import { fmtPct } from "@/lib/desk/mappers";

/** Fixed county hues — dataviz-validated on the #0a1419 surface 07/16/2026
 *  (all six checks pass; worst CVD ΔE 14.3, normal-vision 18.8). Assignment
 *  follows the entity, never order-of-appearance; a null county renders the
 *  neutral mark — a county is stated data, never guessed from a ZIP. */
const COUNTY_COLORS: ReadonlyArray<{ county: string; color: string }> = [
  { county: "Lee", color: "#33a89f" },
  { county: "Collier", color: "#bd852a" },
];
const UNKNOWN_COLOR = "#807e76";
const SURFACE = "#0a1419";

const W = 340;
const H = 250;
const PAD = { top: 10, right: 12, bottom: 36, left: 42 };

function colorOf(county: string | null): string {
  return COUNTY_COLORS.find((c) => c.county === county)?.color ?? UNKNOWN_COLOR;
}

/** Round an axis max up to the next 5% so tick labels land on clean values. */
function niceMax(v: number): number {
  return Math.max(5, Math.ceil(v / 5) * 5);
}

/**
 * Pressure map — cut share (x) vs new-listing share (y), one dot per
 * qualifying core ZIP, dot area ∝ active-listing count. Server-rendered SVG,
 * no client JS: identity rides the legend + per-dot <title> tooltips, and the
 * quadrant caption is descriptive association, never a forecast. Re-plots
 * figures already on the page — it adds no new numbers.
 */
export function ZipPressureScatter({ points }: { points: PressurePoint[] }) {
  if (points.length < 3) return null;
  const xMax = niceMax(Math.max(...points.map((p) => p.cutShare)));
  const yMax = niceMax(Math.max(...points.map((p) => p.newShare)));
  const aMax = Math.max(...points.map((p) => p.activeCount), 1);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (v: number) => PAD.left + (v / xMax) * iw;
  const y = (v: number) => PAD.top + ih - (v / yMax) * ih;
  // sqrt-area sizing; 4px min radius keeps every mark >= 8px across.
  const r = (n: number) => 4 + 5 * Math.sqrt(n / aMax);
  const xTicks = [0, xMax / 2, xMax];
  const yTicks = [0, yMax / 2, yMax];
  const counties = COUNTY_COLORS.filter((c) => points.some((p) => p.county === c.county));
  // Big dots first so small ZIPs stay hoverable on top of them.
  const drawOrder = [...points].sort((a, b) => b.activeCount - a.activeCount);

  return (
    <div className="mt-8">
      <h3 className="text-[11px] uppercase tracking-wider text-gray-500">
        Pressure map — every qualifying ZIP
      </h3>
      <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wider text-gray-500">
        {counties.map((c) => (
          <span key={c.county} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
            {c.county}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
          dot size = active listings
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label="Scatter chart: share of active listings with a price cut versus new-listing share, one dot per core ZIP, sized by active-listing count"
      >
        {/* recessive axes + ticks */}
        <line x1={PAD.left} y1={PAD.top + ih} x2={PAD.left + iw} y2={PAD.top + ih} stroke="rgba(255,255,255,0.12)" />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + ih} stroke="rgba(255,255,255,0.12)" />
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={PAD.top + ih + 12} textAnchor="middle" className="font-mono" fontSize={8} fill="#6b7280">
            {fmtPct(t, 0)}
          </text>
        ))}
        {yTicks.map((t) => (
          <text key={`y${t}`} x={PAD.left - 5} y={y(t) + 2.5} textAnchor="end" className="font-mono" fontSize={8} fill="#6b7280">
            {fmtPct(t, 0)}
          </text>
        ))}
        <text x={PAD.left + iw / 2} y={H - 4} textAnchor="middle" fontSize={8.5} fill="#6b7280">
          share of actives with a price cut →
        </text>
        <text x={10} y={PAD.top + ih / 2} textAnchor="middle" fontSize={8.5} fill="#6b7280" transform={`rotate(-90 10 ${PAD.top + ih / 2})`}>
          new-listing share →
        </text>
        {drawOrder.map((p) => (
          <circle
            key={p.zip}
            cx={x(p.cutShare)}
            cy={y(p.newShare)}
            r={r(p.activeCount)}
            fill={colorOf(p.county)}
            fillOpacity={0.85}
            stroke={SURFACE}
            strokeWidth={2}
          >
            <title>{`${p.zip} — cuts ${fmtPct(p.cutShare)} · new ${fmtPct(p.newShare)} · ${p.activeCount.toLocaleString("en-US")} active`}</title>
          </circle>
        ))}
      </svg>
      <p className="mt-2 text-xs text-gray-500">
        Right = a bigger share of that ZIP&apos;s actives took a price cut; up = more fresh
        supply. Bottom-right ZIPs are cutting without new inventory, top-right are churning,
        top-left are adding supply without discounting — descriptive, not a forecast. Same
        ZIP set and noise guard as the boards above.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Render it in `MoversBoard.tsx`**

Add the import:

```tsx
import type { MoversData, MoverRow } from "@/lib/desk/types";
import { WatchButton } from "./WatchButton";
import { ZipPressureScatter } from "./ZipPressureScatter";
```

In the `MoversBoard` return, between the boards `</div>` and the min-active `<p>`:

```tsx
      </div>
      {movers.pressure ? <ZipPressureScatter points={movers.pressure} /> : null}
      <p className="mt-3 text-xs text-gray-500">
```

The scatter caption deliberately does not restate the 50-active threshold — the existing min-active paragraph below it interpolates `movers.minActive` and stays the one authority for that number.

- [ ] **Step 5: Run tests + build**

Run: `bun test lib/desk/portal-link.test.ts` → PASS.
Run: `bunx next build` → completes with no type errors (this is the repo's verify command; `/desk` prerender exercises the new component).

- [ ] **Step 6: Commit**

```bash
git add lib/desk/types.ts lib/desk/loaders.ts app/desk/_components/ZipPressureScatter.tsx app/desk/_components/MoversBoard.tsx
git commit -m "feat(desk): zip pressure scatter fills the movers dead space — validated county hues, zero new queries" -- lib/desk/types.ts lib/desk/loaders.ts app/desk/_components/ZipPressureScatter.tsx app/desk/_components/MoversBoard.tsx
```

---

### Task 4: Visual verify + session log

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)

- [ ] **Step 1: Render and look at it (dataviz step 7)**

Use the project `verify` skill (production build + serve + screenshot) against `/desk`. Confirm:
- PRICE CUT and CLOSED headlines are links; hover shows a zillow.com/homes/... URL; NEWS unchanged.
- Scatter renders under the movers boards: legend chips, both county colors, axis labels legible, no label collisions or overflow (anti-patterns pass).
- A cut/closing row with no street address renders as plain text.

- [ ] **Step 2: Spot-check one real link**

Copy one rendered `lookupHref` from the served HTML and `crawl4ai` it — expect a property page or a Zillow search-results page (both acceptable landings), never a 404.

- [ ] **Step 3: SESSION_LOG entry + hand off push decision**

Append a top-of-file SESSION_LOG.md entry (what shipped, spec/plan paths, verify evidence). Commit it:

```bash
git add SESSION_LOG.md
git commit -m "docs(session-log): desk wire zillow links + pressure scatter" -- SESSION_LOG.md
```

Then STOP: show `git log --oneline` for the branch and ask the operator to confirm the push (safe-push). Do not push autonomously. The `desk_wire_links_pressure_scatter_live_verify` check stays open until verified on production.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3 | `lib/desk/types.ts`, `lib/desk/loaders.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
