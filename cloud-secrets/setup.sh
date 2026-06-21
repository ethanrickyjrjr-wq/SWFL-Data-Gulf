#!/usr/bin/env bash
# Decrypt cloud-secrets/vault.enc into the repo so a cloud / phone Claude session
# gets the real keys on boot. The passphrase comes from $SECRETS_PASSPHRASE — set it
# ONCE in the Claude cloud environment config (or inline for a manual run:
#   SECRETS_PASSPHRASE=... bash cloud-secrets/setup.sh
# The passphrase is NEVER committed; only the encrypted vault.enc is.
set -euo pipefail

if [ -z "${SECRETS_PASSPHRASE:-}" ]; then
  echo "cloud-secrets: SECRETS_PASSPHRASE not set — no keys unlocked." >&2
  exit 0
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -pass env:SECRETS_PASSPHRASE \
  -in cloud-secrets/vault.enc | tar xzf - -C .

echo "cloud-secrets: unlocked $(ls -1 .env .env.local .dlt/secrets.toml 2>/dev/null | wc -l) secret file(s)."
