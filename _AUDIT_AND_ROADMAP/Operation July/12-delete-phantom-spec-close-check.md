# 12 — Delete the 9-line phantom spec + close its check (A3)

- **Status:** ⬜ Not started
- **Owner:** SESSION
- **Source:** autopsy §5 (A3) + §8
- **Check key:** `email_lab_block_editing_live_verify`

## What

A check was opened against a **9-line empty spec** — a phantom obligation that can never close on its
own terms. The metric-card/block editing it points at is actually handled (§6 added the metric-card
editor). Delete the spec and close the check.

## Steps

1. `git rm docs/superpowers/specs/2026-06-28-email-lab-block-editing-design.md`.
2. Confirm block editing works live in the lab (BlockInspector renders editors for all block types
   including metric-card, per §6) — that IS the live proof for the check.
3. `node scripts/check.mjs close email_lab_block_editing_live_verify`.
4. SESSION_LOG entry + push.

## Done when (live proof)

- Spec file gone from `origin/main`; `email_lab_block_editing_live_verify` closed in the ledger with
  the live lab observation behind it.

---
When done: flip Status to ✅, close the check, and `git mv` this file to `../Operation-July-DONE/`.
