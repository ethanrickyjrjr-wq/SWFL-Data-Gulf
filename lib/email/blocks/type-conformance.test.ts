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

/** Every line of `src` matching `re`, as "file:line — trimmed source". */
function hits(rel: string, src: string, re: RegExp): string[] {
  return src
    .split("\n")
    .map((line, i) =>
      !isComment(line) && re.test(line) ? `${rel}:${i + 1} — ${line.trim()}` : null,
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
