# 04 — Set MCP_BEARER_TOKEN (paywall keystone)

- **Status:** ⬜ Not started
- **Owner:** OPERATOR (secret; keyboard-only)
- **Source:** autopsy §7 (other prod-only actions)

## What

The MCP server (`/api/mcp`) is **unauthenticated without `MCP_BEARER_TOKEN`.** This is the paywall
keystone — until it's set, the MCP surface is open.

## Steps

1. Generate a strong token.
2. `gh secret set MCP_BEARER_TOKEN -R ethanrickyjrjr-wq/SWFL-Data-Gulf` **and** set it in Vercel env
   (values must match wherever the server reads it).
3. Confirm the MCP route reads it (probe `app/api/mcp` for the env var name before setting — don't
   assume the key name).

## Done when (live proof)

- A request to `/api/mcp` **without** the bearer token is rejected (401/403); **with** it, succeeds.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
