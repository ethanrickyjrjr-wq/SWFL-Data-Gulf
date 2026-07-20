// Run: node scripts/schedule-catalog.test.mjs
// Tests the pure functions of the derived schedule view (spec 2026-07-20),
// plus a live repo sweep: every ACTIVE-cron workflow + vercel cron must be
// registered in ingest/cadence_registry.yaml. The sweep is acceptance
// criterion 1 made permanent.
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  cronLines,
  vercelCronRefs,
  jobsEntries,
  buildCatalog,
  gate10Snippet,
} from "./schedule-catalog.mjs";

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}

check("cronLines: quoted + unquoted extracted, commented-out excluded", () => {
  const yml = [
    "on:",
    "  schedule:",
    '    - cron: "23 4 * * *"',
    "    - cron: 0 11 * * 1",
    '    # - cron: "5 5 * * *"',
    "name: x",
  ].join("\n");
  assert.deepStrictEqual(cronLines(yml), ["23 4 * * *", "0 11 * * 1"]);
});

check("cronLines: trailing inline comment on the cron line is stripped", () => {
  // Real shape used by 11 of the 77 live workflows, e.g. airtable-checks-sync.yml,
  // tripwire-hourly.yml, lee-permits-weekly.yml — the expression must come back
  // clean, not with the comment text still attached.
  const yml = [
    "on:",
    "  schedule:",
    '    - cron: "23 12 * * *" # once daily, off the top-of-hour congestion',
    "name: x",
  ].join("\n");
  assert.deepStrictEqual(cronLines(yml), ["23 12 * * *"]);
});

check("cronLines: no schedule → []", () => {
  assert.deepStrictEqual(cronLines("on:\n  workflow_dispatch:\n"), []);
});

check("vercelCronRefs: parses crons array", () => {
  const good = JSON.stringify({ crons: [{ path: "/api/mls/sync", schedule: "0 11 * * *" }] });
  assert.deepStrictEqual(vercelCronRefs(good), [
    { ref: "vercel.json#/api/mls/sync", cron: "0 11 * * *" },
  ]);
});

check("vercelCronRefs: bad JSON → [], warns on stderr instead of failing silently", () => {
  // Malformed vercel.json must not vanish quietly — stub console.warn so the
  // assertion proves the warning fires without polluting this runner's stdout.
  const calls = [];
  const original = console.warn;
  console.warn = (...args) => calls.push(args.join(" "));
  try {
    const result = vercelCronRefs("{nope");
    assert.deepStrictEqual(result, []);
  } finally {
    console.warn = original;
  }
  assert.strictEqual(calls.length, 1, "expected exactly one console.warn call");
  assert.ok(
    /vercel\.json/i.test(calls[0]),
    `expected warning to name vercel.json, got: ${calls[0]}`,
  );
});

check("jobsEntries: fixed-shape parse, stops at next top-level key", () => {
  const reg = [
    "pipelines:",
    "  - name: some-ingest",
    "jobs:",
    "  - name: daily-rebuild",
    "    workflow: daily-rebuild.yml",
    "    purpose: Daily rebuild.",
    "  - name: mls-sync",
    "    workflow: vercel.json#/api/mls/sync",
    "    purpose: MLS sync.",
    "    scheduler: vercel",
    "zzz_after:",
    "  - name: not-a-job",
  ].join("\n");
  const jobs = jobsEntries(reg);
  assert.strictEqual(jobs.length, 2);
  assert.strictEqual(jobs[0].workflow, "daily-rebuild.yml");
  assert.strictEqual(jobs[1].scheduler, "vercel");
});

check("buildCatalog: unregistered detection + jobs metadata attach", () => {
  const registryText = [
    "pipelines:",
    "  - name: redfin",
    "    workflow: redfin-monthly.yml",
    "jobs:",
    "  - name: daily-rebuild",
    "    workflow: daily-rebuild.yml",
    "    purpose: Daily rebuild.",
  ].join("\n");
  const workflows = [
    { file: "redfin-monthly.yml", text: '    - cron: "0 6 1 * *"' },
    { file: "daily-rebuild.yml", text: '    - cron: "0 5 * * *"' },
    { file: "rogue.yml", text: '    - cron: "0 0 * * *"' },
    { file: "dispatch-only.yml", text: "on:\n  workflow_dispatch:\n" },
  ];
  const vercelJsonText = JSON.stringify({
    crons: [{ path: "/api/unseen", schedule: "1 1 * * *" }],
  });
  const { rows, unregistered } = buildCatalog({ registryText, workflows, vercelJsonText });
  assert.deepStrictEqual(unregistered, ["rogue.yml", "vercel.json#/api/unseen"]);
  assert.strictEqual(rows.length, 4); // 3 cron workflows + 1 vercel; dispatch-only excluded
  const rebuild = rows.find((r) => r.ref === "daily-rebuild.yml");
  assert.strictEqual(rebuild.purpose, "Daily rebuild.");
  assert.strictEqual(rebuild.status, "live");
});

check(
  "buildCatalog: prose-only mention (purpose text + comment) does NOT count as registered",
  () => {
    // Regression for the tightening from bare .includes() to a field-match
    // regex: prose-mention.yml and the vercel ref below are both present as
    // literal SUBSTRINGS of registryText (inside a `purpose:` line and a `#`
    // comment) but never as an actual `workflow: <ref>` field value. A
    // .includes()-style membership check would have cleared both for free —
    // 29 of 77 real active-cron workflows were riding exactly this loophole
    // before the tightening (nightly-chain.yml alone had 5 such mentions).
    const registryText = [
      "pipelines:",
      "  - name: real-one",
      "    workflow: real-one.yml",
      "    purpose: Mentions prose-mention.yml and vercel.json#/api/ghost-report only in passing.",
      "  # prose-mention.yml is also referenced here, again just a comment",
    ].join("\n");
    const workflows = [
      { file: "real-one.yml", text: '    - cron: "0 3 * * *"' },
      { file: "prose-mention.yml", text: '    - cron: "0 4 * * *"' },
    ];
    const vercelJsonText = JSON.stringify({
      crons: [{ path: "/api/ghost-report", schedule: "0 5 * * *" }],
    });
    const { unregistered } = buildCatalog({ registryText, workflows, vercelJsonText });
    assert.ok(
      unregistered.includes("prose-mention.yml"),
      "prose-only mention of prose-mention.yml must still be reported unregistered",
    );
    assert.ok(
      unregistered.includes("vercel.json#/api/ghost-report"),
      "prose-only mention of the vercel ref must still be reported unregistered",
    );
    assert.ok(
      !unregistered.includes("real-one.yml"),
      "sanity: real-one.yml has a genuine workflow: field and must not be flagged",
    );
  },
);

check(
  "buildCatalog: positive control — a real `workflow:` field line DOES count as registered",
  () => {
    // Same fixture as the prose-only case above, but prose-mention.yml and the
    // vercel ref now ALSO get a genuine `workflow:` field entry. Without this
    // half, the prose-only test above could pass on an unrelated bug (e.g.
    // buildCatalog reporting everything as unregistered) and nobody would
    // notice — the positive control proves field-match still recognizes the
    // real thing.
    const registryText = [
      "pipelines:",
      "  - name: real-one",
      "    workflow: real-one.yml",
      "    purpose: Mentions prose-mention.yml and vercel.json#/api/ghost-report only in passing.",
      "  # prose-mention.yml is also referenced here, again just a comment",
      "jobs:",
      "  - name: prose-mention",
      "    workflow: prose-mention.yml",
      "    purpose: Now genuinely registered.",
      "  - name: ghost-report",
      "    workflow: vercel.json#/api/ghost-report",
      "    purpose: Now genuinely registered.",
      "    scheduler: vercel",
    ].join("\n");
    const workflows = [
      { file: "real-one.yml", text: '    - cron: "0 3 * * *"' },
      { file: "prose-mention.yml", text: '    - cron: "0 4 * * *"' },
    ];
    const vercelJsonText = JSON.stringify({
      crons: [{ path: "/api/ghost-report", schedule: "0 5 * * *" }],
    });
    const { unregistered } = buildCatalog({ registryText, workflows, vercelJsonText });
    assert.deepStrictEqual(
      unregistered,
      [],
      "with real `workflow:` field lines added, nothing should remain unregistered",
    );
  },
);

check("gate10Snippet: gha + vercel shapes", () => {
  assert.strictEqual(
    gate10Snippet("foo-bar.yml"),
    "  - name: foo-bar\n    workflow: foo-bar.yml\n    purpose: <one line — what this job does>",
  );
  assert.ok(gate10Snippet("vercel.json#/api/x/y").includes("scheduler: vercel"));
  assert.ok(gate10Snippet("vercel.json#/api/x/y").includes("name: api-x-y"));
});

check("Gate 10 parity: hook's inline predicate regex mirrors scripts/schedule-catalog.mjs", () => {
  // The hook (.claude/hooks/check-prepush-gate.mjs) can't import this script
  // — hooks stay self-contained — so it duplicates isRegisteredRef inline as
  // isRegisteredRefInline. If the two regexes ever drift, the pre-push gate
  // silently disagrees with this script's sweep, which defeats the point of
  // having a gate at all (the hook's own Gate 10 comment says as much:
  // "if the two ever disagree about 'registered', the gate is worthless").
  // Extract the `new RegExp(...)` line that builds the membership predicate
  // out of each file's source text and compare them. The escape-helper name
  // is the ONE documented, intentional divergence (script: escapeRegExp,
  // hook: escapeRegExpInline — the "Inline" suffix is the hook's
  // self-contained-duplicate convention), so normalize just that call before
  // comparing; anything else that differs between the two lines is real drift.
  const scriptPath = path.join(process.cwd(), "scripts", "schedule-catalog.mjs");
  const hookPath = path.join(process.cwd(), ".claude", "hooks", "check-prepush-gate.mjs");
  const scriptText = readFileSync(scriptPath, "utf8");
  const hookText = readFileSync(hookPath, "utf8");

  function extractPredicateLine(text, label) {
    const lines = text
      .split(/\r?\n/)
      .filter((l) => l.includes("new RegExp(") && l.includes("workflow:"));
    assert.strictEqual(
      lines.length,
      1,
      `expected exactly one workflow-membership RegExp construction line in ${label}, found ${lines.length} — ` +
        `the extraction itself is drift-sensitive: a renamed/restructured predicate must fail this test loudly, ` +
        `not silently skip the comparison`,
    );
    return lines[0].trim();
  }

  function normalize(line) {
    return line.replace(/escapeRegExp(?:Inline)?\(ref\)/, "ESCAPE_REF(ref)");
  }

  const scriptLine = extractPredicateLine(scriptText, "scripts/schedule-catalog.mjs");
  const hookLine = extractPredicateLine(hookText, ".claude/hooks/check-prepush-gate.mjs");
  assert.strictEqual(
    normalize(hookLine),
    normalize(scriptLine),
    "the hook's inline predicate must mirror scripts/schedule-catalog.mjs — update both or neither",
  );
});

check("REPO SWEEP: zero unregistered scheduled surfaces (acceptance 1)", () => {
  const root = process.cwd();
  const registryText = readFileSync(path.join(root, "ingest/cadence_registry.yaml"), "utf8");
  const wfDir = path.join(root, ".github", "workflows");
  const workflows = readdirSync(wfDir)
    .filter((f) => f.endsWith(".yml"))
    .map((file) => ({ file, text: readFileSync(path.join(wfDir, file), "utf8") }));
  const vercelJsonText = readFileSync(path.join(root, "vercel.json"), "utf8");
  const { rows, unregistered } = buildCatalog({ registryText, workflows, vercelJsonText });
  // Floor/anchor: an empty `unregistered` array is produced identically by
  // "everything detected is registered" and by "cron detection broke and
  // found nothing." redfin-monthly.yml is a verified active-cron workflow
  // (`- cron: "0 13 15 * *"`, no dispatch-only trigger) registered under
  // `ingest/cadence_registry.yaml`'s pipelines: section — if detection ever
  // silently stops finding scheduled surfaces, this assertion catches it
  // even though `unregistered` would still read as empty.
  assert.ok(
    rows.some((r) => r.ref === "redfin-monthly.yml" && r.registered === true),
    "expected redfin-monthly.yml to be detected as an active-cron, registered row — " +
      "if this fails, cron/workflow detection silently broke",
  );
  assert.deepStrictEqual(unregistered, []);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
