// lib/lab-entry/destination.static.test.ts
//
// Door pin: every navigation INTO the email lab must build its URL in
// lib/lab-entry/destination.ts. A raw href/push/location to /email-lab or a
// /project/*/email-lab template anywhere else fails the suite (spec A "door
// inventory — ALL of them route through the root").
import { test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
// A navigation token: JSX `href=`, object-literal `href:` (nav-config/ToolSwitcher
// shape), `router.push/replace(`, `redirect(`, or `window.location`. The object-
// literal `href:` matters — a future `href: (id) => `/project/${id}/email-lab``
// must fail too, and the JSX-only `href=` would miss it.
const NAV = /(href[=:]|router\.(push|replace)\(|redirect\(|window\.location)/;
const LAB = /\/email-lab|\/project\/[^"'`]*\/email-lab|\/project\/\$\{[^}]+\}\/email-lab/;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === "lab-entry") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
}

test("no raw email-lab navigation strings outside lib/lab-entry", () => {
  const files: string[] = [];
  for (const r of ROOTS) walk(r, files);
  const offenders: string[] = [];
  for (const f of files) {
    if (f.includes(join("lib", "lab-entry"))) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      // Strip a trailing line comment so `// … /email-lab …` prose never trips
      // the pin (dozens of files reference the path in comments).
      const code = line.replace(/\/\/.*$/, "");
      if (!NAV.test(code) || !LAB.test(code)) return;
      if (code.includes("/api/email-lab")) return; // data fetch, not nav
      if (code.includes("history.replaceState")) return; // URL sync, not nav
      if (code.includes("CHROME_FREE_PREFIXES") || code.includes("AI_CHROME_FREE_PREFIXES")) return;
      offenders.push(`${f}:${i + 1}  ${line.trim()}`);
    });
  }
  expect(
    offenders,
    `Route these through lib/lab-entry/destination.ts:\n${offenders.join("\n")}`,
  ).toEqual([]);
});
