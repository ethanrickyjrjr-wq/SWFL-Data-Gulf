# Orchestration — who builds what, what runs together vs separate

## Who builds what

Each phase maps to one specialist builder so the right area CLAUDE.md conventions load.

| Phase | Builder | Owns |
|---|---|---|
| 1 — Inventory cutover | `ingest-engineer` | `ingest/pipelines/listing_lifecycle/*` (address_key, extract_api, pipeline, distill, constants_api), the migration, the catch-up run |
| 2 — Sold lake | `ingest-engineer` | off-market sold capture into `listing_transitions` |
| 2 — Comp helper | `answer-engine-guardian` | on-demand comp path in `lib/assistant` |
| 3 — Market brains | `ingest-engineer` → `refinery/packs` | weekly aggregate pipeline + Tier-2 tables, then 2 PackDefinitions + vocab |
| 4 — Rentals | `ingest-engineer` → `refinery/packs` | rentals pipeline + table, then rentals PackDefinition + vocab |
| 5 — Land/manufactured | `ingest-engineer` | parked ODD scaffold |

## What runs together vs separate

### Sequential (hard dependencies — must finish before the next starts)

1. `address_key.py` hardening **lands first** — the catch-up address-match depends on it.
2. Migration + `distill._STATE_COLS` **before** `extract_api.py`/`pipeline.py` write the new columns.
3. Catch-up run **before** any steady-state cron (the lake must hold property_id-stamped rows first).
4. Each new brain's Tier-2 table **before** its `PackDefinition` (brain-first ingest gate).

### Parallel-safe (no shared files — run at the same time)

- `address_key.py` hardening (+ its test) is isolated → runs alongside the **migration** authoring.
- **Phase 3** and **Phase 4** pipelines touch different new files → parallelizable **after** Phase 1 lands.
  Isolate each in its own worktree (RULE 1.5); they both add cadence/cron + vocab entries → stagger those
  two commits, not the code.
- **Phase 2 comp helper** (`lib/assistant`) shares **nothing** with the ingest phases → fully parallel.

### Cannot run in parallel (shared-file collisions)

- Anything touching `extract_api.py` / `pipeline.py` / `distill.py` — all Phase-1 core, one builder, serial
  (this is also why Phase-2 Part A is serial after Phase 1).
- Two phases both editing `brain-vocabulary.json` or `ingest/cadence_registry.yaml` — stagger the commits.

## Dependency DAG

```
address_key hardening ─┐
                       ├─→ [Phase 1 catch-up run] ─→ [Phase 1 cron] ─┬─→ Phase 3 (market brains)   ─┐
migration + _STATE_COLS┘                                             ├─→ Phase 4 (rentals brain)    ─┼─→ done
                                                                     └─→ Phase 2A (sold capture)    ─┘
Phase 2B (comp helper, lib/assistant) ───────────────────────────────── fully parallel ────────────────┘
Phase 5 (land/manufactured ODD scaffold) ── ships parked anytime after Phase 1
```

## Push discipline (per CLAUDE.md)

- SESSION_LOG entry before every push; stage explicit paths only; `node scripts/safe-push.mjs`.
- Brain-first + vocab gates: pack ⇆ catalog mirror, `check-vocab-coverage.mts --all` on any vocab touch.
- Ingest Gate 4 (non-null guard before destructive replace) on every `data_lake.*` write.
- Ask-first items (RULE 1): writes to `data_lake.*`, refactors >5 files, anything touching live `/api/b/*`.
