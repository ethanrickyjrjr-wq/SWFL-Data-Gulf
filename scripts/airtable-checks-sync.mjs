#!/usr/bin/env node
// scripts/airtable-checks-sync.mjs — delta sync of open `public.checks` rows
// into the read-only Airtable mirror.
//
// Spec: docs/superpowers/specs/2026-07-11-checks-airtable-mirror-design.md
// Check: checks_airtable_mirror_live_verify
//
// Supabase stays the source of truth. Each run:
//   1. finds "dirty" open rows (never synced, or touched since last sync)
//      and upserts them to Airtable in batches of ≤BATCH_SIZE (performUpsert
//      on check_key), then stamps airtable_record_id/airtable_synced_at back
//      onto Supabase from the upsert response — no extra lookup call.
//   2. finds rows that closed since they were last synced (state != open but
//      still carrying an airtable_record_id) and deletes them from Airtable
//      in batches of ≤BATCH_SIZE, then clears airtable_record_id on Supabase.
//
// Usage: node scripts/airtable-checks-sync.mjs [--dry-run]
//
// Airtable failures are logged and end the run WITHOUT touching Supabase's
// sync-tracking columns for the failed batch — those rows just stay dirty
// and get retried on the next run. This script is never a hard dependency
// for check.mjs, which doesn't call it at all.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";
import { resolveAirtableCreds } from "./lib/airtable-creds.mjs";
import {
  chunk,
  buildUpsertBody,
  buildDeleteUrl,
  BATCH_SIZE,
} from "./lib/airtable-checks-sync-core.mjs";

const ROOT = process.cwd();
const SECRETS_PATH = resolve(ROOT, ".dlt/secrets.toml");
const DRY_RUN = process.argv.includes("--dry-run");

function secretsToml() {
  try {
    return readFileSync(SECRETS_PATH, "utf8");
  } catch {
    return "";
  }
}

function creds() {
  const tomlText = secretsToml();
  const supabase = resolveSupabaseCreds({ tomlText, env: process.env });
  if (!supabase) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in secrets or env");
  const airtable = resolveAirtableCreds({ tomlText, env: process.env });
  if (!airtable)
    throw new Error(
      "AIRTABLE_TOKEN / AIRTABLE_CHECKS_BASE_ID / AIRTABLE_CHECKS_TABLE_ID not found in secrets or env",
    );
  return { supabase, airtable };
}

async function supabaseRest(supabase, path, init = {}) {
  const res = await fetch(`${supabase.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabase.key,
      Authorization: `Bearer ${supabase.key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function airtableRest(airtable, urlOrPath, init = {}) {
  const url = urlOrPath.startsWith("http")
    ? urlOrPath
    : `https://api.airtable.com/v0/${airtable.baseId}/${airtable.tableId}${urlOrPath}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${airtable.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const OPEN_ROW_FIELDS =
  "check_key,project,label,detail,priority,due_at,created_at,updated_at,airtable_record_id,airtable_synced_at";

async function findDirtyOpens(supabase) {
  const rows = await supabaseRest(supabase, `checks?state=eq.open&select=${OPEN_ROW_FIELDS}`);
  // airtable_synced_at < updated_at is a column-to-column comparison PostgREST
  // can't express as a query filter — fetch the (small) open set and filter
  // here, same approach check.mjs's own list() uses for staleness sorting.
  return rows.filter(
    (r) => !r.airtable_synced_at || new Date(r.airtable_synced_at) < new Date(r.updated_at),
  );
}

async function findStaleCloses(supabase) {
  return supabaseRest(
    supabase,
    "checks?state=neq.open&airtable_record_id=not.is.null&select=check_key,airtable_record_id",
  );
}

async function syncUpserts(supabase, airtable, dirtyRows) {
  let synced = 0;
  for (const batch of chunk(dirtyRows, BATCH_SIZE)) {
    if (DRY_RUN) {
      console.log(
        `  [dry-run] would upsert ${batch.length}: ${batch.map((r) => r.check_key).join(", ")}`,
      );
      continue;
    }
    const body = buildUpsertBody(batch);
    const result = await airtableRest(airtable, "", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const nowIso = new Date().toISOString();
    for (const record of result.records) {
      const checkKey = record.fields.check_key;
      await supabaseRest(supabase, `checks?check_key=eq.${encodeURIComponent(checkKey)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ airtable_record_id: record.id, airtable_synced_at: nowIso }),
      });
      synced++;
    }
  }
  return synced;
}

async function syncDeletes(supabase, airtable, staleRows) {
  let deleted = 0;
  for (const batch of chunk(staleRows, BATCH_SIZE)) {
    const keys = batch.map((r) => r.check_key);
    if (DRY_RUN) {
      console.log(`  [dry-run] would delete ${batch.length}: ${keys.join(", ")}`);
      continue;
    }
    const url = buildDeleteUrl(
      airtable,
      batch.map((r) => r.airtable_record_id),
    );
    await airtableRest(airtable, url, { method: "DELETE" });
    await supabaseRest(
      supabase,
      `checks?check_key=in.(${keys.map(encodeURIComponent).join(",")})`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ airtable_record_id: null }),
      },
    );
    deleted += batch.length;
  }
  return deleted;
}

async function main() {
  const { supabase, airtable } = creds();
  const [dirty, stale] = await Promise.all([findDirtyOpens(supabase), findStaleCloses(supabase)]);
  console.log(
    `airtable-checks-sync: ${dirty.length} dirty open row(s), ${stale.length} stale close(s)${DRY_RUN ? " (dry-run)" : ""}`,
  );
  const synced = await syncUpserts(supabase, airtable, dirty);
  const deleted = await syncDeletes(supabase, airtable, stale);
  console.log(`airtable-checks-sync: synced ${synced}, deleted ${deleted}`);
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error(`airtable-checks-sync: ${err.message}`);
    process.exitCode = 1;
  });
}

export { findDirtyOpens, findStaleCloses, syncUpserts, syncDeletes };
