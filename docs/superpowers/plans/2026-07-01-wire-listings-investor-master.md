# Wire active-listings-swfl + investor-zip-swfl into master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — keywords: architecture

**Goal:** Make `master.mts` consume `investor-zip-swfl` and `active-listings-swfl` so their live facts
enter master's synthesis corpus — both brains already build and publish daily but nothing downstream
reads them today.

**Architecture:** Purely additive wiring, no new behavior. Add one `makeBrainInputSource(...)` call per
brain to `sources[]` and one `{ id, edge_type: "input" }` entry per brain to `input_brains[]` in
`refinery/packs/master.mts`. Mirrors the exact pattern already shipped in commit `c1afc357`.

**Tech Stack:** TypeScript (`.mts`), Bun test runner, the refinery pack pipeline (`bun run refinery`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-01-wire-listings-investor-master-design.md` — read it before
  starting; this plan implements it exactly, no scope additions.
- Plain `edge_type: "input"`, never `critical: true`, for both brains (spec's "Why plain input" section).
- `active-rentals-swfl` is OUT OF SCOPE — do not add it. It stays unwired until its own
  `active_rentals_swfl_live_verify` check closes and gets its own follow-up spec.
- No vocab slug changes, no `catalog.mts` changes, no new test files — both brains are already fully
  registered (`refinery/packs/index.mts` imports them, `refinery/packs/catalog.mts` lists them).
- Rebuild with `--target-only` ONLY. Never `pack_id=master --force` (rebuilds all 32 brains — 32 Sonnet
  calls — see CLAUDE.md RULE 1, "GHA rebuild targeting").
- Never `git add -A` — stage `refinery/packs/master.mts` explicitly.
- SESSION_LOG.md entry required before push (hook-enforced).

---

### Task 1: Add both brains to master's `sources[]` and `input_brains[]`

**Files:**
- Modify: `refinery/packs/master.mts:227-262` (the `sources:` array)
- Modify: `refinery/packs/master.mts:277-334` (the `input_brains:` array)

**Interfaces:**
- Consumes: `makeBrainInputSource(id: string)` — already imported at `master.mts:11` from
  `../sources/brain-input-source.mts`. No signature change, just two more call sites.
- Produces: nothing new for other tasks — this is the entire code change.

This is a config-data change, not new logic, so there's no "write a failing test first" cycle in the
usual TDD sense — the existing pack test suite (Task 2) is the test. Make the edit, then prove it via
the target rebuild + Gate 5 pre-push run (Task 2/3).

- [ ] **Step 1: Add `investor-zip-swfl` and `active-listings-swfl` to `sources[]`**

Open `refinery/packs/master.mts`. Find this exact block (currently lines 259-262):

```typescript
    makeBrainInputSource("price-distribution-swfl"),
    makeBrainInputSource("listing-momentum-swfl"),
    makeBrainInputSource("market-temperature-swfl"),
  ],
```

Replace it with:

```typescript
    makeBrainInputSource("price-distribution-swfl"),
    makeBrainInputSource("listing-momentum-swfl"),
    makeBrainInputSource("market-temperature-swfl"),
    makeBrainInputSource("investor-zip-swfl"),
    makeBrainInputSource("active-listings-swfl"),
  ],
```

- [ ] **Step 2: Add both brains to `input_brains[]` with a dated comment**

Find this exact block (currently lines 327-334):

```typescript
    // 2026-07-01: the three-tier market-cadence brains (live-verified,
    // market_cadence_three_tier_live_verify closed) — wired as plain `input`,
    // non-critical, same pattern as seller-stress-swfl/market-heat-swfl: factual
    // reporters that add a caveat when stale but never hold master.
    { id: "price-distribution-swfl", edge_type: "input" },
    { id: "listing-momentum-swfl", edge_type: "input" },
    { id: "market-temperature-swfl", edge_type: "input" },
  ],
```

Replace it with:

```typescript
    // 2026-07-01: the three-tier market-cadence brains (live-verified,
    // market_cadence_three_tier_live_verify closed) — wired as plain `input`,
    // non-critical, same pattern as seller-stress-swfl/market-heat-swfl: factual
    // reporters that add a caveat when stale but never hold master.
    { id: "price-distribution-swfl", edge_type: "input" },
    { id: "listing-momentum-swfl", edge_type: "input" },
    { id: "market-temperature-swfl", edge_type: "input" },
    // 2026-07-01: investor-zip-swfl + active-listings-swfl — both fully built,
    // registered, and publishing daily; this was a pure wiring gap (see
    // docs/superpowers/specs/2026-07-01-wire-listings-investor-master-design.md).
    // Plain `input`, non-critical — both always emit direction: "neutral",
    // magnitude: 0 (skipSynthesisAgent, deterministic reporters), so this cannot
    // skew master's direction vote regardless of edge_type. active-rentals-swfl
    // deliberately NOT included — held on its own open live-verify check.
    { id: "investor-zip-swfl", edge_type: "input" },
    { id: "active-listings-swfl", edge_type: "input" },
  ],
```

- [ ] **Step 3: Confirm the edit compiles**

Run: `bunx tsc --noEmit -p refinery/tsconfig.json 2>&1 | grep master.mts`
(If `refinery/` has no dedicated tsconfig, use the repo root one: `bunx tsc --noEmit`.)
Expected: no output (no errors referencing `master.mts`).

- [ ] **Step 4: Commit**

```bash
git add refinery/packs/master.mts
git commit -m "feat(master): wire investor-zip-swfl + active-listings-swfl (plain input)

Both fully built/registered/publishing already - pure wiring gap. Mirrors
c1afc357's market-cadence pattern. active-rentals-swfl deliberately held
out pending its own open live-verify check.

See docs/superpowers/specs/2026-07-01-wire-listings-investor-master-design.md"
```

---

### Task 2: Target-rebuild master and verify both upstreams land

**Files:**
- None modified — this task runs the pipeline and inspects its output.

**Interfaces:**
- Consumes: the `master` `PackDefinition` from Task 1 (now with 2 extra `sources[]`/`input_brains[]`
  entries).
- Produces: a rebuilt `brains/master.md` for Task 3's Gate 5 run to validate against, and the evidence
  Task 3 needs to close the tracking check.

- [ ] **Step 1: Run the target-only rebuild**

Run: `bun run refinery -- master --target-only`

This rebuilds ONLY `master` (plus nothing else, since `--target-only` skips the full cascade) reading
the live current output of every upstream, including the two new ones. Expected: exits 0, no thrown
errors resolving `investor-zip-swfl` or `active-listings-swfl` (a missing/misspelled brain id throws at
this step — that's the primary failure mode this step exists to catch).

- [ ] **Step 2: Confirm both new upstreams appear in master's rebuilt corpus**

Run: `grep -c "investor-zip-swfl\|active-listings-swfl" brains/master.md`

Expected: a non-zero count. If zero, the rebuild silently didn't pick up the corpus summary for either
brain — stop and check `refinery/packs/master.mts`'s `masterCorpusSummary` function reads
`BrainInputNormalized` generically (it should — it maps over `allFragments` with no id allowlist) rather
than re-debugging the wiring itself.

- [ ] **Step 3: Confirm master's own direction/magnitude are unchanged**

Run: `grep -A2 "^direction:\|^magnitude:" brains/master.md | head -6`

Expected: master's top-level direction and magnitude match what they were before this change (check
`git diff brains/master.md` — the only diff should be in the corpus/sources list and any new caveats
attributable to the 2 new brains, NOT a changed direction or magnitude value). This is the concrete
proof that the "magnitude 0 can't skew the vote" claim in the spec holds in the live rebuild, not just
in the code read.

- [ ] **Step 4: Do NOT commit `brains/master.md` from this local rebuild**

This local target-rebuild is for verification only. The live brain artifact ships from the scheduled
GHA rebuild (per CLAUDE.md: "Local refinery build overwrites brains/*.md — use --target-only to avoid
clobbering parallel sessions", and the artifact is regenerated on the next cron cycle regardless). Run:

```bash
git checkout -- brains/master.md
```

to discard the local rebuild output before moving to Task 3, so it doesn't ride along in the same
commit as the code change.

---

### Task 3: Gate 5 pre-push verification + push

**Files:**
- None modified — this task runs the existing test suite and pushes.

**Interfaces:**
- Consumes: the committed change from Task 1.
- Produces: nothing further downstream; this is the terminal task.

- [ ] **Step 1: Run the catalog-mirror + master pack test suite directly (pre-empt Gate 5)**

Run: `bun test refinery/packs/catalog.test.mts`

Expected: all green. This is the same test Gate 5's pre-push hook (`.claude/hooks/check-prepush-gate.mjs`)
runs automatically on any `refinery/packs/**` push — running it here first surfaces failures before the
push attempt.

- [ ] **Step 2: Append the SESSION_LOG entry**

Add a new entry at the TOP of `SESSION_LOG.md` (never rewrite past entries):

```markdown
## 2026-07-01 (main) — feat(master): wire investor-zip-swfl + active-listings-swfl

Implemented docs/superpowers/plans/2026-07-01-wire-listings-investor-master.md (spec:
docs/superpowers/specs/2026-07-01-wire-listings-investor-master-design.md). Added both brains to
master.mts sources[]/input_brains[] as plain `input`, non-critical - mirrors c1afc357's
market-cadence pattern exactly. Both were fully built/registered/publishing already; pure wiring
gap. active-rentals-swfl deliberately excluded, pending its own open active_rentals_swfl_live_verify
check. Target-rebuilt master (--target-only): both new upstreams' facts confirmed in the corpus,
direction/magnitude unchanged from pre-change baseline (grep-diffed brains/master.md before
discarding the local rebuild). Gate 5 (catalog.test.mts) green.
```

- [ ] **Step 3: Push**

Run: `node scripts/safe-push.mjs`

Before running it, check for foreign unpushed commits first (memory: "safe-push carries foreign
commits — check for them first"):

```bash
git log origin/main..HEAD --oneline
```

If commits other than this task's 2 (the `master.mts` wire + the `SESSION_LOG.md` entry) appear, they
belong to a different session — do not attempt to fix, revert, or hold them; `safe-push.mjs` will push
whatever is on `main`, same as any other push. Flag it in the push confirmation to the operator rather
than resolving it yourself.

- [ ] **Step 4: Close the tracking check with live evidence, not code review**

Run: `node scripts/check.mjs close wire_listings_investor_master_live_verify`

Only run this AFTER Task 2's rebuild evidence exists (the grep counts from Task 2 Steps 2-3) — per the
standing rule that `public.checks` entries are closed on prod evidence, never on "the code looks
right."

## Follow-up (not this plan)

`active-rentals-swfl` wiring is a near-identical 2-line change once `active_rentals_swfl_live_verify`
closes — write it as its own spec + plan when that happens, don't retrofit it into this one.
