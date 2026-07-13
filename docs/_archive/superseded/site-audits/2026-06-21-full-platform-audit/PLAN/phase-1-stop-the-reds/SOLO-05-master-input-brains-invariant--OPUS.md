# 05 — master `sources[]` ⇆ `input_brains[]` load-time invariant — **RUN ALONE**

**Model: Opus.** **SOLO — do not run inside the Phase-1 `run-together/` group.** **Priority: P1.**

## Why SOLO + Opus
This adds a **module-load `throw`** to `refinery/config/packs.mts`. If the check is too strict it throws at
import time and **breaks every build's ability to even load** — including the verification of any concurrent
build. So it runs alone and is verified in isolation (confirm a normal build still loads + a deliberately
broken pack still throws the right message). Opus because the blast radius is "all builds" and the
correctness of the predicate matters more than the few lines of code.

## The defect (verified)
The DAG resolver walks **only** `input_brains` (`refinery/lib/dag.mts:49`; `.sources` is never consulted).
A brain listed in master's `sources[]` but absent from `input_brains[]` is **fetched-but-never-built** →
deterministic master HOLD (`<brain>.md not found`). This has been hand-reconciled twice (672180c; the
2026-06-18 flap). **There is no automated gate enforcing parity.** Today the two lists ARE mirrored
(verified: both **30** entries, identical ID sets — note: the audit said 31; it's 30) — so this is
*preventive*, locking in the current good state.

## The sibling pattern to copy (verified)
`refinery/config/packs.mts:389-397` already runs a **module-scope** invariant that throws at load
(the `public_label` / `critical` check, "Checked at module load so a missing label throws before any build
runs"). Add the parity check right beside it, same style.

## Steps
1. **Probe first.** Read `packs.mts:386-397` (the existing invariant), `dag.mts:8-49` (input_brains-only),
   and master's pack def (`refinery/packs/master.mts` — `sources[]` ~228-257, `input_brains[]` ~274-321).
2. **RULE 3.5 brainstorm (short):** scope the invariant. It should assert, for the master pack (and any
   pack using `makeBrainInputSource`), that **every `makeBrainInputSource` source id has a matching
   `input_brains` entry** (and ideally vice-versa). Decide: master-only, or all packs? (Master is the only
   one with this failure history — start there, generalize only if cheap.)
3. Implement the module-scope loop next to `:389`; `throw new Error` with a message naming the offending id
   and which list it's missing from. Mirror the existing message style.
4. Add/extend a test asserting: mirrored lists pass; a planted orphan throws with the expected message.

> **FOLD-IN (audit re-verify 2026-06-22) — two implementation gotchas the original Steps under-specified:**
> (a) The `SourceConnector` type exposes **only `source_id`** (no `.upstreamId` field) — recover the
> upstream id by stripping the prefix: `source.source_id.slice("brain-input:".length)`.
> (b) **Filter to brain-input sources first** (`source.source_id.startsWith("brain-input:")`) — packs
> `macro-swfl` / `macro-florida` / `logistics-swfl-nowcast` legitimately mix vendor connectors
> (`bls-laus`, `fdot-…`) into `sources[]`; a naïve "every source ∈ input_brains" check would false-throw
> on a currently-valid registry and brick import for ALL packs. Assert **brain-input-source ⊆
> input_brains** (the direction that causes the HOLD); the reverse is optional. **Scope chosen: all packs**
> — every one of the 7 `makeBrainInputSource` consumers is mirrored today, so it passes on load and gives
> broader coverage than master-only.

> **IMPLEMENTED 2026-06-22.** Landed as an exported pure predicate `brainInputParityError(pack)` in
> `refinery/config/packs.mts`, called by a module-scope loop right after the existing `public_label`
> invariant (`throw new Error("Registry invariant: …")`). Test: `refinery/packs/brain-input-parity.test.mts`
> (real registry passes · planted orphan rejected · matching edge passes · vendor source ignored).
> Verified in isolation: `bun test refinery/packs/brain-input-parity.test.mts` (4/4) + `bun test refinery/`
> (1448/0 — every PACKS import exercises the new throw) + refinery typecheck adds 0 real errors.

## Best-practice fold-in
The load-time invariant catches drift but still maintains **two hand-kept lists**. The durable fix (authoritative
parallel: declarative-asset-dependencies, REPORT "three things" row 3) is to **derive one list from the other** so
they *cannot* diverge — e.g. let `input_brains` be the single source of truth and generate the `makeBrainInputSource`
`sources[]` from it. Ship the invariant now (cheap, P1); track the derive-don't-mirror refactor as the long-term move.

## Done when
- `bun test` green (incl. the new parity test), `next build` / refinery typecheck unaffected, and a normal
  `bun run refinery -- master --target-only` still loads + builds. Verified in isolation, no other build running.

## Risk
Medium (module-load throw). Contained by running SOLO + the isolation verification above.

## References (added 2026-06-22 — crawl4ai-live + best-practices fold-in)
**crawl4ai-live (tool-usage reference, docs/audit/2026-06-21-crawl4ai-live/):**
- (n/a — not a crawl4ai build)
**best-practices-research (how to build/operate what we build, docs/audit/2026-06-21-best-practices-research/):**
- `docs/audit/2026-06-21-best-practices-research/round3/q-dagster-asset-dependencies.md` (REPORT "three things" row 3) — declarative deps: the DAG is derived from the asset, not maintained in two lists that can drift
**Verified:** V-2 — both lists are 30, NOT 31; they are currently mirrored. If the build prose says 31, fold to 30. — folded into Steps above where applicable.
