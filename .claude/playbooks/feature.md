---
name: feature
for: new or changed behavior — a page, email, brain pack, guard, hook, script, or any build the operator asked for
---
### Feature

**You own the build end to end.** Counted parts, proven completion, nothing built dark.

1. Research before design: `_RESEARCH/INDEX.md`, then the `what-do-we-have` skill — the answer is often already written (RULE 0.4). Vendor surfaces (MIME, endpoint, SDK, model id) are verified by crawl4ai IN-SESSION, never from a plan or memory (global rule 1).
2. `superpowers:brainstorming` unless the operator said "Change Storming" (RULE 3.5). Every design names its failure modes, each paired with the guard that stops it.
3. Register: `node scripts/new-build.mjs <slug> "<label>"` — spec stub + live-verify check, before code.
4. Data in the build → `docs/standards/data-roots.md` first; missing root → ADD a root, never a second table (RULE 0.55). Numbers follow the ladder: our free data → paid row already bought → one paid field behind the spend switch → labelled open slot (RULE 0.7a). Prose: baked before a live model call (RULE 0.7b).
5. Extend an existing seam (BrainOutput, spec-validator, Stage-4 lints, cadence_registry, the keyed one-root registries) — never a new mandatory gate on the data pipeline (RULE 3 C2). Two placements of the same function → the keyed registry pattern, not a menu for the operator.
6. Write the enumerated N parts before starting (RULE 0.8 §1). Test first per deterministic unit (RULE 3.5 TDD).
7. Area conventions: read the nearest `CLAUDE.md` on entering `ingest/`, `refinery/`, `lib/email/`, `app/api/`, etc. In-app pages use the `one-room` skill; emails start at `docs/standards/email-build-playbook.md`.
8. Wire the consumer in the same pass — a thing built beside the system and never connected is the documented failure (memory: built-not-wired). Dark root → consumer or a check.
9. RENDER IT AND LOOK: the `verify` skill / `bunx next build` — a green suite is not evidence for a rendered artifact.
10. `second-order` agent before declaring done (FOCUS 12). Report n of N with the names of parts NOT done (RULE 0.8 §2). Route to `ship`.

**Rules carried:** global rule 1 (vendor first) · RULE 0.4 · RULE 0.55 · RULE 0.7a/0.7b · RULE 0.8 · RULE 3 C2 · RULE 3.5 · twin-failure registry pattern.

**Reply:** n of N parts with names of the undone, the render/build evidence pasted, the check key opened, what needs the operator (ask-first items).
