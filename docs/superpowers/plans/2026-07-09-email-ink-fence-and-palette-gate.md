# Email Ink Fence + Palette Gate (Fence 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 13 files, keywords: architecture

**Goal:** No brand palette can produce unreadable ink in a rendered email (Tier A render guards +
white-ink trio), and a user who saves a low-contrast palette is told, plainly and non-blockingly,
what will happen (Tier B warn strip).

**Architecture:** One generalized primitive `legibleInk(preferred, bg, floor)` in
`lib/email/blocks/on-dark.ts` (falls to the readable neutral FOR THAT BG via `readableLabel`,
not unconditional white) is rewired into every raw brand-ink site (spec §3 audit table) AND the
`email_contrast_ink_fence` white-ink trio. A pure evaluator `lib/brand/palette-contrast.ts` +
tiny presentational `PaletteContrastStrip` component surface save-time warnings in the ONE brand
form. Saves never blocked; colors never rewritten; `applyBrand` untouched.

**Tech Stack:** TypeScript, bun:test, `@react-email/render` for block render tests,
`react-dom/server` for the strip test. WCAG math from `lib/charts/palette.ts` (ONE root).

**Spec:** `docs/superpowers/specs/2026-07-09-email-accent-ink-palette-gate-design.md` (ratified
07/09/2026). Operator re-ordered execution 07/09: Fence 6 first, then the white-ink trio — safe
because the shared primitive lands in Task 1 either way.

## Global Constraints

- Floors (spec D3): **4.5** functional text · **3** large text (18pt+/14pt+bold: the 22px/700+
  agent name and listing price) and non-text icons · decoration (accent border rules) exempt — LEAVE.
- `legibleInk` non-hex input (either arg) returns `preferred` unchanged — never throws (matches
  `isDarkBg`/`legibleAccent` posture; rgba scrims pass through).
- The five legacy `legibleAccent` call sites (`HeroBlock.tsx:23,39`, `MultiColumnBlock.tsx:107`,
  `SignalBlock.tsx:41`, `MetricCardBlock.tsx:30`, `ListBlock.tsx:56`) must render byte-identical
  output (they only fire under `onDark`, where the readable neutral IS white).
- Warn strip: NO save blocking, NO color mutation, NO `setState` in an effect
  (react-hooks/set-state-in-effect is a hard ESLint error) — pure derived render only.
- User-facing copy: plain language, no hex jargon beyond `N:1` ratios, no system nouns.
- Every expected ratio in tests below was computed with the repo's `contrastRatio` this session —
  do not re-derive by eye.
- Run `bun test lib/email/` after each Tier A task: existing fixtures that asserted the OLD
  unguarded accent hex in rendered HTML may legitimately change — update only assertions that
  encoded the unguarded behavior, never weaken a guard assertion.
- Commit per task with explicit `git add` paths (never `-A`). Do NOT push (operator confirms).

---

### Task 1: `legibleInk` primitive (generalize `legibleAccent`)

**Files:**
- Modify: `lib/email/blocks/on-dark.ts`
- Test: `lib/email/blocks/on-dark.test.ts` (create)

**Interfaces:**
- Consumes: `contrastRatio`, `parseHex`, `readableLabel` from `@/lib/charts/palette`
- Produces: `legibleInk(preferred: string, bg: string, floor?: number): string` (floor default 3)
  and `legibleAccent(accent: string, bg: string): string` (unchanged signature, now delegates).
  Every later task imports `legibleInk` from `./on-dark` (blocks) — nothing else.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/blocks/on-dark.test.ts
import { describe, expect, it } from "bun:test";
import { legibleAccent, legibleInk, ON_DARK_TITLE } from "./on-dark";

// Ratios via lib/charts/palette contrastRatio (computed 07/09/2026):
// #3DC9C0 on #0f1d24 = 8.44 · #3DC9C0 on #ffffff = 2.04 · #1B3A5C on #1B3A5C = 1.00
// #FFF8E1 on #F5E6C4 = 1.16 · #ffffff on #D4AF37 = 2.10
describe("legibleInk", () => {
  it("keeps the preferred ink when it clears the floor", () => {
    expect(legibleInk("#3DC9C0", "#0f1d24", 4.5)).toBe("#3DC9C0"); // 8.44
  });
  it("falls to WHITE on a dark bg it cannot clear", () => {
    expect(legibleInk("#1B3A5C", "#1B3A5C", 4.5)).toBe("#ffffff"); // 1.00, dark bg
  });
  it("falls to DARK ink on a light bg it cannot clear (NOT white)", () => {
    expect(legibleInk("#3DC9C0", "#ffffff", 4.5)).toBe("#111827"); // 2.04, light bg
    expect(legibleInk("#FFF8E1", "#F5E6C4", 4.5)).toBe("#111827"); // 1.16, light bg
    expect(legibleInk("#ffffff", "#D4AF37", 4.5)).toBe("#111827"); // 2.10, light fill
  });
  it("respects the floor argument (3 passes what 4.5 rejects)", () => {
    // #B8860B on #ffffff = 3.25: large-text legal, normal-text failing
    expect(legibleInk("#B8860B", "#ffffff", 3)).toBe("#B8860B");
    expect(legibleInk("#B8860B", "#ffffff", 4.5)).toBe("#111827");
  });
  it("passes through non-hex input untouched (never throws)", () => {
    expect(legibleInk("rgba(0,0,0,0.5)", "#ffffff", 4.5)).toBe("rgba(0,0,0,0.5)");
    expect(legibleInk("#3DC9C0", "linear-gradient(x)", 4.5)).toBe("#3DC9C0");
  });
});

describe("legibleAccent (legacy call-site behavior preserved)", () => {
  it("keeps a popping accent on a dark band", () => {
    expect(legibleAccent("#3DC9C0", "#0f1d24")).toBe("#3DC9C0"); // 8.44 >= 3
  });
  it("still falls to white on a dark band it cannot clear", () => {
    // #1B3A5C accent on #0f1d24 band — both dark, ratio < 3, dark bg → white
    expect(legibleAccent("#1B3A5C", "#0f1d24")).toBe(ON_DARK_TITLE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/blocks/on-dark.test.ts`
Expected: FAIL — `legibleInk` is not exported.

- [ ] **Step 3: Implement**

Replace the `legibleAccent` block in `lib/email/blocks/on-dark.ts` (keep file header, imports,
constants, `isDarkBg` as-is; add `readableLabel` to the existing palette import):

```ts
import { contrastRatio, parseHex, readableLabel } from "@/lib/charts/palette";
```

```ts
/** Keep `preferred` ink when it clears `floor` on `bg`; else fall to the readable
 *  NEUTRAL FOR THAT BG — white on dark, #111827 on light (readableLabel, ONE root).
 *  Floors per WCAG AA (spec 2026-07-09-email-accent-ink-palette-gate-design.md §2):
 *  4.5 functional text · 3 large text + non-text. Non-hex input passes through. */
export function legibleInk(preferred: string, bg: string, floor = 3): string {
  if (!parseHex(preferred) || !parseHex(bg)) return preferred;
  if (contrastRatio(preferred, bg) >= floor) return preferred;
  return readableLabel(bg, { dark: "#111827", light: "#ffffff" });
}

/** Keep an accent that still pops on a dark band; fall to the readable neutral
 *  when it can't. 3:1 = WCAG large-text/non-text floor. */
export function legibleAccent(accent: string, bg: string): string {
  return legibleInk(accent, bg, 3);
}
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/blocks/on-dark.test.ts` → PASS, then `bun test lib/email/` → all pass
(legacy call sites byte-identical by the dark-band argument; any failure here means a fixture hit
the changed fallback — STOP and inspect, do not paper over).

- [ ] **Step 5: Commit**

```bash
git add lib/email/blocks/on-dark.ts lib/email/blocks/on-dark.test.ts
git commit -m "feat(email): legibleInk — directional readable-neutral fallback, floor param (Fence 6 Task 1)"
```

---

### Task 2: Tier A — accent ink on brand fills (HeaderBlock tagline, AgentHeroBlock designation)

**Files:**
- Modify: `lib/email/blocks/HeaderBlock.tsx:51`, `lib/email/blocks/AgentHeroBlock.tsx:80`
- Test: `lib/email/blocks/ink-guards.test.ts` (create — shared by Tasks 2–4, one fixture set)

**Interfaces:**
- Consumes: `legibleInk` from `./on-dark` (Task 1).
- Produces: nothing new — rendered HTML now carries floor-clearing ink.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/blocks/ink-guards.test.ts — Fence 6 Tier A render guards.
// Hostile palettes from the spec: accent==primary navy; pale-gold family.
import { describe, expect, it } from "bun:test";
import { render } from "@react-email/render";
import { createElement } from "react";
import type { EmailGlobalStyle } from "../doc/types";
import { HeaderBlock } from "./HeaderBlock";
import { AgentHeroBlock } from "./AgentHeroBlock";

const NAVY_ON_NAVY: EmailGlobalStyle = {
  primaryColor: "#1B3A5C", accentColor: "#1B3A5C",
  fontFamily: "MODERN_SANS", textColor: "#1F2937", backdropColor: "#F8FAFC",
};
const HOUSE: EmailGlobalStyle = {
  primaryColor: "#0f1d24", accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS", textColor: "#1F2937", backdropColor: "#F8FAFC",
};

describe("HeaderBlock tagline ink", () => {
  it("never renders accent-on-accent (navy==navy → white tagline)", async () => {
    const out = await render(createElement(HeaderBlock, {
      props: { companyName: "Gulf Co", tagline: "Waterfront specialists" },
      globalStyle: NAVY_ON_NAVY,
    }));
    expect(out).not.toContain("color:#1B3A5C"); // 1.00:1 ink is unreachable
  });
  it("keeps the house accent on the dark house primary (8.44:1)", async () => {
    const out = await render(createElement(HeaderBlock, {
      props: { companyName: "Gulf Co", tagline: "Waterfront specialists" },
      globalStyle: HOUSE,
    }));
    expect(out).toContain("color:#3DC9C0");
  });
});

describe("AgentHeroBlock designation ink", () => {
  it("never renders accent-on-accent on the name strip", async () => {
    const out = await render(createElement(AgentHeroBlock, {
      props: { name: "R. Cooper", designation: "BROKER ASSOCIATE" },
      globalStyle: NAVY_ON_NAVY,
    }));
    expect(out).not.toContain("color:#1B3A5C");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test lib/email/blocks/ink-guards.test.ts` →
navy-on-navy cases FAIL (raw accent in output).

- [ ] **Step 3: Implement**

`HeaderBlock.tsx` — add `import { legibleInk } from "./on-dark";`, then at the tagline (`:51`),
using the existing `bg` binding from `:16`:

```tsx
color: legibleInk(globalStyle.accentColor, bg, 4.5),
```

`AgentHeroBlock.tsx` — add the same import; designation (`:80`) sits on the primary strip:

```tsx
color: legibleInk(globalStyle.accentColor, globalStyle.primaryColor, 4.5),
```

- [ ] **Step 4: Run** — `bun test lib/email/blocks/ink-guards.test.ts` PASS, then
`bun test lib/email/` (fixture-drift check per Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add lib/email/blocks/HeaderBlock.tsx lib/email/blocks/AgentHeroBlock.tsx lib/email/blocks/ink-guards.test.ts
git commit -m "feat(email): accent ink guarded on brand fills — tagline + designation (Fence 6 Task 2)"
```

---

### Task 3: Tier A — accent links on light surfaces (AgentHero CTA, AgentCard CTA, Footer, Sources)

**Files:**
- Modify: `lib/email/blocks/AgentHeroBlock.tsx:115`, `lib/email/blocks/AgentCardBlock.tsx:85`,
  `lib/email/blocks/FooterBlock.tsx:87,98`, `lib/email/blocks/SourcesBlock.tsx:53`
- Test: extend `lib/email/blocks/ink-guards.test.ts`

**Interfaces:**
- Consumes: `legibleInk` (Task 1); `CARD_BG` (`"#ffffff"`) from `./styles`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test** (append to `ink-guards.test.ts`)

```ts
import { AgentCardBlock } from "./AgentCardBlock";
import { FooterBlock } from "./FooterBlock";
import { SourcesBlock } from "./SourcesBlock";

// House default on light surfaces is the LIVE failure: #3DC9C0 on #ffffff = 2.04,
// on the footer's #F9FAFB = 1.95 — both must resolve to dark ink.
describe("accent links on light surfaces", () => {
  it("AgentHeroBlock CTA on the white card never ships 2.04:1 teal", async () => {
    const out = await render(createElement(AgentHeroBlock, {
      props: { name: "R. Cooper", ctaLabel: "Book a call", ctaUrl: "https://example.com" },
      globalStyle: HOUSE,
    }));
    expect(out).toContain("color:#111827");
    expect(out).not.toContain("color:#3DC9C0");
  });
  it("AgentCardBlock CTA guards the same pair", async () => {
    const out = await render(createElement(AgentCardBlock, {
      props: { name: "R. Cooper", ctaLabel: "Book a call", ctaUrl: "https://example.com" },
      globalStyle: HOUSE,
    }));
    expect(out).not.toContain("color:#3DC9C0");
  });
  it("FooterBlock social links guard accent on #F9FAFB", async () => {
    const out = await render(createElement(FooterBlock, {
      props: { socials: [{ type: "website", url: "https://example.com", label: "Site" }] },
      globalStyle: HOUSE,
    }));
    expect(out).not.toContain("color:#3DC9C0");
  });
  it("SourcesBlock citation links guard accent on the card bg", async () => {
    const out = await render(createElement(SourcesBlock, {
      props: { sources: [{ label: "SWFL Data Gulf", href: "https://www.swfldatagulf.com" }] },
      globalStyle: HOUSE,
    }));
    expect(out).not.toContain("color:#3DC9C0");
  });
});
```

NOTE: exact `FooterProps`/`SourcesProps` field names must be checked against
`lib/email/doc/types.ts` at implementation time (footer socials ride `socialOrder`-sorted
entries; sources entries are `{label, href}`-shaped per `SourcesBlock.tsx:53`) — adjust the
fixture keys, not the assertions.

- [ ] **Step 2: Run to verify failures** — all four cases FAIL with raw `color:#3DC9C0`.

- [ ] **Step 3: Implement** — add the `legibleInk` import to each file; replace each raw
`color: globalStyle.accentColor` with the guarded pick against the surface it sits on:

```tsx
// AgentHeroBlock.tsx:115 (CTA on the white tagline/CTA section)
color: legibleInk(globalStyle.accentColor, CARD_BG, 4.5),
// AgentCardBlock.tsx:85 (CTA on the white card)
color: legibleInk(globalStyle.accentColor, CARD_BG, 4.5),
// FooterBlock.tsx:87 and :98 (link text + icon on the #F9FAFB footer)
color: legibleInk(globalStyle.accentColor, "#F9FAFB", 4.5),   // :87 — link text
color={legibleInk(globalStyle.accentColor, "#F9FAFB", 4.5)}   // :98 — SocialIcon
// SourcesBlock.tsx:53 (links on sectionBg ?? white card)
color: legibleInk(globalStyle.accentColor, props.sectionBg ?? CARD_BG, 4.5),
```

In `FooterBlock`, hoist one binding above the map so the pick runs once:
`const linkInk = legibleInk(globalStyle.accentColor, "#F9FAFB", 4.5);` and use `linkInk` at both
sites. In `SourcesBlock`, hoist `const linkInk = legibleInk(globalStyle.accentColor, props.sectionBg ?? CARD_BG, 4.5);`
above the list map. If `FooterBlock`'s `<Section>` bg (`:34`) is a literal, keep the same literal
in the pick — do not invent a constant.

- [ ] **Step 4: Run** — task test PASS + `bun test lib/email/` fixture-drift check.

- [ ] **Step 5: Commit**

```bash
git add lib/email/blocks/AgentHeroBlock.tsx lib/email/blocks/AgentCardBlock.tsx lib/email/blocks/FooterBlock.tsx lib/email/blocks/SourcesBlock.tsx lib/email/blocks/ink-guards.test.ts
git commit -m "feat(email): accent links guarded on light surfaces — CTA/footer/sources (Fence 6 Task 3)"
```

---

### Task 4: Tier A — ListingBlock (price, badge chip, link) + SocialIconsBlock custom icons

**Files:**
- Modify: `lib/email/blocks/ListingBlock.tsx:59-60,76,112`, `lib/email/blocks/SocialIconsBlock.tsx:88`
- Test: extend `lib/email/blocks/ink-guards.test.ts`

**Interfaces:**
- Consumes: `legibleInk` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { ListingBlock } from "./ListingBlock";

const PALE: EmailGlobalStyle = {
  primaryColor: "#F5E6C4", accentColor: "#0b3d4c",
  fontFamily: "MODERN_SANS", textColor: "#1F2937", backdropColor: "#F8FAFC",
};

describe("ListingBlock ink guards", () => {
  it("price never renders a pale primary on the white card (1.2:1)", async () => {
    const out = await render(createElement(ListingBlock, {
      props: { price: "$485,000" },
      globalStyle: PALE,
    }));
    expect(out).not.toContain("color:#F5E6C4");
  });
  it("badge chip ink adapts to a DARK accent fill (hardcoded #06231f would vanish)", async () => {
    const out = await render(createElement(ListingBlock, {
      props: { badge: "JUST LISTED" },
      globalStyle: PALE, // accent #0b3d4c is dark — chip text must go light
    }));
    expect(out).not.toContain("color:#06231f");
  });
  it("'View listing' link guards accent on the card", async () => {
    const out = await render(createElement(ListingBlock, {
      props: { linkUrl: "https://example.com" },
      globalStyle: HOUSE, // teal on white = 2.04
    }));
    expect(out).not.toContain("color:#3DC9C0");
  });
});
```

- [ ] **Step 2: Run to verify failures.**

- [ ] **Step 3: Implement** in `ListingBlock.tsx` (import `legibleInk`; the block's card bg is
`props.sectionBg ?? CARD_BG` at `:43` — bind it once as `const bg = props.sectionBg ?? CARD_BG;`
if not already bound):

```tsx
// :59 badge chip — ink picked FOR the accent fill (replaces hardcoded "#06231f")
color: legibleInk("#06231f", globalStyle.accentColor, 4.5),
// :76 price — 22px/700 = WCAG large text, floor 3
color: legibleInk(globalStyle.primaryColor, bg, 3),
// :112 link — functional text, floor 4.5
color: legibleInk(globalStyle.accentColor, bg, 4.5),
```

`SocialIconsBlock.tsx` — guard the CUSTOM-icon accent only (platform entries keep their brand
colors — logotype territory). At the `colorFor` call site (`:88`), icons sit on `CARD_BG`,
non-text → floor 3:

```tsx
const color = legibleInk(colorFor(entry, props, accent), CARD_BG, 3);
```

- [ ] **Step 4: Run** — task tests PASS + `bun test lib/email/`.

- [ ] **Step 5: Commit**

```bash
git add lib/email/blocks/ListingBlock.tsx lib/email/blocks/SocialIconsBlock.tsx lib/email/blocks/ink-guards.test.ts
git commit -m "feat(email): listing price/badge/link + custom social icons ink-guarded (Fence 6 Task 4)"
```

---

### Task 5: white-ink trio — closes `email_contrast_ink_fence`

**Files:**
- Modify: `lib/email/blocks/ButtonBlock.tsx:18`, `lib/email/blocks/AgentHeroBlock.tsx:66`,
  `lib/email/blocks/HeaderBlock.tsx:39`
- Test: extend `lib/email/blocks/ink-guards.test.ts`

**Interfaces:**
- Consumes: `legibleInk` (Task 1). Same primitive — the trio is the `preferred="#ffffff"` case.
- Produces: closes the check; evidence = the test run.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { ButtonBlock } from "./ButtonBlock";

const GOLD_FILL: EmailGlobalStyle = {
  primaryColor: "#D4AF37", accentColor: "#0b3d4c", // white on #D4AF37 = 2.10
  fontFamily: "MODERN_SANS", textColor: "#1F2937", backdropColor: "#F8FAFC",
};

describe("white-ink trio (email_contrast_ink_fence)", () => {
  it("ButtonBlock label flips to dark ink on a pale gold fill", async () => {
    const out = await render(createElement(ButtonBlock, {
      props: { label: "Schedule a Showing", url: "https://example.com" },
      globalStyle: GOLD_FILL,
    }));
    expect(out).toContain("color:#111827");
    expect(out).not.toContain("color:#ffffff");
  });
  it("ButtonBlock keeps white on the dark house primary (17.19:1)", async () => {
    const out = await render(createElement(ButtonBlock, {
      props: { label: "Schedule a Showing", url: "https://example.com" },
      globalStyle: HOUSE,
    }));
    expect(out).toContain("color:#ffffff");
  });
  it("HeaderBlock company name + AgentHeroBlock name flip on pale fills", async () => {
    const header = await render(createElement(HeaderBlock, {
      props: { companyName: "Gulf Co" }, globalStyle: GOLD_FILL,
    }));
    const hero = await render(createElement(AgentHeroBlock, {
      props: { name: "R. Cooper" }, globalStyle: GOLD_FILL,
    }));
    expect(header).not.toContain("color:#ffffff");
    expect(hero).not.toContain("color:#ffffff");
  });
});
```

(The hero test renders no photo → the `#ffffff50` placeholder text is only emitted with no
`photoUrl` AND no name? — check: the placeholder renders when `photoUrl` is absent, so
`color:#ffffff50` appears; the assertion `not.toContain("color:#ffffff")` would false-fail on the
`#ffffff50` substring. Pass `photoUrl: "https://example.com/p.jpg"` in the hero fixture to skip
the placeholder branch.)

- [ ] **Step 2: Run to verify failures.**

- [ ] **Step 3: Implement**

```tsx
// ButtonBlock.tsx:18 (15px/600 = normal text, floor 4.5; bg bound at :15)
color: legibleInk("#ffffff", bg, 4.5),
// HeaderBlock.tsx:39 (companyName 18px/700 ≈ 13.5pt bold < 14pt — functional, floor 4.5)
color: legibleInk("#ffffff", bg, 4.5),
// AgentHeroBlock.tsx:66 (name 22px/800 = large text, floor 3)
color: legibleInk("#ffffff", globalStyle.primaryColor, 3),
```

- [ ] **Step 4: Run** — task tests PASS + `bun test lib/email/`.

- [ ] **Step 5: Commit + close the check**

```bash
git add lib/email/blocks/ButtonBlock.tsx lib/email/blocks/HeaderBlock.tsx lib/email/blocks/AgentHeroBlock.tsx lib/email/blocks/ink-guards.test.ts
git commit -m "fix(email): white-ink trio routed through legibleInk — closes email_contrast_ink_fence"
node scripts/check.mjs close email_contrast_ink_fence --evidence "ink-guards.test.ts: white on #D4AF37 (2.10:1) flips to #111827 at all three sites; white kept on #0f1d24 (17.19:1). bun test lib/email/ green at <commit>."
```

---

### Task 6: Tier B — pure evaluator `evaluateSchemeContrast`

**Files:**
- Create: `lib/brand/palette-contrast.ts`
- Test: `lib/brand/palette-contrast.test.ts` (create)

**Interfaces:**
- Consumes: `contrastRatio`, `parseHex` from `@/lib/charts/palette`; `BrandPalette` scheme shape
  `[primary, accent, text, background]` from `lib/brand/palette.ts`.
- Produces: `interface SchemeWarning { surface: string; ratio: number; floor: number; consequence: string }`
  and `evaluateSchemeContrast(scheme: [string, string, string, string]): SchemeWarning[]`.
  Task 7 renders these verbatim.

- [ ] **Step 1: Write the failing test**

```ts
// lib/brand/palette-contrast.test.ts
import { describe, expect, it } from "bun:test";
import { evaluateSchemeContrast } from "./palette-contrast";

describe("evaluateSchemeContrast", () => {
  it("flags the live house-default failures (accent on white 2.04, footer 1.95)", () => {
    const w = evaluateSchemeContrast(["#0f1d24", "#3DC9C0", "#1F2937", "#F8FAFC"]);
    const surfaces = w.map((x) => x.surface);
    expect(surfaces).toContain("accent links on white cards");
    expect(surfaces).toContain("accent links in the footer");
    // and does NOT flag the passing pairs
    expect(surfaces).not.toContain("accent text on your primary color"); // 8.44
    expect(surfaces).not.toContain("white text on your primary color"); // 17.19
  });
  it("flags accent==primary as invisible-on-header", () => {
    const w = evaluateSchemeContrast(["#1B3A5C", "#1B3A5C", "#1F2937", "#F8FAFC"]);
    expect(w.some((x) => x.surface === "accent text on your primary color" && x.ratio < 1.05)).toBe(true);
  });
  it("uses the large-text floor (3) for primary-as-price ink", () => {
    // #B8860B on white = 3.25 → passes floor 3, so NO warning for the price surface
    const w = evaluateSchemeContrast(["#B8860B", "#0f1d24", "#1F2937", "#F8FAFC"]);
    expect(w.some((x) => x.surface === "price and headline text in your primary color")).toBe(false);
  });
  it("skips pairs with empty or non-hex slots and returns [] for an empty scheme", () => {
    expect(evaluateSchemeContrast(["", "", "", ""])).toEqual([]);
    expect(evaluateSchemeContrast(["#0f1d24", "", "#1F2937", ""]).every((x) => !!x.surface)).toBe(true);
  });
  it("ratios reproduce the repo's contrastRatio to 2dp", () => {
    const w = evaluateSchemeContrast(["#0f1d24", "#3DC9C0", "#1F2937", "#F8FAFC"]);
    const onWhite = w.find((x) => x.surface === "accent links on white cards");
    expect(onWhite?.ratio).toBeCloseTo(2.04, 2);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/brand/palette-contrast.ts — Fence 6 Tier B: pure scheme-contrast evaluator.
//
// Evaluates ONLY the pairs the email renderer actually creates (spec §3). Pure +
// side-effect free: the BrandingBlock strip renders the result; nothing blocks a
// save, nothing rewrites a color. Empty/non-hex slots skip (never refuse a build).
// Floors: WCAG AA — 4.5 functional text, 3 large text (spec D3, verified via
// WebAIM https://webaim.org 07/09/2026).
import { contrastRatio, parseHex } from "@/lib/charts/palette";

export interface SchemeWarning {
  surface: string; // plain-language place the pair shows up
  ratio: number; // WCAG ratio, raw (UI rounds)
  floor: number; // the floor it missed
  consequence: string; // what the render guards will do about it
}

const CARD = "#ffffff";
const FOOTER = "#F9FAFB";

/** scheme = [primary, accent, text, background] (lib/brand/palette.ts slot order). */
export function evaluateSchemeContrast(
  scheme: [string, string, string, string],
): SchemeWarning[] {
  const [primary, accent, text, backdrop] = scheme;
  const out: SchemeWarning[] = [];
  const check = (
    ink: string,
    bg: string,
    floor: number,
    surface: string,
    consequence: string,
  ) => {
    if (!parseHex(ink) || !parseHex(bg)) return; // empty/non-hex slot → skip, never block
    const ratio = contrastRatio(ink, bg);
    if (ratio < floor) out.push({ surface, ratio, floor, consequence });
  };

  check(accent, primary, 4.5, "accent text on your primary color",
    "taglines on headers will use white or dark ink instead of your accent");
  check(accent, CARD, 4.5, "accent links on white cards",
    "links will use a darker ink so they stay readable");
  check(accent, FOOTER, 4.5, "accent links in the footer",
    "footer links will use a darker ink so they stay readable");
  check("#ffffff", primary, 4.5, "white text on your primary color",
    "headers and buttons will use dark ink instead of white");
  check("#ffffff", accent, 4.5, "text on your accent color",
    "badges will pick a readable ink automatically");
  check(text, backdrop, 4.5, "your text color on your background",
    "body copy may be hard to read - consider a darker text color");
  check(primary, CARD, 3, "price and headline text in your primary color",
    "large numbers will use a darker ink when needed");
  return out;
}
```

- [ ] **Step 4: Run** — `bun test lib/brand/palette-contrast.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/brand/palette-contrast.ts lib/brand/palette-contrast.test.ts
git commit -m "feat(brand): evaluateSchemeContrast — pure WCAG pair evaluator (Fence 6 Task 6)"
```

---

### Task 7: Tier B — `PaletteContrastStrip` in the brand form

**Files:**
- Create: `components/brand/PaletteContrastStrip.tsx`
- Modify: `components/brand/BrandingBlock.tsx` (mount between the color-slot grid close `:414`
  and the Saved-palettes header `:416`)
- Test: `components/brand/PaletteContrastStrip.test.tsx` (create)

**Interfaces:**
- Consumes: `evaluateSchemeContrast`, `SchemeWarning` (Task 6); `currentScheme` already derived at
  `BrandingBlock.tsx:161`.
- Produces: `<PaletteContrastStrip scheme={currentScheme} />` — presentational only.

- [ ] **Step 1: Write the failing test**

```tsx
// components/brand/PaletteContrastStrip.test.tsx
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PaletteContrastStrip } from "./PaletteContrastStrip";

describe("PaletteContrastStrip", () => {
  it("lists failing pairs in plain language with rounded ratios", () => {
    const html = renderToStaticMarkup(
      createElement(PaletteContrastStrip, { scheme: ["#0f1d24", "#3DC9C0", "#1F2937", "#F8FAFC"] }),
    );
    expect(html).toContain("accent links on white cards");
    expect(html).toContain("2.0:1"); // rounded, not raw float
    expect(html).toContain("4.5:1");
  });
  it("renders nothing for a passing scheme", () => {
    const html = renderToStaticMarkup(
      createElement(PaletteContrastStrip, { scheme: ["#0f1d24", "#8ff0e9", "#1F2937", "#ffffff"] }),
    );
    expect(html).toBe("");
  });
  it("caps at 3 rows and counts the rest", () => {
    const html = renderToStaticMarkup(
      createElement(PaletteContrastStrip, { scheme: ["#F5E6C4", "#FFF8E1", "#dddddd", "#eeeeee"] }),
    );
    expect(html).toMatch(/\+\d+ more/);
  });
});
```

(If the second fixture's accent trips an unexpected pair at implementation time, verify with a
one-line `bun -e` `contrastRatio` call and swap in a passing hex — the assertion is "passing
scheme renders nothing," not that specific hex.)

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```tsx
// components/brand/PaletteContrastStrip.tsx — Fence 6 Tier B warn strip. PURE
// derived render (no state, no effects — react-hooks/set-state-in-effect is a
// hard error here). Warns; NEVER blocks a save or rewrites a color.
import { evaluateSchemeContrast } from "@/lib/brand/palette-contrast";

const SHOW = 3;

export function PaletteContrastStrip({
  scheme,
}: {
  scheme: [string, string, string, string];
}) {
  const warnings = evaluateSchemeContrast(scheme);
  if (warnings.length === 0) return null;
  const shown = warnings.slice(0, SHOW);
  const rest = warnings.length - shown.length;
  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
      {shown.map((w) => (
        <p key={w.surface} className="text-[10px] leading-4 text-amber-200">
          ⚠ Hard to read: {w.surface} ({w.ratio.toFixed(1)}:1 — comfortable is {w.floor}:1).
          Sent emails adjust automatically: {w.consequence}.
        </p>
      ))}
      {rest > 0 ? <p className="text-[10px] text-amber-200/70">+{rest} more</p> : null}
    </div>
  );
}
```

Mount in `BrandingBlock.tsx` — import at top
(`import { PaletteContrastStrip } from "./PaletteContrastStrip";`), then between the color-slot
grid's closing `</div>` (`:414`) and the Saved-palettes header block (`:416`):

```tsx
<PaletteContrastStrip scheme={currentScheme} />
```

(`currentScheme` is already computed at `:161`; re-render on every color edit is automatic.)

- [ ] **Step 4: Run** — `bun test components/brand/` PASS, then `bun test lib/ components/` for
drift, then **`bunx next build`** (the memory-locked verification — BrandingBlock is a client
component; the build catches JSX/import errors bun tests can't).

- [ ] **Step 5: Commit**

```bash
git add components/brand/PaletteContrastStrip.tsx components/brand/PaletteContrastStrip.test.tsx components/brand/BrandingBlock.tsx
git commit -m "feat(brand): palette contrast warn strip in the ONE brand form (Fence 6 Task 7)"
```

---

### Task 8: Ledger close-out

**Files:**
- Modify: `SESSION_LOG.md` (new top entry), checks via `scripts/check.mjs`

- [ ] **Step 1:** `bun test lib/email/ lib/brand/ components/brand/` — full green, and
`bunx next build` green (if not already run in Task 7 Step 4 with no code changed since).
- [ ] **Step 2:** Close/update checks:

```bash
node scripts/check.mjs close email_accent_ink_palette_gate --evidence "Fence 6 shipped: legibleInk + 11-site rewiring (ink-guards.test.ts) + evaluateSchemeContrast + PaletteContrastStrip in BrandingBlock. bun test + next build green at <commit>."
node scripts/check.mjs update email_accent_ink_palette_gate_live_verify --detail "Code shipped <date>; awaiting live grid-lab proof: hostile palette renders legible ink at all audit sites AND the warn strip lists failing pairs without blocking save. Operator-run or browser-verified session."
```

(`email_contrast_ink_fence` already closed in Task 5. The `_live_verify` check stays OPEN until
verified against the running lab.)
- [ ] **Step 3:** SESSION_LOG entry (what shipped, test counts, what's next), commit with the
ledger files, show `git log`, ask about push (standing rule: no autonomous push).

---

## Self-review (spec coverage)

- Spec §3 Tier A table: rows 1-2 → Task 2 · rows 3-6, 9 → Task 3 · rows 7-8, 10 → Task 4 ·
  border rows → LEAVE (constraint block). White-ink trio → Task 5. ✓
- Spec §3 Tier B: evaluator → Task 6 · strip → Task 7 · "what does NOT change" → constraints. ✓
- Spec §5 testing: measured-ratio unit tests (Task 1), hostile-palette render tests (2-5),
  evaluator pair tests (6), strip tests (7). ✓
- D1 warn-only / D2 form+pure lib / D3 floors / D4 tiers-as-separate-commits: all encoded. ✓
