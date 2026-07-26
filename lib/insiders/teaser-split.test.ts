// lib/insiders/teaser-split.test.ts
// Failure modes covered (spec §Failure modes #1, #6): full-issue leak,
// re-press structure drift. Leak sentinels run against the REAL artifact.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitTeaser, lastResortTeaser } from "./teaser-split";

const artifact = readFileSync(
  join(process.cwd(), "content", "insiders", "issue-2026-07.html"),
  "utf8",
);

const GATED_SENTINELS = [
  "Dated. Graded next issue.", // The Watch
  "Every call above, preregistered.", // falsifier ledger
  "Count what you just read.", // Receipts closer
  "this page never changes after publication", // colophon footer text
];

describe("splitTeaser on the real committed artifact", () => {
  const teaser = splitTeaser(artifact);

  test("splits successfully", () => {
    expect(teaser).not.toBeNull();
  });

  test("free content survives: masthead + full Tape + Lead opening", () => {
    expect(teaser!).toContain("Fifteen numbers, cold.");
    expect(teaser!).toContain("The bottom is falling twice as fast as the top.");
    expect(teaser!).toContain("starter-tier homes is down");
  });

  test("LEAK SENTINELS: no gated section reaches the teaser", () => {
    for (const s of GATED_SENTINELS) {
      expect(teaser!).not.toContain(s);
    }
  });

  test("cut is after exactly two lead paragraphs", () => {
    const leadBodyStart = teaser!.indexOf('<div class="lead-body">');
    expect(leadBodyStart).toBeGreaterThan(-1);
    // Count only up to the gate — the gate block has its own </p> tags.
    const gateStart = teaser!.indexOf('id="continue"');
    expect(gateStart).toBeGreaterThan(leadBodyStart);
    const leadRegion = teaser!.slice(leadBodyStart, gateStart);
    expect(leadRegion.split("</p>").length - 1).toBe(2);
  });

  test("gate block present: capture form posts to subscribe with gate source", () => {
    expect(teaser!).toContain("/api/insiders/subscribe");
    expect(teaser!).toContain("issue-001-gate");
    expect(teaser!).toContain('id="continue"');
    expect(teaser!).toContain("<noscript>");
  });

  test("document is re-closed", () => {
    expect(teaser!.trimEnd().endsWith("</html>")).toBe(true);
  });
});

describe("splitTeaser structure drift (fail closed)", () => {
  test("returns null when the tape/lead structure is missing", () => {
    expect(splitTeaser("<html><body><p>not the issue</p></body></html>")).toBeNull();
    expect(splitTeaser("")).toBeNull();
  });

  test("returns null when lead-body has fewer than two paragraphs", () => {
    const stub =
      '<html><body><div class="sheet"><section class="tape"><h2>t</h2></section>' +
      '<section><div class="lead-body"><p>only one</p></div></section></div></body></html>';
    expect(splitTeaser(stub)).toBeNull();
  });
});

describe("lastResortTeaser", () => {
  test("contains the gate, no issue content", () => {
    const t = lastResortTeaser();
    expect(t).toContain("/api/insiders/subscribe");
    expect(t).not.toContain("Fifteen numbers, cold.");
    expect(t.trimEnd().endsWith("</html>")).toBe(true);
  });
});
