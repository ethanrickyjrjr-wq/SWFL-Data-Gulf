# 04 — PIECE 4: Editing + Live Refresh + Trash  🟡 DRAFT (needs brainstorm)

> ⚠️ SCOPED DRAFT — not an approved design. Run `superpowers:brainstorming` first; write
> `docs/superpowers/specs/<date>-piece4-editing-refresh-trash-design.md`.

## Intent

Make deliverables **live and mutable**. Open a thumbnail → **current data** (not the frozen snapshot). Change a past
deliverable — a section, a color, add/delete a piece, or rebuild it new. And **deleted work is saved for a few days**
somewhere recoverable. This is what turns the cockpit from "see what you built" into "keep working on it."

## Contract

**Depends on (from P1):** `components/ui/Modal.tsx` · `DeliverableModal`/`DeliverableThumbnail`/`DeliverableLanes` ·
`ProjectWorkspace` mount points. **Depends on (existing):** the deliverable build pipeline
(`lib/deliverable/assemble.ts`, `build.ts`, `schedule-recipe.ts`).
**Provides:** rebuild-with-fresh-data (the Emailing lane's live "this week's email" preview becomes real) · deliverable
editing/versioning · soft-delete trash + retention.

## Scope (proposed)

1. **Open-to-current (live refresh).** In `DeliverableModal`, offer "refresh with current data": re-run
   `assembleDeliverable` for that template+items against today's lake, render the result (don't silently overwrite the
   shareable `/p/[id]` — decide: in-place update vs. new version). Frozen `/p/[id]` link semantics must stay intact for
   already-shared links.
2. **Edit a past deliverable.** Change a section / branding color / add or remove an item / regenerate one section.
   Likely a guided edit (adjust items + instruction → rebuild) rather than free-form prose editing, to keep the
   no-invention guarantees (`spec-validator`, lints). Brainstorm the exact edit surface.
3. **Trash / retention.** Soft-delete: `deliverables.deleted_at` (+ a daily sweep that hard-deletes after N days) **or**
   a `trash` table. Same pattern could cover deleted project items. "A few days" = pick the window at brainstorm.

## Reuse / what exists

`lib/deliverable/assemble.ts` (freeze → narrative → insert) · `build.ts` (`gateNarrative`, lints, TTL gate) ·
`schedule-recipe.ts` (`deliverableToScheduleRecipe`) · `app/api/projects/[id]/build/route.ts` · `app/p/[id]/page.tsx`
(`force-dynamic`; re-signs file URLs each view — the place live re-fetch would slot in) · `deliverables.status`
(ready/building/revoked — extend rather than reinvent) · `/api/deliverables/[id]/revoke`.

## Critical guardrails (do not break)

- **No-invention is structural.** Any rebuild/edit must pass `spec-validator` + `facts-only-lint` +
  `inference-bait-lint` + `smoothing-lint` (Brain Factory rule 7). Editing must not become a hole that lets unsourced
  prose in.
- **Frozen-link integrity.** A shared `/p/[id]` is a capability link people already have. Decide explicitly whether
  refresh mutates it or forks a new id; don't surprise an external viewer.
- **Monetization model.** Builds are free forever; **send** is the paywall (memory: `build-monetization-model`). Editing
  is part of build (free); don't gate it.

## Open decisions for brainstorm
- Refresh = mutate `/p/[id]` in place vs. new version id? (Link integrity vs. simplicity.)
- Edit surface: guided (items+instruction→rebuild) vs. section-level regen vs. both.
- Trash: `deleted_at` column vs. `trash` table; retention window; does it cover project items too?
- Emailing-lane "this week's email" preview: render via `lib/email/grounded-report.ts` (sends already pull fresh) — reuse that path for the modal. **May already ship in P1** (see `01-…` §D/decision 5); P4 owns the heavier **Built-lane** open-to-current rebuild.

## Likely key files
`app/project/[id]/workspace/DeliverableModal.tsx` (P1) · `lib/deliverable/assemble.ts` · `lib/deliverable/build.ts` ·
`app/api/projects/[id]/build/route.ts` (+ maybe a new edit/refresh route) · `app/p/[id]/page.tsx` ·
`lib/email/grounded-report.ts` · new `docs/sql/<date>_deliverables_soft_delete.sql`.
