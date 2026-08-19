// lib/listings/street-compare-root.test.ts
//
// THE ONE-ROOT RATCHET FOR STREET COMPARISON. Born 08/19/2026, operator verbatim:
// "WE SET IT UP TO START ALL THE SAME... IT'S DOCUMENTED, REPEATED BACK TO ME OVER
// AND OVER... THIS WON'T WORK EITHER" — said about a PROSE rule, and he was right:
// the compound-word street bug (Park Shore ≢ Parkshore) was fixed on 08/06 in one
// file while the SAME raw `canonStreet(a) === canonStreet(b)` compare sat in three
// more, because nothing in code stopped a new compare site from being written.
//
// A rule only in a doc is not a rule. This test IS the rule: every street-equality
// compare in the repo goes through `sameCanonStreet` (lib/listings/resolve-subject.ts,
// the ONE root — space-insensitive full equality, never a despaced prefix). Any new
// raw equality on canonStreet output fails this test with the file:line and the fix.
//
// Same ratchet family as lib/testing/mock-restore-ratchet.test.ts and
// .github/scripts/workflow-step-shape.test.mjs: a scan, not a convention.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO = join(import.meta.dir, "..", "..");

/** Where product code lives. Scripts and tests may compare however they need to;
 *  the defect class is a SHIPPED surface silently missing a match. */
const SCAN_DIRS = ["lib", "app", "components", "refinery"];

/** The one file allowed to compare canonical streets directly: the root itself. */
const ROOT_FILE = "lib/listings/resolve-subject.ts";

/** A raw equality against canonStreet output — the exact shape that shipped the
 *  Parkshore empty-skeleton email. Catches both operand orders and both polarities:
 *    canonStreet(x) === y   ·   canonStreet(x) !== y
 *    y === canonStreet(x)   ·   y !== canonStreet(x)
 */
const RAW_COMPARE = /canonStreet\s*\([^)]*\)\s*[!=]==|[!=]==\s*canonStreet\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name) && !/\.test\.(ts|tsx|mts)$/.test(name)) out.push(p);
  }
  return out;
}

describe("street comparison has ONE root — sameCanonStreet", () => {
  test("the detector recognizes the three real lines that shipped the 08/19 defect", () => {
    // The exact offending lines fixed 08/19/2026 (just-sold ×2, list-date) plus the
    // resolver's original. If the regex ever rots, this fails before the scan lies.
    const offenders = [
      "      (!self || canonStreet(c.addressLine) !== self) &&",
      "  return comps.find((c) => canonStreet(c.addressLine) === self) ?? null;",
      "    const self = nearby.find((c) => canonStreet(c.addressLine) === target);",
      '    return rc === target || rc.startsWith(target + " ")'.replace(
        "rc === target",
        "canonStreet(r.addressLine) === target",
      ),
    ];
    for (const line of offenders) expect(RAW_COMPARE.test(line)).toBe(true);
    // And it does NOT flag the sanctioned root call — the fix itself must scan clean.
    expect(RAW_COMPARE.test("sameCanonStreet(canonStreet(p.addressLine), target)")).toBe(false);
  });

  test("no product file compares canonStreet output raw — route through sameCanonStreet", () => {
    const hits: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(REPO, dir))) {
        const rel = relative(REPO, file).replace(/\\/g, "/");
        if (rel === ROOT_FILE) continue; // the root implements the rule; it may compare
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (RAW_COMPARE.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim()}`);
        });
      }
    }
    // A hit means a NEW street-compare lane is being written. Do not widen this test's
    // allowlist — import sameCanonStreet from lib/listings/resolve-subject.ts instead.
    // That is the whole rule: one root, or red.
    expect(hits).toEqual([]);
  });
});
