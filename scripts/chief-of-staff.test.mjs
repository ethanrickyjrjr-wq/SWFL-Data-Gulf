// scripts/chief-of-staff.test.mjs
import { describe, expect, test } from "bun:test";
import {
  parseGitLogNameOnly,
  staleChecks,
  neverStartedLiveVerifies,
  buildEvidencePack,
} from "./chief-of-staff-lib.mjs";

const LOG = [
  "aaaa111\tfeat(zip-events): market-area alert event",
  "lib/email/zip-events/types.ts",
  "lib/email/zip-events/market-areas.ts",
  "",
  "bbbb222\tdocs(spec): send-window guidance",
  "docs/superpowers/specs/2026-07-10-send-window-guidance-design.md",
].join("\n");

const NOW = new Date("2026-07-10T12:00:00Z");

const rows = [
  {
    check_key: "market_area_alerts_live_verify",
    label: "Market area alerts live-verify",
    project: "email",
    detail: null,
    due_at: null,
    updated_at: "2026-07-09T12:00:00Z",
  },
  {
    check_key: "phantom_build_live_verify",
    label: "Phantom build live-verify",
    project: "email",
    detail: null,
    due_at: null,
    updated_at: "2026-06-01T12:00:00Z",
  },
  {
    check_key: "old_manual_check",
    label: "Old manual",
    project: "ops",
    detail: "d",
    due_at: "2026-07-01",
    updated_at: "2026-06-20T12:00:00Z",
  },
];

describe("parseGitLogNameOnly", () => {
  test("parses sha, subject, files per commit", () => {
    const commits = parseGitLogNameOnly(LOG);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual({
      sha: "aaaa111",
      subject: "feat(zip-events): market-area alert event",
      files: ["lib/email/zip-events/types.ts", "lib/email/zip-events/market-areas.ts"],
    });
    expect(commits[1].files).toHaveLength(1);
  });
  test("empty input -> empty array", () => {
    expect(parseGitLogNameOnly("")).toEqual([]);
  });
});

describe("staleChecks", () => {
  test("returns >=14d untouched, oldest first", () => {
    const stale = staleChecks(rows, { minDays: 14, now: NOW });
    expect(stale.map((s) => s.check_key)).toEqual([
      "phantom_build_live_verify",
      "old_manual_check",
    ]);
    expect(stale[0].days_untouched).toBe(39);
  });
});

describe("neverStartedLiveVerifies", () => {
  test("live_verify with no slug mention in history = never started", () => {
    // full-history log mentions market-area-alerts (hyphen form) but never phantom_build
    const full = "aaaa111 feat(zip-events): market-area-alerts event types\ncccc333 chore: misc";
    const out = neverStartedLiveVerifies(rows, full);
    expect(out.map((o) => o.check_key)).toEqual(["phantom_build_live_verify"]);
  });
  test("matches underscore and hyphen slug variants case-insensitively", () => {
    const full = "dddd444 feat: PHANTOM-BUILD scaffolding";
    const out = neverStartedLiveVerifies(rows, full);
    expect(out.map((o) => o.check_key)).toEqual(["market_area_alerts_live_verify"]);
  });
});

describe("buildEvidencePack", () => {
  test("assembles all sections with window_hours 48", () => {
    const pack = buildEvidencePack({
      commits: parseGitLogNameOnly(LOG),
      checks: rows,
      fullLogText: "x",
      now: NOW,
    });
    expect(pack.window_hours).toBe(48);
    expect(pack.commits).toHaveLength(2);
    expect(pack.checks).toHaveLength(3);
    expect(pack.checks[0].days_untouched).toBe(1);
    expect(pack.live_verify_never_started.length).toBeGreaterThan(0);
    expect(pack.stale[0].check_key).toBe("phantom_build_live_verify");
  });
});
