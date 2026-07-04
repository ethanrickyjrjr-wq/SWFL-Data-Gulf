# 05 — Social send go-live

- **Status:** ⬜ Not started
- **Owner:** OPERATOR (OAuth creds + crypto key + cron uncomment are keyboard-only)
- **Source:** autopsy §4 (secondary) + §7

## What

Social send is **fully inert** — OAuth creds absent and the cron is paused. The publish engine
(`lib/social/`) is real but switched off.

## Steps

1. Set the **4 social OAuth credential pairs** + `SDG_CRYPTO_KEY` (GHA secrets; probe
   `lib/social/` for the exact env-var names first).
2. `node scripts/social.mjs go-live`.
3. Uncomment the social cron (diff-review, push).

## Notes / landmines

- Socials are TWO unwired systems: publish engine (`lib/social/`) vs the lab's Generate-Week
  (`lib/email/social-calendar/`). This task is the **publish engine** go-live. Don't conflate them.
- Social platforms have ONE root: `lib/email/social/platforms.ts` (8 platforms). No paid logo vendor.

## Done when (live proof)

- `scripts/social.mjs` reports live (not inert), the cron shows a green run, and one real post
  publishes to a connected account.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
