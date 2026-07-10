import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Glob } from "bun";
import {
  buildReportId,
  parseReportId,
  REPORT_SURFACE_KINDS,
  type ReportSurfaceKind,
} from "./report-surface";
import { resolveReportGrounding } from "./report-grounding";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");

// ---------------------------------------------------------------------------
// Contract: buildReportId / parseReportId round-trip
// ---------------------------------------------------------------------------

test("brain ids stay bare and round-trip", () => {
  expect(buildReportId("brain", "master")).toBe("master");
  expect(parseReportId("master")).toEqual({ kind: "brain", id: "master" });
  expect(parseReportId("home-values-swfl")).toEqual({ kind: "brain", id: "home-values-swfl" });
});

test("synthetic surfaces namespace and round-trip", () => {
  const cases: Array<[ReportSurfaceKind, string]> = [
    ["zip", "33931"],
    ["corridor", "us-41-fort-myers"],
    ["method", "cap_rate_median"],
    ["source", "rsw_passengers"],
  ];
  for (const [kind, id] of cases) {
    const encoded = buildReportId(kind, id);
    expect(encoded).toBe(`${kind}:${id}`);
    expect(parseReportId(encoded)).toEqual({ kind, id });
  }
});

test("an unknown prefix decodes as a bare brain slug (back-compat)", () => {
  // A future/legacy id with a `foo:` prefix is NOT a known kind → treated as a
  // brain slug, exactly as before the contract existed. (fetchBrain then 404s it,
  // which is correct — it is genuinely unknown.)
  expect(parseReportId("foo:bar")).toEqual({ kind: "brain", id: "foo:bar" });
});

// ---------------------------------------------------------------------------
// Resolver: every surface kind grounds on a real dossier (no 404 from a known
// kind). This reads brains/*.md from disk — Node/Bun runtime, repo cwd.
// ---------------------------------------------------------------------------

test("resolveReportGrounding returns a real block + token for every kind", async () => {
  const ids: Record<ReportSurfaceKind, string> = {
    brain: "master",
    zip: buildReportId("zip", "33931"),
    corridor: buildReportId("corridor", "us-41-fort-myers"),
    method: buildReportId("method", "cap_rate_median"),
    source: buildReportId("source", "rsw_passengers"),
  };
  for (const kind of REPORT_SURFACE_KINDS) {
    const g = await resolveReportGrounding(ids[kind], { origin: "https://www.swfldatagulf.com" });
    expect(g.blocks.length).toBeGreaterThan(0);
    expect(g.blocks[0].dossier).toBeTruthy();
    expect(typeof g.freshnessToken).toBe("string");
    expect(g.freshnessToken.length).toBeGreaterThan(0);
  }
});

// ---------------------------------------------------------------------------
// THE GUARD — ends the 404 class AND enforces the one-root (Phase E). Pages
// never touch ReportHighlightBridge directly: they mount <ReportAi> with a
// literal surface="…" from REPORT_SURFACE_KINDS, and ReportAi (unit-tested in
// app/r/_components/report-ai.test.tsx) is the single buildReportId call site
// on the page path — so a new page can neither publish a raw id (the old 404
// class) nor fork the bridge wiring (the drift class).
// ---------------------------------------------------------------------------

test("GUARD: pages mount ReportAi (never the bridge) with a literal known surface", () => {
  const glob = new Glob("app/r/**/page.tsx");
  const offenders: string[] = [];

  for (const rel of glob.scanSync(REPO_ROOT)) {
    const src = readFileSync(path.join(REPO_ROOT, rel), "utf-8");
    const norm = rel.replace(/\\/g, "/");

    if (src.includes("ReportHighlightBridge")) {
      offenders.push(`${norm}: touches ReportHighlightBridge directly — mount <ReportAi> instead`);
    }
    if (!src.includes("<ReportAi")) continue;

    const surfaces = [...src.matchAll(/<ReportAi\b[\s\S]*?\bsurface="([^"]+)"/g)].map((m) => m[1]);
    if (surfaces.length === 0) {
      offenders.push(`${norm}: <ReportAi> without a literal surface="…" prop`);
    }
    for (const s of surfaces) {
      if (!(REPORT_SURFACE_KINDS as readonly string[]).includes(s)) {
        offenders.push(`${norm}: surface="${s}" is not a known report surface kind`);
      }
    }
  }

  expect(offenders).toEqual([]);
});
