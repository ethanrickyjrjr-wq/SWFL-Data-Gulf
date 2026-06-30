import { test, expect } from "bun:test";
import { socialPostSystem } from "../build-week";
import { DAY_THEMES } from "../themes";

// Task 4 — caption provenance regression guard.
//
// The no-invention moat for social CAPTIONS is PROMPT-enforced, not code-enforced.
// The path is route -> buildWeek -> buildSocialPost -> socialPostSystem (the system
// prompt) -> Haiku -> tryParseSocial -> assembleDraft, and the model's caption is
// passed through VERBATIM: tryParseSocial / assembleDraft / buildVariants never
// inject, strip, or validate a figure. So the only thing standing between the model
// and a fabricated number is the four-lane block inside socialPostSystem — and the
// only thing a deterministic test can guard is that contract staying in the prompt.
//
// (This is weaker than renderSocialImage, which structurally omits a missing-stat
//  block. It is by design — README line 21 names the prompt as the caption mechanism
//  — so a future reader should NOT assume a post-parse code-level scrub exists.)
//
// The existing build-week.test.ts already asserts the four-lane rule with a NON-empty
// lake on Monday. The genuinely-unguarded case — and the one that maps to this task's
// "no value for a metric" — is an EMPTY lakeContext: the lake has no figure to cite.
// These tests pin that the prompt still routes the model to the lane-4 [Need: ...]
// gate instead of letting it invent.

const monday = DAY_THEMES[0];

test("no lake data -> the prompt still routes to lane-4 [Need:], never invents", () => {
  // Empty lakeContext IS "the lake holds no value for this metric": the REAL LAKE
  // DATA block collapses to "" (so no empty/fabricated data header is injected), yet
  // the four-lane ladder, the hard no-invention block, and the [Need: ...] gate all
  // remain — the model is told to flag the gap, not fill it with an invented number.
  const sys = socialPostSystem("", monday.systemAddendum);
  expect(sys).not.toContain("REAL LAKE DATA"); // no empty/fake data block injected
  expect(sys).toContain("four lanes"); // sourcing ladder present
  expect(sys).toContain("invented number"); // the one hard block
  expect(sys).toContain("[Need:"); // lane-4 gate: flag the gap, never invent
});

test("the four-lane moat survives the Task-3 opts layering in the no-data path", () => {
  // Per-network + goal/tone knobs reshape the prompt; guard that the reshape can never
  // strip the no-invention contract out of the no-lake-data path it most matters in.
  const sys = socialPostSystem("", monday.systemAddendum, {
    platforms: ["x", "linkedin"],
    goalTone: { goal: "leads", tone: "professional" },
  });
  expect(sys).toContain("four lanes");
  expect(sys).toContain("invented number");
  expect(sys).toContain("[Need:");
});

test("the no-invention contract is theme-independent (every day theme, no lake data)", () => {
  // Cheap belt: a refactor that moved the four-lane block into a per-theme branch
  // would silently drop the moat for some days; this catches that.
  for (const theme of DAY_THEMES) {
    const sys = socialPostSystem("", theme.systemAddendum);
    expect(sys).toContain("four lanes");
    expect(sys).toContain("invented number");
    expect(sys).toContain("[Need:");
  }
});
