# 03 — Review + push the §6 working-tree fixes

- **Status:** ⬜ Not started
- **Owner:** OPERATOR (push confirmation is not delegable — "a question is not authorization")
- **Source:** autopsy §6 (fixes applied local, NOT pushed)

## What

The autopsy session left real fixes in the working tree, unpushed. `git diff` to review, then push
with explicit confirmation. Current tree also carries some `10-delete-dead-code` deletions and the
Operation July folder — stage explicit paths only, never `git add -A`.

The §6 fixes (already in the tree as modifications):
1. **Killed the autonomous-push hook** — `.claude/hooks/session-notes.sh` (A1/B6 disease off: never
   pushes, never `--no-verify`, never touches `main`; only auto-commits on a feature branch when
   `SESSION_NOTES_AUTOCOMMIT=1`).
2. **Metric-card editor** — `components/email-lab/BlockInspector.tsx` (completes commit `4e9d6703`;
   the ZIP recipe's primary block is now hand-editable).
3. **Two sender-address guards** — `scripts/email/run-schedules.mts` +
   `app/api/email/broadcast/route.ts` (silent Resend-400 → loud error).

## Steps

1. `git diff` the four files above; confirm each is the intended §6 change and nothing else rode in.
2. Append a SESSION_LOG.md entry (RULE 0) in the same push.
3. Stage explicit paths, commit, `node scripts/safe-push.mjs`. Check `git log origin/main..HEAD`
   first — do not carry foreign / parallel-session commits.

## Done when (live proof)

- `git log origin/main..HEAD` is empty after push (the fixes are live on `origin/main`).
- Vercel redeploys clean; the metric-card editor renders in the lab; a bad `DIGEST_SENDER_ADDRESS`
  now returns a loud 503 rather than a silent 400.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
