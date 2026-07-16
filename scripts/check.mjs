#!/usr/bin/env node
// check.mjs — the UPDATE beat of the session loop (Check → Submit → Update).
//
// Open obligations live in the Supabase `checks` table — the same table the
// SessionStart kickoff (scripts/session-kickoff.mjs) prints. This helper makes
// reconciling that table a one-liner so the next session's CHECK is true:
//
//   node scripts/check.mjs list
//   node scripts/check.mjs open <project> <check_key> "<label>" [--detail "..."] [--due YYYY-MM-DD] [--resolution manual] [--priority N]
//   node scripts/check.mjs update <check_key|id> [--detail "..."] [--due YYYY-MM-DD] [--priority N] [--label "..."]
//   node scripts/check.mjs close <check_key|id> [note]
//
// `open` creates only — it fails loud (exit 1) if the key already exists, so a
// no-op can never masquerade as success. Revise metadata with `update`
// (state-preserving); change state with `close`.
//
// `check_key` is the stable handle you close on later (e.g. surface_parent_links).
// Credentials come from .dlt/secrets.toml (gitignored), never printed.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";
import { runSignal, SIGNAL_TYPES } from "./lib/check-signals.mjs";

const ROOT = process.cwd();
const SECRETS_PATH = resolve(ROOT, ".dlt/secrets.toml");

// Sentinel so fail() can halt execution like a throw (callers rely on it never
// returning) while letting the top-level catch print nothing extra.
class CheckFail extends Error {}

// Loud, non-zero, but DON'T force process.exit(): calling it synchronously while
// an undici fetch handle is mid-close trips a libuv assertion on Windows (exit
// 127, not 1). Setting exitCode + throwing lets node tear down cleanly — the
// success paths already exit promptly, so the open sockets are unref'd.
function fail(msg) {
  console.error(`check: ${msg}`);
  process.exitCode = 1;
  throw new CheckFail(msg);
}

function creds() {
  let tomlText = "";
  try {
    tomlText = readFileSync(SECRETS_PATH, "utf8");
  } catch {
    // No local secrets file (e.g. CI) — fall through to env vars.
  }
  const c = resolveSupabaseCreds({ tomlText, env: process.env });
  if (!c) fail("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in secrets or env");
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
  if (!res.ok) fail(`Supabase ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function fmtDate(iso) {
  if (!iso) return "?";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

/** Whole days between two ISO timestamps (now - since). Null `since` (a row
 *  with no timestamp at all) returns null rather than a bogus number. */
export function ageDays(nowIso, sinceIso) {
  if (!sinceIso) return null;
  const ms = new Date(nowIso).getTime() - new Date(sinceIso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** Oldest-untouched-first. `updated_at` is the real "last touched" signal;
 *  fall back to `created_at` for rows where it's null. Does not mutate. */
export function sortByStaleness(rows) {
  return [...rows].sort((a, b) => {
    const aStamp = a.updated_at ?? a.created_at;
    const bStamp = b.updated_at ?? b.created_at;
    return new Date(aStamp).getTime() - new Date(bStamp).getTime();
  });
}

// --- class axis: what a check IS, so counts stop mixing bugs with finished
// work, banked ideas, and to-dos. NULL = untriaged (pre-class rows).
export const CHECK_CLASSES = ["defect", "verify", "idea", "task"];

/** Default class from the key's shape: `*_live_verify` is by construction a
 *  built-and-awaiting-operator-verify check. Everything else is untriaged. */
export function inferClass(checkKey) {
  return typeof checkKey === "string" && checkKey.endsWith("_live_verify") ? "verify" : null;
}

/** Count open rows per class (null → untriaged). Pure; used by list + kickoff. */
export function classBreakdown(rows) {
  const counts = { defect: 0, verify: 0, idea: 0, task: 0, untriaged: 0 };
  for (const r of rows ?? []) counts[r.class ?? "untriaged"] += 1;
  return counts;
}

/** "384 open — 61 defect · 79 verify · …" (zero-count classes omitted). */
export function formatClassBreakdown(rows) {
  const counts = classBreakdown(rows);
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`);
  return `${(rows ?? []).length} open${parts.length ? ` — ${parts.join(" · ")}` : ""}`;
}

function parseClassFlag(raw) {
  if (typeof raw !== "string" || !CHECK_CLASSES.includes(raw))
    fail(`--class must be one of: ${CHECK_CLASSES.join(", ")}`);
  return raw;
}

/** Split argv into positionals + a flag map (flags take the next token as value). */
function parseArgs(args) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) flags[a.slice(2)] = args[++i] ?? true;
    else positionals.push(a);
  }
  return { positionals, flags };
}

// --- proof helpers (pure — unit-tested without a git/DB state) ---

// Tier is fixed by whether the check carries a stored signal. A signal-bearing
// check MUST close by running that signal; a signal-less one closes with a
// recorded human attestation. The trigger enforces the same split server-side.
export function closeTier(row) {
  return row && row.signal != null ? "signal" : "manual";
}

// The proof record a signal-bearing close writes. `observed` is what runSignal
// actually saw — the CLI made the call, so this is not self-reported. `signal`
// echoes the STORED signal so the trigger can bind proof→signal.
export function buildSignalProof({ signal, observed, nowIso, by }) {
  return {
    kind: "signal",
    ok: true,
    signal,
    observed: observed ?? null,
    observed_at: nowIso,
    by: by ?? "session",
  };
}

// The proof record a signal-less (manual) close writes — honestly the weaker
// tier: a recorded, non-empty human attestation.
export function buildManualProof({ evidence, nowIso, by }) {
  return { kind: "manual", evidence, observed_at: nowIso, by: by ?? "session" };
}

// Parse + validate a --signal '<json>' flag. Rejects non-JSON, non-objects, and
// unknown types at the CLI boundary so a bad signal never reaches the DB.
export function parseSignalFlag(raw) {
  if (typeof raw !== "string") fail("--signal needs a JSON value");
  let sig;
  try {
    sig = JSON.parse(raw);
  } catch (e) {
    fail(`--signal is not valid JSON: ${e.message}`);
  }
  if (!sig || typeof sig !== "object" || Array.isArray(sig) || !sig.type)
    fail("--signal JSON must be an object with a `type`");
  if (!SIGNAL_TYPES.includes(sig.type))
    fail(`--signal type must be one of: ${SIGNAL_TYPES.join(", ")}`);
  return sig;
}

async function list(args = []) {
  const { flags } = parseArgs(args);
  const rows = await rest("checks?state=eq.open&order=due_at.asc.nullslast&select=*");
  if (!rows.length) {
    console.log("none open ✓");
    return;
  }
  const nowIso = new Date().toISOString();
  const staleDays = flags.stale != null ? Number(flags.stale) : null;
  console.log(`  ${formatClassBreakdown(rows)}`);

  let out = rows;
  if (flags.class != null) {
    const want = flags.class === "untriaged" ? null : parseClassFlag(flags.class);
    out = out.filter((r) => (r.class ?? null) === want);
  }
  if (staleDays != null) {
    out = sortByStaleness(out).filter(
      (r) => (ageDays(nowIso, r.updated_at ?? r.created_at) ?? 0) >= staleDays,
    );
  }

  for (const r of out) {
    const due = r.due_at ? ` (due ${fmtDate(r.due_at)})` : "";
    const age = ageDays(nowIso, r.updated_at ?? r.created_at);
    const ageLabel = age != null ? ` [${age}d untouched]` : "";
    const tag = r.class ? `${r.class}·${r.project}` : r.project;
    console.log(`  ${r.check_key}  ·  ${r.label}${due}${ageLabel}  [${tag}]`);
  }
  if (staleDays != null && !out.length) console.log(`none untouched ≥${staleDays}d ✓`);
  if (flags.class != null && !out.length) console.log(`none in class ${flags.class} ✓`);
}

async function open(args) {
  const { positionals, flags } = parseArgs(args);
  const [project, checkKey, label] = positionals;
  if (!project || !checkKey || !label)
    fail(
      'open: need <project> <check_key> "<label>" — e.g. open surface surface_parent_links "Wire corridor links"',
    );
  // Idempotent on the stable check_key.
  const existing = await rest(
    `checks?check_key=eq.${encodeURIComponent(checkKey)}&select=check_key,state,label`,
  );
  if (existing.length) {
    // Loud, non-zero: a no-op must never masquerade as success. `open` only
    // creates — to revise an existing check's metadata use `update`, to change
    // its state use `close`.
    fail(
      `already exists (${existing[0].state}): ${checkKey} — ${existing[0].label}. ` +
        `open creates only; use \`update ${checkKey} [--detail …]\` to revise, or \`close\` to change state.`,
    );
  }
  const row = {
    project,
    check_key: checkKey,
    label,
    state: "open",
    resolution: flags.resolution ?? "manual",
    priority: flags.priority ? Number(flags.priority) : 0,
    class: flags.class != null ? parseClassFlag(flags.class) : inferClass(checkKey),
  };
  if (flags.detail) row.detail = flags.detail;
  if (flags.due) row.due_at = flags.due;
  // A machine-checkable close assertion, set at creation and immutable thereafter
  // (see the checks_require_proof trigger). Without one the check is manual-tier.
  if (flags.signal != null) row.signal = parseSignalFlag(flags.signal);
  await rest("checks", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  console.log(
    `opened: ${checkKey} — ${label}${row.class ? ` [${row.class}]` : ""}${row.signal ? ` [signal: ${row.signal.type}]` : ""}`,
  );
}

// Upsert-to-open. Unlike `open` (create-only — fails if the key exists in ANY
// state), `reopen` is idempotent across a close/re-fail cycle: a recurring cron
// flapper MUST be able to re-open its `done` incident check. Re-opens a closed
// row (clearing resolved_at/by) or creates a fresh one.
async function reopen(args) {
  const { positionals, flags } = parseArgs(args);
  const [project, checkKey, label] = positionals;
  if (!project || !checkKey || !label)
    fail('reopen: need <project> <check_key> "<label>" — re-opens a closed check (or creates it)');
  const existing = await rest(
    `checks?check_key=eq.${encodeURIComponent(checkKey)}&select=check_key,state`,
  );
  if (existing.length) {
    // Clear the old proof too — a re-opened check's prior proof is stale.
    const patch = { state: "open", resolved_at: null, resolved_by: null, proof: null };
    if (flags.class != null) patch.class = parseClassFlag(flags.class);
    if (flags.detail) patch.detail = flags.detail;
    await rest(`checks?check_key=eq.${encodeURIComponent(checkKey)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    console.log(`reopened: ${checkKey} (was ${existing[0].state})`);
    return;
  }
  const row = {
    project,
    check_key: checkKey,
    label,
    state: "open",
    resolution: flags.resolution ?? "manual",
    priority: flags.priority ? Number(flags.priority) : 0,
    class: flags.class != null ? parseClassFlag(flags.class) : inferClass(checkKey),
  };
  if (flags.detail) row.detail = flags.detail;
  if (flags.due) row.due_at = flags.due;
  await rest("checks", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  console.log(`opened: ${checkKey} — ${label}`);
}

async function close(args) {
  const { positionals, flags } = parseArgs(args);
  const [handle, ...noteParts] = positionals;
  if (!handle)
    fail('close: need a check_key or id — close <check_key|id> [note] [--evidence "..."] [--drop]');
  const note = noteParts.join(" ") || null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle);
  const col = isUuid ? "id" : "check_key";
  const where = `checks?${col}=eq.${encodeURIComponent(handle)}`;
  const nowIso = new Date().toISOString();

  // --drop = abandoned, not attested → state='dropped' (the trigger does NOT gate
  // 'dropped') with no proof. note → drop_reason.
  if (flags.drop) {
    const patch = { state: "dropped", resolved_at: nowIso, resolved_by: "session" };
    if (note) patch.drop_reason = note;
    const updated = await rest(where, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    const arr = Array.isArray(updated) ? updated : [updated];
    if (!arr.length) fail(`no check matched ${col}=${handle}`);
    console.log(`dropped: ${handle} — ${arr[0]?.label ?? ""}`.trim());
    return;
  }

  // A real close asserts live proof. Fetch the STORED signal to pick the tier —
  // the CLI never accepts a signal from argv, so a session cannot swap in an
  // easy one.
  const rows = await rest(`${where}&select=id,check_key,label,state,signal,resolution`);
  if (!rows.length) fail(`no check matched ${col}=${handle}`);
  const row = rows[0];
  const by = note ?? "session";
  let proof;

  if (closeTier(row) === "signal") {
    // The CLI makes the live HTTP/DB call itself; the observed result is not
    // self-reported. A non-passing signal blocks the close — the gate working.
    const result = await runSignal(row.signal, { rest });
    if (!result.ok)
      fail(
        `live signal did NOT pass for ${row.check_key} — ${result.detail}. Not closing (that is the gate, not a false alarm).`,
      );
    console.log(`signal ok: ${result.detail}`);
    proof = buildSignalProof({ signal: row.signal, observed: result.observed, nowIso, by });
  } else {
    const evidence = typeof flags.evidence === "string" ? flags.evidence.trim() : "";
    if (!evidence)
      fail(
        `manual check ${row.check_key} has no signal — pass --evidence "<what you observed / commit / url>". A bare close is not allowed.`,
      );
    proof = buildManualProof({ evidence, nowIso, by });
  }

  const updated = await rest(where, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ state: "done", resolved_at: nowIso, resolved_by: by, proof }),
  });
  const arr = Array.isArray(updated) ? updated : [updated];
  if (!arr.length) fail(`no check matched ${col}=${handle}`);
  console.log(`closed: ${handle} — ${arr[0]?.label ?? ""} [${proof.kind}]`.trim());
}

async function update(args) {
  const { positionals, flags } = parseArgs(args);
  const [handle] = positionals;
  if (!handle)
    fail(
      'update: need a check_key or id — update <check_key|id> [--detail "..."] [--due YYYY-MM-DD] [--priority N]',
    );
  // Metadata-only: PATCH the named fields, leave `state` untouched (that's
  // `close`'s job). At least one field is required so a no-op can't pass.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle);
  const col = isUuid ? "id" : "check_key";
  const patch = { updated_at: new Date().toISOString() };
  if (flags.detail != null) patch.detail = flags.detail;
  if (flags.due != null) patch.due_at = flags.due;
  if (flags.priority != null) patch.priority = Number(flags.priority);
  if (flags.label != null) patch.label = flags.label;
  if (flags.class != null) patch.class = parseClassFlag(flags.class);
  if (flags.signal != null) {
    // Attach a signal ONLY to a signal-less check. A set signal is immutable via
    // the CLI (the trigger enforces it); pre-check so we fail friendly, not 500.
    const sig = parseSignalFlag(flags.signal);
    const existing = await rest(`checks?${col}=eq.${encodeURIComponent(handle)}&select=signal`);
    if (existing.length && existing[0].signal != null)
      fail(
        `signal already set on ${handle} and immutable via the CLI. Change it only via a Bun.SQL session that has SET app.allow_signal_edit='1'.`,
      );
    patch.signal = sig;
  }
  const { updated_at: _unused, ...meaningful } = patch;
  if (!Object.keys(meaningful).length)
    fail(
      "update: nothing to change — pass --detail / --due / --priority / --label / --class / --signal",
    );
  const updated = await rest(`checks?${col}=eq.${encodeURIComponent(handle)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  const arr = Array.isArray(updated) ? updated : [updated];
  if (!arr.length) fail(`no check matched ${col}=${handle}`);
  console.log(`updated: ${handle} — ${Object.keys(patch).join(", ")} [${arr[0]?.state}]`);
}

async function mainCli() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    switch (cmd) {
      case "list":
        await list(args);
        break;
      case "open":
        await open(args);
        break;
      case "reopen":
        await reopen(args);
        break;
      case "close":
        await close(args);
        break;
      case "update":
        await update(args);
        break;
      default:
        console.log(
          'usage:\n  check.mjs list [--stale N] [--class defect|verify|idea|task|untriaged]  (N = min days untouched)\n  check.mjs open <project> <check_key> "<label>" [--class defect|verify|idea|task] [--detail "..."] [--due YYYY-MM-DD] [--resolution manual] [--priority N] [--signal \'<json>\']\n  check.mjs reopen <project> <check_key> "<label>" [--class ...] [--detail "..."]  (idempotent: re-open a closed check or create it)\n  check.mjs update <check_key|id> [--detail "..."] [--due YYYY-MM-DD] [--priority N] [--label "..."] [--class ...] [--signal \'<json>\']\n  check.mjs close <check_key|id> [note] [--evidence "..."] [--drop]\n\n  --class: defect = live problem · verify = built, awaiting operator live-verify · idea = banked candidate · task = to-do that isn\'t a defect\n  (`*_live_verify` keys default to verify automatically; everything else defaults to untriaged.)\n  --signal types: http_ok {url}, http_body {url,contains}, db_row_exists {table,filter}, db_fresh {table,column,max_age_days}\n  A check WITH a signal closes only when the CLI re-runs it live and it passes; a check WITHOUT one needs --evidence.',
        );
        process.exitCode = cmd ? 1 : 0;
    }
  } catch (e) {
    // CheckFail already printed its message + set exitCode; anything else is a
    // real crash worth surfacing.
    if (!(e instanceof CheckFail)) {
      console.error(e);
      process.exitCode = 1;
    }
  }
}

// Only drive the CLI when invoked directly — importing this module (e.g. from
// scripts/check.test.mjs) must NOT run the dispatch or touch process.argv.
const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) await mainCli();
