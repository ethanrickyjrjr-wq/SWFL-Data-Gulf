// secret-wiring.test.mjs — Gate 3 blocks now; prove it blocks the right thing.
//
// Gate 3 sat labelled "(advisory, never blocks)" while the class it names recurred on
// 07/15/2026 (23410a45, wiring SUPABASE_PG_* into daily-rebuild.yml). Making it block
// is only safe if it does not also block the 112 workflows already in the tree, so the
// narrowing rule — only names the repo manages as GitHub secrets — is pinned here by
// test, not by the single measurement run that justified it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  workflowEnvNames,
  workflowScripts,
  requiredEnvNames,
  findUnwiredSecrets,
} from "./secret-wiring.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WF_DIR = join(REPO, ".github", "workflows");

test("reads env keys out of a workflow env: block", () => {
  const y = ["jobs:", "  a:", "    steps:", "      - env:", "          FOO: x"].join("\n");
  assert.ok(workflowEnvNames(y).has("FOO"));
});

test("finds the script a run: line invokes", () => {
  assert.ok(workflowScripts("  run: bun refinery/grade/g.mts --dry").has("refinery/grade/g.mts"));
  assert.ok(workflowScripts("  run: python ingest/p.py").has("ingest/p.py"));
});

test("a bare required read is required", () => {
  assert.ok(requiredEnvNames("const k = process.env.MY_API_KEY;").has("MY_API_KEY"));
  assert.ok(requiredEnvNames('k = os.environ["MY_API_KEY"]').has("MY_API_KEY"));
});

test("a read with a fallback is NOT required", () => {
  assert.ok(!requiredEnvNames('const k = process.env.DRY_RUN ?? "0";').has("DRY_RUN"));
  assert.ok(!requiredEnvNames('const k = process.env.DRY_RUN || "0";').has("DRY_RUN"));
});

test("the FALLBACK HALF of a ?? chain is not required — the grade-predictions.yml false positive", () => {
  const r = requiredEnvNames(
    "const url = process.env.SUPABASE_URL ?? process.env.BRAINS_SUPABASE_URL;",
  );
  assert.ok(!r.has("BRAINS_SUPABASE_URL"), "fallback half must not be demanded");
  assert.ok(!r.has("SUPABASE_URL"), "primary has a fallback, so it is not required either");
});

test("greedy-class backoff does not invent a truncated name", () => {
  const r = requiredEnvNames('const u = process.env.BRAINS_SUPABASE_URL || "";');
  assert.ok(!r.has("BRAINS_SUPABASE_UR"), "truncated name is fiction — never block on it");
});

test("runner-provided names are never demanded", () => {
  assert.equal(
    requiredEnvNames("const a = process.env.GITHUB_TOKEN; const b = process.env.RUNNER_OS;").size,
    0,
  );
});

test("BLOCKS the documented breaker: a managed secret the workflow never passes", () => {
  const findings = findUnwiredSecrets({
    touched: [".github/workflows/daily-rebuild.yml"],
    allWorkflowTexts: ["      KEY: ${{ secrets.SUPABASE_PG_HOST }}"],
    readWorkflow: () => "jobs:\n  a:\n    steps:\n      - run: bun refinery/x.mts\n",
    readScript: () => "const h = process.env.SUPABASE_PG_HOST;",
  });
  assert.equal(findings.length, 1, "an unwired managed secret must block");
  assert.match(findings[0], /SUPABASE_PG_HOST/);
});

test("does NOT block on a tuning knob the repo does not manage as a secret", () => {
  const findings = findUnwiredSecrets({
    touched: [".github/workflows/x.yml"],
    allWorkflowTexts: ["      KEY: ${{ secrets.SOMETHING_ELSE }}"],
    readWorkflow: () => "jobs:\n  a:\n    steps:\n      - run: bun scripts/x.mts\n",
    readScript: () => "const d = process.env.DRY_RUN;",
  });
  assert.deepEqual(findings, []);
});

test("LIVE: the secret-shaped rule flags 0 of the workflows in this repo", () => {
  const files = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 50, "workflow inventory looks wrong");
  const texts = files.map((f) => readFileSync(join(WF_DIR, f), "utf8"));

  const findings = findUnwiredSecrets({
    touched: files.map((f) => `.github/workflows/${f}`),
    allWorkflowTexts: texts,
    readWorkflow: (wf) => readFileSync(join(REPO, wf), "utf8"),
    readScript: (s) => (existsSync(join(REPO, s)) ? readFileSync(join(REPO, s), "utf8") : null),
  });

  // If this fails it means either a REAL unwired secret landed (fix the workflow) or
  // the heuristic drifted (fix it here) — both are worth stopping a push for.
  assert.deepEqual(findings, [], `Gate 3 would block these pushes:\n${findings.join("\n")}`);
});
