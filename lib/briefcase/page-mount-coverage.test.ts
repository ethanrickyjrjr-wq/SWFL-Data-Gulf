import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Glob } from "bun";
import { shouldMountHighlighter, shouldRenderStandalone } from "./pill-mount";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");

/**
 * THE "ALL PAGES MEANS ALL PAGES" PROOF (Phase 3C verification (c)).
 *
 * The universal-highlighter lift moved BOTH the highlighter (GlobalHighlighter) and the AI
 * pill (AppShell) to the app root. This test globs EVERY `app/**​/page.tsx`, derives a
 * representative pathname per route, and asserts the two root-mount invariants on each — so a
 * NEW page can NEVER silently land with zero or double mounts:
 *
 *   - EXACTLY ONE highlighter on every page EXCEPT the white-label/auth clean set
 *     (`/p/`, `/embed/`, `/login`, `/auth`) where it is ZERO.
 *   - EXACTLY ONE pill on every page EXCEPT the white-label clean set (`/p/`, `/embed/`)
 *     where it is ZERO. (The pill, unlike the highlighter, DELIBERATELY shows on `/login`
 *     + `/auth` — the funnel can pop there; there is just nothing to highlight on a form.)
 *   - NEVER two of either.
 *
 * The clean sets are declared here and the test asserts the mount functions agree with them —
 * change one without the other and CI goes red, forcing the new page to be classified.
 */

// Highlighter is suppressed on exactly these prefixes (== nav-config SHELL_HIDDEN_PREFIXES).
const HIGHLIGHTER_CLEAN = ["/p/", "/embed/", "/login", "/auth"];
// The pill is suppressed on only the white-label deliverable/iframe prefixes.
const PILL_CLEAN = ["/p/", "/embed/"];

function matchesAny(p: string, prefixes: string[]): boolean {
  return prefixes.some((pre) => p.startsWith(pre));
}

/** Map an `app/**​/page.tsx` file to a representative URL pathname. Route groups `(x)` drop;
 *  dynamic segments `[x]` / `[...x]` / `[[...x]]` become a literal placeholder. */
function routeToPath(rel: string): string {
  const route = rel
    .replace(/\\/g, "/")
    .replace(/^app\//, "")
    .replace(/\/?page\.tsx$/, "");
  const segs = route
    .split("/")
    .map((s) => {
      if (s === "") return null;
      if (/^\(.*\)$/.test(s)) return null; // route group — not in the URL
      if (/^\[.*\]$/.test(s)) return "x"; // [id] / [...slug] / [[...slug]]
      return s;
    })
    .filter((s): s is string => s !== null);
  return segs.length ? `/${segs.join("/")}` : "/";
}

const PAGES = [...new Glob("app/**/page.tsx").scanSync(REPO_ROOT)].map((rel) => {
  const src = readFileSync(path.join(REPO_ROOT, rel), "utf-8");
  return {
    rel: rel.replace(/\\/g, "/"),
    path: routeToPath(rel),
    // A page is BRIDGED (its pill opens the report dock) iff it publishes a report context.
    hasReportContext: src.includes("ReportHighlightBridge"),
  };
});

test("there are pages to check (glob resolved)", () => {
  // Guard against a silently-empty glob making every assertion vacuous.
  expect(PAGES.length).toBeGreaterThan(20);
});

test("EVERY page mounts exactly one highlighter, or zero on the clean set — never two", () => {
  const wrong: string[] = [];
  for (const pg of PAGES) {
    const mounts = shouldMountHighlighter(pg.path);
    const expected = !matchesAny(pg.path, HIGHLIGHTER_CLEAN);
    // `mounts` is boolean → structurally 0 or 1 (one root GlobalHighlighter). The only thing
    // that can drift is WHICH pages it suppresses — pin it to the declared clean set.
    if (mounts !== expected) {
      wrong.push(`${pg.rel} (${pg.path}): highlighter=${mounts}, expected=${expected}`);
    }
  }
  expect(wrong).toEqual([]);
});

test("EVERY page mounts exactly one pill, or zero on the white-label set — never two", () => {
  const wrong: string[] = [];
  for (const pg of PAGES) {
    // AppShell: bridged (report context) takes precedence; else standalone unless white-label.
    const bridged = pg.hasReportContext ? 1 : 0;
    const standalone = !pg.hasReportContext && shouldRenderStandalone(pg.path, false) ? 1 : 0;
    const pillCount = bridged + standalone;
    const expected = matchesAny(pg.path, PILL_CLEAN) ? 0 : 1;
    if (pillCount !== expected) {
      wrong.push(`${pg.rel} (${pg.path}): pillCount=${pillCount}, expected=${expected}`);
    }
  }
  expect(wrong).toEqual([]);
});

test("only /r/* pages publish a report context (bridge encoding is report-scoped)", () => {
  const offenders = PAGES.filter((pg) => pg.hasReportContext && !pg.path.startsWith("/r/")).map(
    (pg) => pg.rel,
  );
  expect(offenders).toEqual([]);
});
