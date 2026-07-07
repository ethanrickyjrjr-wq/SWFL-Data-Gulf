#!/usr/bin/env node
// scripts/log-triage-spend.mjs
//
// Reads claude-code-action's `execution_file`, logs the deploy-triage run's real
// cost to public.api_usage_log (the same ledger the tripwire reads), and fails
// LOUD if the run exceeded the per-run ceiling. This is how the one unmetered
// Anthropic surface (the GH Action can't use our TS RunBudget client) still gets
// tracked + guarded.
//
// Layered guards on the triage bot:
//   pre-run   : --max-turns 25 (caps run size in the workflow)
//   per-run   : SELFHEAL_TRIAGE_MAX_USD ceiling (this script -> red workflow if over)
//   ledger    : every run's cost row in api_usage_log
//   account   : the existing daily/monthly caps + tripwire on the key
//
// Env:
//   EXECUTION_FILE            path from steps.<id>.outputs.execution_file
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   SELFHEAL_TRIAGE_MAX_USD   per-run ceiling (default 2.00)
//
// Never throws — the triage already ran; this is bookkeeping. Exits 1 only to
// raise the ceiling alarm.

import { readFileSync, appendFileSync } from "node:fs";

const FILE = process.env.EXECUTION_FILE || "";
const CEILING = Number(process.env.SELFHEAL_TRIAGE_MAX_USD || "2.00");
const SUPA_URL = process.env.SUPABASE_URL || "";
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || "";

// execution_file may be a JSON array of messages OR JSONL. Find the terminal
// "result" object that carries total_cost_usd (last one wins).
function findResult(text) {
  const objs = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) objs.push(...parsed);
    else objs.push(parsed);
  } catch {
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      try {
        objs.push(JSON.parse(s));
      } catch {
        /* skip non-JSON lines */
      }
    }
  }
  const withCost = objs.filter((o) => o && typeof o.total_cost_usd === "number");
  return withCost.length ? withCost[withCost.length - 1] : null;
}

async function main() {
  if (!FILE) {
    console.warn("[triage-spend] no EXECUTION_FILE — skipping");
    return;
  }
  let text;
  try {
    text = readFileSync(FILE, "utf8");
  } catch (e) {
    console.warn(`[triage-spend] cannot read ${FILE}: ${e.message}`);
    return;
  }

  const result = findResult(text);
  if (!result) {
    console.warn("[triage-spend] no total_cost_usd found — cannot track this run");
    return;
  }

  const cost = result.total_cost_usd;
  const usage = result.usage || {};
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const model = result.model || "claude-code-action";

  console.log(`[triage-spend] cost=$${cost.toFixed(4)} in=${inTok} out=${outTok} model=${model}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `\n**Deploy-triage Claude spend:** $${cost.toFixed(4)} (in ${inTok} / out ${outTok} tok, ${model})\n`,
      );
    } catch {
      /* summary is best-effort */
    }
  }

  if (SUPA_URL && SUPA_KEY) {
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/api_usage_log`, {
        method: "POST",
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          model,
          call_type: "deploy_triage",
          pack_id: null,
          input_tokens: inTok,
          output_tokens: outTok,
          cache_read_tokens: cacheRead,
          cache_creation_tokens: cacheWrite,
          cost_usd: cost,
          env: "gha-deploy-triage",
        }),
      });
      if (!res.ok)
        console.warn(`[triage-spend] api_usage_log insert ${res.status}: ${await res.text()}`);
      else console.log("[triage-spend] logged to api_usage_log");
    } catch (e) {
      console.warn(`[triage-spend] insert failed (non-fatal): ${e.message}`);
    }
  } else {
    console.warn("[triage-spend] SUPABASE creds absent — not logging to ledger");
  }

  if (cost > CEILING) {
    console.error(
      `::error::[triage-spend] run cost $${cost.toFixed(4)} exceeded ceiling $${CEILING.toFixed(2)}`,
    );
    process.exit(1);
  }
}

main().catch((e) => console.warn(`[triage-spend] ${e.message}`));
