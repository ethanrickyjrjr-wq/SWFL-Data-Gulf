# Brand Tokens One Root — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 11 tasks, 26 files, keywords: refactor, schema, architecture

**Goal:** One font+surface registry every render engine reads, four new brand-record fields, and the two render-path font bugs fixed — so a user's email and social card are provably the same brand.

**Architecture:** A new `lib/brand/fonts.ts` registry (`Record<FontFamily, BrandFont>`) becomes the single source for email stacks, webfont URLs, PDF families, and canvas fonts; existing resolvers (`FONT_STACKS`, `pdfFont`, canvas `FONT` const) become reads of it. The brand blob gains `font_display`/`font_body`/`surface_color`/`surface_dark_color`, flowing through `brandingToTokens` → `applyBrand`/`tokensFromBranding`. Email is auto-safe progressive enhancement (stack always inline, `<link>` additive, `[if mso]` pin); rasterized surfaces bake fonts into pixels.

**Tech Stack:** TypeScript, bun:test, @react-email/components, @react-pdf/renderer 4.x, @resvg/resvg-js, zod (strip-mode), Next.js App Router.

**Spec:** `docs/superpowers/specs/2026-07-02-brand-tokens-one-root-design.md`

## Global Constraints

- Verify with `bunx next build`, NEVER bare `npx tsc` (local tsc ≠ Vercel).
- Tests run with `bun test <path>` (bun:test).
- Commit per task; NEVER push (operator pushes; RULE: stop after commit).
- `git add` explicit paths only — never `-A`.
- Strip-mode zod landmine: every new EmailDoc prop ships in `lib/email/doc/schema.ts` + a round-trip test IN THE SAME TASK, or saves silently drop it.
- The prettier pre-commit hook may reformat touched files — `git diff -w` shows the real change.
- Email output rules: fallback stack ALWAYS inline in `font-family`; webfont `<link>` is additive only; no user free-text ever becomes CSS (font tokens are enum keys validated against the registry).
- Sand defaults (operator-locked 07/02): SURFACE `#f0ede6`, SURFACE_DARK `#0f1d24`.
- Deterministic element ids in social templates are LOAD-BEARING — tokens change styling only, never ids.
- All 6 `FontFamily` values: `MODERN_SANS`, `BOOK_SERIF`, `GEOMETRIC_SANS`, `PLAYFAIR_SERIF`, `LATO_SANS`, `MONTSERRAT_SANS`.

---

### Task 1: Vendor Liberation Serif + the font registry `lib/brand/fonts.ts`

**Files:**
- 🔴 Create: `lib/brand/fonts.ts`
- 🔴 Create: `lib/brand/fonts.test.ts`
- Create: `assets/fonts/LiberationSerif-Regular.ttf`, `assets/fonts/LiberationSerif-Bold.ttf` (vendored binaries)
- 🔴 Reference (read-only): `lib/email/doc/types.ts:33-39` (FontFamily), `lib/email/lab/capabilities.ts:80-88` (FONT_ROUTING), `lib/charts/chart-fonts.ts` (the pattern being generalized)

**Interfaces:**
- Produces: `BRAND_FONTS: Record<FontFamily, BrandFont>`, `CANVAS_FONT_FILES: string[]` (all 4 Liberation TTF absolute paths), `CANVAS_DEFAULT_FAMILY = "Liberation Sans"`, `isFontFamily(v: string): v is FontFamily`. `BrandFont = { label: string; stack: string; webfontUrl?: string; pdf: "Helvetica" | "Times-Roman"; canvasSvg: "Liberation Sans" | "Liberation Serif"; previewStack: string }`.

- [ ] **Step 1: Vendor the serif TTFs**

Liberation fonts are SIL-OFL (license already vendored at `assets/fonts/LICENSE-Liberation.txt`). Download release 2.1.5 from the liberationfonts GitHub release and copy the two serif faces:

```bash
curl -L -o /tmp/liberation.tar.gz https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz
tar -xzf /tmp/liberation.tar.gz -C /tmp
cp /tmp/liberation-fonts-ttf-2.1.5/LiberationSerif-Regular.ttf assets/fonts/
cp /tmp/liberation-fonts-ttf-2.1.5/LiberationSerif-Bold.ttf assets/fonts/
```

(If the pinned URL 404s, fetch the latest `liberation-fonts-ttf-*.tar.gz` from https://github.com/liberationfonts/liberation-fonts/releases — verify SIL OFL still applies. Do NOT take TTFs from any other source.)

- [ ] **Step 2: Write the failing test**

`lib/brand/fonts.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { BRAND_FONTS, CANVAS_FONT_FILES, CANVAS_DEFAULT_FAMILY, isFontFamily } from "./fonts";
import { FONT_ROUTING } from "@/lib/email/lab/capabilities";
import type { FontFamily } from "@/lib/email/doc/types";

const FAMILIES: FontFamily[] = [
  "MODERN_SANS", "BOOK_SERIF", "GEOMETRIC_SANS", "PLAYFAIR_SERIF", "LATO_SANS", "MONTSERRAT_SANS",
];

describe("brand font registry — the one root", () => {
  test("every FontFamily has a complete registry entry", () => {
    for (const f of FAMILIES) {
      const e = BRAND_FONTS[f];
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.stack).toContain(","); // a real fallback stack, never a lone family
      expect(["Helvetica", "Times-Roman"]).toContain(e.pdf);
      expect(["Liberation Sans", "Liberation Serif"]).toContain(e.canvasSvg);
      expect(e.previewStack).toContain(",");
    }
  });

  test("serif families map to serif everywhere; sans to sans", () => {
    for (const f of ["BOOK_SERIF", "PLAYFAIR_SERIF"] as FontFamily[]) {
      expect(BRAND_FONTS[f].pdf).toBe("Times-Roman");
      expect(BRAND_FONTS[f].canvasSvg).toBe("Liberation Serif");
    }
    for (const f of ["MODERN_SANS", "GEOMETRIC_SANS", "LATO_SANS", "MONTSERRAT_SANS"] as FontFamily[]) {
      expect(BRAND_FONTS[f].pdf).toBe("Helvetica");
      expect(BRAND_FONTS[f].canvasSvg).toBe("Liberation Sans");
    }
  });

  test("every registry family is tier-routed (and vice versa — same keys)", () => {
    expect(Object.keys(BRAND_FONTS).sort()).toEqual(Object.keys(FONT_ROUTING).sort());
  });

  test("all canvas TTFs exist on disk (sans + serif, regular + bold)", () => {
    expect(CANVAS_FONT_FILES.length).toBe(4);
    for (const p of CANVAS_FONT_FILES) expect(existsSync(p)).toBe(true);
  });

  test("default canvas family is the bundled sans", () => {
    expect(CANVAS_DEFAULT_FAMILY).toBe("Liberation Sans");
  });

  test("isFontFamily guards unknown keys", () => {
    expect(isFontFamily("BOOK_SERIF")).toBe(true);
    expect(isFontFamily("COMIC_SANS")).toBe(false);
    expect(isFontFamily("")).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun test lib/brand/fonts.test.ts`
Expected: FAIL — `Cannot find module './fonts'`

- [ ] **Step 4: Implement the registry**

`lib/brand/fonts.ts`:

```ts
// lib/brand/fonts.ts
//
// THE one font root (wave 2, spec 2026-07-02-brand-tokens-one-root). Every render
// engine resolves fonts from this Record — email stacks (lib/email/blocks/styles.ts
// re-derives), webfont <link>s, PDF built-ins (lib/pdf/email-doc-pdf.tsx), and the
// server canvas (resvg — bundled Liberation faces, the lib/charts/chart-fonts
// pattern generalized). Record<FontFamily, …> means a new font CANNOT ship without
// a complete entry here AND a FONT_ROUTING target (both keyed on FontFamily).
//
// Email policy (operator-locked 07/02/2026): progressive enhancement, auto-safe,
// no toggles. `stack` is ALWAYS the inline font-family value; `webfontUrl` is an
// additive <Head> link for the ~24% of clients honoring @font-face (caniemail,
// fetched 07/02/2026); Outlook is pinned to the stack via an [if mso] override
// (its @font-face bug otherwise lands on Times New Roman).

import path from "node:path";
import type { FontFamily } from "@/lib/email/doc/types";

export interface BrandFont {
  /** Picker label. */
  label: string;
  /** Email-safe fallback stack — ALWAYS present inline in output. */
  stack: string;
  /** Google Fonts CSS2 <link>; omitted = pure system family. Additive only. */
  webfontUrl?: string;
  /** react-pdf built-in (v1: no Font.register — upgrade path is a pdfRegister field). */
  pdf: "Helvetica" | "Times-Roman";
  /** Family name in server-rasterized SVG text — covered by CANVAS_FONT_FILES. */
  canvasSvg: "Liberation Sans" | "Liberation Serif";
  /** Browser stack for the Konva client canvas (preview + client PNG export). */
  previewStack: string;
}

export const BRAND_FONTS: Record<FontFamily, BrandFont> = {
  MODERN_SANS: {
    label: "Modern Sans",
    stack: "Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif",
    pdf: "Helvetica",
    canvasSvg: "Liberation Sans",
    previewStack: "Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  },
  BOOK_SERIF: {
    label: "Book Serif",
    stack: "Georgia, 'Times New Roman', Times, serif",
    pdf: "Times-Roman",
    canvasSvg: "Liberation Serif",
    previewStack: "Georgia, 'Times New Roman', Times, serif",
  },
  GEOMETRIC_SANS: {
    label: "Geometric Sans",
    stack: "'Century Gothic', 'Trebuchet MS', Futura, sans-serif",
    pdf: "Helvetica",
    canvasSvg: "Liberation Sans",
    previewStack: "'Century Gothic', 'Trebuchet MS', Futura, sans-serif",
  },
  PLAYFAIR_SERIF: {
    label: "Playfair Display",
    stack: "'Playfair Display', Georgia, 'Times New Roman', serif",
    webfontUrl:
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
    pdf: "Times-Roman",
    canvasSvg: "Liberation Serif",
    previewStack: "'Playfair Display', Georgia, 'Times New Roman', serif",
  },
  LATO_SANS: {
    label: "Lato",
    stack: "'Lato', -apple-system, 'Helvetica Neue', Arial, sans-serif",
    webfontUrl: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap",
    pdf: "Helvetica",
    canvasSvg: "Liberation Sans",
    previewStack: "'Lato', -apple-system, 'Helvetica Neue', Arial, sans-serif",
  },
  MONTSERRAT_SANS: {
    label: "Montserrat",
    stack: "'Montserrat', 'Century Gothic', 'Trebuchet MS', sans-serif",
    webfontUrl: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap",
    pdf: "Helvetica",
    canvasSvg: "Liberation Sans",
    previewStack: "'Montserrat', 'Century Gothic', 'Trebuchet MS', sans-serif",
  },
};

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

/** All bundled canvas faces — resvg `font.fontFiles`. Regular + Bold per family so
 *  `font-weight:bold` resolves to a real bold face, not a synthesized smear. */
export const CANVAS_FONT_FILES: string[] = [
  path.join(FONT_DIR, "LiberationSans-Regular.ttf"),
  path.join(FONT_DIR, "LiberationSans-Bold.ttf"),
  path.join(FONT_DIR, "LiberationSerif-Regular.ttf"),
  path.join(FONT_DIR, "LiberationSerif-Bold.ttf"),
];

/** resvg `defaultFontFamily` — unknown families land here, never on nothing. */
export const CANVAS_DEFAULT_FAMILY = "Liberation Sans";

/** Type guard for brand-blob font values — unknown keys are skipped, never CSS. */
export function isFontFamily(v: string): v is FontFamily {
  return Object.prototype.hasOwnProperty.call(BRAND_FONTS, v);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun test lib/brand/fonts.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/brand/fonts.ts lib/brand/fonts.test.ts assets/fonts/LiberationSerif-Regular.ttf assets/fonts/LiberationSerif-Bold.ttf
git commit -m "feat(brand): font registry one root + vendored Liberation Serif"
```

---

### Task 2: Point the existing resolvers at the registry

**Files:**
- 🔴 Modify: `lib/email/blocks/styles.ts:9-28` (FONT_STACKS + WEB_FONT_URLS become derived)
- 🔴 Modify: `lib/pdf/email-doc-pdf.tsx:27-30` (`pdfFont` reads registry)
- 🔴 Test: `lib/brand/fonts.test.ts` (extend)

**Interfaces:**
- Consumes: `BRAND_FONTS` from Task 1.
- Produces: `fontStack(family)` and `WEB_FONT_URLS[family]` behavior byte-identical to today (values in the registry were copied verbatim from styles.ts); `pdfFont(family)` behavior identical (`BOOK_SERIF→Times-Roman` extended to `PLAYFAIR_SERIF→Times-Roman` — a deliberate fix: Playfair is a serif and previously fell to Helvetica).

- [ ] **Step 1: Extend the test (failing)**

Append to `lib/brand/fonts.test.ts`:

```ts
import { fontStack, WEB_FONT_URLS } from "@/lib/email/blocks/styles";

describe("existing resolvers read the registry", () => {
  test("fontStack === registry stack for every family", () => {
    for (const f of FAMILIES) expect(fontStack(f)).toBe(BRAND_FONTS[f].stack);
  });
  test("WEB_FONT_URLS mirrors registry webfontUrl exactly (incl. absence)", () => {
    for (const f of FAMILIES) expect(WEB_FONT_URLS[f]).toBe(BRAND_FONTS[f].webfontUrl);
  });
});
```

- [ ] **Step 2: Run to verify the derivation test fails or passes-by-coincidence**

Run: `bun test lib/brand/fonts.test.ts`
Expected: PASS (values were copied verbatim) — the test currently proves duplication, not derivation. Proceed to remove the duplication.

- [ ] **Step 3: Derive styles.ts from the registry**

In `lib/email/blocks/styles.ts` replace lines 9-28 (the `FONT_STACKS` const, `fontStack` fn, `WEB_FONT_URLS` const) with:

```ts
import { BRAND_FONTS } from "@/lib/brand/fonts";

export function fontStack(family: FontFamily): string {
  return BRAND_FONTS[family].stack;
}

/** Google Fonts CSS2 <link> URLs — derived from the one font root. */
export const WEB_FONT_URLS: Partial<Record<FontFamily, string>> = Object.fromEntries(
  Object.entries(BRAND_FONTS).flatMap(([k, v]) => (v.webfontUrl ? [[k, v.webfontUrl]] : [])),
);
```

- [ ] **Step 4: Point pdfFont at the registry**

In `lib/pdf/email-doc-pdf.tsx` replace the `pdfFont` body (line 29):

```ts
import { BRAND_FONTS } from "@/lib/brand/fonts";

/** Map the doc's font family onto a @react-pdf built-in — resolved from the one font root. */
function pdfFont(family: FontFamily): string {
  return BRAND_FONTS[family].pdf;
}
```

- [ ] **Step 5: Run the full email + brand suites**

Run: `bun test lib/brand lib/email`
Expected: PASS (existing email tests confirm byte-identical stacks; if a PDF test asserted Helvetica for PLAYFAIR_SERIF, update it to Times-Roman — the serif fix is intentional).

- [ ] **Step 6: Commit**

```bash
git add lib/email/blocks/styles.ts lib/pdf/email-doc-pdf.tsx lib/brand/fonts.test.ts
git commit -m "refactor(fonts): email stacks + PDF families derive from the one registry"
```

---

### Task 3: EmailGlobalStyle grows three optional fields (type + zod + round-trip)

**Files:**
- 🔴 Modify: `lib/email/doc/types.ts:298-304` (EmailGlobalStyle)
- Modify: `lib/email/doc/schema.ts:221-234` (GlobalStyleSchema)
- Test: `lib/email/doc/schema.test.ts` (extend — find the existing round-trip describe block and add cases alongside)

**Interfaces:**
- Produces: `EmailGlobalStyle.displayFontFamily?: FontFamily`, `surfaceColor?: string`, `surfaceDarkColor?: string`. All optional — absent fields render exactly as today.

- [ ] **Step 1: Write the failing round-trip test**

Add to `lib/email/doc/schema.test.ts` (match the file's existing import/fixture style):

```ts
test("globalStyle round-trips displayFontFamily + surface colors (strip-mode landmine)", () => {
  const gs = {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "LATO_SANS",
    displayFontFamily: "PLAYFAIR_SERIF",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
    surfaceColor: "#f0ede6",
    surfaceDarkColor: "#0f1d24",
  };
  const doc = { globalStyle: gs, blocks: [] };
  const parsed = EmailDocSchema.parse(doc);
  expect(parsed.globalStyle.displayFontFamily).toBe("PLAYFAIR_SERIF");
  expect(parsed.globalStyle.surfaceColor).toBe("#f0ede6");
  expect(parsed.globalStyle.surfaceDarkColor).toBe("#0f1d24");
});

test("globalStyle without the new fields parses unchanged (back-compat)", () => {
  const doc = {
    globalStyle: {
      primaryColor: "#0f1d24", accentColor: "#3DC9C0", fontFamily: "MODERN_SANS",
      textColor: "#242424", backdropColor: "#F8F8F8",
    },
    blocks: [],
  };
  const parsed = EmailDocSchema.parse(doc);
  expect(parsed.globalStyle.displayFontFamily).toBeUndefined();
});
```

(Use the schema export name the file actually uses — `EmailDocSchema` or the doc-level schema that composes `GlobalStyleSchema`; mirror an existing test's import.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/doc/schema.test.ts`
Expected: FAIL — `displayFontFamily` stripped (strip-mode drops unknown keys).

- [ ] **Step 3: Add the fields**

`lib/email/doc/types.ts` — extend the interface:

```ts
export interface EmailGlobalStyle {
  primaryColor: string; // e.g. "#0f1d24"
  accentColor: string; // e.g. "#3DC9C0"
  fontFamily: FontFamily;
  /** Headline font (header company name, hero value). Absent → fontFamily. */
  displayFontFamily?: FontFamily;
  textColor: string; // e.g. "#242424"
  backdropColor: string; // e.g. "#F8F8F8"
  /** Light card/stat surface. Absent → block CARD_BG default (#ffffff). */
  surfaceColor?: string;
  /** Dark surface (dark cards / canvas siblings). Absent → engine defaults. */
  surfaceDarkColor?: string;
}
```

`lib/email/doc/schema.ts` — extend `GlobalStyleSchema` (keep the enum list in one const so it's written once):

```ts
const FONT_FAMILY_ENUM = z.enum([
  "MODERN_SANS", "BOOK_SERIF", "GEOMETRIC_SANS", "PLAYFAIR_SERIF", "LATO_SANS", "MONTSERRAT_SANS",
]);

export const GlobalStyleSchema = z.object({
  primaryColor: z.string(),
  accentColor: z.string(),
  fontFamily: FONT_FAMILY_ENUM,
  displayFontFamily: FONT_FAMILY_ENUM.optional(),
  textColor: z.string(),
  backdropColor: z.string(),
  surfaceColor: z.string().optional(),
  surfaceDarkColor: z.string().optional(),
}) satisfies z.ZodType<EmailGlobalStyle>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/doc/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email/doc/types.ts lib/email/doc/schema.ts lib/email/doc/schema.test.ts
git commit -m "feat(email-doc): optional displayFontFamily + surface colors survive the strip-mode schema"
```

---

### Task 4: brandingToTokens emits FONT_DISPLAY / FONT_BODY / SURFACE / SURFACE_DARK

**Files:**
- Modify: `lib/email/brand/branding-to-tokens.ts`
- Test: `lib/email/brand/branding-to-tokens.test.ts` (create if absent; check `lib/email/brand/` first and extend if one exists)

**Interfaces:**
- Consumes: `isFontFamily` from Task 1.
- Produces: brand blob keys `font_display`, `font_body` (FontFamily enum keys — validated, unknown skipped), `surface_color`, `surface_dark_color` → tokens `FONT_DISPLAY`, `FONT_BODY`, `SURFACE`, `SURFACE_DARK`. Token VALUES for fonts are the enum keys (e.g. `"PLAYFAIR_SERIF"`), never CSS.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { brandingToTokens } from "./branding-to-tokens";

describe("brandingToTokens — wave-2 font + surface slots", () => {
  test("valid font keys and surface colors map through", () => {
    const t = brandingToTokens({
      font_display: "PLAYFAIR_SERIF",
      font_body: "LATO_SANS",
      surface_color: "#f0ede6",
      surface_dark_color: "#0f1d24",
    });
    expect(t.FONT_DISPLAY).toBe("PLAYFAIR_SERIF");
    expect(t.FONT_BODY).toBe("LATO_SANS");
    expect(t.SURFACE).toBe("#f0ede6");
    expect(t.SURFACE_DARK).toBe("#0f1d24");
  });

  test("an unknown font key is SKIPPED — no user text becomes CSS", () => {
    const t = brandingToTokens({ font_display: "Comic Sans MS, cursive" });
    expect(t.FONT_DISPLAY).toBeUndefined();
  });

  test("absent fields emit no tokens (existing behavior preserved)", () => {
    const t = brandingToTokens({ primary_color: "#111111" });
    expect(t.PRIMARY).toBe("#111111");
    expect(t.FONT_DISPLAY).toBeUndefined();
    expect(t.SURFACE).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/brand/branding-to-tokens.test.ts`
Expected: FAIL — `t.FONT_DISPLAY` undefined in the first test.

- [ ] **Step 3: Implement**

In `lib/email/brand/branding-to-tokens.ts`, after the `set("logo_url", "LOGO_URL");` line add:

```ts
import { isFontFamily } from "@/lib/brand/fonts";

  // brand fonts — enum KEYS only (validated); an unknown value is skipped so no
  // user free-text ever reaches email CSS. Surfaces are plain hex pass-throughs.
  const setFont = (key: string, token: string) => {
    const v = b[key];
    if (typeof v === "string" && isFontFamily(v.trim())) t[token] = v.trim();
  };
  setFont("font_display", "FONT_DISPLAY");
  setFont("font_body", "FONT_BODY");
  set("surface_color", "SURFACE");
  set("surface_dark_color", "SURFACE_DARK");
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/brand/branding-to-tokens.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email/brand/branding-to-tokens.ts lib/email/brand/branding-to-tokens.test.ts
git commit -m "feat(brand): font + surface slots flow through the one branding bridge"
```

---

### Task 5: Pure `brandGlobalStyle` helper + applyBrand reads it

**Files:**
- Create: `lib/email/brand/apply-brand-style.ts`
- Create: `lib/email/brand/apply-brand-style.test.ts`
- Modify: `components/email-lab/EmailLabShell.tsx:93-101` (applyBrand's globalStyle block)

**Interfaces:**
- Consumes: tokens from Task 4; `isFontFamily` from Task 1.
- Produces: `brandGlobalStyle(gs: EmailGlobalStyle, t: Record<string, string>): EmailGlobalStyle` — pure, token-absent → field untouched. `applyBrand` (the ONE brand-fill root; grid shell imports it) delegates its globalStyle merge to this helper.

- [ ] **Step 1: Write the failing test**

`lib/email/brand/apply-brand-style.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { brandGlobalStyle } from "./apply-brand-style";
import type { EmailGlobalStyle } from "@/lib/email/doc/types";

const BASE: EmailGlobalStyle = {
  primaryColor: "#0f1d24", accentColor: "#3DC9C0", fontFamily: "MODERN_SANS",
  textColor: "#242424", backdropColor: "#F8F8F8",
};

describe("brandGlobalStyle", () => {
  test("maps all wave-2 tokens onto globalStyle", () => {
    const gs = brandGlobalStyle(BASE, {
      PRIMARY: "#111111", FONT_BODY: "LATO_SANS", FONT_DISPLAY: "PLAYFAIR_SERIF",
      SURFACE: "#f0ede6", SURFACE_DARK: "#0f1d24",
    });
    expect(gs.primaryColor).toBe("#111111");
    expect(gs.fontFamily).toBe("LATO_SANS");
    expect(gs.displayFontFamily).toBe("PLAYFAIR_SERIF");
    expect(gs.surfaceColor).toBe("#f0ede6");
    expect(gs.surfaceDarkColor).toBe("#0f1d24");
  });

  test("absent tokens leave every field untouched (today's behavior)", () => {
    expect(brandGlobalStyle(BASE, {})).toEqual(BASE);
  });

  test("an invalid FONT_* token value is ignored, never applied", () => {
    const gs = brandGlobalStyle(BASE, { FONT_BODY: "papyrus" });
    expect(gs.fontFamily).toBe("MODERN_SANS");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/brand/apply-brand-style.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/email/brand/apply-brand-style.ts`:

```ts
// lib/email/brand/apply-brand-style.ts
//
// The globalStyle half of applyBrand, extracted pure so it's testable without
// importing the client shell. applyBrand (components/email-lab/EmailLabShell.tsx,
// the ONE brand-fill root — the grid shell imports it) delegates here.

import type { EmailGlobalStyle } from "@/lib/email/doc/types";
import { isFontFamily } from "@/lib/brand/fonts";

export function brandGlobalStyle(
  gs: EmailGlobalStyle,
  t: Record<string, string>,
): EmailGlobalStyle {
  return {
    ...gs,
    primaryColor: t.PRIMARY || gs.primaryColor,
    accentColor: t.ACCENT || gs.accentColor,
    textColor: t.TEXT || gs.textColor,
    backdropColor: t.BACKDROP || gs.backdropColor,
    fontFamily: t.FONT_BODY && isFontFamily(t.FONT_BODY) ? t.FONT_BODY : gs.fontFamily,
    displayFontFamily:
      t.FONT_DISPLAY && isFontFamily(t.FONT_DISPLAY) ? t.FONT_DISPLAY : gs.displayFontFamily,
    surfaceColor: t.SURFACE || gs.surfaceColor,
    surfaceDarkColor: t.SURFACE_DARK || gs.surfaceDarkColor,
  };
}
```

In `components/email-lab/EmailLabShell.tsx`, replace the `const globalStyle = { ... }` block (lines 95-101) with:

```ts
import { brandGlobalStyle } from "@/lib/email/brand/apply-brand-style";
// inside applyBrand:
const globalStyle = brandGlobalStyle(doc.globalStyle, t);
```

- [ ] **Step 4: Run tests + build**

Run: `bun test lib/email/brand/ && bunx next build`
Expected: tests PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add lib/email/brand/apply-brand-style.ts lib/email/brand/apply-brand-style.test.ts components/email-lab/EmailLabShell.tsx
git commit -m "feat(brand): applyBrand maps font + surface tokens via pure brandGlobalStyle"
```

---

### Task 6: Shared email head — webfont links + Outlook pin, flow AND grid

**Files:**
- Create: `lib/email/blocks/email-head.ts`
- Modify: `lib/email/blocks/EmailDocRenderer.tsx:9-14`
- Modify: `lib/email/compile-grid.ts` (the shell that emits `createElement(Head, null)` — locate the `Head` usage in the file's outer-shell section)
- 🔴 Test: `lib/email/__tests__/font-parity.test.ts` (create)

**Interfaces:**
- Consumes: `BRAND_FONTS`, `fontStack`; `renderEmailDocHtml` from `lib/email/render-email-doc.ts` (the one seam, landed `44e36fc7`).
- Produces: `emailHeadChildren(doc: EmailDoc): ReactNode[]` — dedup'd `<link>`s for every webfont family the doc uses (body + display) + one `[if mso]` `<style>` pinning the safe stacks. Both renderers call it, so the heads cannot diverge.

- [ ] **Step 1: Write the failing parity test**

`lib/email/__tests__/font-parity.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { BRAND_FONTS } from "@/lib/brand/fonts";
import type { EmailDoc } from "@/lib/email/doc/types";

const GS = {
  primaryColor: "#0f1d24", accentColor: "#3DC9C0",
  fontFamily: "LATO_SANS" as const, displayFontFamily: "PLAYFAIR_SERIF" as const,
  textColor: "#242424", backdropColor: "#F8F8F8",
};
const HERO = { id: "h1", type: "hero" as const, props: { kicker: "K", value: "42", prose: "p" } };

function flowDoc(): EmailDoc {
  return { globalStyle: { ...GS }, blocks: [HERO] } as EmailDoc;
}
function gridDoc(): EmailDoc {
  return {
    globalStyle: { ...GS },
    blocks: [{ ...HERO, layout: { x: 0, y: 0, w: 12, h: 4 } }],
  } as EmailDoc;
}

describe("font parity — flow and grid emit the same head (the divergence killer)", () => {
  test("both paths carry BOTH webfont links (body + display families)", async () => {
    const flow = await renderEmailDocHtml(flowDoc());
    const grid = await renderEmailDocHtml(gridDoc());
    for (const html of [flow, grid]) {
      expect(html).toContain(BRAND_FONTS.LATO_SANS.webfontUrl!);
      expect(html).toContain(BRAND_FONTS.PLAYFAIR_SERIF.webfontUrl!);
    }
  });

  test("both paths inline the same fallback stack (never link-only)", async () => {
    const flow = await renderEmailDocHtml(flowDoc());
    const grid = await renderEmailDocHtml(gridDoc());
    for (const html of [flow, grid]) expect(html).toContain("Lato");
  });

  test("both paths pin Outlook to the safe stack via [if mso]", async () => {
    const flow = await renderEmailDocHtml(flowDoc());
    const grid = await renderEmailDocHtml(gridDoc());
    for (const html of [flow, grid]) {
      expect(html).toContain("<!--[if mso]>");
      expect(html).toContain("Georgia"); // display serif's mso-safe pin
    }
  });

  test("a pure system-stack doc emits NO webfont link on either path", async () => {
    const doc = flowDoc();
    doc.globalStyle.fontFamily = "MODERN_SANS";
    doc.globalStyle.displayFontFamily = undefined;
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("fonts.googleapis.com");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/__tests__/font-parity.test.ts`
Expected: FAIL — grid path has no links (empty Head); flow path lacks the display-family link and the mso pin.

- [ ] **Step 3: Implement the shared head**

`lib/email/blocks/email-head.ts`:

```ts
// lib/email/blocks/email-head.ts
//
// THE shared <Head> content both email renderers inject (flow EmailDocRenderer +
// grid compileGrid) — built in one place so the two paths cannot diverge again
// (the pre-wave-2 bug: flow had the webfont <link>, grid emitted an empty Head).
//
// Progressive enhancement (operator-locked 07/02/2026): the fallback stack is
// ALWAYS the inline font-family; these links are additive for the ~24% of
// clients honoring @font-face. The [if mso] style pins Outlook to the safe
// stack — its @font-face bug otherwise ignores the stack and lands on Times
// New Roman (caniemail css-at-font-face, fetched 07/02/2026).

import { createElement, type ReactNode } from "react";
import { BRAND_FONTS } from "@/lib/brand/fonts";
import type { EmailDoc, FontFamily } from "../doc/types";

/** The families a doc's text can render in: body + (optional) display. */
function docFamilies(doc: EmailDoc): FontFamily[] {
  const { fontFamily, displayFontFamily } = doc.globalStyle;
  return displayFontFamily && displayFontFamily !== fontFamily
    ? [fontFamily, displayFontFamily]
    : [fontFamily];
}

export function emailHeadChildren(doc: EmailDoc): ReactNode[] {
  const fams = docFamilies(doc);
  const children: ReactNode[] = [];
  for (const f of fams) {
    const url = BRAND_FONTS[f].webfontUrl;
    if (url) children.push(createElement("link", { key: `wf-${f}`, rel: "stylesheet", href: url }));
  }
  // Outlook pin: strip the webfont name so mso resolves the system fallback.
  // Only needed when a webfont family is in play.
  if (fams.some((f) => BRAND_FONTS[f].webfontUrl)) {
    const body = BRAND_FONTS[doc.globalStyle.fontFamily];
    const display = BRAND_FONTS[doc.globalStyle.displayFontFamily ?? doc.globalStyle.fontFamily];
    const msoBody = body.stack.split(",").slice(body.webfontUrl ? 1 : 0).join(",").trim();
    const msoDisplay = display.stack.split(",").slice(display.webfontUrl ? 1 : 0).join(",").trim();
    children.push(
      createElement("style", {
        key: "mso-font-pin",
        dangerouslySetInnerHTML: {
          __html: `<!--[if mso]><style>body,table,td,p{font-family:${msoBody} !important;}h1,h2,h3{font-family:${msoDisplay} !important;}</style><![endif]-->`,
        },
      }),
    );
  }
  return children;
}
```

NOTE for the implementer: react-email escapes `<` inside `<style>` children — the conditional comment must survive verbatim in output. If `dangerouslySetInnerHTML` on a `style` element inside `<Head>` HTML-escapes the `<!--[if mso]>` marker, switch to `createElement("head-comment-raw")` alternatives: render the conditional comment as a RAW string via `Head`'s children using `dangerouslySetInnerHTML` on a `<span>`-free approach — the proven pattern in this repo is compile-grid's own mso ghost tables (raw strings through `dangerouslySetInnerHTML`). Assert with the parity test: `expect(html).toContain("<!--[if mso]>")` — if it renders escaped (`&lt;!--`), fix before proceeding; do NOT weaken the test.

- [ ] **Step 4: Wire both renderers**

`lib/email/blocks/EmailDocRenderer.tsx` — replace lines 9-13:

```tsx
import { emailHeadChildren } from "./email-head";

export function EmailDocEmail({ doc, preview }: { doc: EmailDoc; preview?: string }) {
  return (
    <Html lang="en">
      <Head>{emailHeadChildren(doc)}</Head>
```

(Drop the `WEB_FONT_URLS` import and the old single-link line.)

`lib/email/compile-grid.ts` — find the outer shell's `createElement(Head, null)` and replace with:

```ts
import { emailHeadChildren } from "./blocks/email-head";
// in the shell:
createElement(Head, null, ...emailHeadChildren(doc))
```

- [ ] **Step 5: Run parity + full email suite**

Run: `bun test lib/email/__tests__/font-parity.test.ts && bun test lib/email`
Expected: PASS all. `render-email-doc.test.ts`'s byte-identical free-doc assertion still passes for system-stack docs (no links emitted); if it pinned a webfont-family fixture, the fixture now gains the same head on both paths — update the assertion to compare flow output to `render(EmailDocEmail(...))` directly (which is what it does; both moved together, so it stays green).

- [ ] **Step 6: Commit**

```bash
git add lib/email/blocks/email-head.ts lib/email/blocks/EmailDocRenderer.tsx lib/email/compile-grid.ts lib/email/__tests__/font-parity.test.ts
git commit -m "feat(email): one shared head — webfont links + Outlook pin on BOTH render paths"
```

---

### Task 7: Display font + surface color reach the blocks (email + PDF)

**Files:**
- 🔴 Modify: `lib/email/blocks/styles.ts` (add `displayFontStack`)
- Modify: `lib/email/blocks/HeaderBlock.tsx:13,30-42` (companyName uses display)
- Modify: `lib/email/blocks/HeroBlock.tsx:13,17,37-50` (value uses display; sectionBg fallback → surfaceColor)
- Modify: `lib/email/blocks/StatsBlock.tsx:13,18` (sectionBg fallback → surfaceColor)
- 🔴 Modify: `lib/pdf/email-doc-pdf.tsx` (header/hero heading Text nodes use the display pdf family)
- 🔴 Test: `lib/email/__tests__/font-parity.test.ts` (extend)

**Interfaces:**
- Consumes: `displayFontFamily`/`surfaceColor` from Task 3, `fontStack` from Task 2.
- Produces: `displayFontStack(gs: EmailGlobalStyle): string` in styles.ts — `fontStack(gs.displayFontFamily ?? gs.fontFamily)`. Explicit per-block `props.sectionBg` ALWAYS wins over surfaceColor (user-authored beats brand).

- [ ] **Step 1: Extend the parity test (failing)**

```ts
test("hero value renders in the DISPLAY stack; prose stays in the body stack", async () => {
  const html = await renderEmailDocHtml(flowDoc());
  expect(html).toContain("Playfair Display"); // display stack on the value
  expect(html).toContain("Lato");             // body stack on prose
});

test("brand surfaceColor paints hero/stats card bg; explicit sectionBg wins", async () => {
  const doc = flowDoc();
  doc.globalStyle.surfaceColor = "#f0ede6";
  const html = await renderEmailDocHtml(doc);
  expect(html).toContain("#f0ede6");
  const authored = flowDoc();
  authored.globalStyle.surfaceColor = "#f0ede6";
  (authored.blocks[0].props as Record<string, unknown>).sectionBg = "#123456";
  const html2 = await renderEmailDocHtml(authored);
  expect(html2).toContain("#123456");
  expect(html2).not.toContain("#f0ede6");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/__tests__/font-parity.test.ts`
Expected: FAIL — value renders in Lato; surface not applied.

- [ ] **Step 3: Implement**

`lib/email/blocks/styles.ts` — add:

```ts
import type { EmailGlobalStyle } from "../doc/types";

/** Headline stack: displayFontFamily when set, else the body family. */
export function displayFontStack(gs: EmailGlobalStyle): string {
  return fontStack(gs.displayFontFamily ?? gs.fontFamily);
}
```

`HeaderBlock.tsx` — `const displayFont = displayFontStack(globalStyle);` and the companyName `<Text>` gets `fontFamily: displayFont` (tagline stays `font`).

`HeroBlock.tsx` — `const displayFont = displayFontStack(globalStyle);`; the `props.value` `<Text>` gets `fontFamily: displayFont`; the Section background becomes:

```ts
backgroundColor: props.sectionBg ?? globalStyle.surfaceColor ?? CARD_BG,
```

`StatsBlock.tsx` — same background fallback change (value/label fonts unchanged — stats are data, body font).

`lib/pdf/email-doc-pdf.tsx` — in `PdfBlock`, alongside `const font = pdfFont(gs.fontFamily);` add `const displayFont = pdfFont(gs.displayFontFamily ?? gs.fontFamily);` and use `displayFont` on the header companyName and hero value `<Text>` styles (mirror exactly which nodes changed in the email blocks).

- [ ] **Step 4: Run the suites**

Run: `bun test lib/email && bun test lib/pdf 2>/dev/null || bun test lib/email`
Expected: PASS (if lib/pdf has no test dir the second command is a no-op; PDF changes are covered by `bunx next build` type-checking).

- [ ] **Step 5: Commit**

```bash
git add lib/email/blocks/styles.ts lib/email/blocks/HeaderBlock.tsx lib/email/blocks/HeroBlock.tsx lib/email/blocks/StatsBlock.tsx lib/pdf/email-doc-pdf.tsx lib/email/__tests__/font-parity.test.ts
git commit -m "feat(email): display font on headlines + brand surface on cards, email and PDF"
```

---

### Task 8: BrandingBlock form — two font pickers + two surface colors + the info line

**Files:**
- Modify: `components/brand/BrandingBlock.tsx` (new "Typography & Surfaces" section)
- 🔴 Reference: `lib/brand/fonts.ts` (BRAND_FONTS labels), `lib/email/lab/capabilities.ts` (`fontsFor`)

**Interfaces:**
- Consumes: `branding`/`onChange` props (existing `Record<string, string>` blob editing pattern — see AGENT_FIELDS handling in the same file).
- Produces: blob keys `font_display`, `font_body` (select from `fontsFor("free")` — all 6 route "both" today; when paid-only fonts land, plumb the real tier), `surface_color`, `surface_dark_color` (reuse the existing color-input pattern from COLOR_SLOTS).

- [ ] **Step 1: Add the section**

Inside the form (after the COLOR_SLOTS section), following the file's existing field-row idiom:

```tsx
import { BRAND_FONTS } from "@/lib/brand/fonts";
import { fontsFor } from "@/lib/email/lab/capabilities";
import type { FontFamily } from "@/lib/email/doc/types";

const FONT_FIELDS: { key: string; label: string }[] = [
  { key: "font_display", label: "Headline font" },
  { key: "font_body", label: "Body font" },
];
const SURFACE_FIELDS: { key: string; label: string }[] = [
  { key: "surface_color", label: "Card surface" },
  { key: "surface_dark_color", label: "Dark surface" },
];

{/* Typography & Surfaces */}
<div className="grid grid-cols-2 gap-2">
  {FONT_FIELDS.map(({ key, label }) => (
    <label key={key} className="flex flex-col gap-1 text-xs text-white/60">
      {label}
      <select
        className={INPUT_CLS}
        value={branding[key] ?? ""}
        onChange={(e) => onChange({ ...branding, [key]: e.target.value })}
      >
        <option value="">Default</option>
        {fontsFor("free").map((f: FontFamily) => (
          <option key={f} value={f}>{BRAND_FONTS[f].label}</option>
        ))}
      </select>
    </label>
  ))}
  {SURFACE_FIELDS.map(({ key, label }) => (
    <label key={key} className="flex flex-col gap-1 text-xs text-white/60">
      {label}
      <input
        className={INPUT_CLS}
        placeholder={key === "surface_color" ? "#f0ede6" : "#0f1d24"}
        value={branding[key] ?? ""}
        onChange={(e) => onChange({ ...branding, [key]: e.target.value })}
      />
    </label>
  ))}
</div>
<p className="text-[11px] text-white/40">
  Email apps vary — we always pair your font with a matching backup, so your emails
  look right everywhere. Your exact fonts always show on social cards and images.
</p>
```

(Adapt classNames/structure to the surrounding sections — match the file's existing section headers and grid idioms; the code above shows intent and exact keys/copy.)

- [ ] **Step 2: Verify with build + manual render**

Run: `bunx next build`
Expected: clean. Then confirm in the lab UI at dev time if a dev server is already running — otherwise the build gate suffices (client-only markup, logic covered by Tasks 4-5 tests).

- [ ] **Step 3: Commit**

```bash
git add components/brand/BrandingBlock.tsx
git commit -m "feat(brand-ui): headline/body font pickers + surface colors in the brand panel"
```

---

### Task 9: Social canvas — TemplateTokens 4→8 slots, Arial const dies

**Files:**
- Modify: `lib/social/design/templates.ts` (TemplateTokens, tokensFromBranding, `const FONT` removal, `background:` fields)
- Test: extend the existing templates test (`lib/social/design/__tests__/` — the bounds test referenced in templates.ts:46) or create `lib/social/design/__tests__/tokens.test.ts`

**Interfaces:**
- Consumes: `BRAND_FONTS` previewStacks; tokens FONT_DISPLAY/FONT_BODY/SURFACE/SURFACE_DARK from Task 4 (author.ts already composes `tokensFromBranding(brandingToTokens(branding))` — no author change needed).
- Produces: `TemplateTokens = { primary, accent, text, logoUrl?, fontDisplay, fontBody, surface, surfaceDark }` where fontDisplay/fontBody are RESOLVED preview stacks (strings Konva can consume), surface/surfaceDark are hex. Element ids UNCHANGED.

- [ ] **Step 1: Write the failing test**

`lib/social/design/__tests__/tokens.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { tokensFromBranding, SOCIAL_TEMPLATES } from "../templates";
import { BRAND_FONTS } from "@/lib/brand/fonts";

describe("tokensFromBranding — 8 slots", () => {
  test("defaults: sand surfaces + Modern Sans stacks, never the Arial literal", () => {
    const tk = tokensFromBranding({});
    expect(tk.surface).toBe("#f0ede6");
    expect(tk.surfaceDark).toBe("#0f1d24");
    expect(tk.fontDisplay).toBe(BRAND_FONTS.MODERN_SANS.previewStack);
    expect(tk.fontBody).toBe(BRAND_FONTS.MODERN_SANS.previewStack);
  });

  test("brand tokens resolve to preview stacks + hex", () => {
    const tk = tokensFromBranding({
      FONT_DISPLAY: "PLAYFAIR_SERIF", FONT_BODY: "LATO_SANS",
      SURFACE: "#ffffff", SURFACE_DARK: "#101010",
    });
    expect(tk.fontDisplay).toBe(BRAND_FONTS.PLAYFAIR_SERIF.previewStack);
    expect(tk.fontBody).toBe(BRAND_FONTS.LATO_SANS.previewStack);
    expect(tk.surfaceDark).toBe("#101010");
  });

  test("no template element carries a bare-Arial font, and ids are stable", () => {
    const tk = tokensFromBranding({ FONT_DISPLAY: "BOOK_SERIF" });
    for (const t of SOCIAL_TEMPLATES) {
      for (const fmt of t.formats) {
        const d = t.build(tk, fmt);
        for (const el of d.elements) {
          if ("fontFamily" in el) expect(el.fontFamily).not.toBe("Arial");
          expect(el.id).toMatch(/^[a-z][a-z0-9-]*$/); // deterministic readable ids
        }
      }
    }
  });

  test("dark templates background = surfaceDark (default identical to old primary default)", () => {
    const d = SOCIAL_TEMPLATES[0].build(tokensFromBranding({}), SOCIAL_TEMPLATES[0].formats[0]);
    expect(d.background).toBe("#0f1d24");
  });
});
```

(Use the actual exported template-array name — check `templates.ts` exports; if templates are exported individually, iterate the exported registry the author uses.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/social/design/__tests__/tokens.test.ts`
Expected: FAIL — `tk.surface` undefined.

- [ ] **Step 3: Implement**

In `lib/social/design/templates.ts`:

```ts
import { BRAND_FONTS, isFontFamily } from "@/lib/brand/fonts";

export interface TemplateTokens {
  primary: string;
  accent: string;
  text: string;
  logoUrl?: string;
  /** Resolved preview stack (browser canvas) for headlines/stats/CTAs. */
  fontDisplay: string;
  /** Resolved preview stack for captions/footers. */
  fontBody: string;
  /** Light card surface (sand default). */
  surface: string;
  /** Dark card/canvas surface. */
  surfaceDark: string;
}

/** brandingToTokens() emits a flat Record — read the 8 slots the canvas uses, with v1 defaults. */
export function tokensFromBranding(t: Record<string, string>): TemplateTokens {
  const font = (key: string) =>
    BRAND_FONTS[t[key] && isFontFamily(t[key]) ? (t[key] as FontFamily) : "MODERN_SANS"]
      .previewStack;
  return {
    primary: t.PRIMARY || "#0f1d24",
    accent: t.ACCENT || "#0ea5b7",
    text: t.TEXT || "#ffffff",
    logoUrl: t.LOGO_URL || undefined,
    fontDisplay: font("FONT_DISPLAY"),
    fontBody: font("FONT_BODY"),
    surface: t.SURFACE || "#f0ede6",
    surfaceDark: t.SURFACE_DARK || "#0f1d24",
  };
}
```

(Import `FontFamily` type from `@/lib/email/doc/types`.) Then delete `const FONT = "Arial";` (line 47) and update every element factory: headline/stat/kicker/CTA text elements get `fontFamily: tk.fontDisplay`; caption/footer/watermark text elements get `fontFamily: tk.fontBody`; every `background: tk.primary` becomes `background: tk.surfaceDark`. The four templates' element IDS DO NOT CHANGE.

- [ ] **Step 4: Run the full social design suite**

Run: `bun test lib/social`
Expected: PASS — serialize/bounds/author tests unchanged (geometry and ids untouched). Fix any test that hardcoded `"Arial"` as an expected fontFamily by asserting the registry stack instead.

- [ ] **Step 5: Commit**

```bash
git add lib/social/design/templates.ts lib/social/design/__tests__/tokens.test.ts
git commit -m "feat(social): brand fonts + sand surfaces on the canvas — Arial const dies"
```

---

### Task 10: Engine rasterizer — bundled fonts, blank-text bug fixed

**Files:**
- Modify: `lib/social/render-social-image.ts:232-319,359-364` (font literals + resvg options)
- Modify: `next.config.ts:13-31` (trace fonts into the social render route)
- Test: `lib/social/__tests__/render-social-image.test.ts` (extend)

**Interfaces:**
- Consumes: `CANVAS_FONT_FILES`, `CANVAS_DEFAULT_FAMILY` from Task 1.
- Produces: `renderSocialImage` renders deterministically local === Vercel (`loadSystemFonts: false`); SVG text uses `"Liberation Sans"` (metric-compatible with the Arial the layout math assumes — char-width budgeting at line 232 stays valid).

- [ ] **Step 1: Write the failing test**

Append to `lib/social/__tests__/render-social-image.test.ts` (mirror its existing fixtures/imports):

```ts
test("rasterizes with bundled fonts only — deterministic on Vercel (no system-font dependency)", async () => {
  // The pre-wave-2 options ({loadSystemFonts:true, defaultFontFamily:"Arial"})
  // silently render BLANK text on Vercel's Linux runtime (no Arial installed) —
  // the exact landmine lib/charts/chart-fonts.ts documents. A non-trivially-sized
  // PNG under loadSystemFonts:false proves glyphs came from the bundled TTFs.
  const png = await renderSocialImage({ model: BASE_MODEL, theme: BRAND, format: "square" });
  expect(png.length).toBeGreaterThan(20_000); // blank-text cards compress far smaller
});
```

AND a source-level guard in the same file:

```ts
import { readFileSync } from "node:fs";

test("no bare-Arial font-family literals and no loadSystemFonts:true remain", () => {
  const src = readFileSync("lib/social/render-social-image.ts", "utf8");
  expect(src).not.toContain("loadSystemFonts: true");
  expect(src).not.toContain('font-family="Arial');
});
```

- [ ] **Step 2: Run to verify the guard fails**

Run: `bun test lib/social/__tests__/render-social-image.test.ts`
Expected: the source-guard test FAILS (literals present). The size test may pass locally (Windows has Arial) — that's exactly why the source guard exists.

- [ ] **Step 3: Implement**

In `lib/social/render-social-image.ts`:

```ts
import { CANVAS_FONT_FILES, CANVAS_DEFAULT_FAMILY } from "@/lib/brand/fonts";

// module-scope:
const ENGINE_FONT = `${CANVAS_DEFAULT_FAMILY}, Arial, Helvetica, sans-serif`;
```

Replace every `font-family="Arial, Helvetica, sans-serif"` literal (lines 239, 250, 256, 263, 310, 319) with `font-family="${ENGINE_FONT}"` (inside the existing template strings), and replace the resvg options (line 361-364):

```ts
  const resvg = new Resvg(svg, {
    background: "rgba(255,255,255,0)",
    // Bundled Liberation faces (lib/brand/fonts) — loadSystemFonts:false makes the
    // render deterministic local === Vercel; the pattern proven by chart-fonts.
    font: {
      fontFiles: CANVAS_FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: CANVAS_DEFAULT_FAMILY,
    },
  });
```

In `next.config.ts`, add to `outputFileTracingIncludes`:

```ts
    // The social rasterizer loads bundled Liberation TTFs by path at runtime —
    // same blank-text landmine as the chart route (see the /api/email-lab/ai note).
    "/api/social/render/[format]": ["./assets/fonts/*.ttf"],
```

- [ ] **Step 4: Run the full social suite + build**

Run: `bun test lib/social && bunx next build`
Expected: PASS + clean build. Existing PNG-producing tests still pass (Liberation is metric-compatible with Arial — layout math unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/social/render-social-image.ts lib/social/__tests__/render-social-image.test.ts next.config.ts
git commit -m "fix(social): engine PNGs rasterize with bundled fonts — kills silent blank text on Vercel"
```

---

### Task 11: Full sweep, SESSION_LOG, wrap

**Files:**
- Modify: `SESSION_LOG.md` (top-of-file entry)

- [ ] **Step 1: Full test sweep**

Run: `bun test lib/brand lib/email lib/social`
Expected: ALL PASS.

- [ ] **Step 2: Production build**

Run: `bunx next build`
Expected: clean (this is the Vercel-equivalent type gate).

- [ ] **Step 3: SESSION_LOG entry + final commit**

Append a top-of-file SESSION_LOG.md entry: what shipped (registry, 4 brand fields, shared head + mso pin, display/surface in blocks+PDF, canvas tokens 8 slots, engine font bug fix, form UI), test counts, and that `brand_tokens_one_root_live_verify` remains OPEN for the operator (live check: a brand with Playfair display renders the webfont link in a real send preview + a social PNG shows serif glyphs).

```bash
git add SESSION_LOG.md
git commit -m "docs: session log — brand-tokens-one-root implementation"
```

- [ ] **Step 4: STOP — do not push**

Show `git log --oneline origin/main..HEAD` to the operator and ask for push approval (locked rule: never push without explicit confirmation).

---

## Self-Review Notes

- Spec coverage: registry (T1-2) · brand fields + tokens (T4, T8) · email doc fields (T3) · applyBrand (T5) · shared head + mso pin + flow/grid parity (T6) · display font + surfaces in blocks/PDF (T7) · canvas 8 slots + Arial death (T9) · engine resvg bug + file tracing (T10) · parity acceptance tests (T6 §1, T9 §3, T10, plus registry completeness T1). Out-of-scope items (premium fonts, Font.register, funnel, SWFL_TOKEN_DEFAULTS) intentionally untouched.
- The engine path (render-model cards) keeps default sans in v1 — brand fonts reach social via the design/author path (`tokensFromBranding`); the engine gets the deterministic-rendering fix. Matches spec §4.
- Konva accepts comma-separated font stacks in `fontFamily` (canvas `ctx.font` semantics) — previewStack strings are safe as element values; they serialize through `SocialDesign.fontFamily: string` unchanged.
- Type consistency: `BrandFont`/`BRAND_FONTS`/`CANVAS_FONT_FILES`/`CANVAS_DEFAULT_FAMILY`/`isFontFamily` (T1) are the only new cross-task names; `brandGlobalStyle` (T5); `emailHeadChildren` (T6); `displayFontStack` (T7) — each consumed exactly as declared.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2, Task 3, Task 6, Task 7, Task 8 | `lib/brand/fonts.ts`, `lib/brand/fonts.test.ts`, `lib/email/doc/types.ts`, `lib/email/blocks/styles.ts`, `lib/pdf/email-doc-pdf.tsx`, `lib/email/__tests__/font-parity.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
