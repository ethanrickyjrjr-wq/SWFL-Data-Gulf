// One-time repair for docs/sql/20260920_dbpr_staging_repair.sql. Idempotent.
// Creates data_lake_staging.fl_dbpr_applicants ONLY if it is missing AND the staging
// dataset already stores the current schema hash (the state in which dlt never creates it).
const toml = await Bun.file("C:/Users/ethan/dev/brain-platform/.dlt/secrets.toml").text();
const sec = toml.split(/^\[/m).find((s) => s.startsWith("destination.postgres.credentials"))!;
const get = (k: string) =>
  sec.match(new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\n\\r]+)"?`, "m"))?.[1]?.trim();
const sql = new Bun.SQL(
  `postgres://${get("username")}:${encodeURIComponent(get("password")!)}@${get("host")}:${get("port") ?? 5432}/${get("database")}?sslmode=require`,
);
const before = await sql`select to_regclass('data_lake_staging.fl_dbpr_applicants') as t`;
const lakeHash =
  await sql`select version_hash from data_lake._dlt_version where schema_name='fl_dbpr_licenses' order by inserted_at desc limit 1`;
const stagingHas =
  await sql`select count(*)::int n from data_lake_staging._dlt_version where schema_name='fl_dbpr_licenses' and version_hash=${lakeHash[0].version_hash}`;
console.log(
  "BEFORE staging table:",
  before[0].t,
  "| staging holds current lake hash:",
  stagingHas[0].n,
);
if (before[0].t === null && stagingHas[0].n > 0) {
  await sql`CREATE TABLE IF NOT EXISTS data_lake_staging.fl_dbpr_applicants (LIKE data_lake.fl_dbpr_applicants INCLUDING ALL)`;
  console.log("CREATED");
} else console.log("PRECONDITION NOT MET - nothing created");
const after = await sql`select to_regclass('data_lake_staging.fl_dbpr_applicants') as t`;
const cols =
  await sql`select (select count(*)::int from information_schema.columns where table_schema='data_lake' and table_name='fl_dbpr_applicants') lake, (select count(*)::int from information_schema.columns where table_schema='data_lake_staging' and table_name='fl_dbpr_applicants') staging`;
const rows =
  await sql`select count(*)::int n, count(distinct _dlt_load_id)::int loads, max(_dlt_load_id) last_load from data_lake.fl_dbpr_applicants`;
console.log(
  "AFTER staging table:",
  after[0].t,
  "| columns lake/staging:",
  cols[0].lake,
  cols[0].staging,
  "| lake rows:",
  JSON.stringify(rows[0]),
);
await sql.end();
