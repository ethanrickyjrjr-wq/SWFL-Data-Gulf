// Structural validity guard for `.github/workflows/*.yml` and `.github/actions/**/action.yml`.
//
// WHY THIS EXISTS (08/12/2026). A workflow file can be perfectly valid YAML and
// still be REJECTED by GitHub, in which case the run appears with ZERO jobs, no
// log at all (`gh run view --log-failed` → "log not found"), and a title that is
// the FILE PATH instead of the workflow's `name:`. There is nothing to debug and
// nothing local catches it.
//
// This is the SECOND time that shape has cost real runs, so it gets a mechanism
// instead of a third scratchpad line (RULE 2 §0b):
//   1. 08/11 — nightly-chain.yml had an orphaned `secrets: inherit` after a
//      deleted job. PyYAML parsed it happily; GitHub rejected the file; 2 runs
//      with zero jobs.
//   2. 08/12 — graphify-republish.yml got `working-directory:` left sitting on a
//      step that had just become a `uses:` step. `Bun.YAML.parse` said clean; the
//      run came back with zero jobs. `working-directory` is legal ONLY on `run:`
//      steps — pass it to a composite action as an input instead.
//
// The two checks below are cheap and specific: a real YAML parse (not the
// regex-based parseWorkflow used elsewhere in this repo, which is built for
// name/cron extraction and is deliberately lenient), plus the run-only-key rule
// that a lenient parser structurally cannot see.
//
// Run: node --test .github/scripts/workflow-step-shape.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WF_DIR = resolve(ROOT, ".github/workflows");
const ACTIONS_DIR = resolve(ROOT, ".github/actions");

// Keys GitHub accepts ONLY on a `run:` step. On a `uses:` step each one makes the
// whole FILE invalid — not just the step.
const RUN_ONLY_KEYS = ["run", "shell", "working-directory"];

function workflowFiles() {
  return readdirSync(WF_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((file) => ({
      file: `.github/workflows/${file}`,
      text: readFileSync(resolve(WF_DIR, file), "utf8"),
    }));
}

function actionFiles() {
  if (!existsSync(ACTIONS_DIR)) return [];
  return readdirSync(ACTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(ACTIONS_DIR, d.name, "action.yml"))
    .filter((p) => existsSync(p))
    .map((p) => ({
      file: p.slice(ROOT.length + 1).replaceAll("\\", "/"),
      text: readFileSync(p, "utf8"),
    }));
}

test("every workflow and local action parses as real YAML into an object", () => {
  const bad = [];
  for (const { file, text } of [...workflowFiles(), ...actionFiles()]) {
    try {
      const doc = parseYaml(text);
      if (!doc || typeof doc !== "object")
        bad.push(`${file}: parsed to ${typeof doc}, not a mapping`);
    } catch (e) {
      bad.push(`${file}: ${String(e.message).split("\n")[0]}`);
    }
  }
  assert.deepEqual(bad, [], `These files are not valid YAML:\n  ${bad.join("\n  ")}`);
});

test("no step carries a run-only key (run/shell/working-directory) alongside `uses:`", () => {
  const offenders = [];
  for (const { file, text } of workflowFiles()) {
    let doc;
    try {
      doc = parseYaml(text);
    } catch {
      continue; // the parse test above owns this failure
    }
    for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
      for (const [i, step] of (job?.steps ?? []).entries()) {
        if (!step || typeof step !== "object" || !step.uses) continue;
        for (const key of RUN_ONLY_KEYS) {
          if (key === "run") continue; // `run` + `uses` is caught below with a clearer message
          if (Object.hasOwn(step, key)) {
            offenders.push(
              `${file} → job ${jobId}, step ${i} (${step.name ?? step.uses}): has \`${key}:\` on a \`uses:\` step`,
            );
          }
        }
        if (Object.hasOwn(step, "run")) {
          offenders.push(
            `${file} → job ${jobId}, step ${i} (${step.name ?? step.uses}): has BOTH \`run:\` and \`uses:\``,
          );
        }
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `GitHub rejects the ENTIRE FILE for these — the run comes back with zero jobs and no log:\n  ` +
      `${offenders.join("\n  ")}\n\n` +
      `Fix: a composite action cannot take working-directory/shell from its caller. Give the ` +
      `action an input and pass it under \`with:\` instead.`,
  );
});

test("every local `uses: ./…` action path exists on disk", () => {
  const missing = [];
  for (const { file, text } of workflowFiles()) {
    let doc;
    try {
      doc = parseYaml(text);
    } catch {
      continue;
    }
    for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
      const steps = job?.steps ?? [];
      for (const [i, step] of steps.entries()) {
        const uses = typeof step?.uses === "string" ? step.uses : "";
        if (!uses.startsWith("./")) continue;

        // A local action resolves against $GITHUB_WORKSPACE. When a job checks this
        // repo out into a subdirectory (`path:`), the action path must carry that
        // subdirectory too — graphify-republish.yml is exactly that case.
        const checkout = steps.find((s) => String(s?.uses ?? "").startsWith("actions/checkout"));
        const prefix = checkout?.with?.path ? `${checkout.with.path}/` : "";
        const expected = `./${prefix}.github/actions/`;
        if (uses.startsWith("./.github/actions/") || uses.startsWith(expected)) {
          const onDisk = resolve(ROOT, uses.replace(`./${prefix}`, "./"));
          if (!existsSync(join(onDisk, "action.yml"))) {
            missing.push(`${file} → job ${jobId}, step ${i}: \`${uses}\` has no action.yml`);
          }
          if (prefix && !uses.startsWith(expected)) {
            missing.push(
              `${file} → job ${jobId}, step ${i}: \`${uses}\` but this job checks out into ` +
                `\`${checkout.with.path}/\` — the path must be \`${expected}…\``,
            );
          }
        }
      }
    }
  }
  assert.deepEqual(missing, [], `Broken local action references:\n  ${missing.join("\n  ")}`);
});
