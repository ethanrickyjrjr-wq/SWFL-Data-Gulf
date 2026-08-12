# Handoff — Graph Compartments, Steps 1–2. Step 1 shipped. Step 2 is a NEGATIVE RESULT.

**Date:** 08/12/2026
**Spec:** `docs/superpowers/specs/2026-08-11-graph-compartments-design.md`
**Plan:** `docs/superpowers/plans/2026-08-11-graph-compartments.md`
**Research:** `_RESEARCH/agent-behavior/2026-08-11-graphify-community-structure-crawl4ai-research.md`
**Check:** `graph_compartments_live_verify` — needs RE-SCOPING, not closing (see §5)
**Commits:** `0daaaffb` (Step 1 — corrected 08/12/2026; `1c6c38b2` in the original write-up was the
pre-rebase local SHA, `safe-push.mjs` rebases onto `origin/main` before pushing so the pushed hash
differs; `1c6c38b2` is not reachable from `main`), `02c8cafa` (Step 2 pass 2, §4b)

---

## 0. READ THIS FIRST — the headline

**The two knobs this whole pass was built on do not compartment this repo.** Nine calibration runs,
all measured, all written and verified. The best configuration is the DEFAULT one we already had
(resolution 1.0, no hub exclusion). `--exclude-hubs` makes every metric worse at every resolution.

**A negative result is a result** (plan §Step 0.5). It does not mean the pass failed — it means the
diagnosis in the spec was wrong about the CAUSE, and §4 below names what the real one appears to be.
Do not re-run this sweep. It is done, the numbers are here, and repeating it costs ~2.5 minutes of
compute to learn the same thing.

---

## 1. What SHIPPED (Step 1, committed `1c6c38b2`)

`.graphifyignore` at repo root, tracked, three paths with measured node counts inline.

    baseline                48,778 nodes / 83,717 edges
    rebuild pruned           5,982 nodes from 11 newly-ignored files   (5,980 expected)
    after app-node merge    43,179 nodes / 73,146 edges
    drop                     5,678 nodes — clears the plan's >=4,000 gate

Verified directly against the rebuilt graph, not narrated:

    _RESEARCH/          1,987 nodes   KEPT (08/11 indexing decree intact)
    docs/              15,613 nodes   KEPT
    SESSION_LOG             0 nodes   excluded
    SCRATCHPAD              0 nodes   excluded
    reference-builds        0 nodes   excluded
    STRIKES.md             16 nodes   deliberately kept (negligible)
    TODAY.md                6 nodes   deliberately kept (negligible)

---

## 2. THREE TOOL BEHAVIORS THE PLAN GOT WRONG — read before touching Step 2 again

**2.1 Step 2 as written cannot execute.** The plan's ordering trap says any `cluster-only` run must
come AFTER the app-node merge or injected nodes stay uncompartmented. In practice `cluster-only`
DROPS the 79 app-plane nodes, then sees a net −77 against the existing graph and refuses to write:

    WARNING: new graph has 43102 nodes but existing graph.json has 43179 (net -77).
    Refusing to overwrite. ... graph.json NOT written

It still prints a plausible community count while writing nothing, and exits 1. Every one of the
first nine runs failed this way. **Calibrate on the code plane (before the app merge), then merge the
app plane once at the end.** That is what was done.

**2.2 `--force` does NOT override that refusal on `cluster-only`.** The flag is accepted — no
unknown-flag error — and the refusal fires anyway. It DOES work on `graphify update .`. Do not
assume the flag means the same thing on both subcommands.

**2.3 Leiden is stochastic here.** Two back-to-back runs at identical parameters
(`--resolution 1.5`) returned 2,842 and 2,836 communities. Single-run numbers carry roughly ±0.2%
noise. Do not read a difference of tens of communities as signal.

**2.4 The npm scripts omit `--force`.** Neither `graphify:update` nor `graphify:publish` passes it,
and without it the update silently refuses on any node drop. A routine `bun run graphify:update`
would have no-opped the Step 1 scoping entirely and every downstream number would have looked clean
while measuring unscoped data. Scripts left UNCHANGED — adding `--force` there would force-overwrite
on every routine run, which is a separate decision nobody has taken.

---

## 3. Step 2 results — nine runs, all written and verified

Scoped code-plane graph, 43,129 nodes. `exclude-hubs 95` deliberately not swept (measured known-bad).
Each run was checked for an actual file write (mtime + exit code) so a silent refusal could not leave
the previous clustering in place and be measured as the current one.

    res    hubs   comms   singles  cross%  cohesion  email  deliv  both
    1.0    none   3769    1270     17.2    0.916     263    97     339
    1.0    99     6494    3624     23.4    0.466     475    278    724
    1.0    99.5   5592    2815     21.8    0.556     380    198    550
    1.5    none   3825    1270     17.4    0.910     273    100    348
    1.5    99     6593    3624     24.6    0.466     482    293    750
    1.5    99.5   5667    2816     22.4    0.556     389    208    571
    2.0    none   3878    1270     18.7    0.901     280    102    357
    2.0    99     6623    3625     25.5    0.465     497    290    762
    2.0    99.5   5745    2815     23.8    0.554     412    206    588

**Against the plan's own selection criteria:**

- community count in tens-to-low-hundreds — **NOT MET by any run.** Best is 3,769.
- cross-community share below 19.9% — met by all three `hubs=none` runs. Best 17.2% (was 19.9%
  pre-scoping, so Step 1's scoping is what earned this, not the clustering knobs).
- cohesion up — best 0.916 at the default.
- `lib/email` + `lib/deliverable` collapsed to 2–3 communities — **NOT MET.** Best is 339. Off by
  two orders of magnitude.

**Winner on the plan's tie-break (fewest communities): resolution 1.0, exclude-hubs none — the
default.** Nothing was pinned in `package.json`, because pinning the default is a no-op that would
only imply a decision had been made. The graph currently on disk is at those values with the app
plane merged: 43,208 nodes, 73,177 edges, 3,759 communities.

---

## 4. WHY it failed, and the lever the plan never considered

**Singletons are EXACTLY 1,270 across all three `hubs=none` runs regardless of resolution.** That
number does not move because resolution cannot merge nodes that have no edges to merge along. It is a
structural floor, not a clustering outcome. And `--exclude-hubs` makes it dramatically worse (1,270 →
3,624 singletons) because removing hub nodes disconnects everything that reached the graph only
through them.

**So the problem is edge sparsity, not clustering parameters.** The spec's root-cause line — "an
unscoped corpus at default resolution with no hub exclusion" — was right about the corpus and wrong
about the knobs.

The rebuild's own warnings name concrete, fixable edge loss:

- **262 `.sql` files contributed NOTHING** — `tree_sitter_sql` not installed. Fix:
  `pip install "graphifyy[sql]"`. This is the single largest identified lever and it is one command.
- **189 source files produced zero nodes** (`coverage-ratchet-baseline.json`, `settings.json`,
  `_watch-manifest.json`, `pypi-import-map.json`, +184 more).
- **3 files partially extracted from syntax errors** — `BrandingBlock.tsx` (first error L311),
  `CorridorMarketScatter.tsx` (L334), `CorridorMap.jsx` (L47). These are real parse failures in our
  own tree and worth a look independent of the graph.
- 1 `.r` file has no extractor.

**Recommended pass 2:** install the SQL extractor, rebuild, re-measure singletons and cross-share.
Do NOT sweep resolution again until edge coverage is fixed — the knobs cannot help until the graph
is connected.

---

## 4b. Pass 2 — SQL extractor installed, rebuilt, re-measured. Singleton floor got WORSE, not better.

**Installed and confirmed:** `graphifyy 0.9.39` (the `C:\Users\ethan\AppData\Local\Python\pythoncore-3.14-64`
interpreter graphify actually runs on — NOT the repo's default `python`/`pip`, which is a separate 3.11
env with no `tree_sitter_sql`) already had the extractor; `import tree_sitter_sql` succeeds there.
Ran the exact reproduce recipe from §6: `graphify update . --force` (code plane only), then
`graphify cluster-only . --resolution 1.0 --no-viz` (default config, the §3 winner), then
`node scripts/graphify-app-nodes.mjs` to restore the merged committed state (43,814 nodes / 73,490
edges — matches the in-session claim of 43,811/73,485 within normal rebuild drift).

Measured directly off the written `graphify-out/graph.json` (community-size histogram + edge
source/target community lookup — same method as the §3 table: singleton = community size 1,
cross% = share of edges whose endpoints sit in different communities):

    metric              pre-SQL (§3)   post-SQL (pass 2)   delta
    code-plane nodes    43,129         43,723              +594
    communities         3,769          4,069               +300 (worse)
    singletons          1,270          1,434                +164 (worse, +12.9%)
    cross-community %   17.2           16.7                 -0.5 (marginal improvement)

**The SQL fix worked exactly as documented — 553 SQL-derived nodes now exist that were previously
zero (confirms §4's "262 .sql files contributed NOTHING") — but it did not lower the singleton
floor. It raised it.** Breakdown of the 1,434 singletons by source-file extension: `.ts` 618, `.tsx`
324, **`.sql` 171**, `.py` 103, `.yaml` 102, no-extension 67, `.json` 19, `.mts` 14, others 12. Of the
553 total SQL nodes now in the graph, 171 (31%) landed as singletons — accounting for nearly the
entire 164-node increase. **Newly-extracted SQL symbols mostly have no resolved cross-file edges**
(nothing in the TS/Python layer references them back), so making them visible to the graph converted
them from "absent" to "present but disconnected" rather than "present and compartmented."

**Read correctly, this is not a wasted fix.** RULE 0.5's stated reason for the hosted-index push is
that SQL entities should be *queryable* (`gx_find`, `gx_callers`) at all — that's now true for 553
nodes that weren't in the graph a session ago. It is simply a DIFFERENT lever from the one this whole
pass exists to move (community count / cross-community share). Edge coverage and compartmentalization
are not the same problem: fixing "the file produces no node" does not imply "the node has an edge."
The real remaining lever, unexamined until now, is SQL-to-code edge resolution (e.g. a Python/TS
`SELECT * FROM table_x` or ORM reference should produce a `references`/`queries` edge into the
`.sql` node for `table_x`) — nobody has checked whether graphify's extractor even attempts that kind
of cross-language edge, and it's now the next open question, not resolution/hub-exclusion.

**Do not re-run this measurement again without a specific new lever to test** — the same "±0.2% noise"
caveat from §2.3 applies; a repeat run would cost ~90s of compute to learn the same thing twice.

---

## 4c. Step 0 — hosted-index probe. Answer: NOT YET DETERMINABLE, and here's why.

Queried the hosted index directly (`mcp__graphify__list_repositories` →
`e230749f-4a5e-44a6-8524-481ebe89d711` → `graph_stats`): **20,798 nodes / 49,152 edges / 792
communities, stamped `commitSha 658c25ba`.**

Checked that commit's place in history: `658c25ba` is dated 2026-08-12 00:06:32 -0400 — **before**
the `.graphifyignore` commit (`0daaaffb`, 00:38:35) and **24 commits behind current HEAD**
(`972f4bd3`). `git merge-base --is-ancestor 0daaaffb 658c25ba` confirms the hosted commit does not
contain Step 1 at all.

**So the honest answer to "does `.graphifyignore` reach the hosted index" is: can't tell yet — the
hosted index hasn't rebuilt past the commit that introduced the file.** This is not a failure of
Step 1; it's a freshness gap in a system we don't control the cadence of. Checked whether this repo
has any lever over hosted reindex timing: `.github/workflows/graphify-republish.yml` only regenerates
the LOCAL CLI graph and republishes it into the **ops repo's** `brain-graph.json` (a static
visualization snapshot for `/graph` on swfldatagulf-ops) — a completely different artifact from the
hosted MCP index at `api.graphify.com/mcp`. Nothing in this repo triggers or schedules that hosted
rebuild; it's Graphify-Labs' own SaaS infrastructure, presumably driven by their own GitHub App
watching the repo on push. **No repo-local script or workflow can force it.**

**This also corrects a stale claim in root `CLAUDE.md`'s RULE 0.5**, which states "the hosted index
answered at HEAD" as a measured fact from 08/11/2026. That was true when measured. It is not true
right now — the hosted index is 24 commits stale as of this check (08/12/2026, ~02:10am). RULE 0.5's
underlying point (hosted > local artifact) still holds — the local `graphify-out/graph.json` file is
gitignored and even more stale by definition — but "the hosted index is at HEAD" is a snapshot claim
that ages, not a standing guarantee, and this session is the evidence.

**What this means for Step 0's original question:** re-probe `gx_find`/`graph_stats` later (no fixed
interval known — there's no visible SLA on hosted reindex cadence) and diff `commitSha` against
`git log` HEAD. When the hosted `commitSha` is a descendant of `0daaaffb`, check whether a term unique
to an ignored file (e.g. a distinctive `SESSION_LOG.md` phrase) is absent from `gx_find` results —
that's the actual pass/fail test for "does `.graphifyignore` reach the hosted index," and it cannot
be run before then.

---

## 4d. Step 3 spec — report script + standards doc (NOT BUILT — next session picks this up)

**Scope, so the next session doesn't re-derive it:**

1. `scripts/graphify-compartments-report.mjs` — reads `graphify-out/graph.json`, prints the same
   metrics table as §3/§4b (nodes, edges, communities, singletons, cross-community %, plus a
   by-extension singleton breakdown like §4b's). Pure function of the graph on disk — no LLM call, no
   network. This is what `graph_compartments_live_verify`'s eventual signal should call.
2. `docs/standards/graph-compartments.md` — the standards doc. Content already exists, scattered
   across this handoff; the doc's job is to be the ONE place a future session reads instead of
   re-deriving: the two exhausted knobs (resolution, `--exclude-hubs` — both proven not to compartment
   this repo, §3), the `cluster-only` ordering trap and `--force` behavior difference (§2.1–2.2), the
   reproduce recipe (§6), and the open lever (SQL-to-code, and any language pair like it — §4b).

**Failure-modes section (RULE 3.5 gate — must be answered before implementation starts, not after):**

- *Script drifts from the metric definitions used in this handoff* → guard: the script's own
  docstring/comment should name the exact formula (singleton = community size 1; cross% = share of
  edges whose endpoints sit in different communities) so a future re-read can verify it still matches
  what produced the §3/§4b numbers, not a silently-changed metric.
- *Report runs against a stale/wrong graph.json* (e.g. code-plane-only before app merge, or a graph
  built without `--force` that silently kept old data) → guard: print `nodes`/`edges` count and
  compare against the count graphify itself reported on the last rebuild (visible in its own stdout);
  flag if they don't match.
- *Someone reads "singletons: 1,434" from a report run against an unmerged code-plane graph and
  compares it to the merged 43,814-node figure from SESSION_LOG* → guard: the report should print
  which plane it measured (code-only vs merged) directly in its header, not assume the reader knows.
- *Standards doc goes stale the next time someone finds a lever that moves the floor* → guard: date-
  stamp the "exhausted knobs" list and say explicitly what would falsify it (a run that changes the
  1,270/1,434 singleton count without adding/removing files), so a future session knows to update
  rather than trust a frozen table forever.

**TDD unit target:** the community-size histogram / cross-edge-share computation is pure and
deterministic given a fixed nodes+links array — write it as an importable function
(`computeCompartmentMetrics(graph)`), test it against a small hand-built fixture graph (3 communities,
known singleton count, known cross-edge count) before wiring it to the real 43k-node file. That's the
actual unit under test; parsing `graph.json` and printing are not.

---

## 5. State, and what is NOT done

- **Step 0 (hosted-index probe) — RUN, answer is NOT YET DETERMINABLE, see §4c.** The hosted index
  is 24 commits stale (stamped `658c25ba`, before the `.graphifyignore` commit `0daaaffb`) and no
  repo-local mechanism controls its rebuild cadence. Also corrects a stale RULE 0.5 claim in root
  `CLAUDE.md` ("the hosted index answered at HEAD") — true when measured 08/11, not true now.
- **Step 2 pass 2 (SQL-extractor install + re-measure) — DONE, see §4b.** Result: singleton floor
  moved from 1,270 to 1,434 (worse), community count worsened, cross-community % improved 0.5pt.
  New lever identified (SQL-to-code edge resolution), not yet tested.
- **Step 3 (TDD report script + `docs/standards/graph-compartments.md`) — SPEC'D, not built (see §4d).
  Deliberately not rushed: it's real build work under RULE 3.5 (TDD-mandatory), and this session's
  context was already past the compaction threshold when Step 0 closed out.**
- **Check `graph_compartments_live_verify` — re-scope, do not close.** Its premise (calibrate the two
  knobs) is answered and negative; §4b closes the "install the SQL extractor" sub-question with
  another negative; §4c closes "does Step 1 reach the hosted index" as not-yet-checkable; the open
  build work is Step 3 (§4d) and the open research question is SQL-to-code edge resolution.
- **`package.json` unchanged. Graph artifacts are gitignored build products** — the graph state
  described here lives on this box only; a fresh clone must run
  `graphify update . --force && graphify cluster-only . --resolution 1.0 --no-viz && node scripts/graphify-app-nodes.mjs`.
  Current on-disk state (this session): 43,814 nodes / 73,490 edges, 4,069 code-plane communities.
- Snapshot restore point from before any of this: `C:\Users\ethan\.cache\graphify-brain-platform\snapshot.tar.zst`
  (`bun scripts/graphify-snapshot.mjs restore`).

**3.5 of 4 steps.** Step 1 shipped and verified; Step 2 and its pass-2 follow-up both executed and
returned negative results (§3, §4b); Step 0 executed and returned a not-yet-determinable result with
a real cause identified (§4c); Step 3 is spec'd with a failure-modes section but not built (§4d) —
next session's starting point, no re-derivation needed.

---

## 6. Reproduce

    graphify update . --force                    # --force is mandatory; see 2.4
    node scripts/graphify-app-nodes.mjs          # app plane merges AFTER clustering
    graphify cluster-only . --resolution <r> [--exclude-hubs <p>]   # code plane ONLY; see 2.1

Sweep harness (throwaway, not committed):
`%TEMP%\claude\C--Users-ethan-dev-brain-platform\903f380d-…\scratchpad\sweep.mjs`
