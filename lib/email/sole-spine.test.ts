// Regression tripwire (invention-surface-guards §D): SteadyAPI is the SOLE
// listings source. No artifact surface may reference the dead scrape view again.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["lib/email", "lib/social", "lib/deliverable", "lib/listings"];
const DEAD_VIEW = "active_listings_residential";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("sole spine", () => {
  test("no artifact surface reads the dead scrape view", () => {
    const offenders = ROOTS.flatMap(walk).filter((f) =>
      readFileSync(f, "utf8").includes(DEAD_VIEW),
    );
    expect(offenders).toEqual([]);
  });
});
