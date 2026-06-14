# Task 02 — `[ADDED]` Revoke / unpublish a shared deliverable

**Why:** `/p/[id]` is public by unguessable slug. A shared link can't currently be killed. The `status` column already exists (S6). Add an owner kill-switch.

**Files:** Create `app/api/deliverables/[id]/revoke/route.ts`. Modify `app/p/[id]/page.tsx` (410 on revoked) + `app/project/[id]/page.tsx` (a "Revoke link" control on the deliverable list).

- [ ] **Step 1: Revoke route** — cookie client; verify the requester owns the deliverable (`user_id = auth.uid()` — load via cookie client so RLS-equivalent ownership holds, or check `user_id` explicitly); set `status='revoked'`. Support un-revoke (`status='ready'`) too.
- [ ] **Step 2: `/p/[id]` honors it** — if `status='revoked'`, return HTTP 410 (Gone) with a small "this report was unpublished by its owner" page, not the content.
- [ ] **Step 3: Owner control** — on `/project/[id]`, list the project's deliverables with a Revoke/Restore toggle.
- [ ] **Step 4: Verify** — build a deliverable → `/p/[id]` works → revoke → `/p/[id]` → 410 → restore → works again. Only the owner can revoke (a second account gets 403/404).
- [ ] **Step 5: Commit, then ship the session** per `../shared/conventions.md`.

```bash
git add "app/api/deliverables/[id]/revoke/route.ts" "app/p/[id]/page.tsx" "app/project/[id]/page.tsx"
git commit -m "feat(deliver): [ADDED] owner revoke/restore -> /p/[id] 410"
```
