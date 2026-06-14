# Phase 5 — Templates (the flywheel) · SONNET · parallel-ok with Phase 4

> **Contract (inherited):** own ChartSpec registry; per-visual as-of; NO `git push`. Depends on
> **Phase 3** (needs the persisted project = ordered frame list).

## Why
The speed advantage / repeat usage. A project is already an ordered list of frame-specs + bindings;
a **template** is that list with place/scope **parameterized out**, re-bound on demand. Near-free.

## PRIMARY USE CASE (LOCKED) — the "Listing PDF maker"
A saved template = pre-wired frame order (flood risk → market comps → rent trajectory → cap-rate
context). User input = **one ZIP or address**. System binds all frame data from live brains, stamps
per-visual `asOf`, builds `/p/[id]` + PDF. This is **Phase 3 + Phase 5 together — no new engine.**
The flywheel: every new listing = one command = one client-ready deliverable; the template accumulates
value across sessions. Build the template surface so this case is one call.

## Task
- Define a `ProjectTemplate` = the project's ordered `frameId` list + each frame's binding **with the
  place/scope (ZIP / corridor / county) replaced by a parameter slot**.
- "Save as template" from a built project: strip the concrete place, keep the frame structure + options.
- "New project from template": prompt for the place/scope, re-run Phase 3's bind step for the new place,
  re-stamp each frame's `asOf` from the freshly-bound source (do NOT carry the old date — re-binding =
  new vintage).
- Persist templates (same app-tables RLS scope as Phase 3c — app-table scoped only, NOT Row-tier).
- **User-facing "run template" invocation (LOCKED requirement):** a **named template ID** the user
  calls with a single **ZIP or address** input → the system instantiates Phase 3's build for that place
  and returns the `/p/[id]` + PDF. This is the listing-PDF flywheel's one-command surface. Trivially
  cheap once Phase 3 + Phase 5 exist — no new architecture, just wire the named-template → bind → build
  path.

## Acceptance
- Build a project for ZIP A → save as template → instantiate for ZIP B → frames re-bind to B's data with
  B's `asOf` dates (proven by a test or live run).
- `tsc` clean; template (de)serialization round-trips.

## Wrap
Commit locally. SESSION_LOG + build-queue. Update README status row 5. **No push.**
