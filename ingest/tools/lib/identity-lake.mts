/**
 * Bun.SQL LakeReader. Resolution order matches refinery/packs/_db-parity-harness.mts:
 * DESTINATION__POSTGRES__CREDENTIALS (CI), then .dlt/secrets.toml (local).
 *
 * relkind, NOT information_schema: the lake MCP proxy reports the VIEW
 * listing_active_stats as a BASE TABLE. Only pg_class.relkind is truthful.
 *   relkind 'r' = ordinary table · 'p' = partitioned · 'v' = view · 'm' = matview
 */
import { existsSync, readFileSync } from "node:fs";
import type { DltLoad, LakeReader, LakeTable } from "./identity-live.mts";

function dsn(): string | null {
  const env = process.env.DESTINATION__POSTGRES__CREDENTIALS;
  if (env && /^postgres(ql)?:\/\//.test(env)) return env;
  if (!existsSync(".dlt/secrets.toml")) return null;
  const toml = readFileSync(".dlt/secrets.toml", "utf8");
  const block = toml.split("[destination.postgres.credentials]")[1];
  if (!block) return null;
  const g = (k: string) => block.match(new RegExp(`${k}\\s*=\\s*"([^"]+)"`))?.[1];
  const [pw, host] = [g("password"), g("host")];
  if (!pw || !host) return null;
  const port = block.match(/port\s*=\s*(\d+)/)?.[1] ?? "5432";
  return `postgresql://${g("username") ?? "postgres"}:${encodeURIComponent(pw)}@${host}:${port}/${g("database") ?? "postgres"}?sslmode=require`;
}

export async function bunSqlLake(): Promise<LakeReader | null> {
  const uri = dsn();
  if (!uri) return null;
  const sql = new Bun.SQL(uri);

  const load = async (schema: string, name: string): Promise<LakeTable | null> => {
    const rows = (await sql.unsafe(
      `SELECT c.relkind::text AS kind,
              COALESCE(array_agg(a.attname::text ORDER BY a.attnum)
                       FILTER (WHERE a.attnum > 0 AND NOT a.attisdropped), '{}') AS columns
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r','p','v','m')
        GROUP BY c.relkind`,
      [schema, name],
    )) as Array<{ kind: string; columns: string[] }>;
    if (rows.length === 0) return null;
    const kind = rows[0].kind === "v" || rows[0].kind === "m" ? "view" : "table";
    const n = (await sql.unsafe(`SELECT count(*)::bigint AS n FROM "${schema}"."${name}"`)) as Array<{
      n: string;
    }>;
    return { schema, name, kind, rows: Number(n[0]?.n ?? 0), columns: rows[0].columns ?? [] };
  };

  return {
    async baseTables(schema) {
      const rows = (await sql.unsafe(
        `SELECT c.relname::text AS name
           FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relkind IN ('r','p')
          ORDER BY 1`,
        [schema],
      )) as Array<{ name: string }>;
      const out: LakeTable[] = [];
      for (const r of rows) {
        const t = await load(schema, r.name);
        if (t) out.push(t);
      }
      return out;
    },
    async table(qualified) {
      const [s, n] = qualified.split(".");
      return s && n ? load(s, n) : null;
    },
    async rowCount(qualified, sourceName) {
      const [s, n] = qualified.split(".");
      const rows = sourceName
        ? ((await sql.unsafe(
            `SELECT count(*)::bigint AS n FROM "${s}"."${n}" WHERE source_name = $1`,
            [sourceName],
          )) as Array<{ n: string }>)
        : ((await sql.unsafe(`SELECT count(*)::bigint AS n FROM "${s}"."${n}"`)) as Array<{
            n: string;
          }>);
      return Number(rows[0]?.n ?? 0);
    },
    async dltLoads(): Promise<DltLoad[]> {
      const rows = (await sql.unsafe(
        `SELECT schema_name::text,
                count(*)::bigint          AS ok_loads,
                max(inserted_at)::text    AS last_inserted_at
           FROM data_lake._dlt_loads
          WHERE status = 0
          GROUP BY schema_name`,
      )) as Array<{ schema_name: string; ok_loads: string; last_inserted_at: string | null }>;
      return rows.map((r) => ({
        schema_name: r.schema_name,
        ok_loads: Number(r.ok_loads),
        last_inserted_at: r.last_inserted_at,
      }));
    },
    close: () => sql.end(),
  };
}
