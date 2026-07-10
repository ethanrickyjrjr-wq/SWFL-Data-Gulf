// scripts/chief-of-staff.test.mjs
import { describe, expect, test } from "bun:test";
import {
  parseGitLogNameOnly,
  staleChecks,
  neverStartedLiveVerifies,
  buildEvidencePack,
} from "./chief-of-staff-lib.mjs";
import { lintBrief, briefKickoffLines, repoSlugFromRemoteUrl } from "./chief-of-staff-lib.mjs";

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

const PACK = {
  commits: [
    { sha: "aaaa111aaaa111aaaa111aaaa111aaaa111aaaa1", subject: "s", files: [] },
    { sha: "bbbb222bbbb222bbbb222bbbb222bbbb222bbbb2", subject: "t", files: [] },
  ],
};

const GOOD = [
  "## Close candidates",
  "- market_area_alerts_live_verify — aaaa111 — types+fixture committed — HIGH",
  "- old_manual_check — bbbb222 — docs landed — MEDIUM",
  "",
  "## Never started",
  "- phantom_build_live_verify",
  "",
  "## Stale top 3",
  "- phantom_build_live_verify (39d)",
  "",
  "## No evidence",
  "197 open checks had no matching work in the window.",
].join("\n");

describe("lintBrief", () => {
  test("accepts a well-formed brief", () => {
    expect(lintBrief(GOOD, PACK)).toEqual({ ok: true, errors: [] });
  });
  test("rejects SHA not in the evidence pack", () => {
    const bad = GOOD.replace("aaaa111", "deadbee");
    const r = lintBrief(bad, PACK);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("deadbee");
  });
  test("rejects a candidate line without HIGH/MEDIUM tier", () => {
    const bad = GOOD.replace(" — HIGH", "");
    expect(lintBrief(bad, PACK).ok).toBe(false);
  });
  test("rejects >15 candidates", () => {
    const many = Array.from({ length: 16 }, (_, i) => `- k${i} — aaaa111 — why — HIGH`).join("\n");
    const bad = GOOD.replace(/- market.*MEDIUM/s, many);
    const r = lintBrief(bad, PACK);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("15");
  });
  test("rejects a brief missing a required section", () => {
    const bad = GOOD.replace("## No evidence", "## Whatever");
    expect(lintBrief(bad, PACK).ok).toBe(false);
  });
  test("accepts an empty candidates section (0 candidates is success)", () => {
    const empty = GOOD.replace(/- market.*MEDIUM/s, "(none)");
    expect(lintBrief(empty, PACK).ok).toBe(true);
  });
});

describe("briefKickoffLines", () => {
  test("returns up to max candidate lines", () => {
    expect(briefKickoffLines(GOOD, { max: 1 })).toEqual([
      "- market_area_alerts_live_verify — aaaa111 — types+fixture committed — HIGH",
    ]);
  });
  test("no section -> empty array", () => {
    expect(briefKickoffLines("hello", { max: 5 })).toEqual([]);
  });
});

describe("repoSlugFromRemoteUrl", () => {
  test("https form", () => {
    expect(repoSlugFromRemoteUrl("https://github.com/owner/repo.git")).toBe("owner/repo");
  });
  test("ssh form", () => {
    expect(repoSlugFromRemoteUrl("git@github.com:owner/repo.git")).toBe("owner/repo");
  });
  test("garbage -> null", () => {
    expect(repoSlugFromRemoteUrl("not a url")).toBe(null);
  });
});
