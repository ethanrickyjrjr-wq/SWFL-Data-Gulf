# C-6 — Integration tests, green build, ledgers, ship — **SONNET**

## Goal
Prove C works across the lanes end-to-end, update the durable trackers, and land it — with operator
approval at the push gate (C touches the MCP surface + brain-output types + Stage-4 + project items →
"ask for a diff review before pushing", RULE 1).

## Tests (write alongside the code in C-1..C-5)
- **freshness gate** — `expiresFor` exact; `freshnessGate` past/future/garbage (fail-closed).
- **comparator** — one fixture per status; `cannot_assert_stale` leaks no number + `fresher_side:"unknown"`;
  **no-TTL-basis (uncataloged) → `not_found`, not stale**; determinism with fixed `now`.
- **lane bridges** — `resolveMetricSlug` ambiguity → `not_found`; `BRAIN_CATALOG.find` resolves cataloged,
  uncataloged → `expires: undefined`; `fetchDetailRow` bad slug caught → `null`; `toAssertion` kind
  filtering.
- **lint** — flag ON: stale/unsourced → `ttl` violation → regenerate → strip; flag OFF: build.ts
  byte-identical; regression fixtures unchanged; `extractNumbers` import resolves.
- **integration** — lane-2 assertion → `toAssertion` → `resolveMetricSlug` → `lookupLakeFact` →
  `reconcileMetric` → `swfl_reconcile` + deliverable section; every status renders correctly and **no
  stale/invented number ever surfaces.**
- **phantom-data guard** — assert lane-1 reads the real source; a fixture-tagged read never cites a live
  token.

## Green gates (run before pushing)
- FULL `bun test`; `tsc`; `eslint`; `bun run build` clean.
- **Atomic type-lift:** the `BrainOutput.expires?`/`ttl_seconds?` add ships WITH the Stage-4 stamp.
- **Sequencing (B6 — load-bearing):** land C-1..C-3 first; run the **FULL rebuild** so every written
  output carries `expires`; C-4 merges **flag-OFF**. The `RECONCILE_TTL_GATE_ENABLED` flip is a **separate,
  later step** — only after the rebuild + the catalog-gap `not_found` branch are confirmed live.
- **Pre-push gate awareness:** MCP-surface change → RULE 1 "ask for a diff review before pushing". No
  `refinery/packs/**` `--- OUTPUT ---` shape change → Gate 5 N/A; no destructive ingest write → Gate 4 N/A.

## Ledgers (same push)
- `SESSION_LOG.md` — new top-of-file entry.
- `_AUDIT_AND_ROADMAP/build-queue.md` — mark the Reconciliation Engine item `[~]`/`[x]`.
- `scripts/check.mjs` — open `reconciliation_engine_live_verify` (prod evidence: a real assertion →
  `swfl_reconcile` returns the correct verdict live; the stale case refuses the number). Open
  `reconcile_ttl_gate_flip` (flip `RECONCILE_TTL_GATE_ENABLED` ON only after the full rebuild + catalog-gap
  fix are live) and `reconcile_live_lane1_rewire` (phantom-data-guarded live freshness-pulse wiring when
  daily files 01+03 land — the check must ALSO assert (a) `freshness-pulse` has a `BRAIN_CATALOG` entry
  with `ttl_seconds`, and (b) a known-fresh daily metric returns `verified`, NOT `not_found`, so a
  forgotten catalog entry cannot silently degrade every daily lookup to `not_found` — R3).

## Push
- Stage **only** C's files (explicit paths; never `git add -A` — RULE 1.5).
- `node scripts/safe-push.mjs` **after** the operator approves the diff (no autonomous push; Ricky pushes).

## Acceptance test
- All gates green; live verification passes (verdict correct; stale case refuses the number; uncataloged →
  `not_found` not stale); ledgers reconciled; push approved + landed on `main`.
