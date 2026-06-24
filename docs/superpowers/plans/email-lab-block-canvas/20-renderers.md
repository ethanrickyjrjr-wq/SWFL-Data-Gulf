# TASK 20 — Renderers (BlockRenderer + EmailDocRenderer)   🟢 SONNET

**Wave:** 2 · **Depends on:** 10 (all 10 blocks exist) · **Parallel-safe with:** 30/31/32 only if they don't need 20 yet (30 does → 20 first)
**Owns (only edit these):**
- `lib/email/blocks/BlockRenderer.tsx`
- `lib/email/blocks/EmailDocRenderer.tsx`

## Build
- **BlockRenderer.tsx** — `switch (block.type)` → the matching block component from Task 10, passing `{ props, globalStyle }`. Pure, no `"use client"`.
- **EmailDocRenderer.tsx** — `<EmailDocEmail doc>` wraps `doc.blocks.map(BlockRenderer)` in `Html > Body > Container` (maxWidth 600px). Pure. Spec → *Rendering strategy* (copy the sample). Used by the render route via `await render(<EmailDocEmail doc={doc} />)`.

## Acceptance
- `bunx next build` green. A test renders a `default-docs` doc to an HTML string (`render()` is async) and asserts it contains expected block markup.

## Isolation
The integration/join point for Task 10's 10 files — build it after they land. Two files, both pure.
