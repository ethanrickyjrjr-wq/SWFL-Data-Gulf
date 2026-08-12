# Handoff — Graph Compartments, Steps 1–2. Step 1 shipped. Step 2 is a NEGATIVE RESULT.

**Date:** 08/12/2026
**Spec:** `docs/superpowers/specs/2026-08-11-graph-compartments-design.md`
**Plan:** `docs/superpowers/plans/2026-08-11-graph-compartments.md`
**Research:** `_RESEARCH/agent-behavior/2026-08-11-graphify-community-structure-crawl4ai-research.md`
**Check:** `graph_compartments_live_verify` — needs RE-SCOPING, not closing (see §5)
**Commits:** `1c6c38b2` (Step 1)

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

## 5. State, and what is NOT done

- **Step 0 (hosted-index probe) — NOT STARTED.** Whether `.graphifyignore` reaches the hosted index
  at `api.graphify.com/mcp` is still UNKNOWN. It needs its own push and a later `gx_find` check.
  RULE 0.5 makes the hosted graph every session's first reach, so this is the step that decides
  whether Step 1 helped the tool anyone actually uses.
- **Step 3 (TDD report script + `docs/standards/graph-compartments.md`) — NOT STARTED.**
- **Check `graph_compartments_live_verify` — re-scope, do not close.** Its premise (calibrate the two
  knobs) is answered and negative; the open question is now edge coverage.
- **`package.json` unchanged. Graph artifacts are gitignored build products** — the graph state
  described here lives on this box only; a fresh clone must run
  `graphify update . --force && node scripts/graphify-app-nodes.mjs`.
- Snapshot restore point from before any of this: `C:\Users\ethan\.cache\graphify-brain-platform\snapshot.tar.zst`
  (`bun scripts/graphify-snapshot.mjs restore`).

**2 of 4 steps.** Step 1 shipped and verified; Step 2 executed and returned a negative result;
Steps 0 and 3 untouched.

---

## 6. Reproduce

    graphify update . --force                    # --force is mandatory; see 2.4
    node scripts/graphify-app-nodes.mjs          # app plane merges AFTER clustering
    graphify cluster-only . --resolution <r> [--exclude-hubs <p>]   # code plane ONLY; see 2.1

Sweep harness (throwaway, not committed):
`%TEMP%\claude\C--Users-ethan-dev-brain-platform\903f380d-…\scratchpad\sweep.mjs`
