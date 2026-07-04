# 11 — Delete dead docs / plans / specs (zero code refs)

- **Status:** ⬜ Not started
- **Owner:** SESSION
- **Source:** autopsy §8 (dead docs/plans/specs)

## What

Orphan plans/specs with zero code references. Delete (docs-only = RULE 1 just-push).

- `docs/superpowers/plans/2026-06-14-weekly-pulse-freshness-bridge.md`
- `docs/superpowers/plans/email/2026-06-12-email-template-adapter/…__BLOCKED-shells.md`
- `docs/superpowers/specs/2026-06-26-housing-daily-layer-design.md` **+** its matching handoff (pair)
- `docs/superpowers/specs/2026-06-07-the-glass-observability-and-improvement-loop-design.md` **+**
  `…-the-glass-build-decomposition.md` (pair; zero "Glass" feature code)
- `GET DONE/TURN SYSTEM ON.md` (action already completed 2026-06-20)

> The 9-line phantom spec (`2026-06-28-email-lab-block-editing-design.md`) is handled separately in
> `12-delete-phantom-spec-close-check.md` because it also has a check to close.

## Steps

1. `grep` each doc's basename across the repo to confirm zero live references before deleting.
2. `git rm` the confirmed-orphan set (stage explicit paths).
3. SESSION_LOG entry + push.

## Done when (live proof)

- Files gone from `origin/main`; no broken links introduced (grep clean).

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
