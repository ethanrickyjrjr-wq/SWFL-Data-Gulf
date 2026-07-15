// scripts/email/__tests__/freshness-preflight.test.mts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freshnessToken } from "../../../refinery/lib/freshness.mts";
import {
  masterFreshnessDate,
  readChainRun,
  assertChainRanToday,
  StaleMasterError,
} from "../freshness-preflight.mts";

// WHAT CHANGED (2026-07-14) AND WHY. This suite used to assert:
//
//     test("token stamped YESTERDAY -> REFUSE (the dropped/late-head case)")
//
// That test was the bug, written down as a spec. It equated "master's token is
// not today's" with "the nightly chain was dropped". They are different facts.
// The refinery deliberately SKIPS master when it is inside its own 7-day TTL and
// no upstream rebuilt more recently (refinery/cli.mts). On a genuine no-change
// day the chain RUNS, correctly skips master, writes nothing, and exits 0 —
// leaving yesterday's token on a perfectly current master.
//
// So the old gate refused every quiet day. It did, on the first one: run
// 29347029902 (2026-07-14) killed a good send with "master freshness_token is
// 2026-07-13, expected 2026-07-14".
//
// The gate now asserts what it always MEANT to: the chain RAN today
// (brains/_build-report.json — committed by every rebuild, even a no-op one) and
// master is not HELD. Content vintage is not this gate's job: fetch-digest-data's
// asOfForToken already stamps each source's TRUE token date, never the send date.

const TODAY = "2026-07-14";

/** Writes a master.md fixture into a temp dir. `token: null` = no token line. */
function writeMaster(token: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-preflight-"));
  const p = path.join(dir, "master.md");
  const body = token
    ? `<!-- FRESHNESS: v102 | Token: ${token} -->\n---\nbrain_id: master\nversion: 102\nrefined_at: 2026-07-13T08:07:25Z\nfreshness_token: ${token}\nttl_seconds: 604800\n---\n\nbody\n`
    : `---\nbrain_id: master\nversion: 102\n---\n\nbody\n`;
  fs.writeFileSync(p, body, "utf8");
  return p;
}

/** Writes a brains/_build-report.json fixture. Mirrors the real shape (refinery/cli.mts). */
function writeReport(over: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-report-"));
  const p = path.join(dir, "_build-report.json");
  fs.writeFileSync(
    p,
    JSON.stringify({
      target: "master",
      timestamps: { started: `${TODAY}T06:45:51.693Z`, finished: `${TODAY}T06:45:51.713Z` },
      source: "live",
      outcomes: [],
      exitCode: 0,
      masterDecision: "skipped-fresh",
      ...over,
    }),
    "utf8",
  );
  return p;
}

describe("readChainRun", () => {
  test("reads the started day + the master decision off the chain's own receipt", () => {
    assert.deepEqual(readChainRun(writeReport()), {
      startedOn: TODAY,
      masterDecision: "skipped-fresh",
    });
  });

  test("missing report -> nulls, never throws", () => {
    const missing = path.join(os.tmpdir(), "no-such-report-12345.json");
    assert.deepEqual(readChainRun(missing), { startedOn: null, masterDecision: null });
  });

  test("garbled report -> nulls, never throws", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-report-"));
    const p = path.join(dir, "_build-report.json");
    fs.writeFileSync(p, "{ not json", "utf8");
    assert.deepEqual(readChainRun(p), { startedOn: null, masterDecision: null });
  });
});

describe("digest send gate — SENDS", () => {
  // THE REGRESSION. Chain ran; master is TTL-fresh and was correctly skipped; its
  // token still reads yesterday. This is a healthy no-change day and MUST send.
  test("no-change day: chain ran today, master skipped-fresh, token reads YESTERDAY", () => {
    const report = writeReport({ masterDecision: "skipped-fresh" });
    const master = writeMaster(freshnessToken(102, "2026-07-13T08:07:25Z"));
    assert.equal(masterFreshnessDate(master), "2026-07-13"); // yesterday, on purpose
    assert.doesNotThrow(() => assertChainRanToday(TODAY, report, master));
  });

  test("master was re-synthesized today", () => {
    const report = writeReport({ masterDecision: "published" });
    const master = writeMaster(freshnessToken(103, `${TODAY}T06:45:51Z`));
    assert.doesNotThrow(() => assertChainRanToday(TODAY, report, master));
  });

  // refinery/cli.mts leaves masterDecision undefined when the run never touched
  // master (`pack_id=<leaf>` — the documented debugging path). A leaf-only rebuild
  // does not invalidate master's synthesis, so it must not block the day's digest.
  test("targeted leaf rebuild leaves masterDecision absent", () => {
    const report = writeReport({ target: "env-swfl", masterDecision: undefined });
    const master = writeMaster(freshnessToken(102, "2026-07-13T08:07:25Z"));
    assert.doesNotThrow(() => assertChainRanToday(TODAY, report, master));
  });
});

describe("digest send gate — REFUSES", () => {
  // The gate's ACTUAL purpose. GitHub can drop a scheduled run outright.
  test("chain did not run today -> REFUSE (the dropped/late-chain case)", () => {
    const report = writeReport({ timestamps: { started: "2026-07-13T06:45:51.693Z" } });
    const master = writeMaster(freshnessToken(102, "2026-07-13T08:07:25Z"));
    assert.throws(() => assertChainRanToday(TODAY, report, master), StaleMasterError);
  });

  test("build report missing -> REFUSE (fails CLOSED: never send on unknown chain state)", () => {
    const missing = path.join(os.tmpdir(), "no-such-report-12345.json");
    const master = writeMaster(freshnessToken(102, "2026-07-13T08:07:25Z"));
    assert.throws(() => assertChainRanToday(TODAY, missing, master), StaleMasterError);
  });

  // A chain that RAN today but held master on a dead critical upstream also leaves
  // a today-dated report. Gating on the report's date alone would miss this.
  test("chain ran but HELD master -> REFUSE (critical upstream eligibility expired)", () => {
    const report = writeReport({ masterDecision: "held" });
    const master = writeMaster(freshnessToken(102, "2026-07-13T08:07:25Z"));
    assert.throws(() => assertChainRanToday(TODAY, report, master), StaleMasterError);
  });

  test("master.md missing -> REFUSE (fails CLOSED)", () => {
    const missing = path.join(os.tmpdir(), "no-such-master-12345.md");
    assert.throws(() => assertChainRanToday(TODAY, writeReport(), missing), StaleMasterError);
  });

  test("master.md present but no freshness_token line -> REFUSE (fails CLOSED)", () => {
    const master = writeMaster(null);
    assert.equal(masterFreshnessDate(master), null);
    assert.throws(() => assertChainRanToday(TODAY, writeReport(), master), StaleMasterError);
  });

  test("token with an unparseable date tail -> REFUSE (fails CLOSED)", () => {
    const master = writeMaster("SWFL-7421-v100-NOTADATE");
    assert.equal(masterFreshnessDate(master), null);
    assert.throws(() => assertChainRanToday(TODAY, writeReport(), master), StaleMasterError);
  });
});

describe("masterFreshnessDate", () => {
  test("reads the calendar day out of master's freshness_token", () => {
    const p = writeMaster(freshnessToken(100, "2026-07-11T06:32:37Z"));
    assert.equal(masterFreshnessDate(p), "2026-07-11");
  });
});
