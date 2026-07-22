#!/usr/bin/env node
// check-sweep.mjs — the MISSING ACTING HALF of the checks ledger.
//
// Measured 07/22/2026: 722 open checks, 8 carrying a `signal`. The ledger has an
// automatic OPENER and no automatic CLOSER:
//
//   reverify-signals.mjs  walks CLOSED signal-bearing checks, re-runs the stored
//                         signal, and REOPENS anything that regressed.
//   (nothing)             walked OPEN checks.
//
// `runSignal` fired only inside `check.mjs close`, one key at a time, when a
// human typed the command — so the count moved in exactly one direction by
// construction. This is the mirror: walk every OPEN check that carries a signal,
// run it live, and CLOSE the ones that pass. Same root cause as the ceilings
// postmortem — we build the recording half of a mechanism and never the acting
// half.
//
//   node scripts/check-sweep.mjs [--dry-run] [--class verify] [--project ingest]
//
// The proof it writes is built from what the run ACTUALLY observed and is
// re-validated server-side by the checks_require_proof trigger, so a sweep
// cannot close anything whose stored signal did not just pass. What it CANNOT
// do is judge whether a signal is discriminating — see FM1 in
// docs/superpowers/specs/2026-07-22-check-sweep-design.md. That is a human
// judgment at signal-attach time, never at sweep time.
//
// Credentials: same resolution as check.mjs (.dlt/secrets.toml / env).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";
import { runSignal } from "./lib/check-signals.mjs";

const ROOT = process.cwd();
const SECRETS_PATH = resolve(ROOT, ".dlt/secrets.toml");

// Stamped into resolved_by so machine closes stay queryable apart from human
// ones forever: `select … where resolved_by = 'check-sweep'`.
export const RESOLVED_BY = "check-sweep";

// Mirrors CHECK_CLASSES in check.mjs; "untriaged" means a NULL class.
const SWEEP_CLASSES = ["defect", "verify", "idea", "task", "untriaged"];

function creds() {
  let tomlText = "";
  try {
    tomlText = readFileSync(SECRETS_PATH, "utf8");
  } catch {
    // No local secrets file (e.g. CI) — fall through to env vars.
  }
  const c = resolveSupabaseCreds({ tomlText, env: process.env });
  if (!c) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in secrets or env");
  return c;
}

async function rest(path, init = {}) {
  const { url, key } = creds();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

// --- pure helpers (unit-tested with no network / no DB) ---

/** FM2 — the inverse of reverify-signals' isRealRegression, and the same line.
 *  A signal that PASSED is grounds to close ONLY if it actually evaluated:
 *  check-signals.mjs returns observed:null on every "never ran" path (missing
 *  params, fetch threw, unimplemented type). Closing on observed:null would be
 *  the automated version of the false claim this ledger exists to prevent. */
export function isCloseable(result) {
  return result?.ok === true && result?.observed != null;
}

/** The PATCH body for a close, shaped to satisfy checks_require_proof:
 *  proof.kind='signal' · ok=true · proof.signal jsonb-equal to the STORED
 *  signal · fresh observed_at. `nowIso` is passed per check (FM4) so a long
 *  sweep cannot age out its own early proofs past the trigger's 1-day window. */
export function buildClosePatch({ signal, observed, nowIso }) {
  if (signal == null)
    throw new Error("buildClosePatch: refusing to build a close for a row with no stored signal");
  return {
    state: "done",
    resolved_at: nowIso,
    resolved_by: RESOLVED_BY,
    proof: {
      kind: "signal",
      ok: true,
      // Echoed verbatim — the trigger does `NEW.proof->'signal' IS DISTINCT
      // FROM stored_signal`, so any drift here rejects the close.
      signal,
      observed,
      observed_at: nowIso,
      by: RESOLVED_BY,
    },
  };
}

/** FM5 — the scan is ALWAYS constrained to open AND signal-bearing rows. The
 *  sweeper never invents a signal and never sees a manual-tier check. */
export function buildScanPath({ class: klass, project } = {}) {
  const parts = ["state=eq.open", "signal=not.is.null"];
  if (klass != null) {
    if (!SWEEP_CLASSES.includes(klass))
      throw new Error(`--class must be one of: ${SWEEP_CLASSES.join(", ")}`);
    parts.push(klass === "untriaged" ? "class=is.null" : `class=eq.${encodeURIComponent(klass)}`);
  }
  if (project != null) parts.push(`project=eq.${encodeURIComponent(project)}`);
  parts.push("select=id,check_key,label,project,class,signal");
  return `checks?${parts.join("&")}`;
}

// --- CLI ---

async function main({ dryRun, filters }) {
  const rows = await rest(buildScanPath(filters));
  const scope = [
    filters.class && `class=${filters.class}`,
    filters.project && `project=${filters.project}`,
  ]
    .filter(Boolean)
    .join(" ");
  console.log(
    `check-sweep: ${rows.length} OPEN check(s) carry a live signal${scope ? ` [${scope}]` : ""}`,
  );

  let closed = 0;
  let stillOpen = 0;
  let broken = 0;
  const closedKeys = [];

  for (const row of rows) {
    // FM4: stamped per check, at the moment its signal runs.
    const nowIso = new Date().toISOString();
    const result = await runSignal(row.signal, { rest });

    if (isCloseable(result)) {
      closed++;
      closedKeys.push({ check_key: row.check_key, label: row.label, detail: result.detail });
      // FM3: never silent — every close prints what was observed.
      console.log(`  CLOSE   ${row.check_key} — ${result.detail}`);
      if (dryRun) continue;
      await rest(`checks?id=eq.${row.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(
          buildClosePatch({ signal: row.signal, observed: result.observed, nowIso }),
        ),
      });
      console.log(`          -> closed`);
      continue;
    }

    if (result.observed == null) {
      // The signal never evaluated — a stored-signal DEFECT, not a verdict on
      // the work. Someone needs to fix the signal. Reported loud, touches nothing.
      broken++;
      console.log(`  BROKEN  ${row.check_key} — signal never evaluated — ${result.detail}`);
      continue;
    }

    // Ran and did not pass: the work genuinely isn't done. That is the gate
    // working, not a shortfall.
    stillOpen++;
    console.log(`  open    ${row.check_key} — ${result.detail}`);
  }

  console.log(
    `check-sweep: ${closed} closed · ${stillOpen} still open (signal ran, did not pass) · ` +
      `${broken} signal-broken (unevaluated)${dryRun ? " (dry-run, nothing written)" : ""}`,
  );
  // A broken signal is a real finding worth a red run — nobody can verify that
  // check until its stored signal is fixed. Closing nothing is NOT a failure.
  if (broken > 0) process.exitCode = 1;
  return { total: rows.length, closed, stillOpen, broken, closedKeys };
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const argv = process.argv.slice(2);
  const flagValue = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const filters = { class: flagValue("class"), project: flagValue("project") };
  main({ dryRun: argv.includes("--dry-run"), filters }).catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  });
}
