# Email Lab Text Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 13 tasks, 16 files, 3 conflict groups, keywords: refactor, schema, architecture
> **Spec:** `docs/superpowers/specs/2026-06-29-email-lab-text-styling-design.md`
> **Check:** `email_lab_text_styling_live_verify`

**Goal:** Add 14 grouped fonts, block-level bold/italic/underline/color, and an image-overlay opacity slider to the Email Lab — correct across all three render engines (live preview, email, PDF).

**Architecture:** An `EmailDoc` renders through THREE engines: `EmailDocEmail` (free-tier `@react-email`), `compileGrid` (grid-tier `@react-email` string compiler), and `EmailDocPdf` (`@react-pdf/renderer`). Email + live preview share the block renderers in `lib/email/blocks/` (so inline-CSS formatting is automatic there); the PDF is a separate `PdfBlock` switch that must be updated in parallel. Fonts need a web-font `<link>` in three places + `Font.register` for PDF.

**Tech Stack:** TypeScript, zod v4, `@react-email/components`, `@react-pdf/renderer@4.5.1`, React 19, `bun:test`, `bunx next build`.

## Global Constraints

- **`satisfies z.ZodType<>` does NOT catch a missing optional field** — output stays assignable. The only guard against silent strip is the `schema.test.ts` round-trip. Every new prop gets a round-trip assertion.
- **strip mode runs on every save/load AND after every AI block-fill** — a prop missing from its block schema is dropped from the whole doc. Add each prop to its `*PropsSchema`.
- **New props are USER-OWNED** — never add them to `BlockContentPatchSchema` or `AuthoredBlockSchema`.
- **`FontFamily` union ⇄ `GlobalStyleSchema.fontFamily` enum ⇄ both pickers ⇄ `FONT_STACKS`** must stay in lockstep (union/enum drift = runtime reject, not compile error).
- **`@react-pdf` supports TTF/WOFF only — not woff2; variable fonts must be static weights** (verified crawl4ai 06/29/2026).
- **Outlook:** no `rgba()`, no `background-image` — overlay degrades to a solid panel there (handled in Task 10).
- Verify builds with `bunx next build` (NOT bare `tsc`). `bun test <file>` for unit tests.
- Layout: `h-full`/`dvh`, never `h-screen`. Answers/UI copy: no internal IDs.

## ⚠️ Parallel-session collision (read before Tasks 2, 8, 12)

As of 2026-06-29 a parallel session is restructuring the Email Lab panel: uncommitted
`components/email-lab/panel/`, `lib/email/lab/`, and `2026-06-29-email-lab-shared-panel-design.md`,
plus a modified `lib/email/CLAUDE.md`. The **inspector and the two font pickers may move** into a
shared panel. Before implementing any UI task (2, 8, 12), **RULE 0.5 probe-first**: re-locate the
font picker(s) and the BlockInspector's image/text sections in the CURRENT tree; the data-layer,
renderer, compile-grid, and PDF tasks (1, 3, 4, 5, 6, 7, 9, 10, 11) are unaffected and safe to do first.
Coordinate ordering with the operator. **Never `git add -A`** — stage explicit paths only.

---

## PILLAR 1 — Font expansion (6 → 14)

### Task 1: Font data layer — type, schema enum, stacks, URLs

**Files:**
- 🔴 Modify: `lib/email/doc/types.ts` (`FontFamily` union)
- 🔴 Modify: `lib/email/doc/schema.ts` (`GlobalStyleSchema.fontFamily`)
- Modify: `lib/email/blocks/styles.ts` (`FONT_STACKS`, `WEB_FONT_URLS`)
- Test: `lib/email/blocks/styles.test.ts` (create)

**Interfaces:**
- Produces: 8 new `FontFamily` literals: `CORMORANT_SERIF`, `MERRIWEATHER_SERIF`, `EB_GARAMOND_SERIF`, `RALEWAY_SANS`, `DM_SANS`, `NUNITO_SANS`, `OSWALD_SANS`, `JOSEFIN_SANS`. `FONT_STACKS` and `WEB_FONT_URLS` gain entries for each. Consumed by every later font task + both pickers.

- [ ] **Step 1: Write the failing test**

Create `lib/email/blocks/styles.test.ts`:

```ts
import { test, expect } from "bun:test";
import { FONT_STACKS, WEB_FONT_URLS, fontStack } from "./styles";

const ALL: string[] = [
  "MODERN_SANS","BOOK_SERIF","GEOMETRIC_SANS",
  "PLAYFAIR_SERIF","CORMORANT_SERIF","MERRIWEATHER_SERIF","EB_GARAMOND_SERIF",
  "LATO_SANS","MONTSERRAT_SANS","RALEWAY_SANS","DM_SANS","NUNITO_SANS",
  "OSWALD_SANS","JOSEFIN_SANS",
];
const WEB: string[] = [
  "PLAYFAIR_SERIF","CORMORANT_SERIF","MERRIWEATHER_SERIF","EB_GARAMOND_SERIF",
  "LATO_SANS","MONTSERRAT_SANS","RALEWAY_SANS","DM_SANS","NUNITO_SANS",
  "OSWALD_SANS","JOSEFIN_SANS",
];

test("every family has a non-empty font stack", () => {
  for (const f of ALL) expect(fontStack(f as never).length).toBeGreaterThan(0);
});

test("every web-font family has a CSS2 URL (Partial type does not enforce this)", () => {
  for (const f of WEB) {
    const u = WEB_FONT_URLS[f as never] as string | undefined;
    expect(u, `${f} missing WEB_FONT_URLS entry`).toBeTruthy();
    expect(u).toContain("fonts.googleapis.com/css2");
  }
});

test("system fonts have NO web URL", () => {
  for (const f of ["MODERN_SANS","BOOK_SERIF","GEOMETRIC_SANS"]) {
    expect(WEB_FONT_URLS[f as never]).toBeUndefined();
  }
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `bun test lib/email/blocks/styles.test.ts`
Expected: FAIL (new families absent from `FONT_STACKS`/`WEB_FONT_URLS`).

- [ ] **Step 3: Extend the `FontFamily` union** in `lib/email/doc/types.ts`:

```ts
export type FontFamily =
  | "MODERN_SANS"
  | "BOOK_SERIF"
  | "GEOMETRIC_SANS"
  | "PLAYFAIR_SERIF"
  | "CORMORANT_SERIF"
  | "MERRIWEATHER_SERIF"
  | "EB_GARAMOND_SERIF"
  | "LATO_SANS"
  | "MONTSERRAT_SANS"
  | "RALEWAY_SANS"
  | "DM_SANS"
  | "NUNITO_SANS"
  | "OSWALD_SANS"
  | "JOSEFIN_SANS";
```

- [ ] **Step 4: Extend `GlobalStyleSchema.fontFamily`** in `lib/email/doc/schema.ts` — the enum must list all 14 (copy the union members verbatim into the existing `z.enum([...])`).

- [ ] **Step 5: Extend `FONT_STACKS` + `WEB_FONT_URLS`** in `lib/email/blocks/styles.ts`. Add to `FONT_STACKS` (compiler forces all 14 since it's `Record<FontFamily,…>`):

```ts
  CORMORANT_SERIF: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  MERRIWEATHER_SERIF: "'Merriweather', Georgia, 'Times New Roman', serif",
  EB_GARAMOND_SERIF: "'EB Garamond', Georgia, 'Times New Roman', serif",
  RALEWAY_SANS: "'Raleway', -apple-system, 'Helvetica Neue', Arial, sans-serif",
  DM_SANS: "'DM Sans', -apple-system, 'Helvetica Neue', Arial, sans-serif",
  NUNITO_SANS: "'Nunito', -apple-system, 'Helvetica Neue', Arial, sans-serif",
  OSWALD_SANS: "'Oswald', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
  JOSEFIN_SANS: "'Josefin Sans', 'Century Gothic', 'Trebuchet MS', sans-serif",
```

Add to `WEB_FONT_URLS` (tokens verified live, crawl4ai 06/29/2026):

```ts
  CORMORANT_SERIF:
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&display=swap",
  MERRIWEATHER_SERIF:
    "https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap",
  EB_GARAMOND_SERIF:
    "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;700&display=swap",
  RALEWAY_SANS: "https://fonts.googleapis.com/css2?family=Raleway:wght@400;700&display=swap",
  DM_SANS: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap",
  NUNITO_SANS: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;700&display=swap",
  OSWALD_SANS: "https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap",
  JOSEFIN_SANS:
    "https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;700&display=swap",
```

- [ ] **Step 6: Run tests + typecheck**

Run: `bun test lib/email/blocks/styles.test.ts` → PASS. Then `bun test lib/email/doc/schema.test.ts` (existing) → PASS. Then `bunx next build 2>&1 | tail -10` → no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/email/doc/types.ts lib/email/doc/schema.ts lib/email/blocks/styles.ts lib/email/blocks/styles.test.ts
git commit -m "feat(email-lab): add 8 font families to FontFamily/FONT_STACKS/WEB_FONT_URLS + enum"
```

---

### Task 2: Grouped font pickers (both shells) ⚠️ probe first

**Files:**
- Modify: `components/email-lab/EmailLabGridShell.tsx` (`FONT_OPTIONS` ~line 61, picker `<select>` ~line 934)
- Modify: `components/email-lab/EmailLabShell.tsx` (`FONT_OPTIONS` ~line 81, picker `<select>` ~line 919)

> Probe first (collision): confirm both `FONT_OPTIONS` and their `<select>` still live where noted; if the shared-panel refactor moved them, apply the same change at the new location.

- [ ] **Step 1: Replace `FONT_OPTIONS` with a grouped structure** (do this in BOTH shells). Replace the flat array with:

```tsx
const FONT_GROUPS: { group: string; options: { value: FontFamily; label: string }[] }[] = [
  { group: "System", options: [
    { value: "MODERN_SANS", label: "Modern Sans" },
    { value: "BOOK_SERIF", label: "Book Serif" },
    { value: "GEOMETRIC_SANS", label: "Geometric Sans" },
  ]},
  { group: "Serif", options: [
    { value: "PLAYFAIR_SERIF", label: "Playfair Display" },
    { value: "CORMORANT_SERIF", label: "Cormorant Garamond" },
    { value: "MERRIWEATHER_SERIF", label: "Merriweather" },
    { value: "EB_GARAMOND_SERIF", label: "EB Garamond" },
  ]},
  { group: "Sans", options: [
    { value: "LATO_SANS", label: "Lato" },
    { value: "MONTSERRAT_SANS", label: "Montserrat" },
    { value: "RALEWAY_SANS", label: "Raleway" },
    { value: "DM_SANS", label: "DM Sans" },
    { value: "NUNITO_SANS", label: "Nunito" },
  ]},
  { group: "Display", options: [
    { value: "OSWALD_SANS", label: "Oswald" },
    { value: "JOSEFIN_SANS", label: "Josefin Sans" },
  ]},
];
```

- [ ] **Step 2: Render `<optgroup>`** — replace the `FONT_OPTIONS.map(...)` `<option>` body of each picker `<select>` with:

```tsx
{FONT_GROUPS.map((g) => (
  <optgroup key={g.group} label={g.group}>
    {g.options.map((f) => (
      <option key={f.value} value={f.value}>{f.label}</option>
    ))}
  </optgroup>
))}
```

(Keep each select's existing `value={doc.globalStyle.fontFamily}` and `onChange`.)

- [ ] **Step 3: Build check**

Run: `bunx next build 2>&1 | tail -10` → no errors.

- [ ] **Step 4: Commit**

```bash
git add components/email-lab/EmailLabGridShell.tsx components/email-lab/EmailLabShell.tsx
git commit -m "feat(email-lab): grouped font picker (System/Serif/Sans/Display) in both shells"
```

---

### Task 3: Web fonts render on grid email + live preview

**Files:**
- Modify: `lib/email/blocks/compile-grid.ts` (the `createElement(Head, null)` — line ~229)
- Modify: live-preview shell (`components/email-lab/EmailLabGridShell.tsx` and/or `app/email-lab/grid/page.tsx`)
- Test: `lib/email/blocks/compile-grid.test.ts` (create or extend)

**Interfaces:**
- Consumes: `WEB_FONT_URLS` from Task 1.
- Produces: grid-tier HTML carries the web-font `<link>`; the live `/email-lab/grid` page `<head>` loads the selected web font.

- [ ] **Step 1: Write the failing test** — `lib/email/blocks/compile-grid.test.ts`:

```ts
import { test, expect } from "bun:test";
import { compileGrid } from "./compile-grid";
import type { EmailDoc } from "../doc/types";

const doc: EmailDoc = {
  globalStyle: { primaryColor:"#0f1d24", accentColor:"#3DC9C0", fontFamily:"PLAYFAIR_SERIF",
    textColor:"#242424", backdropColor:"#F8F8F8" },
  blocks: [
    { id:"a", type:"text", props:{ body:"Left" }, layout:{ x:0,y:0,w:6,h:2 } },
    { id:"b", type:"text", props:{ body:"Right" }, layout:{ x:6,y:0,w:6,h:2 } },
  ],
};

test("grid HTML injects the web-font <link> for a web-font family", async () => {
  const html = await compileGrid(doc);
  expect(html).toContain("fonts.googleapis.com/css2?family=Playfair+Display");
});

test("system font emits no font <link>", async () => {
  const html = await compileGrid({ ...doc, globalStyle: { ...doc.globalStyle, fontFamily:"MODERN_SANS" } });
  expect(html).not.toContain("fonts.googleapis.com");
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Head` is empty today).

Run: `bun test lib/email/blocks/compile-grid.test.ts`

- [ ] **Step 3: Inject the `<link>` in `compileGrid`** — import `WEB_FONT_URLS`, and replace `createElement(Head, null)`:

```ts
import { WEB_FONT_URLS } from "./styles";
// ...
const webFontUrl = WEB_FONT_URLS[doc.globalStyle.fontFamily];
const head = createElement(
  Head,
  null,
  webFontUrl
    ? createElement("link", { rel: "stylesheet", href: webFontUrl })
    : null,
);
// use `head` in place of `createElement(Head, null)` in the Html tree
```

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Load the web font in the LIVE preview.** In `EmailLabGridShell` (client), inject the selected family's stylesheet into the document head so the canvas preview shows the real face. Add near the top of the component body (after `doc` is available):

```tsx
useEffect(() => {
  const href = WEB_FONT_URLS[doc.globalStyle.fontFamily];
  if (!href) return;
  const id = `eltab-font-${doc.globalStyle.fontFamily}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id; link.rel = "stylesheet"; link.href = href;
  document.head.appendChild(link);
  // leave it mounted — switching fonts just appends another; cheap + cached
}, [doc.globalStyle.fontFamily]);
```

(Import `WEB_FONT_URLS` from `@/lib/email/blocks/styles` and `useEffect` from react. Do the same in `EmailLabShell` if it hosts a live preview.) NOTE: react-hooks/set-state-in-effect is banned — this effect sets no state, only appends a link, so it's fine.

- [ ] **Step 6: Build + tests**

Run: `bun test lib/email/blocks/compile-grid.test.ts` → PASS; `bunx next build 2>&1 | tail -10` → clean.

- [ ] **Step 7: Commit**

```bash
git add lib/email/blocks/compile-grid.ts lib/email/blocks/compile-grid.test.ts components/email-lab/EmailLabGridShell.tsx
git commit -m "fix(email-lab): inject web-font <link> in grid compiler + live canvas preview"
```

---

### Task 4: PDF real fonts (Font.register)

**Files:**
- Create: `lib/pdf/fonts.ts` (registry + lazy `registerPdfFont`)
- 🟡 Modify: `lib/pdf/email-doc-pdf.tsx` (`pdfFont()` + call `registerPdfFont` before render)
- Create: bundled static font files (see Step 1)
- Test: `lib/pdf/fonts.test.ts` (create)

**Interfaces:**
- Produces: `registerPdfFont(family: FontFamily): string` — lazily `Font.register`s the family's static weights and returns the `fontFamily` name to use in styles (built-in name for the 3 system fonts).

> **Two production realities to settle in THIS research gate (advisor, 06/29) — local `bun test` will pass right over both:**
> 1. **`public/` is NOT in the Vercel lambda filesystem.** Reading fonts via `process.cwd()/public/...` works locally (cwd = repo root) but the PDF route is a serverless function — `public/` ships to static hosting, not the function bundle → `Font.register` gets a missing path → prod PDF falls back or throws. **Prefer registering from a pinned Fontsource CDN URL** (static woff/ttf, one fetch per cold start, idempotent) over bundling. If bundling is chosen instead, you MUST add `outputFileTracingIncludes` for the pdf route in `next.config` — file-tracing is MORE fragile than a pinned URL, not less. (The old `lib/pdf` "no network fetch" note predates needing real fonts; it does not bind here.)
> 2. **react-pdf throws (not falls back) on an unresolved variant.** A user on Oswald (no italic) who italicizes a block → lookup (Oswald, italic) misses → historically THROWS, crashing PDF generation. Verify this in the gate; the guard is in Task 7.

- [ ] **Step 1: Source static TTF/WOFF + decide loading mechanism (RULE 0.4 — verify in-session).**
  `@react-pdf` needs **static** TTF/WOFF (not woff2, not variable). Google's repo now ships variable
  fonts, so source **static** weights from **Fontsource**. Run a crawl4ai pass to confirm the exact
  static file URL layout, e.g. `https://cdn.jsdelivr.net/fontsource/fonts/oswald@latest/latin-400-normal.woff`
  (and `-700-normal`, `-400-italic`, `-700-italic` **where they exist** — record per-family available
  styles; **Oswald has no italic**). **Recommended:** register from these pinned CDN URLs (no
  `public/` filesystem dependency, survives the lambda). If you instead bundle into
  `public/fonts/pdf/<family>/`, wire `outputFileTracingIncludes` per reality #1 above. Either way,
  record the verified source + per-family styles + the chosen mechanism in the spec + SESSION_LOG.

- [ ] **Step 2: Write the failing test** — `lib/pdf/fonts.test.ts`:

```ts
import { test, expect } from "bun:test";
import { registerPdfFont } from "./fonts";

test("system serif maps to a PDF built-in", () => {
  expect(registerPdfFont("BOOK_SERIF")).toBe("Times-Roman");
});
test("system sans maps to Helvetica", () => {
  expect(registerPdfFont("MODERN_SANS")).toBe("Helvetica");
});
test("a web font returns its own family name (and registers idempotently)", () => {
  expect(registerPdfFont("OSWALD_SANS")).toBe("Oswald");
  expect(registerPdfFont("OSWALD_SANS")).toBe("Oswald"); // second call is a no-op
});
```

- [ ] **Step 3: Run it — expect FAIL** (`./fonts` missing).

- [ ] **Step 4: Implement `lib/pdf/fonts.ts`:**

```ts
// lib/pdf/fonts.ts — lazy, idempotent @react-pdf font registration.
// react-pdf 4.5.1: TTF/WOFF only, static weights (verified crawl4ai 06/29/2026).
// `src` is a PINNED Fontsource CDN URL (recommended — no public/ filesystem dep; see Task 4
// reality #1). Each Entry lists ONLY the variants that actually exist for that family, so the
// guard helper below can stop the renderer from requesting a missing one (react-pdf THROWS).
import { Font } from "@react-pdf/renderer";
import type { FontFamily } from "@/lib/email/doc/types";

interface Variant { weight: 400 | 700; italic?: boolean; src: string }
interface Entry { family: string; variants: Variant[] }

// System fonts → PDF built-ins (no registration).
const BUILTIN: Partial<Record<FontFamily, string>> = {
  MODERN_SANS: "Helvetica",
  BOOK_SERIF: "Times-Roman",
  GEOMETRIC_SANS: "Helvetica",
};

const CDN = "https://cdn.jsdelivr.net/fontsource/fonts"; // verify exact path layout in Step 1
// Web fonts → pinned static CDN files. (Confirm slugs/styles in Step 1; Oswald omits italic.)
const REGISTRY: Partial<Record<FontFamily, Entry>> = {
  PLAYFAIR_SERIF: { family: "Playfair Display", variants: [
    { weight:400, src: `${CDN}/playfair-display@latest/latin-400-normal.woff` },
    { weight:700, src: `${CDN}/playfair-display@latest/latin-700-normal.woff` },
    { weight:400, italic:true, src: `${CDN}/playfair-display@latest/latin-400-italic.woff` },
    { weight:700, italic:true, src: `${CDN}/playfair-display@latest/latin-700-italic.woff` },
  ]},
  // … one Entry per web-font family (CORMORANT_SERIF, MERRIWEATHER_SERIF, EB_GARAMOND_SERIF,
  //     LATO_SANS, MONTSERRAT_SANS, RALEWAY_SANS, DM_SANS, NUNITO_SANS, OSWALD_SANS [no italic],
  //     JOSEFIN_SANS)
};

const registered = new Set<string>();

/** Lazily register `family`'s static weights; return the fontFamily name for styles. */
export function registerPdfFont(family: FontFamily): string {
  const builtin = BUILTIN[family];
  if (builtin) return builtin;
  const entry = REGISTRY[family];
  if (!entry) return "Helvetica"; // safety fallback
  if (!registered.has(entry.family)) {
    Font.register({
      family: entry.family,
      fonts: entry.variants.map((v) => ({
        src: v.src,
        fontWeight: v.weight,
        fontStyle: v.italic ? "italic" : "normal",
      })),
    });
    registered.add(entry.family);
  }
  return entry.family;
}

/** True only if `family` has a registered italic variant — guards the renderer against the
 *  react-pdf "unresolved variant throws" crash (Task 7). Built-ins (Helvetica/Times) DO have italic. */
export function pdfFontHasItalic(family: FontFamily): boolean {
  if (BUILTIN[family]) return true;
  return (REGISTRY[family]?.variants ?? []).some((v) => v.italic);
}
```

- [ ] **Step 5: Wire into `email-doc-pdf.tsx`** — replace `pdfFont()`:

```tsx
import { registerPdfFont } from "./fonts";
// was: function pdfFont(family){ return family === "BOOK_SERIF" ? "Times-Roman" : "Helvetica"; }
function pdfFont(family: FontFamily): string {
  return registerPdfFont(family); // registers on first use, returns the family name
}
```

`PdfBlock` already calls `pdfFont(gs.fontFamily)` once at top — no other change needed.

- [ ] **Step 6: Run tests + the existing PDF test + build**

Run: `bun test lib/pdf/fonts.test.ts` → PASS; `bun test lib/pdf/__tests__/email-doc-pdf.test.ts` → PASS (still renders a valid buffer); `bunx next build 2>&1 | tail -10` → clean.

- [ ] **Step 7: Commit**

```bash
git add lib/pdf/fonts.ts lib/pdf/fonts.test.ts lib/pdf/email-doc-pdf.tsx public/fonts/pdf
git commit -m "feat(pdf): register real web fonts (Font.register, bundled static TTF/WOFF)"
```

---

## PILLAR 2 — Block-level text formatting

### Task 5: Formatting props — types, schemas, round-trip

**Files:**
- 🔴 Modify: `lib/email/doc/types.ts` (`TextProps`, `MultiColumnColumn`, `HeroProps`, `SignalProps`)
- 🔴 Modify: `lib/email/doc/schema.ts` (the 4 matching schemas)
- 🔴 Test: `lib/email/doc/schema.test.ts` (extend)

**Interfaces:**
- Produces: `textColor?: string`, `bold?: boolean`, `italic?: boolean`, `underline?: boolean` on `TextProps` + `MultiColumnColumn`; `textColor?` + `bold?` only on `HeroProps` + `SignalProps`.

- [ ] **Step 1: Write the failing round-trip test** — add to `lib/email/doc/schema.test.ts`:

```ts
test("block formatting props survive parse (not stripped)", () => {
  const doc = {
    globalStyle: { primaryColor:"#000", accentColor:"#000", fontFamily:"MODERN_SANS", textColor:"#000", backdropColor:"#fff" },
    blocks: [{ type:"text", props:{ body:"hi", bold:true, italic:true, underline:true, textColor:"#ff0000" } }],
  };
  const parsed = EmailDocSchema.parse(doc);
  const p = parsed.blocks[0].props as Record<string, unknown>;
  expect(p.bold).toBe(true);
  expect(p.italic).toBe(true);
  expect(p.underline).toBe(true);
  expect(p.textColor).toBe("#ff0000");
});

test("AI content patch CANNOT write formatting (user-owned, stripped)", () => {
  const patch = BlockContentPatchSchema.parse({ body:"x", bold:true, textColor:"#f00" });
  expect("bold" in patch).toBe(false);
  expect("textColor" in patch).toBe(false);
});
```

(Ensure `BlockContentPatchSchema` is imported in the test.)

- [ ] **Step 2: Run it — expect FAIL** (props stripped).

- [ ] **Step 3: Add fields to the 4 interfaces** in `types.ts`:

```ts
export interface TextProps extends BlockBase {
  body?: string; align?: TextAlign; linkUrl?: string;
  textColor?: string; bold?: boolean; italic?: boolean; underline?: boolean;
}
// MultiColumnColumn: add textColor?, bold?, italic?, underline?
// HeroProps:  add textColor?, bold?
// SignalProps: add textColor?, bold?
```

- [ ] **Step 4: Add the SAME fields to the schemas** in `schema.ts` (`TextPropsSchema`, `MultiColumnColumnSchema`, `HeroPropsSchema`, `SignalPropsSchema`). For each: `textColor: z.string().optional()`, `bold: z.boolean().optional()`, etc. **Do NOT touch `BlockContentPatchSchema` or `AuthoredBlockSchema`** (keeps them user-owned).

- [ ] **Step 5: Run tests — expect PASS.**

Run: `bun test lib/email/doc/schema.test.ts`

- [ ] **Step 6: Commit**

```bash
git add lib/email/doc/types.ts lib/email/doc/schema.ts lib/email/doc/schema.test.ts
git commit -m "feat(email-lab): block-level formatting props (bold/italic/underline/color), user-owned"
```

---

### Task 6: Apply formatting in the email block renderers

**Files:**
- Modify: `lib/email/blocks/TextBlock.tsx`, `HeroBlock.tsx`, `SignalBlock.tsx`, `MultiColumnBlock.tsx`

**Interfaces:** consumes the props from Task 5. Covers live preview + free + grid email (shared renderers).

- [ ] **Step 1: TextBlock** — on the `<Text>` style, add (preserving existing keys):

```tsx
style={{
  fontFamily: font, fontSize: "16px", lineHeight: "1.75",
  color: props.textColor ?? globalStyle.textColor,
  fontWeight: props.bold ? 700 : undefined,
  fontStyle: props.italic ? "italic" : undefined,
  textDecoration: props.underline ? "underline" : undefined,
  textAlign: props.align ?? "left", margin: 0, whiteSpace: "pre-line",
}}
```

- [ ] **Step 2: HeroBlock** — the `prose` and `value` `<Text>` styles get `color: props.textColor ?? <existing>` and `fontWeight: props.bold ? 700 : <existing>` (hero: bold + color only — no italic/underline).

- [ ] **Step 3: SignalBlock** — the `body` (and `title`) `<Text>` styles get `color: props.textColor ?? <existing>` and `fontWeight: props.bold ? 700 : <existing>`.

- [ ] **Step 4: MultiColumnBlock** — per column, the heading + body `<Text>` styles read `c.textColor`, `c.bold`, `c.italic`, `c.underline` (same pattern as TextBlock, using the column object `c`).

- [ ] **Step 5: Build + visual sanity**

Run: `bunx next build 2>&1 | tail -10` → clean. (Renderers have no unit test today; covered by the live-verify check at the end.)

- [ ] **Step 6: Commit**

```bash
git add lib/email/blocks/TextBlock.tsx lib/email/blocks/HeroBlock.tsx lib/email/blocks/SignalBlock.tsx lib/email/blocks/MultiColumnBlock.tsx
git commit -m "feat(email-lab): apply block formatting in email renderers (preview + email)"
```

---

### Task 7: Apply formatting in the PDF renderer

**Files:**
- 🟡 Modify: `lib/pdf/email-doc-pdf.tsx` (`text`, `hero`, `signal`, `multi-column` branches of `PdfBlock`)

- [ ] **Step 1: text + multi-column branches** — guard italic against the active family, then add to the body `<Text>` style. At the top of `PdfBlock` (where `font` is computed) add:

```tsx
import { registerPdfFont, pdfFontHasItalic } from "./fonts";
const font = pdfFont(gs.fontFamily);
const canItalic = pdfFontHasItalic(gs.fontFamily); // Oswald (no italic) → false → never emit fontStyle:italic
```

Then on the body `<Text>` style:

```tsx
color: p.textColor ?? gs.textColor,
fontWeight: p.bold ? "bold" : undefined,
fontStyle: p.italic && canItalic ? "italic" : undefined, // guarded — react-pdf throws on a missing variant
textDecoration: p.underline ? "underline" : undefined,
```

(For multi-column use the column object's fields. `@react-pdf` supports all four — verified. The
`canItalic` guard is the fix for the "unresolved variant throws" reality from Task 4.)

- [ ] **Step 2: hero + signal branches** — add `color: p.textColor ?? <existing>` and `fontWeight: p.bold ? "bold" : <existing>` to the relevant `<Text>` styles (bold + color only).

- [ ] **Step 3: Build + PDF test**

Run: `bun test lib/pdf/__tests__/email-doc-pdf.test.ts` → PASS; `bunx next build 2>&1 | tail -10` → clean.

- [ ] **Step 4: Commit**

```bash
git add lib/pdf/email-doc-pdf.tsx
git commit -m "feat(pdf): honor block formatting (bold/italic/underline/color) in PDF export"
```

---

### Task 8: Inspector formatting controls ⚠️ probe first

**Files:**
- 🟢 Modify: `components/email-lab/BlockInspector.tsx` (text/multi-column/hero/signal sections + `MultiColumnEditor`)

> Probe first (collision): the inspector may have moved into `components/email-lab/panel/`. Re-locate the block sections before editing.

- [ ] **Step 1: Add a reusable `FormatRow`** in `BlockInspector.tsx` (near the other field components):

```tsx
function ToggleBtn({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title: string }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`flex-1 rounded border px-2 py-1 text-xs font-medium ${on ? "border-gulf-teal bg-gulf-teal/10 text-gulf-teal" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
      {children}
    </button>
  );
}
function FormatRow({ props, set, withItalicUnderline }: { props: Record<string, unknown>; set: (k: string, v: unknown) => void; withItalicUnderline: boolean }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-500">Format</span>
      <div className="flex gap-1">
        <ToggleBtn on={!!props.bold} onClick={() => set("bold", !props.bold)} title="Bold"><b>B</b></ToggleBtn>
        {withItalicUnderline && <ToggleBtn on={!!props.italic} onClick={() => set("italic", !props.italic)} title="Italic"><i>I</i></ToggleBtn>}
        {withItalicUnderline && <ToggleBtn on={!!props.underline} onClick={() => set("underline", !props.underline)} title="Underline"><u>U</u></ToggleBtn>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: text section** — after the Align field add:

```tsx
<FormatRow props={props} set={set} withItalicUnderline />
<ColorField label="Text color" value={str("textColor")} onChange={(v) => set("textColor", v)} />
```

- [ ] **Step 3: hero + signal sections** — add `<FormatRow props={props} set={set} withItalicUnderline={false} />` and a `<ColorField label="Text color" .../>` (bold + color only).

- [ ] **Step 4: multi-column** — in `MultiColumnEditor`, per column add a `bold/italic/underline` toggle row + a small color input bound to `c.textColor` (use the existing `update(i, key, v)` helper, extending it to accept boolean values).

- [ ] **Step 5: Build check**

Run: `bunx next build 2>&1 | tail -10` → clean.

- [ ] **Step 6: Commit**

```bash
git add components/email-lab/BlockInspector.tsx
git commit -m "feat(email-lab): B/I/U + color controls in block inspector"
```

---

## PILLAR 3 — Image overlay opacity

### Task 9: `overlayBgOpacity` prop + schema + round-trip

**Files:**
- 🔴 Modify: `lib/email/doc/types.ts` (`ImageProps`), `lib/email/doc/schema.ts` (`ImagePropsSchema`)
- 🔴 Test: `lib/email/doc/schema.test.ts` (extend)

- [ ] **Step 1: Failing test** — add:

```ts
test("overlayBgOpacity survives parse", () => {
  const doc = { globalStyle:{primaryColor:"#000",accentColor:"#000",fontFamily:"MODERN_SANS",textColor:"#000",backdropColor:"#fff"},
    blocks:[{ type:"image", props:{ url:"https://x/y.jpg", overlayTitle:"T", overlayBg:"#000000", overlayBgOpacity:60 } }] };
  const p = EmailDocSchema.parse(doc).blocks[0].props as Record<string, unknown>;
  expect(p.overlayBgOpacity).toBe(60);
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3:** Add `overlayBgOpacity?: number;` to `ImageProps` (types.ts) and `overlayBgOpacity: z.number().min(0).max(100).optional()` to `ImagePropsSchema` (schema.ts). Do NOT add to patch/author schemas.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add lib/email/doc/types.ts lib/email/doc/schema.ts lib/email/doc/schema.test.ts
git commit -m "feat(email-lab): add overlayBgOpacity (0-100) to ImageProps"
```

---

### Task 10: Overlay renderer — hex + opacity, Outlook-safe, back-compat

**Files:**
- Create: `lib/email/blocks/overlay-color.ts` (pure resolver + test)
- Modify: `lib/email/blocks/ImageBlock.tsx`

**Interfaces:**
- Produces: `resolveOverlay(overlayBg?: string, opacity?: number): { outer: string; inner: string }` — `outer` = opaque solid for the bg/Outlook panel; `inner` = the rgba scrim.

- [ ] **Step 1: Failing test** — `lib/email/blocks/overlay-color.test.ts`:

```ts
import { test, expect } from "bun:test";
import { resolveOverlay } from "./overlay-color";

test("hex + opacity → opaque outer + rgba inner", () => {
  expect(resolveOverlay("#000000", 45)).toEqual({ outer: "#000000", inner: "rgba(0,0,0,0.45)" });
});
test("legacy rgba string with no opacity → passthrough inner, opaque outer", () => {
  const r = resolveOverlay("rgba(0,0,0,0.45)", undefined);
  expect(r.inner).toBe("rgba(0,0,0,0.45)");
  expect(r.outer).toBe("#000000"); // alpha dropped for the solid panel
});
test("defaults when nothing set", () => {
  expect(resolveOverlay(undefined, undefined)).toEqual({ outer: "#000000", inner: "rgba(0,0,0,0.45)" });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `lib/email/blocks/overlay-color.ts`:**

```ts
// Resolve overlay bg into an opaque outer panel (Outlook-safe, no rgba) + an rgba inner scrim.
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function parseRgba(s: string): [number, number, number] | null {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function resolveOverlay(overlayBg?: string, opacity?: number): { outer: string; inner: string } {
  const raw = overlayBg ?? "#000000";
  const rgb = hexToRgb(raw) ?? parseRgba(raw) ?? [0, 0, 0];
  const [r, g, b] = rgb;
  const outer = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  // Legacy rgba string with no explicit opacity → keep it verbatim.
  if (opacity == null && /^rgba?\(/i.test(raw)) return { outer, inner: raw };
  const a = Math.max(0, Math.min(100, opacity ?? 45)) / 100;
  return { outer, inner: `rgba(${r},${g},${b},${a})` };
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Use it in `ImageBlock.tsx`** — in the `hasOverlay` branch, replace the `overlayBg` resolution and put the opaque color on the OUTER Section, rgba on the INNER:

```tsx
const { outer, inner } = resolveOverlay(props.overlayBg, props.overlayBgOpacity);
const textColor = props.overlayTextColor ?? "#ffffff";
const align = props.overlayAlign ?? "center";
const innerEl = (
  <Section style={{
    backgroundImage: props.url ? `url(${props.url})` : undefined,
    backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat",
    backgroundColor: outer, // opaque — Outlook shows this solid panel (no bg-image, no rgba there)
    borderBottom: `1px solid ${BORDER}`,
  }}>
    <Section style={{ backgroundColor: inner, padding: "60px 40px", textAlign: align }}>
      {/* existing overlayTitle / overlayBody <Text> unchanged */}
    </Section>
  </Section>
);
```

(Import `resolveOverlay` from `./overlay-color`.)

- [ ] **Step 6: Build + tests**

Run: `bun test lib/email/blocks/overlay-color.test.ts` → PASS; `bunx next build 2>&1 | tail -10` → clean.

- [ ] **Step 7: Commit**

```bash
git add lib/email/blocks/overlay-color.ts lib/email/blocks/overlay-color.test.ts lib/email/blocks/ImageBlock.tsx
git commit -m "feat(email-lab): overlay hex+opacity scrim, Outlook-safe solid panel + back-compat"
```

---

### Task 11: PDF overlay opacity parity

**Files:**
- 🟡 Modify: `lib/pdf/email-doc-pdf.tsx` (`image` branch)

- [ ] **Step 1:** In the `image` branch, when `overlayTitle`/`overlayBody` is set, render the solid `outer` panel behind the text using `resolveOverlay(p.overlayBg, p.overlayBgOpacity).outer` as `backgroundColor` (react-pdf has no bg-image; the solid panel + overlay text is the correct PDF representation). Reuse the imported `resolveOverlay`.

- [ ] **Step 2: Build + PDF test**

Run: `bun test lib/pdf/__tests__/email-doc-pdf.test.ts` → PASS; `bunx next build 2>&1 | tail -10` → clean.

- [ ] **Step 3: Commit**

```bash
git add lib/pdf/email-doc-pdf.tsx
git commit -m "feat(pdf): image overlay panel uses resolved hex+opacity"
```

---

### Task 12: Inspector — overlay color picker + opacity slider ⚠️ probe first

**Files:**
- 🟢 Modify: `components/email-lab/BlockInspector.tsx` (image → "Text Overlay" section)

> Probe first (collision): re-locate the image block's overlay section before editing.

- [ ] **Step 1:** Replace the raw "Scrim (background)" `TextField` (currently `set("overlayBg", ...)` with the `rgba(0,0,0,0.45)` placeholder) with a hex `ColorField` + an opacity range slider:

```tsx
<ColorField label="Scrim color" value={str("overlayBg") || "#000000"} onChange={(v) => set("overlayBg", v)} />
<FieldShell label={`Scrim opacity — ${(props.overlayBgOpacity as number | undefined) ?? 45}%`}>
  <input type="range" min={0} max={100}
    value={(props.overlayBgOpacity as number | undefined) ?? 45}
    onChange={(e) => set("overlayBgOpacity", Number(e.target.value))}
    className="w-full" />
</FieldShell>
```

- [ ] **Step 2: Build check**

Run: `bunx next build 2>&1 | tail -10` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/email-lab/BlockInspector.tsx
git commit -m "feat(email-lab): overlay scrim color picker + opacity slider (replace raw rgba field)"
```

---

### Task 13: Full verification + close check

- [ ] **Step 1: Full test + build**

Run: `bun test lib/email/ lib/pdf/ 2>&1 | tail -20` → all green; `bunx next build 2>&1 | tail -15` → clean.

- [ ] **Step 2: Live verify at `/email-lab/grid`** (the check's evidence — `public.checks` is prod evidence, not "code looks right"):
  - Pick one font per group; preview shows the real face (not fallback).
  - Export email (grid) + PDF; the chosen face renders in BOTH.
  - Bold/italic/underline/color a text block → correct in preview, email, PDF.
  - Set overlay hex + opacity → rgba scrim in a modern client; readable solid panel in Outlook.

- [ ] **Step 3: SESSION_LOG entry + close check** (in the push that ships this):

```bash
node scripts/check.mjs close email_lab_text_styling_live_verify
```

---

## Self-Review

**Spec coverage:**
- Pillar 1 fonts → Tasks 1–4 (data layer, pickers, web-font render in 3 places, PDF register) ✓
- Pillar 2 formatting → Tasks 5–8 (props/schema, email renderers, PDF, inspector) ✓
- Pillar 3 overlay → Tasks 9–12 (prop/schema, renderer+back-compat, PDF, inspector) ✓
- schema.ts strip landmine → Tasks 1, 5, 9 add to schemas + round-trip tests ✓
- Both pickers → Task 2 ✓ · compileGrid + live preview → Task 3 ✓ · PDF separate engine → Tasks 4, 7, 11 ✓
- User-owned (not in patch/author schemas) → asserted in Task 5 ✓

**Placeholder scan:** Task 4 Step 1 (TTF sourcing) + the `REGISTRY` `…` are intentionally
research-gated (RULE 0.4 — exact Fontsource file paths must be verified in-session, not invented).
Every other step has concrete code.

**Type consistency:** `FontFamily` literals identical across types.ts/schema.ts/styles.ts/pickers/fonts.ts;
`resolveOverlay` signature identical in overlay-color.ts, ImageBlock.tsx, email-doc-pdf.tsx;
`registerPdfFont` returns the string `pdfFont()` feeds to styles. ✓

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 5, Task 9 | `lib/email/doc/types.ts`, `lib/email/doc/schema.ts`, `lib/email/doc/schema.test.ts` |
| 🟡 | Task 4, Task 7, Task 11 | `lib/pdf/email-doc-pdf.tsx` |
| 🟢 | Task 8, Task 12 | `components/email-lab/BlockInspector.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
