# 08 — Publish the Vercel Firewall rate-limit rule

- **Status:** ⬜ Not started
- **Owner:** OPERATOR (Vercel dashboard; keyboard-only)
- **Source:** autopsy §7 (other prod-only actions)

## What

Publish a Vercel Firewall rate-limit rule on `/api/b/*` and `/api/mcp` — the public brain + MCP
surfaces have no rate limit today.

## Steps

1. In the Vercel Firewall (WAF) for the SWFL Data Gulf project, add a rate-limit rule scoped to
   `/api/b/*` and `/api/mcp`.
2. Publish it (staging a rule ≠ publishing — the autopsy's "built ≠ works" applies to firewall rules too).

## Done when (live proof)

- A burst of requests to `/api/b/*` past the threshold returns 429 in prod.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
