import { test, expect } from "bun:test";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * BACKWARDS-DATE GUARD (Phase 0.1). The operator kept seeing year-first ISO dates
 * (`2026-06-03`) on report pages "SOME FUCKING HOW" — because each report page had
 * its own `formatDate()` returning `toISOString().slice(0,10)`, with no guard.
 *
 * Rule 5: every user-facing date is MM/DD/YYYY, via `asOfFromToken` (freshness tokens)
 * or `asOfFromIso` (raw ISO dates). This guard fails the build if any report page
 * (`app/r/**`) reaches for the ISO-slice footgun again. If a future page needs a
 * legitimate non-date `.slice(0, 10)`, route dates through the helpers and narrow this
 * scan — don't silence it.
 */

const REPO_ROOT = join(import.meta.dir, "..", "..");

function rel(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

function collectTsx(dirRel: string): string[] {
  const root = join(REPO_ROOT, dirRel);
  const out: string[] = [];
  if (!existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        walk(abs);
      } else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) {
        out.push(abs);
      }
    }
  };
  walk(root);
  return out;
}

test("no report page renders a raw ISO date (year-first) — use asOfFromToken/asOfFromIso", () => {
  const ISO_SLICE = /\.slice\(0,\s*10\)/; // toISOString().slice(0,10) or <dateField>.slice(0,10)
  const offenders = collectTsx("app/r")
    .filter((f) => ISO_SLICE.test(readFileSync(f, "utf8")))
    .map(rel)
    .sort();
  expect(
    offenders,
    `Report page slices a date to a year-first ISO string. Format MM/DD/YYYY via ` +
      `asOfFromIso()/asOfFromToken() (lib/project/as-of) instead. Offenders:\n  ${offenders.join("\n  ")}`,
  ).toEqual([]);
});
