# B6 — Cleanup, keep/kill, relocate · **Sonnet** · WAVE 3 · after operator decisions

**Goal:** resolve the ambiguous surfaces so nothing is left "live but stranded," and lock the by-design orphans
into B0's allowlist. **Re-crawl every candidate before deleting anything** (`runs/crawl-keepkill.py`) — don't
delete blind. Most calls here are the operator's; this file executes them.

## Keep/kill (grounded by crawl4ai 2026-06-20 — recommendation, operator confirms)
| Route | What it actually renders | Recommendation |
|---|---|---|
| `/ask` (md 941) | Clean "Ask anything" box + SWFL example queries | **KEEP + promote** into nav (strong top-of-funnel; complements the in-page pill) |
| `/showcase` (md 1955) | "What we can build for you" — live-data template gallery | **KEEP + promote prominently** (research-backed lead surface; primary nav + a home door) |
| `/demo` (md 2642) | Self-contained "Real data makes AI real" proof (live CRE conclusion + charts) | **KEEP + forward CTA (B3)**, or fold into `/showcase` — operator's call |
| `/data-intel` (md 21,511) | **Internal** data-coverage doc ("read before building a source", LIVE/COLD badges, cites `docs/data-coverage.md`) | **NOT customer-facing** → `noindex` + keep out of customer nav, or move under `/ops` |
| `/ops/data-inventory` | Operator data-inventory page | **Relocate to `swfldatagulf-ops`** (per the ops-repo rule) or gate in place — never customer nav |

## Build
1. Execute the confirmed keep/kill: promote kept pages into B1/B2 `NAV_GROUPS` + `SiteFooter`; for internal ones add `robots: noindex` (or move to `/ops`/the ops repo) and ensure they're NOT in customer nav.
2. **Document the by-design orphans** (README list) directly in B0's `ALLOWLIST` with a one-line reason each, so the orphan guard treats them as intentional, not failures.
3. Any genuine dead surface confirmed for deletion: remove the route **and** its inbound references in the same commit; re-run `node scripts/check-orphans.mjs` to prove no new orphan/dead-link.

## Acceptance
- `node scripts/check-orphans.mjs --all` → every remaining ORPHAN is in `ALLOWLIST`; zero unexplained orphans.
- `runs/crawl-site-flow.py` → kept pages reachable from chrome; internal/ops pages absent from customer nav.
- `real-tsc` 0 · eslint · `next build` ✓ · `bun test`.

## Gates
Standard done-bar. **Re-crawl before any deletion.** `SESSION_LOG.md` · explicit-path staging · no autonomous push.
