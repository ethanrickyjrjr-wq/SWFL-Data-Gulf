# Graph Compartments — Pass 1: scope the corpus, measure the result

**Date:** 08/11/2026
**Status:** Design, approved verbally by operator 08/11/2026. Not built.
**Check:** `graph_compartments_live_verify`
**Research (read this first):** `_RESEARCH/agent-behavior/2026-08-11-graphify-community-structure-crawl4ai-research.md`
**Strike shape this closes:** `architecture-drift-no-detector` (`_ASSISTANT/STRIKES.md`)

---

## 1. The problem, measured

Operator, 08/11/2026: *"Instead of one big yarn ball of paths, we need to put the things that are
mostly related together… easier for Claude to work in the area it is supposed to be in and easier
for me to see when we have too many routes for one thing or neighbors data not connected to
anything."* And: *"I still find out we build different ways… don't tell me we are doing all we can."*

`graphify-out/graph.json`, measured 08/11/2026: 48,777 nodes, 83,716 edges, **3,740 communities**,
1,266 of them singletons, 2,093 connected components with the largest holding only 51.1% of nodes,
19.9% of edges crossing community lines.

**Node counts per candidate exclusion, re-measured directly (NOT the earlier top-N-community
estimates, which undercounted):**

    app/_design/assets/reference-builds/   3,548 nodes
    SESSION_LOG.md                         2,049
    _ASSISTANT/SCRATCHPAD.md                 383
    _ASSISTANT/STRIKES.md                     13   ← negligible, DO NOT exclude
    _ASSISTANT/TODAY.md                        6   ← negligible, DO NOT exclude
    ------------------------------------------------
    proposed exclusion total               5,980   = 12.3% of all nodes

**Correction on the record:** earlier in the session this was stated as "~3,800 nodes" and "the three
append-only logs." Both were wrong. The real figure is **5,980 nodes across THREE paths, and
STRIKES.md is not one of them** — at 13 nodes it is noise-free and excluding it would be cargo-cult.
An external reviewer challenged the unmeasured third file; measuring it is what caught this.

Root cause is ours, not graphify's: no `.graphifyignore`, default Leiden resolution 1.0, no
`--exclude-hubs`, and no declared intended partition to check the detected one against.

---

## 2. Scope of THIS pass

**In:** scope the corpus, calibrate clustering on the scoped graph, ship a deterministic measurement
report, and answer the hosted-index question.

**Out (pass 2):** the ~26 named compartments (drafted in PART 7 of the research doc), the
declared-vs-detected drift number, any enforcement gate, any ops-page surface. Those need a clean
graph to mean anything, and a drift threshold picked from nothing would be invented.

---

## 3. Architecture

Four units, each independently verifiable.

**3.1 `.graphifyignore`** (repo root, tracked, commented)
Excludes exactly three paths: `app/_design/assets/reference-builds/`, `SESSION_LOG.md`,
`_ASSISTANT/SCRATCHPAD.md`. Carries an inline comment block stating that `_RESEARCH/` and `docs/`
are deliberately KEPT per the 08/11/2026 indexing decree, and why each exclusion is justified with
its node count.

Verified live in the installed package, not assumed: `.graphifyignore` is handled in `detect.py`
(`_load_graphifyignore`, `_is_ignored`), which `extract.py:4358` imports — shared file-walking code,
so it applies to `graphify update`, not only `graphify extract`. `detect.py:1014-1016`:
`.gitignore` is read first and `.graphifyignore` last, so **it can only ever exclude MORE, never
re-include** — additive-only, no surprise re-inclusion. `cli.py:168` shows a changed
`.graphifyignore` is a re-extraction trigger in the incremental manifest gate, so the scoped rebuild
actually fires instead of sitting on cache.

**3.2 `scripts/graph-compartments.mjs`** — deterministic, no model call, no network.
Reads `graphify-out/graph.json`, writes `docs/standards/graph-compartments.md`. Emits: node/edge
counts, community count, size distribution (singletons, ≤3, ≥50), isolated nodes, connected
components with largest-component share, cross-community edge share, and a top-N table of
communities with dominant source folder, purity %, distinct-file count, and current label.
Header states which graph file it read, that file's mtime, and the run's resolution/exclude-hubs
values — so a stale or differently-tuned report is self-evident and can never be mistaken for
another graph's.

**3.3 Wiring** — `package.json`: append the report to `graphify:update` and `graphify:publish`,
positioned AFTER `graphify-app-nodes.mjs` so it measures the graph that actually ships.

**3.4 Calibration** — a two-axis sweep on the SCOPED graph, run manually, results recorded in the
report's history section. Not automated; it runs once to pick values, then the values are pinned.

---

## 4. Build order — the hosted-index probe goes FIRST

**Step 0 is not optional and not last.** Three graphs exist (research doc PART 6): the local
`graph.json`, the ops `/graph` snapshot built from it daily at 07:37 UTC, and the HOSTED index at
`api.graphify.com/mcp` that RULE 0.5 makes every session's first reach. Local CLI flags cannot reach
the hosted one. Whether `.graphifyignore` reaches it is UNKNOWN.

Graphify's own MCP page (crawled 08/11/2026) says *"There is no hosted backend and no telemetry"*
about the local server, and documents a hosted **docs-search** server with one tool. Our wired
endpoint exposes `gx_rank_files`, `gx_callers`, `gx_impact`, `list_repositories`, `remember`,
`recall` — matching neither. So the hosted index is real and undocumented on the public site.

Tuning the local graph while sessions query the hosted one is the `fixed-but-not-live` shape,
which carries five strikes. Ordering the probe last would apply that shape to an entire pass.

    Step 0  PROBE  — commit a one-line .graphifyignore excluding ONE file with a uniquely-named
                     symbol. Push (requires per-push operator approval). Later, ask the hosted
                     graph for that symbol via gx_find. Re-index latency is UNMEASURED — this is a
                     check-back, not a blocking wait.
    Step 1  SCOPE  — write the real .graphifyignore (3 paths). Re-extract with --force.
    Step 2  SWEEP  — two-axis calibration on the clean graph. Pick values by measurement.
    Step 3  REPORT — TDD graph-compartments.mjs, wire it, commit the before/after.

---

## 5. Calibration: BOTH knobs, on the CLEAN graph

The sweep varies `--resolution` and `--exclude-hubs` **together**. They interact and do not move the
community count in the same direction or the same order of magnitude.

Measured on the CURRENT (dirty) graph by an external reviewer, 08/11/2026, as a baseline only:
resolution 1.5 alone → 2,827 communities; exclude-hubs 95 alone → **15,823** communities.

Two consequences, both binding:

- **exclude-hubs 95 is a known-bad point.** Pulling 5% of nodes (~2,400) out of partitioning removes
  the connective tissue and shatters the graph — 3,740 → 15,823 is worse, not better. The useful
  range is 99 and up, where only true super-hubs like `lib/` (in-degree ~684) come out. Do not
  re-sweep 95.
- **Those numbers are NOT a guide for picking values.** They were taken on a corpus that is about to
  lose 12.3% of its nodes including its two densest blobs. Any value chosen from them is chosen
  against a graph that will not exist. The sweep runs after Step 1, or it measures the wrong thing.

Grid: resolution {1.0, 1.5, 2.0} × exclude-hubs {none, 99, 99.5}. Nine runs, `cluster-only`, cheap.
Selection is by measurement, never by which picture looks better:
1. community count in the tens-to-low-hundreds, not thousands
2. cross-community edge share DOWN from the 19.9% baseline
3. mean cohesion UP
4. `lib/email` + `lib/deliverable` collapsing from 7+ communities toward 2–3

Tie-break: fewer communities. Chosen values get pinned in `package.json` and stated in the report
header.

---

## 6. Failure modes and their guards

**F1 — The fewer-nodes refusal silently no-ops the rebuild.**
`graphify update` refuses to overwrite `graph.json` when the rebuild has fewer nodes (its own
`--help`). Excluding 5,980 nodes guarantees fewer nodes, so the first scoped run WILL refuse and
leave the old graph in place — and every downstream number would be measured on unscoped data while
looking successful. Independently reproduced by a reviewer, who saw `cluster-only` correctly refuse
twice on a 77-node drop.
**Guard:** pass `--force` on the scoping run, AND `graph-compartments.mjs` hard-fails if the node
count did not drop by at least 4,000. A silent no-op becomes a red build, not a clean report.

**F2 — Clustering runs before the app-node merge, leaving injected nodes uncompartmented.**
`graphify:update` = `graphify update . && node scripts/graphify-app-nodes.mjs && …`; app-plane nodes
patch in strictly AFTER Leiden. Any `cluster-only` step must come after that merge.
**Guard:** a test asserting every node in `graph.json` carries a `community` field, and that nodes
with no `_origin` inside singleton communities stay at or below today's 82.

**F3 — Community labels mis-attach after membership shifts.**
`.graphify_labels.json` re-attaches names by node overlap (`cli.py:1824`). Removing 5,980 nodes
changes membership, so a stale name can land on the wrong group.
**Guard:** the report prints each community's label NEXT TO its dominant folder and purity, so a
wrong name is visibly wrong rather than quietly trusted. Re-label only after values are pinned.

**F4 — Someone later broadens the ignore file and silently kills the indexing decree.**
**Guard:** a test that FAILS if `.graphifyignore` ever matches any path under `_RESEARCH/` or
`docs/`. The decree becomes executable, not a comment.

**F5 — The scoping never reaches the graph sessions actually query.**
**Guard:** Step 0 answers it before anything else is built; the report header names the graph file
and its mtime so a clean local report cannot be read as a clean hosted one. If the probe comes back
negative, pass 1 still delivers value locally and the hosted gap becomes its own named problem
rather than an unnoticed one.

**F6 — The report becomes another artifact nobody reads.**
`built-dark-no-consumer` carries five strikes.
**Guard:** wired into `graphify:update`/`graphify:publish` so it regenerates with the graph; lands in
`docs/standards/` next to `data-roots.md` where the operator already reads; committed, so a
compartment moving shows up in a commit diff.

---

## 7. Testing (RULE 3.5 — TDD, tests named after failure modes)

Deterministic logic only; each test named for the failure mode it targets.

- `f1_fails_when_node_count_did_not_drop` — fixture graph at pre-scope size → report exits non-zero.
- `f2_every_node_has_a_community` — fixture with an uncompartmented injected node → fails.
- `f2_origin_none_singletons_within_budget` — count above 82 → fails.
- `f4_graphifyignore_never_matches_research_or_docs` — parses the real file, asserts no match.
- `purity_computation` — hand-built fixture with known folder mix → exact expected purity.
- `components_and_isolates` — fixture with a known isolate and two components → exact counts.

Scope limit per RULE 3.5: green tests prove the computations, not that the graph got better. That is
proved by the before/after report committed in the same PR.

---

## 8. Done means

1. `.graphifyignore` committed with its three paths and the keep-comment.
2. Node count dropped by ≥ 4,000 on a `--force` rebuild, shown in the report diff.
3. Community count in the tens-to-low-hundreds; cross-community edge share below 19.9%.
4. `lib/email` + `lib/deliverable` in 2–3 communities, not 7+.
5. `docs/standards/graph-compartments.md` committed, before and after both in git history.
6. Six tests green.
7. The hosted-index probe answered either way, written into the research doc and the check closed
   or re-scoped.

Reported as n-of-7 per RULE 0.8. Partial is fine; partial reported as whole is not.
