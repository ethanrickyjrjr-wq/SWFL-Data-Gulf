# 16 — Make a check un-closeable without live prod proof (P1)

- **Status:** 🟡 Phase 1 BUILT (2026-07-05, held for push + migration) — proof-gated `close` (CLI runs the stored
  signal live) + `checks_require_proof` DB trigger + `proof jsonb` column + signal-runner. Spec:
  `docs/superpowers/specs/2026-07-05-uncloseable-check-proof-design.md`, plan:
  `docs/superpowers/plans/2026-07-05-uncloseable-check-proof.md`. Check `uncloseable_check_proof_live_verify` open
  (operator-run). **Migration `docs/sql/20260705_checks_proof_gate.sql` NOT applied** — operator runs it (touches a
  shared prod table; verify the swfldatagulf-ops close path first). Do NOT flip ✅ until live-verify closes.
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
