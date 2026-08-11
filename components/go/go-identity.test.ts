// components/go/go-identity.test.ts
//
// /go is the white-label launch surface. Its identity has been stripped by decree
// once already (aab70433, 08/10/2026: "just get rid of swfl data gulf and logo")
// and the SESSION_LOG records the same wordmark creeping back onto adjacent
// surfaces three separate times. A rule in a doc is not a rule — this is the rule.
//
// Each test is named after the failure mode it stops.
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir);

function goSourceFiles(): string[] {
  return readdirSync(DIR).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
}

describe("/go carries no SWFL Data Gulf identity", () => {
  it("FM1: the banned wordmark never reappears in a /go component", () => {
    const offenders: string[] = [];
    for (const f of goSourceFiles()) {
      const src = readFileSync(join(DIR, f), "utf8");
      // Strip line comments — this file's own decree prose names the wordmark.
      const code = src
        .split("\n")
        .map((l) => l.replace(/^\s*(\/\/|\*|\/\*).*$/, ""))
        .join("\n");
      if (/SWFL\s*Data\s*Gulf/i.test(code)) offenders.push(f);
    }
    expect(
      offenders,
      `SWFL Data Gulf is banned on /go — found in: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("FM2: no logo, mark, or image of any kind renders on /go", () => {
    const offenders: string[] = [];
    for (const f of goSourceFiles()) {
      const src = readFileSync(join(DIR, f), "utf8");
      const code = src
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      if (/<Image|<img|logo\.png|\.svg"/i.test(code)) offenders.push(f);
    }
    expect(offenders, `/go carries no company identity — image found in: ${offenders}`).toEqual([]);
  });

  it("FM3: the top bar stays logo + My Brand + Sign up — no tagline/footer copy creep", () => {
    const src = readFileSync(join(DIR, "GoTopBar.tsx"), "utf8");
    const jsxText = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    // The only literal copy the bar may carry is the one button label.
    const labels = [...jsxText.matchAll(/>\s*([A-Za-z][^<>{}]{2,})\s*</g)].map((m) => m[1].trim());
    expect(labels).toEqual(["My Brand", "Sign up"]);
  });
});
