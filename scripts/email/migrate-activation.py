"""
Apply the activation-delta-sequence migration (Phase A).

Adds consent + scope columns to email_subscribers and creates the
prospect_activation table. Idempotent — safe to re-run.

Run once: python scripts/email/migrate-activation.py
Reads DB credentials from .dlt/secrets.toml (gitignored).
"""

import pathlib
import tomllib

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


SQL = pathlib.Path("docs/sql/20260613_activation_sequence.sql").read_text()


def main() -> None:
    with psycopg.connect(_db_url()) as conn:
        conn.execute(SQL)
        # Tell PostgREST to reload its schema cache so the new table/columns are visible.
        conn.execute("NOTIFY pgrst, 'reload schema';")
        conn.commit()

        cols = conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name='email_subscribers' "
            "AND column_name IN ('consent_text','consent_at','scope') ORDER BY column_name;"
        ).fetchall()
        print(f"email_subscribers new columns: {[c[0] for c in cols]}")

        row = conn.execute(
            "SELECT to_regclass('public.prospect_activation');"
        ).fetchone()
        print(f"prospect_activation: {'OK' if row and row[0] else 'MISSING'}")

        count = conn.execute("SELECT count(*) FROM public.prospect_activation;").fetchone()
        print(f"prospect_activation rows: {count[0]}")

    print("Migration complete.")


if __name__ == "__main__":
    main()
