# Task 01 — Copy email / mailto / share on `/p/[id]`

**Files:** Modify `app/p/[id]/page.tsx` (action strip — already `.print-hide`).

- [ ] **Step 1: Copy email** — for the `client-email` template, assemble `subject + body + link`; "Copy email" writes it to clipboard (`navigator.clipboard.writeText`). This is the reliable path (no length limit).
- [ ] **Step 2: `mailto:`** — `mailto:?subject=<enc>&body=<enc(short lead + /p/ link)>`. Keep the body short (mobile clients truncate long `mailto:` bodies) — the full prose is the Copy path; `mailto:` is subject + lead + link.
- [ ] **Step 3: `navigator.share`** — the primary phone path: `navigator.share({ title, text, url })` with a clipboard fallback when unsupported. Feature-detect; don't crash on desktop.
- [ ] **Step 4: Meter** each click as `deliver_email` (`/api/meter`).
- [ ] **Step 5: Verify** on a phone: Share opens the OS sheet; Copy puts the full email on the clipboard; `mailto:` opens the mail app with subject + link.
- [ ] **Step 6: Commit.** `git add "app/p/[id]/page.tsx" && git commit -m "feat(deliver): copy/mailto/share on /p/[id], metered deliver_email"`
