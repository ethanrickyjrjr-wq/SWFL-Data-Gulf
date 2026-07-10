# Public /guides Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 21 files, keywords: schema, architecture, breaking

**Spec:** `docs/superpowers/specs/2026-07-09-guides-hub-design.md` · **Check:** `guides_hub_live_verify` (already open)

**Goal:** A public, SEO-visible `/guides` hub with three flagship pieces (sourcing methodology, email design philosophy, hidden builder features), built from already-committed real artifacts, wired into nav/footer/sitemap plus one homepage strip.

**Architecture:** Typed content registry (`lib/guides/`) rendered by one article template (`components/guides/`) through two routes (`app/guides/page.tsx` hub + `app/guides/[slug]/page.tsx` statically generated). All figures reuse committed assets under `public/showcase/seed-previews/` — provenance copied verbatim from that folder's `assets/README.md`, never invented. A bun:test registry suite enforces the content invariants mechanically.

**Tech Stack:** Next.js App Router (server components only — no `"use client"` anywhere in this build), Tailwind with the existing `gulf-*`/`text-*` tokens, bun:test.

## Global Constraints

- Copy rules (spec §4): plain English; NEVER the words "fence", "pack", "brain", "master", "lane", "data lake", or "ZIP-level" in user-facing copy. Enforced by a registry test.
- No figure without a real source. Chart/photo provenance comes verbatim from `public/showcase/seed-previews/assets/README.md`. As-of dates MM/DD/YYYY.
- No competitor trash-talk. The "AI emails all look the same" hook cites the research finding ("AI design output reverts to generic defaults unless mechanically prevented"), never a competitor.
- Layout: `h-full`/`dvh` only, never `h-screen`.
- Verification command is `bunx next build` (house rule — never `npx tsc`).
- Stage explicit paths only (never `git add -A`). Commit per task. Do NOT push — pushing is the operator's call at the end (show `git log`, then stop).
- Visual language: mirror `/showcase` (`components/PageShell.tsx`, tokens `text-text-primary`, `text-text-secondary`, `border-gulf-haze`, `bg-gulf-deep`, `text-gulf-teal`, `bg-gulf-teal`, `text-text-on-accent`) for the hub/article; mirror `home-explorer.css` CSS-variable classes for the homepage strip.
- Every lab-pointing href imports `EMAIL_LAB_LANDING` from `@/lib/lab-entry/destination` (the sanctioned door-pin constant, value `/email-lab`) — never a string literal.

---

### Task 1: Types, registry, registry test, and Guide 1 content

**Files:**
- Create: `lib/guides/types.ts`
- 🔴 Create: `lib/guides/registry.ts`
- Create: `lib/guides/sourced-numbers.ts`
- Test: `lib/guides/registry.test.ts`

**Interfaces:**
- Consumes: `EMAIL_LAB_LANDING` from `@/lib/lab-entry/destination` (existing, value `"/email-lab"`).
- Produces: `GuideDef`, `GuideSection`, `ArtifactFigure`, `TryIt` types; `GUIDES: GuideDef[]` and `guideBySlug(slug: string): GuideDef | undefined` from `@/lib/guides/registry`. Tasks 2–7 rely on these exact names.

- [ ] **Step 1: Write the failing test**

Create `lib/guides/registry.test.ts`. Mirrors the house pattern in `lib/email/doc/seed-previews.test.ts` (existsSync against `public/`).

```ts
import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GUIDES, guideBySlug } from "./registry";

/**
 * The registry is the single source of truth for /guides. These tests are the
 * mechanical form of the spec's copy + sourcing rules: a guide that references
 * a missing asset, an undated figure, an unknown deep link, or an internal
 * noun must be a red test here, never a broken page in prod.
 */

const AS_OF = /^\d{2}\/\d{2}\/\d{4}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Known public route prefixes a tryIt CTA may point at.
const TRY_IT_ROUTES = ["/email-lab", "/showcase", "/ask", "/charts"];
// Spec §4: internal nouns never reach user-facing copy.
const FORBIDDEN_NOUNS = /\b(fence|pack|brain|master|lane|data lake|zip-level)\b/i;

describe("guides registry", () => {
  it("holds at least one guide, slugs unique and kebab-case", () => {
    expect(GUIDES.length).toBeGreaterThan(0);
    const slugs = GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(KEBAB);
  });

  it("guideBySlug resolves every slug and rejects unknowns", () => {
    for (const g of GUIDES) expect(guideBySlug(g.slug)).toBe(g);
    expect(guideBySlug("nope")).toBeUndefined();
  });

  it("section ids are unique within each guide (every TOC anchor resolves)", () => {
    for (const g of GUIDES) {
      const ids = g.sections.map((s) => s.id);
      expect(new Set(ids).size, `duplicate section id in "${g.slug}"`).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(KEBAB);
    }
  });

  it("every figure src and cardImage exists under public/", () => {
    const assertExists = (src: string, where: string) => {
      expect(src.startsWith("/"), `${where}: src must start with /`).toBe(true);
      expect(
        existsSync(join(process.cwd(), "public", src)),
        `missing asset: ${src} (${where})`,
      ).toBe(true);
    };
    for (const g of GUIDES) {
      assertExists(g.cardImage, `${g.slug} cardImage`);
      for (const s of g.sections) {
        if (s.figure) assertExists(s.figure.src, `${g.slug}#${s.id}`);
      }
    }
  });

  it("every figure carries provenance and an MM/DD/YYYY as-of date", () => {
    for (const g of GUIDES) {
      for (const s of g.sections) {
        if (!s.figure) continue;
        expect(s.figure.provenance.length, `${g.slug}#${s.id}`).toBeGreaterThan(0);
        expect(s.figure.asOf, `${g.slug}#${s.id}`).toMatch(AS_OF);
      }
    }
  });

  it("every tryIt href points at a known public route", () => {
    const check = (href: string, where: string) =>
      expect(
        TRY_IT_ROUTES.some((r) => href === r || href.startsWith(r + "/") || href.startsWith(r + "?")),
        `unknown tryIt route ${href} (${where})`,
      ).toBe(true);
    for (const g of GUIDES) {
      check(g.tryIt.href, g.slug);
      for (const s of g.sections) {
        if (s.tryIt) check(s.tryIt.href, `${g.slug}#${s.id}`);
      }
    }
  });

  it("copy carries no internal nouns (spec §4)", () => {
    for (const g of GUIDES) {
      expect(JSON.stringify(g), `internal noun leaked in "${g.slug}"`).not.toMatch(FORBIDDEN_NOUNS);
    }
  });

  it('kind "guide" pieces carry expect bullets and a hook', () => {
    for (const g of GUIDES) {
      expect(g.hook.length).toBeGreaterThan(0);
      expect(g.description.length).toBeGreaterThan(0);
      if (g.kind === "guide") expect(g.expect.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/guides/registry.test.ts`
Expected: FAIL — `Cannot find module './registry'`

- [ ] **Step 3: Write the types**

Create `lib/guides/types.ts`:

```ts
/**
 * Content model for the public /guides hub (spec:
 * docs/superpowers/specs/2026-07-09-guides-hub-design.md §1). Pure data — the
 * article template in components/guides/ renders these; registry.test.ts
 * enforces the invariants (asset existence, as-of format, no internal nouns).
 */

export interface ArtifactFigure {
  /** Path under public/, leading slash. Reuse committed showcase assets only. */
  src: string;
  alt: string;
  /** Reader-facing caption — what the figure shows, plain English. */
  caption: string;
  /** Named source, copied verbatim from public/showcase/seed-previews/assets/README.md. */
  provenance: string;
  /** MM/DD/YYYY. */
  asOf: string;
}

export interface TryIt {
  label: string;
  href: string;
}

export interface GuideSection {
  /** Anchor id — kebab-case, unique within the guide. */
  id: string;
  heading: string;
  /** Figma-style italic tagline: “Best for …”. */
  bestFor?: string;
  /** Paragraphs. */
  body: string[];
  proTips?: string[];
  figure?: ArtifactFigure;
  tryIt?: TryIt;
}

export interface GuideDef {
  slug: string;
  title: string;
  kind: "guide" | "tips";
  /** Card copy (hub cards, homepage strip, meta description). 1–2 sentences. */
  description: string;
  /** Card art + OG image. Webp capture under public/. */
  cardImage: string;
  /** Pain-point intro paragraph. */
  hook: string;
  /** “Here’s what you can expect” bullets. May be empty for kind "tips". */
  expect: string[];
  sections: GuideSection[];
  /** Article-level closing CTA. */
  tryIt: TryIt;
}
```

- [ ] **Step 4: Write Guide 1 content**

Create `lib/guides/sourced-numbers.ts`. Figure provenance below is copied from `public/showcase/seed-previews/assets/README.md` — if you change a figure, re-copy its provenance from there.

```ts
import { EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";
import type { GuideDef } from "./types";

export const SOURCED_NUMBERS: GuideDef = {
  slug: "sourced-numbers",
  title: "Where every number comes from",
  kind: "guide",
  description:
    "The four places a figure in your email can come from — and why an invented one can't happen.",
  cardImage: "/showcase/seed-previews/weekly-pulse.webp",
  hook:
    "One made-up number in a client email can cost the relationship. So the whole system is built around a single rule: every figure names a real source, or it doesn't ship.",
  expect: [
    "The four places a number can come from, and the order we try them",
    "Why the math is computed in code — the AI only writes the words",
    "What happens when we don't hold a number (the gap gets filled, never faked)",
    "How sources and as-of dates travel with every send",
  ],
  sections: [
    {
      id: "four-sources",
      heading: "The four places a number can come from",
      bestFor: "understanding what “sourced” actually means here",
      body: [
        "Every figure in an email we build for you comes from one of four places, tried in this order: our own Southwest Florida dataset, a document you upload, a named public source on the web, or a figure you hand us directly.",
        "When the first source doesn't hold the number you need, we move to the next one — your upload, then a cited public source, then you. The order protects quality; the fallbacks protect coverage. What never happens is a fifth option where the AI just writes a plausible-sounding number.",
      ],
      figure: {
        src: "/showcase/seed-previews/assets/chart-lee-median-asking.svg",
        alt: "Line chart of Lee County median asking price by month, June 2025 through June 2026",
        caption:
          "Median asking price in Lee County, monthly, 06/2025 through 06/2026 — the kind of figure that comes from the first source: data we hold and refresh ourselves.",
        provenance: "Realtor.com residential listing data via FRED",
        asOf: "07/09/2026",
      },
    },
    {
      id: "computed-not-written",
      heading: "The math is computed, the words are written",
      bestFor: "anyone worried the AI will make up their market stats",
      body: [
        "The AI never does arithmetic. Every median, count, and percent change is computed in code from source rows before the AI sees anything. By the time words are being written, the numbers are already fixed.",
        "That division of labor is the whole trick: code is good at math and bad at prose; the AI is good at prose and untrusted with math. Each side only does the part it's reliable at.",
      ],
      figure: {
        src: "/showcase/seed-previews/assets/chart-lee-sales-by-month.svg",
        alt: "Bar chart of recorded sales per month in Lee County, May 2025 through April 2026",
        caption:
          "Recorded sales per month in Lee County, 05/2025 through 04/2026, computed from county records — arm's-length sales of $10,000 and up.",
        provenance: "Lee County Property Appraiser recorded sales",
        asOf: "05/30/2026",
      },
    },
    {
      id: "gaps-fill",
      heading: "A gap gets filled, never invented",
      bestFor: "hyper-local sends where public data thins out",
      body: [
        "Ask for a figure we don't hold at that level of detail, and the system doesn't refuse the email — and doesn't guess. It moves down the list: a document you've uploaded, then a named public source we cite, then a figure you give us.",
        "Tell the builder “our team's average days on market is 12” and that 12 gets used — attributed to you, not dressed up as an official statistic. Provenance stays honest at every step.",
      ],
      proTips: [
        "You can hand the builder a figure mid-conversation. It gets used immediately and attributed as yours.",
      ],
    },
    {
      id: "citations-ride",
      heading: "Sources and dates ride with the send",
      bestFor: "brokers who get asked “where did that stat come from?”",
      body: [
        "Every email carries its list of sources, and every figure carries the date it was true — written out as a date (07/09/2026), never “recent” or “the latest”.",
        "When a reader questions a number, you have the receipt: which source, as of when.",
      ],
      figure: {
        src: "/showcase/seed-previews/assets/chart-pmms-rate.svg",
        alt: "Line chart of the 30-year fixed mortgage rate, weekly, July 2025 through July 2026",
        caption:
          "30-year fixed mortgage rate, weekly, 07/03/2025 through 07/09/2026 — a public-source figure that ships with its citation attached.",
        provenance: "Freddie Mac Primary Mortgage Market Survey (freddiemac.com/pmms)",
        asOf: "07/09/2026",
      },
    },
  ],
  tryIt: { label: "Build one free and open its sources list", href: EMAIL_LAB_LANDING },
};
```

- [ ] **Step 5: Write the registry**

Create `lib/guides/registry.ts`:

```ts
import type { GuideDef } from "./types";
import { SOURCED_NUMBERS } from "./sourced-numbers";

/** Ordered — hub cards, homepage strip, and sitemap all render this order. */
export const GUIDES: GuideDef[] = [SOURCED_NUMBERS];

export function guideBySlug(slug: string): GuideDef | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test lib/guides/registry.test.ts`
Expected: PASS (all assertions green)

- [ ] **Step 7: Commit**

```bash
git add lib/guides/types.ts lib/guides/registry.ts lib/guides/sourced-numbers.ts lib/guides/registry.test.ts
git commit -m "feat(guides): typed guide registry + sourced-numbers flagship content"
```

---

### Task 2: Guide 2 content — email design philosophy

**Files:**
- Create: `lib/guides/email-design.ts`
- 🔴 Modify: `lib/guides/registry.ts`

**Interfaces:**
- Consumes: `GuideDef` from `./types` (Task 1).
- Produces: `EMAIL_DESIGN: GuideDef`, registered second in `GUIDES`.

- [ ] **Step 1: Write the content**

Create `lib/guides/email-design.ts`:

```ts
import type { GuideDef } from "./types";

export const EMAIL_DESIGN: GuideDef = {
  slug: "email-design",
  title: "Why our emails look the way they do",
  kind: "guide",
  description:
    "AI-built emails famously drift toward the same generic look. Ours structurally can't — here's the design system that prevents it.",
  cardImage: "/showcase/seed-previews/magazine-issue.webp",
  hook:
    "Published research on AI design tools found their output reverts to generic defaults unless something mechanically prevents it. We took that finding literally: our layout rules are enforced in code, so the polish isn't a matter of taste on a given day — it's structural.",
  expect: [
    "Why every layout sits on a 12-column grid with a short list of allowed proportions",
    "Why the headline figure leads — structure built for the skim",
    "How your brand colors are applied without breaking readability",
    "Photo ratios that match how listings are actually shot",
    "The send mechanics handled for you: scheduling, tracked links, one-click unsubscribe",
  ],
  sections: [
    {
      id: "the-grid",
      heading: "A 12-column grid, a short list of proportions",
      bestFor: "understanding why the layouts feel composed, not assembled",
      body: [
        "Every layout in the builder snaps to a 12-column grid, and blocks can only take a small set of allowed widths. You can't drag something to 37% and make it lopsided — the option doesn't exist.",
        "Constraint is where the polish comes from. Proportions that read as intentional are the only proportions on offer, which is why two emails built by two different agents both still look finished.",
      ],
      figure: {
        src: "/showcase/seed-previews/just-sold-grid.webp",
        alt: "A just-sold email laid out on the 12-column grid",
        caption: "A just-sold layout on the grid, filled with cited Southwest Florida figures.",
        provenance: "SWFL Data Gulf builder output",
        asOf: "07/09/2026",
      },
    },
    {
      id: "headline-number",
      heading: "The headline figure comes first",
      bestFor: "getting read in a three-second inbox scan",
      body: [
        "The figure your reader cares about leads the email; the story follows it. Most emails get a skim, not a read — structure for the skim and the read takes care of itself.",
      ],
      figure: {
        src: "/showcase/seed-previews/weekly-pulse.webp",
        alt: "A weekly market email leading with headline figures and charts",
        caption: "A weekly market read: headline figures first, then the story — every number cited.",
        provenance: "SWFL Data Gulf builder output",
        asOf: "07/09/2026",
      },
    },
    {
      id: "color-discipline",
      heading: "Brand colors, with a readability floor",
      bestFor: "strong brand colors that stay legible",
      body: [
        "Your brand colors are applied everywhere they can be — headers, buttons, accents — but always above a contrast floor. When a brand color would leave text unreadable on a background, the system shifts to the nearest readable version instead of shipping it.",
        "You never have to know what a contrast ratio is. You just never get the email where pale yellow text sits on white.",
      ],
    },
    {
      id: "photo-ratios",
      heading: "Photos at the ratios listings are shot in",
      bestFor: "MLS photos that never look stretched or oddly cropped",
      body: [
        "Property photos hold the standard listing ratios (3:2 and 4:3) and headshots hold portrait framing (4:5), so nothing gets stretched, squashed, or awkwardly cropped on the way in.",
      ],
      figure: {
        src: "/showcase/seed-previews/listing-feature.webp",
        alt: "A listing feature email with full-width property photography",
        caption: "Listing photography held at standard ratios in a feature layout.",
        provenance: "SWFL Data Gulf builder output",
        asOf: "07/09/2026",
      },
    },
    {
      id: "send-mechanics",
      heading: "The send mechanics you stop thinking about",
      bestFor: "set-and-schedule campaigns",
      body: [
        "Scheduling, link tracking, one-click unsubscribe, and your business address in the footer are all handled on every send — no checklist, no plugin, nothing to remember at 9pm on a Thursday.",
      ],
    },
  ],
  tryIt: { label: "Open a template from the showcase", href: "/showcase" },
};
```

**Copy verification before committing (spec §5 — claims must match the product):** each design claim above must be confirmed in code; soften or cut any that don't hold.
- 12-column grid + blessed widths → `lib/email/doc/schema.ts` / grid layout types (grep `12` column span types, `span` enums).
- Contrast floor / readable shift → `lib/email/blocks/ink-guards.test.ts`, `legibleInk` (commit c369b404).
- Photo ratios 3:2 / 4:3 / 4:5 → grep `aspect` in `lib/email/blocks/` (`ImageBlock.tsx`, `AgentHeroBlock.tsx`). If the exact ratios differ, correct the copy to the ratios actually enforced.
- One-click unsubscribe + address in footer → `lib/email/` footer block + CAN-SPAM note in `lib/email/CLAUDE.md`.

- [ ] **Step 2: Register it**

In `lib/guides/registry.ts`:

```ts
import type { GuideDef } from "./types";
import { SOURCED_NUMBERS } from "./sourced-numbers";
import { EMAIL_DESIGN } from "./email-design";

/** Ordered — hub cards, homepage strip, and sitemap all render this order. */
export const GUIDES: GuideDef[] = [SOURCED_NUMBERS, EMAIL_DESIGN];
```

- [ ] **Step 3: Run tests**

Run: `bun test lib/guides/registry.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/guides/email-design.ts lib/guides/registry.ts
git commit -m "feat(guides): email-design flagship content"
```

---

### Task 3: Guide 3 content — builder tips (verify each tip in code, cut what fails)

**Files:**
- Create: `lib/guides/builder-tips.ts`
- 🔴 Modify: `lib/guides/registry.ts`

**Interfaces:**
- Consumes: `GuideDef` from `./types`; `EMAIL_LAB_LANDING`; `SEED_PREVIEWS` from `@/lib/email/doc/seed-previews` (existing array — its `.length` keeps the layout count honest).
- Produces: `BUILDER_TIPS: GuideDef`, registered third. Title count is computed from surviving sections.

- [ ] **Step 1: Verify every tip candidate in code — cut, don't soften**

The spec is explicit: anything unconfirmed is CUT. Anchors found during planning (07/09/2026) — open each and confirm the claim before writing its copy:

1. Image links: `lib/email/blocks/ImageBlock.tsx` + `linkUrl` in `lib/email/doc/schema.ts`. For the "clicks are tracked" clause, confirm the send path wraps links (grep `api/r` in `lib/email/` and `app/api/lab/claim-and-send/route.ts`; `link_events` is the click table). If wrapping isn't confirmed for image links specifically, keep the link claim, cut the tracking clause.
2. Chart your own figure/upload: `buildChartForQuestion` in `lib/email/build-doc.ts` (user-figure + upload lanes per `lib/email/CLAUDE.md`).
3. Send-to-self: `components/email-lab/SendToSelfModal.tsx`.
4. Schedule + social calendar: `components/email-lab/ScheduleSendModal.tsx`, `components/email-lab/SocialCalendarPanel.tsx`.
5. Brand once: `lib/email/brand/apply-brand.ts` (+ `apply-brand-style.ts`).
6. PDF twin: `app/api/deliverables/[id]/pdf/route.ts`.
7. Phone builder: `lib/email/lab/phone-tabs.ts` + phone-first layout in `components/email-lab/EmailLabGridShell.tsx` (lines ~242–248, ~991+).
8. Starting layouts: `lib/email/doc/seed-previews.ts` `SEED_PREVIEWS` (count imported, self-verifying).
9. Undo/redo: `lib/email/doc/history.ts`.
10. In-lab photo editing: `components/email-lab/FilerobotModal.tsx` + `PhotopeaModal.tsx`.

Also confirm tier availability in `lib/email/lab/capabilities.ts` (`FEATURE_ROUTING`): if a tip's feature is routed `"paid-only"`, say so in its copy in plain words ("on paid plans") rather than cutting it.

- [ ] **Step 2: Write the content (surviving tips only)**

Create `lib/guides/builder-tips.ts`. Drop the section for any tip that failed Step 1; the title recounts itself.

```ts
import { EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";
import { SEED_PREVIEWS } from "@/lib/email/doc/seed-previews";
import type { GuideDef, GuideSection } from "./types";

const TIPS: GuideSection[] = [
  {
    id: "image-links",
    heading: "Any image can be a link — and clicks are counted",
    body: [
      "Every image block can carry a destination link: tap the photo, land on the listing. Clicks are tracked per send, so you know which photo did the work.",
    ],
  },
  {
    id: "chart-your-figure",
    heading: "Chart a figure only you have",
    body: [
      "Hand the builder a number of your own — “our average days on market is 12” — or upload a document, and it charts it, attributed to you. Your data is as chartable as ours.",
    ],
  },
  {
    id: "send-to-self",
    heading: "Send it to yourself first",
    body: [
      "One click sends the draft to your own inbox, so you check it where your clients will read it — real mail app, real rendering — before anyone else sees it.",
    ],
  },
  {
    id: "schedule-and-social",
    heading: "Schedule sends and plan socials on one calendar",
    body: [
      "Emails can be scheduled ahead, and the social calendar plans the matching posts alongside them. One campaign, one timeline.",
    ],
  },
  {
    id: "brand-once",
    heading: "Set your brand once",
    body: [
      "Colors, logo, headshot, contact details: set them one time and every email, template, and export picks them up automatically.",
    ],
  },
  {
    id: "pdf-twin",
    heading: "Every email is also a PDF",
    body: [
      "The same document exports as a print-ready PDF — leave-behinds, listing presentations, a printed farm piece — without rebuilding anything.",
    ],
  },
  {
    id: "phone-builder",
    heading: "The whole builder works on your phone",
    body: [
      "The builder is laid out phone-first — preview and edit tabs sized for a phone screen — so you can fix a typo or approve a send from anywhere.",
    ],
  },
  {
    id: "starting-layouts",
    heading: `${SEED_PREVIEWS.length} starting layouts, already filled`,
    body: [
      "The showcase holds every layout filled with live Southwest Florida figures, so you see what each becomes before you pick it. Start from one and the AI refills it with your area, your brand, your voice.",
    ],
    tryIt: { label: "Browse the layouts", href: "/showcase" },
  },
  {
    id: "undo-redo",
    heading: "Undo anything",
    body: [
      "Every edit is history-tracked — undo and redo work the way they should, so experimenting with a layout costs nothing.",
    ],
  },
  {
    id: "photo-editing",
    heading: "Edit photos without leaving",
    body: [
      "Crop, retouch, and adjust photos inside the builder — two built-in photo editors, no round trip through other software.",
    ],
  },
];

export const BUILDER_TIPS: GuideDef = {
  slug: "builder-tips",
  title: `${TIPS.length} things the builder does that you might miss`,
  kind: "tips",
  description:
    "Small features that don't get a tour — click tracking, self-previews, PDF twins, and more.",
  cardImage: "/showcase/seed-previews/agent-spotlight.webp",
  hook:
    "The builder does a lot quietly. These are the features people find in week three and wish they'd known on day one.",
  expect: [],
  sections: TIPS,
  tryIt: { label: "Open the builder and poke around", href: EMAIL_LAB_LANDING },
};
```

- [ ] **Step 3: Register it**

In `lib/guides/registry.ts`:

```ts
import type { GuideDef } from "./types";
import { SOURCED_NUMBERS } from "./sourced-numbers";
import { EMAIL_DESIGN } from "./email-design";
import { BUILDER_TIPS } from "./builder-tips";

/** Ordered — hub cards, homepage strip, and sitemap all render this order. */
export const GUIDES: GuideDef[] = [SOURCED_NUMBERS, EMAIL_DESIGN, BUILDER_TIPS];
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/guides/registry.test.ts`
Expected: PASS. (If the forbidden-noun test trips, the leak is real — fix the copy, not the test.)

- [ ] **Step 5: Commit**

```bash
git add lib/guides/builder-tips.ts lib/guides/registry.ts
git commit -m "feat(guides): builder-tips content — every tip verified in code"
```

---

### Task 4: Article components

**Files:**
- Create: `components/guides/ArtifactFigure.tsx`
- Create: `components/guides/GuideBits.tsx` (BestFor + ProTip + TryIt — three tiny presentational pieces, one file)
- Create: `components/guides/GuideToc.tsx`
- Create: `components/guides/GuideCard.tsx`
- Create: `components/guides/GuideArticle.tsx` (shell composing everything + related-guides footer)

**Interfaces:**
- Consumes: `GuideDef`, `GuideSection`, `ArtifactFigure as ArtifactFigureDef`, `TryIt as TryItDef` types from `@/lib/guides/types`; `GUIDES` from `@/lib/guides/registry`.
- Produces: `<GuideArticle guide={GuideDef} />` and `<GuideCard guide={GuideDef} />` — the only two components Task 5's routes import. All server components (no `"use client"`).

- [ ] **Step 1: ArtifactFigure**

Create `components/guides/ArtifactFigure.tsx`. Plain `<figure>` + `next/image` responsive pattern; SVG charts bypass the optimizer.

```tsx
import Image from "next/image";
import type { ArtifactFigure as ArtifactFigureDef } from "@/lib/guides/types";

/** Real product output as an article figure — caption + provenance + as-of, never decoration. */
export function ArtifactFigure({ figure }: { figure: ArtifactFigureDef }) {
  return (
    <figure className="my-8 overflow-hidden rounded-xl border border-gulf-haze bg-gulf-deep">
      <Image
        src={figure.src}
        alt={figure.alt}
        width={1200}
        height={800}
        unoptimized={figure.src.endsWith(".svg")}
        className="w-full bg-white"
        style={{ height: "auto" }}
        sizes="(min-width: 1024px) 720px, 100vw"
      />
      <figcaption className="border-t border-gulf-haze px-4 py-3 text-sm text-text-secondary">
        {figure.caption}{" "}
        <span className="text-text-tertiary">
          Source: {figure.provenance}. As of {figure.asOf}.
        </span>
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: BestFor, ProTip, TryIt**

Create `components/guides/GuideBits.tsx`:

```tsx
import Link from "next/link";
import type { TryIt as TryItDef } from "@/lib/guides/types";

/** Figma-style “Best for …” italic tagline under a section heading. */
export function BestFor({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm italic text-text-tertiary">Best for {children}</p>;
}

/** Inline pro-tip aside — the hidden-features mechanic (spec strand 3). */
export function ProTip({ children }: { children: React.ReactNode }) {
  return (
    <aside className="my-5 rounded-lg border border-gulf-haze bg-gulf-deep px-4 py-3 text-sm text-text-secondary">
      <span className="mr-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-gulf-teal">
        Pro tip
      </span>
      {children}
    </aside>
  );
}

/** Banded CTA deep-linking into the product — every guide exits into the lab or showcase. */
export function TryIt({ tryIt }: { tryIt: TryItDef }) {
  return (
    <div className="my-8 flex items-center justify-between gap-4 rounded-xl border border-gulf-haze bg-gulf-deep px-5 py-4">
      <span className="text-sm font-medium text-text-primary">Try it yourself</span>
      <Link
        href={tryIt.href}
        className="rounded-md bg-gulf-teal px-4 py-2 text-sm font-medium text-text-on-accent transition-opacity hover:opacity-90"
      >
        {tryIt.label} →
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: GuideToc**

Create `components/guides/GuideToc.tsx`:

```tsx
import type { GuideSection } from "@/lib/guides/types";

/** Anchor TOC — sticky aside on desktop, plain list above the article on mobile. */
export function GuideToc({ sections }: { sections: GuideSection[] }) {
  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-24">
      <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
        On this page
      </p>
      <ul className="space-y-2 border-l border-gulf-haze pl-4">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="text-sm text-text-secondary transition-colors hover:text-gulf-teal"
            >
              {s.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: GuideCard**

Create `components/guides/GuideCard.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import type { GuideDef } from "@/lib/guides/types";

/** Hub card — image + title + card copy, Figma-band style. Flat bordered card. */
export function GuideCard({ guide }: { guide: GuideDef }) {
  return (
    <Link
      href={`/guides/${guide.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gulf-haze bg-gulf-deep transition-colors hover:border-gulf-teal"
    >
      <div className="aspect-[4/3] overflow-hidden border-b border-gulf-haze bg-white">
        <Image
          src={guide.cardImage}
          alt=""
          width={640}
          height={480}
          className="h-full w-full object-cover object-top"
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-semibold text-text-primary group-hover:text-gulf-teal">
          {guide.title}
        </h3>
        <p className="mt-2 flex-1 text-sm text-text-secondary">{guide.description}</p>
        <span className="mt-4 text-sm font-medium text-gulf-teal">
          {guide.kind === "tips" ? "See the tips →" : "Read the guide →"}
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 5: GuideArticle shell**

Create `components/guides/GuideArticle.tsx`:

```tsx
import { GUIDES } from "@/lib/guides/registry";
import type { GuideDef } from "@/lib/guides/types";
import { ArtifactFigure } from "./ArtifactFigure";
import { BestFor, ProTip, TryIt } from "./GuideBits";
import { GuideCard } from "./GuideCard";
import { GuideToc } from "./GuideToc";

/**
 * The one article template (spec §3) — Figma anatomy: hook intro → “what to
 * expect” bullets → TOC → sections (best-for tagline, prose, figure, pro-tips,
 * optional section CTA) → closing CTA → related guides.
 */
export function GuideArticle({ guide }: { guide: GuideDef }) {
  const related = GUIDES.filter((g) => g.slug !== guide.slug);

  return (
    <div className="py-16">
      <header className="mb-10 max-w-3xl">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-gulf-teal">
          {guide.kind === "tips" ? "Tips & hidden features" : "Guide"}
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          {guide.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-text-secondary">{guide.hook}</p>
        {guide.expect.length > 0 && (
          <div className="mt-6 rounded-xl border border-gulf-haze bg-gulf-deep px-5 py-4">
            <p className="mb-2 text-sm font-semibold text-text-primary">
              Here&rsquo;s what you can expect
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
              {guide.expect.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <div className="gap-12 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="mb-10 lg:mb-0">
          <GuideToc sections={guide.sections} />
        </aside>

        <article className="max-w-3xl">
          {guide.sections.map((s) => (
            <section key={s.id} id={s.id} className="mb-12 scroll-mt-24">
              <h2 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
                {s.heading}
              </h2>
              {s.bestFor && <BestFor>{s.bestFor}</BestFor>}
              {s.body.map((p) => (
                <p key={p.slice(0, 40)} className="mt-4 leading-relaxed text-text-secondary">
                  {p}
                </p>
              ))}
              {s.figure && <ArtifactFigure figure={s.figure} />}
              {s.proTips?.map((t) => <ProTip key={t.slice(0, 40)}>{t}</ProTip>)}
              {s.tryIt && <TryIt tryIt={s.tryIt} />}
            </section>
          ))}

          <TryIt tryIt={guide.tryIt} />

          {related.length > 0 && (
            <footer className="mt-16 border-t border-gulf-haze pt-10">
              <h2 className="mb-6 text-lg font-semibold text-text-primary">Keep reading</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                {related.map((g) => (
                  <GuideCard key={g.slug} guide={g} />
                ))}
              </div>
            </footer>
          )}
        </article>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify it compiles**

Run: `bunx next build`
Expected: build succeeds (components are not yet imported by a route — this catches type/lint errors only).

- [ ] **Step 7: Commit**

```bash
git add components/guides/ArtifactFigure.tsx components/guides/GuideBits.tsx components/guides/GuideToc.tsx components/guides/GuideCard.tsx components/guides/GuideArticle.tsx
git commit -m "feat(guides): article components — figure/toc/card/pro-tip/try-it + article shell"
```

---

### Task 5: Routes — hub, slug page, sitemap

**Files:**
- Create: `app/guides/page.tsx`
- Create: `app/guides/[slug]/page.tsx`
- Modify: `app/sitemap.ts` (add a guides section after the homepage entry, ~line 39)

**Interfaces:**
- Consumes: `GUIDES`, `guideBySlug` from `@/lib/guides/registry`; `GuideCard`, `GuideArticle` from `components/guides/`; `PageShell` from `@/components/PageShell`.
- Produces: public routes `/guides` and `/guides/[slug]`, statically generated.

- [ ] **Step 1: Hub page**

Create `app/guides/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { GuideCard } from "@/components/guides/GuideCard";
import { GUIDES } from "@/lib/guides/registry";

export const metadata: Metadata = {
  title: "Guides — SWFL Data Gulf",
  description:
    "How the system works and how to get the most out of it: where every number comes from, why the emails look the way they do, and the builder features you might miss.",
};

export default function GuidesPage() {
  const guides = GUIDES.filter((g) => g.kind === "guide");
  const tips = GUIDES.filter((g) => g.kind === "tips");

  return (
    <PageShell width="wide" className="py-16">
      <header className="mb-12 max-w-2xl">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-gulf-teal">
          SWFL Data Gulf · Guides
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          How it works, and how to work it
        </h1>
        <p className="mt-3 text-text-secondary">
          Why we build the way we build — and the features that make the builder yours.
        </p>
      </header>

      <section aria-labelledby="guides-band">
        <h2 id="guides-band" className="mb-6 text-xl font-semibold text-text-primary">
          Guides
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {guides.map((g) => (
            <GuideCard key={g.slug} guide={g} />
          ))}
        </div>
      </section>

      {tips.length > 0 && (
        <section aria-labelledby="tips-band" className="mt-14">
          <h2 id="tips-band" className="mb-6 text-xl font-semibold text-text-primary">
            Tips &amp; hidden features
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {tips.map((g) => (
              <GuideCard key={g.slug} guide={g} />
            ))}
          </div>
        </section>
      )}
    </PageShell>
  );
}
```

- [ ] **Step 2: Slug page**

Create `app/guides/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { GuideArticle } from "@/components/guides/GuideArticle";
import { GUIDES, guideBySlug } from "@/lib/guides/registry";

const ORIGIN = "https://www.swfldatagulf.com";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const guide = guideBySlug(slug);
  if (!guide) return {};
  return {
    title: `${guide.title} — SWFL Data Gulf`,
    description: guide.description,
    openGraph: {
      title: guide.title,
      description: guide.description,
      images: [`${ORIGIN}${guide.cardImage}`],
    },
  };
}

export default async function GuidePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  return (
    <PageShell width="wide">
      <GuideArticle guide={guide} />
    </PageShell>
  );
}
```

Note: check a neighboring dynamic route (e.g. `app/r/zip-report/[zip]/page.tsx`) for how this repo types `params` — Promise-style (Next 15) vs plain object (Next 14) — and match it exactly.

- [ ] **Step 3: Sitemap**

In `app/sitemap.ts`, add the import at the top and a guides section directly after the homepage entry (after line 39):

```ts
import { GUIDES } from "@/lib/guides/registry";
```

```ts
  // ── Guides hub (/guides + /guides/[slug]) ─────────────────────────────────
  entries.push({
    url: `${ORIGIN}/guides`,
    changeFrequency: "weekly",
    priority: 0.7,
  });
  for (const guide of GUIDES) {
    entries.push({
      url: `${ORIGIN}/guides/${guide.slug}`,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }
```

- [ ] **Step 4: Verify the routes build statically**

Run: `bunx next build`
Expected: PASS; the route table lists `/guides` and `/guides/[slug]` with 3 static paths (● SSG).

- [ ] **Step 5: Commit**

```bash
git add app/guides/page.tsx "app/guides/[slug]/page.tsx" app/sitemap.ts
git commit -m "feat(guides): /guides hub + article routes, sitemap entries"
```

---

### Task 6: Nav + footer wiring (test in the SAME commit — hook-pinned)

**Files:**
- Modify: `components/nav/nav-config.ts:38-48` (NAV_GROUPS — Explore children)
- Modify: `components/nav/nav-config.test.ts` (pinned-shape tests)
- Modify: `components/nav/SiteFooter.tsx:20-35` (Explore column)

**Interfaces:**
- Consumes: existing `NavItem` shape.
- Produces: `/guides` reachable from the Explore dropdown and the footer. Marquee top-level slots untouched (per nav-config's own doc comment).

- [ ] **Step 1: Update the pinned tests FIRST (they encode the new shape)**

In `components/nav/nav-config.test.ts`:

Replace the test at line 89:

```ts
  it("keeps Search + Guides under Explore (Maps promoted top-level, ZIP Reports retired)", () => {
    const explore = NAV_GROUPS.find((n) => n.label === "Explore");
    expect(explore?.children?.map((c) => c.href)).toEqual(["/r", "/guides"]);
  });
```

In the `isItemActive` describe (after line 125), add:

```ts
  it("lights Explore on /guides (new child)", () => {
    expect(isItemActive("/guides", explore)).toBe(true);
    expect(isItemActive("/guides/sourced-numbers", explore)).toBe(true);
  });
```

In the `activeChildHref` describe (after line 145), add:

```ts
  it("lights Guides on any guide article", () => {
    expect(activeChildHref("/guides", children)).toBe("/guides");
    expect(activeChildHref("/guides/email-design", children)).toBe("/guides");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test components/nav/nav-config.test.ts`
Expected: FAIL — Explore children `["/r"]` ≠ `["/r", "/guides"]`

- [ ] **Step 3: Update NAV_GROUPS**

In `components/nav/nav-config.ts`, change the Explore group (line 39–42):

```ts
  {
    label: "Explore",
    children: [
      { label: "Search", href: "/r" },
      { label: "Guides", href: "/guides" },
    ],
  },
```

Also update the doc comment above NAV_GROUPS (lines 28–33): amend "Explore holds only Search (`/r`)" to "Explore holds Search (`/r`) and Guides (`/guides`)".

- [ ] **Step 4: Update the footer**

In `components/nav/SiteFooter.tsx`, in the Explore column's `links` array, insert after the Showcase entry (line 29):

```ts
      { label: "Guides", href: "/guides" },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test components/nav/nav-config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit (nav change + test change together — CI pins this)**

```bash
git add components/nav/nav-config.ts components/nav/nav-config.test.ts components/nav/SiteFooter.tsx
git commit -m "feat(guides): Guides entry in Explore dropdown + footer (pinned nav test updated)"
```

---

### Task 7: Homepage GuidesStrip

**Files:**
- Create: `components/landing/GuidesStrip.tsx`
- Modify: `components/landing/home-explorer.css` (append a `.guides-strip` block at the end)
- Modify: `app/page.tsx:71` (insert after `<DeliverableShowcase …/>`)

**Interfaces:**
- Consumes: `GUIDES` from `@/lib/guides/registry` (renders all three cards from the same registry the hub uses — no duplicated copy).
- Produces: one homepage section. This is the ONLY homepage change in this build (spec §6).

- [ ] **Step 1: Component**

Create `components/landing/GuidesStrip.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { GUIDES } from "@/lib/guides/registry";

/**
 * Homepage cross-link strip into /guides (spec §6 — the only homepage change
 * in the guides-hub build). Cards reuse the registry's card art + copy, so the
 * strip can never drift from the hub.
 */
export default function GuidesStrip() {
  return (
    <section className="guides-strip" aria-labelledby="guides-strip-headline">
      <div className="cap-eyebrow">Why agents trust what we build</div>
      <h2 id="guides-strip-headline" className="cap-headline">
        We&rsquo;re not asking you to trust the AI. <span>We&rsquo;re showing you the system.</span>
      </h2>
      <div className="guides-strip-cards">
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/guides/${g.slug}`} className="guides-strip-card">
            <span className="guides-strip-art">
              <Image src={g.cardImage} alt="" width={640} height={480} />
            </span>
            <span className="guides-strip-title">{g.title}</span>
            <span className="guides-strip-desc">{g.description}</span>
            <span className="guides-strip-more">Read it →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Styles**

Append to `components/landing/home-explorer.css` (same var-based idiom as the rest of the file):

```css
/* ── Guides strip (guides-hub build — the only homepage section it adds) ── */
.home-explorer .guides-strip {padding:64px 32px;max-width:1060px;margin:0 auto;text-align:center}
.home-explorer .guides-strip-cards {display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:28px;text-align:left}
.home-explorer .guides-strip-card {display:flex;flex-direction:column;border:1px solid var(--gulf-slate-hi);border-radius:12px;overflow:hidden;background:var(--gulf-deep);text-decoration:none;transition:border-color .15s}
.home-explorer .guides-strip-card:hover {border-color:var(--gulf-teal)}
.home-explorer .guides-strip-art {display:block;aspect-ratio:4/3;overflow:hidden;background:#fff;border-bottom:1px solid var(--gulf-slate-hi)}
.home-explorer .guides-strip-art img {width:100%;height:100%;object-fit:cover;object-position:top}
.home-explorer .guides-strip-title {font-size:15px;font-weight:600;color:var(--text-primary);padding:14px 16px 0}
.home-explorer .guides-strip-desc {flex:1;font-size:13px;line-height:1.5;color:var(--text-secondary);padding:6px 16px 0}
.home-explorer .guides-strip-more {font-size:13px;font-weight:500;color:var(--gulf-teal);padding:10px 16px 16px}
@media (max-width: 860px) {.home-explorer .guides-strip-cards {grid-template-columns:1fr}}
```

- [ ] **Step 3: Insert into the homepage**

In `app/page.tsx`: add the import next to the other landing imports —

```tsx
import GuidesStrip from "@/components/landing/GuidesStrip";
```

— and insert between `<DeliverableShowcase figures={showcase} />` (line 71) and `<PricingStrip />`:

```tsx
      <DeliverableShowcase figures={showcase} />
      <GuidesStrip />
      <PricingStrip />
```

- [ ] **Step 4: Verify**

Run: `bunx next build`
Expected: PASS. Then `bunx next start` and eyeball `http://localhost:3000` — the strip renders after the showcase section with three cards linking to `/guides/*` (stale-dev-server rule: verify via build+start, not a long-running dev server).

- [ ] **Step 5: Commit**

```bash
git add components/landing/GuidesStrip.tsx components/landing/home-explorer.css app/page.tsx
git commit -m "feat(homepage): GuidesStrip — three guide cards after the showcase section"
```

---

### Task 8: Full verification + session-log + STOP for operator push

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)

- [ ] **Step 1: Full test + build pass**

```bash
bun test lib/guides components/nav
bunx next build
```
Expected: all tests PASS; build green with `/guides` + 3 SSG article paths in the route table.

- [ ] **Step 2: Route-level smoke (local)**

`bunx next start`, then verify with curl (or browser):
- `/guides` → 200, three cards
- `/guides/sourced-numbers`, `/guides/email-design`, `/guides/builder-tips` → 200, figures load (chart SVGs + webp captures), TOC anchors jump
- `/guides/unknown` → 404
- Homepage strip, Explore dropdown, and footer all link through

- [ ] **Step 3: SESSION_LOG entry**

Append a new top-of-file entry to `SESSION_LOG.md`: what shipped (registry + trio content, article template, routes, nav/footer/sitemap, homepage strip), which tips were cut in Task 3 verification (if any), and that `guides_hub_live_verify` remains open for the operator's post-deploy pass.

```bash
git add SESSION_LOG.md
git commit -m "docs(session-log): guides hub built — registry, trio, routes, nav, homepage strip"
```

- [ ] **Step 4: STOP — show the operator the result, do not push**

Run `git log --oneline origin/main..HEAD` and present it. Pushing is the operator's call (`node scripts/safe-push.mjs` when approved). The `guides_hub_live_verify` check stays open until the operator's live pass on prod; do not close it.

---

## Self-review notes (done at plan time)

- **Spec coverage:** §1 types/registry/content → Tasks 1–3 · §2 routes → Task 5 · §3 components → Task 4 · §4 copy rules → global constraints + forbidden-noun test · §5 trio outlines → Tasks 1–3 content · §6 homepage strip → Task 7 · §7 nav/footer → Task 6 · §8 testing → Tasks 1, 6, 8. Build order matches the spec's §"Build order".
- **All 10 tip anchors were located in code during planning** (paths listed in Task 3 Step 1); the two soft claims (click tracking on image links specifically; exact photo ratios) carry explicit verify-or-cut / verify-or-correct instructions.
- **Figure provenance** is copied from `public/showcase/seed-previews/assets/README.md` (chart sources + vintages) — the LeePA chart carries its own 05/30/2026 vintage, not the session date.
- **`params` typing note** in Task 5: match the neighboring dynamic route's convention before committing.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2, Task 3 | `lib/guides/registry.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
