# Derived slug_index — retire the hand-mirrored vocab index

**Date:** 2026-07-19
**Check:** `slug_index_autoderive_live_verify`

## Problem

`refinery/vocab/brain-vocabulary.json` carries the slug→concept mapping TWICE: each
concept's `raw_slugs[]` (what pack tests validate against, via
`refinery/lib/vocab-coverage.mts`) and a hand-materialized top-level `slug_index`
block (what the Stage-2.5 resolver actually reads — `resolveSlug` never scans
`raw_slugs`). Any session that registers a concept without also mirroring its row
into `slug_index` passes every pack test locally and then aborts master's rebuild
with an Orphan Concept error — visible only at the next paid cascade.

This is not hypothetical: at least 10 `fix(vocab): register X — unblocks master`
commits over the past month (fb99ece6, 6c5b7f4c, caa2cb90, 0a80aefd, ed055aa5,
56259976, 2d6ae41f, 63e84151, 33c97b13, 4f4dde47), plus the Collier sold-median
twin hold on 07/19. A drift audit on 07/19 found the class live even after all
those patches: 5 `env_zip_*` raw_slugs invisible to the resolver (latent orphans),
1 alias-only `slug_index` row not backed by any `raw_slugs`, 0 target
disagreements, 1 deliberate collision (`direction`, path-resolved before the
index is ever consulted).

## Goal

`raw_slugs` becomes the ONE authoring surface. Registering a concept with its
`raw_slugs` is, by construction, full wiring — there is no second block to
remember, so the staleness class cannot recur. Resolution semantics are provably
unchanged (the audit's 0-disagreement result is the proof obligation; a parity
test re-verifies it at implementation time).

## What we're building

1. **`refinery/vocab/derive-slug-index.mts`** — pure `deriveSlugIndex(concepts,
   knownAmbiguous)`: inverts every concept's `raw_slugs` into `slug → concept_id`.
   Slugs in `knownAmbiguous` (today: `direction`, the exported
   `PATH_AMBIGUOUS_SLUGS` set from 2.5-normalize) are excluded — they resolve by
   field path upstream of the index. Any OTHER slug claimed by ≥2 concepts throws
   with the offender list: a genuine collision is an authoring bug and must fail
   loud at load, not silently drop a mapping.

2. **Both loaders derive.** `loadVocabulary()` (`refinery/stages/2.5-normalize.mts`)
   and `loadVocabularySync()` (`refinery/vocab/loader.mts`) assign
   `vocab.slug_index = deriveSlugIndex(vocab.concepts, PATH_AMBIGUOUS_SLUGS)`
   after parse. Every downstream reader — `resolveSlug` step 2, `collectClaims`'
   key set, `conceptForSlug`, the semantic-ledger header — reads the derived map
   unchanged. Injected-vocab test fixtures that hand-build `slug_index` are
   unaffected (derivation lives in the loaders, not the resolver).

3. **JSON migration** (same commit): add `asking_rent_nnn_marketbeat_swfl` to
   `marketbeat_asking_rent_nnn.raw_slugs` (the one alias-only row), then delete
   the entire `"slug_index"` block (~342 lines). The 5 latent `env_zip_*` rows
   are healed automatically by derivation.

4. **Structure-test hardening** (`refinery/vocab/vocabulary-structure.test.mts`):
   - the on-disk JSON must carry NO `slug_index` key (blocks muscle-memory re-adds);
   - closing invariant: every concept's every raw_slug resolves through the REAL
     `resolveSlug` back to its owning concept (`direction` to one of its two
     path-ambiguous owners);
   - `deriveSlugIndex` over the real concepts does not throw.
   The old dangling-target test is superseded (derived targets exist by
   construction) and is replaced by these.

5. **Consumers updated in the same commit:**
   - `.claude/hooks/check-prepush-gate.mjs` `unregisteredLiteralSlugs`: registered
     set = on-disk `slug_index` keys (if any — transition-safe) ∪ every concept's
     `raw_slugs`.
   - `refinery/tools/check-vocab-coverage.mts` + gate-hook remediation text: drop
     the "AND the materialized slug_index" instruction — register `raw_slugs` only.
   - `refinery/stages/2.5-normalize.test.mts`: `_direction_ambiguous` marker test
     replaced by "direction has no literal index row; resolves by path".
   - CONTRIBUTING.md authoring instructions.

## Non-goals

- No resolver behavior change: literal-index precedence over patterns, the
  `direction` path heuristic, and pattern fallback are untouched.
- No pack file edits (a stale comment in freshness-pulse.mts mentioning
  slug_index authoring is left alone — packs are ask-first surface).
- No change to `raw_slug_patterns` handling.

## Verification

- New unit tests for `deriveSlugIndex` (inversion, ambiguous exclusion, collision
  throw, multi-slug concept) written FIRST and red before implementation.
- One-shot parity check (scratchpad): derived map ⊇ old on-disk map minus the
  `_note` marker, with identical targets for every pre-existing key.
- `bun test refinery/vocab` + `bun test refinery/stages/2.5-normalize.test.mts` +
  `bun test refinery/lib/corridor-aliases.test.mts` green.
- `bun refinery/tools/check-vocab-coverage.mts --all` green.
- Live verify (check `slug_index_autoderive_live_verify`): next master cascade
  completes with zero Orphan Concept holds on a newly registered concept.
