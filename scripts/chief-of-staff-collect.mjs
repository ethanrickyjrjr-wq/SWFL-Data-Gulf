#!/usr/bin/env node
// Deterministic evidence collector for the chief-of-staff nightly cron. $0 — no LLM.
// Usage: node scripts/chief-of-staff-collect.mjs --out evidence.json
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";
import { parseGitLogNameOnly, buildEvidencePack } from "./chief-of-staff-lib.mjs";

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : "evidence.json";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

async function main() {
  const secretsPath = resolve(process.cwd(), ".dlt/secrets.toml");
  const creds = resolveSupabaseCreds({
    tomlText: existsSync(secretsPath) ? readFileSync(secretsPath, "utf8") : "",
    env: process.env,
  });
  if (!creds) {
    console.error("collect: no Supabase creds (secrets.toml or env)");
    process.exit(1);
  }

  const res = await fetch(
    `${creds.url}/rest/v1/checks?state=eq.open&order=due_at.asc.nullslast&select=check_key,label,project,detail,due_at,updated_at`,
    { headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` } },
  );
  if (!res.ok) {
    console.error(`collect: checks query failed HTTP ${res.status}`);
    process.exit(1);
  }
  const checks = await res.json();
  // PostgREST silently truncates at db-max-rows (memory: postgrest-db-max-rows-truncation).
  // A silently-capped ledger poisons every count in the brief — fail loudly instead.
  if (checks.length > 0 && checks.length % 1000 === 0) {
    console.error(
      `collect: checks count ${checks.length} looks db-max-rows-truncated — add paging before trusting this`,
    );
    process.exit(1);
  }

  const commits = parseGitLogNameOnly(
    git(["log", "--since=48 hours ago", "--pretty=format:%H\t%s", "--name-only"]),
  );
  const fullLogText = git(["log", "--pretty=format:%h %s"]);

  const pack = buildEvidencePack({ commits, checks, fullLogText });
  writeFileSync(OUT, JSON.stringify(pack, null, 2));
  console.log(
    `collect: ${pack.commits.length} commits (48h) · ${pack.checks.length} open checks · ` +
      `${pack.live_verify_never_started.length} never-started · ${pack.stale.length} stale -> ${OUT}`,
  );
}

main().catch((e) => {
  console.error(`collect: ${e.message}`);
  process.exit(1);
});
