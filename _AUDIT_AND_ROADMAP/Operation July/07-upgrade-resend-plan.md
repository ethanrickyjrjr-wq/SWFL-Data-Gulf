# 07 — Upgrade the Resend plan

- **Status:** ⬜ Not started
- **Owner:** OPERATOR (billing; keyboard-only)
- **Source:** autopsy §4 (secondary) + §7

## What

Resend is on the **free tier = 1 email/day.** This does not block the FIRST live send
(`01-turn-on-send.md`), but it blocks any real scheduled/broadcast volume immediately after.

## Steps

1. Upgrade the Resend plan to a tier matching expected send volume.
2. Confirm the verified sending domain/address used in `DIGEST_SENDER_ADDRESS` is on the upgraded plan.

## Done when (live proof)

- Two real sends in one day both succeed (proves the 1/day cap is gone).

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
