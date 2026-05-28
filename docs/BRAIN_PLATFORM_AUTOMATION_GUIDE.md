# Brain-Platform Automation — Build Guide

> Single-document instructions to stand up the automation surface for SWFL Data Gulf (brain-platform). Sibling document to premise's n8n guide (`C:\Users\ethan\Downloads\PREMISE_N8N_BUILD_GUIDE.md`). Grounded in the files in this repo, not from memory.

---

## 0. What you're operating

Brain-platform has three layers of automation. **No state lives in the orchestrator** — Postgres / Supabase Storage / Notion / GitHub are the durable stores. Every workflow is HTTP-only and zero-state-in-the-runner.

| #   | Surface                                                             | Trigger                                                       | What it does                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | **GHA ingest crons** (`.github/workflows/*.yml`)                    | Per-pipeline schedule (daily/weekly/monthly/quarterly/annual) | Pull from each vendor source → Tier 1 Parquet (Supabase Storage) or Tier 2 dlt → Postgres `data_lake.*`. Daily freshness probe reports stale pipelines. Auto-capture incident ledger logs failures.                       |
| 02  | **daily-rebuild** (`.github/workflows/daily-rebuild.yml`)           | `workflow_dispatch` + nightly cron                            | Runs `npm run refinery <pack_id>` against current data; writes new `brains/<pack>.md` versions; uploads to `/api/b/<slug>`. Triggered by ingest workflows via `workflow_dispatch` after Tier-2 writes.                    |
| 03  | **notion-sync-weekly** (`.github/workflows/notion-sync-weekly.yml`) | Monday 09:00 ET cron + `workflow_dispatch`                    | Rebuilds Big Bird's Brain → Latest Sync hub + 4 detail pages (audit, roadmap, premise replacement, data-sources inventory) via `scripts/notion-sync.mjs`. Zero state; idempotent.                                         |
| 04  | **Subagents** (`.claude/agents/*.md`)                               | Operator-invoked or auto-triggered by Claude Code             | `constitution-builder` writes domain rules. `v3-spec-guard` validates the BrainOutput contract. `project-state-sync` detects drift between code and docs (CLAUDE.md / MEMORY.md / SESSION_LOG / plan READMEs / ontology). |

Each ingest pipeline ships with its GHA cron wrapper + `--dry-run` support in the same PR — see `docs/standards/pipeline-freshness.md` for the standard. Each subagent is one file under `.claude/agents/` with frontmatter + a body that explains scope, procedure, and reporting contract.

---

## 1. Prerequisites

### Accounts you need

- **GitHub repo** — `brain-platform`. Required secrets listed in §3.
- **Supabase project** — `brain-platform`'s own Supabase (not premise's). URL + service-role JWT + Postgres connection string.
- **Anthropic API key** — `ANTHROPIC_API_KEY` for the synthesis agent + corridor-character generator's `web_search_20250305` tool.
- **Firecrawl + Spider keys** — `FIRECRAWL_API_KEY` (primary) + `SPIDER_API_KEY` (fallback). See §6 of `docs/standards/pipeline-freshness.md`.
- **FRED, BLS, Census API keys** — `FRED_API_KEY`, free Census key, BLS public registration.
- **Mapbox token** — wired via Mapbox MCP, used by speaker layer + corridor pipeline.
- **Big Bird's Brain Notion integration** — `ntn_…` token. Grants on Latest Sync page (`3658729a64598193a737f845f9747bb1`).
- **Vercel project** — hosts `https://www.swfldatagulf.com` + `/api/mcp` MCP server.

### Local tooling (one-time install)

```bash
# Node 20 (matches GHA runner)
node --version  # v20.x

# Bun (refinery + tests)
bun --version

# Python 3.12 (ingest pipelines)
python --version

# Serena (semantic code search, project-scoped)
uv tool install -p 3.13 serena-agent@latest --prerelease=allow
serena init
```

### Keys already in repo secrets (do not re-create)

Per `docs/standards/pipeline-freshness.md` §2: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DESTINATION__POSTGRES__CREDENTIALS`, `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `SPIDER_API_KEY`, `FRED_API_KEY`, `SUPABASE_S3_*`. Plus what each pipeline declares in its `env:` block.

---

## 2. Pick where each thing runs

| Surface                     | Where it runs                           | Cost                                                                    |
| --------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| Ingest crons (20 pipelines) | GitHub Actions hosted runners           | $0 (within free tier; ingest pipelines stay well under 2000 min/mo)     |
| daily-rebuild               | GitHub Actions                          | $0                                                                      |
| notion-sync-weekly          | GitHub Actions                          | $0                                                                      |
| MCP server `/api/mcp`       | Vercel Hobby                            | $0 (one Pro WAF rule on `/api/waitlist` is the only paid line at scale) |
| Subagents                   | Local Claude Code on operator's machine | per-invocation Anthropic token cost                                     |

**No n8n.** The brain-platform pivoted off n8n during the 2026-05-26 freshness-first chain (PR #17 — `feat(ingest): firecrawl pipelines as GitHub Actions cron (replaces n8n plan)`). Premise still uses n8n; brain-platform does not.

---

## 3. Required repo secrets (GitHub → Settings → Secrets → Actions)

```
# ============ ANTHROPIC ============
ANTHROPIC_API_KEY=sk-ant-...

# ============ SUPABASE ============
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
DESTINATION__POSTGRES__CREDENTIALS=postgresql://...
SUPABASE_S3_ENDPOINT=https://<ref>.storage.supabase.co/storage/v1/s3
SUPABASE_S3_ACCESS_KEY_ID=...
SUPABASE_S3_SECRET_ACCESS_KEY=...

# ============ VENDOR APIS ============
FIRECRAWL_API_KEY=fc-...
SPIDER_API_KEY=...               # fallback per CLAUDE.md §6 rule
FRED_API_KEY=...                 # macro-us chain
CENSUS_API_KEY=...               # Census CBP / VIP

# ============ NOTION (Big Bird's Brain) ============
NOTION_KEY=ntn_...               # integration token for Big Bird's Brain workspace
NOTION_LATEST_SYNC_PAGE=3658729a64598193a737f845f9747bb1   # optional override

# ============ MAPBOX ============
MAPBOX_TOKEN=pk....              # publishable; used by report page
```

**Security note:** `SUPABASE_SERVICE_KEY` bypasses RLS. Required by Tier-2 dlt writers + `data_lake._tier1_inventory` upserts. Never expose on a public-facing instance.

---

## 4. Build order (canonical sequence)

Read-only and lower-blast-radius first; write-heavy last.

### Step 4.1 — Ingest crons (already shipped)

Status: **all 20 active pipelines live.** First-fires in window 2026-05-27: `redfin_swfl` (66,672 rows / 125 ZIPs), `fred_g17`, `bls_ppi`, `census_vip`. Cadence registry at `ingest/cadence_registry.yaml`.

To add a new pipeline:

```bash
python -m ingest.scaffold --name=<pipeline_name> --tier=2 --cadence=monthly
# Edits an entry into ingest/cadence_registry.yaml, generates pipeline boilerplate +
# a matching .github/workflows/<pipeline-name>-<cadence>.yml. CI drift-guard fails
# the PR if any of the three (pipeline dir, workflow, cadence entry) is missing.
```

Per Data Tier Policy rule 2 (`docs/API_BLUEPRINTS.md`): **no bulk ingest hits Tier 2 without its consuming brain's `PackDefinition` in the same PR.**

### Step 4.2 — daily-rebuild

Status: **shipped, fires on `workflow_dispatch` and `schedule` (nightly).** Wiring at `.github/workflows/daily-rebuild.yml`. Inputs: `pack_id` (which brain to rebuild) + `force` (bypass freshness check). Ingest workflows trigger it via `gh api repos/.../dispatches` after Tier-2 writes confirm. Example trigger: see end of `ingest/pipelines/bls_laus/pipeline.py`.

### Step 4.3 — notion-sync-weekly (shipped this session)

1. Add `NOTION_KEY` repo secret (Big Bird's Brain integration token starting with `ntn_`).
2. Optional: add `NOTION_LATEST_SYNC_PAGE` secret if you ever change the hub page ID.
3. Workflow: `.github/workflows/notion-sync-weekly.yml`. Cron: `0 13 * * 1` (Monday 09:00 ET).
4. Manual run: `gh workflow run notion-sync-weekly.yml`. Add `-f dry_run=true` to skip the write.
5. Script: `scripts/notion-sync.mjs`. Reads `NOTION_KEY` + page ID, archives stale Latest Sync blocks, rebuilds hub + 4 detail pages.
6. Verify: visit `https://www.notion.so/3658729a64598193a737f845f9747bb1` after run. Title should be `🦅 Latest Sync — Big Bird's Brain (<date>)`. Footer of the audit + roadmap pages should match `HEAD` SHA from git log.

### Step 4.4 — Subagents (shipped this session)

Three subagents in `.claude/agents/`:

- `constitution-builder.md` — writes domain rules under `refinery/constitution/`. Reads ontology + types before authoring. Runs `tsc --noEmit` + eslint after every edit.
- `v3-spec-guard.md` — read-only BrainOutput contract validator. Runs `tsc --noEmit` every invocation. Cannot use `Edit`/`Write`.
- `project-state-sync.md` (NEW) — read-only drift detector. Cross-references CLAUDE.md / SESSION_LOG / MEMORY.md / plan READMEs / ontology doc against git state. Reports drift; never edits.

Invoke via `Skill` tool or as a subagent in Claude Code: select agent, hand it a prompt, take its report.

---

## 5. Cost ledger (steady state)

Assumes 20 ingest pipelines firing at their declared cadence, 1 daily rebuild/day, 1 Notion sync/week, ~5 subagent invocations/day during active development.

| Line                                                                       | Cost/mo                                                              |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| GitHub Actions minutes                                                     | ~$0 (within 2000-min free tier)                                      |
| Vercel hosting                                                             | $0 (Hobby covers /api/mcp + /api/b/\* + /api/waitlist; one WAF rule) |
| Supabase                                                                   | depends on storage + egress; current load ~$25/mo for Pro tier       |
| Anthropic API (subagents + synthesis-agent + corridor-character generator) | ~$5–20/mo at current volume                                          |
| Firecrawl + Spider                                                         | ~$0–$30/mo depending on permits + grounded-search frequency          |
| FRED / BLS / Census                                                        | $0 (all public)                                                      |
| Mapbox                                                                     | $0 at current call volume                                            |
| Notion sync                                                                | $0 (Notion API is free under their generous limits)                  |
| **Total**                                                                  | **~$30–80/mo depending on Firecrawl spend**                          |

---

## 6. Failure recovery cheat sheet

| Symptom                                                    | First check                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cron workflow shows `failure` overnight                    | `docs/cron-rebuild-failures.md` — auto-capture should have a row + comment on issue #44                                                          |
| `daily-rebuild` errors with `FRED_API_KEY not set`         | Repo secret exists but not wired into the workflow `env:` block. Pattern documented in cron-rebuild-failures.md Recurring Patterns.              |
| `notion-sync-weekly` 401 from Notion                       | Token rotated or expired. Update `NOTION_KEY` repo secret + re-run.                                                                              |
| `notion-sync-weekly` archives 0 blocks then errors         | Page ID wrong (`NOTION_LATEST_SYNC_PAGE` typo) or integration disconnected from the page. Re-grant in Notion → page → Connections.               |
| Subagent invocation returns "tool not found"               | `.claude/agents/<name>.md` frontmatter missing or malformed. `name:` must match the file basename.                                               |
| `pre-push hook` blocks `git push`                          | RULE 0 — SESSION_LOG.md needs an entry on every push. Write the entry, commit, retry.                                                            |
| Brain output drifts from premise data                      | tourism-tdt still reads premise Supabase. Open `_AUDIT_AND_ROADMAP/premise-data-replacement.md`; ship the `ingest/pipelines/tdt_swfl/` cut-over. |
| Plan README claims SHIPPED but PR is open                  | Run `project-state-sync` subagent — it catches this exact pattern.                                                                               |
| MEMORY.md says "v17 main at c35d557" but HEAD is `5ce39db` | Memory drift. Run `project-state-sync`; update MEMORY.md status header.                                                                          |
| `daily-freshness-probe` flags pipeline as stale            | Vendor publisher missed a release, or our cron drifted vs. publisher cadence. Check release calendar — see CLAUDE.md vendor-cadence rule.        |

---

## 7. What's NOT built (intentional)

- **Premise's 4 n8n agents** (Discovery Call Prep, Sanity↔Postgres Sync, Post-Call Follow-up, Daily Briefing). Those are premise-engine surfaces, not brain-platform. Brain-platform has its own equivalent layer (GHA crons + daily-rebuild + notion-sync + subagents).
- **Master synthesizer (§6.1)** — highest-leverage NOW item. Until shipped, `master` is an index, not a synthesizer. See `_AUDIT_AND_ROADMAP/roadmap-2026-05-27.md` for the work breakdown.
- **Self-ingest of `tourism-tdt` source data** — brain LIVE but reads premise's Supabase. See `_AUDIT_AND_ROADMAP/premise-data-replacement.md`.
- **Industry-characters Phase 0** — gate met by corridor-character Step 4 ship; 8-file shared infra PR untouched. See `docs/superpowers/plans/2026-05-26-industry-characters/`.
- **Constitution YAML (§7.2)** — currently inline TypeScript in master's outputProducer (which doesn't exist yet). Land after §6.1.
- **Yager-DST confidence upgrade (§7.4)** — ~30 LOC from textbook Yager 1987. Ship behind `synthesisStrategy: "llm-assisted"` A/B toggle.
- **Outcomes loop** — predictions table will be seeded in §6.1.4; the grading cron is LONG-TERM work.
- **Webhook triggers on ingest** — all crons are pull-based today. Webhook upgrade is a v2 when n8n parity matters (it currently doesn't).

---

## 8. Replaceability

Every surface is HTTP-only + zero-state-in-the-runner. To port off GitHub Actions:

- **Ingest crons** → Supabase Edge Function + `pg_cron`, or Cloudflare Workers + cron triggers. ~1 day per pipeline.
- **daily-rebuild** → Supabase EF + pg_cron, or a long-running worker on Fly.io/Railway. ~1 day.
- **notion-sync** → Same script, different runner. The script is 100% portable Node + fetch. ~10 minutes.
- **Subagents** → Bound to Claude Code today. If/when we standalone-host an agent runtime, the markdown frontmatter format would need a converter — but the _content_ of each agent file is a pure spec, portable.

State lives in GitHub (the repo itself), Supabase (data + brain outputs), Notion (Big Bird's Brain hub), and Vercel (deploy). None of those are GHA-dependent.

---

## 9. Open decisions

- **Vercel-side env-var rename.** Code accepts both canonical (`SUPABASE_URL`) and legacy (`BRAINS_SUPABASE_*`) names. Vercel still on legacy. Rename in Vercel UI → verify waitlist still 200s → remove the fallback in code. **Do not remove the fallback first.**
- **`test_pipeline_drift.py` cleanup.** 4 pre-existing failures from killed pipeline dirs (now removed in 2026-05-27 Sonnet sweep). Pytest is not in CI — failures only surface when run locally. Worth a small PR.
- **Master pack → constitution YAML migration.** When master's `outputProducer` ships in §6.1, the inline rules should lift into `refinery/constitution/master.yaml`. Decision moment: rule count ≥ 20 across all domains (today ~5).
- **Subagent invocation cadence.** Should `project-state-sync` fire on every SessionStart automatically (via hook), or stay operator-invoked? Today: operator-invoked. Auto-fire risk: noisy reports on every session.

---

## Appendix A — File map

```
brain-platform/
├── CLAUDE.md                                       ← agent rules (RULE 0, RULE 1, Brain Factory non-negotiables, SWFL Protocol v3)
├── SESSION_LOG.md                                  ← append-only cross-session activity log
├── _AUDIT_AND_ROADMAP/                             ← dated snapshot folder
│   ├── audit-2026-05-27.md
│   ├── roadmap-2026-05-27.md
│   ├── premise-data-replacement.md
│   ├── data-sources-inventory.html                 ← 1142-line brand-styled cross-walk
│   └── notion-export/littlebird/                   ← paste-ready markdown copies
├── .claude/
│   ├── agents/
│   │   ├── constitution-builder.md
│   │   ├── v3-spec-guard.md
│   │   └── project-state-sync.md                   ← NEW: read-only drift detector
│   └── hooks/
│       ├── check-session-log-on-push.mjs           ← pre-push enforcer
│       └── check-build-context.mjs                 ← session-start enforcer
├── .github/workflows/
│   ├── daily-rebuild.yml
│   ├── freshness-probe-daily.yml
│   ├── log-cron-incident.yml                       ← auto-capture into docs/cron-rebuild-failures.md
│   ├── notion-sync-weekly.yml                      ← NEW: pushes to Big Bird's Brain
│   └── <pipeline>-<cadence>.yml                    ← 20 ingest workflows
├── scripts/
│   ├── notion-sync.mjs                             ← NEW: Notion build script (promoted from __scratch__)
│   └── (other smoke + ad-hoc scripts)
├── ingest/
│   ├── cadence_registry.yaml                       ← every pipeline + cadence (read by freshness probe)
│   ├── scaffold/                                   ← `python -m ingest.scaffold` boilerplate generator
│   └── pipelines/                                  ← 18 Tier-2 dlt + Firecrawl pipelines
│   └── duckdb_pipelines/                           ← 5 Tier-1 DuckDB pipelines
├── refinery/
│   ├── packs/                                      ← per-brain PackDefinitions + master.mts
│   ├── sources/                                    ← source connectors (one per data table)
│   ├── stages/{1-4}-*.mts                          ← refinery pipeline
│   ├── render/speaker.mts                          ← tier 1/2/3 user-facing rendering
│   └── validate/*.mts                              ← spec-validator, inference-bait-lint, smoothing-lint, etc.
├── app/
│   ├── api/mcp/route.ts                            ← MCP server v1 (LIVE)
│   ├── api/b/[slug]/route.ts                       ← brain output endpoint
│   └── r/[slug]/page.tsx                           ← report page
└── docs/
    ├── ontology-and-roadmap.md                     ← living quarterly-reviewed roadmap
    ├── standards/pipeline-freshness.md             ← 6 rules + Firecrawl→Spider rule (CLAUDE.md §6)
    ├── cron-rebuild-failures.md                    ← auto-capture incident ledger
    ├── consumption-contract.md
    └── superpowers/plans/*/README.md               ← per-feature plan files
```

---

## Appendix B — Quick reference IDs

| Thing                               | ID                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Public site                         | `https://www.swfldatagulf.com`                                              |
| MCP endpoint                        | `https://www.swfldatagulf.com/api/mcp`                                      |
| MCP install command                 | `claude mcp add --transport http swfl https://www.swfldatagulf.com/api/mcp` |
| GitHub repo                         | `ethanrickyjrjr-wq/brain-platform`                                          |
| Big Bird's Brain → Latest Sync page | `3658729a64598193a737f845f9747bb1`                                          |
| Sticky cron incident issue          | `#44`                                                                       |
| Master brain freshness token format | `SWFL-7421-v{n}-{YYYYMMDD}`                                                 |
| Daily freshness probe               | `.github/workflows/freshness-probe-daily.yml` (14:00 UTC)                   |
| Auto-capture incident listener      | `.github/workflows/log-cron-incident.yml`                                   |
| Brand: bg / teal / amber            | `#080E11` / `#3DC9C0` (or `#3ECFB2`) / `#E8A84C`                            |
| Brand fonts                         | IBM Plex Sans (body), IBM Plex Mono (numbers)                               |
| Logo generator                      | `Downloads/generate-icon.html` (canvas; downloads PNG)                      |

---

_Last updated 2026-05-27. Companion to `PREMISE_N8N_BUILD_GUIDE.md` (premise-engine, separate project). Brain-platform pivoted off n8n during the 2026-05-26 freshness-first chain (PR #17)._
