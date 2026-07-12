// Pure-core tests for the decreed-dispatch wrapper (scripts/dispatch-rebuild.mjs).
// Runs in ci.yml's node --test glob.
import test from "node:test";
import assert from "node:assert";
import {
  fmtDateMDY,
  parseArgs,
  buildAcceptanceEntry,
  appendAcceptance,
  pickDispatchedRun,
} from "../dispatch-rebuild.mjs";

test("fmtDateMDY renders MM/DD/YYYY (America/New_York)", () => {
  // 2026-07-12T03:00:00Z is 07/11 23:00 EDT — the Eastern date, not the UTC one.
  assert.equal(fmtDateMDY(new Date("2026-07-12T03:00:00Z")), "07/11/2026");
  assert.equal(fmtDateMDY(new Date("2026-07-12T15:00:00Z")), "07/12/2026");
});

test("parseArgs: pack positional, --reason value, force defaults true", () => {
  assert.deepEqual(parseArgs(["env-swfl", "--reason", "operator decree"]), {
    pack: "env-swfl",
    reason: "operator decree",
    force: true,
  });
  assert.deepEqual(parseArgs(["master", "--no-force", "--reason", "cascade"]), {
    pack: "master",
    reason: "cascade",
    force: false,
  });
  assert.equal(parseArgs([]).pack, null);
});

test("buildAcceptanceEntry carries the run, pack, MM/DD/YYYY date, and decree", () => {
  const e = buildAcceptanceEntry({
    pack: "env-swfl",
    runUrl: "https://github.com/x/y/actions/runs/1",
    reason: "fgcu-reri ruling",
    now: new Date("2026-07-12T15:00:00Z"),
  });
  assert.equal(e.run_url, "https://github.com/x/y/actions/runs/1");
  assert.equal(e.pack, "env-swfl");
  assert.equal(e.accepted_on, "07/12/2026");
  assert.match(e.note, /fgcu-reri ruling/);
  assert.match(e.note, /dispatch-rebuild\.mjs/);
});

test("appendAcceptance appends, preserves the doc, and is idempotent on run_url", () => {
  const doc = { accepted_live_keys: ["K"], accepted_dispatch_runs: [{ run_url: "a" }] };
  const once = appendAcceptance(doc, { run_url: "b", pack: "p" });
  assert.equal(once.accepted_dispatch_runs.length, 2);
  assert.deepEqual(once.accepted_live_keys, ["K"]);
  const twice = appendAcceptance(once, { run_url: "b", pack: "p" });
  assert.equal(twice.accepted_dispatch_runs.length, 2);
});

test("appendAcceptance tolerates a doc with no accepted_dispatch_runs yet", () => {
  const out = appendAcceptance({ accepted_on: "07/05/2026" }, { run_url: "a" });
  assert.equal(out.accepted_dispatch_runs.length, 1);
  assert.equal(out.accepted_on, "07/05/2026");
});

test("pickDispatchedRun: newest workflow_dispatch at/after since, skew-tolerant", () => {
  const since = Date.parse("2026-07-12T15:00:00Z");
  const runs = [
    { url: "old", event: "workflow_dispatch", createdAt: "2026-07-12T14:00:00Z" },
    { url: "cron", event: "schedule", createdAt: "2026-07-12T15:00:30Z" },
    { url: "mine", event: "workflow_dispatch", createdAt: "2026-07-12T15:00:10Z" },
    { url: "skewed", event: "workflow_dispatch", createdAt: "2026-07-12T14:59:45Z" },
  ];
  assert.equal(pickDispatchedRun(runs, since)?.url, "mine");
  // Without the newest, the skew-window run still qualifies.
  assert.equal(pickDispatchedRun(runs.slice(0, 2).concat(runs.slice(3)), since)?.url, "skewed");
  assert.equal(pickDispatchedRun([], since), null);
});
