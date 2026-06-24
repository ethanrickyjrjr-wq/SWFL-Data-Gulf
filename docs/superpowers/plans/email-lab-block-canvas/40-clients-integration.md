# TASK 40 — Client integration (both Email Lab clients)   🔵 OPUS

**Wave:** 4 · **Depends on:** 33, 12, 21 · **Parallel-safe with:** nothing (modifies LIVE files)
**Owns (only edit these — two SEPARATE files → parallel-safe, but keep them in lockstep):**
- `app/email-lab/EmailLabClient.tsx`  *(modify)*
- `app/project/[id]/email-lab/ProjectEmailLabClient.tsx`  *(modify)*

## Build
Swap the iframe preview for the block canvas in both clients. They are near-identical twins — **do the standalone first, then mirror to the project one** (or same agent does both) so they don't drift.
- Replace `<EmailPreviewFrame srcDoc={html}>` with `<BlockCanvas>` (Task 33).
- State: `EmailDoc` + `DocHistory` (Task 11) instead of `tokens`/`html`; `selectedBlockId`.
- Left panel: keep AI prompt + brand color fields (→ `globalStyle.primaryColor/accentColor`) + Export/Export-PDF; **repurpose `TEMPLATES` as the "Start from" seed picker** (→ `default-docs`); when a block is selected, show `BlockInspector` (Task 31).
- AI button → POST `/api/email-lab/ai` (Task 12) with `{ prompt, doc, scope }`; apply the validated content patch.
- Export → POST `/api/email-lab/render` (Task 21) with `{ doc }`.
- **Project client only:** keep the existing project scope → lake fetch unchanged.

These are the files at risk of colliding with other email-lab work — if anyone else is mid-flight on them, use a worktree (RULE 1.5).

## Acceptance
- `bun test` + `bunx next build` green. Both routes: seed → canvas paints; AI fills content (colors untouched); edit/add/delete/undo; Export HTML + PDF still work. No `EmailPreviewFrame` import remains on these pages (it stays on `/p/[id]`).

## Isolation
The two client files only. Do not touch canvas/blocks/routes here — those are done. This is the last editor step before drag.
