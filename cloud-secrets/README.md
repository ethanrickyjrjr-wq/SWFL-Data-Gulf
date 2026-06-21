# cloud-secrets — encrypted key vault for phone / cloud Claude sessions

`vault.enc` is an **AES-256-encrypted** tarball of this repo's local secret files.
Only the ciphertext is committed — useless without the passphrase, which is **never**
stored in git. It exists so a Claude Code **cloud session** (claude.ai/code, e.g. from a
phone) can materialize the real keys on boot without pasting them every time.

## Inside the vault
`.env`, `.env.local`, `ingest/.env`, `ingest/.env.local`, `.dlt/secrets.toml`, `.dlt/config.toml`

**Skipped:** `BLS_API_KEY`, `FBI_CDE_API_KEY` — these live only in the GitHub Actions vault
(write-only, unretrievable) and aren't needed for phone dev. To add later: put the values in
`.env.local`, then rebuild (below).

## Cloud-session setup (one time, on the phone/web)
In the Claude Code cloud environment for this repo:
1. **Env var:** `SECRETS_PASSPHRASE` = your passphrase (out-of-band; never in git)
2. **Setup command:** `bash cloud-secrets/setup.sh`
3. **Network access:** `Full` (Trusted may not reach the Supabase Postgres host on :5432)

On boot, `setup.sh` decrypts `vault.enc` into place. Then just talk to Claude.

## Rebuild / rotate the vault (local terminal)
```
export PP=<your passphrase>
tar czf - .env .env.local ingest/.env ingest/.env.local .dlt/secrets.toml .dlt/config.toml \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:PP -out cloud-secrets/vault.enc
```
Commit the new `vault.enc`. To rotate a *key*, edit the local file then rebuild. To rotate the
*passphrase*, rebuild with a new `PP` and update `SECRETS_PASSPHRASE` in the cloud env.
