# PDF/HTML Visual-Parity Regression Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 7 tasks, 8 files, keywords: architecture

**Goal:** A new `bun:test` suite that fails loudly when the PDF render of an `EmailDoc` stops visually matching its HTML render on image/photo geometry, and when a PDF page-break bleeds content to the physical edge — the two bug classes that already shipped three times with no test catching them.

**Architecture:** Two small, independently-testable pixel-buffer helpers (`findContentBoundingBox` for background-relative scanning, `findMarkerBoundingBox` for marker-color scanning) feed two rasterization wrappers (Playwright for HTML, `pdf-to-img` for PDF) feed one test file with three checks: region-strict aspect-ratio parity on synthetic marker images, a loose full-page pixelmatch tripwire, and a PDF-only page-break-padding floor. Nothing in `lib/email/blocks/**` or `lib/pdf/email-doc-pdf.tsx` changes — this is entirely new test infrastructure.

**Tech Stack:** `bun:test`, `pdf-to-img@^6.2.0` (verified via `registry.npmjs.org` 07/14/2026 — its only declared runtime dep is `pdfjs-dist@~5.6.205`, but it needs the native `canvas` package to actually rasterize, confirmed by reading its `canvasFactory.ts`/`index.ts` source), `canvas` (native, node-canvas), `pixelmatch` + `pngjs` (pure JS), `playwright` (already a dependency, `package.json:136` — used via its plain programmatic API, `chromium.launch()`, NOT the separate `@playwright/test` runner already wired for `emails/visual-regression.playwright.ts`).

**Spec:** `docs/superpowers/specs/2026-07-14-pdf-html-visual-parity-design.md` · **Check:** `pdf_html_visual_parity_live_verify`

## Global Constraints

- **No production rendering code changes.** `lib/email/blocks/**`, `lib/pdf/email-doc-pdf.tsx`, `email-head.ts` are untouched. `PAGE_TOP_PAD` (defined locally in `email-doc-pdf.tsx`, not exported) is mirrored as a literal `24` in the test with a comment pointing at its source — it is NOT exported for this build, per the spec's out-of-scope line.
- **No test hooks added to shared block components.** No `data-block-id`, no `data-testid`. Isolation comes from single-block fixture docs, not from targeting elements inside a busier doc.
- **New devDependencies only** (`pdf-to-img`, `canvas`, `pixelmatch`, `pngjs`) — nothing imported outside `lib/pdf/__tests__/**`, so `bunx next build` must stay green.
- **Lockfile gate (RULE 1):** any commit touching `package.json` includes the resulting `bun.lock` in the same commit.
- **Existing `lib/pdf/__tests__/email-doc-pdf.test.ts` and `lib/email/__tests__/font-parity.test.ts` stay unmodified** — this plan adds files, it doesn't touch those.
- **No silent skips.** If `canvas`/`pdf-to-img` fail to load, or Chromium isn't installed, tests fail with the real error — never a soft skip.
- Verify with `bunx next build` (never bare `tsc`), consistent with this repo's standing rule.
- Commit only the files each task owns (shared git index — `git add <explicit paths>`, never `-A`).

## File Structure

- Modify: `package.json`, `bun.lock` — add 4 devDependencies.
- Create: `lib/pdf/__tests__/visual-parity-deps.smoke.test.ts` — proves the 4 new packages actually load on this machine.
- Create: `lib/pdf/__tests__/pixel-utils.ts` (+ `.test.ts`) — `findContentBoundingBox`, `findMarkerBoundingBox`, `boundingBoxRatio`, `resizeNearestNeighbor`. Pure, no I/O.
- Create: `lib/pdf/__tests__/visual-parity-fixtures.ts` — synthetic two-marker-color test image (as a `data:` URI) + the header/agent-hero/page-break `EmailDoc` fixtures.
- Create: `lib/pdf/__tests__/rasterize.ts` (+ `.test.ts`) — `rasterizeHtml`, `rasterizePdfPage`, plus the react-pdf-Image-accepts-a-data-URI smoke test.
- Create: `lib/pdf/__tests__/rasterize-html-worker.mjs` — a standalone Node script `rasterizeHtml` spawns as a subprocess. **Discovered during implementation, not anticipated in the design pass:** `chromium.launch()` hangs indefinitely when called directly from the Bun runtime on this (Windows) machine — the browser process actually launches (a real pid), but Bun never completes the `--remote-debugging-pipe` handshake. Verified with a minimal repro (works under plain Node, hangs under `bun run` too — not a `bun:test`-specific issue). This is a known, unresolved upstream limitation (oven-sh/bun issues #27977, #23826, #15679, #10120), not a bug in this code. PDF rasterization (`pdf-to-img` + `canvas`) has no such problem and stays in-process.
- Create: `lib/pdf/__tests__/pdf-html-visual-parity.test.ts` — the actual acceptance gate: region-strict (Layer 1) + full-page loose (Layer 2) for both fixtures, plus the page-break-bleed check.

---

### Task 1: Install the 4 new devDependencies, prove they load

**Files:**
- Modify: `package.json`, `bun.lock`
- Create: `lib/pdf/__tests__/visual-parity-deps.smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: working, importable `pngjs`, `pixelmatch`, `pdf-to-img`, `canvas`, `playwright` (already present) for every later task.

- [ ] **Step 1: Install**

```bash
bun add -d pdf-to-img canvas pixelmatch pngjs
```

Let `bun` resolve and pin actual current versions into `bun.lock` — don't hand-write version numbers for `canvas`/`pixelmatch`/`pngjs` (only `pdf-to-img@6.2.0`'s exact metadata was verified against `registry.npmjs.org` during the design pass; the others should be read back from what actually installs, not assumed).

- [ ] **Step 2: Read back what actually installed**

```bash
node -e "const p=require('./package.json'); console.log(p.devDependencies['pdf-to-img'], p.devDependencies['canvas'], p.devDependencies['pixelmatch'], p.devDependencies['pngjs'])"
```

Note the four resolved version ranges — if `canvas` fails to install (native build/prebuilt-binary issue on this machine), stop here and resolve it before continuing; don't work around it by skipping the dependency.

- [ ] **Step 3: Write the smoke test**

```ts
// lib/pdf/__tests__/visual-parity-deps.smoke.test.ts
//
// Proves the 4 new devDependencies actually load on this machine BEFORE any
// other visual-parity test depends on them. `canvas` is a native binding
// (node-canvas, a Cairo wrapper) that pdf-to-img's Node rendering path needs
// but doesn't declare as its own dependency (it's a devDependency of pdf-to-img
// itself) — a consumer has to install it separately, and it's the one piece
// most likely to fail on an unfamiliar machine (missing prebuilt binary for
// the host platform). This test isolates that failure mode with a clear name,
// instead of a confusing failure deep inside a real rasterization call.
import { describe, expect, it } from "bun:test";

describe("visual-parity devDependencies load", () => {
  it("pngjs exports PNG", async () => {
    const { PNG } = await import("pngjs");
    expect(typeof PNG).toBe("function");
  });

  it("pixelmatch is callable", async () => {
    const mod = await import("pixelmatch");
    const pixelmatch = mod.default ?? mod;
    expect(typeof pixelmatch).toBe("function");
  });

  it("pdf-to-img exports pdf()", async () => {
    const { pdf } = await import("pdf-to-img");
    expect(typeof pdf).toBe("function");
  });

  it("canvas (the native binding pdf-to-img's Node render path needs) loads and creates a canvas", async () => {
    const { createCanvas } = await import("canvas");
    const canvas = createCanvas(10, 10);
    expect(canvas.width).toBe(10);
  });

  it("playwright exports chromium with a launch() method", async () => {
    const { chromium } = await import("playwright");
    expect(typeof chromium.launch).toBe("function");
  });
});
```

- [ ] **Step 4: Run it**

Run: `bun test lib/pdf/__tests__/visual-parity-deps.smoke.test.ts`
Expected: PASS (5 tests). If the `canvas` test fails with a native-binding load error, this is a real environment problem to fix now (reinstall, check for a prebuilt binary for this platform/Node version) — not something to route around.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock lib/pdf/__tests__/visual-parity-deps.smoke.test.ts
git commit -m "chore(pdf): add pdf-to-img, canvas, pixelmatch, pngjs devDependencies for visual-parity testing" -- package.json bun.lock lib/pdf/__tests__/visual-parity-deps.smoke.test.ts
```

---

### Task 2: `pixel-utils.ts` — bounding-box + resize primitives

**Files:**
- Create: `lib/pdf/__tests__/pixel-utils.ts`
- Test: `lib/pdf/__tests__/pixel-utils.test.ts`

**Interfaces:**
- Consumes: `pngjs`'s `PNG` (Task 1).
- Produces:
  - `interface Rgb { r: number; g: number; b: number }`
  - `interface BoundingBox { x: number; y: number; width: number; height: number }`
  - `findContentBoundingBox(png: PNG, background: Rgb, threshold?: number): BoundingBox | null` — bounding box of pixels **differing** from `background` by more than `threshold` (max-channel distance). Used by the page-break check (Task 6) against a known-white page background.
  - `findMarkerBoundingBox(png: PNG, markers: Rgb[], threshold?: number): BoundingBox | null` — bounding box of pixels **matching any** marker color within `threshold`. Used by Layer 1 (Task 5) — robust regardless of what surrounds the marked image, since it looks for the marker color itself rather than "not the background" (which breaks down once a raster has more than one background region, e.g. a dark header band on a light page).
  - `boundingBoxRatio(box: BoundingBox): number` — `width / height`.
  - `resizeNearestNeighbor(png: PNG, width: number, height: number): PNG` — needed because `pixelmatch` (Task 5, Layer 2) requires two buffers of identical dimensions, and the PDF raster and HTML screenshot never come out the same size.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/pdf/__tests__/pixel-utils.test.ts
import { describe, expect, it } from "bun:test";
import { PNG } from "pngjs";
import {
  findContentBoundingBox,
  findMarkerBoundingBox,
  boundingBoxRatio,
  resizeNearestNeighbor,
  type Rgb,
} from "./pixel-utils";

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const MAGENTA: Rgb = { r: 255, g: 0, b: 255 };
const YELLOW: Rgb = { r: 255, g: 255, b: 0 };

/** A white png with a solid rectangle of `color` painted at [x0,x1) x [y0,y1). */
function pngWithRect(width: number, height: number, x0: number, y0: number, x1: number, y1: number, color: Rgb): PNG {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const inRect = x >= x0 && x < x1 && y >= y0 && y < y1;
      png.data[idx] = inRect ? color.r : 255;
      png.data[idx + 1] = inRect ? color.g : 255;
      png.data[idx + 2] = inRect ? color.b : 255;
      png.data[idx + 3] = 255;
    }
  }
  return png;
}

describe("findContentBoundingBox", () => {
  it("finds the box of a rectangle differing from a white background", () => {
    const png = pngWithRect(100, 100, 10, 20, 50, 70, MAGENTA);
    expect(findContentBoundingBox(png, WHITE)).toEqual({ x: 10, y: 20, width: 40, height: 50 });
  });

  it("returns null for an all-background image", () => {
    const png = pngWithRect(50, 50, 0, 0, 0, 0, MAGENTA);
    expect(findContentBoundingBox(png, WHITE)).toBeNull();
  });
});

describe("findMarkerBoundingBox", () => {
  it("finds the box spanning two different marker colors", () => {
    const png = new PNG({ width: 100, height: 40 });
    // left half magenta, right half yellow, rest of a taller canvas stays white
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 100; x++) {
        const idx = (100 * y + x) << 2;
        const inBand = y >= 5 && y < 35;
        const color = x < 50 ? MAGENTA : YELLOW;
        png.data[idx] = inBand ? color.r : 255;
        png.data[idx + 1] = inBand ? color.g : 255;
        png.data[idx + 2] = inBand ? color.b : 255;
        png.data[idx + 3] = 255;
      }
    }
    expect(findMarkerBoundingBox(png, [MAGENTA, YELLOW])).toEqual({ x: 0, y: 5, width: 100, height: 30 });
  });

  it("returns null when no pixel matches any marker", () => {
    const png = pngWithRect(20, 20, 0, 0, 0, 0, MAGENTA);
    expect(findMarkerBoundingBox(png, [MAGENTA, YELLOW])).toBeNull();
  });

  it("ignores a background that differs from white (the case findContentBoundingBox can't handle)", () => {
    // whole canvas is navy EXCEPT a magenta rectangle — a single "background" color
    // reference would have to know it's navy, not white; findMarkerBoundingBox doesn't care.
    const NAVY: Rgb = { r: 15, g: 29, b: 36 };
    const png = new PNG({ width: 60, height: 60 });
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 60; x++) {
        const idx = (60 * y + x) << 2;
        const inRect = x >= 20 && x < 40 && y >= 10 && y < 30;
        const c = inRect ? MAGENTA : NAVY;
        png.data[idx] = c.r;
        png.data[idx + 1] = c.g;
        png.data[idx + 2] = c.b;
        png.data[idx + 3] = 255;
      }
    }
    expect(findMarkerBoundingBox(png, [MAGENTA, YELLOW])).toEqual({ x: 20, y: 10, width: 20, height: 20 });
  });
});

describe("boundingBoxRatio", () => {
  it("is width / height", () => {
    expect(boundingBoxRatio({ x: 0, y: 0, width: 400, height: 100 })).toBe(4);
  });
});

describe("resizeNearestNeighbor", () => {
  it("preserves a solid color when downsizing", () => {
    const png = pngWithRect(100, 100, 0, 0, 100, 100, MAGENTA);
    const resized = resizeNearestNeighbor(png, 10, 10);
    expect(resized.width).toBe(10);
    expect(resized.height).toBe(10);
    expect(resized.data[0]).toBe(255); // MAGENTA.r — but written via r,g,b,a order below
    expect([resized.data[0], resized.data[1], resized.data[2]]).toEqual([255, 0, 255]);
  });

  it("preserves a 2x2 checkerboard's corner colors when upsizing", () => {
    const png = new PNG({ width: 2, height: 2 });
    const colors = [MAGENTA, YELLOW, YELLOW, MAGENTA]; // TL, TR, BL, BR
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const idx = (2 * y + x) << 2;
        const c = colors[y * 2 + x];
        png.data[idx] = c.r;
        png.data[idx + 1] = c.g;
        png.data[idx + 2] = c.b;
        png.data[idx + 3] = 255;
      }
    }
    const big = resizeNearestNeighbor(png, 40, 40);
    const at = (x: number, y: number) => {
      const idx = (40 * y + x) << 2;
      return [big.data[idx], big.data[idx + 1], big.data[idx + 2]];
    };
    expect(at(0, 0)).toEqual([255, 0, 255]); // TL magenta
    expect(at(39, 0)).toEqual([255, 255, 0]); // TR yellow
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/pdf/__tests__/pixel-utils.test.ts`
Expected: FAIL — `Cannot find module './pixel-utils'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/pdf/__tests__/pixel-utils.ts — PURE. Pixel-buffer primitives shared by the
// PDF/HTML visual-parity suite. No I/O, no rendering — just RGBA buffer math,
// so these are tested with hand-built synthetic PNGs, not real renders.
import { PNG } from "pngjs";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function maxChannelDistance(r: number, g: number, b: number, c: Rgb): number {
  return Math.max(Math.abs(r - c.r), Math.abs(g - c.g), Math.abs(b - c.b));
}

function scanBoundingBox(png: PNG, matches: (r: number, g: number, b: number) => boolean): BoundingBox | null {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      if (matches(png.data[idx], png.data[idx + 1], png.data[idx + 2])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Bounding box of pixels DIFFERING from `background` by more than `threshold`
 *  (max-channel distance, 0-255). Only meaningful when the raster has ONE
 *  uniform background color surrounding the content of interest — use
 *  `findMarkerBoundingBox` when that doesn't hold (e.g. a dark band on a
 *  light page). */
export function findContentBoundingBox(png: PNG, background: Rgb, threshold = 32): BoundingBox | null {
  return scanBoundingBox(png, (r, g, b) => maxChannelDistance(r, g, b, background) > threshold);
}

/** Bounding box of pixels MATCHING any of `markers` within `threshold`. Robust
 *  regardless of what surrounds the marked content, since it looks for the
 *  marker color itself rather than "isn't the background." */
export function findMarkerBoundingBox(png: PNG, markers: Rgb[], threshold = 32): BoundingBox | null {
  return scanBoundingBox(png, (r, g, b) => markers.some((m) => maxChannelDistance(r, g, b, m) <= threshold));
}

export function boundingBoxRatio(box: BoundingBox): number {
  return box.width / box.height;
}

/** Nearest-neighbor resize — no new image-processing dependency. Only used to
 *  bring two differently-sized rasters (a PDF page vs. an HTML screenshot) to
 *  a common size before pixelmatch, which requires identical dimensions. */
export function resizeNearestNeighbor(png: PNG, width: number, height: number): PNG {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(png.height - 1, Math.floor((y * png.height) / height));
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(png.width - 1, Math.floor((x * png.width) / width));
      const srcIdx = (png.width * srcY + srcX) << 2;
      const dstIdx = (width * y + x) << 2;
      out.data[dstIdx] = png.data[srcIdx];
      out.data[dstIdx + 1] = png.data[srcIdx + 1];
      out.data[dstIdx + 2] = png.data[srcIdx + 2];
      out.data[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/pdf/__tests__/pixel-utils.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/__tests__/pixel-utils.ts lib/pdf/__tests__/pixel-utils.test.ts
git commit -m "feat(pdf): pixel-buffer primitives for visual-parity testing (bounding box, marker match, resize)" -- lib/pdf/__tests__/pixel-utils.ts lib/pdf/__tests__/pixel-utils.test.ts
```

---

### Task 3: Fixture images and `EmailDoc`s

**Files:**
- Create: `lib/pdf/__tests__/visual-parity-fixtures.ts`

**Interfaces:**
- Consumes: `pngjs`'s `PNG` (Task 1).
- Produces:
  - `MARKER_A`, `MARKER_B: Rgb` (magenta/yellow — re-exported for tests that need to pass them to `findMarkerBoundingBox`).
  - `TEST_IMAGE_DATA_URI: string` — a 400×100 (4:1) `data:image/png;base64,...` image, left half `MARKER_A`, right half `MARKER_B`. Deliberately non-square and saturated: a squash/stretch bug is far more visible on a wide image, and the marker colors don't occur anywhere else in a rendered doc (navy `#0f1d24`, white, light gray `#F8F8F8`, teal `#3DC9C0`), so `findMarkerBoundingBox` can't false-match the surrounding chrome.
  - `headerFixtureDoc(): EmailDoc` — one `header` block, `logoUrl: TEST_IMAGE_DATA_URI`.
  - `agentHeroFixtureDoc(): EmailDoc` — one `agent-hero` block, `photoUrl: TEST_IMAGE_DATA_URI`.
  - `pageBreakFixtureDoc(): EmailDoc` — a `header` block followed by one `text` block with a body long enough to force `@react-pdf`'s automatic page wrap onto a second page.

- [ ] **Step 1: Write the file**

```ts
// lib/pdf/__tests__/visual-parity-fixtures.ts
//
// Shared fixtures for the PDF/HTML visual-parity suite. The test image is
// generated in code (not a checked-in binary asset) so it's reviewable as
// plain code and reproducible byte-for-byte.
import { PNG } from "pngjs";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { Rgb } from "./pixel-utils";

export const MARKER_A: Rgb = { r: 255, g: 0, b: 255 }; // magenta
export const MARKER_B: Rgb = { r: 255, g: 255, b: 0 }; // yellow

const IMAGE_WIDTH = 400;
const IMAGE_HEIGHT = 100;

function buildTestImage(): Buffer {
  const png = new PNG({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT });
  for (let y = 0; y < IMAGE_HEIGHT; y++) {
    for (let x = 0; x < IMAGE_WIDTH; x++) {
      const idx = (IMAGE_WIDTH * y + x) << 2;
      const c = x < IMAGE_WIDTH / 2 ? MARKER_A : MARKER_B;
      png.data[idx] = c.r;
      png.data[idx + 1] = c.g;
      png.data[idx + 2] = c.b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

export const TEST_IMAGE_DATA_URI = `data:image/png;base64,${buildTestImage().toString("base64")}`;

const GLOBAL_STYLE = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS" as const,
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};

export function headerFixtureDoc(): EmailDoc {
  return {
    globalStyle: { ...GLOBAL_STYLE },
    blocks: [{ id: "h1", type: "header", props: { logoUrl: TEST_IMAGE_DATA_URI } }],
  };
}

export function agentHeroFixtureDoc(): EmailDoc {
  return {
    globalStyle: { ...GLOBAL_STYLE },
    blocks: [{ id: "a1", type: "agent-hero", props: { photoUrl: TEST_IMAGE_DATA_URI } }],
  };
}

/** Header + one very long text block — forces @react-pdf's automatic page wrap
 *  (Page `wrap` defaults true) onto a 2nd LETTER page regardless of exact font
 *  metrics, so the page-break check (Task 6) has something to check against. */
export function pageBreakFixtureDoc(): EmailDoc {
  const longBody = Array.from({ length: 400 }, (_, i) => `Line ${i + 1} of filler prose to force pagination.`).join(
    "\n",
  );
  return {
    globalStyle: { ...GLOBAL_STYLE },
    blocks: [
      { id: "h1", type: "header", props: { logoUrl: TEST_IMAGE_DATA_URI } },
      { id: "t1", type: "text", props: { body: longBody, align: "left" } },
    ],
  };
}
```

- [ ] **Step 2: Sanity-check it imports cleanly**

Run: `bun -e "import('./lib/pdf/__tests__/visual-parity-fixtures.ts').then(m => console.log(m.TEST_IMAGE_DATA_URI.length, m.headerFixtureDoc().blocks.length))"`
Expected: prints a large number (base64 length) and `1`, no error.

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/__tests__/visual-parity-fixtures.ts
git commit -m "feat(pdf): shared fixtures for visual-parity testing (marker test image, header/agent-hero/page-break docs)" -- lib/pdf/__tests__/visual-parity-fixtures.ts
```

---

### Task 4: `rasterize.ts` — HTML and PDF page → PNG

**Files:**
- Create: `lib/pdf/__tests__/rasterize.ts`
- Test: `lib/pdf/__tests__/rasterize.test.ts`

**Interfaces:**
- Consumes: `playwright`'s `chromium` (Task 1), `pdf-to-img`'s `pdf` (Task 1), `pngjs`'s `PNG` (Task 1), `TEST_IMAGE_DATA_URI` (Task 3), `findMarkerBoundingBox`/`MARKER_A`/`MARKER_B` (Tasks 2–3).
- Produces:
  - `rasterizeHtml(html: string, viewport: { width: number; height: number }): Promise<PNG>`
  - `rasterizePdfPage(pdfBuffer: Buffer, pageNumber: number, scale?: number): Promise<PNG>` (`pageNumber` is 1-indexed, matching `pdf-to-img`'s `getPage`)
  - `rasterizePdfPageCount(pdfBuffer: Buffer): Promise<number>` — needed by the page-break check (Task 6) to assert the fixture actually produced ≥2 pages before checking page 2's geometry.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/pdf/__tests__/rasterize.test.ts
//
// Smoke tests for the two rasterization wrappers, PLUS the one vendor-contract
// assumption this whole suite rests on: does @react-pdf/renderer's <Image src>
// actually accept a data:image/png;base64,... string? react-pdf's docs
// (react-pdf.org/components#image) list "URL or filesystem path (Node only)"
// as the String form and don't call out data URIs explicitly — this test
// confirms it empirically instead of assuming it.
import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { Document, Page, Image, renderToBuffer } from "@react-pdf/renderer";
import { rasterizeHtml, rasterizePdfPage, rasterizePdfPageCount } from "./rasterize";
import { findMarkerBoundingBox } from "./pixel-utils";
import { TEST_IMAGE_DATA_URI, MARKER_A, MARKER_B } from "./visual-parity-fixtures";

describe("rasterizeHtml", () => {
  it("returns a decodable PNG for trivial HTML", async () => {
    const html = `<html><body style="margin:0"><div style="width:120px;height:60px;background:red"></div></body></html>`;
    const png = await rasterizeHtml(html, { width: 200, height: 100 });
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });
});

describe("rasterizePdfPage / rasterizePdfPageCount", () => {
  it("returns a decodable PNG and correct page count for a trivial one-page PDF", async () => {
    const buf = await renderToBuffer(
      createElement(Document, null, createElement(Page, { size: "A4" }, null)),
    );
    expect(await rasterizePdfPageCount(buf)).toBe(1);
    const png = await rasterizePdfPage(buf, 1);
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });

  it("@react-pdf/renderer's Image accepts a data:image/png;base64 URI and actually paints it", async () => {
    const buf = await renderToBuffer(
      createElement(
        Document,
        null,
        createElement(
          Page,
          { size: "A4" },
          createElement(Image, { src: TEST_IMAGE_DATA_URI, style: { width: 200, height: 50 } }),
        ),
      ),
    );
    const png = await rasterizePdfPage(buf, 1, 3);
    const box = findMarkerBoundingBox(png, [MARKER_A, MARKER_B]);
    expect(box).not.toBeNull(); // the marker colors were actually drawn, not silently dropped
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/pdf/__tests__/rasterize.test.ts`
Expected: FAIL — `Cannot find module './rasterize'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/pdf/__tests__/rasterize.ts — thin wrappers turning an HTML string or a
// PDF buffer into a decoded PNG, for the visual-parity suite only. Not
// production code; not imported outside lib/pdf/__tests__.
import { chromium } from "playwright";
import { pdf as pdfToImg } from "pdf-to-img";
import { PNG } from "pngjs";

export async function rasterizeHtml(
  html: string,
  viewport: { width: number; height: number },
): Promise<PNG> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport });
    await page.setContent(html, { waitUntil: "networkidle" });
    const buf = await page.screenshot({ fullPage: true });
    return PNG.sync.read(buf);
  } finally {
    await browser.close();
  }
}

export async function rasterizePdfPage(pdfBuffer: Buffer, pageNumber: number, scale = 2): Promise<PNG> {
  const doc = await pdfToImg(pdfBuffer, { scale });
  try {
    const buf = await doc.getPage(pageNumber);
    return PNG.sync.read(buf);
  } finally {
    await doc.destroy();
  }
}

export async function rasterizePdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const doc = await pdfToImg(pdfBuffer);
  try {
    return doc.length;
  } finally {
    await doc.destroy();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/pdf/__tests__/rasterize.test.ts`
Expected: PASS (3 tests). If the data-URI test fails (box is `null`), STOP — this means the design's core assumption is wrong and Task 5 needs a fallback (write the fixture image to a temp file and pass its filesystem path as `src` instead — react-pdf's docs confirm "filesystem path (Node only)" is supported — before proceeding).

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/__tests__/rasterize.ts lib/pdf/__tests__/rasterize.test.ts
git commit -m "feat(pdf): HTML/PDF rasterization wrappers for visual-parity testing; confirm react-pdf Image accepts data URIs" -- lib/pdf/__tests__/rasterize.ts lib/pdf/__tests__/rasterize.test.ts
```

---

### Task 5: Layer 1 (region-strict) + Layer 2 (full-page loose) — the main acceptance gate

**Files:**
- 🔴 Create: `lib/pdf/__tests__/pdf-html-visual-parity.test.ts`

**Interfaces:**
- Consumes: `renderEmailDocHtml` (`@/lib/email/render-email-doc`), `renderEmailDocToBuffer` (`@/lib/pdf`), `rasterizeHtml`/`rasterizePdfPage` (Task 4), `findMarkerBoundingBox`/`boundingBoxRatio`/`resizeNearestNeighbor` (Task 2), `headerFixtureDoc`/`agentHeroFixtureDoc`/`MARKER_A`/`MARKER_B` (Task 3), `pixelmatch`.
- Produces: the acceptance gate itself — no other task consumes this file.

- [ ] **Step 1: Write the test**

```ts
// lib/pdf/__tests__/pdf-html-visual-parity.test.ts
//
// Catches visual-fidelity regressions between the PDF and HTML renders of the
// SAME EmailDoc — a gap email-doc-pdf.test.ts doesn't cover (it only proves
// every block type produces *a* valid PDF, not that it visually matches HTML).
// Three production bugs already slipped through exactly this gap (see the
// design spec, 2026-07-14-pdf-html-visual-parity-design.md): a squashed logo
// (objectFit "fill" vs HTML's implicit "contain"), a stretched logo (flexbox
// alignItems defaulting to "stretch"), and a page-2 header bleeding to the
// physical edge (PAGE_TOP_PAD margin math). All three are geometry bugs, not
// text-rendering bugs — the checks below are pixel-based but deliberately
// avoid comparing text, since the PDF path uses built-in Helvetica/Times-Roman
// while HTML uses real webfonts and will never match glyph-for-glyph.
import { describe, expect, it } from "bun:test";
import pixelmatchMod from "pixelmatch";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { renderEmailDocToBuffer } from "@/lib/pdf";
import { rasterizeHtml, rasterizePdfPage } from "./rasterize";
import { findMarkerBoundingBox, boundingBoxRatio, resizeNearestNeighbor } from "./pixel-utils";
import { headerFixtureDoc, agentHeroFixtureDoc, MARKER_A, MARKER_B } from "./visual-parity-fixtures";

const pixelmatch = pixelmatchMod as unknown as (
  img1: Uint8Array,
  img2: Uint8Array,
  output: Uint8Array | null,
  width: number,
  height: number,
  options?: { threshold?: number },
) => number;

const HTML_VIEWPORT = { width: 600, height: 800 };
const REGION_RATIO_TOLERANCE = 0.05; // 5%
const FULL_PAGE_DIFF_CEILING = 0.5; // 50% — a coarse tripwire, not a precise gate
const CANON_SIZE = { width: 300, height: 300 };

const FIXTURES = [
  { name: "header logo", doc: headerFixtureDoc() },
  { name: "agent-hero photo", doc: agentHeroFixtureDoc() },
];

describe.each(FIXTURES)("PDF/HTML visual parity — $name", ({ doc }) => {
  it("Layer 1 (region-strict): marker image's aspect ratio matches within 5%", async () => {
    const html = await renderEmailDocHtml(doc);
    const htmlPng = await rasterizeHtml(html, HTML_VIEWPORT);

    const pdfBuf = await renderEmailDocToBuffer(doc);
    const pdfPng = await rasterizePdfPage(pdfBuf, 1);

    const htmlBox = findMarkerBoundingBox(htmlPng, [MARKER_A, MARKER_B]);
    const pdfBox = findMarkerBoundingBox(pdfPng, [MARKER_A, MARKER_B]);

    expect(htmlBox).not.toBeNull();
    expect(pdfBox).not.toBeNull();
    if (!htmlBox || !pdfBox) return; // unreachable — narrows for TS below

    const htmlRatio = boundingBoxRatio(htmlBox);
    const pdfRatio = boundingBoxRatio(pdfBox);
    const relDiff = Math.abs(htmlRatio - pdfRatio) / htmlRatio;

    // eslint-disable-next-line no-console -- intentional: visible in test output for tuning
    console.log(`[visual-parity] ${JSON.stringify({ htmlRatio, pdfRatio, relDiff })}`);
    expect(relDiff).toBeLessThan(REGION_RATIO_TOLERANCE);
  });

  it("Layer 2 (full-page loose): coarse pixel diff stays under 50% (catastrophic-breakage tripwire)", async () => {
    const html = await renderEmailDocHtml(doc);
    const htmlPng = await rasterizeHtml(html, HTML_VIEWPORT);

    const pdfBuf = await renderEmailDocToBuffer(doc);
    const pdfPng = await rasterizePdfPage(pdfBuf, 1);

    const a = resizeNearestNeighbor(htmlPng, CANON_SIZE.width, CANON_SIZE.height);
    const b = resizeNearestNeighbor(pdfPng, CANON_SIZE.width, CANON_SIZE.height);
    const diffPixels = pixelmatch(a.data, b.data, null, CANON_SIZE.width, CANON_SIZE.height, {
      threshold: 0.3,
    });
    const diffRatio = diffPixels / (CANON_SIZE.width * CANON_SIZE.height);

    // eslint-disable-next-line no-console -- intentional: logged unconditionally so drift is
    // visible in test output long before it ever trips the loose ceiling below.
    console.log(`[visual-parity] full-page diff ratio: ${(diffRatio * 100).toFixed(1)}%`);
    expect(diffRatio).toBeLessThan(FULL_PAGE_DIFF_CEILING);
  });
});
```

- [ ] **Step 2: Run and read the actual numbers before asserting they pass**

Run: `bun test lib/pdf/__tests__/pdf-html-visual-parity.test.ts`

This is the one point in the plan where the expected outcome genuinely depends on real rendering, so read the logged `relDiff` and `diffRatio` values rather than assuming PASS:

- If `relDiff` is comfortably under 5% for both fixtures — good, the tolerance is right, leave it.
- If `relDiff` is consistently, say, 8-15% due to a systematic rendering difference (e.g., PDF's default DPI vs. the HTML viewport's device pixel ratio skewing the marker box's measured aspect ratio slightly, independent of any real bug), widen `REGION_RATIO_TOLERANCE` to comfortably clear that systematic gap (document why in a comment) rather than picking a number that happens to pass today.
- If `diffRatio` is way above 50% even though nothing is visibly wrong (font rendering really does dominate at this canonical size), raise `FULL_PAGE_DIFF_CEILING` — its job is only to catch catastrophic breakage, not to be tight.

Expected after tuning: PASS (4 tests: 2 fixtures × 2 layers).

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/__tests__/pdf-html-visual-parity.test.ts
git commit -m "feat(pdf): PDF/HTML visual-parity acceptance test — region-strict + full-page-loose layers" -- lib/pdf/__tests__/pdf-html-visual-parity.test.ts
```

---

### Task 6: Page-break-bleed check (bug #3 — PDF-only, no HTML comparison)

**Files:**
- 🔴 Modify: `lib/pdf/__tests__/pdf-html-visual-parity.test.ts`

**Interfaces:**
- Consumes: `renderEmailDocToBuffer`, `rasterizePdfPage`, `rasterizePdfPageCount` (Task 4), `findContentBoundingBox` (Task 2), `pageBreakFixtureDoc` (Task 3).
- Produces: nothing consumed elsewhere — this is the last check in the file.

- [ ] **Step 1: Write the failing test** (append to the same file)

```ts
import { pageBreakFixtureDoc } from "./visual-parity-fixtures";
import { findContentBoundingBox } from "./pixel-utils";

// Mirrors PAGE_TOP_PAD in lib/pdf/email-doc-pdf.tsx (currently 24, not exported —
// this build makes no change to production rendering code, so the value is
// duplicated here; if that constant changes, update this literal to match).
const PAGE_TOP_PAD_PT = 24;
const PDF_WHITE = { r: 255, g: 255, b: 255 };
const RASTER_SCALE = 2;

describe("PDF page-break bleed (bug #3 — PDF-only, no HTML side to compare against)", () => {
  it("page 2's top content is offset from the physical edge by roughly PAGE_TOP_PAD, not flush", async () => {
    const buf = await renderEmailDocToBuffer(pageBreakFixtureDoc());

    const pageCount = await import("./rasterize").then((m) => m.rasterizePdfPageCount(buf));
    // If this fails, the fixture no longer forces a 2nd page (e.g. font metrics
    // changed) — fix the fixture's line count, don't loosen the assertion below.
    expect(pageCount).toBeGreaterThanOrEqual(2);

    const { rasterizePdfPage } = await import("./rasterize");
    const page2 = await rasterizePdfPage(buf, 2, RASTER_SCALE);
    const box = findContentBoundingBox(page2, PDF_WHITE);

    expect(box).not.toBeNull();
    if (!box) return;

    // eslint-disable-next-line no-console -- intentional: the exact pt→px scale factor
    // is an assumption (72dpi baseline × RASTER_SCALE), logged so it's visible if this
    // ever needs re-tuning rather than silently drifting.
    console.log(`[visual-parity] page 2 top offset: ${box.y}px (expect >= ~${PAGE_TOP_PAD_PT * RASTER_SCALE * 0.5}px)`);
    expect(box.y).toBeGreaterThanOrEqual(PAGE_TOP_PAD_PT * RASTER_SCALE * 0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails first, then passes**

Run: `bun test lib/pdf/__tests__/pdf-html-visual-parity.test.ts`

If `pageCount` comes back `1`, increase the line count in `pageBreakFixtureDoc` (Task 3) until it reliably produces 2+ pages, then re-run. If `box.y` comes back near `0` on a correctly-functioning build, the `0.5` floor multiplier or the 72dpi assumption needs adjusting — read the logged value and pick a floor that's clearly above "flush against the edge" (a few px) and clearly below the real padding, rather than asserting an exact match.

Expected: PASS (5 tests total in the file).

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/__tests__/pdf-html-visual-parity.test.ts
git commit -m "feat(pdf): page-break-bleed regression check (PDF-only, reuses the same rasterization pipeline)" -- lib/pdf/__tests__/pdf-html-visual-parity.test.ts
```

---

### Task 7: Full-suite verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the whole new suite plus the two suites it must not have touched**

```bash
bun test lib/pdf lib/email/__tests__/font-parity.test.ts
```

Expected: PASS — `lib/pdf/__tests__/email-doc-pdf.test.ts` (unchanged), `lib/email/__tests__/font-parity.test.ts` (unchanged), plus all new files, all green.

- [ ] **Step 2: Confirm the production build still passes with the new devDependencies present**

```bash
bunx next build
```

Expected: PASS — the 4 new packages are devDependencies only, imported exclusively from `lib/pdf/__tests__/**`, so nothing should leak into the app bundle. If the build fails referencing `canvas` or `pdf-to-img`, something imported a test-only module from production code — find and fix that import, don't add the packages to `serverExternalPackages` as a workaround.

- [ ] **Step 3: Append a SESSION_LOG entry and push**

Per this repo's RULE 0/RULE 1: append a top-of-file entry to `SESSION_LOG.md` (what was built, that `bunx next build` and the full test run are green, link to the spec/plan) before pushing. This is devDependency + test-only work — no `data_lake.*` writes, no live `/api/b/*` surface touched, no pack/vocab changes — so it falls under RULE 1's "just push" autonomy bar (docs/tooling-adjacent), but confirm the diff really is scoped to what this plan describes before pushing, since a shared git index means `git status` should be re-checked for anything unexpected first.

```bash
git add SESSION_LOG.md
git commit -m "log: session log entry for the PDF/HTML visual-parity regression test" -- SESSION_LOG.md
node scripts/safe-push.mjs
```

- [ ] **Step 4: Close the live-verify check**

```bash
node scripts/check.mjs close pdf_html_visual_parity_live_verify
```

---

## Self-Review Notes

- **Spec coverage:** Layer 1 (Task 5) ✓, Layer 2 (Task 5) ✓, page-break check (Task 6) ✓, data-URI risk flagged with an early smoke test + explicit fallback note (Task 4) ✓, no production code changes (Global Constraints + Task 6's literal-not-export choice) ✓, error handling / no silent skips (Task 1's smoke test, Task 4's stop-and-fix note) ✓, lockfile gate (Task 1) ✓, existing tests left alone (Task 7 confirms) ✓.
- **Type consistency:** `BoundingBox`/`Rgb` (Task 2) are the only shared types across Tasks 2–6; every later task imports them from `./pixel-utils` rather than redefining. `rasterizePdfPageCount` (introduced in Task 4) is consumed only by Task 6, matching its stated purpose there.
- **Out of scope respected:** no 12-block extension, no pre-push gate wiring, no shared-component changes, no generic framework — this plan builds exactly the fixtures and checks the spec named and nothing more.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 5, Task 6 | `lib/pdf/__tests__/pdf-html-visual-parity.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
