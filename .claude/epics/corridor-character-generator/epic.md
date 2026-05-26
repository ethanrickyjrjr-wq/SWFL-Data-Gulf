---
name: corridor-character-generator
status: in-progress
created: 2026-05-26T21:20:14Z
updated: 2026-05-26T21:33:34Z
progress: 20%
prd: .claude/prds/corridor-character-generator.md
github: https://github.com/ethanrickyjrjr-wq/brain-platform/issues/33
---

# Corridor Character Generator — Technical Epic

## Context

Step 0 (snapshot baseline) SHIPPED in commits `20692fc` + `ae4061e`. Frozen baseline at `docs/audits/2026-05-26-corridor-character-snapshot.md` (26 corridors). Re-runnable via `npm run snapshot:corridor-character`.

## Architecture

```
Stage A: build-corridor-fact-pack.mts (TS, pure fn, no network)
           ↓ structured JSON fact pack
Stage B: ingest/pipelines/corridor_grounded/pipeline.py (Python, Anthropic API)
           ↓ NDJSON to lake-tier1 bucket
Stage C: synthesize-corridor-character.mts (TS, one model call → {facts_block, chart_block, speculative_block})
           ↓ upsert corridor_profiles columns
```

## New DB columns (same PR as Step 2)

```sql
ALTER TABLE corridor_profiles
  ADD COLUMN IF NOT EXISTS character_facts          TEXT,
  ADD COLUMN IF NOT EXISTS character_chart          JSONB,
  ADD COLUMN IF NOT EXISTS character_speculative    TEXT,
  ADD COLUMN IF NOT EXISTS character_citations      JSONB,
  ADD COLUMN IF NOT EXISTS character_generated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS character_fact_pack_vintage TEXT;
```

Do NOT overwrite `character` — cold fallback for one full quarterly cycle.

## Rendering stack (Step 5)

`composeCharacterRender` in `cre-source.mts:240-253` composes: facts block → chart block → broker overlay → speculative block → sources chart link → cold fallback when facts null.

## Non-negotiable gates

- Steps ship in order. Gates are hard.
- Vendor-first rule: verify Anthropic web_search API in-session before any code lands.
- Facts block: spec-validator + facts-only-lint + inference-bait-lint + numeric_softening ban.
- Speculative block: spec-validator only + disclaimer required + inferred numbers must use hedging language.
- Brain-first ingest gate: no speculative Tier-2 loads.
- Do NOT re-tighten the speculative block — the operator explicitly removed that handcuff.

## Key files

- Plan: `docs/superpowers/plans/2026-05-26-corridor-character-generator/README.md`
- Snapshot: `docs/audits/2026-05-26-corridor-character-snapshot.md`
- Vendor notes: `docs/vendor-notes/grounded-search-research-2026-05-26.md`
- Pack entry: `refinery/packs/cre-swfl.mts:1087` (character render)
- Compose fn: `refinery/packs/cre-swfl.mts:240-253` (composeCharacterRender)
