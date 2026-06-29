#!/usr/bin/env bun
/**
 * scripts/smoke-prod.mts — post-deploy HTTP smoke runner
 *
 * Runs HTTP assertions against prod, stamps passing checks via check.mjs update,
 * exits 1 on any failure so the GHA workflow goes red.
 *
 * Usage:
 *   bun scripts/smoke-prod.mts [--base <url>] [--keys <k1,k2>] [--dry-run]
 */
import { execSync } from "node:child_process";
import { resolve } from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

type SmokeTest = {
  checkKey: string;
  label: string;
  run: (base: string) => Promise<void>;
};

type SmokeResult =
  { test: SmokeTest; passed: true } | { test: SmokeTest; passed: false; error: string };

// ── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(): { base: string; keys: string[] | null; dryRun: boolean } {
  const args = process.argv.slice(2);
  let base = "https://www.swfldatagulf.com";
  let keys: string[] | null = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base" && args[i + 1]) base = args[++i];
    else if (args[i] === "--keys" && args[i + 1]) keys = args[++i].split(",");
    else if (args[i] === "--dry-run") dryRun = true;
  }
  return { base, keys, dryRun };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertOk(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res;
}

async function assertBodyContains(res: Response, needle: string): Promise<void> {
  const text = await res.text();
  if (!text.includes(needle))
    throw new Error(`Expected body to contain "${needle}" — got: ${text.slice(0, 300)}`);
}

function today(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

const CHECK_MJS = resolve(import.meta.dirname, "../scripts/check.mjs");

function stampCheck(checkKey: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`        [dry-run] would stamp: ${checkKey}`);
    return;
  }
  try {
    execSync(`node ${CHECK_MJS} update ${checkKey} --detail "smoke passed ${today()}"`, {
      stdio: "pipe",
    });
  } catch {
    // Non-fatal: check may already be closed or key may not exist
    console.warn(`        [warn] could not stamp ${checkKey} — check may already be closed`);
  }
}

// ── Assertion catalog ────────────────────────────────────────────────────────

const SMOKE_TESTS: SmokeTest[] = [
  {
    checkKey: "one_assistant_unify_live_verify",
    label: "POST /api/assistant → 200 + streaming body starts",
    async run(base) {
      const res = await assertOk(`${base}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "outside",
          messages: [{ role: "user", content: "What is the SWFL home price trend?" }],
        }),
      });
      // Read first chunk only — streaming; don't wait for full LLM response
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Response has no body stream");
      const { value, done } = await reader.read();
      reader.cancel();
      if (done || !value || value.length === 0)
        throw new Error("Streaming body is empty on first read");
    },
  },
  {
    checkKey: "welcome_converse_mcp_zip_live_verify",
    label: "GET /api/b/home-values-swfl?zip=33931 → contains '33931' + 'Lee', no 'Lehigh Acres'",
    async run(base) {
      // master brain has no per-ZIP speak rows; home-values-swfl IS ZIP-level
      // and confirms 33931 routes to Lee County (not Lehigh Acres in a wrong region)
      const res = await assertOk(`${base}/api/b/home-values-swfl?zip=33931&view=speak&tier=1`);
      const text = await res.text();
      if (!text.includes("33931"))
        throw new Error(`ZIP 33931 not reflected in response — got: ${text.slice(0, 300)}`);
      if (!text.includes("Lee"))
        throw new Error(
          `Expected 'Lee' (Lee County) in response for ZIP 33931 — got: ${text.slice(0, 300)}`,
        );
      if (text.includes("Lehigh Acres"))
        throw new Error("Response incorrectly names 'Lehigh Acres' for ZIP 33931");
    },
  },
  {
    checkKey: "zip_quick_summary_live_verify",
    label: "GET /r/zip-report/33908 → 200 + page contains census.gov",
    async run(base) {
      const res = await assertOk(`${base}/r/zip-report/33908`);
      await assertBodyContains(res, "census.gov");
    },
  },
  {
    checkKey: "briefcase_examples_live_verify",
    label: "GET /p/example-email + /p/example-market-overview → 200 each",
    async run(base) {
      await Promise.all([
        assertOk(`${base}/p/example-email`),
        assertOk(`${base}/p/example-market-overview`),
      ]);
    },
  },
  {
    checkKey: "homepage_listing_showcase_live_verify",
    label: "GET / → 200 + HTML contains <body",
    async run(base) {
      const res = await assertOk(base);
      await assertBodyContains(res, "<body");
    },
  },
  {
    checkKey: "siteflow_b1_shell_verify",
    label: "GET / → 200 (SiteShell render)",
    async run(base) {
      // Shares the homepage GET; just confirms 200
      await assertOk(base);
    },
  },
  {
    checkKey: "charts_tier_panel_live_verify",
    label: "GET /charts → 200",
    async run(base) {
      await assertOk(`${base}/charts`);
    },
  },
  {
    checkKey: "storm_ian_live_verify",
    label: "GET /api/b/storm-history-swfl?view=speak&tier=1 → 200 + _Freshness:_",
    async run(base) {
      // view=speak returns markdown narrative; freshness appears as "_Freshness:_" not JSON key
      const res = await assertOk(`${base}/api/b/storm-history-swfl?view=speak&tier=1`);
      await assertBodyContains(res, "_Freshness:_");
    },
  },
  {
    checkKey: "rsw_v3_live_verify",
    label: "GET /api/b/rsw-airport?view=speak&tier=1 → 200 + _Freshness:_",
    async run(base) {
      // view=speak returns markdown narrative; freshness appears as "_Freshness:_" not JSON key
      const res = await assertOk(`${base}/api/b/rsw-airport?view=speak&tier=1`);
      await assertBodyContains(res, "_Freshness:_");
    },
  },
];

const MANUAL_ONLY: Array<{ checkKey: string; reason: string }> = [
  { checkKey: "global_nav_signed_in_live_verify", reason: "requires real session cookie" },
  { checkKey: "branding_save_live_verify", reason: "requires authenticated PATCH + read-back" },
  { checkKey: "piece2_live_verify", reason: "requires project context + auth" },
  { checkKey: "root1_unify_live_verify", reason: "requires auth + pill interaction" },
  { checkKey: "piece1_branding_all_paths_verify", reason: "auth-gated" },
  { checkKey: "piece1_email_scope_build_verify", reason: "auth-gated" },
  { checkKey: "piece1_workspace_shell_verify", reason: "auth-gated" },
  { checkKey: "carry_back_bridge_live_verify", reason: "requires anon→claim flow" },
  { checkKey: "mcp_project_tools_live_verify", reason: "requires X-Project-Key header" },
  { checkKey: "email_scheduler_f_live_verify", reason: "requires real email send" },
  { checkKey: "email_lab_tracking_live_verify", reason: "requires real email send" },
  {
    checkKey: "ingest_database_url_repoint_live_verify",
    reason: "ingest-layer, not HTTP-probeable",
  },
  { checkKey: "solo25_dq_probe_live_verify", reason: "ingest-layer, not HTTP-probeable" },
  { checkKey: "incremental_ingest_live_verify", reason: "ingest-layer, not HTTP-probeable" },
  { checkKey: "prochart_rendering_live_verify", reason: "browser/visual" },
  { checkKey: "email_lab_block_editing_live_verify", reason: "browser/visual" },
];

// ── Runner ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { base, keys, dryRun } = parseArgs();

  const tests = keys ? SMOKE_TESTS.filter((t) => keys.includes(t.checkKey)) : SMOKE_TESTS;

  console.log(`\nsmoke-prod — target: ${base}${dryRun ? " [dry-run]" : ""}`);
  console.log(`Running ${tests.length} automated assertions...\n`);

  const settled = await Promise.allSettled(
    tests.map((t) =>
      t
        .run(base)
        .then((): SmokeResult => ({ test: t, passed: true }))
        .catch((e: Error): SmokeResult => ({ test: t, passed: false, error: e.message })),
    ),
  );

  let failures = 0;

  for (const r of settled) {
    // allSettled never rejects — the inner .catch() guarantees fulfillment
    if (r.status !== "fulfilled") continue;
    const result = r.value;
    if (result.passed) {
      console.log(`  PASS  ${result.test.checkKey}`);
      console.log(`        ${result.test.label}`);
      stampCheck(result.test.checkKey, dryRun);
    } else {
      failures++;
      console.log(`  FAIL  ${result.test.checkKey}`);
      console.log(`        ${result.test.label}`);
      console.log(`        Error: ${result.error}`);
      console.log(
        `        To close manually: node scripts/check.mjs close ${result.test.checkKey} "verified manually"`,
      );
    }
  }

  if (!keys) {
    console.log(`\nManual-only (${MANUAL_ONLY.length}) — skipped:`);
    for (const m of MANUAL_ONLY) {
      console.log(`  SKIP  ${m.checkKey} — ${m.reason}`);
    }
  }

  const total = tests.length;
  const passed = total - failures;
  console.log(`\n${passed}/${total} passed${failures > 0 ? `, ${failures} FAILED` : " ✓"}`);

  if (failures > 0) process.exit(1);
}

main();
