# C-5 — Read surface: keyless `swfl_reconcile` + deliverable verdict section — **SONNET**

## Goal
Expose verdicts where a user's AI can read them honestly — a keyless read-only MCP tool and a deliverable
section — saying "X verified, Y needs review" and refusing stale numbers.

## Files
- **MODIFY** `app/api/mcp/*` (the tool registry — mirror where `swfl_fetch` is registered) — add a
  **keyless, read-only** `swfl_reconcile` tool: input `{ report_id, label|metric_slug, value,
  freshness_token, zip? }`; runs assertion → `lookupLakeFact` → `reconcileMetric`; returns verdict text.
  NO write, NO key, NO metering.
- **MODIFY** `lib/fetch-brain.ts` (or the deliverable assembler) — render verdicts into a deliverable
  verdict section with the freshness token quoted once.
- **NEW** tests.

## Logic / Invariants
- Tool prose obeys the rules-of-engagement: cite both numbers + sources; `cannot_assert_stale` → "expired
  {date} — cannot assert; pull fresh" (NEVER the number); `out_of_grain` → offer the grain we hold;
  `not_found` → say what we don't have, offer to pull (this also covers the no-TTL-basis/uncataloged case
  — never claim "expired").
- **`swfl_fetch` stays byte-for-byte untouched** (mirror B's hard invariant). `swfl_reconcile` is additive
  and **anonymous** (like `swfl_fetch`) — no `auth.uid` on a keyless call to scope by; per-user scoping
  (via `isMcpConnected`, B-4) applies only on the keyed `swfl_project_*` path.

## Acceptance test
- `swfl_reconcile` on a fresh match → "verified: $X (cited …, as of {token})".
- On a stale metric → refusal + re-pull offer, **no number**.
- On a drift → "ours $Y vs yours $Z, ours fresher" (or `"unknown"` when ours withheld).
- **Error/concurrency:** a garbage `freshness_token` or a missing/uncataloged brain → a clean refusal /
  `not_found`, not a crash; two identical calls → identical output (pure). `swfl_fetch` diff = empty.
