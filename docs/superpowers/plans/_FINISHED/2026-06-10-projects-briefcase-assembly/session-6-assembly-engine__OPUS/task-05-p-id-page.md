# Task 05 — `app/p/[id]/page.tsx` (hosted deliverable + `[ADDED]` stale badge)

**Files:** Create `app/p/[id]/page.tsx`.

**Contract:** server component; loads `deliverables` by slug (public SELECT); 404 if missing; 410 if `status='revoked'` (S7). Renders from the **frozen `items_snapshot`**, never the live project.

- [ ] **Step 1: Layout** — branding header (agent name/photo/license/brokerage from `branding`) → exec summary → sections (action title + intro + its exhibits) → **source line + as-of date under EVERY exhibit** (this is the differentiator CoStar lacks) → `[INFERENCE]` notes block in `#d4b370` → citation footer (source credit, no freshness badges) → action strip (Print / Copy email / Share — all `.print-hide`).

- [ ] **Step 2: As-of date (operator 2026-06-10).** The as-of date is the **only** honesty mechanism required. For live-brain items (`qa`, `metric`, `report`, `table_slice`) it's parsed from their `freshness_token`; for chart items it comes from the `chart_block` data's own date field. Render the date plainly as part of each exhibit's citation line — a simple "As of [Month YYYY]" is sufficient. **Do NOT build** a cadence-aware "may have updated" badge, per-item age indicator, staleness warning, or token string display. **Live-refresh-before-print is a HIGHER-TIER future feature, NOT built here**. Never silently re-fetch in v1.

- [ ] **Step 3: Provenance survives in print.** Confirm the citation elements use `.citation`/`.source-line` classes that the S5 print CSS keeps visible — source credit and as-of date must appear in the printed PDF. No `.freshness-token` token string is printed.

- [ ] **Step 4: `[LB-R5]` Rate-limit `/p/*`.** Add `/p/` to the middleware rate-limit prefixes (`middleware.ts` `RATE_LIMITED_PREFIXES` — currently `/api/b/`, `/api/mcp`, `/api/waitlist`) so the public, branding-bearing deliverable pages get the same per-IP burst guard against scraping/enumeration. Confirm the limiter fires on `/p/<slug>`.

- [ ] **Step 5: Verify** `/p/[id]` renders logged-out; provenance + as-of date under every exhibit; print is clean; a burst of `/p/` requests gets rate-limited; `status='revoked'` → 410 (S7).

- [ ] **Step 6: Commit.** `git add "app/p/[id]/page.tsx" middleware.ts && git commit -m "feat(deliverable): /p/[id] hosted page — provenance + as-of date; rate-limit /p/*"`
