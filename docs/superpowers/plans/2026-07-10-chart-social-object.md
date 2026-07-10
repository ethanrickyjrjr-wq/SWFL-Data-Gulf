# Saved Chart Social Object Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 9 files, keywords: architecture

**Goal:** Make `/c/[id]` a shareable social object: branded 1200×630 OG card PNG, download, embed route + iframe snippet, share row.

**Architecture:** A pure SVG card composer (`lib/charts/social-card.ts`) maps a persisted `ChartBlock` directly onto the existing exported chart builders (`barChartSvg`, `trendChartSvg` from `lib/email/chart-image.ts` — read-only imports) and wraps them in a branded card frame; a route handler rasterizes it via the existing `svgToPng` resvg root; the page's `generateMetadata` points `og:image` at that route; a chromeless embed page under the existing frame-allowed `/embed/` prefix serves iframes.

**Tech Stack:** Next.js App Router route handlers + Metadata API, `@resvg/resvg-js` (existing), `bun:test`.

**Spec:** `docs/superpowers/specs/2026-07-10-chart-social-object-design.md` · **Check:** `chart_social_object_live_verify`

## Global Constraints

- NEVER edit anything under `lib/email/` — those files are claimed by a live parallel session. Importing their exports is fine; edits are not.
- Chart adapter fact (verified in `lib/deliverable/bind-frame.ts:177`): `blockToSpec` throws on any `frame_id` except `bar-table` — do NOT route the card through it. Map block rows directly onto the SVG builders.
- Accent: `#3DC9C0` — verbatim value of `--gulf-teal` in `app/globals.css:14` (SVG can't read CSS vars; cite the token in a comment).
- Every card footer: `{source citation} · as of MM/DD/YYYY` via `formatDisplayDate` (the ONE date root, `lib/format-date`). Date appears once. Never render a raw freshness token.
- The renderer draws numbers verbatim from the block (display formatting via `formatAxisTick` only) — it never computes new figures.
- Any route calling `svgToPng` MUST have an `outputFileTracingIncludes` entry for `./assets/fonts/*.ttf` in `next.config.ts` — without it Vercel renders blank-text PNGs silently (see `lib/charts/chart-fonts.ts` header).
- Tests: `bun test <path>` (bun:test). Full verify: `bunx next build` (never `npx tsc`).
- Commits: stage explicit paths only; never `git add -A`. Do not push — operator gate.
- User-visible copy: no system nouns, no internal IDs.

---

### Task 1: Card renderer — `lib/charts/social-card.ts`

**Files:**
- Create: `lib/charts/social-card.ts`
- Test: `lib/charts/social-card.test.ts`

**Interfaces:**
- Consumes: `barChartSvg`, `trendChartSvg`, `svgToPng`, `TrendPoint` from `@/lib/email/chart-image`; `formatAxisTick`, `ValueFormat` from `@/lib/charts/format`; `formatDisplayDate` from `@/lib/format-date`; `ChartBlock`, `ChartValueFormat` from `@/refinery/validate/chart-block-lint.mts`.
- Produces: `chartBlockToCardSvg(block: ChartBlock): string` (1200×630 SVG) and `chartBlockToCardPng(block: ChartBlock): Buffer` (PNG at intrinsic size, `scale: 1`). Throws `Error("social-card: malformed chart block")` on non-renderable input; shape gaps fall back, they never throw.

- [ ] **Step 1: Write the failing test**

```ts
// lib/charts/social-card.test.ts
// String-only assertions (pure, no resvg round-trip committed) — same posture
// as lib/charts/svg/donut-share.test.ts.
import { describe, expect, it } from "bun:test";
import { chartBlockToCardSvg } from "./social-card";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";

const barBlock: ChartBlock = {
  title: "Median home value by city",
  columns: ["City", "Value"],
  rows: [
    ["Cape Coral", 389000],
    ["Fort Myers", 355000],
    ["Naples", 612000],
  ],
  chart_type: "bar",
  value_format: "usd",
  asOf: "2026-06-30",
  source: { citation: "SWFL Data Gulf home-value desk" },
};

describe("chartBlockToCardSvg", () => {
  it("renders a 1200x630 card with wordmark, title, bars, and provenance footer", () => {
    const svg = chartBlockToCardSvg(barBlock);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain("SWFL Data Gulf"); // wordmark
    expect(svg).toContain("Median home value by city"); // card title
    expect(svg).toContain("Cape Coral"); // bar labels made it through
    expect(svg).toContain("SWFL Data Gulf home-value desk · as of 06/30/2026");
    expect(svg).toContain("swfldatagulf.com");
  });

  it("renders an area block as a trend line (polyline present)", () => {
    const svg = chartBlockToCardSvg({
      ...barBlock,
      title: "Asking rent — Fort Myers",
      chart_type: "area",
      value_format: "currency",
      rows: [
        ["2025-01", 1850],
        ["2025-02", 1870],
        ["2025-03", 1905],
      ],
    });
    expect(svg).toContain("<polyline");
    expect(svg).toContain("Asking rent — Fort Myers");
  });

  it("falls back to big-stat layout for table blocks", () => {
    const svg = chartBlockToCardSvg({
      ...barBlock,
      title: "Quarter at a glance",
      chart_type: "table",
    });
    // no bar track rects, but the numeric values render as big stats
    expect(svg).toContain("$389K");
    expect(svg).toContain("Cape Coral");
  });

  it("renders a title-only card when no cell is numeric", () => {
    const svg = chartBlockToCardSvg({
      ...barBlock,
      title: "Sources overview",
      chart_type: "table",
      rows: [["a", "b"]],
    });
    expect(svg).toContain("Sources overview");
    expect(svg).toContain('width="1200"');
  });

  it("area block with fewer than 2 points falls back instead of crashing", () => {
    const svg = chartBlockToCardSvg({
      ...barBlock,
      chart_type: "area",
      rows: [["2025-01", 1850]],
    });
    expect(svg).toContain('width="1200"');
  });

  it("omits the as-of clause when a legacy block has no asOf", () => {
    const { asOf: _drop, ...rest } = barBlock;
    const svg = chartBlockToCardSvg({ ...rest, asOf: undefined as unknown as string });
    expect(svg).not.toContain("as of");
  });

  it("throws on a malformed block", () => {
    expect(() =>
      chartBlockToCardSvg({ title: 42 } as unknown as ChartBlock),
    ).toThrow("social-card: malformed chart block");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/charts/social-card.test.ts`
Expected: FAIL — `Cannot find module './social-card'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/charts/social-card.ts
//
// The saved-chart SOCIAL CARD: a persisted ChartBlock → a branded 1200×630
// SVG/PNG for og:image unfurls, downloads, and native social posts. Reuses the
// email chart builders (barChartSvg / trendChartSvg — read-only imports; that
// area is claimed by another session today) inside a card frame: teal top bar,
// text wordmark, title, chart body, provenance footer. blockToSpec is
// deliberately NOT used here — it throws on every frame but bar-table
// (lib/deliverable/bind-frame.ts) — rows map straight onto the builders.
//
// Numbers render VERBATIM from the block (formatAxisTick for display only);
// this module never computes a figure. Shape gaps fall back (bar → trend →
// big-stat → title-only) — a saved block always gets a card, never a refusal.

import {
  barChartSvg,
  trendChartSvg,
  svgToPng,
  type TrendPoint,
} from "@/lib/email/chart-image";
import { formatAxisTick, type ValueFormat } from "@/lib/charts/format";
import { formatDisplayDate } from "@/lib/format-date";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";

const W = 1200;
const H = 630;
const M = 56; // outer margin
// Verbatim --gulf-teal (app/globals.css:14). SVG can't resolve CSS vars.
const TEAL = "#3DC9C0";
const NAVY = "#0A1419";
const GREY = "#6B7280";

// Mirror of the (unexported) ChartValueFormat→ValueFormat map in
// lib/email/spec-to-png.ts — duplicated, not imported: that file is claimed by
// a parallel session and this 8-line switch is cheaper than a cross-lane edit.
function toValueFormat(vf?: string): ValueFormat {
  switch (vf) {
    case "usd":
    case "aal":
      return "usd";
    case "currency":
      return "rent";
    case "percent":
      return "pct";
    case "count":
      return "count";
    default:
      return "index";
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** First numeric column index across rows, or null when nothing is numeric. */
function numericColumn(rows: ChartBlock["rows"]): number | null {
  for (const row of rows) {
    for (let j = 0; j < row.length; j++) {
      if (typeof row[j] === "number" && Number.isFinite(row[j])) return j;
    }
  }
  return null;
}

/** Rows → (label, value) points: label = first string cell, value = the numeric column. */
function rowPoints(rows: ChartBlock["rows"], col: number): TrendPoint[] {
  const pts: TrendPoint[] = [];
  for (const row of rows) {
    const v = row[col];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const label = row.find((c): c is string => typeof c === "string") ?? "";
    pts.push({ label, value: v });
  }
  return pts;
}

/** Word-wrap the title to ≤2 lines of ~42 chars; ellipsize overflow. */
function wrapTitle(title: string): string[] {
  const budget = 42;
  if (title.length <= budget) return [title];
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > budget) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length === 2) break;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (lines.length < 2 && cur) lines.push(cur.trim());
  if (lines.length === 2 && cur && lines[1] !== cur) lines[1] = lines[1] + "…";
  return lines.slice(0, 2);
}

/** The card frame: teal bar, wordmark, title, footer. `body` slots between. */
function frame(title: string, footerLeft: string, body: string): string {
  const lines = wrapTitle(title);
  const titleSvg = lines
    .map(
      (ln, i) =>
        `<text x="${M}" y="${128 + i * 52}" font-family="Arial" font-size="44" font-weight="bold" fill="${NAVY}">${esc(ln)}</text>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
    `<rect width="${W}" height="8" fill="${TEAL}"/>` +
    `<rect x="${M}" y="42" width="14" height="14" rx="3" fill="${TEAL}"/>` +
    `<text x="${M + 22}" y="55" font-family="Arial" font-size="20" font-weight="bold" fill="${NAVY}">SWFL Data Gulf</text>` +
    titleSvg +
    body +
    (footerLeft
      ? `<text x="${M}" y="${H - 30}" font-family="Arial" font-size="18" fill="${GREY}">${esc(footerLeft)}</text>`
      : "") +
    `<text x="${W - M}" y="${H - 30}" text-anchor="end" font-family="Arial" font-size="18" fill="${TEAL}">swfldatagulf.com</text>` +
    `</svg>`
  );
}

/** Scale + center an inner chart SVG (known `width="N" height="N"` root) into the body region. */
function placeInner(inner: string): string {
  const m = /width="(\d+)" height="(\d+)"/.exec(inner);
  const iw = m ? Number(m[1]) : 600;
  const ih = m ? Number(m[2]) : 300;
  const regionTop = 210;
  const regionH = 350;
  const regionW = W - 2 * M;
  const s = Math.min(regionW / iw, regionH / ih);
  const tx = (W - iw * s) / 2;
  const ty = regionTop + (regionH - ih * s) / 2;
  return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${s.toFixed(4)})">${inner}</g>`;
}

/** Big-stat fallback body: up to 3 verbatim figures with their labels. */
function bigStats(points: TrendPoint[], fmt: ValueFormat): string {
  const shown = points.slice(0, 3);
  if (shown.length === 0) return "";
  const slotW = (W - 2 * M) / shown.length;
  return shown
    .map((p, i) => {
      const cx = M + i * slotW + slotW / 2;
      const label = p.label.length > 22 ? `${p.label.slice(0, 21)}…` : p.label;
      return (
        `<text x="${cx.toFixed(1)}" y="390" text-anchor="middle" font-family="Arial" font-size="64" font-weight="bold" fill="${NAVY}">${esc(formatAxisTick(fmt, p.value))}</text>` +
        `<text x="${cx.toFixed(1)}" y="432" text-anchor="middle" font-family="Arial" font-size="20" fill="${GREY}">${esc(label)}</text>`
      );
    })
    .join("");
}

export function chartBlockToCardSvg(block: ChartBlock): string {
  if (
    !block ||
    typeof block !== "object" ||
    typeof block.title !== "string" ||
    !Array.isArray(block.rows)
  ) {
    throw new Error("social-card: malformed chart block");
  }

  const fmt = toValueFormat(block.value_format);
  const footerParts: string[] = [];
  if (block.source?.citation) footerParts.push(block.source.citation);
  if (block.asOf) footerParts.push(`as of ${formatDisplayDate(block.asOf)}`);
  const footer = footerParts.join(" · ");

  const col = numericColumn(block.rows);
  const points = col == null ? [] : rowPoints(block.rows, col);
  const shape = block.chart_type ?? "bar";

  let body = "";
  if (shape === "bar" && points.length >= 1) {
    body = placeInner(
      barChartSvg(points, { title: "", accent: TEAL, valueFormat: fmt, width: 600 }),
    );
  } else if (shape === "area" && points.length >= 2) {
    body = placeInner(
      trendChartSvg(points, { title: "", accent: TEAL, valueFormat: fmt }),
    );
  } else {
    body = bigStats(points, fmt); // table / scatter / thin data → verbatim figures
  }

  return frame(block.title, footer, body);
}

/** 1200×630 PNG at intrinsic size (scale 1 — the og:image meta declares these
 *  exact dimensions, so the file must match them). */
export function chartBlockToCardPng(block: ChartBlock): Buffer {
  return svgToPng(chartBlockToCardSvg(block), { scale: 1 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/charts/social-card.test.ts`
Expected: PASS (7 tests). If the `$389K` assertion fails, print the actual `formatAxisTick("usd", 389000)` output and align the assertion to the real formatter (never fork the formatter).

- [ ] **Step 5: Commit**

```bash
git add lib/charts/social-card.ts lib/charts/social-card.test.ts
git commit -m "feat(charts): social card renderer — ChartBlock to branded 1200x630 SVG/PNG"
```

---

### Task 2: Card route + font tracing

**Files:**
- Create: `app/c/[id]/card/route.ts`
- Test: `app/c/[id]/card/route.test.ts`
- Modify: `next.config.ts` (one `outputFileTracingIncludes` entry)

**Interfaces:**
- Consumes: `chartBlockToCardPng(block): Buffer` from Task 1; `createServiceRoleClient` from `@/utils/supabase/service-role` (same client `/c/[id]/page.tsx` uses for `saved_charts`).
- Produces: `GET /c/<id>/card` → `image/png`; `?download=1` → attachment `swfl-<id>.png`. This URL is what Task 3's metadata and ShareRow reference.

- [ ] **Step 1: Write the failing test**

```ts
// app/c/[id]/card/route.test.ts
// Mirrors the mock-module posture of app/api/charts/save/route.test.ts.
import { test, expect, mock } from "bun:test";

const block = {
  title: "Median home value by city",
  columns: ["City", "Value"],
  rows: [["Cape Coral", 389000]],
  chart_type: "bar",
  value_format: "usd",
  asOf: "2026-06-30",
  source: { citation: "SWFL Data Gulf home-value desk" },
};

let row: unknown = { chart_block: block };
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => (row ? { data: row, error: null } : { data: null, error: { message: "not found" } }),
        }),
      }),
    }),
  }),
}));

const { GET } = await import("./route");

function req(url: string) {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}
const params = { params: Promise.resolve({ id: "abc12345" }) };

test("returns a PNG with long-cache headers", async () => {
  row = { chart_block: block };
  const res = await GET(req("http://localhost/c/abc12345/card"), params);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(res.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=86400");
  const buf = new Uint8Array(await res.arrayBuffer());
  // PNG magic bytes
  expect(buf[0]).toBe(0x89);
  expect(buf[1]).toBe(0x50);
});

test("download=1 sets a content-disposition attachment", async () => {
  row = { chart_block: block };
  const res = await GET(req("http://localhost/c/abc12345/card?download=1"), params);
  expect(res.headers.get("content-disposition")).toBe('attachment; filename="swfl-abc12345.png"');
});

test("unknown id is a 404", async () => {
  row = null;
  const res = await GET(req("http://localhost/c/nope/card"), params);
  expect(res.status).toBe(404);
});

test("a malformed persisted block is a 404, never a 500", async () => {
  row = { chart_block: { title: 42 } };
  const res = await GET(req("http://localhost/c/abc12345/card"), params);
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test app/c/[id]/card/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the route**

```ts
// app/c/[id]/card/route.ts
//
// GET /c/<id>/card — the saved chart's social card as a PNG. Extension-free on
// purpose (og:image:type declares the MIME; platforms follow Content-Type).
// Public like /c/[id] itself. Saved charts are immutable → long CDN cache.
// FONTS: this route rasterizes via svgToPng, so next.config.ts MUST trace
// ./assets/fonts/*.ttf for it (blank-text PNGs on Vercel otherwise).

import { type NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { chartBlockToCardPng } from "@/lib/charts/social-card";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("saved_charts")
    .select("chart_block")
    .eq("id", id)
    .single();
  if (error || !data) return new NextResponse("not found", { status: 404 });

  let png: Buffer;
  try {
    png = chartBlockToCardPng(data.chart_block as ChartBlock);
  } catch {
    // A legacy/malformed persisted block degrades to "no card" (platforms fall
    // back to a text-only unfurl — same as today), never a half-drawn 500.
    return new NextResponse("not renderable", { status: 404 });
  }

  const headers = new Headers({
    "content-type": "image/png",
    "cache-control": "public, max-age=3600, s-maxage=86400",
  });
  if (new URL(req.url).searchParams.get("download") === "1") {
    headers.set("content-disposition", `attachment; filename="swfl-${id}.png"`);
  }
  return new NextResponse(new Uint8Array(png), { headers });
}
```

- [ ] **Step 4: Add the font-tracing entry**

In `next.config.ts`, inside the existing `outputFileTracingIncludes` object (after the `"/api/zip-shape/[zip]"` entry), add:

```ts
    // /c/[id]/card rasterizes the social card via svgToPng — bundle the chart
    // TTFs or Vercel renders every label blank (see lib/charts/chart-fonts.ts).
    "/c/[id]/card": ["./assets/fonts/*.ttf"],
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test app/c/[id]/card/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add "app/c/[id]/card/route.ts" "app/c/[id]/card/route.test.ts" next.config.ts
git commit -m "feat(charts): /c/[id]/card social-card PNG route + font tracing"
```

---

### Task 3: OG/Twitter metadata + ShareRow on `/c/[id]`

**Files:**
- Create: `app/c/[id]/ShareRow.tsx`
- Modify: `app/c/[id]/page.tsx` (extend `generateMetadata`; add ShareRow to the action row)

**Interfaces:**
- Consumes: `GET /c/<id>/card` (Task 2) and `/embed/c/<id>` (Task 4 — referenced by URL only, no import; the snippet is valid the moment Task 4 lands).
- Produces: page metadata (og:title/type/url/image + twitter card) and the user-facing share actions.

- [ ] **Step 1: Extend `generateMetadata` in `app/c/[id]/page.tsx`**

Replace the current return in `generateMetadata` (keep the existing db lookup):

```ts
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const db = createServiceRoleClient();
  const { data } = await db.from("saved_charts").select("chart_block").eq("id", id).single();
  const title = (data?.chart_block as ChartBlock | null)?.title ?? "Saved Chart";
  const citation = (data?.chart_block as ChartBlock | null)?.source?.citation;
  // OG contract per ogp.me (crawled 07/10/2026): og:title/type/url/image required;
  // width/height/type/alt structured props on the image. Next's Metadata API emits them.
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://www.swfldatagulf.com";
  const pageTitle = `${title} — SWFL Data Gulf`;
  return {
    title: pageTitle,
    description: citation ? `Chart · ${citation}` : "A sourced chart from SWFL Data Gulf.",
    metadataBase: new URL(base),
    alternates: { canonical: `/c/${id}` },
    openGraph: {
      title: pageTitle,
      type: "website",
      url: `/c/${id}`,
      images: [
        {
          url: `/c/${id}/card`,
          width: 1200,
          height: 630,
          type: "image/png",
          alt: `${title} — chart by SWFL Data Gulf`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      images: [`/c/${id}/card`],
    },
  };
}
```

- [ ] **Step 2: Create `app/c/[id]/ShareRow.tsx`**

```tsx
"use client";

// Share actions for a saved chart: copy the public link, download the social
// card PNG, copy an embed snippet. The "Scheduled socials" pill is a roadmap
// marker, deliberately not a button.

import { useState } from "react";

interface Props {
  id: string;
  title: string;
  siteUrl: string; // absolute origin, no trailing slash
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

export function ShareRow({ id, title, siteUrl }: Props) {
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);

  function flash(kind: "link" | "embed") {
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  const embedSnippet =
    `<iframe src="${siteUrl}/embed/c/${id}" width="640" height="420" ` +
    `style="border:0;border-radius:12px;overflow:hidden" loading="lazy" ` +
    `title="${title.replace(/"/g, "&quot;")} — SWFL Data Gulf"></iframe>`;

  const btn =
    "text-xs text-gulf-teal underline underline-offset-2 transition-colors hover:text-gulf-teal/80";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4">
      <button type="button" className={btn} onClick={() => void copyText(`${siteUrl}/c/${id}`).then(() => flash("link"))}>
        {copied === "link" ? "Link copied ✓" : "Copy link"}
      </button>
      <a className={btn} href={`/c/${id}/card?download=1`}>
        Download PNG
      </a>
      <button type="button" className={btn} onClick={() => void copyText(embedSnippet).then(() => flash("embed"))}>
        {copied === "embed" ? "Embed code copied ✓" : "Copy embed code"}
      </button>
      <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-gray-400">
        Scheduled socials — coming soon
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Wire ShareRow into the page**

In `app/c/[id]/page.tsx`, import it and compute the site origin, then render it directly under the existing action row `</div>` (the one holding `AddToProject` / `PrintButton`):

```tsx
import { ShareRow } from "./ShareRow";
```

```tsx
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://www.swfldatagulf.com";
```

```tsx
<ShareRow id={id} title={chart_block.title} siteUrl={siteUrl} />
```

- [ ] **Step 4: Verify it compiles**

Run: `bunx next build`
Expected: build GREEN (fresh `/c/[id]` + `/c/[id]/card` in the route list). This is the metadata verification gate locally; the unfurl itself is live-verify.

- [ ] **Step 5: Commit**

```bash
git add "app/c/[id]/page.tsx" "app/c/[id]/ShareRow.tsx"
git commit -m "feat(charts): /c/[id] og:image + twitter card metadata and share row"
```

---

### Task 4: Embed page — `app/embed/c/[id]/page.tsx`

**Files:**
- Create: `app/embed/c/[id]/page.tsx`

**Interfaces:**
- Consumes: `saved_charts` row (same lookup as `/c/[id]`), `ChartBlockView`, `asOfFromToken` — all existing.
- Produces: `GET /embed/c/<id>` — chromeless iframe target. Lives under `/embed/` ON PURPOSE: `next.config.ts` `headers()` already sends `Content-Security-Policy: frame-ancestors *` + `X-Frame-Options: ALLOWALL` for `/embed/:path*` — do NOT create a parallel headers rule for a new path.

- [ ] **Step 1: Write the page**

```tsx
// app/embed/c/[id]/page.tsx
//
// Chromeless embed target for a saved chart (iframe snippet on /c/[id]).
// Under /embed/ on purpose — that prefix already carries the frame-ancestors-*
// headers in next.config.ts. The footer credit links back to the full page;
// attribution IS the growth loop, so it is not a prop and cannot be disabled.

import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { asOfFromToken } from "@/lib/project/as-of";
import { ChartBlockView } from "@/components/charts/ChartBlockView";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SavedChartRow {
  chart_block: ChartBlock;
  freshness_token: string | null;
}

export default async function EmbedSavedChartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("saved_charts")
    .select("chart_block, freshness_token")
    .eq("id", id)
    .single<SavedChartRow>();
  if (error || !data) notFound();

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://www.swfldatagulf.com";
  const asOf = asOfFromToken(data.freshness_token);

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
      <div
        style={{
          background: "#152832",
          border: "1px solid #22414F",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>
          {data.chart_block.title}
        </h1>
        <ChartBlockView block={data.chart_block} />
        <p
          style={{
            margin: "12px 0 0",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: "#807E76",
          }}
        >
          <span>{asOf ?? ""}</span>
          <a
            href={`${siteUrl}/c/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3DC9C0", textDecoration: "none" }}
          >
            Chart: SWFL Data Gulf ↗
          </a>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify it compiles + headers apply**

Run: `bunx next build`
Expected: GREEN, `/embed/c/[id]` listed. Header rule check is by construction (`/embed/:path*` source in `next.config.ts` matches `/embed/c/<id>`) — assert live in Task 5.

- [ ] **Step 3: Commit**

```bash
git add "app/embed/c/[id]/page.tsx"
git commit -m "feat(charts): chromeless /embed/c/[id] iframe target with attribution credit"
```

---

### Task 5: Full verification + session log

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)

- [ ] **Step 1: Full test + build**

Run: `bun test lib/charts/social-card.test.ts "app/c/[id]/card/route.test.ts"` then `bunx next build`
Expected: all tests PASS, build GREEN.

- [ ] **Step 2: Live local check (real data end-to-end)**

Start the built app (`bunx next start`), find a real saved chart id (`saved_charts` newest row), then:
- `/c/<id>` — page renders, share row present, view-source shows `og:image` → `/c/<id>/card`, `twitter:card=summary_large_image`.
- `/c/<id>/card` — a real 1200×630 PNG with wordmark, chart geometry, provenance footer (open it, look at it — labels must not be blank).
- `/c/<id>/card?download=1` — downloads as `swfl-<id>.png`.
- `/embed/c/<id>` — chromeless card renders; response headers include `content-security-policy: frame-ancestors *`; drop the iframe snippet into a scratch HTML file and confirm it frames.

- [ ] **Step 3: SESSION_LOG entry + commit (do NOT push — operator gate)**

Append the entry (what shipped, verification evidence, check stays open pending prod unfurl validation), then:

```bash
git add SESSION_LOG.md
git commit -m "docs(session-log): saved-chart social object built + verified local"
```

**Prod live-verify (closes `chart_social_object_live_verify`, post-deploy):** paste a `/c/` link into opengraph.xyz or the X card validator → card unfurls; embed snippet framed on an external page.

---

## Self-Review (done at write time)

- **Spec coverage:** card renderer (T1), card route + fonts (T2), metadata + share row (T3), embed (T4), verification (T5). Spec's `app/c/[id]/embed/page.tsx` path superseded by `/embed/c/[id]` — existing frame-headers seam beats a new headers rule (spec's own "verify the headers config" clause resolved this way).
- **Placeholders:** none; every code step is complete.
- **Type consistency:** `chartBlockToCardSvg/Png` names match across T1/T2; `ShareRow` props match call site; `TrendPoint` used for both builders' inputs (bar builder takes `{label,value}[]` — same shape).
