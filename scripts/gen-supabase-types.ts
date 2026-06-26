// scripts/gen-supabase-types.ts
// Regenerates database-generated.types.ts from the LIVE prod DB via information_schema.
// The official `supabase gen types --db-url` needs Docker (unavailable here). Same output shape.
// jsonb -> Json, arrays -> T[], nullable -> | null. Run: bun run gen:types
import { readFileSync, writeFileSync } from "fs";
const secrets = readFileSync(".dlt/secrets.toml", "utf8");
const t = (k: string) => secrets.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, "m"))![1];
const port = (secrets.match(/^port\s*=\s*(\d+)/m) || [])[1] || "5432";
const conn = `postgres://${t("username")}:${encodeURIComponent(t("password"))}@${t("host")}:${port}/${t("database")}?sslmode=require`;
const sql = new Bun.SQL(conn);
const rows = (await sql.unsafe(`
  SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='public'
  ORDER BY table_name, ordinal_position
`)) as Array<{
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}>;
await sql.end();
function tsType(dt: string, udt: string): string {
  if (dt === "ARRAY") return tsBase(udt.replace(/^_/, "")) + "[]";
  return tsBase(udt || dt);
}
function tsBase(u: string): string {
  if (/^(text|varchar|bpchar|char|uuid|name|citext)$/.test(u)) return "string";
  if (/^(timestamptz|timestamp|date|time|timetz|interval)$/.test(u)) return "string";
  if (/^(int2|int4|int8|numeric|float4|float8|money)$/.test(u)) return "number";
  if (/^bool$/.test(u)) return "boolean";
  if (/^(jsonb|json)$/.test(u)) return "Json";
  return "string";
}
const byTable: Record<string, typeof rows> = {};
for (const r of rows) (byTable[r.table_name] ??= []).push(r);
let out = `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]\n\nexport interface Database {\n  public: {\n    Tables: {\n`;
for (const [table, cols] of Object.entries(byTable)) {
  out += `      ${table}: {\n        Row: {\n`;
  for (const c of cols) {
    const nul = c.is_nullable === "YES" ? " | null" : "";
    out += `          ${c.column_name}: ${tsType(c.data_type, c.udt_name)}${nul}\n`;
  }
  out += `        }\n        Insert: {\n`;
  for (const c of cols) {
    const optional = c.is_nullable === "YES" || c.column_default !== null;
    const nul = c.is_nullable === "YES" ? " | null" : "";
    out += `          ${c.column_name}${optional ? "?" : ""}: ${tsType(c.data_type, c.udt_name)}${nul}\n`;
  }
  out += `        }\n        Update: {\n`;
  for (const c of cols) {
    const nul = c.is_nullable === "YES" ? " | null" : "";
    out += `          ${c.column_name}?: ${tsType(c.data_type, c.udt_name)}${nul}\n`;
  }
  out += `        }\n        Relationships: []\n      }\n`;
}
out += `    }\n    Views: Record<string, never>\n    Functions: Record<string, never>\n    Enums: Record<string, never>\n    CompositeTypes: Record<string, never>\n  }\n}\n`;
writeFileSync("database-generated.types.ts", out);
console.log(
  `wrote database-generated.types.ts: ${Object.keys(byTable).length} tables, ${rows.length} columns`,
);
