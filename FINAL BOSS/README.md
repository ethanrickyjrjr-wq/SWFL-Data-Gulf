# FINAL BOSS — Project Workspace → Live Work Environment

> **North star: the Project Page is a live AI workspace — not a file cabinet.** Every action on the platform feeds the
> project AI context, so it's always ready — a partner that already knows what's going on, not a tool you prompt.

This folder is the **single source of truth** for turning `/project/[id]` from a static form into a
**live work environment**: a per-project cockpit with an always-prepared Project AI, deliverables you can
see and open big, situational prompts driven by real signals, and grounded build/edit/email actions.

The work is cut into **4 pieces**. Build them in order. Each piece is independently shippable and leaves
**named seams** the next piece plugs into — read the "Cross-build contracts" in `00-MASTER-PLAN.md` before
touching any piece, because a later build depends on the exact names a earlier build creates.

## Read order

1. **`HANDOFF.md`** — start here if you're a new session. Ultimate goal, current state, repo rules, gotchas.
2. **`00-MASTER-PLAN.md`** — the whole vision, the 4-piece decomposition, sequencing, shared data model, and the **cross-build contract matrix** (what each build exposes / consumes).
3. **`01-piece-1-workspace-shell.md`** — the only piece that is fully planned + verified against the code. Build this first.
4. **`02-piece-2-project-aware-ai.md`**, **`03-piece-3-signal-layer.md`**, **`04-piece-4-editing-refresh-trash.md`** — scoped DRAFTS. Each still needs its own `superpowers:brainstorming` pass before coding (RULE 3.5).

## Status (2026-06-17)

| Piece | Title | State |
|---|---|---|
| 1 | Workspace Shell | ✅ Planned + code-verified — **ready to build** |
| 2 | Project-Aware AI | 🟡 Scoped draft — needs brainstorm |
| 3 | Signal Layer (invisible reporter) | 🟡 Scoped draft — needs brainstorm |
| 4 | Editing + Live Refresh + Trash | 🟡 Scoped draft — needs brainstorm |

## Rules of the road (do not skip)

- **One piece = one brainstorm → spec → plan → build cycle.** Pieces 2–4 are drafts, not approved designs.
- **Honor the contracts.** If you rename a seam (e.g. `projects.ui_state`, `aiContext`, `DeliverableModal`), update `00-MASTER-PLAN.md` in the same commit or you break the next build.
- **This folder is documentation, not status.** Live status lives in the durable trackers (`SESSION_LOG.md`, the `checks` ledger, `_AUDIT_AND_ROADMAP/build-queue.md`) per CLAUDE.md RULE 2.
