# TASK 00 — Foundation: data layer   🔵 OPUS

**Wave:** 0 · **Depends on:** — · **Parallel-safe with:** nothing (this BLOCKS everything)
**Owns (only edit these):**
- `lib/email/doc/types.ts`
- `lib/email/doc/schema.ts`
- `lib/email/doc/default-docs.ts`

## Build
The shared contract the whole feature keys off — get it right once.
- **types.ts** — `BlockType` (10 types), `EmailBlock { id; type; props }`, `EmailGlobalStyle`, `EmailDoc`. Per-block prop interfaces (see spec → *Block types* table).
- **schema.ts** — zod (`zod@^4`) per-block prop schemas + `discriminatedUnion("type", …)`. Block object carries `id: z.string().optional()`; `.transform(b => ({ ...b, id: b.id ?? "block_"+nanoid(8) }))` so **saved ids persist, new blocks get minted, ids never come from the model.** `EmailDocSchema` = `{ globalStyle, blocks: z.array(Block).min(1).max(20) }`. Export `ContentPatchSchema` (text-props-only, keyed by block id) for the AI route.
- **default-docs.ts** — the "Start from" seed `EmailDoc`s (one per linear template). Props are **optional with sane defaults** — a seed need not fill every field.

Spec sections: *Data model*, *Zod schema*.

## Acceptance
- `bun test` + `bunx next build` green.
- A unit test: `EmailDocSchema.parse(defaultDoc)` round-trips; a malformed block is **rejected** (not coerced); a saved block with an existing id keeps it.

## Isolation
Pure data layer — no React, no imports from `blocks/` or `components/`. Everyone downstream imports FROM here; you import from no one in this feature.
