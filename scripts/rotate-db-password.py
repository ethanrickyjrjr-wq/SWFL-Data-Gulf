"""
Rotates the Supabase postgres password and updates .dlt/secrets.toml.
Run: python scripts/rotate-db-password.py
"""
import secrets
import string
import tomllib
import pathlib
import re
import psycopg


def load_current_creds():
    with open(".dlt/secrets.toml", "rb") as f:
        cfg = tomllib.load(f)
    c = cfg["destination"]["postgres"]["credentials"]
    return c["password"], c["host"], c["username"], c["port"], c["database"]


def new_password():
    chars = string.ascii_letters + string.digits
    return "".join(secrets.choice(chars) for _ in range(24))


def rotate(old_pw, host, user, port, db, new_pw):
    url = f"postgresql://{user}:{old_pw}@{host}:{port}/{db}"
    with psycopg.connect(url) as conn:
        conn.execute(f"ALTER ROLE {user} WITH PASSWORD '{new_pw}'")
        conn.commit()


def update_secrets_toml(new_pw):
    path = pathlib.Path(".dlt/secrets.toml")
    text = path.read_text()
    text = re.sub(r'(password\s*=\s*")[^"]*(")', rf'\g<1>{new_pw}\g<2>', text)
    path.write_text(text)


if __name__ == "__main__":
    old_pw, host, user, port, db = load_current_creds()
    new_pw = new_password()
    rotate(old_pw, host, user, port, db, new_pw)
    update_secrets_toml(new_pw)
    print("Done. .dlt/secrets.toml updated. Update Vercel + GitHub secrets manually.")
    print(f"New password written to .dlt/secrets.toml")
