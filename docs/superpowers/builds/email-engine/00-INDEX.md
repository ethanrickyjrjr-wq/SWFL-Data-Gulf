# Email Lab Engine — Build Index

- **Branch:** `email-lab-engine`
- **Plan:** `~/.claude/plans/abundant-dazzling-tome.md`
- **Free-tier map:** `docs/email-lab/BUILDER-GUIDE.md`
- **Research:** `docs/superpowers/specs/2026-06-28-email-lab-ai-design-research.md`

**Governing rule:** PAID = strict SUPERSET of free. Inherit everything, downgrade nothing, add on top. Verify every build with `bunx next build` (not bare tsc). Nothing pushed without operator confirmation.

## DAG — order · model · parallel group

**Group 0 — start now (parallel):**
- `01 doc-contract` — **Sonnet** — deps: none
- `04 save-photo` — **Sonnet** — deps: none

**Group 1 — after 01 (parallel):**
- `02 compile-grid` — **Opus** — deps: 01
- `03 author-engine` — **Opus** — deps: 01
- `05 listing+multicol blocks` — **Sonnet** — deps: 01
- `G1 GridCanvas` — **Sonnet (OPERATOR)** — deps: 01

**Group 2 — after deps (parallel):**
- `06 templates` — **Sonnet** — deps: 01, 05
- `G2 block-toolbar` — **Sonnet (OPERATOR)** — deps: G1
- `G3 photopea-modal` — **Sonnet (OPERATOR)** — deps: 04
- `G4 wire-shell` — **Sonnet (OPERATOR)** — deps: G1, 03

**Independent track:**
- `07 asset-factory` — **Sonnet (ingest)** — deps: none — GHA only, not Vercel

## File-contention chokepoints (do NOT run in parallel on the same tree)
- `doc/types.ts` + `doc/schema.ts` — touched by 01, 03 (author schema), 05 (block schema). **01 lands first; 03 and 05 serialize on `schema.ts`** (or the main thread owns the shared schema hunk).
- `components/email-lab/EmailLabShell.tsx` — G4 only.
- `components/email-lab/CanvasBlock.tsx` — G1 + G2 serialize.

## Ownership
- **Engine** (01, 02, 03, 04, 05, 06, 07): this agent.
- **Grid** (G1, G2, G3, G4): **OPERATOR**.

## Status
- [x] 01 doc-contract — **DONE**, `bunx next build` green (branch `email-lab-engine`)
- [ ] 02 compile-grid — in progress (Opus)
- [ ] 03 author-engine
- [ ] 04 save-photo
- [ ] 05 listing+multicol blocks
- [ ] 06 templates
- [ ] 07 asset-factory
- [ ] G1 GridCanvas (operator)
- [ ] G2 block-toolbar (operator)
- [ ] G3 photopea-modal (operator)
- [ ] G4 wire-shell (operator)
