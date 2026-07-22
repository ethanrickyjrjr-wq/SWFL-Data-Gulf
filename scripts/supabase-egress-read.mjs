#!/usr/bin/env node
// supabase-egress-read.mjs — read REAL served bytes from Supabase, not arithmetic.
//
// WHY THIS EXISTS (07/21/2026): two sessions produced two honest, verified,
// mutually-irrelevant "egress" numbers — ~300 GB/day of Storage snapshot
// re-downloads, and ~241 kB per page render of PostgREST payload — and it read
// to the operator as days of contradiction. Neither was the bill. NOBODY HAS
// EVER READ THE BILL. Every egress claim on this platform to date is payload
// arithmetic.
//
// VENDOR-VERIFIED 07/21/2026 against https://api.supabase.com/api/v1-json
// (the authoritative OpenAPI spec, fetched in-session — not memory, not docs
// prose):
//
//   * The words "egress" and "bandwidth" appear ZERO times in the entire
//     Management API v1 spec. There is NO egress endpoint. Anyone who tells you
//     to "just call the usage API for egress" is wrong — check before believing.
//   * Billing paths are addon management only:
//       /v1/projects/{ref}/billing/addons
//       /v1/projects/{ref}/billing/addons/{addon_variant}
//   * The two usage paths return COUNTS, not bytes:
//       /v1/projects/{ref}/analytics/endpoints/usage.api-counts      (param: interval)
//       /v1/projects/{ref}/analytics/endpoints/usage.api-requests-count
//   * The ONLY byte-level path is the log query used here:
//       GET /v1/projects/{ref}/analytics/endpoints/logs.all
//       query params: sql, iso_timestamp_start, iso_timestamp_end
//       auth: bearer token; fine-grained scope `analytics_usage_read`
//
// So: the org-level invoice total is NOT reachable from this API. What IS
// reachable is the log of what was actually served, which is strictly better
// than payload arithmetic for attribution — it is bytes that really left.
//
// SCOPE LIMIT, STATED SO NOBODY OVERCLAIMS AGAIN: this reads SERVED BYTES FROM
// LOGS. That is not the invoice. If you need the billed total, it is the
// dashboard/billing export, and no code here can produce it.
//
// CORRECTION 07/21/2026, same session, after the operator pushed back with
// "you have read/write capabilities on supabase!!!" — HE WAS RIGHT and this
// file's premise was too pessimistic. A TOKEN IS NOT REQUIRED TO SEE WHO IS
// BURNING. The Supabase connection already wired into the agent exposes the
// storage request log directly (get_logs, service "storage", last 24h, no
// token, no setup). Running it confirmed the 07/21 kill: the burner's final
// entries are all "ABORTED REQ" and nothing follows them, while the only
// remaining reader is duckdb linux_amd64/python doing HEAD + range GET on
// single .parquet files — the legitimate ingest path, exactly as triaged.
// It also shows the burn verbatim: leepa/last_sale/2026-05-30.csv.gz fetched
// FIVE times in twelve seconds by duckdb windows_amd64/node-neo-api.
//
// So the split is: ATTRIBUTION (who read what, how often, which client) is
// free and available right now. BYTES are not — those log lines carry no size
// field, which is the only thing this file's token is actually for. Do not let
// "we can't read egress" stand unqualified again; it was half true, and the
// half that was false sent us building around a wall that wasn't there.

import process from "node:process";
import { pathToFileURL } from "node:url";

export const API_BASE = "https://api.supabase.com";
export const TOKEN_ENV = "SUPABASE_ACCESS_TOKEN";
export const REQUIRED_SCOPE = "analytics_usage_read";

/** Verified path template. Kept as a constant so a future reader can diff it
 *  against the spec instead of trusting this comment. */
export const LOGS_PATH = (ref) => `/v1/projects/${ref}/analytics/endpoints/logs.all`;

/** Builds the request URL. Pure — unit-tested, so the query encoding is proven
 *  without spending a live API call. */
export function buildLogsUrl({ ref, sql, since, until }) {
  if (!ref) throw new Error("supabase-egress-read: project ref is required");
  const url = new URL(LOGS_PATH(ref), API_BASE);
  if (sql) url.searchParams.set("sql", sql);
  if (since) url.searchParams.set("iso_timestamp_start", since);
  if (until) url.searchParams.set("iso_timestamp_end", until);
  return url.toString();
}

/** Why we cannot answer, in the operator's terms. Returns null when we CAN.
 *
 *  This is the load-bearing honesty: an absent token must produce a loud,
 *  actionable refusal — never a zero, never a silent skip. A zero reads as
 *  "no egress", which is the single most dangerous wrong answer here. */
export function explainBlocked({ token, ref }) {
  if (!token) {
    return (
      `NO MANAGEMENT TOKEN — ${TOKEN_ENV} is not set, so the real served-bytes number ` +
      `has never been read. This is NOT zero egress; it is unknown egress. ` +
      `Mint a fine-grained token with the '${REQUIRED_SCOPE}' scope at ` +
      `https://supabase.com/dashboard/account/tokens and set ${TOKEN_ENV}.`
    );
  }
  if (!ref) {
    return `NO PROJECT REF — pass --ref <project-ref> (found in the project URL).`;
  }
  return null;
}

/** True when the machine can actually answer the egress question at all. */
export function canReadEgress(env) {
  return Boolean(env?.[TOKEN_ENV]);
}

/** Sums a bytes column out of the log rows. Tolerates the column being absent
 *  or non-numeric rather than inventing a total — an invented byte count is
 *  exactly the failure this file exists to end. Returns null when nothing
 *  summable was found, so callers report "unknown" instead of 0. */
export function sumBytes(rows, column = "bytes") {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let total = 0;
  let sawNumber = false;
  for (const r of rows) {
    const v = r?.[column];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(n)) {
      total += n;
      sawNumber = true;
    }
  }
  return sawNumber ? total : null;
}

/** Human-readable byte size. Deterministic — no locale surprises. */
export function humanBytes(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "unknown";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Live call. Kept thin: the verified contract is the URL + bearer header. */
export async function fetchLogs({ ref, sql, since, until, token }) {
  const res = await fetch(buildLogsUrl({ ref, sql, since, until }), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `supabase-egress-read: ${res.status} ${res.statusText}. ` +
        (res.status === 401 || res.status === 403
          ? `The token likely lacks the '${REQUIRED_SCOPE}' scope. `
          : "") +
        body.slice(0, 300),
    );
  }
  return res.json();
}

// ---------- run --------------------------------------------------------------

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : undefined;
  };
  const token = process.env[TOKEN_ENV];
  const ref = arg("ref") ?? process.env.SUPABASE_PROJECT_REF;

  const blocked = explainBlocked({ token, ref });
  if (blocked) {
    console.error(`\n${blocked}\n`);
    process.exit(2); // 2 = cannot answer. Distinct from 1 = answered, and it's bad.
  }

  const sql = arg("sql");
  if (!sql) {
    console.error(
      `\nNo --sql given. This tool is a verified transport, not a guessed query:\n` +
        `the endpoint, params and auth scope are confirmed against the vendor spec,\n` +
        `but the log table/column names are NOT verified from this machine (no token\n` +
        `existed when it was written). Pass the query explicitly, e.g.\n\n` +
        `  node scripts/supabase-egress-read.mjs --ref <ref> \\\n` +
        `    --sql "select count(*) as n from edge_logs" --since 2026-07-20T00:00:00Z\n\n` +
        `Start by listing what tables exist, then sum the byte column it actually has.\n`,
    );
    process.exit(2);
  }

  const json = await fetchLogs({
    ref,
    sql,
    since: arg("since"),
    until: arg("until"),
    token,
  });
  const rows = json?.result ?? json?.data ?? json;
  const total = sumBytes(Array.isArray(rows) ? rows : []);
  console.log(JSON.stringify(json, null, 2));
  if (total !== null) console.log(`\nSUMMED BYTES: ${total} (${humanBytes(total)})`);
}
