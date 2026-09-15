---
title: MCP connector
type: platform
status: active
updated: 2026-09-15
sources:
  - app/api/mcp/server.ts
  - app/api/mcp/route.ts
  - app/api/mcp/usage-gate.ts
  - lib/mcp/anon-usage.ts
  - app/connect/page.tsx
  - https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/pull/204
  - chief-of-staff:research/carbonarc/2026-09-15/site-crawl.md
  - chief-of-staff:wiki/florida-public-records.md
---
# MCP connector

**Status (2026-09-15):** the connector itself (`swfl_fetch`, `swfl_reconcile`) was already live and
working before this session — it was just invisible. PR #204 adds a public `/connect` page and a
15/month usage cap for keyless callers. **Not yet merged** — holding for Ricky's go-ahead, and the
cap's value only means anything once [pipeline health](pipeline-health.md)'s staleness is fixed;
a free lookup that returns a month-old number doesn't earn anyone's trust.

## What it is

A remote Streamable HTTP MCP server at `/api/mcp` exposing the whole Lee/Collier data lake (44
"brains": housing, CRE, permits, traffic, tourism, hurricane risk, sector credit, logistics, macro)
to any MCP client — Claude Desktop, Cursor, Cline, Windsurf, ChatGPT, ClaudeCode, etc. — as two
tools, plus write tools behind a capability key. Built well before this session; this session found
it, capped it, and gave it a public front door.

## Facts

- 2026-09-15 — Two read tools exist: `swfl_fetch` (tiered depth 1-3, every number cited, a ZIP
  shortcut that returns every dataset covering a location at its true grain, a response contract
  that forbids inventing figures) and `swfl_reconcile` (checks a specific figure against the live
  lake before the calling model asserts it — an anti-hallucination guard). Both are keyless by
  design (v1 connect-once). Write tools (`swfl_project_*`) need `X-Account-Key` or `X-Project-Key`.
  (app/api/mcp/server.ts)
- 2026-09-15 — An in-chat visual card (`mcp-widget/`) is built and tested spec-correct against the
  MCP Apps spec, but parked: claude.ai (web + desktop) renders it as a blank iframe — an open,
  unfixed *host* bug (anthropics/claude-ai-mcp#61, #165), confirmed by the ext-apps maintainer, not
  a bug in our code. Re-enabling is one commit once those issues close. (mcp-widget/PARKED.md)
- 2026-09-15 — Before this session, `swfl_fetch` was open, anonymous, and completely unmetered —
  the only place the connector was even mentioned was `/settings/mcp`, behind login. No public page
  told anyone this existed.
- 2026-09-15 — Carbon Arc comparison (crawled live, [full crawl](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/research/carbonarc/2026-09-15/site-crawl.md)):
  a NY hedge-fund-alt-data company (founder ex-Point72/Glenview/Tudor, $56M raised) selling 73
  national datasets across 8 categories through **three doors, all bundled even at $20/mo**:
  "Lenses" (their own web chat app — the default "get started" path), an MCP server (the
  convenience layer for people who don't want to leave Claude/ChatGPT/Perplexity), and an SDK/API
  (for people building a pipeline, not just asking questions — their own case study uses it with
  Claude Code to build a live restaurant-industry tracker). Pricing: $20/mo (1 seat) / $200/mo
  (unlimited seats) / Enterprise custom, all consumption-metered against "promo tokens."
- 2026-09-15 — Where we already match that shape: `/ask` is our Lenses (web chat, no account,
  already existed before this session). `/api/mcp` is our MCP server. **We have no SDK/API story**
  for someone who wants to build a pipeline on our data the way Carbon Arc's restaurant-tracker case
  study does — that's the one door Carbon Arc has that we genuinely don't.
- 2026-09-15 — Usage cap added (PR #204, [full detail](https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/pull/204)):
  15 keyless requests/**month** (not day — a daily reset never actually runs out, so it never
  produces the "I've used my allowance" moment a real cap needs; see the PR/commit messages for the
  freemium-conversion reasoning), keyed on a hashed caller IP, Supabase-backed
  (`mcp_anon_usage`), mirrors `build_usage`'s fail-open metering doctrine exactly. Any caller
  presenting `X-Account-Key` or `X-Project-Key` skips the cap entirely — connecting an account is
  the escape, not a separate paywall. 15/month is a first guess anchored below Carbon Arc's own
  $20/mo-for-50-tokens paid entry tier, not a measured number — the standard move (launch a
  reasonable guess, tune from real usage after 30-90 days) since no published benchmark exists for
  this product category.
- 2026-09-15 — `/connect`, a public unauthenticated page, pitches the connector with real example
  prompts pulled from what the tool actually covers, a copy-paste client config, and a link to
  `/settings/mcp` for the unlimited-account path. Linked from the homepage's final CTA. This is the
  piece that was actually missing — the connector worked, it just had no front door.
- 2026-09-15 — Migration `20260915_mcp_anon_usage.sql` (the usage-cap table) is written but **not
  yet applied to production** — the code fails open (uncapped) until it is, by design, so this ships
  safely in either order.

## Decisions

- 2026-09-15 — Monthly cap, not daily, landed at 15/month (Ricky, after "5 a day sounds like a lot
  ... 30 a month? I don't know, has to be some metrics on this somewhere"). See PR #204 commits for
  the full freemium-research citation.
- 2026-09-15 — Ship the connect page + cap as a PR, not a direct push to main — this repo's own
  CLAUDE.md RULE 1 puts live `/api/mcp` changes on the ASK-FIRST list.
- 2026-09-15 — Sequence: fix [pipeline health](pipeline-health.md) staleness before actively
  marketing `/connect` — a free public tool returning a month-stale housing number is worse than no
  tool. The rebuild order on that page ends with "the MCP landing page, once the numbers behind it
  are current."

## Open questions

- Merge PR #204? Needs Ricky's go-ahead (this repo's ASK-FIRST rule for live MCP changes).
- Apply migration `20260915_mcp_anon_usage.sql` to production — who runs it, and through what
  pipeline (no `supabase db push` / CLI link was confirmed working from this session).
- Do we want an SDK/API story (Carbon Arc's third door)? Not scoped yet.

## Related

- [Pipeline health](pipeline-health.md)
- [Diversification](diversification.md)
- [Chief of Staff: Florida public records](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/wiki/florida-public-records.md)
- [Chief of Staff: Tool discovery](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/wiki/tool-discovery.md)
