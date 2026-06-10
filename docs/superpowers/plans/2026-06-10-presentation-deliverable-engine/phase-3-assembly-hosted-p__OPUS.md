# Phase 3 — Assembly engine + hosted `/p/[id]` · OPUS · SERIAL, single owner (critical path)

> **Contract (inherited):** own ChartSpec registry; deliverable = hosted `/p/[id]` FIRST, PDF later is
> the SAME project; per-visual as-of on every frame; NO `git push` — Ricky pushes. **This is the
> critical-path engine — one owner; do not fan out.**

## Why
This is the paid deliverable: the operator (or the AI on their instruction) assembles ordered frames +
narrative into a shareable hosted page. This is also where **live brain data binding is first proven**
(Phase 0 was render-only on fixtures — FLAG-2).

## Depends on
Phase 1 (asOf) + Phase 2a (`ChartSpec`/`FrameRenderer`). Prefer Phase 2g + at least the existing
registered frames available.

## Composes into the flywheel
This build + Phase 5 = the **"Listing PDF maker"** (LOCKED primary use case): a named template + one
ZIP/address → auto-bind every frame from live brains → `/p/[id]` + PDF, one command. Keep the bind step
re-runnable for a new place with no rebuild of the engine — Phase 5 calls straight into it.

## Task
- **3a — `POST /api/projects/[id]/build`:** compose the project's ordered frame-specs, **bind LIVE
  brain data** for each (fetch the brain's `BrainOutput`, pull the rows the frame needs), **stamp each
  frame's `asOf`** from its source freshness, run the deterministic jargon scrub (reuse the speaker /
  `sanitizeProse` path for prose — NOT for the as-of/citation provenance, FLAG-3), and persist the
  composed project. Honor `docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md`
  (Amendments A1–A8) + the Projects spine in `lib/project/items.ts`.
- **3b — `app/p/[id]/page.tsx`:** public page rendering the composed frames via `FrameRenderer` as a
  branded, interactive, shareable page. Each frame shows its own as-of caption.
- **3c — RLS:** first `auth.uid()` policy on the **app-generated** projects/charts tables.
  **CONCERN-2 — put this comment on the policy:** *"App-table scoped only. Does NOT reopen the parked
  Row-tier tenancy decision (tenancy seam = payload-assembly edge, not Postgres RLS; deferred until the
  asset-management brain un-parks)."* Run the migration directly (creds in `.dlt/secrets.toml`,
  idempotent SQL); verify row counts.
- **AI-directed editing:** "add / swap / move / remove" map to list edits on the project's ordered
  frame array — implement the mutation surface the assembly engine reads.

## SUB-DECISION to surface to operator (don't assume)
`/p/[id]` sharing model: **public link (anyone with URL views)** vs **gated/expiring link**. Flag it;
default to public-unguessable-id if no answer, and note it in SESSION_LOG.

## Acceptance
- Build a project via `POST /api/projects/[id]/build`; open `/p/[id]`; **multiple frames render with
  LIVE data + per-visual as-of dates.**
- RLS: a second user cannot read another's project rows.
- `tsc --noEmit` clean; route + page have tests where practical.

## Wrap
- Commit locally. SESSION_LOG + build-queue (`/p/[id]` item → `[~]`/`[x]`). Update README status row 3.
  **No push.**
