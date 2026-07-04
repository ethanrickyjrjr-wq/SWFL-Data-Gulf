# 10 — Delete dead code (zero real importers)

- **Status:** ⬜ Partially done in working tree (see below)
- **Owner:** SESSION
- **Source:** autopsy §8 (dead code)

## What

Six modules verified with zero real importers. **5 of 6 are already deleted in the current working
tree** (unstaged deletions, part of the §6 session) — this task is to confirm + finish + push them
with `03-push-session-local-fixes.md`.

| File | Tree state at 2026-07-04 |
|---|---|
| `app/project/[id]/workspace/DeliverableModal.tsx` | already `D` (delete as a pair ↓) |
| `app/project/[id]/workspace/DeliverableEditPanel.tsx` | already `D` (pair with ↑) |
| `components/highlighter/DeliverableOwnerBridge.tsx` | already `D` |
| `components/landing/MCPInstall.tsx` (`MCPInstallCard.tsx` is the live replacement) | already `D` |
| `lib/project/infer-project-type.ts` | already `D` |
| `lib/signals/permit-event-extractor.ts` | **NOT yet deleted — do it** |

## Steps

1. Re-grep each for real (non-test, non-self) importers before deleting — probe-first, RULE 0.5.
   The autopsy warns several agent claims were overstated.
2. Delete `lib/signals/permit-event-extractor.ts` if grep confirms zero importers.
3. Ship these deletions with the push in `03-push-session-local-fixes.md`. `bunx next build` must pass.

## Done when (live proof)

- `bunx next build` passes with all six removed; `origin/main` no longer contains them.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
