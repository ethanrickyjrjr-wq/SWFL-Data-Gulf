# Agent Launch Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 11 tasks, 23 files, 2 conflict groups, keywords: migration, schema, architecture

**Goal:** Ship the fourth quick-start campaign — a day-one agent's launch: seeded announcement email + post-build chip that seeds the recurring weekly sphere update — with the lab upgrades that make the promised look actually render out of Sonnet.

**Architecture:** A `campaign` entry on a new `agent-launch` Showcase (thin selector, no new registry). One new optional field (`ShowcaseCampaign.followUp`). Chip rides the existing CAN-SPAM-span pattern in the grid shell toolbar. Recipes are advisory prose naming exact author blocks; every number rides `value_figure` id-selection. Lab upgrades are block-render changes + one assembly arg. Send tagging touches only `messageFor` in the blast route.

**Tech Stack:** Next.js App Router, React 19, zod v4, @react-email/components, bun:test, Resend SDK.

**Spec:** `docs/superpowers/specs/2026-07-05-agent-launch-campaign-design.md` · Check: `agent_launch_campaign_live_verify`
**Evidence:** `docs/superpowers/specs/2026-07-05-email-marketing-evidence-notes.md`

**Deviations from spec — status after the verification pass (evidence:
`docs/superpowers/handoffs/2026-07-05-agent-launch-plan-verification.md`):**
1. **OVERRULED by operator 07/05/2026 — do the FULL campaign-key thread.** The original
   deviation ("deliverable id is the join key, so nothing is lost") was wrong: nothing anywhere
   persists which deliverable was campaign-seeded, so dropping the campaign tag loses the
   linkage permanently and DONE-WHEN item 4 becomes unmeetable. Task 10 (amended) now ships:
   idempotent `deliverables.campaign_key` column + generated-types entry + materials-route POST
   field + `onSave` threading from the grid shell + the `campaign` tag on sends. Task 7 retains
   the campaign KEY across the chip lifecycle for exactly this.
2. §5 L3 STANDS (operator did not overrule): no inline source line on the stat clipping —
   sources ride the collapsed list, never inline (consumption contract rule 1). The clipping is
   banded hero + accent border + honest label. (If ever revisited: `MarketFigure.source` is
   available at assembly, and the field must be engine-owned — never AI-patchable.)
3. §5 L5 (script font): CUT from this build. Italic serif via existing PLAYFAIR_SERIF covers
   the greeting; revisit only if the demo builds look flat.

**Verified vendor contract (crawl4ai + installed `resend@6.16.0` SDK, 07/05/2026):** `tags`
ride `emails.send` AND `batch.send` (batch payload = `Omit<CreateEmailOptions, 'attachments' |
'scheduledAt'>`, index.d.cts:635); name/value ASCII letters/numbers/underscores/dashes only,
≤256 chars, ≤75 tags/email; docs verbatim "After the email is sent, the tag is included in the
webhook event"; `mailto:` hrefs pass the blast URL lint (`SAFE_SCHEME_RE`,
`lib/deliverable/url-lint.ts:33`).

## Global Constraints

- Recipe text contains ZERO digits (test-enforced in `author-recipes`); leads/spans use words ("five of the twelve columns", "First / Then / Every week").
- The author model never writes a number: figures ride `value_figure` menu ids; `anchoredStatValue` guards stats.
- Never `git add -A`; stage explicit paths. Commit per task. Do NOT push (operator pushes).
- Verify builds with `bunx next build`, never bare `npx tsc`.
- Prettier pre-commit hook may reformat; `git diff -w` shows real change.
- lint-staged drops staged-MODIFIED files under partial staging — commit whole files, don't stage hunks.
- Demo emails are built IN THE LAB (lab-built is the claim and the proof); every demo number is real (lake or named source), as-of date once, MM/DD/YYYY.
- All new UI strings: no system nouns, no internal ids.

---

### Task 1: agent-card loses the circle (L1a)

**Files:**
- Modify: `lib/email/blocks/AgentCardBlock.tsx:30`
- Test: `lib/email/blocks/agent-card-render.test.ts` (create)

**Interfaces:**
- Consumes: existing `AgentCardProps`, `EmailGlobalStyle`.
- Produces: no API change — render treatment only. Photo renders as a rectangular editorial crop (`borderRadius: "10px"`, 96×120 portrait), never `50%`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/blocks/agent-card-render.test.ts
import { describe, expect, it } from "bun:test";
import { render } from "@react-email/render";
import { AgentCardBlock } from "./AgentCardBlock";
import { DEFAULT_GLOBAL_STYLE } from "../doc/default-docs";

describe("AgentCardBlock portrait", () => {
  it("renders the photo as a rectangular editorial crop, never a circle", async () => {
    const html = await render(
      AgentCardBlock({
        props: { photoUrl: "https://example.com/p.png", name: "A", title: "Agent" },
        globalStyle: DEFAULT_GLOBAL_STYLE,
      }),
    );
    expect(html).not.toContain("border-radius:50%");
    expect(html).toContain("border-radius:10px");
  });
});
```

(If `DEFAULT_GLOBAL_STYLE` is not exported from `default-docs.ts`, inline a minimal `EmailGlobalStyle` literal instead — copy the field list from `GlobalStyleSchema` in `lib/email/doc/schema.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/blocks/agent-card-render.test.ts`
Expected: FAIL — html contains `border-radius:50%`.

- [ ] **Step 3: Change the render**

In `AgentCardBlock.tsx`, replace the photo `<Img>` style `borderRadius: "50%"` with a rectangular editorial treatment. **Width-only sizing — no fixed height, no `object-fit`:** Outlook ignores `object-fit` and would distort a fixed 96×120 crop; letting the portrait keep its natural aspect is the only email-safe "crop" (half-body cutouts read as a tall column on their own):

```tsx
style={{
  borderRadius: "10px",
  display: "block",
  width: "96px",
}}
```

Also drop the `width={64} height={64}` attributes on the `<Img>` in favor of `width={96}` only (attribute + style agree; no height attribute). Adjust the fixed table-cell width from 76px to ~108px. Mirror in the PDF: `lib/pdf/email-doc-pdf.tsx` agent-card case (line ~291) becomes `style={{ width: 64, borderRadius: 4, marginRight: 14 }}` — fixed square + circular radius dropped there too (add `lib/pdf/email-doc-pdf.tsx` to this task's staged files).

- [ ] **Step 4: Run the test + the block suite**

Run: `bun test lib/email/blocks/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/blocks/AgentCardBlock.tsx lib/email/blocks/agent-card-render.test.ts
git commit -m "feat(email-blocks): agent-card portrait is an editorial rectangle, never a circle (agent-launch L1)"
```

---

### Task 2: side-by-side portrait column renders in the compiled email (L1b + L4)

**Files:**
- Test: `lib/email/compile-grid-columns.test.ts` (create)
- Create: `lib/email/doc/row-grouping.ts` + `lib/email/doc/row-grouping.test.ts` (the shared row-grouping root — see Step 3b)
- Modify: `lib/email/compile-grid.ts` (consume the extracted root; output byte-identical), `lib/pdf/email-doc-pdf.tsx` (render grouped rows as flex rows — **this engine is verified broken**: it never reads `block.layout`, so side-by-side rows stack in the PDF attachment and Download-PDF paths)
- Modify (only if the HTML test exposes a defect): `lib/email/blocks/ImageBlock.tsx`

**Interfaces:**
- Consumes: `renderEmailDocHtml` (`lib/email/render-email-doc.ts`) — grid docs (blocks carrying `layout`) compile through `compileGrid` (Cerberus hybrid columns + Outlook ghost tables).
- Produces: proof (or fix) that an image block spanning ~5 of 12 columns beside a text block renders as true side-by-side columns and stacks on mobile. This row shape is load-bearing for the whole announcement look.

- [ ] **Step 1: Write the characterization test**

```ts
// lib/email/compile-grid-columns.test.ts
import { describe, expect, it } from "bun:test";
import { renderEmailDocHtml } from "./render-email-doc";
import { EmailDocSchema } from "./doc/schema";

const gs = {
  primaryColor: "#1F4D3A",
  accentColor: "#A98A4E",
  fontFamily: "BOOK_SERIF",
  textColor: "#1A1E22",
  backdropColor: "#FBFAF7",
};

describe("compiled grid: portrait beside letter", () => {
  it("renders an image col and a text col in ONE visual row", async () => {
    const doc = EmailDocSchema.parse({
      globalStyle: gs,
      blocks: [
        {
          type: "image",
          props: { url: "https://example.com/portrait.png", alt: "Agent portrait", kind: "photo" },
          layout: { x: 0, y: 0, w: 5, h: 6 },
        },
        {
          type: "text",
          props: { body: "You're getting this because we know each other." },
          layout: { x: 5, y: 0, w: 7, h: 6 },
        },
      ],
    });
    const html = await renderEmailDocHtml(doc);
    // Both cells present…
    expect(html).toContain("portrait.png");
    expect(html).toContain("because we know each other");
    // …and the image sits in a constrained column, not a full-width banner.
    // compileGrid emits per-column width styles; assert the image cell's width
    // is well under the 600px canvas (5/12 of 600 = 250px).
    expect(html).toMatch(/max-width:\s*2\d\dpx[^>]*>[^]*?portrait\.png|portrait\.png[^]*?max-width:\s*2\d\dpx/);
  });
});
```

(The exact width-assertion regex may need adapting to compileGrid's real output — read `lib/email/compile-grid.ts` first and assert on whatever width mechanism it actually emits (td width attr, style width, or class). The test's job: the image cell is ~5/12 of the canvas, and both blocks share a row.)

- [ ] **Step 2: Run it**

Run: `bun test lib/email/compile-grid-columns.test.ts`
Expected: PASS if compileGrid already handles it (likely — the canvas uses the same rows). If FAIL, the defect is real: read `compile-grid.ts`, fix column-width derivation or image sizing inside a column cell (image must be `width:100%` of its CELL, `height:auto`, never the fixed 300px banner height), and re-run until green.

- [ ] **Step 3: Free-flow engine — assert the routing, don't fix it**

`renderEmailDocHtml` (`lib/email/render-email-doc.ts:23`) routes ANY layout-carrying doc to `compileGrid`, so the free stacker (`EmailDocRenderer`) never sees a positioned doc on any surface (preview, blast, /p, scheduled). Add one assertion to the Step 1 test: the compiled output contains an MSO ghost-table marker (`[if mso]`) — that marker only exists on the compileGrid path, which proves the routing.

- [ ] **Step 3b: Extract the row-grouping root (PDF fix, part 1)**

The PDF engine is VERIFIED BROKEN for this look: `lib/pdf/email-doc-pdf.tsx` never reads `block.layout` — blocks render as a sequential stack, so the portrait row stacks in the PDF attachment (blast `include_pdf`) and Download-PDF paths. Spec L4: fix where broken.

Write the failing test first — `lib/email/doc/row-grouping.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { groupRows } from "./row-grouping";
import type { EmailBlock } from "./types";

const blk = (id: string, layout?: { x: number; y: number; w: number; h: number }): EmailBlock =>
  ({ id, type: "text", props: { body: id }, ...(layout ? { layout } : {}) }) as EmailBlock;

describe("groupRows", () => {
  it("5+7 on one y-band is one row of two", () => {
    const rows = groupRows([blk("a", { x: 0, y: 0, w: 5, h: 6 }), blk("b", { x: 5, y: 0, w: 7, h: 6 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((d) => d.block.id)).toEqual(["a", "b"]);
  });
  it("6+6 with unequal heights (RGL vertical compaction) still shares a row", () => {
    const rows = groupRows([blk("a", { x: 0, y: 0, w: 6, h: 6 }), blk("b", { x: 6, y: 2, w: 6, h: 3 })]);
    expect(rows).toHaveLength(1);
  });
  it("a block at/below the band bottom opens a new row; no-layout blocks trail full-bleed", () => {
    const rows = groupRows([blk("a", { x: 0, y: 0, w: 6, h: 2 }), blk("c", { x: 0, y: 2, w: 12, h: 2 }), blk("z")]);
    expect(rows).toHaveLength(3);
    expect(rows[2][0].eff.w).toBe(12);
  });
});
```

Then create `lib/email/doc/row-grouping.ts` by moving `effectiveLayout` + `groupRows` out of `compile-grid.ts:68-130` VERBATIM (band-overlap grouping, sort by y→x→index, `FALLBACK_BASE` for no-layout blocks), exporting:

```ts
export interface EffLayout { x: number; y: number; w: number; h: number }
export interface RowEntry { block: EmailBlock; eff: EffLayout }
export function effectiveLayout(block: EmailBlock, fallbackY: number): EffLayout
export function groupRows(blocks: EmailBlock[]): RowEntry[][]
```

Make `compile-grid.ts` import from the new module and delete its private copy — its compiled output must stay byte-identical (the Step 1 test + existing `compile-grid-metric.test.ts` prove it). If compile-grid's internal shape keeps extra fields (e.g. the original index `i`), adapt the import site, never the helper.

- [ ] **Step 3c: PDF renders grouped rows as flex rows (PDF fix, part 2)**

In `EmailDocPdf` (`lib/pdf/email-doc-pdf.tsx`), where the body maps `doc.blocks` today, group first:

```tsx
import { groupRows } from "@/lib/email/doc/row-grouping";
// ...
{groupRows(doc.blocks).map((row, ri) =>
  row.length === 1 ? (
    <PdfBlock key={row[0].block.id ?? ri} block={row[0].block} gs={gs} />
  ) : (
    <View key={ri} style={{ flexDirection: "row" }}>
      {row.map(({ block, eff }) => (
        <View key={block.id} style={{ flex: eff.w }}>
          <PdfBlock block={block} gs={gs} />
        </View>
      ))}
    </View>
  ),
)}
```

(@react-pdf: no `gap`; flex weights carry the 5/12–7/12 split; single-block rows render exactly as today so the audit test stays meaningful.) Add a PDF test mirroring the audit test's element-tree introspection: the 5+7 doc yields a `View` with `flexDirection: "row"` whose two children carry `flex: 5` and `flex: 7`.

- [ ] **Step 4: Full suites + commit**

Run: `bun test lib/email/ lib/pdf/`
Expected: PASS — compile-grid output unchanged, PDF audit test green, new grouping tests green.

```bash
git add lib/email/compile-grid-columns.test.ts lib/email/doc/row-grouping.ts lib/email/doc/row-grouping.test.ts lib/email/compile-grid.ts lib/pdf/email-doc-pdf.tsx lib/email/blocks/ImageBlock.tsx
git commit -m "feat(email): one row-grouping root — PDF renders true side-by-side columns (agent-launch L4)"
```

(Stage only the files you actually touched.)

---

### Task 3: banded hero renders as the stat clipping (L3)

**Files:**
- Modify: `lib/email/blocks/HeroBlock.tsx`
- Test: `lib/email/blocks/hero-clipping.test.ts` (create)

**Interfaces:**
- Consumes: `HeroProps` (kicker/value/label/prose + `sectionBg`), `EmailGlobalStyle.accentColor`.
- Produces: when a hero carries a `sectionBg` (i.e. the author banded it) AND a `value`, it renders with a 4px accent left border — the "clipping pinned to a letter" moment. Unbanded heros are byte-identical to today.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/blocks/hero-clipping.test.ts
import { describe, expect, it } from "bun:test";
import { render } from "@react-email/render";
import { HeroBlock } from "./HeroBlock";

const gs = {
  primaryColor: "#1F4D3A",
  accentColor: "#A98A4E",
  fontFamily: "BOOK_SERIF",
  textColor: "#1A1E22",
  backdropColor: "#FBFAF7",
} as never;

describe("hero clipping", () => {
  it("banded hero with a value gets the accent left border", async () => {
    const html = await render(
      HeroBlock({
        props: { kicker: "Bonita Springs", value: "$412", label: "one honest line", sectionBg: "#ffffff" },
        globalStyle: gs,
      }),
    );
    expect(html).toContain("border-left:4px solid #A98A4E");
  });
  it("unbanded hero is unchanged", async () => {
    const html = await render(
      HeroBlock({ props: { kicker: "k", value: "$1", label: "l" }, globalStyle: gs }),
    );
    expect(html).not.toContain("border-left:4px");
  });
});
```

(Adapt the `gs` literal to the real `EmailGlobalStyle` shape — copy from Task 1. Read `HeroBlock.tsx` first; if it already draws a left border for some state, pick a non-conflicting assertion.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/blocks/hero-clipping.test.ts`
Expected: first case FAILS (no left border today).

- [ ] **Step 3: Implement**

In `HeroBlock.tsx`, on the outer `Section` style, add conditionally:

```tsx
...(props.sectionBg && props.value
  ? { borderLeft: `4px solid ${globalStyle.accentColor}` }
  : {}),
```

(If the section already composes a style object, merge there. Dark-band case: reuse the existing `on-dark` helpers if the file uses them so the accent stays legible — `legibleAccent(globalStyle.accentColor, bg)`.)

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/blocks/`
Expected: PASS, including any pre-existing hero tests.

- [ ] **Step 5: Commit**

```bash
git add lib/email/blocks/HeroBlock.tsx lib/email/blocks/hero-clipping.test.ts
git commit -m "feat(email-blocks): banded hero renders as accent-bordered stat clipping (agent-launch L3)"
```

---

### Task 4: engine-owned reply CTA on authored buttons (L2)

**Files:**
- Modify: `lib/email/author-doc.ts` (AssembleArgs + button entry), `lib/email/build-doc.ts` (caller), `app/api/email-lab/ai/route.ts` (supply the address)
- Test: `lib/email/author-doc.test.ts` (extend)

**Interfaces:**
- Consumes: `AssembleArgs` (author-doc.ts, ~line 449), `applyContent` case `"button"` (~line 406), the ai route's authed `user.email`.
- Produces: `AssembleArgs.buttonMailto?: string` — when present, every authored `button` block gets `props.url = buttonMailto`. Callers pass `mailto:<agent reply-to>` ONLY when the build prompt asks for a reply (`/\breply\b/i`). The author still writes only `button_label`; URLs stay engine-owned (moat rule 2 intact).

- [ ] **Step 1: Write the failing test**

In `lib/email/author-doc.test.ts`, find how existing tests call the assemble function (they construct `AssembleArgs` — mirror the nearest existing button/columns test's setup verbatim) and add:

```ts
it("buttonMailto puts an engine-owned mailto on authored buttons", () => {
  const out = assembleAuthoredDoc({
    ...baseArgs, // copy the minimal args object the neighboring tests build
    buttonMailto: "mailto:agent@example.com",
    authored: {
      blocks: [{ type: "button", button_label: "Reply with your address" }],
    },
  });
  const btn = out.blocks.find((b) => b.type === "button");
  expect((btn?.props as { url?: string }).url).toBe("mailto:agent@example.com");
});

it("no buttonMailto → button url untouched (renders as non-link text)", () => {
  const out = assembleAuthoredDoc({
    ...baseArgs,
    authored: { blocks: [{ type: "button", button_label: "Reply" }] },
  });
  const btn = out.blocks.find((b) => b.type === "button");
  expect((btn?.props as { url?: string }).url ?? "").toBe("");
});
```

(Use the REAL exported assemble function name from author-doc.ts — read the export list; do not invent a name. Adjust `baseArgs` to the file's existing test fixture.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/author-doc.test.ts`
Expected: first new case FAILS (url undefined).

- [ ] **Step 3: Implement**

In `author-doc.ts`:
1. Add to `AssembleArgs`: `` /** Engine-owned reply destination for authored buttons ("mailto:…"). The model writes button_label only. */ buttonMailto?: string; ``
2. Thread it to where button entries get their props (in `buildEntry`/`applyContent` flow — same place `defaultLinkUrl` is consumed): after `applyContent` runs for a `"button"` block, set `if (args.buttonMailto) props.url = args.buttonMailto;`

In `build-doc.ts`: accept and forward a `buttonMailto` option to the assemble call (mirror how `defaultLinkUrl` flows today — read its path and copy it).

In `app/api/email-lab/ai/route.ts`: where the author build is invoked with the user in scope, compute:

```ts
const buttonMailto =
  /\breply\b/i.test(prompt) && user?.email ? `mailto:${user.email}` : undefined;
```

and pass it through. (If the route serves anonymous users, `user` may be null — the guard above already handles it.)

- [ ] **Step 3b: REQUIRED — applyBrand must not clobber the mailto (verified defect)**

The grid shell runs `applyBrand(parsed.data, brandTokens)` on every authored doc (`EmailLabGridShell.tsx:342`), and `applyBrand`'s button branch (`components/email-lab/EmailLabShell.tsx:140-141`) unconditionally overwrites `props.url` with the brand CTA — so for any brand with a website URL the assembly-set mailto is silently replaced and the reply button becomes a website link. Without this guard, everything above is dead code. Change the branch to:

```ts
    } else if (b.type === "button") {
      if (cta && !String(props.url ?? "").startsWith("mailto:")) props.url = cta;
    } else if (b.type === "hero") {
```

And add a direct test (`applyBrand` is exported from `EmailLabShell.tsx`) — new file `lib/email/brand/apply-brand-button.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { applyBrand } from "@/components/email-lab/EmailLabShell";
import type { EmailDoc } from "@/lib/email/doc/types";

const gs = {
  primaryColor: "#1F4D3A",
  accentColor: "#A98A4E",
  fontFamily: "BOOK_SERIF",
  textColor: "#1A1E22",
  backdropColor: "#FBFAF7",
} as EmailDoc["globalStyle"];

const docWith = (props: Record<string, unknown>): EmailDoc =>
  ({ globalStyle: gs, blocks: [{ id: "b1", type: "button", props }] }) as EmailDoc;

describe("applyBrand button branch", () => {
  it("keeps an engine-set mailto — the brand CTA must not clobber it", () => {
    const out = applyBrand(docWith({ label: "Reply", url: "mailto:agent@example.com" }), {
      WEBSITE_URL: "https://site.example",
    });
    expect((out.blocks[0].props as { url?: string }).url).toBe("mailto:agent@example.com");
  });
  it("still fills the CTA on ordinary buttons (today's behavior preserved)", () => {
    const out = applyBrand(docWith({ label: "Go", url: "" }), { WEBSITE_URL: "https://site.example" });
    expect((out.blocks[0].props as { url?: string }).url).toBe("https://site.example");
  });
});
```

(Note: `mailto:` hrefs pass the blast route's URL lint — `SAFE_SCHEME_RE`, `lib/deliverable/url-lint.ts:33` — so the guarded mailto ships cleanly. Add `components/email-lab/EmailLabShell.tsx` and the new test file to this task's staged paths.)

- [ ] **Step 4: Run tests + build**

Run: `bun test lib/email/author-doc.test.ts && bunx next build`
Expected: PASS / build green.

- [ ] **Step 5: Commit**

```bash
git add lib/email/author-doc.ts lib/email/build-doc.ts app/api/email-lab/ai/route.ts lib/email/author-doc.test.ts
git commit -m "feat(author): engine-owned mailto reply CTA on authored buttons (agent-launch L2)"
```

---

### Task 5: agent-intro recipe rewrite (Sonnet-proof, evidence-fed)

**Files:**
- Modify: `lib/email/author-recipes.ts` (the `agent-intro` entry ONLY)
- Test: existing `author-recipes` tests (zero-digit + detectRecipe) must stay green; extend detectRecipe cases.

**Interfaces:**
- Consumes: `RECIPES["agent-intro"]` string; `detectRecipe` (WELCOME_RE `/\bwelcome\b|introduc|\bnew agent\b|\bmeet\b/i`).
- Produces: the rewritten advisory prose below, verbatim. Zero digits (test-enforced) — all counts/spans as words.

- [ ] **Step 1: Extend detectRecipe tests**

Find the existing detectRecipe test file (grep `detectRecipe` under lib/email; extend it):

```ts
it("routes the agent-launch announcement prompt onto agent-intro", () => {
  expect(
    detectRecipe(
      "Build my agent-launch announcement email introducing me to my sphere — open like a personal letter",
    ),
  ).toBe("agent-intro");
});
it("weekly sphere update prompt routes onto NO recipe", () => {
  expect(
    detectRecipe(
      "Build a weekly sphere market update for Bonita Springs — one national or Florida headline number set beside my own area's number",
    ),
  ).toBe(null);
});
```

Run: `bun test` on that file. Expected: both PASS already (characterization — locks the routing).

- [ ] **Step 2: Replace the agent-intro recipe text**

Replace the `"agent-intro"` value in `RECIPES` with (verbatim — it contains zero digits):

```ts
"agent-intro":
  "RECIPE — AGENT LAUNCH / PROSPECT WELCOME (tuned for cold-open conversion; evidence-fed).\n" +
  "Target structure, top to bottom:\n" +
  "- Open with a side-by-side row: an `image` block (image_role photo) spanning about five of the " +
  "twelve columns BESIDE a `text` block carrying the letter opening — never a full-width photo " +
  "banner on top. The photo is the agent's professional portrait treated as a tall column.\n" +
  "- The letter opening: the first sentence says plainly why the reader is receiving this (you " +
  "know each other, or they asked to hear from you); then a line or two of first-person origin " +
  "story. Written for one reader — warm, direct, short.\n" +
  "- One `hero` block with band light as the market moment: kicker names the place, the headline " +
  "value comes from the DATA MENU, label is one honest plain-language line. Exactly one figure in " +
  "the whole email — the letter carries one piece of hard evidence, no more.\n" +
  "- A `list` block about what happens next: leads are words (First / Then / Every week), every " +
  "item phrased as what the reader gets, never as sender activity.\n" +
  "- An `agent-card` as the sign-off — the bio reads as a two-line signature, never a resume.\n" +
  "- Exactly ONE `button`: the reply ask (reply with your address and a word like REVIEW for your " +
  "home's numbers). A short `text` P.S. inviting a forward to one friend is the only second ask, " +
  "and it is soft.\n" +
  "- The key message and the one ask land in the first readable lines. Copy is always real text, " +
  "never baked into an image. The footer with unsubscribe and postal address always renders — " +
  "never suggest removing it.",
```

- [ ] **Step 3: Run the recipe suite**

Run: `bun test lib/email/author-recipes.test.ts` (or wherever the zero-digit test lives — grep `RECIPE_IDS` in tests)
Expected: PASS — zero-digit guard green, detection unchanged.

- [ ] **Step 4: Commit**

```bash
git add lib/email/author-recipes.ts <the test file touched>
git commit -m "feat(recipes): agent-intro rewritten Sonnet-proof — portrait column, letter voice, one clipping, one ask (agent-launch)"
```

---

### Task 6: `followUp` on ShowcaseCampaign + lookup helper

**Files:**
- 🔴 Modify: `lib/showcase/registry.ts` (interface only, this task), `lib/campaigns.ts`
- Test: `lib/campaigns.test.ts` (extend)

**Interfaces:**
- Consumes: `ShowcaseCampaign` (registry.ts:18-31), `SHOWCASES`, `liveCampaigns`.
- Produces:
  - `ShowcaseCampaign.followUp?: { label: string; recipe: ShowcaseRecipe }`
  - `campaignFollowUpForPrompt(prompt: string): { key: string; label: string; recipe: ShowcaseRecipe } | null` in `lib/campaigns.ts` — exact-match of `prompt` against every live email campaign's `seedRecipe.prompt`; returns that campaign's followUp or null. The grid shell (Task 7) calls this at seed time.

- [ ] **Step 1: Write the failing test**

In `lib/campaigns.test.ts` add:

```ts
import { campaignFollowUpForPrompt } from "./campaigns";
import { SHOWCASES } from "@/lib/showcase/registry";

describe("campaignFollowUpForPrompt", () => {
  it("returns null for a non-campaign prompt", () => {
    expect(campaignFollowUpForPrompt("build me anything")).toBe(null);
  });
  it("returns the followUp when the prompt IS a campaign seed with one", () => {
    const withFollowUp = SHOWCASES.find((s) => s.campaign?.followUp && s.campaign.seedRecipe);
    // Until Task 9 lands the agent-launch entry there may be none — the helper
    // must still be total. Guard the assertion:
    if (withFollowUp?.campaign?.seedRecipe) {
      const r = campaignFollowUpForPrompt(withFollowUp.campaign.seedRecipe.prompt);
      expect(r?.label).toBe(withFollowUp.campaign.followUp!.label);
      expect(r?.key).toBe(withFollowUp.campaign.key);
    }
  });
  it("a campaign seed WITHOUT followUp returns null", () => {
    const noFollow = SHOWCASES.find((s) => s.campaign?.seedRecipe && !s.campaign.followUp);
    if (noFollow?.campaign?.seedRecipe) {
      expect(campaignFollowUpForPrompt(noFollow.campaign.seedRecipe.prompt)).toBe(null);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/campaigns.test.ts`
Expected: FAIL — `campaignFollowUpForPrompt` not exported.

- [ ] **Step 3: Implement**

`registry.ts` — add to `ShowcaseCampaign`:

```ts
/** Present when this campaign has a second step: after the seeded build
 *  completes, the lab offers this recipe as a one-click follow-up chip. */
followUp?: { label: string; recipe: ShowcaseRecipe };
```

`campaigns.ts` — add:

```ts
/** The follow-up step for a Build-box seed that came from a campaign button —
 *  matched by the seed prompt (stable: prompts live only in the registry).
 *  Null for organic prompts and campaigns without a second step. */
export function campaignFollowUpForPrompt(
  prompt: string,
): { key: string; label: string; recipe: ShowcaseRecipe } | null {
  for (const { campaign } of liveCampaigns("email")) {
    if (campaign.seedRecipe?.prompt === prompt && campaign.followUp) {
      return { key: campaign.key, ...campaign.followUp };
    }
  }
  return null;
}

/** Campaign provenance for a Build-box seed — matches ANY live email campaign's
 *  seed OR follow-up recipe prompt (both live only in the registry), so BOTH
 *  campaign artifacts (announcement + weekly) save with the same campaign_key.
 *  Null for organic prompts. Task 10's save thread reads this. */
export function campaignKeyForPrompt(prompt: string): string | null {
  for (const { campaign } of liveCampaigns("email")) {
    if (campaign.seedRecipe?.prompt === prompt) return campaign.key;
    if (campaign.followUp?.recipe.prompt === prompt) return campaign.key;
  }
  return null;
}
```

(Import `ShowcaseRecipe` type from `@/lib/showcase/recipe`.) Add tests for `campaignKeyForPrompt` beside the followUp ones: an existing seed prompt (e.g. the newsletter campaign's) returns its key; a followUp recipe prompt returns the owning campaign's key (guarded until Task 9 lands an entry with one); an organic prompt returns null.

- [ ] **Step 4: Run tests**

Run: `bun test lib/campaigns.test.ts lib/showcase/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/showcase/registry.ts lib/campaigns.ts lib/campaigns.test.ts
git commit -m "feat(campaigns): ShowcaseCampaign.followUp + seed-prompt lookup helper (agent-launch)"
```

---

### Task 7: follow-up chip in the grid shell

**Files:**
- 🟡 Modify: `components/email-lab/EmailLabGridShell.tsx` (state near `handleUseRecipe` :439; chip in the toolbar beside the CAN-SPAM span :976-987; success point in `runAuthor` :339-348)

**Interfaces:**
- Consumes: `campaignFollowUpForPrompt` (Task 6), `handleUseRecipe(recipe)`, `runAuthor` success branch, existing toolbar styling (`text-[10px] text-[#f59e0b]/70` family — match the shell's look, use the teal accent family for a positive nudge: `text-gulf-teal`).
- Produces: after a campaign-seeded build succeeds, a dismissible chip: "Next: schedule your weekly sphere update →". Click seeds the follow-up recipe (same `handleUseRecipe`) and clears the chip. Session-scoped; no persistence.

- [ ] **Step 1: Add state + seed-time capture**

Near the other `useState` hooks:

```tsx
// Campaign second step — set when the Build box was seeded by a campaign
// button whose registry entry carries a followUp; armed (visible) only after
// that build succeeds. Session-scoped by design.
const [campaignFollowUp, setCampaignFollowUp] = useState<{
  label: string;
  recipe: ShowcaseRecipe;
} | null>(null);
const [followUpArmed, setFollowUpArmed] = useState(false);
```

Also add the PROVENANCE state — separate from the chip lifecycle on purpose (a dismissed chip must still save provenance, and the weekly build carries the same key):

```tsx
// Campaign provenance for saves (Task 10) — set at seed time, survives chip
// consume/dismiss. Matches seed AND follow-up prompts, so both campaign
// artifacts save with the key. Organic seeds clear it.
const [campaignKey, setCampaignKey] = useState<string | null>(null);
```

In `handleUseRecipe` (top of the function):

```tsx
const follow = campaignFollowUpForPrompt(recipe.prompt);
setCampaignFollowUp(follow ? { label: follow.label, recipe: follow.recipe } : null);
setFollowUpArmed(false);
setCampaignKey(campaignKeyForPrompt(recipe.prompt));
```

Import `campaignFollowUpForPrompt` and `campaignKeyForPrompt` from `@/lib/campaigns`. (The chip's onClick routes through `handleUseRecipe(r)` with the follow-up recipe, and `campaignKeyForPrompt` matches follow-up prompts too — so the key carries over without special-casing.)

- [ ] **Step 2: Arm on build success**

In `runAuthor`, inside the `parsed.success` branch (after `setAiStatus(...)`):

```tsx
if (campaignFollowUp) setFollowUpArmed(true);
```

- [ ] **Step 3: Render the chip**

In the toolbar, adjacent to the CAN-SPAM span (email mode only):

```tsx
{mode === "email" && followUpArmed && campaignFollowUp && (
  <span className="flex items-center gap-1.5">
    <button
      type="button"
      onClick={() => {
        const r = campaignFollowUp.recipe;
        setFollowUpArmed(false);
        setCampaignFollowUp(null);
        handleUseRecipe(r);
      }}
      className="rounded-lg border border-gulf-teal/30 bg-gulf-teal/10 px-3 py-1.5 text-xs text-gulf-teal transition-colors hover:bg-gulf-teal/20"
    >
      Next: {campaignFollowUp.label} →
    </button>
    <button
      type="button"
      aria-label="Dismiss"
      onClick={() => {
        setFollowUpArmed(false);
        setCampaignFollowUp(null);
      }}
      className="text-xs text-gray-500 hover:text-gray-300"
    >
      ✕
    </button>
  </span>
)}
```

(Note `handleUseRecipe(r)` AFTER clearing state — the new seed may itself be a campaign prompt; the capture at the top of `handleUseRecipe` re-evaluates. The weekly recipe is not a seed prompt, so the chip does not re-arm.)

- [ ] **Step 4: Verify**

Run: `bunx next build`
Expected: green. Manual check happens in Task 8's demo builds (the chip is exercised while building the demos).

- [ ] **Step 5: Commit**

```bash
git add components/email-lab/EmailLabGridShell.tsx
git commit -m "feat(email-lab): campaign follow-up chip — seeded build success offers the weekly step (agent-launch)"
```

---

### Task 8: build the four demo emails IN THE LAB + capture slides

**Files:**
- Create: `public/showcase/agent-launch/live/01-letter.html`, `02-headlines-vs-here.html`, `03-review-reply.html`, `04-set-it-once.html`, `thumb.webp`, `step-1.webp` … `step-4.webp`
- Modify: `scripts/capture-showcase.mjs` (add the agent-launch entry to its `SHOWCASES` list)

**Interfaces:**
- Consumes: everything from Tasks 1-7, the running dev server (`bun dev`), the Email Lab at `/email-lab/grid`.
- Produces: the committed demo assets Task 9's registry entry points at. THIS TASK IS THE DONE-WHEN PROOF: the look must come out of Sonnet in the lab without hand-editing the HTML. If it doesn't, iterate on Task 5's recipe wording (and only then on block renders) until it does — the recipe is the product.

- [ ] **Step 1: Build the announcement demo**

In the lab (paid grid shell), set brand: name Marisol Vega, brokerage Gulfline Realty, business address (fictional Bonita Springs address), photo = the AI-generated half-body professional portrait (generate once, save under `public/showcase/agent-launch/persona.png`; disclosed as AI-generated in Task 9's registry `disclosure`). Palette: primary `#1F4D3A`, accent `#A98A4E`, backdrop `#FBFAF7`, fonts PLAYFAIR_SERIF display / BOOK_SERIF body. Paste the announcement seed prompt (Task 9's `seedRecipe.prompt` — fill the blank with "Bonita Springs") and Build. Every figure must be real lake data; state the as-of date once, MM/DD/YYYY.

- [ ] **Step 2: Build the weekly demo**

Click the follow-up chip (proves Task 7 live) — fill the blank, Build. The national/Florida figure must carry a named source; the local figure comes from the menu.

- [ ] **Step 3: Build the reply-snapshot and schedule-step demos**

03 = the area snapshot the agent sends back to a REVIEW reply (build with a one-line snapshot prompt for one Bonita ZIP). 04 = capture the schedule confirm state (Market Pulse "ask" slide pattern — screenshot the lab's schedule step, not an email).

- [ ] **Step 4: Export + capture**

Copy HTML from the lab for 01-03 into the `live/` files (04 is a UI capture). Add to `capture-showcase.mjs`:

```js
{ id: "agent-launch", width: 700, files: ["01-letter.html", "02-headlines-vs-here.html", "03-review-reply.html"] },
{ id: "agent-launch", width: 1100, files: ["04-set-it-once.html"], startAt: 4 },
```

Run: `node scripts/capture-showcase.mjs` → webps land. Make `thumb.webp` (crop of step-1, match the existing showcases' thumb dimensions — check a sibling with `sharp` metadata or copy the crop code path).

- [ ] **Step 5: Commit**

```bash
git add public/showcase/agent-launch scripts/capture-showcase.mjs
git commit -m "feat(showcase): agent-launch demo assets — lab-built, captured (agent-launch)"
```

---

### Task 9: registry entry + campaign button live

**Files:**
- 🔴 Modify: `lib/showcase/registry.ts` (SHOWCASES array + key union), `lib/showcase/registry.test.ts` (exemptions if slides 3-4 carry no recipe), `lib/campaigns.test.ts` (live-count assertions)

**Interfaces:**
- Consumes: assets from Task 8, `followUp` type from Task 6.
- Produces: the fourth live campaign. `ShowcaseCampaign.key` union gains `"agent-launch"`. Button appears automatically via `liveCampaigns` in hub + Email Lab (zero component changes — verified: `CampaignQuickStart` renders from the selector).

- [ ] **Step 1: Extend the key union + add the showcase**

Key union: `key: "new-listing" | "newsletter" | "new-listing-socials" | "agent-launch";`

Append to `SHOWCASES` (follow the existing entries' shape exactly):

```ts
{
  id: "agent-launch",
  company: "Gulfline Realty · Bonita Springs",
  title: "Agent Launch: Day One, With Receipts",
  hook: "A brand-new agent introduces herself with a real market number — then the weekly update sends itself.",
  campaign: {
    key: "agent-launch",
    label: "Agent Launch Campaign",
    blurb: "Introduce yourself to your sphere with a real market insight — then a weekly update that sends itself.",
    status: "live",
    surface: "email",
    seedRecipe: {
      prompt:
        "Build my agent-launch announcement email introducing me to my sphere — open like a personal letter about why I got into real estate here, lead with one real market insight about [[your city or ZIP]], a short numbered what-happens-next of what I'll send each week, and one reply CTA. My photo sits beside the letter, not above it.",
      needs: ["agent_name", "photo_url", "brokerage", "business_address"],
    },
    followUp: {
      label: "schedule your weekly sphere update",
      recipe: {
        prompt:
          "Build a weekly sphere market update for [[your city or ZIP]] — one national or Florida headline number set beside my own area's number, one honest read of the gap, and end by inviting readers to reply with their address and the word REVIEW for their home's snapshot. Schedule it every Tuesday morning.",
        needs: ["agent_name", "brokerage", "business_address"],
      },
    },
  },
  cadenceRefresh: {
    daily: ["the live listing counts and asking prices near the reader"],
    weekly: ["the national-vs-local contrast figures"],
    monthly: ["the area's home-value trend line"],
  },
  accent: "#1F4D3A",
  thumb: "/showcase/agent-launch/thumb.webp",
  surfaces: ["email"],
  disclosure:
    "Demonstration campaign — Gulfline Realty and Marisol Vega are fictional (her portrait is AI-generated). The market data is real — SWFL Data Gulf (MM/DD/YYYY of the build).",
  slides: [
    /* 4 slides pointing at step-1..4.webp + live hrefs, each with
       whatsHappening / howAiHandled copy written from the REAL built demos;
       slides 1-2 carry `recipe` (the seed + weekly recipes above verbatim);
       slides 3-4 carry none (add their images to the registry.test recipe-
       exemption list if one exists — read the test first). */
  ],
},
```

(Write the real slide copy from what the lab actually produced — the howAiHandled lines must describe what the AI really did, with the real numbers it selected. Fix the disclosure date to the actual build date.)

- [ ] **Step 2: Update tests**

`lib/campaigns.test.ts`: any "3 live campaigns" assertions → 4; email-row assertions include `agent-launch`; the Task 6 followUp test's guarded branch now runs for real. `lib/showcase/registry.test.ts`: runs green because Task 8 committed the assets; add slide-recipe exemptions only if the test demands one per slide.

- [ ] **Step 3: Run the gates**

Run: `bun test lib/campaigns.test.ts lib/showcase/registry.test.ts && bunx next build`
Expected: PASS / green.

- [ ] **Step 4: Commit**

```bash
git add lib/showcase/registry.ts lib/campaigns.test.ts lib/showcase/registry.test.ts
git commit -m "feat(campaigns): Agent Launch — fourth quick-start campaign live (agent-launch)"
```

---

### Task 10: campaign provenance + blast send tags (operator-ratified full thread, 07/05/2026)

**Files:**
- Create: `docs/sql/20260705_deliverables_campaign_key.sql` (run via Bun.SQL — psql is NOT installed; creds in `.dlt/secrets.toml`, `sslmode=require`)
- Modify: `database-generated.types.ts` (~line 834 — deliverables Row/Insert/Update gain `campaign_key`)
- Modify: `app/api/projects/[id]/materials/route.ts` (POST accepts + stores `campaign_key`; PATCH untouched so doc edits never wipe provenance)
- 🟡 Modify: `components/email-lab/EmailLabGridShell.tsx` (`onSave` signature + call sites pass `campaignKey` from Task 7's state)
- Modify: `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` (`handleSave` forwards it — new-deliverable branch only)
- Modify: `app/api/deliverables/[id]/blast/route.ts:218-232` (`messageFor`)
- Test: `lib/email/blast-tags.test.ts` (create) + pure helper `lib/email/blast-tags.ts` (create)

**Interfaces:**
- Consumes: `campaignKey` state (Task 7), `deliverable.id` / `deliverable.template` / `deliverable.campaign_key` in the blast route.
- Produces: `blastTags(deliverableId: string, template: string, campaignKey?: string | null): { name: string; value: string }[]`. Resend tag rules (verified 07/05/2026, SDK + live docs): names/values ASCII letters, numbers, underscores, dashes only, ≤256 chars; tags ride BOTH `emails.send` and `batch.send`; the tag is included in webhook events — Build 2's data accrues from day one.

- [ ] **Step 1: Migration (idempotent) + verify**

`docs/sql/20260705_deliverables_campaign_key.sql`:

```sql
-- Campaign provenance for blast-send tagging (agent-launch build 1; Build 2's
-- results strip reads the Resend webhook events these tags unlock). Idempotent.
ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS campaign_key text;
COMMENT ON COLUMN public.deliverables.campaign_key IS
  'Quick-start campaign key that seeded this deliverable (ShowcaseCampaign.key, lib/showcase/registry.ts); null = not campaign-seeded.';
```

Run via the repo's Bun.SQL runner pattern (see prior `docs/sql/*` executions in git history). Verify:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='deliverables' AND column_name='campaign_key';
```

Expected: exactly one row.

- [ ] **Step 2: Generated types**

In `database-generated.types.ts` deliverables (~line 834): add `campaign_key: string | null;` to `Row` and `campaign_key?: string | null;` to `Insert` + `Update`, matching the file's existing style. (`database.types.ts`'s deliverables override only concerns `doc` — no change there.)

- [ ] **Step 3: Thread the save**

`EmailLabGridShell.tsx`: prop becomes `onSave?: (doc: EmailDoc, aiPrompt: string, campaignKey?: string | null) => Promise<string | void>`; every `onSave(doc, aiPrompt)` call site (~lines 820, 832, 1023) becomes `onSave(doc, aiPrompt, campaignKey)` (Task 7's provenance state).

`ProjectEmailLabClient.tsx` `handleSave(doc, prompt, campaignKey?)`: the NEW-deliverable POST body gains `campaign_key: campaignKey ?? null`; the PATCH branch stays untouched.

`app/api/projects/[id]/materials/route.ts` POST:

```ts
  const rawCampaign = typeof body?.campaign_key === "string" ? body.campaign_key.trim() : "";
  const campaignKey = /^[a-z0-9-]{1,40}$/.test(rawCampaign) ? rawCampaign : null;
```

and the insert object gains `campaign_key: campaignKey,`.

- [ ] **Step 4: Write the failing tag test**

```ts
// lib/email/blast-tags.test.ts
import { describe, expect, it } from "bun:test";
import { blastTags } from "./blast-tags";

describe("blastTags", () => {
  it("emits did + tpl tags, sanitized to Resend's charset", () => {
    expect(blastTags("123e4567-e89b-12d3-a456-426614174000", "block-canvas")).toEqual([
      { name: "did", value: "123e4567-e89b-12d3-a456-426614174000" },
      { name: "tpl", value: "block-canvas" },
    ]);
  });
  it("adds the campaign tag when the deliverable was campaign-seeded", () => {
    expect(blastTags("abc-123", "block-canvas", "agent-launch")).toContainEqual({
      name: "campaign",
      value: "agent-launch",
    });
  });
  it("null campaign = no campaign tag; strips characters outside [A-Za-z0-9_-]", () => {
    expect(blastTags("a b", "e!mail", null)).toEqual([
      { name: "did", value: "ab" },
      { name: "tpl", value: "email" },
    ]);
  });
});
```

- [ ] **Step 5: Run to verify failure, then implement**

```ts
// lib/email/blast-tags.ts — Resend outbound tags for agent blast sends.
// Build 2 (campaign results strip) reads these back off webhook events —
// verified 07/05/2026: tags ride emails.send AND batch.send, and "after the
// email is sent, the tag is included in the webhook event" (Resend docs).
// Charset: ASCII letters/numbers/underscores/dashes only (SDK Tag type).
const SAFE = /[^A-Za-z0-9_-]/g;

export function blastTags(
  deliverableId: string,
  template: string,
  campaignKey?: string | null,
): { name: string; value: string }[] {
  const tags = [
    { name: "did", value: deliverableId.replace(SAFE, "") },
    { name: "tpl", value: template.replace(SAFE, "") },
  ];
  const campaign = (campaignKey ?? "").replace(SAFE, "");
  if (campaign) tags.push({ name: "campaign", value: campaign });
  return tags;
}
```

Run: `bun test lib/email/blast-tags.test.ts` → PASS.

- [ ] **Step 6: Wire into the route**

In `messageFor`, add to the returned object (import the helper):

```ts
      tags: blastTags(id, deliverable.template, (deliverable as { campaign_key?: string | null }).campaign_key),
```

(After Step 2 the typed row carries `campaign_key` — drop the cast if the select's row type picks it up directly.) Both send paths (batch + per-recipient PDF) flow through `messageFor`, so one line covers both.

- [ ] **Step 7: Build + commit**

Run: `bun test lib/email/ && bunx next build` → green. (Live Resend payload inspection is operator-run under `agent_launch_campaign_live_verify` — no paid live send from this session.)

```bash
git add docs/sql/20260705_deliverables_campaign_key.sql database-generated.types.ts "app/api/projects/[id]/materials/route.ts" app/project/[id]/email-lab/ProjectEmailLabClient.tsx components/email-lab/EmailLabGridShell.tsx lib/email/blast-tags.ts lib/email/blast-tags.test.ts "app/api/deliverables/[id]/blast/route.ts"
git commit -m "feat(blast): campaign provenance column + campaign/deliverable Resend tags — Build 2 data accrues from day one (agent-launch)"
```

---

### Task 11: close the loop — checks, session log, full verify

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)
- Commands: checks ledger

- [ ] **Step 1: Open the two Validity product-flag checks**

```bash
node scripts/check.mjs open brain-platform scheduled_send_minute_jitter "Scheduled sends fire exactly on the hour — add minute jitter (Validity: ~70% of volume hits the first 10 min; notes doc §11)"
node scripts/check.mjs open brain-platform gmail_shared_from_unsub_audit "Verify Gmail Manage-Subscriptions one-click unsub on the shared From cannot blanket-suppress other agents' sends (notes doc §11)"
```

- [ ] **Step 2: Full verification pass**

Run: `bun test lib/email/ lib/campaigns.test.ts lib/showcase/ && bunx next build`
Expected: all green. Then exercise the flow once against the dev server (button → seed → build → chip → weekly seed → schedule confirm) and note the result honestly in the SESSION_LOG entry.

- [ ] **Step 3: SESSION_LOG entry + final commit**

Append a top entry: what shipped (tasks 1-10 one-liners), what's deferred (campaign_key column + results strip = Build 2; sphere wizard = Build 3; script font cut), the two new checks, and that `agent_launch_campaign_live_verify` stays OPEN until the operator verifies live.

```bash
git add SESSION_LOG.md
git commit -m "docs(session): agent-launch campaign build complete — live-verify pending"
```

STOP. Do not push — the operator pushes after review.

---

## Self-Review (done at write time)

- Spec coverage: §1 registry → T9; §2 recipes → T5 (announcement via agent-intro) + T9 (prompt strings); §3 recipe upgrade → T5; §4 chip → T6+T7; §5 L1 → T1+T2, L2 → T4 (incl. the applyBrand no-clobber guard), L3 → T3 (deviation 2 stands), L4 → T2 (incl. the PDF row-grouping fix — all three engines), L5 → cut (deviation 3); §6 tagging → T10 (FULL campaign-key thread, operator-ratified 07/05/2026), jitter → T11 check; §7 demos → T8; §8 design language → T8 brand settings. Testing section → per-task tests + T11 sweep. DONE-WHEN → T8 (Sonnet-look proof), T9 (button), T7/T8 (chip+schedule), T10 (campaign + deliverable tags — DONE-WHEN 4 now meetable), live-verify stays operator-run.
- Placeholders: none — every code step shows real code; two steps direct reading a neighboring fixture/export first (author-doc test fixture, compileGrid width mechanism) because inventing those names cold would be worse than reading them.
- Type consistency: `campaignFollowUpForPrompt` returns `{key,label,recipe}` (T6) and T7 consumes `.label`/`.recipe`; `followUp` = `{label, recipe}` in registry (T6/T9); `blastTags(id, template)` (T10) matches route call.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 6, Task 9 | `lib/showcase/registry.ts` |
| 🟡 | Task 7, Task 10 | `components/email-lab/EmailLabGridShell.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
