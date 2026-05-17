/**
 * Personal Vault — export backup CLI.
 *
 * Dump every row in personal_vault.vault_fragments to a local JSON file under
 * .private/ (gitignored). Insurance against the nightmare scenarios:
 * Supabase suspension, accidental DROP TABLE, key rotation gone wrong.
 *
 * Habit to build: run after every banking session.
 *
 * Usage:
 *   bun refinery/tools/vault-export.mts
 *     # writes .private/vault-backup-YYYY-MM-DD.json
 *
 *   bun refinery/tools/vault-export.mts --latest
 *     # also writes .private/vault-backup-latest.json (overwrites)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getSupabase } from "../sources/supabase.mts";
import { requireEnv } from "../config/env.mts";

const SCHEMA = "personal_vault";
const TABLE = "vault_fragments";
const OUTPUT_DIR = path.join(process.cwd(), ".private");

async function main(): Promise<void> {
  const latest = process.argv.slice(2).includes("--latest");

  requireEnv(["supabaseUrl", "supabaseKey"]);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(
      `[vault-export] query failed: ${error.message}\n` +
        `If error is "schema must be one of …", add "${SCHEMA}" to Project Settings → API → Exposed schemas.`,
    );
    process.exit(1);
  }

  const rows = data ?? [];
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const datedPath = path.join(OUTPUT_DIR, `vault-backup-${today}.json`);
  const payload = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      schema: SCHEMA,
      table: TABLE,
      row_count: rows.length,
      rows,
    },
    null,
    2,
  );

  writeFileSync(datedPath, payload, "utf-8");
  console.log(
    `[vault-export] wrote ${rows.length} row${rows.length === 1 ? "" : "s"} → ${datedPath}`,
  );

  if (latest) {
    const latestPath = path.join(OUTPUT_DIR, `vault-backup-latest.json`);
    writeFileSync(latestPath, payload, "utf-8");
    console.log(`[vault-export] also wrote → ${latestPath}`);
  }
}

main().catch((err) => {
  console.error(
    `[vault-export] FAILED: ${err instanceof Error ? err.message : err}`,
  );
  process.exit(1);
});
