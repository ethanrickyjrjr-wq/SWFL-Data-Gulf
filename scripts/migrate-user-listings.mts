// scripts/migrate-user-listings.mts
// Idempotent: user_listings (typed lane, spec 2026-08-03) + user_api_tokens.
// Run: bun scripts/migrate-user-listings.mts
import { readFileSync } from "fs";

const secrets = readFileSync(".dlt/secrets.toml", "utf8");
const tomlStr = (key: string): string => {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`missing ${key} in .dlt/secrets.toml`);
  return m[1];
};
const port = secrets.match(/^port\s*=\s*(\d+)/m)?.[1] ?? "5432";
const sql = new Bun.SQL(
  `postgres://${tomlStr("username")}:${encodeURIComponent(tomlStr("password"))}@${tomlStr("host")}:${port}/${tomlStr("database")}?sslmode=require`,
);

await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS public.user_listings (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address     text NOT NULL,
    address_key text NOT NULL,
    price       numeric,
    beds        integer,
    baths       numeric,
    sqft        integer,
    status      text,
    url         text,
    attribs     jsonb NOT NULL DEFAULT '{}'::jsonb,
    zip_code    text,
    county      text,
    parcel_id   text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, address_key)
  );
  ALTER TABLE public.user_listings ENABLE ROW LEVEL SECURITY;
`);

await sql.unsafe(`
  DO $$ BEGIN
    CREATE POLICY user_listings_own ON public.user_listings
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`);

await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS public.user_api_tokens (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash   text NOT NULL UNIQUE,
    label        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
  );
  ALTER TABLE public.user_api_tokens ENABLE ROW LEVEL SECURITY;
`);

await sql.unsafe(`
  DO $$ BEGIN
    CREATE POLICY user_api_tokens_own ON public.user_api_tokens
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`);

const t = await sql.unsafe(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('user_listings','user_api_tokens') ORDER BY 1`);
console.log("tables now present:", JSON.stringify(t));
process.exit(0);
