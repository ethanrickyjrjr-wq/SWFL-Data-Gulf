# PARALLEL MAP — what can and can't run at the same time

```
            ┌─────────────────────── independent, run any time ───────────────────────┐
            │  J4 charts-reconcile     J5 ops-triggers (operator)    J6 parcels-PARKED │
            └──────────────────────────────────────────────────────────────────────────┘

   J1  ZIP SPINE  ─────────►  ┌─ J2  collier-permits zip ─┐
   (§A + §B)                  └─ J3  mhs graduation + zip ─┘
   run FIRST, blocks J2/J3      J2 ∥ J3 build in parallel,
                                BUT serialize the shared-registry edits
```

## The one hard gate
**J1 must be merged on `main` before J2 or J3 start.** Both J2 and J3 call
`resolveZip().in_scope` to scope-gate their backfills to the 6 counties, and both need the
zip→county authority `fixtures/swfl-zip-county.json`. Building J2/J3 against a non-existent
resolver = rework.

## J2 ∥ J3 — parallel build, serialized merge
Two different Claudes can build J2 (Collier) and J3 (MHS) at the same time — **different
tables, different packs, different pipelines.** They collide only on **shared registry files**:

| Shared file | Touched by | Conflict risk |
|---|---|---|
| `refinery/vocab/brain-vocabulary.json` | J3 (3 new slugs) | high — JSON, same region |
| `ingest/cadence_registry.yaml` | J3 (graduate mhs), **J5** (crexi/lee_associates) | high — adjacent entries |
| `refinery/packs/index.mts` | J3 (register pack) | low — append-only, but coordinate |
| `_AUDIT_AND_ROADMAP/build-queue.md` | J2, J3, J4 | low — different lines |
| `SESSION_LOG.md` | every push | expected — newest-first, append-only |

**Rule:** land one job's registry edits first, then the other rebases (`scripts/safe-push.mjs`
rebases automatically; resolve `vocab`/`cadence` conflicts by keeping both entries). Don't run
two `safe-push` against the same registry file in the same minute.

## J3 ↔ J5 cadence-registry serialization
Both edit `ingest/cadence_registry.yaml`: J3 moves `mhs_permits_swfl` out of the
`probe_mode: odd_window` block into `pipelines:`; J5 removes `probe_mode` from `crexi_listings`
and `lee_associates_swfl`. **Different entries**, so a rebase merges cleanly — but whoever
pushes second must `safe-push` (rebase), never force.

## Fully independent (no code-file overlap)
- **J4** — touches `build-queue.md` + the `checks` ledger + a local render check. No code edits.
- **J6** — a single new doc under this folder. No code.
- **J5** — operator-run GitHub Actions + the cadence edit above. No Claude code.

## Suggested wave order
1. **Wave 0 (now, parallel):** J4, J5, J6 — none depend on anything.
2. **Wave 1:** J1 (the spine) — the critical path.
3. **Wave 2 (after J1 on `main`):** J2 ‖ J3 — two Claudes, coordinating the registry merges.
