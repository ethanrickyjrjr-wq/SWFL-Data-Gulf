# Showcase Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 15 files, keywords: architecture

**Goal:** Replace the pill panel's five text-only example links with three step-through deliverable showcases (three fictional companies, three styles), each ending on a tier/CTA slide that opens the OTP login modal.

**Architecture:** Static demonstration HTML artifacts live under `public/showcase/<id>/live/`; a local capture script renders them to committed `.webp` slides; a client-safe registry (`lib/showcase/registry.ts`) describes slides + captions; `ShowcaseOverlay` (portal, near-fullscreen, click-through, no auto-advance) renders them from `BriefcasePanel`, reusable on the homepage later via a `?showcase=` param.

**Tech Stack:** Next.js App Router client components, Tailwind, bun:test, sharp (already a dep), Python Playwright from the pinned crawl4ai venv (capture only — never a runtime/build dependency).

**Spec:** `docs/superpowers/specs/2026-07-02-showcase-overlays-design.md`

## Global Constraints

- **No invented numbers.** Every figure in artifact HTML comes from the query results embedded in this plan (re-run the SQL at authoring time and use the fresh output), a named web source, or the anchor listing page. A claim not present in a source is omitted.
- **As-of dates:** MM/DD/YYYY, stated once per artifact. Listing feed scrape 07/01/2026; ZHVI through 05/31/2026.
- **Copy rules:** no system nouns (master/brain/pack ids/§), no "ZIP-level intelligence" framing, no competitor product names. Citations in artifacts say "SWFL Data Gulf listing feed" / named web source — never vendor/MLS names.
- **Every showcase carries the disclosure:** "Demonstration campaign — [company] and its agent are fictional. The property, comp, and market data are real — SWFL Data Gulf (07/01/2026)." (adjust date to freshest source used).
- **Layout:** `h-dvh` / `dvh`, never `h-screen`.
- **ESLint:** `react-hooks/set-state-in-effect` is a hard error — initial open-state from URL uses lazy `useState` init, not an effect.
- **Git:** stage explicit paths only; never `git add -A`; commit per task; NO PUSH until operator confirms (append SESSION_LOG entry before the eventual push; use `node scripts/safe-push.mjs`).
- **Verification:** `bun test` (full) + `bunx next build` — never bare `npx tsc`.
- **Prettier hook** reformats touched files on write — expect it; don't fight formatting.
- Email artifact HTML style: table-based, inline styles, 600px main table, `role="presentation"`, preheader div, same craft bar as the latitude26 files.

## Data anchors (queried 07/02/2026 via lake MCP — re-run before authoring)

**Cape Coral ZIP medians** (active residential listings, scrape 07/01/2026):

```sql
SELECT zip_code, COUNT(*) AS actives, ROUND(MEDIAN(list_price)) AS median_list
FROM pg.data_lake.active_listings_residential
WHERE city='Cape Coral' AND status ILIKE '%active%' AND list_price > 0
GROUP BY zip_code ORDER BY zip_code
```

Result: 33904 $499,900 (368) · 33909 $364,900 (427) · 33914 $538,850 (538) · 33990 $429,900 (199) · 33991 $489,000 (283) · 33993 $389,000 (736). Drop 33908 (n=1, not a Cape ZIP in practice).

**Showcase-2 anchor house** (freshest matches; picked: highest-lot fresh listing in the premium SW corridor):

```sql
SELECT street_address, zip_code, list_price, beds, baths, sqft, acres, days_on_market, listing_url
FROM pg.data_lake.active_listings_residential
WHERE city='Cape Coral' AND status ILIKE '%active%'
  AND list_price BETWEEN 500000 AND 700000 AND beds >= 3 AND sqft >= 1800
  AND listing_url IS NOT NULL
ORDER BY days_on_market ASC LIMIT 12
```

Picked anchor: **1927 Savona Parkway W, Cape Coral 33904/33914 corridor — ZIP 33914 · $620,000 · 3 bd / 2 ba · 1,973 sqft · 0.37 acres · 4 days on market** · `https://www.johnrwood.com/listing/2026028022/1927-savona-parkway-w-cape-coral-fl-33914/`. **Waterfront/canal claims are NOT in the lake row** — only claims visible on that listing page (crawled in Task 2 Step 1) may appear, cited to "the listing page (John R. Wood, 07/02/2026)". If the listing goes off-market before authoring, re-run the query and pick the top ZIP-33914 row, then re-crawl.

**Fort Myers ZHVI, April→May 2026 vintage pair** (`period_end` 04/30/2026 vs 05/31/2026):

```sql
SELECT zip_code, period_end, ROUND(home_value) AS zhvi
FROM zhvi_swfl WHERE city='Fort Myers' AND period_end >= DATE '2026-04-30'
ORDER BY zip_code, period_end
```

Result (Apr → May): 33901 262,373→261,247 · 33905 287,125→285,794 · 33907 205,799→204,209 · 33908 325,534→323,815 · 33912 381,095→380,200 · 33913 441,666→440,786 · 33916 217,698→216,478 · 33919 250,122→249,034 · 33966 338,820→338,515 · 33967 359,011→356,961. Every ZIP eased slightly — the honest pulse story is "the cool-down continued in May."

**Fort Myers pulse aggregates** (run at authoring; use output verbatim):

```sql
SELECT COUNT(*) AS actives, ROUND(MEDIAN(list_price)) AS median_list,
       ROUND(MEDIAN(days_on_market)) AS median_dom
FROM pg.data_lake.active_listings_residential
WHERE city='Fort Myers' AND status ILIKE '%active%' AND list_price > 0
```

## Brand tokens

- **Latitude 26 Estates** (existing): bg `#EFE9DD` / panel `#FBF9F5` / deep teal `#0A2A2C` `#103B3E` / gold `#B98F45` `#C7A45C` / Georgia serif.
- **Cast & Coast Realty** (Cape Coral, mid-market, energetic coastal): bg `#F2FAFB` / card `#FFFFFF` / primary teal-aqua `#0E7C86` / accent coral `#FF6B57` / ink `#12343B` / Arial-only, big rounded buttons, generous whitespace.
- **Meridian South Advisory** (Fort Myers, data-forward editorial): bg `#FAF8F4` / ink `#1A1A18` / single accent `#C4551A` / hairline rules `#D8D2C6` / Georgia headlines + Arial body, chart-heavy, no photography.

## File structure

- `public/showcase/listing-to-close/live/{01-coming-soon,02-new-listing,03-comps,04-pending,05-sold}.html` — copied latitude26 artifacts
- `public/showcase/launch-blitz/live/{agent-intro,social-pack,social-01-square,social-02-landscape,social-03-portrait,social-04-story}.html` — new Cast & Coast artifacts
- `public/showcase/market-pulse/live/{ask,pulse-email,socials,vintages}.html` — new Meridian South artifacts
- `public/showcase/<id>/step-N.webp`, `public/showcase/<id>/thumb.webp` — committed captures
- `scripts/capture-showcase.mjs` — local capture (spawns pinned venv Python Playwright, converts via sharp)
- `lib/showcase/registry.ts` + `lib/showcase/registry.test.ts`
- `lib/showcase/overlay-logic.ts` + `lib/showcase/overlay-logic.test.ts`
- `components/showcase/ShowcaseCard.tsx`, `components/showcase/ShowcaseOverlay.tsx`
- Modify: `components/briefcase/BriefcasePanel.tsx` · Delete: `lib/briefcase/example-cards.ts`, `lib/briefcase/example-cards.test.ts` · Modify: `lib/briefcase/panel-logic.test.ts`

---

### Task 1: Vendor the Latitude 26 artifacts

**Files:**
- Create: `public/showcase/listing-to-close/live/01-coming-soon.html` (+ 02–05)

**Interfaces:**
- Produces: five HTML files at the exact paths above; Task 4 captures them; Task 5 registry references `/showcase/listing-to-close/live/<name>.html` as `liveHref`.

- [ ] **Step 1: Copy the five lifecycle emails (PowerShell tool)**

```powershell
New-Item -ItemType Directory -Force public\showcase\listing-to-close\live
Copy-Item "c:\Users\ethan\Downloads\latitude26-campaign\01-coming-soon.html","c:\Users\ethan\Downloads\latitude26-campaign\02-new-listing.html","c:\Users\ethan\Downloads\latitude26-campaign\03-comps.html","c:\Users\ethan\Downloads\latitude26-campaign\04-pending.html","c:\Users\ethan\Downloads\latitude26-campaign\05-sold.html" public\showcase\listing-to-close\live\
```

- [ ] **Step 2: Verify copies are byte-identical and openable**

Run: `Get-ChildItem public\showcase\listing-to-close\live | Select-Object Name, Length`
Expected: 5 files, lengths matching the Downloads originals (7211, 9518, 12357, 8405, 9269 bytes ± prettier if the hook reformats — if the hook rewrites them, that's fine, they must still render).

- [ ] **Step 3: Commit**

```bash
git add public/showcase/listing-to-close/live
git commit -m "feat(showcase): vendor Latitude 26 lifecycle emails as showcase artifacts"
```

---

### Task 2: Author the Cast & Coast Realty artifacts (launch-blitz)

**Files:**
- Create: `public/showcase/launch-blitz/live/agent-intro.html`
- Create: `public/showcase/launch-blitz/live/social-01-square.html`, `social-02-landscape.html`, `social-03-portrait.html`, `social-04-story.html`
- Create: `public/showcase/launch-blitz/live/social-pack.html` (composite board of the 4, for the slide capture)

**Interfaces:**
- Consumes: brand tokens + data anchors above.
- Produces: 6 HTML files; Task 4 captures `agent-intro.html` and `social-pack.html`; Task 5 references all as `liveHref`s.

- [ ] **Step 1: Crawl the anchor listing page for citable property facts (crawl4ai, output stays in scratchpad — never committed)**

```bash
C:/Users/ethan/crawl4ai-venv/Scripts/python.exe -c "
import asyncio
from crawl4ai import AsyncWebCrawler
async def main():
    async with AsyncWebCrawler() as c:
        r = await c.arun(url='https://www.johnrwood.com/listing/2026028022/1927-savona-parkway-w-cape-coral-fl-33914/')
        open(r'<SCRATCHPAD>/savona-listing.md','w',encoding='utf-8').write(r.markdown or '')
asyncio.run(main())
"
```

Read the output. Only facts on that page (waterfront/gulf access, pool, year built, photo count) may be used in copy, cited as "listing page (John R. Wood), 07/02/2026". If the crawl fails or the listing is gone, re-run the anchor SQL, pick the next ZIP-33914 row, re-crawl.

- [ ] **Step 2: Re-run the two Cape Coral queries** (ZIP medians + anchor row) from Data anchors; keep the fresh output beside you — all numbers below must match it.

- [ ] **Step 3: Author `agent-intro.html`** — table-based email, 600px, Cast & Coast tokens. Required sections, top to bottom: brand bar (CAST & COAST REALTY / CAPE CORAL, FLORIDA in `#0E7C86` on white, coral rule); agent intro block (fictional agent, e.g. "Danny Vero" — 2 short paragraphs positioning him as the data-first Cape agent, no superlatives without sources); **ZIP-median column chart built as inline-styled div bars** — six Cape ZIPs from the query (heights proportional to median; label each bar `$500K · 33904` style; footnote "Median asking price per ZIP · N active listings · SWFL Data Gulf listing feed, 07/01/2026"); anchor-house feature card ($620,000 · 3 bd / 2 ba · 1,973 sqft · 0.37 acres — facts from Step 1 page get one sentence, cited); ONE CTA button ("See this weekend's launch plan", coral `#FF6B57`); footer with the fictional-brand disclosure. Subject line (in `<title>` + preheader): ≤40 chars, e.g. "Launch weekend: 1927 Savona Pkwy W".

- [ ] **Step 4: Author the four social cards** — each a fixed-size page: square 1080×1080, landscape 1200×628, portrait 1080×1350, story 1080×1920 (set exact `width`/`height` on a wrapper div; capture uses these). Content per format: square = "JUST LISTED" + price + 3 spec chips; landscape = the ZIP-median bar chart as a market-data hook ("Where Cape Coral prices sit right now"); portrait = anchor house + "4 days on market and counting" momentum line; story = teaser countdown to the open house (no invented date — use "This Saturday" only if the listing page shows one; otherwise "Launch weekend"). First line of every caption block is a data hook; hashtag row mixes local + broad: `#CapeCoral #SWFL #JustListed #FloridaHomes`. All figures from the queries; disclosure line in small print on each.

- [ ] **Step 5: Author `social-pack.html`** — one page, `#12343B` background, the four cards laid side-by-side at reduced scale with format labels above each (`SQUARE · FEED`, `LANDSCAPE · LINK POST`, `PORTRAIT · FEED`, `STORY · 9:16`). Implement by pasting each card's wrapper markup into a flex row (no iframes — file:// iframes break in capture).

- [ ] **Step 6: Open each file in the browser, eyeball against the latitude26 bar** (brand coherence, no typos, numbers match query output). Fix until clean.

- [ ] **Step 7: Commit**

```bash
git add public/showcase/launch-blitz/live
git commit -m "feat(showcase): Cast & Coast launch-blitz artifacts — agent intro + 4-format social pack (all figures lake-sourced)"
```

---

### Task 3: Author the Meridian South Advisory artifacts (market-pulse)

**Files:**
- Create: `public/showcase/market-pulse/live/ask.html`, `pulse-email.html`, `socials.html`, `vintages.html`

**Interfaces:**
- Consumes: brand tokens, ZHVI vintage pair, Fort Myers pulse aggregates query.
- Produces: 4 HTML files; Task 4 captures all; Task 5 references them.

- [ ] **Step 1: Re-run the ZHVI vintage query and the Fort Myers pulse aggregates query**; keep outputs beside you.

- [ ] **Step 2: Author `ask.html`** — NOT an email: a clean product-moment mock (Meridian tokens, 1100px wide). Big serif line: the typed ask — `"Every first Monday, send my farm the Fort Myers market pulse — my brand, my sign-off."` Below it three small setup chips (`Schedule: first Monday, 9:00 AM`, `Audience: your contact list`, `Brand: Meridian South`), and a subdued line: "That's the whole setup. Every send after this one builds itself from fresh data." No numbers on this page.

- [ ] **Step 3: Author `pulse-email.html`** — table-based email, 600px, Meridian tokens, built to the researched standards (single column · exactly ONE CTA · subject ≤40 chars: "Fort Myers pulse: May cooled again"). Sections: masthead (MERIDIAN SOUTH ADVISORY / THE FORT MYERS PULSE · edition dated 07/2026); lead paragraph — the honest read: every Fort Myers ZIP eased in May (from the vintage pair; call the largest move by name, e.g. 33967 −0.6% — compute percent in a code comment beside the value, both months shown); **ZHVI table-as-chart**: ten ZIPs, April and May values with a small ▼ delta chip each (inline-styled, no images); market snapshot row: actives · median asking · median days on market from the aggregates query; one [INFERENCE]-free closing paragraph (facts only, tier-1 voice); ONE CTA ("Get this pulse for your own farm", `#C4551A`); footer: source line ("Zillow Home Value Index through 05/31/2026 · SWFL Data Gulf listing feed, 07/01/2026") + disclosure.

- [ ] **Step 4: Author `socials.html`** — composite board (like social-pack.html, `#1A1A18` bg): square card ("FORT MYERS PULSE · MAY" + the single biggest ZIP move, both real values) and landscape card (3-ZIP mini bar comparison). Serialized-content framing baked into the copy: "Edition #2 lands first Monday" (Sprout Social: audiences return for series — this is the practice on display, receipt goes in the registry caption, not the artifact).

- [ ] **Step 5: Author `vintages.html`** — the proof-it-updates page (1200px, Meridian tokens): April edition column vs May edition column of the same three-row snippet (33901, 33913, 33967 with their real values), differences highlighted in `#C4551A`, headline "Nothing was rewritten by hand. The data moved; the email followed." Small print names both vintages once: "Vintages: 04/30/2026 and 05/31/2026."

- [ ] **Step 6: Eyeball pass in browser; numbers cross-checked against query output.**

- [ ] **Step 7: Commit**

```bash
git add public/showcase/market-pulse/live
git commit -m "feat(showcase): Meridian South market-pulse artifacts — ask, pulse email, socials, vintage proof (ZHVI 04/30 vs 05/31/2026)"
```

---

### Task 4: Capture script + committed slide assets

**Files:**
- Create: `scripts/capture-showcase.mjs`
- Create: `public/showcase/<id>/step-N.webp` + `public/showcase/<id>/thumb.webp` (outputs)

**Interfaces:**
- Consumes: the HTML files from Tasks 1–3 at their exact paths.
- Produces: `listing-to-close/step-1..5.webp`, `launch-blitz/step-1..2.webp`, `market-pulse/step-1..4.webp`, one `thumb.webp` per showcase. Task 5's registry hard-codes these paths; its test asserts they exist.

- [ ] **Step 1: Write `scripts/capture-showcase.mjs`**

```js
/**
 * Local-only capture: renders public/showcase HTML to committed .webp slides.
 * Uses the pinned crawl4ai venv's Python Playwright (chromium already installed)
 * so the repo gains NO runtime/build browser dependency. Re-run whenever a
 * showcase HTML changes, then commit the .webp outputs.
 *   node scripts/capture-showcase.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PY = "C:\\Users\\ethan\\crawl4ai-venv\\Scripts\\python.exe";

// slide order here IS the registry slide order (minus the component-rendered tier slide)
const SHOWCASES = [
  { id: "listing-to-close", width: 700, files: [
    "01-coming-soon.html", "02-new-listing.html", "03-comps.html", "04-pending.html", "05-sold.html",
  ]},
  { id: "launch-blitz", width: 700, files: ["agent-intro.html"] },
  { id: "launch-blitz", width: 1400, files: ["social-pack.html"], startAt: 2 },
  { id: "market-pulse", width: 1100, files: ["ask.html"] },
  { id: "market-pulse", width: 700, files: ["pulse-email.html"], startAt: 2 },
  { id: "market-pulse", width: 1400, files: ["socials.html"], startAt: 3 },
  { id: "market-pulse", width: 1200, files: ["vintages.html"], startAt: 4 },
];

const PY_SRC = `
import json, sys
from playwright.sync_api import sync_playwright
jobs = json.load(open(sys.argv[1], encoding="utf-8"))
with sync_playwright() as p:
    b = p.chromium.launch()
    for j in jobs:
        ctx = b.new_context(viewport={"width": j["width"], "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto("file:///" + j["html"].replace("\\\\", "/"))
        page.wait_for_timeout(2500)  # let remote listing photos land
        page.screenshot(path=j["png"], full_page=True)
        ctx.close()
        print("captured", j["png"])
    b.close()
`;

const tmp = mkdtempSync(join(tmpdir(), "showcase-cap-"));
const jobs = [];
for (const s of SHOWCASES) {
  let n = s.startAt ?? 1;
  for (const f of s.files) {
    jobs.push({
      width: s.width,
      html: join(ROOT, "public", "showcase", s.id, "live", f),
      png: join(tmp, `${s.id}-step-${n}.png`),
      out: join(ROOT, "public", "showcase", s.id, `step-${n}.webp`),
      id: s.id, step: n,
    });
    n++;
  }
}
writeFileSync(join(tmp, "cap.py"), PY_SRC);
writeFileSync(join(tmp, "jobs.json"), JSON.stringify(jobs));
const r = spawnSync(PY, [join(tmp, "cap.py"), join(tmp, "jobs.json")], { stdio: "inherit" });
if (r.status !== 0) { rmSync(tmp, { recursive: true, force: true }); process.exit(1); }

for (const j of jobs) {
  await sharp(j.png).webp({ quality: 82 }).toFile(j.out);
  if (j.step === 1) {
    await sharp(j.png).resize({ width: 480 }).webp({ quality: 75 })
      .toFile(join(ROOT, "public", "showcase", j.id, "thumb.webp"));
  }
  console.log("wrote", j.out);
}
rmSync(tmp, { recursive: true, force: true });
```

- [ ] **Step 2: Run it**

Run: `node scripts/capture-showcase.mjs`
Expected: `captured …` ×10, `wrote …step-N.webp` ×10, thumbs for all 3 ids. If Playwright import fails in the venv, verify: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -c "import playwright; print('ok')"`.

- [ ] **Step 3: Open 2–3 webps and eyeball** — crisp text at 2x, full page captured, remote comp photos present in `03-comps` capture.

- [ ] **Step 4: Commit**

```bash
git add scripts/capture-showcase.mjs public/showcase/listing-to-close/*.webp public/showcase/launch-blitz/*.webp public/showcase/market-pulse/*.webp
git commit -m "feat(showcase): capture script (local venv playwright + sharp) + committed slide assets"
```

---

### Task 5: Showcase registry (TDD)

**Files:**
- Create: `lib/showcase/registry.ts`
- Test: `lib/showcase/registry.test.ts`

**Interfaces:**
- Produces: `export interface ShowcaseSlide { image: string; title: string; whatsHappening: string; howAiHandled: string; liveHref?: string; receipt?: string }` · `export interface Showcase { id: string; company: string; title: string; hook: string; accent: string; thumb: string; disclosure: string; slides: ShowcaseSlide[] }` · `export const SHOWCASES: Showcase[]` (exactly 3, ids `listing-to-close`, `launch-blitz`, `market-pulse`). Tasks 6–7 import these.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SHOWCASES } from "./registry";

/** Registry is the single source of truth for the panel showcases. A missing
 *  asset must be a red test here, never a broken slide in prod. */
describe("showcase registry", () => {
  it("ships exactly 3 showcases with unique ids", () => {
    expect(SHOWCASES).toHaveLength(3);
    expect(new Set(SHOWCASES.map((s) => s.id)).size).toBe(3);
  });
  it("every asset path exists under public/", () => {
    for (const s of SHOWCASES) {
      expect(existsSync(join(process.cwd(), "public", s.thumb))).toBe(true);
      for (const sl of s.slides) {
        expect(existsSync(join(process.cwd(), "public", sl.image))).toBe(true);
        if (sl.liveHref) expect(existsSync(join(process.cwd(), "public", sl.liveHref))).toBe(true);
      }
    }
  });
  it("2-6 content slides, non-empty captions, disclosure present", () => {
    for (const s of SHOWCASES) {
      expect(s.slides.length).toBeGreaterThanOrEqual(2);
      expect(s.slides.length).toBeLessThanOrEqual(6);
      expect(s.disclosure.length).toBeGreaterThan(20);
      for (const sl of s.slides) {
        expect(sl.title.length).toBeGreaterThan(0);
        expect(sl.whatsHappening.length).toBeGreaterThan(0);
        expect(sl.howAiHandled.length).toBeGreaterThan(0);
      }
    }
  });
  it("captions carry no system nouns", () => {
    const banned = /\bmaster\b|\bbrain[- ]?id\b|§|pack[- ]id/i;
    for (const s of SHOWCASES)
      for (const sl of s.slides)
        expect(banned.test(sl.whatsHappening + " " + sl.howAiHandled)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test lib/showcase/registry.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/showcase/registry.ts`** — client-safe (no server imports, no fs). Header comment mirrors `example-cards.ts`'s. Paths root-relative for `next/image`/`<img src>`: `"/showcase/<id>/step-1.webp"`. Fill all three showcases; caption content rules: `whatsHappening` = what this piece does in the campaign; `howAiHandled` = the concrete mechanics ("picked six live comps in 34108 and computed each $/sqft in code — no adjectives"); `receipt` (optional, shows as a footnote) carries the named-source practice line, e.g. `"One CTA per email — 'give readers three things to click and they often click nothing' (Luxury Presence, 2026)."` `accent` per brand: `#B98F45`, `#0E7C86`, `#C4551A`. Slide lists must mirror Task 4's capture order exactly. The tier slide is NOT in the registry — the overlay appends it (Task 6).

- [ ] **Step 4: Run to verify pass** — `bun test lib/showcase/registry.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/showcase/registry.ts lib/showcase/registry.test.ts
git commit -m "feat(showcase): typed client-safe registry for the 3 showcases + on-disk asset guard tests"
```

---

### Task 6: Overlay logic + components (TDD on logic)

**Files:**
- Create: `lib/showcase/overlay-logic.ts` + `lib/showcase/overlay-logic.test.ts`
- Create: `components/showcase/ShowcaseCard.tsx`, `components/showcase/ShowcaseOverlay.tsx`

**Interfaces:**
- Consumes: `SHOWCASES`, `Showcase`, `ShowcaseSlide` from Task 5; `LoginModal` from `@/components/landing/LoginModal`.
- Produces: `totalSteps(s: Showcase): number` (slides + tier) · `clampStep(step: number, total: number): number` · `stepLabel(s: Showcase, step: number): string` ("Step 3 of 6 · Market Comps"; tier step → "What you get") · `<ShowcaseCard showcase onOpen(id)>` · `<ShowcaseOverlay showcase onClose()>`.

- [ ] **Step 1: Write the failing logic test**

```ts
import { describe, it, expect } from "bun:test";
import { SHOWCASES } from "./registry";
import { totalSteps, clampStep, stepLabel } from "./overlay-logic";

describe("overlay logic", () => {
  const s = SHOWCASES[0];
  it("total = content slides + the tier slide", () => {
    expect(totalSteps(s)).toBe(s.slides.length + 1);
  });
  it("clamps step into [0, total)", () => {
    expect(clampStep(-1, 6)).toBe(0);
    expect(clampStep(99, 6)).toBe(5);
    expect(clampStep(3, 6)).toBe(3);
  });
  it("labels content steps by slide title and the last step as the tier", () => {
    expect(stepLabel(s, 0)).toBe(`Step 1 of ${totalSteps(s)} · ${s.slides[0].title}`);
    expect(stepLabel(s, totalSteps(s) - 1)).toBe(
      `Step ${totalSteps(s)} of ${totalSteps(s)} · What you get`,
    );
  });
});
```

- [ ] **Step 2: Run to fail** — `bun test lib/showcase/overlay-logic.test.ts` → FAIL.

- [ ] **Step 3: Implement `overlay-logic.ts`**

```ts
import type { Showcase } from "./registry";

/** Content slides + the component-rendered tier slide. */
export function totalSteps(s: Showcase): number {
  return s.slides.length + 1;
}

export function clampStep(step: number, total: number): number {
  return Math.min(Math.max(step, 0), total - 1);
}

export function stepLabel(s: Showcase, step: number): string {
  const total = totalSteps(s);
  const name = step === total - 1 ? "What you get" : s.slides[step].title;
  return `Step ${step + 1} of ${total} · ${name}`;
}
```

- [ ] **Step 4: Run to pass**, then build the components.

`ShowcaseCard.tsx` (client): thumbnail card — `<img src={showcase.thumb}>` (fixed h-24 object-cover object-top), title, hook, step-count chip (`{totalSteps(s)} steps`), border-left in `accent`; `onClick={() => onOpen(showcase.id)}`; degrade path: wrap in `<a href={showcase.slides[0].liveHref ?? "#"}>` semantics are NOT needed — keep a `<button>`; JS-off degradation is covered by the view-live links inside the overlay per spec §D, and the card itself is decorative without JS.

`ShowcaseOverlay.tsx` (client): follow `LoginModal`'s portal pattern exactly (createPortal, `fixed inset-0`, scrim click + Esc close, body scroll lock) but `z-[90]` so `LoginModal` (`z-[100]`) stacks above. Layout: full-viewport flex column, max-h `100dvh`; header row = company name + step rail (named steps as buttons, current highlighted in `accent`) + close ×; body = for content steps, scrollable `<img>` (max-w mirrors capture width, `mx-auto`) + caption block (whatsHappening / howAiHandled / optional receipt in smaller gray / "See the real email ↗" when `liveHref`, `target="_blank"`); for the final step, the tier layout: two cards — Free: unlimited builds · every number cited to a real source · email + PDF · watermark after the first month / Pro: clean branded sends · your logo · scheduling (NO dollar figure) — plus primary CTA "Start building free" opening `LoginModal` (local `useState`); footer = ‹ › arrows (disabled at ends — no wraparound), persistent slim "Start building free" text button on every step, and the disclosure line. Keyboard: ←/→ move steps (Esc already closes). Touch: `onTouchStart`/`onTouchEnd` deltaX > 48px = swipe. NO auto-advance of any kind. Slide images beyond the first get `loading="lazy"`.

- [ ] **Step 5: Verify compile** — `bunx next build` (or `bun test` + a dev-server eyeball if faster; full gates run in Task 7).

- [ ] **Step 6: Commit**

```bash
git add lib/showcase/overlay-logic.ts lib/showcase/overlay-logic.test.ts components/showcase/ShowcaseCard.tsx components/showcase/ShowcaseOverlay.tsx
git commit -m "feat(showcase): overlay + card components — click-through, no auto-advance, tier slide -> OTP login"
```

---

### Task 7: Wire into BriefcasePanel, retire example-cards, full gates

**Files:**
- Modify: `components/briefcase/BriefcasePanel.tsx` (lines ~104–124: the "See a live example" block; line 18 import)
- Delete: `lib/briefcase/example-cards.ts`, `lib/briefcase/example-cards.test.ts`
- Modify: `lib/briefcase/panel-logic.test.ts` (drop the `EXAMPLE_CARDS` describe block, lines 31–42, and its import)
- Modify: `lib/deliverable/examples.ts` (comment only)

**Interfaces:**
- Consumes: `SHOWCASES`, `ShowcaseCard`, `ShowcaseOverlay`, `totalSteps`.

- [ ] **Step 1: Replace the example list in `BriefcasePanel.tsx`.** Remove the `EXAMPLE_CARDS` import; add `SHOWCASES` + the two components. Add state — lazy-init from the URL (ESLint: never set state in an effect):

```tsx
const [openShowcase, setOpenShowcase] = useState<string | null>(() => {
  if (typeof window === "undefined") return null;
  const id = new URLSearchParams(window.location.search).get("showcase");
  return SHOWCASES.some((s) => s.id === id) ? id : null;
});
function openIt(id: string) {
  setOpenShowcase(id);
  const u = new URL(window.location.href);
  u.searchParams.set("showcase", id);
  window.history.replaceState(null, "", u);
}
function closeIt() {
  setOpenShowcase(null);
  const u = new URL(window.location.href);
  u.searchParams.delete("showcase");
  window.history.replaceState(null, "", u);
}
```

Replace the `<ul>` block (keep the phone-only first-card pattern: index 0 always visible, rest `hidden sm:block`):

```tsx
<div>
  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-gray-500">
    See it built — real campaigns, real data
  </p>
  <ul className="grid grid-cols-1 gap-1.5">
    {SHOWCASES.map((s, i) => (
      <li key={s.id} className={i === 0 ? undefined : "hidden sm:block"}>
        <ShowcaseCard showcase={s} onOpen={openIt} />
      </li>
    ))}
  </ul>
</div>
{openShowcase && (
  <ShowcaseOverlay
    showcase={SHOWCASES.find((s) => s.id === openShowcase)!}
    onClose={closeIt}
  />
)}
```

- [ ] **Step 2: Delete `lib/briefcase/example-cards.ts` + `lib/briefcase/example-cards.test.ts`; strip the `EXAMPLE_CARDS` block + import from `panel-logic.test.ts`.** In `lib/deliverable/examples.ts`, update the header comment: the `/p/example-*` cron builds continue (deep-linkable, referenced by showcase view-live ecosystem later) but the panel no longer lists them — the showcase registry replaced `EXAMPLE_CARDS` as the panel's display source (2026-07-02).

- [ ] **Step 3: Full gates**

Run: `bun test`
Expected: green (registry, overlay-logic, updated panel-logic; example-cards tests gone).
Run: `bunx next build`
Expected: clean build.

- [ ] **Step 4: Live eyeball** — `bun dev`, open the pill panel logged-out: 3 cards render; each opens its overlay; arrows/keys/swipe step; step rail names steps; view-live opens artifact HTML; tier slide CTA opens the login modal ABOVE the overlay; Esc/click-off returns; `?showcase=market-pulse` deep-link auto-opens. Phone width: only first card visible, overlay usable.

- [ ] **Step 5: Commit**

```bash
git add components/briefcase/BriefcasePanel.tsx lib/briefcase/panel-logic.test.ts lib/deliverable/examples.ts
git rm lib/briefcase/example-cards.ts lib/briefcase/example-cards.test.ts
git commit -m "feat(showcase): panel shows 3 showcase cards + overlay; retire text example list (cron example builds unchanged)"
```

---

### Task 8: SESSION_LOG + build queue, then STOP for operator push

- [ ] **Step 1:** Append SESSION_LOG.md entry (top): what shipped (tasks 1–7, commit hashes), research findings one-liner (NNGroup no-auto-advance; Flodesk artifact-first + repeated CTA; Luxury Presence practice receipts; all figures lake-sourced with the two named 404s noted), and that `showcase_overlays_live_verify` stays OPEN (operator: click through all 3 on prod).
- [ ] **Step 2:** Sync `_AUDIT_AND_ROADMAP/build-queue.md` (mark this build done-pending-verify).
- [ ] **Step 3:** Commit docs; **STOP — show `git log --oneline origin/main..HEAD` and wait for operator confirmation before any push** (then `git log origin/main..HEAD` foreign-commit check + `node scripts/safe-push.mjs`).

---

## Self-review notes

- Spec coverage: A (3 showcases → Tasks 1–3), B (overlay/cards/tier → Task 6, panel → Task 7), C (registry/assets/capture/decouple → Tasks 4, 5, 7), D (asset guard test → Task 5; degraded view-live → overlay links), E (tests/gates → Tasks 5–7; live verify stays operator-run). Out-of-scope items untouched.
- Slide-count rule reconciled: registry holds 2–6 content slides; tier slide is component-appended (test asserts `totalSteps = slides + 1`).
- Names consistent: `SHOWCASES`, `totalSteps`, `clampStep`, `stepLabel`, `ShowcaseCard`, `ShowcaseOverlay` used identically across Tasks 5–7.
- ZHVI months corrected from spec ("May vs June") to the real vintage pair 04/30 vs 05/31/2026.
