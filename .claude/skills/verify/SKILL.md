---
name: verify
description: Drive a brain-platform change on a real production build — build, serve on a clean port, fingerprint, screenshot.
---

# Verifying UI changes (brain-platform)

1. `bunx next build` — the repo's own gate (types + lint ride along).
2. Serve: `bunx next start -p <port>`. **Check who owns the port first** — orphaned
   `next start` processes from old sessions linger for days and will happily serve YOUR
   freshly built `.next` from disk, masking whether your server ever started
   (07/11/2026: two orphans found on 3111/3177, one 8 days old).
   PowerShell: `Get-NetTCPConnection -LocalPort <port> -State Listen` → `Stop-Process` stale owners.
3. Fingerprint before trusting a 200: `curl -s localhost:<port>/ | grep "<string unique to the new code>"`.
4. Drive with the chrome-devtools MCP: `new_page` → `resize_page` (1440x900 desktop,
   390x844 phone) → `take_screenshot` (`fullPage: true` for section audits). `.env` /
   `.env.local` exist locally, so lake loaders serve LIVE figures on localhost.
5. Kill your server when done — don't add to the orphan pile.
