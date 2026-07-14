// lib/email/design-system-reachability.test.ts
//
// THE GUARD THAT MAKES THE DESIGN SYSTEM REACHABLE.
//
// The postmortem's finding was not "the fences are wrong." It was that the fences bound
// exactly ONE code path — the AI author — and every other builder hand-positioned its own
// blocks, so the layout research was law for the model and a suggestion for us.
//
// A conformance test cannot catch that, and this is the trap worth naming: a flat stack of
// full-width cards is PERFECTLY conformant. Every row sums to 12. Nothing is out of bounds.
// It passes any structural assertion you can write — and it is exactly the email the layout
// system was bought to eliminate. Shape is trivial to fake. So this file tests PROVENANCE:
// not "does the doc look right" but "did the doc come out of the seam."
//
// Two levers, and they cover different failures:
//
//   1. THE MARKER (runtime) — `finalizeDoc` stamps every doc it returns. A doc without the
//      stamp was hand-assembled, however good it looks.
//   2. THE LEDGER (source) — the exact set of files still allowed to write a `layout` literal.
//      A NEW file that hand-positions fails this test. That is the whole point: you cannot
//      quietly build the eighth bypass.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { finalizeDoc, wentThroughSeam } from "./doc/finalize-doc";
import type { PlanEntry } from "./doc/finalize-doc";
import { buildLifecycleEmail } from "./lifecycle-chrome";
import { applyBrand } from "./brand/apply-brand";
import { DEFAULT_GLOBAL_STYLE } from "./doc/default-docs";
import type { EmailDoc } from "./doc/types";

const entry = (over: Partial<PlanEntry> = {}): PlanEntry => ({
  type: "text",
  span: 12,
  newRow: true,
  props: { body: "x" },
  ...over,
});

const plan = (entries: PlanEntry[]) => ({ globalStyle: DEFAULT_GLOBAL_STYLE, entries });

describe("the marker — provenance, not shape", () => {
  it("stamps a doc that came out of the seam", () => {
    expect(wentThroughSeam(finalizeDoc(plan([entry()])))).toBe(true);
  });

  it("does NOT stamp a hand-assembled doc — even a perfectly conformant one", () => {
    // A flat w:12 stack. Every row sums to 12. Structurally impeccable. Never went through
    // the seam. THIS is the doc the old conformance test would have waved through.
    const handBuilt: EmailDoc = {
      globalStyle: DEFAULT_GLOBAL_STYLE,
      blocks: [
        { id: "a", type: "text", props: { body: "x" }, layout: { x: 0, y: 0, w: 12, h: 1 } },
        { id: "b", type: "text", props: { body: "y" }, layout: { x: 0, y: 1, w: 12, h: 1 } },
      ] as EmailDoc["blocks"],
    };
    expect(wentThroughSeam(handBuilt)).toBe(false);
  });

  it("survives the spreads the recipes actually do (applyBrand, {...doc})", () => {
    // The marker is a Symbol: dropped by JSON.stringify (so it never reaches the database or
    // the schema) but carried by object spread — which is how every recipe post-processes its
    // doc. If this breaks, the guard silently passes nothing and the whole file is theatre.
    const doc = finalizeDoc(plan([entry()]));
    expect(wentThroughSeam({ ...doc })).toBe(true);
    expect(wentThroughSeam(applyBrand(doc))).toBe(true);
  });
});

describe("the seam is the only thing that writes a position", () => {
  it("the AI author path is stamped", async () => {
    const { assembleAuthoredDoc } = await import("./author-doc");
    const doc = assembleAuthoredDoc({
      authored: { blocks: [{ type: "text", body: "Hello" }] },
      figuresById: new Map(),
      globalStyle: DEFAULT_GLOBAL_STYLE,
      anchorNumbers: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(wentThroughSeam(doc)).toBe(true);
  });

  it("the lifecycle chrome — and therefore all seven listing emails — is stamped", () => {
    const doc = buildLifecycleEmail(
      { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [] },
      {
        ribbon: "Coming Soon",
        photo: null,
        heroValue: "$1,000,000",
        heroLabel: "326 Shore Dr",
        specs: [{ label: "Beds", value: "3" }],
        ctaLabel: "Ask about it",
      },
    );
    expect(wentThroughSeam(doc)).toBe(true);
    // Every block positioned — nothing sinks to the y = 1_000_000 fallback in row-grouping.
    for (const b of doc.blocks) expect(b.layout).toBeDefined();
  });

  it("a lifecycle plan with real heights keeps its bands non-overlapping", () => {
    // row-grouping.ts groups by BAND OVERLAP (y < rowBottom). If the seam ever advanced y by
    // anything other than the row's tallest block, the header and the ribbon would merge into
    // one two-column row. This is the invariant that makes the one height policy safe.
    const doc = finalizeDoc(
      plan([
        entry({ type: "header", props: {}, height: 2 }),
        entry({ type: "hero", props: {}, height: 1 }),
        entry({ type: "image", props: {}, height: 6 }),
      ]),
    );
    const bands = doc.blocks.map((b) => [b.layout!.y, b.layout!.y + b.layout!.h] as const);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i][0]).toBeGreaterThanOrEqual(bands[i - 1][1]);
    }
  });

  it("an author plan (no heights) still lands on the uniform h:1 ladder", () => {
    const doc = finalizeDoc(plan([entry(), entry(), entry()]));
    expect(doc.blocks.map((b) => b.layout!.h)).toEqual([1, 1, 1]);
    expect(doc.blocks.map((b) => b.layout!.y)).toEqual([0, 1, 2]);
  });
});

// ── THE LEDGER ───────────────────────────────────────────────────────────────
//
// Every file below still writes its own `layout` literal — it has NOT been converted to the
// seam. This list is the remaining debt, written down, and it MAY ONLY SHRINK. Adding a file
// to it requires deleting this comment, which is the point: the next session that wants to
// hand-position an email has to argue with a red test first.
//
// The seven listing recipes are deliberately absent — they were the whole job, and they now
// hand `finalizeDoc` a plan. Do not put them back.

const KNOWN_BYPASS = new Set([
  // The concoctions subsystem — chart blocks placed into an existing doc, not a doc builder.
  "lib/concoctions/chart-block.ts",
  "lib/concoctions/defs/asking-price-trend.ts",
  "lib/concoctions/defs/corridor-profiles.ts",
  "lib/concoctions/defs/nfip-storm-years.ts",
  "lib/concoctions/defs/zip-listing-activity.ts",
  "lib/concoctions/materialize.ts",
  "lib/concoctions/place-blocks.ts",
  "lib/concoctions/types.ts",
  "lib/concoctions/user-bundle.ts",
  // The three recipes that still carry a private push() closure. NEXT.
  "lib/deliverable/recipes/agent-brand-intro.ts",
  "lib/deliverable/recipes/review-reply.ts",
  "lib/deliverable/recipes/sphere-weekly.ts",
  // Post-hoc compaction — reads an EXISTING layout to close a gap; writes no new position.
  "lib/deliverable/recipes/shared.ts",
  // A one-off doc builder, not on the campaign chrome.
  "lib/email/showing-prep-doc.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe("the ledger — nobody builds a new one", () => {
  it("no NEW file hand-positions a block", () => {
    const roots = ["lib/email", "lib/deliverable", "lib/concoctions"];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const rel = file.split("\\").join("/");
        // The seam itself is the one place allowed to write a position.
        if (rel.endsWith("lib/email/doc/finalize-doc.ts")) continue;
        // The 27 starter templates are hand-designed layouts the operator owns as CHOICES,
        // not builders. They are data, not a code path that assembles an email.
        if (rel.endsWith("lib/email/doc/default-docs.ts")) continue;
        if (rel.endsWith("lib/email/doc/grid-layouts.ts")) continue;
        if (rel.endsWith("lib/email/doc/saved-layout.ts")) continue;
        if (KNOWN_BYPASS.has(rel)) continue;
        if (/layout:\s*\{/.test(readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the ledger only shrinks — every entry still exists and still bypasses", () => {
    // A stale entry is worse than none: it grants a permanent exemption to a file that no
    // longer needs it, and the next hand-positioner inherits the hole.
    for (const rel of KNOWN_BYPASS) {
      expect(/layout:\s*\{/.test(readFileSync(rel, "utf8"))).toBe(true);
    }
  });

  it("the lifecycle chrome cannot write a position", () => {
    const src = readFileSync("lib/email/lifecycle-chrome.ts", "utf8");
    expect(src).not.toMatch(/layout:\s*\{/);
    expect(src).not.toMatch(/function at\b/); // the old positioner. It is gone. Keep it gone.
  });

  it("no listing recipe writes a position", () => {
    const recipes = [
      "coming-soon",
      "new-listing",
      "open-house",
      "price-reduced",
      "under-contract",
      "just-sold",
      "market-comps",
    ];
    for (const r of recipes) {
      const src = readFileSync(`lib/deliverable/recipes/${r}.ts`, "utf8");
      expect({ recipe: r, positions: /layout:\s*\{/.test(src) }).toEqual({
        recipe: r,
        positions: false,
      });
    }
  });
});
