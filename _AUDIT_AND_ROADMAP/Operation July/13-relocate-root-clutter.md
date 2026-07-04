# 13 — Relocate root clutter (git mv, not delete)

- **Status:** ⬜ Not started
- **Owner:** SESSION
- **Source:** autopsy §5 (A2, A4) + §8 (relocate list)

## What

Root-level clutter to **relocate** (git mv — history preserved), plus two live code-comment paths that
must be fixed in the SAME commit so they don't break.

| Move | From → To | Note |
|---|---|---|
| A2 dup archive | `_archive/2026-06-26-snicklefritz-and-problems-audit/` → `docs/_archive/parked/` | kills the duplicate root archive that `fcd3aa6c` re-created |
| A4 Snicklefritz | (same folder above covers the post-mortem) | ~10 hrs, no live path |
| SOCIAL BUILD | `SOCIAL BUILD/` (16 files) → `docs/superpowers/handoffs/social-build/` | **fix the 2 code-comment paths ↓ in the same commit** |
| SEND runbook | `GO-LIVE/email-scheduler-unit-f.md` → `docs/runbooks/` | **DO NOT delete — active SEND runbook.** Also fix the WRONG repo name inside (`brain-platform` → `SWFL-Data-Gulf`) |
| contacts import | `GET DONE/contacts-phone-import.md` → `docs/parked/` | |
| diagrams | `_diagrams/` (4 .mmd) → `docs/_diagrams/` | |

## Code-comment paths to fix in the SOCIAL BUILD move

- `app/api/social/schedule/route.ts:3`
- `lib/social/persist-schedule.ts:5`

## Steps

1. `git mv` each item to its destination.
2. Update the two code-comment paths to the new `SOCIAL BUILD` location in the same commit.
3. Fix the repo name inside `email-scheduler-unit-f.md`.
4. `grep` for any other references to the old paths; `bunx next build` passes; SESSION_LOG + push.

## Done when (live proof)

- `origin/main` has the files in their new homes; grep for old paths is clean; `bunx next build` passes.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
