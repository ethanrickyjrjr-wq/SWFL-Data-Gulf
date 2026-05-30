# City Pulse + Flywheel — design spec

**Date:** 2026-05-30
**Status:** DESIGN — awaiting operator review, then `writing-plans`
**Author:** Opus 4.8 session (brainstorm with Ricky)

---

## 1. Problem

The corridor "voice" sounds alive but is **batch-stale on two axes**: structured data refreshes on 7d–365d cadences, and the web-grounding layer (`corridor_grounded`) runs **quarterly**. Nothing in the answer path fetches anything live — `/api/mcp` and `/api/b/*` read pre-built `.md` off disk. So "what's happening _right now_ in this market" is, at best, three months old.

Refreshing the slow **narrative** layer faster is the wrong fix — corridor character doesn't change weekly. The fix is to add a **fast, coarse-grained current-events layer** matched to how quickly the underlying facts actually move, and let the existing synthesis + consumption stack route it to the question.

## 2. The cadence model (matched to volatility, not to geography)

| Layer              | What                                                                                        | Grain         | Cadence            | Runs/cycle                      |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------- | ------------------ | ------------------------------- |
| **City pulse**     | Top news + current signals (openings, layoffs, construction starts, major sales, disasters) | **City** (≈7) | **Daily**          | 7                               |
| Corridor narrative | Full character voice refresh                                                                | Corridor      | Quarterly / 6mo    | ~24 (exists today)              |
| Corridor-specific  | Targeted volatile facts a quarterly refresh misses                                          | Corridor      | Weekly / bi-weekly | TBD per need — **future phase** |
| Flywheel           | Stable facts TTL'd; stop re-pulling what we know                                            | Fact          | Ongoing            | self-shrinking                  |

**Key architectural decision:** the fast layer runs at **city grain (7 runs/day), not corridor grain (24).** Most current-events news is municipal, not corridor-specific. Master fans city pulse down to corridor relevance _at consumption time_ where corridors exist; cities without a corridor (e.g. Lehigh Acres today) simply flow as city-level signal. This permanently avoids a city→corridor 1:many fan-out that would throw on, or silently drop, a corridor-less city.

## 3. The 7 cities

`Lehigh Acres, Cape Coral, Fort Myers, Naples, Estero, Bonita Springs, Fort Myers Beach`.

Note: `corridor_profiles.city` currently holds **6** of these (all but Lehigh Acres) across 24 corridors — Naples = all 9 Collier corridors, the rest Lee (`refinery/sources/cre-source.mts:42-49`). Lehigh Acres has **no corridor yet** but matters to the numbers (Amazon's ~$60M inland land buy + heavy build-out). It is included as a city-pulse target now; a **Lehigh corridor is a separate, already-decided future add** (out of scope here). The city list is a **static, code-owned constant** in the pipeline — NOT derived from `corridor_profiles` — precisely so it can include cities ahead of their corridors.

## 4. ⚠️ Vendor lock: `web_search_20250305`, NOT `20260209`

The newer `web_search_20260209` ("dynamic filtering") routes results through code execution and emits text from variables, **suppressing per-claim `citations[]` entirely** — verified in-repo by A/B on 2026-05-26: **9 cited_text spans on `20250305` vs 0 on `20260209`** (`ingest/pipelines/corridor_grounded/pipeline.py:12-16`, `docs/vendor-notes/anthropic-web-search-wire-up.md`).

Per-claim citations are the foundation of the `[web-N]` stamp and the structural no-hallucination guarantee. **City pulse MUST use `web_search_20250305`** and inherit `corridor_grounded`'s zero-citation guard (warn + treat as a failed pull when `cited_text_count == 0`). Re-evaluate only if a future tool version restores `citations[]` under live A/B test — never on the strength of a changelog.

## 5. Architecture

```
                 ┌─────────────────────────────────────────────┐
   DAILY CRON →  │ ingest/pipelines/city_pulse/  (fork of        │
                 │ corridor_grounded; 7-city loop, 20250305)     │
                 └───────────────┬───────────────────────────────┘
                                 │ web_search per city → citations[]
                 ┌───────────────▼───────────────┐
   Tier-1 cold:  │ lake-tier1/city_pulse/{city}/… │  raw immutable audit (NDJSON)
                 └───────────────┬───────────────┘
                                 │ distill + dedup + TTL
                 ┌───────────────▼───────────────────────────────┐
   Tier-2 warm:  │ data_lake.city_pulse  (per-fact, TTL'd)        │  ← THE FLYWHEEL
                 └───────────────┬───────────────────────────────┘
                                 │ read latest non-expired
                 ┌───────────────▼───────────────┐
   Reporter:     │ city-pulse-swfl PackDefinition │  deterministic; [web-N] gate
                 └───────────────┬───────────────┘
                                 │ BrainOutput (city-grain facts + citations)
                 ┌───────────────▼───────────────┐
   Synthesizer:  │ master  (new input_brains edge)│  carries pulse in dossier
                 └───────────────┬───────────────┘
                                 │ dossier + lean rules block (rides in payload)
                 ┌───────────────▼───────────────┐
   Consumption:  │ Tier-3 carry contract (LIVE)   │  picks what's relevant to the
                 │ downstream Claude              │  *question* — NO new infra
                 └────────────────────────────────┘
```

**Approach A (hybrid storage), operator-approved:** raw → Tier-1 cold (cheap, immutable, re-derivable); distilled → Tier-2 `city_pulse` table the brain reads. This is exactly the Tier-1-cold / Tier-2-brain-consumed split the data-tier policy already locks (`docs/API_BLUEPRINTS.md`).

### 5a. Two steps: capture, then distill

The pipeline runs **one `web_search` call per city** (7 search-calls/day, each `max_uses ~8` — this is the "7 queries" budget), covering all topics in a single broad prompt. That keeps search volume at 7/day, not 7×topics. The raw model response + flattened `citations[]` lands in Tier-1.

A second **distill step** (one cheap Sonnet call per city's raw response — _no_ web search, structured output via forced tool-use, same pattern as `synthesize-corridor-character.mts`) turns each raw response into discrete `city_pulse` rows. For every fact it: (a) classifies the `topic` volatility class (§7) — this is what assigns the TTL; (b) attaches the backing `source_url`/`cited_text` from the citation it was drawn from; (c) computes `dedup_key`. **A fact with no backing citation is dropped, not written** — the citation requirement is enforced at distill time, before the row exists, so the `[web-N]` gate downstream can never see an unbacked claim. Topic is therefore LLM-assigned at distill, not derived from the query (the query is one broad prompt, not one-per-topic).

## 6. Tier-2 schema — `data_lake.city_pulse`

One row per distilled fact (not per raw article), so TTL and dedup operate at fact grain.

```sql
CREATE TABLE IF NOT EXISTS data_lake.city_pulse (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city            TEXT        NOT NULL,           -- one of the 7 (free text, validated in pipeline)
  topic           TEXT        NOT NULL,           -- volatility class key, §7
  fact            TEXT        NOT NULL,           -- the distilled claim, numbers verbatim
  source_url      TEXT        NOT NULL,           -- backs the [web-N] stamp
  source_title    TEXT,
  cited_text      TEXT,                           -- ≤150 chars span from web_search citation
  captured_at     TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,           -- captured_at + TTL(topic) — drives the flywheel
  dedup_key       TEXT        NOT NULL,           -- hash(city|topic|normalized-fact) — "stop re-pulling"
  superseded_by   BIGINT      REFERENCES data_lake.city_pulse(id),  -- newer fact replaces older
  run_at          TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS city_pulse_dedup_uidx ON data_lake.city_pulse (dedup_key);
CREATE INDEX        IF NOT EXISTS city_pulse_live_idx   ON data_lake.city_pulse (city, topic, expires_at);
GRANT SELECT ON data_lake.city_pulse TO service_role;          -- brain-platform read key (read-only)
```

`service_role` GRANT is mandatory — the brain-platform read key is `service_role` and new tables are not readable without an explicit grant (prior incident, memory: premise-engine-supabase-roles). No sequence grant needed: `service_role` only SELECTs; the pipeline writes via the dlt/postgres role (`DESTINATION__POSTGRES__CREDENTIALS`).

## 7. TTL volatility classes (the flywheel made real)

TTL keyed by `topic`. The daily job only issues a search for a `(city, topic)` whose freshest row is **expired** — stable facts fall out of the daily pull-list, so **search volume self-shrinks as the lake fills.** Starting classes (tunable):

| `topic`        | Examples                                      | TTL     |
| -------------- | --------------------------------------------- | ------- |
| `breaking`     | disaster, sudden closure, major layoff        | 1 day   |
| `transactions` | building sales, big leases, land buys         | 7 days  |
| `development`  | construction starts, permits, board approvals | 14 days |
| `business`     | openings/closings, expansions, hiring         | 14 days |
| `structural`   | anchor ownership, long-run market posture     | 90 days |

Dedup: a new pull whose `dedup_key` already exists and is **not** expired is a no-op (skip the search entirely next cycle); a materially-changed fact writes a new row and sets the prior row's `superseded_by`.

## 8. Reporter pack — `city-pulse-swfl`

Deterministic reporter (mirrors `traffic-swfl` / `macro-swfl`): `skipTriageAgent: true`, `skipSynthesisAgent: true`, `corpusSummary` + `outputProducer`, `synthesisStrategy: "deterministic"`. Reads non-expired `data_lake.city_pulse` rows → `BrainOutput` of **city-grain current facts**, each carrying a `[web-N]` stamp resolved from `source_url`/`title`/`cited_text`. It is a **Tier-1 Reporter** per THE-GOAL: cited current facts, **no opinions** — speculation stays with master. The existing `[web-N]` + dangling-anchor write-blocking citation gate (`refinery/validate/corridor-character-lint.mts` family) governs its render, unchanged.

Master edge: add `{ id: "city-pulse-swfl", edge_type: "input" }` to `master.mts` `input_brains[]`.

## 9. Query-time relevance = the existing carry contract (NO new infra)

"Master decides what's relevant to the question" is **already live** — Goal 2, the Tier-3 carry contract. City pulse rides inside master's dossier payload (MCP `_meta` / `/api/b?format=json`); the downstream Claude reasons over the dossier + the lean rules block and selects what the _specific question_ needs, without re-fetching. We build **zero** new query-time filtering. The follow-up turn compounds automatically because the dossier persists in the downstream Claude's context.

## 10. Brain-first gate — single PR

**One PR ships the `city-pulse-swfl` PackDefinition AND the `data_lake.city_pulse` migration together.** Never table-first / brain-later. The migration is idempotent (`IF NOT EXISTS`), run directly via psycopg3 + `.dlt/secrets.toml` (operator never hand-runs SQL), row count verified after. PR contents:

1. `ingest/pipelines/city_pulse/` (pipeline + `--dry-run` + tests)
2. `.github/workflows/` daily cron wrapper for the pulse pipeline
3. `ingest/cadence_registry.yaml` entry (cadence: 1 day, lane tier-2 via the distill step; tier-1 raw prefix `lake-tier1/city_pulse/`)
4. `docs/sql/2026-05-30_city_pulse.sql` (table + grants)
5. `refinery/packs/city-pulse-swfl.mts` + registry entry + tests
6. `master.mts` `input_brains` edge
7. Distill step that reads Tier-1 raw → writes Tier-2 distilled+TTL'd rows
8. **Delete** `ingest/pipelines/news_swfl/` + its `cadence_registry.yaml` `not_yet_running` entry (dead, superseded — §14.2)

Pipeline-freshness standard (`docs/standards/pipeline-freshness.md`) satisfied: GHA cron + `--dry-run` + cadence-registry entry all in the same PR.

## 11. Cost (verified rates, 2026-05-30)

Web search **$10 / 1,000 searches = $0.01/search** (results count as input tokens; `cited_text`/`title`/`url` are free). Sonnet 4.6 **$3/MTok in, $15/MTok out** (Batch API: $1.50 / $7.50). Per city/day = one capture call (search fees + result tokens) + one cheap distill call (no search) ≈ $0.13–0.21 → **7 cities ≈ $0.9–1.5/day ≈ $28–45/month naive.** Drops as the flywheel warms (fewer non-expired searches → fewer capture calls) and optionally via Batch API on the cron. This is noise — **do not optimize cost; optimize for the citation gate staying intact and the flywheel writing back.**

## 12. Out of scope (future phases, designed-for but not built)

- **Weekly/bi-weekly corridor trigger** — a _second trigger on the same `city_pulse` table_ at corridor grain, not a separate pipeline. Build when the daily city layer proves insufficient for corridor-specific questions. **This is the point to add the Batch API 50%-token lever** (deferred from v1, §14.3): once call volume grows, async submit/poll orchestration earns its keep.
- **Conversation follow-up → flywheel write-back** — capturing a live fact surfaced on a follow-up turn back into `city_pulse` so the _next_ user's master is smarter. This is the lake-level compounding; it requires a live/query write path we are deliberately deferring. The schema (dedup + supersede) is built to receive it.
- **Lehigh corridor** — separate corridor add.

(The dead source-based `news_swfl` scraper is **removed in this PR**, not deferred — see §14.2.)

## 13. Testing

- Pipeline: unit test the 7-city loop, citation extraction, `cited_text_count == 0` guard, dedup-key stability, TTL/`expires_at` computation. `--dry-run` writes locally, no upload.
- Distill: round-trip a fixture raw NDJSON → expected Tier-2 rows; assert dedup no-ops and supersede chains.
- Pack: deterministic `corpusSummary`/`outputProducer` snapshot; **citation gate must reject a fabricated `[web-N]`** (dangling-anchor test) — proves the guarantee holds on the new surface.
- Master: rebuild with the new edge present and absent; assert graceful degrade when `city_pulse` is empty (no hollow brain).

## 14. Resolved decisions (operator-locked 2026-05-30)

1. **Naming → `city-pulse-swfl` family.** Pack `city-pulse-swfl`, table `data_lake.city_pulse`, pipeline `ingest/pipelines/city_pulse/`, cold prefix `lake-tier1/city_pulse/`. Clearer than `news-swfl` and avoids collision with the dead scraper being removed (#2).
2. **Retire `news_swfl` → delete in this PR.** The source-based scraper never ran and is superseded by this city-based pipeline. Remove `ingest/pipelines/news_swfl/` and its `cadence_registry.yaml` `not_yet_running` entry as part of the build PR. Clean cut.
3. **Batch API → deferred (synchronous v1).** Savings (~50% of the token portion only; search fees don't discount) are noise at 7 calls/day and don't justify async submit/poll orchestration in v1. Revisit when the weekly corridor trigger grows call volume; documented in §12 as the lever to pull then.
