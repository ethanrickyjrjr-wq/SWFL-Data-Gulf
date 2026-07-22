#!/usr/bin/env node
// ceilings-to-checks.mjs — make recorded source ceilings UNMISSABLE.
//
// WHY THIS EXISTS (07/22/2026):
// FULL-SCOPE-FIRST (RULE 0.4) got built as half a rule. The RECORDING half works:
// someone censuses a source and writes `source_scope.source_ceiling` into
// ingest/cadence_registry.yaml with a URL and an as_of. That half is doing its job.
//
// The ACTING half was never built. A ceiling entry is inert — nothing reads it back,
// nothing queues it, nothing surfaces it. It is a note in a 2,000-line file that only
// gets seen if an agent happens to open it.
//
// Cost of that gap, same day, twice: LeePA MapServer layer 23 — literally named
// "Comparable Sales", 108,881 rows carrying BedRooms/Bathrooms/YearBuilt/GrossArea and
// geometry, joinable on a FOLIOID we already hold — was censused 07/19/2026 and sat
// unread. On 07/22 TWO separate sessions independently told the operator we did not have
// beds/baths for comps, one of them after querying information_schema and concluding
// "the field is not in the file." It was in the file. Twice (registry + data-roots T10).
//
// The `checks` ledger is the only mechanism on this platform that appears whether anyone
// looks for it or not — scripts/session-kickoff.mjs prints it before the first prompt.
// So: every recorded ceiling becomes a check. Then "we have data nobody knows about"
// stops being possible without someone actively closing a check that says otherwise.
//
// This is RULE 3 C2 on purpose — it EXTENDS an existing artifact (checks) rather than
// erecting a new mandatory gate. Nothing blocks on it; it only makes the invisible visible.
//
// USAGE
//   node scripts/ceilings-to-checks.mjs              # dry run — prints the plan, writes nothing
//   node scripts/ceilings-to-checks.mjs --apply      # opens/updates the checks
//   node scripts/ceilings-to-checks.mjs --apply --project ingest
//
// IDEMPOTENT: re-running never duplicates. An already-open ceiling check is left alone
// (its detail refreshes only if the registry text changed). A ceiling REMOVED from the
// registry — i.e. we finally pulled it — is reported as closable, never auto-closed:
// closing is a claim that the data landed, and only a human or a real signal may make it.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";

const ROOT = process.cwd();
const REGISTRY = join(ROOT, "ingest", "cadence_registry.yaml");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PROJECT = (() => {
  const i = args.indexOf("--project");
  return i >= 0 && args[i + 1] ? args[i + 1] : "ingest";
})();

function fail(msg) {
  console.error(`ceilings-to-checks: ${msg}`);
  process.exitCode = 1;
  throw new Error(`ceilings-to-checks: ${msg}`);
}

function creds() {
  let tomlText = "";
  try {
    tomlText = readFileSync(join(ROOT, ".dlt/secrets.toml"), "utf8");
  } catch {
    // CI / no local secrets — fall through to env.
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
  if (!res.ok) fail(`${res.status} ${res.statusText} — ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Stable handle. Keyed on pipeline name ONLY so the key survives ceiling text edits —
 *  a reworded summary must not orphan the old check and open a second one. */
const keyFor = (name) =>
  `ceiling_${String(name)
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()}`;

/** One line the operator can read in the kickoff banner without opening anything. */
function labelFor(name, ceiling) {
  const raw = (ceiling.summary ?? "").replace(/\s+/g, " ").trim();
  const head = raw.length > 150 ? `${raw.slice(0, 147)}…` : raw;
  return `Unpulled source ceiling — ${name}: ${head || "recorded, no summary text"}`;
}

function detailFor(name, ceiling) {
  return [
    `Pipeline: ${name}`,
    ceiling.as_of ? `Censused: ${ceiling.as_of}` : null,
    ceiling.source_label ? `Source: ${ceiling.source_label}` : null,
    ceiling.source_url ? `URL: ${ceiling.source_url}` : null,
    ceiling.value != null ? `Ceiling value: ${ceiling.value}` : null,
    "",
    "AVAILABLE BUT UNPULLED (verbatim from ingest/cadence_registry.yaml):",
    (ceiling.summary ?? "(no summary recorded)").trim(),
    "",
    "Close this ONLY when the fields are pulled and landed, or when the operator",
    "explicitly declines the pull (record which, in the close note).",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function readCeilings() {
  if (!existsSync(REGISTRY)) fail(`registry not found at ${REGISTRY}`);
  let doc;
  try {
    doc = parseYaml(readFileSync(REGISTRY, "utf8"));
  } catch (e) {
    fail(`could not parse cadence_registry.yaml: ${e.message}`);
  }
  const out = [];
  // `not_yet_running:` pipelines carry ceilings too (Operation Dumbo Drop parks them
  // there) — a parked pipeline is exactly the kind of thing that gets forgotten, so it
  // is INCLUDED, not skipped.
  for (const bucket of ["pipelines", "not_yet_running"]) {
    for (const p of doc?.[bucket] ?? []) {
      const ceiling = p?.source_scope?.source_ceiling;
      if (!p?.name || !ceiling) continue;
      // A ceiling with neither a summary nor a URL carries no actionable content —
      // recording it would be noise, and noise is how ledgers get ignored.
      if (!ceiling.summary && !ceiling.source_url) continue;
      out.push({ name: p.name, bucket, ceiling });
    }
  }
  return out;
}

async function main() {
  const ceilings = readCeilings();
  if (!ceilings.length) {
    console.log("no source_ceiling blocks found — nothing to surface");
    return;
  }

  const existing =
    (await rest(
      `checks?select=id,check_key,state,detail&project=eq.${encodeURIComponent(PROJECT)}&check_key=like.ceiling_*`,
    )) ?? [];
  const byKey = new Map(existing.map((r) => [r.check_key, r]));

  const toOpen = [];
  const toRefresh = [];
  let unchanged = 0;

  for (const { name, ceiling } of ceilings) {
    const check_key = keyFor(name);
    const detail = detailFor(name, ceiling);
    const prior = byKey.get(check_key);
    if (!prior) {
      toOpen.push({ check_key, name, ceiling, detail });
    } else if (prior.state !== "open") {
      // Was closed, but the registry still lists fields as unpulled. Either the pull never
      // landed or the ceiling text is stale. Surface it; do not silently reopen.
      toRefresh.push({ check_key, name, prior, detail, why: "closed but still recorded unpulled" });
    } else if ((prior.detail ?? "").trim() !== detail.trim()) {
      toRefresh.push({ check_key, name, prior, detail, why: "ceiling text changed" });
    } else {
      unchanged += 1;
    }
  }

  // A check whose pipeline no longer records a ceiling: we probably pulled it. Report,
  // never auto-close — an auto-close asserts data landed that nobody verified.
  const liveKeys = new Set(ceilings.map((c) => keyFor(c.name)));
  const orphaned = existing.filter((r) => r.state === "open" && !liveKeys.has(r.check_key));

  console.log(`ceilings recorded : ${ceilings.length}`);
  console.log(`already open      : ${unchanged}`);
  console.log(`to open           : ${toOpen.length}`);
  console.log(`to refresh        : ${toRefresh.length}`);
  console.log(`no longer recorded: ${orphaned.length} (review — close by hand if the pull landed)`);

  for (const o of toOpen) console.log(`  + ${o.check_key} — ${labelFor(o.name, o.ceiling)}`);
  for (const r of toRefresh) console.log(`  ~ ${r.check_key} — ${r.why}`);
  for (const o of orphaned)
    console.log(`  ? ${o.check_key} — ceiling gone from registry; verify + close`);

  if (!APPLY) {
    console.log("\ndry run — nothing written. re-run with --apply");
    return;
  }

  for (const o of toOpen) {
    await rest("checks", {
      method: "POST",
      body: JSON.stringify({
        project: PROJECT,
        check_key: o.check_key,
        label: labelFor(o.name, o.ceiling),
        detail: o.detail,
        // `task`, not `defect`: an unpulled ceiling is work we chose not to do yet,
        // not something that is broken.
        class: "task",
        resolution: "manual",
      }),
      headers: { Prefer: "return=minimal" },
    });
    console.log(`opened ${o.check_key}`);
  }

  for (const r of toRefresh) {
    await rest(`checks?id=eq.${r.prior.id}`, {
      method: "PATCH",
      body: JSON.stringify({ detail: r.detail, updated_at: new Date().toISOString() }),
      headers: { Prefer: "return=minimal" },
    });
    console.log(`refreshed ${r.check_key} (${r.why})`);
  }
}

main().catch((e) => {
  if (!process.exitCode) process.exitCode = 1;
  const msg = String(e?.message ?? e);
  if (!msg.startsWith("ceilings-to-checks")) console.error(msg);
});
