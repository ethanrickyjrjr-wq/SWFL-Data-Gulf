#!/usr/bin/env node
// reverify-signals.mjs — the free, no-LLM-tokens half of check-drift defense.
//
// 07/18/2026 audit found 82 risk-flagged closed checks, re-verified by hand (9
// parallel agents, ~1.5M tokens) because almost none of them carry a `signal`
// — the CLOSE-TIME claim was self-reported text, with nothing to re-run later.
// Only 1 of 267 evidenced closes in the whole table used a `signal`. This
// script is the other half: every CLOSED check that DOES carry a signal gets
// that signal re-run live, on a schedule, for the cost of an HTTP/DB read —
// no agent, no tokens. A signal that used to pass and now fails means the
// thing it verified has regressed; this reopens it automatically, so the next
// session's CHECK surfaces it instead of a human needing to notice by hand.
//
//   node scripts/reverify-signals.mjs [--dry-run]
//
// Credentials: same resolution as check.mjs (.dlt/secrets.toml / env).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";
import { runSignal } from "./lib/check-signals.mjs";

const ROOT = process.cwd();
const SECRETS_PATH = resolve(ROOT, ".dlt/secrets.toml");

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

// Pure: the reopen patch for a check whose stored signal just failed.
// Appends to any existing `detail` rather than clobbering it — the prior
// human-written context stays readable alongside the new regression note.
export function buildRegressionPatch({ result, existingDetail, nowIso }) {
  const note = `AUTO-REOPENED ${nowIso.slice(0, 10)} (reverify-signals): stored signal now fails — ${result.detail}`;
  return {
    state: "open",
    resolved_at: null,
    resolved_by: null,
    proof: null,
    detail: existingDetail ? `${existingDetail}\n\n${note}` : note,
  };
}

// A signal that COULDN'T RUN (bad params, unimplemented type, unreachable
// network) and a signal that RAN AND FAILED are not the same finding — the
// first tells us nothing about whether the original claim still holds, the
// second is real evidence it doesn't. check-signals.mjs already draws this
// line for us: every "couldn't run" path returns observed:null; every "ran
// and produced a real result" path (pass or fail) returns a populated
// observed object. Only the latter is grounds to reopen a check.
export function isRealRegression(result) {
  return result.ok === false && result.observed != null;
}

async function main({ dryRun }) {
  const rows = await rest(
    "checks?state=eq.done&signal=not.is.null&select=id,check_key,label,signal,detail",
  );
  console.log(`reverify-signals: ${rows.length} closed check(s) carry a live signal`);
  const nowIso = new Date().toISOString();
  let regressed = 0;
  let broken = 0;
  const regressions = [];
  const brokenSignals = [];

  for (const row of rows) {
    const result = await runSignal(row.signal, { rest });
    if (result.ok) {
      console.log(`  ok      ${row.check_key} — ${result.detail}`);
      continue;
    }
    if (!isRealRegression(result)) {
      // The signal itself never evaluated — a stored-signal defect, not a
      // regression. Reopening on this would be exactly the kind of false
      // claim this script exists to prevent, just automated. Log it loud,
      // touch nothing.
      broken++;
      brokenSignals.push({ check_key: row.check_key, label: row.label, detail: result.detail });
      console.log(`  BROKEN  ${row.check_key} — signal never evaluated — ${result.detail}`);
      continue;
    }
    regressed++;
    regressions.push({ check_key: row.check_key, label: row.label, detail: result.detail });
    console.log(`  FAIL    ${row.check_key} — ${result.detail}`);
    if (dryRun) continue;
    const patch = buildRegressionPatch({ result, existingDetail: row.detail, nowIso });
    await rest(`checks?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    console.log(`          -> reopened`);
  }

  console.log(
    `reverify-signals: ${regressed}/${rows.length} regressed, ${broken}/${rows.length} signal-broken (unevaluated)` +
      `${dryRun ? " (dry-run, nothing written)" : ""}`,
  );
  // Loud on purpose: a real regression is a real finding, not a script bug.
  // The reopen above already landed regardless of this exit code. A broken
  // (unevaluated) signal is ALSO worth a red run — someone needs to fix the
  // stored signal — but it is reported separately, never silently folded
  // into "regressed".
  if (regressed > 0 || broken > 0) process.exitCode = 1;
  return { total: rows.length, regressed, broken, regressions, brokenSignals };
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const dryRun = process.argv.includes("--dry-run");
  main({ dryRun }).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
