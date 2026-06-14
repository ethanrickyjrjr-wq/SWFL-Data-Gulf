# Session 7 — Delivery surfaces  ·  **SONNET**  ·  ~1 day (7b deferred)

> Read `../shared/conventions.md`. v1 delivery is **draft-only**: copy / `mailto:` / share-sheet. Real Resend send (7b) is designed but deferred to demand.

**Goal:** Let a user get the deliverable out — Copy email (clipboard), `mailto:`, and `navigator.share` (the primary phone path) — plus an owner kill-switch to revoke a shared `/p/` link.

**Tasks (in order):**
- [ ] `task-01-copy-mailto-share.md` — delivery buttons on `/p/[id]` + the `client-email` template; meter `deliver_email`
- [ ] `task-02-revoke-unpublish.md` — `[ADDED]` `status='revoked'` → `/p/[id]` returns 410

**Deferred (documented, NOT built): 7b real send.** `POST /api/deliverables/[id]/send {to, message?}` — logged-in; `from: deliver@swfldatagulf.com`, `reply_to: agent's email`; lazy Resend (the waitlist route is the precedent — `app/api/waitlist/route.ts`, verified lazy-init from `hello@swfldatagulf.com`); meter `deliver_email`. **Vendor-First when it un-defers:** WebFetch Resend `reply_to`/verified-domain rules. Leave a stub comment, no route.

**Files:** `app/p/[id]/page.tsx` · new `app/api/deliverables/[id]/revoke/route.ts`

**Depends on:** S6 (`/p/[id]` + deliverables).

**Risk:** mobile `mailto:` body-length limits → **clipboard-first** (copy the full body, `mailto:` carries subject + a short lead + link).

**Diff-review gate:** none. Standard ship.
