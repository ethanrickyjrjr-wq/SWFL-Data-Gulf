// secret-wiring.mjs — pure helpers for pre-push Gate 3 (secret wiring).
//
// Lives in lib/ for the same reason ledger-parse.mjs does: check-prepush-gate.mjs
// attaches a stdin handler at module scope, so importing it from a test hangs the
// test runner forever. Pure logic that needs proving goes here; the gate imports it.

// Env names GitHub or the runner provides; never the operator's job to wire.
const BUILTIN =
  /^(GITHUB_|RUNNER_|CI$|HOME$|PATH$|LANG$|TZ$|NODE_|BUN_|PYTHON|VIRTUAL_ENV|TMPDIR|USER$|SHELL$|PWD$|OS$|ACTIONS_)/;

/** Env keys defined under any `env:` block in a workflow. */
export function workflowEnvNames(yaml) {
  const out = new Set();
  let inEnv = false;
  let indent = -1;
  for (const line of String(yaml || "").split(/\r?\n/)) {
    // `- env:` is valid YAML (env as the first key of a list item) and appears in
    // real workflows; anchoring to whitespace alone silently skipped those blocks,
    // which would have made this gate blind exactly where secrets get wired.
    const m = line.match(/^(\s*)(-\s+)?env:\s*$/);
    if (m) {
      inEnv = true;
      indent = m[1].length + (m[2] ? m[2].length : 0);
      continue;
    }
    if (!inEnv) continue;
    const k = line.match(/^(\s*)([A-Z_][A-Z0-9_]*):\s*/);
    if (k && k[1].length > indent) out.add(k[2]);
    else if (line.trim() && !/^\s*#/.test(line)) inEnv = false;
  }
  return out;
}

/** Script paths a workflow invokes from a `run:` line. */
export function workflowScripts(yaml) {
  const out = new Set();
  for (const m of String(yaml || "").matchAll(
    /(?:python3?\s+(?:-m\s+)?|bun\s+(?:run\s+)?|node\s+|uv\s+run\s+)([\w./-]+\.(?:py|mts|ts|mjs|js))/g,
  ))
    out.add(m[1]);
  return out;
}

/**
 * Env vars a script REQUIRES — read with no fallback on either side.
 *
 * Both directions matter, and both were real bugs caught by measuring against all
 * 112 workflows before this gate was allowed to block anything:
 *   • A negative lookahead glued to a greedy class silently backs off one char to
 *     satisfy itself — `process.env.BRAINS_SUPABASE_URL ||` captured as
 *     `BRAINS_SUPABASE_UR`, a name that does not exist. Blocking on fiction.
 *   • Looking only forward flags the FALLBACK half of `A ?? process.env.B`, whose
 *     absence is by design. That alone produced the grade-predictions.yml flag.
 */
export function requiredEnvNames(src) {
  const s = String(src || "");
  const out = new Set();
  for (const m of s.matchAll(/os\.environ\[\s*["']([A-Z_][A-Z0-9_]*)["']\s*\]/g)) out.add(m[1]);
  for (const m of s.matchAll(/os\.getenv\(\s*["']([A-Z_][A-Z0-9_]*)["']\s*\)/g)) out.add(m[1]);
  for (const m of s.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
    const end = m.index + m[0].length;
    if (/^\s*(\?\?|\|\||\))/.test(s.slice(end, end + 12))) continue;
    if (/(\?\?|\|\|)\s*$/.test(s.slice(Math.max(0, m.index - 6), m.index))) continue;
    out.add(m[1]);
  }
  return new Set([...out].filter((n) => !BUILTIN.test(n)));
}

/** Names the repo manages as GitHub secrets — `secrets.NAME` in any workflow text. */
export function knownSecretNames(yamlTexts) {
  const out = new Set();
  for (const y of yamlTexts || [])
    for (const m of String(y).matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)) out.add(m[1]);
  return out;
}

/**
 * THE RULE. Returns human-readable findings; empty means the push is clean.
 *
 * Narrowed deliberately to names the repo already manages as GitHub secrets. A naive
 * "required env var missing" rule flags 5 of 112 workflows on the current tree, nearly
 * all tuning knobs (DRY_RUN, WEEKLY_READ_PREVIEW_ZIP) whose absence is harmless. The
 * narrowed rule flags 0 of 112 — so it cannot wedge a push today, and it bites exactly
 * the class that aborted the rebuild in May, June, and again on 07/15/2026 (23410a45).
 */
export function findUnwiredSecrets({ touched, readWorkflow, readScript, allWorkflowTexts }) {
  const known = knownSecretNames(allWorkflowTexts);
  const findings = [];
  for (const wf of touched) {
    const yaml = readWorkflow(wf);
    if (yaml == null) continue; // deleted in this push
    const defined = workflowEnvNames(yaml);
    for (const s of workflowScripts(yaml)) {
      const src = readScript(s);
      if (src == null) continue;
      for (const need of requiredEnvNames(src)) {
        if (!known.has(need)) continue; // a knob, not a managed secret
        if (defined.has(need) || yaml.includes(need)) continue;
        findings.push(`  • ${wf} runs ${s}, which requires ${need} — absent from its env:`);
      }
    }
  }
  return findings;
}
