# Plan — Graph Compartments, Pass 1

**Spec:** `docs/superpowers/specs/2026-08-11-graph-compartments-design.md`
**Research:** `_RESEARCH/agent-behavior/2026-08-11-graphify-community-structure-crawl4ai-research.md`
**Check:** `graph_compartments_live_verify`
**Brief, not a status board.** Markers flip in the same commit as the code (RULE 2).

---

## START HERE, COLD — read before touching anything

You did not run the session that produced this. Four things you would otherwise re-derive or get
wrong:

1. **Read the research doc first.** Everything below is downstream of it — the measurements, the
   undocumented CLI flags, the three-graphs problem. Do not re-crawl graphify.com; it was crawled
   08/11/2026 and the findings are written down.
2. **The numbers in spec §1 were re-measured, and two earlier estimates in that session were WRONG.**
   The exclusion is 5,980 nodes across THREE paths. `STRIKES.md` (13 nodes) and `TODAY.md` (6) are
   NOT excluded — an earlier draft said "the three append-only logs" and included STRIKES; measuring
   it is what caught the error. `reference-builds/` is 3,548 nodes, not the ~1,480 an earlier
   top-N-community estimate produced. Trust spec §1, not any other figure you may find in
   `SESSION_LOG.md` or the scratchpad.
3. **`--force` on the scoping rebuild is not optional.** Without it `graphify update` silently
   refuses to overwrite on a node drop, leaves the old graph in place, and every downstream number
   you compute will look clean while measuring unscoped data. This was reproduced live twice.
4. **Step 0 comes first and needs a fresh push approval.** The operator approved the spec and the
   plan on 08/11/2026; push approval is per-push and never carried. Ask before pushing the probe.

**Ordering trap:** `graphify:update` = `graphify update . && node scripts/graphify-app-nodes.mjs`.
App-plane nodes patch in strictly AFTER Leiden clusters. Any `cluster-only` run must come after that
merge or the injected nodes stay uncompartmented no matter what resolution you pick.

---

## Step 0 — Hosted-index probe (BLOCKS nothing, but starts first)

**Why first:** local CLI flags cannot reach the hosted index that RULE 0.5 makes every session's
first reach. Doing this last would apply the `fixed-but-not-live` shape (5 strikes) to a whole pass.

1. Pick one excluded-to-be file with a symbol name that exists nowhere else. Candidate:
   `meteo-ashwyn-bundle.beauty.js` — verify the chosen symbol is unique with `gx_find` BEFORE the
   push, so the post-push result is interpretable.
2. Write a one-line `.graphifyignore` excluding only that file. Commit.
3. **STOP — ask the operator for per-push approval.** Push.
4. Check back later (latency unmeasured — not a blocking wait): `gx_find` the symbol against the
   hosted graph.
   - Still present after a reasonable window → `.graphifyignore` does NOT reach the hosted index.
     Record it, keep the check open re-scoped to "hosted scoping has no known lever."
   - Gone → it does. Close the check.
5. Write the verdict into research PART 6 either way. **A negative result is a result** — it does
   not stop Steps 1–3, it changes what we claim about them.

## Step 1 — Scope the corpus

1. Replace the probe file with the real `.graphifyignore`: three paths only —
   `app/_design/assets/reference-builds/`, `SESSION_LOG.md`, `_ASSISTANT/SCRATCHPAD.md`.
   **NOT `STRIKES.md` (13 nodes) and NOT `TODAY.md` (6 nodes)** — measured, negligible, excluding
   them would be cargo-cult.
2. Inline comment block: node count justifying each exclusion, plus an explicit KEEP note for
   `_RESEARCH/` and `docs/` citing the 08/11/2026 indexing decree.
3. Rebuild: `graphify update . --force` (F1 — without `--force` it silently refuses on a node drop),
   then `node scripts/graphify-app-nodes.mjs` (F2 — app nodes must merge before any re-cluster).
4. Confirm the drop is ≥ 4,000 nodes against the 5,980 expected. If it is not, STOP — the ignore file
   is not being honored and nothing downstream is trustworthy.

## Step 2 — Two-axis calibration on the CLEAN graph

Grid: resolution {1.0, 1.5, 2.0} × exclude-hubs {none, 99, 99.5}. Nine `cluster-only` runs.
**Do not sweep exclude-hubs 95** — measured known-bad (3,740 → 15,823 communities).
**Do not reuse the dirty-graph baseline numbers to pick values** — that corpus no longer exists.

Record per run: community count, singletons, cross-community edge share, mean cohesion, and how many
communities `lib/email` + `lib/deliverable` span.

Select on: community count in tens-to-low-hundreds · cross-community share below 19.9% · cohesion up
· email/deliverable collapsed to 2–3. Tie-break on fewer communities. Pin the winners in
`package.json`; state them in the report header.

## Step 3 — The report (TDD)

1. Write the six failing tests first, each named for its failure mode (spec §7).
2. Implement `scripts/graph-compartments.mjs` to green. Deterministic — no model call, no network.
3. Header carries: graph file path, its mtime, resolution, exclude-hubs. So a stale or
   differently-tuned report is self-evident.
4. Hard-fail on a node count that did not drop (F1). Print label next to dominant folder (F3).
5. Wire into `graphify:update` and `graphify:publish`, positioned AFTER `graphify-app-nodes.mjs`.
6. Commit `docs/standards/graph-compartments.md` — the pre-scope numbers are already measured
   (spec §1), so both before and after live in git history.

---

## Guardrails carried from the spec

- `--force` on the scoping rebuild, always. Silent no-op is the top risk.
- Re-cluster only AFTER the app-node merge.
- A test fails if `.graphifyignore` ever matches `_RESEARCH/` or `docs/`.
- Re-label communities only after values are pinned, never during the sweep.
- Report is committed, not gitignored — that is what makes drift show up in a diff.

## Not in this pass

The ~26 named compartments (drafted, research PART 7), the declared-vs-detected drift number, any
enforcement gate, any ops-page surface. All of it needs the clean graph from Step 1 to mean anything.

## Reporting

n-of-7 against spec §8 "Done means." Partial is fine; partial reported as whole is the defect.
