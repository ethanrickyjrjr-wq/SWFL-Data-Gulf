# Email builder shared supply/design contract (M1)

**Date:** 2026-07-08
**Part of:** the email-builder integration system (plan: fences as bounds of a design space,
not one look). This is M1 — the "nothing forgotten" spine. Fences (M2), recipes/saveable
brand (M3), and charts/widgets (handoff) build on top of it.

## Problem

The knowledge of "what blocks exist, which the AI may author, which the user may add, which
accept a band" was duplicated across four places that drift independently:

- `author-doc.ts` `KNOWN_TYPES` = `new Set(Object.keys(DEFAULT_BLOCK_PROPS))`
- `build-doc.ts:922` author vocabulary = `Object.keys(DEFAULT_BLOCK_PROPS).filter(!== "metric-card")`
- `author-doc.ts` `BANDABLE` = a hand-listed set of 8 types
- `AddBlockPanel.tsx` `BLOCK_MENU` = a hand-listed 15-entry user palette

Add a block type and you must remember to touch all four (plus the `BlockType` union +
`DEFAULT_BLOCK_PROPS`). This is exactly the "gets half-built and forgotten" failure the
integration work targets — and the enforcement point the fence research needs (a single
contract the AI author, the user menu, and the validators all obey).

## Goal

One registry, one entry per `BlockType`, that every block-vocabulary consumer derives from —
behavior-neutral on landing (encodes today's rules exactly), so M2 can tighten rules in one
place and every surface picks them up.

## What we're building

`lib/email/doc/block-contract.ts` — `BLOCK_CONTRACT: Record<BlockType, BlockContractEntry>`.
Each entry (M1 fields): `authorable` (in the AI vocabulary — false only for data-seeded
`metric-card`), `bandable` (accepts a semantic band), and optional `menu {label, icon}`
(present iff user-addable; absent for `metric-card` + builder-seeded `sources`).

Entries are listed in `DEFAULT_BLOCK_PROPS` insertion order so filtered derivations reproduce
the pre-converge lists **byte-for-byte** (the only skipped menu entries — `metric-card`,
`sources` — are precisely the non-user-addable ones, so both the vocabulary order and the
menu order fall out for free). Derived exports:

- `KNOWN_BLOCK_TYPES` (Set) → replaces `author-doc.ts` `KNOWN_TYPES`
- `AUTHORABLE_TYPES` (ordered) → replaces `build-doc.ts` vocabulary
- `BANDABLE_TYPES` (Set) → replaces `author-doc.ts` `BANDABLE`
- `BLOCK_MENU` (ordered) → re-exported through `AddBlockPanel.tsx` (existing import path preserved)

Default props stay in `default-docs.ts` (`DEFAULT_BLOCK_PROPS`); the contract owns the
*behavioral* metadata, not the placeholder content.

## Why not fold in CHART_REGISTRY now

`CHART_REGISTRY` is already a single source of truth for chart frames with a different shape
(frame component + `accepts`). Charts are a handoff item; folding them in is not needed to kill
the block-vocabulary drift, and doing it now would widen a behavior-neutral refactor into a
riskier one. Deferred to when charts are picked up.

## Verification

- `lib/email/doc/block-contract.test.ts` — freezes the four derived lists against values copied
  verbatim from the pre-converge sources (proves behavior-neutrality). Written test-first (RED
  confirmed on missing module, GREEN after).
- Full `lib/email` suite: 1135 pass / 0 fail. `bunx next build` clean.

## Status (07/08/2026)

- **Done:** contract + test, all four consumers migrated, duplication deleted (net −24 lines).
- **Next (M2):** add `zone` (OPEN/BODY/CLOSE), `allowedSpans`, and photo-ratio/variety-axis
  fields to `BlockContractEntry`; the fence validators in `deriveLayout`/`assembleAuthoredDoc`
  read them. Additive to this contract — no consumer re-plumbing.
