---
name: refactor
for: a behavior-preserving change to structure — rename, extract, dedupe, move, consolidate two things into one root
---
### Refactor

**You own byte-identical behavior.** The diff proves structure changed and output did not.

1. Blast radius first: graph `graphify_impact` / `graphify_callers` on every symbol touched; state the consumer count with the commitSha (RULE 0.5). "No edge found" is not proof of no relationship.
2. One authority per concept: if two implementations exist, pick the root, migrate every caller, delete the legacy in the SAME wave — never leave both (memory: shared-concept-one-authority).
3. Capture the before: run the existing tests / render the acceptance script / snapshot the output BEFORE touching code, so "byte-identical" is measured, not asserted.
4. Extend existing seams; never erect a new mandatory pre-materialization gate on the data pipeline (RULE 3 C2).
5. More than 5 files → ASK-FIRST (RULE 1). Anything touching live `/api/b/*` or the MCP surface → ask-first.
6. Moving or deleting files → `second-order` agent BEFORE the move (FOCUS 12: propagation, consumers, latency, evidence class, lifecycle). Never remove a worktree under a live parallel session.
7. Re-run the before capture; the diff must be empty (or the delta named line by line).
8. `graphify update .` after the change so the graph stays current.

**Rules carried:** RULE 0.5 blast radius · RULE 1 (>5 files, live surfaces) · RULE 3 C2 · one-authority · FOCUS 12 before move/delete.

**Reply:** symbols touched with consumer counts, the before/after capture diff (empty or explained), file count vs the ask-first threshold.
