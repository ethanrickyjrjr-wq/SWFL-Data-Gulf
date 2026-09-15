# 2026-09-15 — MCP connector, usage cap, diversification, pipeline health — HANDOFF

Full detail now lives in `wiki/` (new, this session — see `wiki/INDEX.md`). This file is the fast
orientation; read the wiki pages for facts, decisions, sources, and open questions.

## What happened today

Two threads converged on this repo from Ricky's Chief of Staff desk session:

1. **Pipeline health.** A branch (`claude/swfl-data-gulf-pipelines-h47qjv`) investigated why the
   product is stale despite 81/100 green scheduled runs. Two dead feeds, not a code problem:
   SteadyAPI 429s every night since 08-14 (Ricky killed it — "Forget the steady api!!!!"), and the
   Anthropic API key is out of credit (16 workflows depend on it). Fix order and full findings:
   `wiki/pipeline-health.md`.
2. **MCP connector + diversification.** Ricky asked what Hugging Face offers for learning from
   video clips (unrelated tangent, led to building `clipfeed` on the Fedora box, not part of this
   repo), which led into a Carbon Arc comparison, which led here: the MCP server (`swfl_fetch`,
   `swfl_reconcile`) was already live and arguably more sophisticated than Carbon Arc's — it just had
   no public page and no usage cap. Built both (PR #204, **not yet merged** — this repo's own
   CLAUDE.md puts live `/api/mcp` changes on the ASK-FIRST list). Then: diversification — five
   brains hold data for buyers outside real estate; condo SIRS compliance scoped as the sharpest
   target, with real row-level data confirmed in `data_lake.dbpr_sirs_submissions` that nothing in
   the app currently reads. Full detail: `wiki/mcp-connector.md`, `wiki/diversification.md`.

## What needs Ricky, in order

1. **Anthropic console — add credit.** Ten minutes, unblocks 16 workflows including the nightly
   brain rebuild. Nothing in the repo fixes this.
2. **Merge PR #204** (usage cap + `/connect` page) — or say what's wrong with it first.
3. **Condo SIRS: free public lookup, or gated from day one?** Changes the build.
4. **Reuse terms for scraping the brokerage listings site** — unrecorded anywhere in the repo,
   ran that way for a month in July without anyone checking.
5. **A session on Ricky's own network** (`ssh fedora`) to stand up the residential-IP runner — a
   cloud sandbox can't reach 10.0.0.169.

## What's desk work (no Ricky needed once #1 above lands)

- Flip the listing pipeline back to `--source scrape`, dry-run one county, let the nightly chain run.
- Fleet hygiene: classify the credit/429 failures as BILLING, land or delete 3 ghost registry
  entries, fix one schema-prefixed signal, add the missing `/api/health` route, close 22 stale
  cron-failure issues.
- Build the condo SIRS lookup page once framing is answered (#3 above).
- Work down the 75-entry data-ceiling registry, cheapest/most-proven first (Lee's ArcGIS permit
  layers is the top pick).

## Where the rest of the context lives

- `wiki/INDEX.md` — start here for this repo's own wiki.
- `chief-of-staff` (sister repo, `github.com/ethanrickyjrjr-wq/chief-of-staff`) — the
  business-decision layer: pricing, revenue, buyer asks, the full exhaustive pipeline-health
  write-up with every run ID, the full Carbon Arc site crawl.
