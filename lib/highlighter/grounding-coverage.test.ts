import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * GROUNDING-COVERAGE GUARD — the anti-recurrence backstop for "the AI doesn't know
 * our own number."
 *
 * Why this file exists (2026-06-24): the canonical ZIP page `/z/[zip]` shipped MOCK
 * fixture numbers (`lib/landing/home-map-data` — "mock data; swap for live lake later")
 * with NO grounding bridge. A user selecting "89 New Permits" got the assistant
 * interrogating THEM about our own (fabricated) number, because:
 *   1. you cannot honestly ground an AI on an invented number, and
 *   2. the page never published a report context, so the highlighter ran "off-report".
 * It had been hand-fixed on the `/r/*` family but never on `/z/` (or the homepage map it
 * descends from), because grounding is OPT-IN per page with no guard. This is that guard.
 *
 * How a page makes its numbers "AI-knowable":
 *   - GROUNDING: it mounts `ReportAi` (app/r/_components/report-ai.tsx — the ONE root that
 *     publishes reportId + metricSuggestions to lib/highlighter/report-context-store via
 *     ReportHighlightBridge) — see the /r/* pages.
 *   - REAL DATA: it never renders `home-map-data` (mock) on a user-facing surface.
 *
 * These three checks fail the build BEFORE an ungrounded or mock-fed numeric page can ship.
 * The allowlists below are the SINGLE maintenance point — shrink them as debt is paid;
 * never grow them without a real reason.
 */

const REPO_ROOT = join(import.meta.dir, "..", "..");

/** Forward-slash relative path from repo root, for stable cross-platform comparisons. */
function rel(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

/** Recursively collect *.ts / *.tsx under a repo-relative dir. */
function collect(dirRel: string): string[] {
  const root = join(REPO_ROOT, dirRel);
  const out: string[] = [];
  if (!existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        walk(abs);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(abs);
      }
    }
  };
  walk(root);
  return out;
}

/** True when `src` IMPORTS a module whose specifier contains `needle` — anchored on the
 *  `import`/`from` keyword + a quoted string, so a bare mention in a comment never matches. */
function importsSpecifier(src: string, needle: string): boolean {
  const n = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:\\bfrom|\\bimport)\\s*\\(?\\s*["'][^"']*${n}[^"']*["']`).test(src);
}

const SOURCE_DIRS = ["app", "components", "lib"];
const allSources = SOURCE_DIRS.flatMap(collect);

describe("grounding coverage guard", () => {
  // ── Check 1: MOCK CONTAINMENT ──────────────────────────────────────────────
  // No file may import the mock homepage fixture except the known, documented debt.
  // Migrate these to live lake data; do NOT add new entries.
  test("home-map-data (mock) is imported only by the allowlisted debt", () => {
    const MOCK_MODULE = "landing/home-map-data";
    const MOCK_ALLOWLIST = new Set([
      // The live loader imports the fixture as its FAIL-SOFT lane only: served
      // with sample:true + the "Sample data" badge when a lake query fails
      // (Lane B Phase 1 — Hero itself no longer touches the mock).
      "lib/landing/load-home-map-data.ts",
      "components/charts/MapCanvas.tsx",
    ]);
    const importers = allSources
      .filter((f) => importsSpecifier(readFileSync(f, "utf8"), MOCK_MODULE))
      .map(rel)
      .sort();
    const violations = importers.filter((f) => !MOCK_ALLOWLIST.has(f));
    expect(
      violations,
      `Mock data (${MOCK_MODULE}) imported on a non-allowlisted surface — wire it to live ` +
        `lake data + a grounding bridge, or it ships fabricated numbers the AI cannot honestly ` +
        `explain. Offenders:\n  ${violations.join("\n  ")}`,
    ).toEqual([]);
  });

  // ── Check 1b: MOCK DISCLOSURE ──────────────────────────────────────────────
  // MapCanvas is allowlisted above to import the mock fixture, but it may only
  // paint from it while SAYING SO. Without an `override` prop the colors are
  // fixture numbers; /map shipped three such maps captioned "Flood risk by ZIP"
  // with no disclosure in the served HTML — mock dollars read as real. The badge
  // must live on the component (a page cannot forget it). Failure mode this
  // guards: "undisclosed mock served as live data".
  test("MapCanvas discloses sample data whenever it falls back to the fixture", () => {
    const src = readFileSync("components/charts/MapCanvas.tsx", "utf8");
    expect(
      /\{!override && \(/.test(src),
      "MapCanvas lost its `{!override && (...)}` disclosure branch. Without an override " +
        "the map paints import-quarantined mock numbers; removing the badge ships them as live.",
    ).toBe(true);
    expect(
      /Sample data/.test(src),
      "MapCanvas no longer renders a 'Sample data' badge on the fixture path.",
    ).toBe(true);
  });

  // ── Check 2: BRIDGE REGRESSION ─────────────────────────────────────────────
  // Each known data-report route MUST keep mounting the ReportAi root (which is
  // the ONE importer of ReportHighlightBridge — Phase E one-root). Removing it
  // silently degrades the whole report to "off-report" → naked numbers.
  test("every grounded report route still mounts the report AI root", () => {
    const GROUNDED_ROUTES = [
      "app/r/[slug]/page.tsx",
      "app/r/zip-report/[zip]/page.tsx",
      "app/r/source/[table]/page.tsx",
      "app/r/method/[metric]/page.tsx",
      "app/r/cre-swfl/[corridor]/page.tsx",
      "app/r/housing-swfl/page.tsx",
    ];
    for (const route of GROUNDED_ROUTES) {
      const abs = join(REPO_ROOT, route);
      expect(existsSync(abs), `Grounded route moved/renamed — update this registry: ${route}`).toBe(
        true,
      );
      expect(
        importsSpecifier(readFileSync(abs, "utf8"), "report-ai"),
        `${route} no longer mounts ReportAi — its numbers degraded to ungrounded.`,
      ).toBe(true);
    }
    // The chain must stay intact: ReportAi is the ONE importer of the bridge.
    const shell = readFileSync(join(REPO_ROOT, "app/r/_components/report-ai.tsx"), "utf8");
    expect(importsSpecifier(shell, "ReportHighlightBridge")).toBe(true);
  });

  // ── Check 3: NEW NUMBERED PAGE MUST GROUND ─────────────────────────────────
  // Any app/**/page.tsx that renders our number primitives (DataRow / MetricsTable /
  // FactChip) must be a known grounded route. A new numbered page that forgot the bridge
  // fails here instead of silently shipping the /z/ bug again.
  test("every page rendering number primitives is a grounded route", () => {
    const NUMBER_PRIMITIVE = /\b(DataRow|MetricsTable|FactChip)\b/;
    const KNOWN_GROUNDED = new Set([
      "app/r/[slug]/page.tsx",
      "app/r/zip-report/[zip]/page.tsx",
      "app/r/cre-swfl/[corridor]/page.tsx",
    ]);
    const pages = collect("app").filter((f) => /[/\\]page\.tsx$/.test(f));
    const numbered = pages
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        // Must actually import the primitive (not merely mention it), then use it.
        return (
          (importsSpecifier(src, "metrics-table") || importsSpecifier(src, "FactChip")) &&
          NUMBER_PRIMITIVE.test(src)
        );
      })
      .map(rel)
      .sort();
    const ungrounded = numbered.filter((f) => !KNOWN_GROUNDED.has(f));
    expect(
      ungrounded,
      `Page renders our number primitives without being a registered grounded route. Mount ` +
        `ReportHighlightBridge (+ add it to GROUNDED_ROUTES/KNOWN_GROUNDED here), or it ships ` +
        `numbers the AI can't ground. Offenders:\n  ${ungrounded.join("\n  ")}`,
    ).toEqual([]);
  });
});
