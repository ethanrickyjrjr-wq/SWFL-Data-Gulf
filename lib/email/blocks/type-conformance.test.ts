// lib/email/blocks/type-conformance.test.ts
//
// THE LINTER THE RESEARCH ASKED FOR ON 07/01/2026 AND NOBODY BUILT.
//
// ── WHERE THIS RULE COMES FROM (gitignored; Grep cannot see it — open it by path) ──
//
// `_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md`
//
//   §1.3, sourced live from sampiercelolla.com/tips-for-getting-llms-to-write-good-ui-code:
//     "Remove LLM footguns from the schema itself... replace freeform styling props with
//      closed semantic enums. LLMs will use whatever props are available to them, so design
//      your component API accordingly."
//     ...and its companion instruction: add "a linter pass the LLM can run and self-correct
//     against," explicitly naming THIS repo's `spec-validator` / `facts-only-lint` gates as
//     the pattern to mirror.
//
// A raw `fontSize: "11px"` string IS that footgun. `scale.ts` gives us seven sizes, three
// weights and three leadings — and then every block component can ignore all of it by typing
// a string, because a CSS property is `string | number` and TypeScript has nothing to say.
//
// ── WHY A TEST AND NOT A TYPE ─────────────────────────────────────────────────
//
// Spacing IS compiler-enforced: `Space` is a union, so an off-grid number where a `Space` is
// expected does not compile. Type cannot be done the same way — React's `CSSProperties`
// declares `fontSize?: string | number`, and we do not own that interface. So the enforcement
// has to live here, in the same place the layout ledger already lives
// (`design-system-reachability.test.ts`), and for the same reason: shape is trivial to fake,
// so test the thing that actually rots.
//
// ── WHAT WAS FOUND WHEN THIS FILE WAS FIRST RUN (08/04/2026) ─────────────────
//
//   SourcesBlock.tsx:106  fontSize "11px" + lineHeight "1.6"  — SHIPPED TO INBOXES. 11 is not
//                         one of the seven sizes; 1.6 is not one of the three leadings. Line 94
//                         of the same file does it correctly with `text("mono")`, so the
//                         "Sources (n)" summary rendered at 12/1.4 directly above its own links
//                         at 11/1.6.
//   ImageBlock.tsx:82     fontWeight "700" overriding a correct `text("h2")` — SHIPPED. The doc
//                         states three weights (600/500/400). 700 is not one of them. This is a
//                         survivor of the 07/14 measurement: "30 fontWeight declarations, ZERO
//                         compliant, all 600/700/800."
//   OpenSlot.tsx          six raw sizes (13/11/11/12/12/12) + three raw `fontWeight: 600`.
//                         Canvas-only — never sent — but it is what the operator looks at while
//                         building, so the unevenness is visible to him if not to a recipient.
//
// ── THE ONE LEGAL RAW VALUE ──────────────────────────────────────────────────
//
// `fontSize: 0` / `lineHeight: 0` is not typography — it is the whitespace-killer idiom that
// closes the gap browsers insert between inline-block columns and table cells (see
// ListingGridBlock.tsx:105, MetricCardBlock.tsx:107). Zero is allowed. Nothing else is.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BLOCKS_DIR = "lib/email/blocks";
/** The whole email tree — the palette guard at the bottom scans here, because the defect it
 *  exists to stop (a replacement palette in `lifecycle-chrome.ts`) was never in a block. */
const EMAIL_DIR = "lib/email";

/** Raw font size that is not the legal `0` whitespace-killer. */
const RAW_SIZE = /fontSize:\s*(?!0\s*[,}\n])['"`]?[1-9]/;
/** Any raw numeric weight. Every weight must come from WEIGHT.* via `text()`. */
const RAW_WEIGHT = /fontWeight:\s*['"`]?[1-9]\d\d/;
/** Raw leading that is not the legal `0`. `text()` always supplies one. */
const RAW_LEADING = /lineHeight:\s*(?!0\s*[,}\n])['"`]?[1-9]/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/** A comment line. These files DOCUMENT the banned numbers on purpose — ListBlock.tsx
 *  explains the `lineHeight: "24px"` magic number it removed — and a guard that fires on
 *  its own postmortem teaches people to delete the postmortem. Prose is not code. */
const isComment = (line: string): boolean => /^\s*(\/\/|\*|\/\*)/.test(line);

/** Strip a TRAILING `// …` comment so a guard cannot fire on prose sitting beside code.
 *  `md: CARD_PAD, // the doc's "Card padding: 24"` is compliant code whose comment quotes
 *  the design doc — and the bare-number spacing guard matched the quotation, not the value.
 *  The `\s` before `//` is what keeps a `https://` inside a string literal intact. */
const stripTrailingComment = (line: string): string => line.replace(/(^|\s)\/\/.*$/, "$1");

/** Every line of `src` matching `re`, as "file:line — trimmed source". */
function hits(rel: string, src: string, re: RegExp): string[] {
  return src
    .split("\n")
    .map((line, i) =>
      !isComment(line) && re.test(stripTrailingComment(line))
        ? `${rel}:${i + 1} — ${line.trim()}`
        : null,
    )
    .filter((x): x is string => x !== null);
}

function scan(re: RegExp): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(BLOCKS_DIR)) {
    const rel = file.split("\\").join("/");
    // scale.ts IS the scale — it is the one file allowed to state the numbers.
    if (rel.endsWith("blocks/scale.ts")) continue;
    found.push(...hits(rel, readFileSync(file, "utf8"), re));
  }
  return found;
}

describe("type conformance — every block reads the scale, none restates it", () => {
  it("no block hand-types a font size", () => {
    expect(scan(RAW_SIZE)).toEqual([]);
  });

  it("no block hand-types a font weight", () => {
    // The scale's own override channel is `text(role, { weight: WEIGHT.display })` — a real
    // weight from the design doc, by name. A raw 700 is not reachable that way, which is the
    // whole point: you cannot pick a weight the document does not state.
    expect(scan(RAW_WEIGHT)).toEqual([]);
  });

  it("no block hand-types a line height", () => {
    // The bug this closes is the original one: a text node with no leading silently inherits
    // @react-email's injected ABSOLUTE 24px box, which is what clipped every 36px stat.
    // A hand-typed leading is the same failure wearing a number.
    expect(scan(RAW_LEADING)).toEqual([]);
  });
});

// ── THE SPACING GUARD — added 08/05/2026 ─────────────────────────────────────
//
// Operator, after a session that fixed the font and the type sizes: *"internal ≤ external
// spacing has no guard."* True, and the honest answer has TWO halves, only one of which is
// a guard. Both are stated here so nobody reports this as finished.
//
// ── HALF ONE: THE 8px GRID. There WAS a hole, and this closes it. ────────────
//
// The header of this file says "Spacing IS compiler-enforced: `Space` is a union, so an
// off-grid number where a `Space` is expected does not compile." That sentence is true and
// it was NOT the whole picture, in the exact way the fontFamily gap was not: the union only
// binds where a `Space` is actually expected. `padding` on a CSSProperties object is
// `string | number`, so a block can bypass the union entirely by typing the string itself —
// and fourteen places did:
//
//   OpenSlot.tsx           ×8   padding "32px 24px" / "8px 12px" / "4px 8px" ×2,
//                               margin "12px" / "0 0 8px" / "0 0 12px", marginBottom "8px"
//   ListingGridBlock.tsx   ×2   paddingBottom "16px", padding `${CARD_INSET}px`
//   FooterBlock.tsx        ×1   marginRight "12px"
//   MultiColumnBlock.tsx   ×1   marginBottom "8px"
//   SourcesBlock.tsx       ×1   margin "0 0 4px"
//
// **MEASURED BEFORE FIXING: every one of those values was already ON the grid** (4, 8, 12,
// 16, 24, 32 are all `Space` tokens). So this guard found no bad pixel — it found that
// nothing would have stopped one. `padding: "13px"` compiled fine in any of those files
// yesterday. That is the same shape as the fontFamily defect: not a wrong value on screen,
// a channel with no gate on it. All fourteen now route through `pad()`/`space()`, so the
// union is the ONLY way a spacing value enters a block.
//
// LEGAL RAW VALUES, both deliberate and neither a grid measurement:
//   • `margin: "0 auto"` — horizontal centering of the 600px container. A keyword, not a gap.
//   • `paddingY: "lg"` — the blocks' own semantic size enum (a prop, not a CSS value); it
//     resolves through `sectionPad()`, which is `Space`-typed.
//
// ── HALF TWO: INTERNAL ≤ EXTERNAL. STILL NOT GUARDED. STILL NOT IMPLEMENTABLE. ──
//
// `_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md`
// §1.1 (cieden, grounded in Gestalt proximity): "the space around elements (external) should
// be equal to or, ideally, greater than the space within them." This is the rule that makes
// a reader see two blocks as ONE group or as TWO.
//
// **It cannot be checked, because one of its two terms does not exist.** `compile-grid.ts`
// lines 130–131 state it outright: the 8px `GRID_MARGIN` gutter "is not reproduced in the
// email (column px come from `colSpanToPx`, which is gutter-agnostic)." The compiler emits
// no between-block margin at all, so the EXTERNAL term is structurally zero on every email
// ever sent from here, and all rhythm comes from each block's own `sectionPad`. A guard
// comparing internal to a constant zero would fail every block in the codebase and tell you
// nothing about grouping.
//
// A nesting-walk over the rendered HTML with an allowlist of today's failures was designed
// and REJECTED 08/05/2026: it would report a decorative pass while the actual rule — do two
// adjacent blocks read as one group — remained unexpressible. Calling that "implemented"
// is the partial-reported-as-whole defect (RULE 0.8). It stays ⚠ OPEN, with the reason.
//
// Fixing it for real means giving the compiler a between-block spacing term, which is a
// LAYOUT-GRAMMAR change to every email at once — the per-email walk in PART 2 of the
// playbook, not a lint. Do not "fix" it by inventing a margin in a block.
describe("spacing conformance — every block reads the grid, none restates it", () => {
  // `margin: "0 auto"` is centering, not a gap: the keyword is what makes it legal, and the
  // lookahead below is what lets it through while still failing `margin: "0 12px"`.
  const RAW_PADDING = /padding(?:Top|Right|Bottom|Left)?:\s*["'`]/;
  const RAW_MARGIN = /margin(?:Top|Right|Bottom|Left)?:\s*["'`](?!0 auto["'`])/;
  // A template literal is the sneakier form of the same bypass — `` `${CARD_INSET}px` ``
  // reads as principled because the number has a name, and still never meets the union.
  const TEMPLATE_SPACE = /(?:padding|margin)(?:Top|Right|Bottom|Left)?:\s*`/;

  it("no block hand-types a padding", () => {
    expect(scan(RAW_PADDING)).toEqual([]);
  });

  it("no block hand-types a margin", () => {
    expect(scan(RAW_MARGIN)).toEqual([]);
  });

  it("no block builds a spacing value in a template literal", () => {
    expect(scan(TEMPLATE_SPACE)).toEqual([]);
  });

  it("no block hand-types a bare spacing number", () => {
    // `margin: 0` is legal everywhere and is used ~20 times to kill @react-email's default
    // paragraph margin — absence of space needs no token. Any OTHER bare number is the same
    // bypass without the quotes (`marginTop: 8`, SourcesBlock.tsx:101).
    const RAW_NUMBER = /(?:padding|margin)(?:Top|Right|Bottom|Left)?:\s*[1-9]/;
    expect(scan(RAW_NUMBER)).toEqual([]);
  });
});

// ── THE FONT-FAMILY GUARD — added 08/05/2026 ─────────────────────────────────
//
// Operator, on a rendered New Listing email: *"how can we have different fonts if we have
// rules?"* The honest answer was that the three rules above cover SIZE, WEIGHT and LEADING
// and nothing covered FONT FAMILY. So `lifecycle-chrome.ts` could — and did — overwrite
// `globalStyle.fontFamily` and `displayFontFamily` with serif on every listing email, and
// every guard we own passed. Counted in the rendered artifact: our teal appeared ZERO times
// and every font declaration was Georgia/Times.
//
// A rule that lives only in a document is not a rule. This is the mechanism.
//
// SCOPE, deliberately: this fails a hardcoded family in a BLOCK. Blocks render; they must
// take the family from the doc's `globalStyle` like every other brand value. The stacks
// themselves live in the font root, and `scale.ts` is exempt for the same reason it is
// exempt above — it is the one file allowed to state the values.
describe("brand conformance — no block invents a typeface", () => {
  it("no block hand-types a font family", () => {
    // Any literal CSS font stack: a quoted family name followed by a fallback keyword, or a
    // bare `serif`/`sans-serif`/`monospace` assigned to fontFamily.
    const RAW_FAMILY =
      /fontFamily\s*:\s*["'`](?!\$\{)[^"'`]*(?:serif|sans-serif|monospace|Georgia|Arial|Helvetica|Times|Playfair|Inter)/i;
    expect(scan(RAW_FAMILY)).toEqual([]);
  });
});

// ── AND THE GUARD THAT WOULD ACTUALLY HAVE CAUGHT IT ─────────────────────────
//
// The block-level check above is necessary and was NOT sufficient: the real defect lived in
// `lifecycle-chrome.ts`, which is not a block. It declared a whole replacement palette
// (`EDITORIAL_STYLE`) and spread it over the doc's `globalStyle`, swapping both typefaces and
// every colour. No block hardcoded anything; the brand was replaced one level up.
//
// So this asserts the rule where it was broken: OUTSIDE the two files that legitimately
// define the brand, nothing may assign a `fontFamily`/`displayFontFamily` or hand-write a
// palette hex into a globalStyle. `DEFAULT_GLOBAL_STYLE` (default-docs.ts) is the brand;
// `applyBrand` (brand/) applies the USER's. Everything else consumes.
describe("brand conformance — nothing outside the brand root replaces the palette", () => {
  // The files that legitimately DEFINE a palette, each for a stated reason:
  //   default-docs.ts   — DEFAULT_GLOBAL_STYLE, the SWFL brand itself.
  //   brand/            — applyBrand, which lays the USER's brand over a doc.
  //   scale.ts          — the type scale, the one file allowed to state type values.
  //   types.ts          — the FontFamily union.
  //   skeleton-style.ts — NEUTRAL_SKELETON_STYLE: a deliberately neutral slate palette for
  //                       auto-seeded docs, so an unbranded send does not read as OURS in
  //                       disguise. It keeps MODERN_SANS, so it changes colour and never type.
  //                       That is the opposite of the deleted editorial palette, which
  //                       replaced BOTH on docs that already carried a brand.
  const BRAND_ROOTS = [
    "doc/default-docs.ts",
    "brand/",
    "blocks/scale.ts",
    "doc/types.ts",
    "doc/skeleton-style.ts",
  ];

  function scanTree(dir: string, re: RegExp): string[] {
    const found: string[] = [];
    for (const file of sourceFiles(dir)) {
      const rel = file.split("\\").join("/");
      if (BRAND_ROOTS.some((r) => rel.includes(r))) continue;
      if (rel.includes(".test.")) continue;
      found.push(...hits(rel, readFileSync(file, "utf8"), re));
    }
    return found;
  }

  it("no file outside the brand root assigns a typeface into a style object", () => {
    // `fontFamily: "BOOK_SERIF" as FontFamily` — the exact shape of the deleted palette.
    const ASSIGNS_FAMILY = /(?:display)?[fF]ontFamily\s*:\s*["'`][A-Z_]+["'`]/;
    expect(scanTree(EMAIL_DIR, ASSIGNS_FAMILY)).toEqual([]);
  });
});
