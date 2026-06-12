"""
4A migration: user_brand_profiles table + email_subscribers.prospect_brand column.
Run once: python scripts/migrate-brand-persistence.py

Reads DB credentials from .dlt/secrets.toml (gitignored).
"""
import tomllib
import pathlib
import psycopg


def _db_url() -> str:
    secrets = pathlib.Path(".dlt/secrets.toml")
    with open(secrets, "rb") as f:
        cfg = tomllib.load(f)
    creds = cfg["destination"]["postgres"]["credentials"]
    return (
        f"postgresql://{creds['username']}:{creds['password']}"
        f"@{creds['host']}:{creds['port']}/{creds['database']}"
    )


DB_URL = _db_url()

SQL = """
-- user_brand_profiles: one row per user, account-level brand default
CREATE TABLE IF NOT EXISTS public.user_brand_profiles (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_color           text,
  accent_color            text,
  logo_url                text,
  company_name            text,
  website_url             text,
  sender_name             text,
  sender_address          text,
  sender_domain_verified  boolean NOT NULL DEFAULT false,
  source                  text NOT NULL DEFAULT 'manual',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_brand_profiles_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.user_brand_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_brand_profiles' AND policyname = 'own brand'
  ) THEN
    CREATE POLICY "own brand" ON public.user_brand_profiles
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.user_brand_profiles TO authenticated;

-- prospect_brand on email_subscribers: carries brand from outbound prospecting email
-- shape: { primary_color, accent_color, logo_url }
ALTER TABLE public.email_subscribers
  ADD COLUMN IF NOT EXISTS prospect_brand jsonb;
"""


def main() -> None:
    with psycopg.connect(DB_URL) as conn:
        conn.execute(SQL)
        conn.commit()

        row = conn.execute("SELECT COUNT(*) FROM public.user_brand_profiles;").fetchone()
        print(f"user_brand_profiles rows: {row[0]}")

        row = conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name='email_subscribers' "
            "AND column_name='prospect_brand';"
        ).fetchone()
        print(f"email_subscribers.prospect_brand: {'OK' if row else 'MISSING'}")

    print("Migration complete.")


if __name__ == "__main__":
    main()
