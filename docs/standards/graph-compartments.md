# Graph compartments — the standard

**As-of 08/12/2026.** This is the ONE place to read before touching graph clustering.
It exists so a future session does not re-derive what two measured passes already settled.

Source of the numbers: `docs/handoff/2026-08-12-graph-compartments-step2-negative-result.md`
(§3 the nine-run sweep, §4b the SQL-extractor pass, §4c the hosted-index probe).
Reproduce any of them with `node scripts/graphify-compartments-report.mjs`.

---

## 1. Read this before you turn a knob

**Resolution and `--exclude-hubs` do not compartment this repo. Both are exhausted.**
Nine calibration runs, all measured. The best configuration is the DEFAULT we already had:
`--resolution 1.0`, no hub exclusion. `--exclude-hubs` makes every metric worse at every
resolution — it disconnects everything that reached the graph only through a hub.

    res    hubs   comms   singles  cross%  cohesion
    1.0    none   3769    1270     17.2    0.916     <- winner (the default)
    1.0    99     6494    3624     23.4    0.466
    1.0    99.5   5592    2815     21.8    0.556
    1.5    none   3825    1270     17.4    0.910
    1.5    99     6593    3624     24.6    0.466
    1.5    99.5   5667    2816     22.4    0.556
    2.0    none   3878    1270     18.7    0.901
    2.0    99     6623    3625     25.5    0.465
    2.0    99.5   5745    2815     23.8    0.554

Nothing is pinned in `package.json`, because pinning the default is a no-op that would only
imply a decision had been taken.

**Why the knobs cannot help: singletons are a structural floor, not a clustering outcome.**
The count sat at EXACTLY 1,270 across all three `hubs=none` runs regardless of resolution.
Resolution cannot merge nodes that have no edges to merge along. The problem is edge sparsity.

**Leiden is stochastic here.** Two back-to-back runs at identical parameters returned 2,842 and
2,836 communities. Single-run numbers carry roughly ±0.2% noise. A difference of tens of
communities is not signal.

### What would falsify this section

A run that changes the singleton count (1,270 code-plane pre-SQL / 1,434 post-SQL) **without
adding or removing files from the graph.** If you find one, this section is stale — update it
rather than trusting a frozen table. Adding files moves the count trivially and proves nothing.

---

## 2. Two tool behaviors that will silently burn a session

**2.1 `cluster-only` must run BEFORE the app-node merge.** It drops the app-plane nodes, then
sees a net node loss against the existing graph and refuses to write:

    WARNING: new graph has 43102 nodes but existing graph.json has 43179 (net -77).
    Refusing to overwrite. ... graph.json NOT written

It still prints a plausible community count while writing nothing, and exits 1. Calibrate on the
code plane, then merge the app plane once at the end.

**2.2 `--force` does NOT override that refusal on `cluster-only`.** The flag is accepted with no
unknown-flag error and the refusal fires anyway. It DOES work on `graphify update .`. The flag
does not mean the same thing on both subcommands.

**2.3 The npm scripts omit `--force`.** Neither `graphify:update` nor `graphify:publish` passes
it, so a routine run silently refuses on any node drop and leaves the previous graph in place —
every downstream number then looks clean while measuring stale data. Left UNCHANGED deliberately:
adding `--force` there would force-overwrite on every routine run, a separate decision nobody has
taken.

**2.4 `graphify` runs on its own interpreter.** The extractor lives on
`C:\Users\ethan\AppData\Local\Python\pythoncore-3.14-64` (graphifyy 0.9.39), NOT the repo's
default `python`/`pip`, which is a separate 3.11 env. Check the right one before concluding a
`tree_sitter_*` extractor is missing.

---

## 3. `graph.json` carries TWO edge arrays. They give different answers.

**Measured 08/12/2026 — the single easiest way to publish a wrong number from this graph.**

    links    70,721   code plane only          -> cross-community 16.7%
    edges    73,490   links + 2,769 app-plane  -> cross-community 19.5%

Both are "the share of edges whose endpoints sit in different communities." They differ by 2.8
points because they are different populations. **Every cross% figure in the handoff's §3/§4b
tables came from `links`.**

The same split runs through the node counts: `nodes` (43,814) is the MERGED total, while the
community metrics are computed over the 43,723 nodes that carry a `community` field. The 91
app-plane nodes carry none — `scripts/graphify-app-nodes.mjs` merges them in AFTER clustering.

The handoff's own headline mixes the two: its node/edge totals are merged-plane, its cross% is
code-plane. Both are correct; quoting them as one set is not. `graphify-compartments-report.mjs`
prints the plane it measured in its header and prints both cross% figures side by side, so the
conflation cannot recur silently.

**Plane detection rule:** a node with no `community` field is app plane. If the report says
`CODE PLANE ONLY`, the app merge has not been run and its node/edge totals are not comparable to
any merged figure in `SESSION_LOG` or the handoff.

---

## 4. Metric definitions (do not change without re-measuring the handoff)

    singleton   a community whose size is exactly 1 node
    cross%      share of edges whose two endpoints sit in DIFFERENT communities;
                an edge with an endpoint carrying no community is EXCLUDED from
                the denominator, not counted as a cross edge
    code plane  nodes carrying a `community` field (graphify's Leiden output)
    app plane   nodes merged in by scripts/graphify-app-nodes.mjs after clustering

These live in `computeCompartmentMetrics()` in `scripts/graphify-compartments-report.mjs` and are
test-enforced in `scripts/graphify-compartments-report.test.mjs` against a hand-built fixture
whose code-plane and merged cross% deliberately differ (40% vs 50%), so a report that reads the
wrong array cannot pass.

---

## 5. The open lever — SQL-to-code edge resolution

The SQL extractor pass is DONE and was a negative result for compartmentalization:

    metric              pre-SQL   post-SQL   delta
    code-plane nodes    43,129    43,723     +594
    communities         3,769     4,069      +300  (worse)
    singletons          1,270     1,434      +164  (worse)
    cross-community %   17.2      16.7       -0.5  (marginal improvement)

553 SQL-derived nodes now exist that were previously zero, and **171 of them landed as
singletons** — nearly the whole increase. Making SQL visible converted it from "absent" to
"present but disconnected," not "present and compartmented." Edge coverage and
compartmentalization are not the same problem: fixing "the file produces no node" does not imply
"the node has an edge."

Current singleton breakdown by source-file extension (post-SQL, code plane):

    .ts 618 · .tsx 324 · .sql 171 · .py 103 · .yaml 102 · (none) 67
    .json 19 · .mts 14 · .jsx 7 · .md 5 · .js 2 · .mjs 1 · rest 1

(Handoff §4b's tail reads "others 12"; measured directly on the same graph state it is 16 —
`.jsx` 7, `.md` 5, `.js` 2, `.mjs` 1, 1 other. Minor arithmetic slip there, corrected here.)

**The untested lever:** does graphify's extractor even attempt cross-language edges — a
Python/TS `SELECT * FROM table_x` or ORM reference producing a `references`/`queries` edge into
the `.sql` node for `table_x`? Nobody has checked. That is the open question behind the
`graph_compartments_live_verify` check, and it is a research question about the tool, not another
sweep of our own knobs.

**Do not re-run the resolution/hub sweep.** It costs ~2.5 minutes of compute to learn what §1
already says.

---

## 6. The hosted index is a separate artifact on someone else's cadence

`RULE 0.5` makes the hosted graph (`ethanrickyjrjr-wq/SWFL-Data-Gulf`) the first reach. Nothing in
this repo controls when it rebuilds. `.github/workflows/graphify-republish.yml` regenerates the
LOCAL CLI graph and republishes it into the **ops repo's** `brain-graph.json` — a static
visualization snapshot for `/graph`, a completely different artifact from the hosted MCP index at
`api.graphify.com/mcp`. No repo-local script or workflow can force the hosted rebuild.

Measured 08/12/2026: the hosted index was stamped 24 commits behind HEAD, on a commit predating
the `.graphifyignore` push. **"The hosted index is at HEAD" is a snapshot claim that ages, not a
standing guarantee.** Diff its `commitSha` against `git log` HEAD before relying on it.

To test whether `.graphifyignore` reaches the hosted index: wait until the hosted `commitSha` is a
descendant of `0daaaffb`, then check that a term unique to an ignored file (a distinctive
`SESSION_LOG.md` phrase) is ABSENT from `gx_find` results. It cannot be run before then.

---

## 6b. A MISSING EDGE IS NOT A MISSING RELATIONSHIP — the singleton floor, felt at the answer layer

§2/§4's singleton count (1,270 pre-SQL, 1,434 post) is not just a clustering statistic. It is the
reason the graph will confidently tell you two things are unrelated when the code wires them
together on one line.

**Measured 08/12/2026, the worked example.** Asked whether `scripts/graphify-publish.mjs` connects
the local graph to the ops repo's `brain-graph.json`, the hosted index answered that the two are
"independently produced" with "no call, import, or write relationship" and "no traced edge." The
file itself:

    L102  const graph  = JSON.parse(readFileSync(GRAPH_PATH, "utf8"));
    L192  const output = { nodes: outNodes, edges: outEdges };
    L193  writeFileSync(OPS_TARGET, JSON.stringify(output, null, 2));

It is a straight pipe, stated in the file's own header comment at L4-13. `gx_node('OPS_TARGET')`
returns `callees: []`, `callers: []`, and exactly one `contains` edge from the file — a module-level
const indexed as an isolated node, with the `writeFileSync` at L193 never resolved as an edge to it.
The graph was reporting its own index truthfully and the code relationship wrongly.

**The rule that follows:** the graph is authoritative on *what exists* (§RULE 0.5's unknown-unknown
case — it finds nodes grep would never have been asked for). It is NOT authoritative on *what does
not connect*. Module-level consts, config objects, and path literals are exactly the node class that
lands in the singleton floor, so a data-FLOW question ("does A feed B?") answered "no edge found"
must be confirmed by reading the file before it is repeated. Absence of an edge is evidence about
the index, not about the code — the same shape as a `Grep` miss on a gitignored file (RULE 0.95).

**The innocent explanation is ruled out.** The indexed content was not stale or different: the
pushed blob for `scripts/graphify-publish.mjs` is `f9b851d5`, 8,341 bytes — byte-identical to the
working tree (`git hash-object`). The extractor saw line 193 and did not produce the edge.

**How often this can bite, in one number.** The 08/11/2026 measurement of the then-unscoped graph
(`_RESEARCH/agent-behavior/2026-08-11-graphify-community-structure-crawl4ai-research.md`, PART 3)
found **2,093 connected components, with the largest holding only 51.1% of nodes** — plus 308
degree-0 nodes. Roughly half the graph was not edge-reachable from the other half. That is the
structural reason a negative edge answer is untrustworthy, and it is a bigger effect than the
singleton count alone suggests. (Measured pre-`.graphifyignore` on 48,777 nodes; re-measure with
`node scripts/graphify-compartments-report.mjs` before quoting it as current.)

**Generalize by code SHAPE, not by file.** `graphify-publish.mjs` declares only three functions
(`nodeColor` L54, `transformNode` L65, `transformEdge` L84); everything else is top-level module
code, and the one call edge the index holds for the whole file is `transformNode → nodeColor`. That
is the shape the extractor handles worst — a script whose real work happens at module scope rather
than inside functions. Our `scripts/` tree is largely that shape, so treat graph answers about
`scripts/*.mjs` data flow as the weakest case, not a typical one.

Falsifier for this section: a rebuild in which `gx_node('OPS_TARGET')` returns a non-empty
`callers`/`callees`. That would mean the extractor started resolving const-to-callsite edges and
this caveat can be narrowed.

---

## 7. Reproduce

    graphify update . --force                            # --force mandatory, see 2.3
    graphify cluster-only . --resolution 1.0 --no-viz    # code plane ONLY, see 2.1
    node scripts/graphify-app-nodes.mjs                  # app plane merges LAST
    node scripts/graphify-compartments-report.mjs

**This ordering is authoritative; handoff §6's recipe is wrong.** §6 lists
`graphify-app-nodes.mjs` BEFORE `cluster-only`, while its own inline comment on that line says
"app plane merges AFTER clustering" — it contradicts itself, contradicts §2.1, and contradicts
what §4b actually executed. Run it in §6's printed order and `cluster-only` refuses to write
(see 2.1). Verified 08/12/2026.

Graph artifacts are gitignored build products — the state described here lives on one box only.
Snapshot restore point: `bun scripts/graphify-snapshot.mjs restore`
(`C:\Users\ethan\.cache\graphify-brain-platform\snapshot.tar.zst`).

The report reads `graphify-out/graph.json` (~78 MB) and runs fine on node's default heap (verified
08/12/2026, node 24). If a future graph does OOM, add `--max-old-space-size=6144`.
