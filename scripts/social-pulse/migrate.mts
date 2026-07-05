// scripts/social-pulse/migrate.mts
// Idempotent migration for SWFL Social Pulse (spec 2026-07-05-social-pulse-swfl-design.md).
// Run: bun scripts/social-pulse/migrate.mts
import { readFileSync } from "fs";

// Cred resolution mirrors scripts/gen-supabase-types.ts (bare TOML keys; psql not installed).
const secrets = readFileSync(".dlt/secrets.toml", "utf8");
const t = (k: string) => secrets.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, "m"))![1];
const port = (secrets.match(/^port\s*=\s*(\d+)/m) || [])[1] || "5432";
const connStr = `postgres://${t("username")}:${encodeURIComponent(t("password"))}@${t("host")}:${port}/${t("database")}?sslmode=require`;

const db = new Bun.SQL(connStr);

await db.unsafe(`
  CREATE TABLE IF NOT EXISTS public.social_pulse_scans (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ran_at         timestamptz NOT NULL DEFAULT now(),
    terms_scanned  int         NOT NULL DEFAULT 0,
    requests_spent int         NOT NULL DEFAULT 0,
    status         text        NOT NULL DEFAULT 'ok'
      CHECK (status IN ('ok','partial','dry'))
  );
`);

await db.unsafe(`
  CREATE TABLE IF NOT EXISTS public.social_pulse_posts (
    post_id       text        NOT NULL,
    scan_id       bigint      NOT NULL REFERENCES public.social_pulse_scans(id) ON DELETE CASCADE,
    shortcode     text        NOT NULL,
    permalink     text        NOT NULL,
    username      text        NOT NULL,
    is_verified   boolean     NOT NULL DEFAULT false,
    taken_at      timestamptz,
    media_type    int,
    product_type  text,
    caption       text,
    like_count    bigint,
    comment_count bigint,
    view_count    bigint,
    reshare_count bigint,
    matched_term  text        NOT NULL,
    area          text        NOT NULL,
    PRIMARY KEY (post_id, scan_id)
  );
`);
await db.unsafe(
  `CREATE INDEX IF NOT EXISTS social_pulse_posts_scan_idx ON public.social_pulse_posts (scan_id, area);`,
);

await db.unsafe(`
  CREATE TABLE IF NOT EXISTS public.social_pulse_hashtags (
    name                  text   NOT NULL,
    scan_id               bigint NOT NULL REFERENCES public.social_pulse_scans(id) ON DELETE CASCADE,
    media_count           bigint,
    formatted_media_count text,
    PRIMARY KEY (name, scan_id)
  );
`);

await db.unsafe(`
  CREATE TABLE IF NOT EXISTS public.social_pulse_digest (
    week      text        PRIMARY KEY,
    digest    jsonb       NOT NULL,
    narrative text,
    scan_id   bigint      REFERENCES public.social_pulse_scans(id),
    built_at  timestamptz NOT NULL DEFAULT now()
  );
`);

// RLS: service-role only (server components + cron write/read via service role).
for (const t of [
  "social_pulse_scans",
  "social_pulse_posts",
  "social_pulse_hashtags",
  "social_pulse_digest",
]) {
  await db.unsafe(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
}

const rows = await db.unsafe(
  `SELECT count(*)::int AS count FROM information_schema.tables
   WHERE table_schema='public' AND table_name LIKE 'social_pulse_%';`,
);
const count = rows?.[0]?.count ?? 0;
console.log(`social_pulse tables present: ${count} (expected 4)`);
process.exit(count === 4 ? 0 : 1);
