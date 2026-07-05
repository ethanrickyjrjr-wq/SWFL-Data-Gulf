# Agent-first campaign engine — handoff index (07/05/2026)

State as of this file: builds 1 (agent-first homepage) and 2 (address spine) are LIVE on prod
(www.swfldatagulf.com — hero + chips + autocomplete verified, suggest/retrieve verified, comps in the
lake feed verified). Master design: `docs/superpowers/specs/2026-07-05-agent-first-homepage-design.md`
(the 5-build ladder + the four-lane research evidence). Operator still owes the prod click-through that
closes `agent_first_homepage_live_verify` and `address_spine_live_verify`.

Hand ONE file below to ONE session. They are ordered by value; 1 and 2 are parallel-safe with each
other; 3 is small and safe beside anything; 4 and 5 are independent.

1. `2026-07-05-build3-lifecycle-sequences.md` — the listing campaign becomes a milestone-fired
   sequence (coming soon → new listing → comps → under contract → just sold). Biggest product step.
2. `2026-07-05-build4-send-hardening.md` — Resend native idempotency + send history. Small,
   high-leverage reliability work with researched patterns already cited.
3. `2026-07-05-vendor-note-steadyapi-reddit.md` — 15-minute docs fix: fold live-verified Reddit
   endpoint quirks into the vendor note before they're forgotten.
4. `2026-07-05-hero-followups.md` — three small gaps build 1/2 deliberately deferred (signed-in
   address carry, Market Update → one-click schedule, social chip surface decision).
5. `2026-07-05-build5-agent-voice-brainstorm.md` — brainstorm-only ticket; produces a spec, not code.

Universal rules for every session (non-negotiable, hooks enforce most):
- Work on main, never create branches. Stage explicit paths only. SESSION_LOG entry before push.
- Push requires the operator's explicit per-push approval (`OPERATOR_APPROVED_PUSH=1` re-run after
  they say push). Never compound commit+push in one command.
- safe-push stashes/pops other sessions' dirty files — after any push, verify their diffs survived.
- Register any NEW build with `node scripts/new-build.mjs <slug> "<label>"` before writing code.
- Never spend paid API credits (LLM, SteadyAPI beyond ~3-call probes, paid dispatches) without the
  operator's explicit go. `*_live_verify` checks are operator-closed, never session-closed.
- Marketing/product copy: never lead with "AI"; always "every number sourced". No subject-property
  value estimates, ever. Verify with `bunx next build`, not bare tsc.
