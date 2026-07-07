# Retire block email shell (grid-only, park classics)

**Date:** 2026-07-07
**Build check:** `retire_block_shell_live_verify`

## Problem

Two email-authoring shells have coexisted for weeks doing nearly the same job:

- `EmailLabGridShell` — the 2D grid canvas + whole-email AI author ("the north star").
- `EmailLabShell` — the linear "block canvas" (free-tier) shell.

Nothing forces them to stay in sync. A phone-layout fix landed in the grid shell on
2026-07-05 (commit `5e98ce63`) but never reached the block shell, so on 2026-07-07 the
block shell still served an unconditional desktop two-column grid (`grid-cols-[1fr_380px]`,
no breakpoint) that crushed the email into a ~50px sliver on a phone. This is the exact
divergence trap the 06/29 "unified" spec tried to head off with a shared panel that was
never extracted.

The block shell was **decided to retire three times** (06/29 unified spec kept it pending a
shared panel; 07/02 cockpit spec §D4 scheduled the standalone pages to die in Phase 2;
07/03 operator ruling reaffirmed grid-as-crown-jewel) but **never actually deleted** — git
shows one creation commit and zero deletions. Phase 2 (the part that removes it) never ran.

## Goal

One email authoring surface — the grid — everywhere (anonymous + in-project cockpit). Remove
the block *editor* without breaking the rendering or sending of any `template:"block-canvas"`
deliverable already saved in the database. Preserve the legacy "classic templates" catalog on
the side (dormant) for a possible future free-tier revival.

## Non-obvious blocker (why order matters)

`applyBrand` is **exported from** `EmailLabShell.tsx` and imported by both `EmailLabGridShell`
(`./EmailLabShell`) and `ProjectSocialClient` (`@/components/email-lab/EmailLabShell`). The
file cannot be deleted until that shared function moves to a neutral home. So the relocation
lands first, as its own behavior-neutral commit (clean revert if anything downstream trips).

## Blast-radius audit (verified against code 2026-07-07)

- **`applyBrand`** — shared export in the doomed file → must relocate first.
- **`BlockCanvas`** (component) — imported **only** by `EmailLabShell`. The `BlockCanvas`
  strings in the grid files are comments; `isBlockCanvas` elsewhere is an unrelated boolean
  keyed on `template === "block-canvas"` (the send/contact-picker path) and **stays**.
- **`CanvasBlock`** — imported only by `BlockCanvas`. Deletable with it.
- **`refCode`** — anonymous `EmailLabClient` passes it to the shell, but `EmailLabShell`
  **never reads it** (dead prop today). No real loss; the redirect still carries `?ref`.
- **`classicTemplates` capability** (`capabilities.ts`, `"free-only"`) — read **only** by the
  block shell. Retires with it.
- **Classic templates** — a preview-only rail of 12 legacy templates. The modules live under
  `lib/templates/` and are rendered server-side by `POST /api/email-lab/render` via the
  `{template, tokens}` path, which is **kept** (it also renders saved block-canvas docs). Only
  the block shell's UI catalog (`CLASSIC_TEMPLATES`) + `renderLegacyHtml` helper die with the
  file; they are **parked**, not deleted. The template modules stay resolvable.
- **`template:"block-canvas"` deliverables** — threaded through blast/pdf/render/materials
  routes for already-saved docs. **Untouched.** Deleting the editor must not break send/render
  of existing saved emails. Guarded by a new test.

## Approach (chosen: relocate-then-delete, keep renderer)

Rejected alternatives: (B) also purge `block-canvas` from send/render — breaks existing saved
deliverables; (C) soft-hide the toggle but leave the files — leaves the exact divergence corpse
that caused the bug.

## Change set

1. **Relocate `applyBrand`** → `components/email-lab/apply-brand.ts` (its own root). Repoint
   `EmailLabGridShell` and `ProjectSocialClient`. Behavior-neutral. **Commit 1.**
2. **Park classic templates** → `components/email-lab/parked/classic-templates.ts`: the
   `CLASSIC_TEMPLATES` manifest + a `renderLegacyHtml` helper, with a dormant header noting the
   render route still resolves the ids and a future free-tier revival imports from here. Not
   imported by anything live.
3. **Cockpit → grid-only** (`ProjectEmailLabClient`): drop the "Switch to block/grid canvas"
   toggle and the `canvas === "grid" ? <Grid> : <Block>` branch; always render the grid shell.
4. **`canvas-pref.ts`** — collapse `EmailCanvas`/`emailCanvasPref` so any stored `"block"`
   resolves to `"grid"`; update `canvas-pref.test.ts`.
5. **Anonymous door → grid** (`app/email-lab/page.tsx`): the anonymous branch redirects to
   `/email-lab/grid` carrying `?zip/addr/recipe/recipeNeeds/ref`. Signed-in path
   (`signedInLabArrival` → cockpit) unchanged. Delete the now-dead `EmailLabClient.tsx`.
6. **Delete** `EmailLabShell.tsx`, `BlockCanvas.tsx`, `CanvasBlock.tsx`. Retire the
   `classicTemplates` capability field + its test expectations.
7. **Backward-compat test** — a saved `template:"block-canvas"` doc still renders through the
   preserved render path and is send-eligible.
8. Clean any remaining tests referencing the deleted components. **Commit 2** (steps 2–8).

## Acceptance criteria

- Only the grid shell authors email, on every surface (anonymous + cockpit).
- Old `block-canvas` deliverables still render, PDF, and send.
- **Phone == web on the grid shell**: single stacked pane + ✦ Build / Preview tab bar below
  `lg`, split-pane at `lg+`. Verified in a phone-width browser + desktop as the final step.
  (With one shell there is nothing left to diverge from — the consolidation is the fix.)
- `next build` green; `capabilities.test.ts` invariant green; `canvas-pref.test.ts` green.
- Classic templates preserved on disk (dormant), not lost.

## YAGNI

No migration of old block docs to grid layout (they render fine linear). No send-route rewrite.
No socials changes beyond the `applyBrand` move. No new "divergence-guard" test theater — a
plain responsive test on the one surviving shell is enough.

## Ship discipline

Two commits (relocate, then retire). `next build` after each. Phone-width browser check last.
SESSION_LOG entry + build-queue sync in the retirement push. Commit, show `git log`, **ask
before pushing to main** — "do whatever you have to do" authorizes the work, not the push.
