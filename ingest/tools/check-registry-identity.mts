#!/usr/bin/env bun
/**
 * check-registry-identity — the config-identity cross-check (spec §6).
 *
 * Machine-verifies the hand-synced identity strings against each other so a
 * one-letter drift fails the PR instead of going silent for weeks. Every failure
 * names BOTH SIDES.
 *
 *   bun ingest/tools/check-registry-identity.mts --static        # files only (pre-push hook)
 *   bun ingest/tools/check-registry-identity.mts --live          # + data_lake reads (CI, advisory)
 *   bun ingest/tools/check-registry-identity.mts --live --gate   # + fail on RED (after one green confirm)
 *   bun ingest/tools/check-registry-identity.mts --refresh-tags  # refresh ingest/tools/action-tags.json
 *
 * EXIT: 0 = no blocking findings · 1 = confirmed drift.
 * Any tooling failure (no gh, no DB, unparseable file) degrades that sub-check to
 * skip + WARN and NEVER flips the exit code — fail-OPEN, same contract as Gate 2/5.
 *
 * NOT IN SCOPE: workflow *state* at the GitHub API. Four workflows carry live crons
 * in source while `disabled_manually` at the API, orphaning 6 entries. --static reads
 * FILES, --live reads the DB; neither can see run state. That is the §7 3a watch
 * manifest's `disabled` field — do not bolt it on here.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { formatFindings, fsRepo, loadRegistry, type Finding } from "./lib/identity-model.mts";
import { applyKnownDrift, runStaticChecks, type TagResolver } from "./lib/identity-static.mts";
import { runLiveChecks } from "./lib/identity-live.mts";
import { bunSqlLake } from "./lib/identity-lake.mts";

const TAGS_CACHE = "ingest/tools/action-tags.json";
const ACTIONS = [
  "actions/checkout",
  "actions/setup-python",
  "actions/setup-node",
  "oven-sh/setup-bun",
];

function cachedTags(): TagResolver {
  let cache: Record<string, string[]> = {};
  try {
    if (existsSync(TAGS_CACHE)) cache = JSON.parse(readFileSync(TAGS_CACHE, "utf8"));
  } catch {
    /* fail open — resolver returns null → WARN + skip */
  }
  return { tags: (a) => (Array.isArray(cache[a]) ? cache[a] : null) };
}

async function refreshTags(): Promise<void> {
  const next: Record<string, unknown> = {
    _note:
      "Maintained allowlist of action tags. NEVER hand-edit an expected-major here. " +
      `Refresh: bun ingest/tools/check-registry-identity.mts --refresh-tags. Snapshot: ${new Date().toISOString().slice(0, 10)}.`,
  };
  for (const action of ACTIONS) {
    const p = Bun.spawnSync(["gh", "api", `repos/${action}/tags`, "--paginate", "--jq", ".[].name"]);
    if (p.exitCode !== 0) {
      console.warn(`  WARN: could not resolve tags for ${action} — leaving the cached list intact.`);
      continue;
    }
    next[action] = p.stdout.toString().trim().split("\n").filter(Boolean).slice(0, 24);
  }
  const prev = existsSync(TAGS_CACHE) ? JSON.parse(readFileSync(TAGS_CACHE, "utf8")) : {};
  writeFileSync(TAGS_CACHE, `${JSON.stringify({ ...prev, ...next }, null, 2)}\n`);
  console.log(`registry-identity: refreshed ${TAGS_CACHE} from live \`gh api\` tags.`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--refresh-tags")) {
    await refreshTags();
    process.exit(0);
  }
  const live = argv.includes("--live");
  const gate = argv.includes("--gate");

  const repo = fsRepo(process.cwd());
  const reg = loadRegistry(repo);

  const findings: Finding[] = runStaticChecks(reg, repo, cachedTags());

  if (live) {
    const lake = await bunSqlLake();
    if (!lake) {
      findings.push({
        rule: "live_unavailable",
        entry: "--live",
        severity: "warn",
        registrySide: "--live requested",
        otherSide: "no DESTINATION__POSTGRES__CREDENTIALS and no .dlt/secrets.toml — DB checks SKIPPED",
        fix: "Fail-open. In CI, wire DESTINATION__POSTGRES__CREDENTIALS into the ci.yml step `env:`.",
      });
    } else {
      findings.push(...(await runLiveChecks(reg, repo, lake, new Date())));
      await lake.close();
    }
  }

  const { blocking, suppressed } = applyKnownDrift(reg, findings);
  const mode = live ? (gate ? "live (gating)" : "live (ADVISORY)") : "static";

  if (suppressed.length > 0) {
    console.warn(`\nregistry-identity: ${suppressed.length} advisory/known finding(s) [${mode}]:\n`);
    console.warn(formatFindings(suppressed));
  }
  if (blocking.length === 0) {
    console.log(`\nregistry-identity: OK [${mode}] — every registry↔workflow↔code identity resolves.`);
    process.exit(0);
  }

  console.error(`\nregistry-identity: ${blocking.length} identity drift(s) [${mode}]:\n`);
  console.error(formatFindings(blocking));

  // ADVISORY-FIRST for --live (spec §7 3c: ship advisory, flip to gating after one
  // green confirm). On today's snapshot redfin_city_swfl / dbpr_re_licensees /
  // leepa_parcel_zip are all genuinely red; a blocking --live on day one would red
  // CI on landing — the exact false-red disease this build exists to kill.
  if (live && !gate) {
    console.error(`\n(advisory mode — not failing the build. Flip with --gate after one green confirm.)`);
    process.exit(0);
  }
  process.exit(1);
}

main().catch((err) => {
  // Fail-OPEN on a tool crash (same contract as the pre-push gate): warn loudly,
  // exit 0. A broken checker must never wedge every push.
  console.error(`registry-identity: check failed to run (skipped, NOT passed) — ${err?.message ?? err}`);
  process.exit(0);
});
