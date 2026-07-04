# 16 — Make a check un-closeable without live prod proof (P1)

- **Status:** ⬜ Not started — **brainstorm/plan first (RULE 3.5)**
- **Owner:** SESSION (plan) → likely answer-engine-guardian / infra
- **Source:** autopsy §9.1 + §10

## What

The single highest-leverage change — cultural + mechanical. The real backlog is ~34 built-but-never-run
checks, not "build more." Make a check **un-closeable without a live prod proof** (a real HTTP/DB
assertion, not self-reported JSON — the current `answer-fix-proof` gate is honor-system). This is the
structural fix for "nothing gets finished."

## Why it's a plan, not a quick edit

Touches the checks mechanism (`scripts/check.mjs`, `public.checks`) + the answer-fix-proof gate. Per
C2 (architecture discipline), check whether existing seams extend before erecting a new mandatory
gate. Brainstorm + write a plan before code.

## Steps

1. `superpowers:brainstorming` — what "live proof" means per check type (HTTP 2xx, DB row exists, etc.).
2. Register the build: `node scripts/new-build.mjs <slug> "<label>"`.
3. Design: close requires a stored assertion result tied to a real call, verified at close time.

## Done when (live proof)

- Attempting to close a check with fabricated/absent proof is **rejected**; a close with a real
  HTTP/DB assertion succeeds. Demonstrated on one real check end-to-end.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
