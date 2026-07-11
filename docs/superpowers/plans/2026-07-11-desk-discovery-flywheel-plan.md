# Desk Discovery + Backlink Flywheel (Spec B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 10 files, keywords: schema, architecture

**Goal:** Make our public daily-data pages (`/desk` first, `/r/*` second) maximally findable and citable by AI answer engines and worth linking to — via richer Dataset schema, quotable extractable one-liners, a sitemap/freshness signal, and an embeddable attributed backlink widget — without touching the anti-harvest robots moat except as an explicit, standalone, operator-gated final step.

**Architecture:** Pure additive enrichment on existing seams. The `/desk` page is already an SSR server component emitting minimal `deskJsonLd`; `/r/[slug]` is already `force-dynamic` SSR emitting `brainJsonLd`. We (1) extend both JSON-LD builders in `lib/jsonld.ts` with `temporalCoverage`/`creator`/`license`/`isAccessibleForFree` + Lee/Collier spatial detail, (2) fill the already-reserved `DeskDatum.takeaway` seam with a pure `makeTakeaway()` and render it in SSR HTML, (3) add `/desk` to `app/sitemap.ts`, (4) build an embeddable widget under the EXISTING `/embed/*` route prefix (which already carries `frame-ancestors *` + `X-Frame-Options: ALLOWALL` in `next.config.ts`) cloning `app/embed/c/[id]/page.tsx`, (5) serve `/llms.txt` from a route handler, and (6) — only on an explicit operator yes — allowlist the answer-engine INDEX bots for the two public paths in `app/robots.ts`.

**Tech Stack:** Next.js App Router (server components, route handlers, `MetadataRoute`), TypeScript, `bun:test` + `node:assert/strict`, Supabase reads via existing `lib/desk/loaders.ts`. No new dependencies.

## Global Constraints

- **No robots edit folded into any build.** The `app/robots.ts` change is Task 6 ONLY, standalone, and runs ONLY after an explicit operator yes/no on the moat-vs-reach call. Every other task is independent of it. (Spec B: "Do not fold a robots edit into any build.")
- **Numbers live in server-rendered HTML** — never painted after a client fetch. `/desk` and `/r/*` are already SSR; do not regress them to client hydration for any figure or as-of.
- **Attribution is the growth loop, not a prop.** The embed widget's "Source: SWFL Data Gulf ↗" backlink cannot be disabled or made optional (mirror the comment in `app/embed/c/[id]/page.tsx`).
- **Brand description identical everywhere** (entity clarity for LLMs). The Dataset `name`/`publisher`/`creator` brand string must read the same on `/desk`, `/r/*`, and the widget. Reuse the shared `PUBLISHER` constant; do not fork the wording.
- **Per-zone as-of MM/DD/YYYY, never one global stamp.** Takeaways embed each figure's OWN `asOf`; never borrow a page-level date.
- **No invented figures / no invented license.** Emit `license` only if the referenced page actually resolves (Task 1 verifies `/terms`); otherwise omit it. `isAccessibleForFree: true` is always safe. (RULE 0.7: never invent.)
- **Verify with `bunx next build`, not `npx tsc`.** (MEMORY: verify-with-next-build-not-npx-tsc.)
- **Empty-tolerant everywhere.** A dead feed hides its zone; JSON-LD/widget/takeaway must render nothing rather than a hollow/fabricated value.
- **Payoff is slow-compounding** (discovery + backlinks over months), not a signup spike — do not add conversion-tracking scope here.

---

### Task 1: Enrich Dataset JSON-LD (`deskJsonLd` + `brainJsonLd`)

Add `temporalCoverage`, `creator`, `license` (conditional), `isAccessibleForFree`, and Lee/Collier spatial detail to both Dataset builders, via shared constants so the brand string can never fork. This makes both page types eligible for Google Dataset Search.

**Files:**
- Modify: `lib/jsonld.ts` (add shared constants + enrich `deskJsonLd` and `brainJsonLd` Dataset objects)
- 🔴 Modify: `app/desk/page.tsx:63-66` (pass `temporalCoverage` derived from the hero window)
- Test: `lib/jsonld.test.ts` (extend)

**Interfaces:**
- Consumes: existing `SITE`, `PUBLISHER`, `SPATIAL` constants; `DeskJsonLdFigure`; `DisplayBrain`.
- Produces:
  - `CREATOR` (Organization, same brand as `PUBLISHER`), `LICENSE_URL: string` (may be `""`), `SPATIAL_LEE_COLLIER` (Place with `containsPlace` Lee + Collier AdministrativeAreas).
  - `deskJsonLd(figures: DeskJsonLdFigure[], dateModified?: string, temporalCoverage?: string): object[]` — third arg is NEW and optional.
  - `brainJsonLd(display, slug)` — unchanged signature; Dataset object gains the new fields (temporalCoverage from `display.refinedAt`).

- [ ] **Step 1: Confirm whether `/terms` resolves (decides whether `license` is emitted)**

Run: `ls app/terms 2>/dev/null; ls app/terms/page.tsx 2>/dev/null || echo "NO /terms PAGE"`
- If a page exists → set `LICENSE_URL = ` `${SITE}/terms` (backtick template in code).
- If `NO /terms PAGE` → set `LICENSE_URL = ""` and DO NOT emit `license` (honesty constraint). Leave a one-line code comment: `// no public license/attribution page yet — omit rather than assert a license we don't publish`.

- [ ] **Step 2: Write the failing tests**

Append to `lib/jsonld.test.ts`:

```ts
import { deskJsonLd } from "./jsonld.ts";

test("deskJsonLd: Dataset is accessible-for-free and has a creator", () => {
  const [ds] = deskJsonLd([{ label: "Median list", value: 345000, sourceLabel: "SWFL Data Gulf" }]) as Record<string, unknown>[];
  assert.equal(ds.isAccessibleForFree, true);
  assert.equal((ds.creator as Record<string, unknown>)["@type"], "Organization");
  assert.equal((ds.creator as Record<string, unknown>).name, "SWFL Data Gulf");
});

test("deskJsonLd: spatialCoverage names Lee and Collier", () => {
  const [ds] = deskJsonLd([{ label: "x", value: 1, sourceLabel: "s" }]) as Record<string, unknown>[];
  const json = JSON.stringify(ds.spatialCoverage);
  assert.ok(json.includes("Lee County"));
  assert.ok(json.includes("Collier County"));
});

test("deskJsonLd: emits temporalCoverage when provided, omits when not", () => {
  const [withTc] = deskJsonLd([{ label: "x", value: 1, sourceLabel: "s" }], "2026-07-10", "2026-05-01/2026-07-10") as Record<string, unknown>[];
  assert.equal(withTc.temporalCoverage, "2026-05-01/2026-07-10");
  const [without] = deskJsonLd([{ label: "x", value: 1, sourceLabel: "s" }], "2026-07-10") as Record<string, unknown>[];
  assert.equal("temporalCoverage" in without, false);
});

test("brainJsonLd: Dataset carries creator + isAccessibleForFree + temporalCoverage", () => {
  const [ds] = brainJsonLd(minBrain, "env-swfl") as Record<string, unknown>[];
  assert.equal(ds.isAccessibleForFree, true);
  assert.equal((ds.creator as Record<string, unknown>).name, "SWFL Data Gulf");
  assert.equal(ds.temporalCoverage, "2026-06-01"); // from minBrain.refinedAt
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test lib/jsonld.test.ts`
Expected: FAIL (new assertions — `isAccessibleForFree` undefined, `creator` undefined, `Lee County` absent, `temporalCoverage` undefined).

- [ ] **Step 4: Add shared constants after the existing `SPATIAL` block in `lib/jsonld.ts`**

```ts
// Same brand entity as PUBLISHER — LLMs use consistent creator/publisher naming
// as an entity-clarity signal, so this string must never fork.
const CREATOR = { "@type": "Organization", name: "SWFL Data Gulf", url: SITE };

// Emit `license` ONLY if this resolves to a real page — asserting a license we
// don't publish is an invented fact. Set by Task 1 Step 1.
const LICENSE_URL = ""; // or `${SITE}/terms` if that page exists

// Spatial detail for the two core counties — Dataset Search reads spatialCoverage
// to place the dataset; naming Lee + Collier is the geo-precision edge.
const SPATIAL_LEE_COLLIER = {
  ...SPATIAL,
  containsPlace: [
    { "@type": "AdministrativeArea", name: "Lee County, Florida" },
    { "@type": "AdministrativeArea", name: "Collier County, Florida" },
  ],
};
```

- [ ] **Step 5: Enrich `deskJsonLd` — add the third arg and the new fields**

Replace the `deskJsonLd` function body's returned Dataset object so it reads:

```ts
export function deskJsonLd(
  figures: DeskJsonLdFigure[],
  dateModified?: string,
  temporalCoverage?: string,
): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "SWFL Data Desk — daily Southwest Florida housing market figures",
      description:
        "Daily-refreshed Southwest Florida market terminal: median asking price, active inventory, price-cut share, mortgage rate, and daily listing-flow counts for Lee and Collier County.",
      url: `${SITE}/desk`,
      ...(dateModified ? { dateModified } : {}),
      ...(temporalCoverage ? { temporalCoverage } : {}),
      isAccessibleForFree: true,
      publisher: PUBLISHER,
      creator: CREATOR,
      ...(LICENSE_URL ? { license: LICENSE_URL } : {}),
      spatialCoverage: SPATIAL_LEE_COLLIER,
      variableMeasured: figures.map((f) => ({
        "@type": "PropertyValue",
        name: f.label,
        value: f.value,
        ...(f.unit ? { unitText: f.unit } : {}),
      })),
    },
  ];
}
```

- [ ] **Step 6: Enrich `brainJsonLd`'s Dataset object**

In `brainJsonLd`, add to the `dataset` object literal (after `spatialCoverage: SPATIAL,`):

```ts
    creator: CREATOR,
    isAccessibleForFree: true,
    ...(LICENSE_URL ? { license: LICENSE_URL } : {}),
    ...(display.refinedAt ? { temporalCoverage: display.refinedAt } : {}),
```

- [ ] **Step 7: Pass `temporalCoverage` from the desk page**

In `app/desk/page.tsx`, compute a coverage window from the hero series (earliest→freshest ISO) and pass it as the third arg. Replace the `const ld = deskJsonLd(...)` block:

```ts
  const heroPts = desk.hero?.cities.flatMap((c) => c.points.map((p) => p.date)) ?? [];
  const coverStart = heroPts.length ? [...heroPts].sort()[0] : undefined;
  const coverEnd = fk ? `${fk.slice(0, 4)}-${fk.slice(4, 6)}-${fk.slice(6, 8)}` : undefined;
  const temporalCoverage = coverStart && coverEnd ? `${coverStart}/${coverEnd}` : undefined;
  const ld = deskJsonLd(figures, coverEnd, temporalCoverage);
```

- [ ] **Step 8: Run tests + typecheck**

Run: `bun test lib/jsonld.test.ts && bunx next build`
Expected: all jsonld tests PASS; build green.

- [ ] **Step 9: Verify numbers are still in SSR HTML on both page types (SSR audit — Spec B item 1)**

Run: `bunx next build && bunx next start &` then `sleep 4 && curl -s localhost:3000/desk | grep -c '345,\|as of 07' ; curl -s localhost:3000/r/master | grep -c 'As of' ; kill %1`
Expected: both counts ≥ 1 (figures + as-of present in raw server HTML, not post-hydration). If `/r/*` figures are NOT in the HTML, STOP and report — that is a regression to fix before proceeding, not to paper over.

- [ ] **Step 10: Commit**

```bash
git add lib/jsonld.ts lib/jsonld.test.ts app/desk/page.tsx
git commit -m "feat(desk-geo): enrich Dataset JSON-LD (creator/license/temporal/spatial) for Dataset Search"
```

---

### Task 2: Quotable takeaways on `/desk` (fill the `DeskDatum.takeaway` seam)

Fill the already-reserved `takeaway?` field with a pure `makeTakeaway()` (answer-first GEO shape: figure + its OWN as-of + brand), wire it into `loadDeskData`'s assembly, and render the headline sentences as visible SSR text in `page.tsx`.

**Two facts from the real code that shape this task (verified 07/11/2026):**
1. **KPI datums are object literals `push`ed into the `kpis` array inside `loadDeskData` (`lib/desk/loaders.ts:553-620`)** — there is no single named `datum` var to mutate at build time. Wire takeaways as a POST-ASSEMBLY pass over the finished arrays (mutation of the just-built plain objects is safe), not inline per push.
2. **`DeskKpiRow` (`app/desk/_components/DeskKpiRow.tsx`) is a dense `grid-cols-2 … xl:grid-cols-6` client component** using `ChartStatFlow`. A full sentence per tile breaks that grid. Render the takeaways instead as ONE subtle SSR block in `app/desk/page.tsx` (a server component) beneath the KPI row — keeps the terminal density and puts the sentences in server HTML. Do NOT edit `DeskKpiRow.tsx`.

**Files:**
- Modify: `lib/desk/mappers.ts` (add `makeTakeaway`)
- Modify: `lib/desk/loaders.ts` (import + post-assembly takeaway pass before `return`)
- 🔴 Modify: `app/desk/page.tsx` (render the SSR takeaway block)
- Test: `lib/desk/mappers.test.ts` (extend)

**Interfaces:**
- Consumes: `DeskDatum` (`label`, `display`, `asOf`, `sourceLabel`) from `./types`.
- Produces: `makeTakeaway(d: { label; display; asOf?; sourceLabel }, scope?: string): string` — returns `""` when `display` is empty (empty-tolerant); injects `in <scope>` ONLY when `scope` is passed. Loaders set `d.takeaway = makeTakeaway(d, scope)`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/desk/mappers.test.ts`:

```ts
import { makeTakeaway } from "./mappers";

test("makeTakeaway: SWFL-scoped region figure — answer-first with as-of + brand", () => {
  const t = makeTakeaway(
    { label: "Median asking price", display: "$345,000", asOf: "07/10/2026", sourceLabel: "SWFL Data Gulf" },
    "Southwest Florida",
  );
  assert.equal(
    t,
    "Median asking price in Southwest Florida is $345,000 as of 07/10/2026, per SWFL Data Gulf.",
  );
});

test("makeTakeaway: no scope for a national figure (mortgage) — no false region label", () => {
  const t = makeTakeaway(
    { label: "30-yr fixed mortgage", display: "6.49%", asOf: "07/10/2026", sourceLabel: "Freddie Mac" },
  );
  assert.equal(t, "30-yr fixed mortgage is 6.49% as of 07/10/2026, per Freddie Mac.");
});

test("makeTakeaway: empty display yields empty string (empty-tolerant)", () => {
  assert.equal(makeTakeaway({ label: "x", display: "", asOf: "07/10/2026", sourceLabel: "s" }, "Southwest Florida"), "");
});

test("makeTakeaway: omits as-of clause when absent", () => {
  const t = makeTakeaway({ label: "Active listings", display: "29,413", sourceLabel: "SWFL Data Gulf" }, "Southwest Florida");
  assert.equal(t, "Active listings in Southwest Florida is 29,413, per SWFL Data Gulf.");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/desk/mappers.test.ts`
Expected: FAIL with "makeTakeaway is not a function".

- [ ] **Step 3: Implement `makeTakeaway` in `lib/desk/mappers.ts`**

```ts
/**
 * A GEO-optimized quotable one-liner for a desk figure: answer-first, with the
 * number, its OWN as-of, and the brand — the Cite-Sources + Statistics-Addition
 * shape the Princeton GEO study links to +30-41% AI-citation lift. `scope` is
 * injected ONLY when passed: region figures get "in Southwest Florida"; a
 * national rate (30-yr mortgage) must NOT wear a regional label (geography
 * honesty). Empty display → empty string (a dead feed never ships a hollow
 * sentence).
 */
export function makeTakeaway(
  d: { label: string; display: string; asOf?: string; sourceLabel: string },
  scope?: string,
): string {
  if (!d.display) return "";
  const where = scope ? ` in ${scope}` : "";
  const asOf = d.asOf ? ` as of ${d.asOf}` : "";
  return `${d.label}${where} is ${d.display}${asOf}, per ${d.sourceLabel}.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/desk/mappers.test.ts`
Expected: PASS.

- [ ] **Step 5: Post-assembly takeaway pass in `loadDeskData`**

In `lib/desk/loaders.ts`, add `makeTakeaway` to the existing import from `./mappers`. Then, immediately BEFORE the final `return { ticker, hero, kpis, mix, pulse, movers, flash, gauges };` (line ~759), insert:

```ts
  // Quotable takeaways (Spec B GEO). Region KPIs + the price-cut gauge are
  // SWFL-scoped; the 30-yr mortgage is a NATIONAL rate, so it gets no region
  // clause. Hero city datums already name their city in the label, so no scope.
  const SWFL = "Southwest Florida";
  for (const d of kpis) {
    const national = /mortgage/i.test(d.label);
    d.takeaway = makeTakeaway(d, national ? undefined : SWFL);
  }
  if (gauges.priceReduced) gauges.priceReduced.takeaway = makeTakeaway(gauges.priceReduced, SWFL);
  if (hero) for (const c of hero.cities) c.latest.takeaway = makeTakeaway(c.latest);
```

- [ ] **Step 6: Render the takeaways as one SSR block in `app/desk/page.tsx`**

The page already destructures `desk` and holds `desk.kpis`. Immediately after the KPI-row `<div>` block (after the closing of the `{desk.mix.length > 0 ? …}` conditional, still inside the same parent `<div>`), add a server-rendered takeaway list — subtle, but real text in the HTML:

```tsx
{desk.kpis.some((k) => k.takeaway) ? (
  <div className="mt-3 border-t border-white/5 px-1 pt-3">
    <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-gray-600">
      In plain terms
    </p>
    <ul className="space-y-0.5">
      {desk.kpis
        .filter((k) => k.takeaway)
        .map((k) => (
          <li key={k.label} className="text-[11px] leading-4 text-gray-500">
            {k.takeaway}
          </li>
        ))}
    </ul>
  </div>
) : null}
```

- [ ] **Step 7: Verify build + SSR presence of the quotable sentences**

Run: `bunx next build && bunx next start & sleep 4 && curl -s localhost:3000/desk | grep -c 'per SWFL Data Gulf' ; kill %1`
Expected: count ≥ 1 (takeaway sentences present in raw server HTML).

- [ ] **Step 8: Commit**

```bash
git add lib/desk/mappers.ts lib/desk/mappers.test.ts lib/desk/loaders.ts app/desk/page.tsx
git commit -m "feat(desk-geo): quotable answer-first takeaways rendered in SSR HTML"
```

> **Spec B item 2 note — `/r/*` takeaways are DEFERRED here (operator decision pending).** Spec B names `/desk` AND `/r/*` for quotable one-liners. `/r/[slug]` already leads with `display.conclusion` + an "As of" Meta in SSR — but the conclusion is prose *direction*, not guaranteed to carry the number in its first sentence (the specific GEO tactic). Adding a number-first takeaway to report pages is a real, separate piece (touches the brain/speaker layer, not just the page). It is intentionally out of this plan's scope; surface it to the operator as "in scope now, or a follow-up check?" Do NOT silently drop it.

---

### Task 3: Add `/desk` to the sitemap + daily freshness signal

`/desk` is absent from `app/sitemap.ts` today — a daily-updating page must advertise itself with a `daily` change frequency so crawlers revisit for the recency edge.

**Files:**
- Modify: `app/sitemap.ts` (add the `/desk` entry)

**Interfaces:**
- Consumes: existing `ORIGIN` constant + `MetadataRoute.Sitemap` array.
- Produces: one new sitemap entry for `${ORIGIN}/desk`.

- [ ] **Step 1: Add the `/desk` entry**

In `app/sitemap.ts`, immediately after the `/insiders` push block, add:

```ts
  // ── Data Desk (/desk — the daily live terminal, highest recency signal) ───
  entries.push({
    url: `${ORIGIN}/desk`,
    changeFrequency: "daily",
    priority: 0.9,
  });
```

- [ ] **Step 2: Verify the sitemap renders `/desk`**

Run: `bunx next build && bunx next start & sleep 4 && curl -s localhost:3000/sitemap.xml | grep -c '/desk' ; kill %1`
Expected: count = 1.

- [ ] **Step 3: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat(desk-geo): list /desk in sitemap with daily change frequency"
```

---

### Task 4: Embeddable attributed backlink widget (`/embed/desk/pulse`)

Clone the existing chromeless embed pattern (`app/embed/c/[id]/page.tsx`) into a `/desk` widget under the SAME `/embed/*` prefix — which already carries `frame-ancestors *` + `X-Frame-Options: ALLOWALL` in `next.config.ts`, so NO config change is needed. The widget renders one live figure (the daily pulse headline + median list) with a non-disableable "Source: SWFL Data Gulf ↗" backlink. Every embed placed on a third-party page is a backlink → the Redfin/Zillow authority loop.

**Files:**
- Create: `app/embed/desk/pulse/page.tsx`
- 🔴 Modify: `app/desk/page.tsx` (add a small "Embed this" copy-snippet control near the pulse zone — reuse the pattern from `app/c/[id]/ShareRow.tsx` if it exposes a reusable snippet component; otherwise a minimal inline `<code>` block is acceptable)

**Interfaces:**
- Consumes: `loadDeskData` from `lib/desk/loaders` (same loader the page uses — numbers stay SSR + sourced); `asOfFromToken` NOT needed (desk datums already carry `asOf`).
- Produces: a public route `GET /embed/desk/pulse` returning a chromeless, iframe-safe HTML fragment with attribution.

- [ ] **Step 1: Create the widget page (clone the embed pattern)**

`app/embed/desk/pulse/page.tsx`:

```tsx
// app/embed/desk/pulse/page.tsx
//
// Chromeless, iframe-embeddable widget for the SWFL Data Desk daily pulse.
// Under /embed/ on purpose — that prefix already carries frame-ancestors-* +
// X-Frame-Options ALLOWALL in next.config.ts. The footer credit links back to
// /desk; attribution IS the backlink growth loop, so it is not a prop and
// cannot be disabled. Numbers are server-rendered (loadDeskData) — the same
// sourced, SSR figures as the full page, so AI crawlers cite the HTML served.

import { loadDeskData } from "@/lib/desk/loaders";

export const runtime = "nodejs";
export const revalidate = 300;

const SITE = "https://www.swfldatagulf.com";

export default async function EmbedDeskPulsePage() {
  const desk = await loadDeskData();
  const median = desk.kpis.find((k) => k.label === "Median asking price");
  const active = desk.kpis.find((k) => k.label === "Active listings");

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#0A1419",
        color: "#F0EDE6",
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ background: "#152832", border: "1px solid #22414F", borderRadius: 12, padding: 20 }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#9BB0BC" }}>
          SWFL Data Desk — Daily Pulse
        </h1>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {median ? (
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{median.display}</div>
              <div style={{ fontSize: 11, color: "#807E76" }}>Median asking price{median.asOf ? ` · ${median.asOf}` : ""}</div>
            </div>
          ) : null}
          {active ? (
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{active.display}</div>
              <div style={{ fontSize: 11, color: "#807E76" }}>Active listings{active.asOf ? ` · ${active.asOf}` : ""}</div>
            </div>
          ) : null}
        </div>
        <p style={{ margin: "14px 0 0", display: "flex", justifyContent: "flex-end", fontSize: 11, color: "#807E76" }}>
          <a href={`${SITE}/desk`} target="_blank" rel="noopener noreferrer" style={{ color: "#3DC9C0", textDecoration: "none" }}>
            Source: SWFL Data Gulf ↗
          </a>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify the widget renders with real numbers AND is frame-safe**

Run: `bunx next build && bunx next start & sleep 4 && curl -s localhost:3000/embed/desk/pulse | grep -c 'Source: SWFL Data Gulf' ; curl -sI localhost:3000/embed/desk/pulse | grep -i 'x-frame-options\|content-security-policy' ; kill %1`
Expected: attribution count = 1; the header check prints `X-Frame-Options: ALLOWALL` and/or `Content-Security-Policy: frame-ancestors *` (inherited from `next.config.ts` `/embed/:path*`). If the headers are ABSENT, STOP — the route is outside the `/embed/` match; do not add a bespoke header block, fix the path.

- [ ] **Step 3: Add the "Embed this" copy-snippet on `/desk`**

In `app/desk/page.tsx`, beside the Daily Market Pulse zone actions, add a minimal snippet users can copy (SSR-safe static string — no client state needed for a `<code>` display):

```tsx
<code className="rounded bg-white/5 px-2 py-1 font-mono text-[10px] text-gray-400">
  {`<iframe src="https://www.swfldatagulf.com/embed/desk/pulse" width="360" height="180" style="border:0" loading="lazy" title="SWFL Data Desk"></iframe>`}
</code>
```

(If `app/c/[id]/ShareRow.tsx` already exposes a reusable copy-to-clipboard snippet component, prefer importing that over a raw `<code>` block — check it first.)

- [ ] **Step 4: Build green**

Run: `bunx next build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add app/embed/desk/pulse/page.tsx app/desk/page.tsx
git commit -m "feat(desk-geo): embeddable attributed daily-pulse widget (backlink flywheel)"
```

---

### Task 5: Serve `/llms.txt` (rank LAST — the garnish)

A high-quality, differentiated summary listing `/desk` + the key `/r/*` money pages, served as `text/plain` at the site root. Evidence is modest (+12–18% answer-engine citation over 90 days, dominated by summary quality) — so it ships last and stays small.

**Files:**
- Create: `app/llms.txt/route.ts`
- Test: `app/llms.txt/route.test.ts` (create)

**Interfaces:**
- Consumes: nothing beyond a hardcoded origin (keep it static + cache-friendly; do NOT enumerate every brain — a curated shortlist reads as higher quality).
- Produces: `GET /llms.txt` → `text/plain` body.

- [ ] **Step 1: Write the failing test**

`app/llms.txt/route.test.ts`:

```ts
import { test } from "bun:test";
import assert from "node:assert/strict";
import { GET } from "./route";

test("GET /llms.txt: plain text, names the desk and the brand", async () => {
  const res = await GET();
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  const body = await res.text();
  assert.ok(body.includes("SWFL Data Gulf"));
  assert.ok(body.includes("/desk"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test app/llms.txt/route.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the route**

`app/llms.txt/route.ts`:

```ts
// app/llms.txt/route.ts — curated LLM-readable index of our public cited-data
// pages. Ranked LAST in the discovery plan (summary quality dominates the lift);
// keep it short and differentiated, not an exhaustive brain dump.

const SITE = "https://www.swfldatagulf.com";

const BODY = `# SWFL Data Gulf

> Daily-refreshed, explicitly-sourced Southwest Florida (Lee & Collier County)
> housing-market data. Every figure names its source and its own as-of date.

## Live data
- [SWFL Data Desk](${SITE}/desk): daily market terminal — median asking price,
  active inventory, price-cut share, 30-yr mortgage, and daily listing-flow counts.

## Key reports
- [Master read](${SITE}/r/master): the synthesized Southwest Florida market direction.
- [Housing](${SITE}/r/housing-swfl): Lee & Collier housing metrics.
- [Commercial real estate](${SITE}/r/cre-swfl): corridor-level CRE fundamentals.

## About
SWFL Data Gulf publishes cited SWFL market data. Data is free to read; every
number is attributed to a named source.
`;

export function GET() {
  return new Response(BODY, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
```

- [ ] **Step 4: Run test + verify served path**

Run: `bun test app/llms.txt/route.test.ts && bunx next build && bunx next start & sleep 4 && curl -s localhost:3000/llms.txt | head -3 ; kill %1`
Expected: test PASS; curl prints the `# SWFL Data Gulf` header.

- [ ] **Step 5: Commit**

```bash
git add app/llms.txt/route.ts app/llms.txt/route.test.ts
git commit -m "feat(desk-geo): serve curated /llms.txt index of public cited-data pages"
```

---

### Task 6: Robots allowlist for answer-engine INDEX bots — OPERATOR-GATED, STANDALONE

**DO NOT START without an explicit operator yes.** This is the moat-vs-reach business call. Present the trade first (below); implement ONLY on approval. Nothing in Tasks 1–5 depends on this.

**The decision to present (verbatim from Spec B, confirmed against `app/robots.ts`):**
> Today `app/robots.ts` blocks the answer-engine INDEX bots (`OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`) AND the TRAINING bots everywhere — a deliberate anti-harvest moat. Consequence: Perplexity / ChatGPT Search will never surface `/desk` or `/r/*` on their own. Google AI Overviews still reaches us; human URL-paste still cites us.
> **Proposed carve-out:** for the two public showpiece paths (`/desk`, `/r/*`) ONLY, allow the INDEX/search bots while keeping the TRAINING bots (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, …) blocked everywhere. Public data becomes citable in answer engines without feeding training corpora.
> Caveat: robots.txt is advisory; the training-bot block's real teeth are the WAF, not this file (see the header comment in `app/robots.ts`). The index bots we'd allowlist are compliant, so allowlisting them is low-risk once approved.

**Files (only on approval):**
- Modify: `app/robots.ts`

**Interfaces:**
- Consumes: existing `AI_ANSWER_ENGINES`, `AI_TRAINING`, `BLOCKED` arrays.
- Produces: a per-path allow rule for the three search bots on `/desk` + `/r/`, with training bots still fully blocked.

- [ ] **Step 1 (approval gate): Present the trade-off above and get an explicit operator yes/no.** If no → close the task, do not touch `robots.ts`. If yes → proceed.

- [ ] **Step 2: Implement the carve-out**

In `app/robots.ts`, split the answer-engine search bots out of the blanket block and add path-scoped allows. Replace the `rules` array in `robots()`:

```ts
  const SEARCH_INDEX = ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"];
  const TRAINING_AND_OTHER_ANSWER = BLOCKED.filter((b) => !SEARCH_INDEX.includes(b));
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: "/api/" },
      // Training + non-search answer engines: full block (moat unchanged).
      { userAgent: TRAINING_AND_OTHER_ANSWER, disallow: "/" },
      // Answer-engine SEARCH indexers: allowed ONLY on the two public showpiece
      // paths, blocked everywhere else (public data citable; synthesis stays private).
      { userAgent: SEARCH_INDEX, allow: ["/desk", "/r/"], disallow: "/" },
    ],
    sitemap: `${ORIGIN}/sitemap.xml`,
  };
```

Update the file's top comment to record the carve-out and the date of the operator decision.

- [ ] **Step 3: Verify the emitted robots.txt**

Run: `bunx next build && bunx next start & sleep 4 && curl -s localhost:3000/robots.txt ; kill %1`
Expected: `OAI-SearchBot` / `Claude-SearchBot` / `PerplexityBot` show `Allow: /desk` + `Allow: /r/` with `Disallow: /`; `GPTBot` / `ClaudeBot` / `CCBot` still show `Disallow: /`.

- [ ] **Step 4: Commit**

```bash
git add app/robots.ts
git commit -m "feat(desk-geo): allowlist answer-engine index bots for /desk + /r/* (operator-approved carve-out)"
```

---

## Live-verify (closes `desk_discovery_flywheel_live_verify`)

After deploy, on the DEPLOYED site (prod evidence, not local):
- **Dataset JSON-LD validates** on `/desk` and `/r/master` via the Schema.org validator / Google Rich Results — with `temporalCoverage`, `spatialCoverage` (Lee + Collier), `creator`, `isAccessibleForFree`.
- **Numbers present in server-rendered HTML** (view-source, not post-hydration) on `/desk` and `/r/*`.
- **Quotable takeaways** ("… per SWFL Data Gulf") appear in `/desk` view-source.
- **Embed widget** renders attribution + backlink and frames on a third-party page (paste the iframe into any external HTML file, confirm it loads).
- **`/llms.txt`** served at the root, `text/plain`.
- **`/desk` in `/sitemap.xml`** with `daily` frequency.
- If the robots carve-out was approved: confirm search bots `Allow` the public paths and training bots still `Disallow: /`.
- Track first AI citations / referral backlinks as the real outcome signal (months-scale).

## Notes for the executor

- **SESSION_LOG entry before every push** (RULE 0). **Never `git add -A`** — stage the explicit paths shown (RULE 1.5). Push via `node scripts/safe-push.mjs`.
- The `desk_discovery_flywheel_live_verify` check already exists — do not run `new-build.mjs` again.
- The Hendry scope leak was fixed at the shared-view level (07/11/2026); `/desk`'s "SWFL median ask" reads ~$345,000 post-fix. If a takeaway shows an old $339,000, the loader is reading a stale view — report, don't hardcode.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2, Task 4 | `app/desk/page.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
