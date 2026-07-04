# 15 — DECISION: the fate of daily-email-digest.yml (A5)

- **Status:** ⬜ Not started — **needs an operator decision, not code**
- **Owner:** OPERATOR
- **Source:** autopsy §5 (A5) + §9.2

## The problem

`daily-email-digest.yml` is the **ONLY live email cron.** It:
- sends to **one hardcoded internal address**,
- bypasses the whole EmailLab,
- logs `master.token:"unknown"` (the freshness contract is silently broken),
- is pre-decree (the ZIP digest that predates "any-grain, not ZIP").

"Green but does nothing" — it sends to itself.

## The decision

This is the one live cron while the FIVE correctly-scoped send engines (weekly-read, activation,
outreach, funnel-demo, multi-tenant scheduler) sit paused. §9.2 recommends: **pick the multi-tenant
scheduler as the spine** (`01-turn-on-send.md`), route everything through it, then **delete or fold**
this pre-decree digest. But that's a call to make, not assume.

Options:
- **A. Retire it** once `01-turn-on-send.md` lands (the multi-tenant scheduler becomes the live path).
- **B. Fix it in place** (real recipient, freshness token at generation layer) as an interim.
- **C. Leave it** (not recommended — it's a "green but does nothing" landmine + broken freshness log).

## Steps

1. Operator picks A / B / C.
2. If A: sequence the retirement after `01-turn-on-send.md` proves a real send; then remove the cron.
3. Feeds `17-collapse-5-send-engines.md`.

## Done when

- A decision is recorded (here + SESSION_LOG), and the chosen action's live proof is met (cron
  removed, or fixed with a real recipient + generation-layer freshness token).

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
