# Block-canvas public /p view + house-brand defaults + loud scheduler send failures

**Date:** 2026-07-05 · **Check:** `send_surface_hardening_live_verify` · **Status:** BUILT (local, push pending operator)

## Problem

Operator-ordered after the 16447 Rainbow Meadows Ct live send exposed three defects
("fix it all", 07/05/2026). Evidence probed live this session:

- 07/04/2026 both live `email_schedules` rows were claimed against a 503 broadcast
  route, advanced a week, sent nothing; the run exited 0 (green). `email_sends`
  and `email_blasts` were both zero — no real send had ever landed.
- A recipient clicking "View Full Report" / "View this report online" on a
  block-canvas email hit `app/p/[id]/page.tsx:488`'s unconditional redirect into
  the owner-only lab editor — a login wall for every non-owner.
- An empty brand profile shipped seed placeholders verbatim in a REAL email:
  "Your Company", "Your Name", and the fake CAN-SPAM address "123 Main St".

## Goal

Recipients always see the email at its public link; placeholders never ship (house
brand until the user's brand overrides); a bad deploy delays a send loudly, never
eats it silently.

## What we're building

### Fix 1 — public read view for block-canvas `/p/[id]`

The redirect is gone. Everyone gets a read-only render of the saved doc through
`renderEmailDocHtml` (the ONE EmailDoc→HTML root — the same bytes the blast sent)
inside the established `EmailPreviewFrame` iframe (a full `<html>` doc must not be
injected into a div). Invalid doc → `GlobalDigestFallback`, mirroring the legacy
email branch. Owners additionally get "Edit in Email Lab" (`?did=` deep link),
"← Back to project", and the send-to-contacts handle — the same owner-strip
pattern the email branch uses. `deliverables` already has public SELECT; the doc
was emailed out, so rendering it publicly leaks nothing new.

Verified: anonymous fetch of a real block-canvas deliverable returns 200 with the
email content in the iframe on the dev server.

### Fix 2 — SWFL Data Gulf house-brand defaults

`HOUSE_BRAND` constant in `lib/email/doc/default-docs.ts`; the brand-bearing block
defaults (header, footer, agent-card, agent-hero) now carry it: company name,
tagline, `logo-name.png` masthead logo, `hello@swfldatagulf.com`, "Fort Myers, FL",
site URL. The legacy token lane's `AGENT_NAME`/`AGENT_TITLE` defaults match. Scope
line: content blocks (hero/stats/listing demo values) stay as palette affordances —
the AI content fill always rewrites them; it deliberately never touches brand
blocks, which is exactly why placeholders used to ship. A user's saved brand still
overrides everything through `brandingToTokens` → `applyBrand` (untouched).

### Fix 3 — a bad deploy delays a send, never eats it

Two classes of broadcast failure, split by `isDefinitiveSendFailure` (numeric
HTTP status = the route responded non-2xx = nothing was sent):

- **Definitive** (the 07/04 class — 503/404/400): release the occurrence's
  idempotency claim (`releaseClaim`, new, fail-soft) and re-arm the row at
  `fromUtc + 30min` (`SEND_RETRY_DELAY_MS`) instead of the next cadence
  occurrence. The same occurrence retries every ~30min until the route heals —
  late, never dropped. Bounded implicitly: the day-keyed claim and the cadence
  keep it to ≤ ~48 attempts per occurrence-day.
- **Ambiguous** (timeout / network error — the POST may have sent): keep the
  claim, advance the cadence exactly as before. At-most-once holds; a release
  failure also degrades to this (never a double-send).

Loud gate: the runner exits 1 when any row's send failed (`hasSendFailures`), so
the GHA cron goes RED and incident capture fires — a silent no-send can never
look green again. Skips (usage/segment) and dry runs do not redden.

## Gates

`bun test lib/email lib/deliverable` 1292/0 · `bunx next build` ✓ · eslint clean ·
anonymous /p live-check 200.

## Live-verify (operator, post-deploy)

Recipient-side click of a sent block-canvas email's footer link renders the email
(no login wall); a fresh blank-canvas email shows SWFL branding; next scheduler
cycle with a forced non-2xx shows a red run + a 30-min re-arm. Close
`send_surface_hardening_live_verify`.
