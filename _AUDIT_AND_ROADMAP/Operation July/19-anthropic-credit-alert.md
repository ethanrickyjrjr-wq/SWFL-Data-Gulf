# 19 — Anthropic credit-balance alert (P4)

- **Status:** ⬜ Not started
- **Owner:** SESSION
- **Source:** autopsy §9.4 + §5-B (a run failed because credits ran out)

## What

A credit-exhaustion 400 silently HOLDs *every* AI brain platform-wide. During a scheduled-send window
that stalls the "fresh AI commentary" promise with **no warning.** Add a credit-balance alert.

## Steps

1. Probe how AI calls fail today (the 400 shape) and where the master rebuild logs it.
2. Add a balance check / alarm — either poll the Anthropic balance, or detect the credit-400 pattern
   and fire a loud alert (issue / ops signal) instead of a silent HOLD.
3. Wire into the ops signals surface (ops pages live in the `swfldatagulf-ops` repo — the ALERT
   destination may belong there; the detection belongs here).

## Done when (live proof)

- A simulated credit-400 (or a low-balance threshold) fires a visible alert, not a silent brain HOLD.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
