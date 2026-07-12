#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Gate 6 — no NEW paid-API surface reaches
// GitHub without an explicit, deliberate override.
//
// Why this exists (07/05/2026 drain, receipts in SESSION_LOG): the guards on
// EXISTING spend paths (RunBudget $1/run, $5/day ceiling, the paid-dispatch
// hook, the quarantined local key) can all be routed around one way — a
// session WRITES NEW CODE that spends, lands it on main, and a schedule runs
// it. That is not hypothetical: commit 8a009308 once "implemented" the
// crawl4ai decree by deleting the cheap capture leg, leaving paid
// sonnet+web_search as the only path. This hook stands at the push edge.
//
// What it BLOCKS: `git push` / safe-push when the outgoing diff
// (origin/main...HEAD) ADDS a line matching a paid-API marker —
//   ANTHROPIC_API_KEY · new Anthropic( · anthropic.Anthropic( ·
//   AsyncAnthropic( · api.anthropic.com · web_search_2  (tool version prefix)
// — in any file EXCEPT the metered roots and non-runtime paths:
//   refinery/agents/anthropic.mts     (the ONE TypeScript metered client)
//   ingest/lib/api_usage.py           (the ONE Python metered client)
//   .claude/hooks/                    (guards talk about the markers)
//   docs/, *.md, SESSION_LOG.md       (prose)
//   test files (*.test.*, test_*, *_test.*)  (mocks; no key at runtime)
//
// ESCAPE HATCH — a legitimate new call site (wired through a metered client,
// budget-capped, operator-aware) pushes with `ALLOW_PAID_SURFACE=1` prefixed
// to the push command, and says so in the SESSION_LOG entry of the same push.
//
// Fail-OPEN on internal/git errors — a broken guard must never wedge the agent.

import { execSync } from "node:child_process";
import { resolvePushCwd } from "./push-context.mjs";

const BANNER = "=".repeat(72);
const MARKER =
  /ANTHROPIC_API_KEY|new\s+Anthropic\s*\(|anthropic\.Anthropic\s*\(|AsyncAnthropic\s*\(|api\.anthropic\.com|web_search_2\d{3}/;

const ALLOWED_PATH =
  /^(refinery\/agents\/anthropic\.mts|ingest\/lib\/api_usage\.py)$|^\.claude\/hooks\/|^docs\/|\.md$|\.test\.|(^|\/)test_|_test\.|(^|\/)tests?\//;

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
  }
  const cmd = String(payload?.tool_input?.command ?? "");
  if (!isPush(cmd)) process.exit(0);
  if (/\bALLOW_PAID_SURFACE=1\b/.test(cmd)) process.exit(0);

  let diff = "";
  try {
    // Judge the repo the push targets (worktree pushes — see push-context.mjs).
    diff = execSync("git diff origin/main...HEAD --unified=0", {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      cwd: resolvePushCwd(payload),
    });
  } catch {
    process.exit(0); // fail open — e.g. no origin/main yet
  }

  const hits = scan(diff);
  if (hits.length === 0) process.exit(0);

  const list = hits
    .slice(0, 8)
    .map((h) => `  ${h.file}: +${h.line}`)
    .join("\n");
  block(
    "push adds NEW paid-API surface",
    `These ADDED lines reference the Anthropic key/client/tooling outside the\n` +
      `metered roots (refinery/agents/anthropic.mts · ingest/lib/api_usage.py):\n\n${list}\n\n` +
      `Every Anthropic call goes through a metered client with a RunBudget —\n` +
      `that is how the 07/05/2026 drain became impossible to repeat. If this\n` +
      `new surface is deliberate, wired through a metered client, and budget-\n` +
      `capped, push with the explicit override and record it in SESSION_LOG:\n` +
      `  ALLOW_PAID_SURFACE=1 <your push command>`,
  );
});

function isPush(cmd) {
  return /\bgit\s+push\b|safe-push\.mjs/.test(cmd);
}

// Parse a unified diff; return added lines matching MARKER in non-allowed files.
function scan(diff) {
  const hits = [];
  let file = "";
  let skip = false;
  for (const line of diff.split("\n")) {
    const f = line.match(/^\+\+\+ b\/(.+)$/);
    if (f) {
      file = f[1];
      skip = ALLOWED_PATH.test(file);
      continue;
    }
    if (skip) continue;
    if (line.startsWith("+") && !line.startsWith("+++") && MARKER.test(line)) {
      hits.push({ file, line: line.slice(1, 120).trim() });
    }
  }
  return hits;
}

function block(what, detail) {
  const msg = `\n${BANNER}\nBLOCKED — ${what}\n${BANNER}\n${detail}\n${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
}

function selfTest() {
  const mk = (file, added) => `+++ b/${file}\n+${added}\n`;
  const cases = [
    // [name, diff, expectHits]
    [
      "new burner script",
      mk(
        "scripts/email/tmp-evil.mts",
        "const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });",
      ),
      true,
    ],
    [
      "workflow env line",
      mk(
        ".github/workflows/new-burner.yml",
        "  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}",
      ),
      true,
    ],
    [
      "python direct client",
      mk("ingest/pipelines/x/pipeline.py", "client = anthropic.Anthropic(api_key=key)"),
      true,
    ],
    ["raw endpoint", mk("lib/x.ts", 'fetch("https://api.anthropic.com/v1/messages")'), true],
    [
      "paid search tool",
      mk("ingest/pipelines/y/pipeline.py", 'SEARCH_TOOL_VERSION = "web_search_20250305"'),
      true,
    ],
    ["metered TS root", mk("refinery/agents/anthropic.mts", "new Anthropic({ apiKey })"), false],
    ["metered PY root", mk("ingest/lib/api_usage.py", "ANTHROPIC_API_KEY"), false],
    ["hook file", mk(".claude/hooks/check-x.mjs", "/ANTHROPIC_API_KEY/"), false],
    ["markdown", mk("docs/spec.md", "uses ANTHROPIC_API_KEY"), false],
    ["test file", mk("ingest/pipelines/x/test_pipeline.py", "anthropic.Anthropic("), false],
    ["clean code", mk("lib/email/foo.ts", "const x = 1;"), false],
  ];
  let fail = 0;
  for (const [name, diff, expect] of cases) {
    const got = scan(diff).length > 0;
    if (got !== expect) {
      fail++;
      console.error(`FAIL: ${name} — expected hits=${expect}, got ${got}`);
    } else {
      console.log(`ok: ${name}`);
    }
  }
  console.log(fail === 0 ? "SELF-TEST PASS (11/11)" : `SELF-TEST FAIL (${fail})`);
  if (fail) process.exit(1);
}
