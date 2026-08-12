# Graphify community structure — what we want, in CS terms, and what we measured

> ## ⚠️ CORRECTION 08/12/2026 — PART 3 IS STALE. DO NOT QUOTE IT.
>
> PART 3's headline finding — the two largest communities are `SESSION_LOG.md` (1,370 + 672 nodes)
> plus ~1,480 nodes of `app/_design` reference bundles, therefore "3,740 compartments is not
> compartmentalization" — was measured on the UNSCOPED corpus. **`.graphifyignore` landed and fixed
> it.** Re-measured on `built_at_commit 2df7e509`:
>
>     largest community    426n   88% refinery/sources
>                          266n   76% lib/email
>                          239n   75% scripts/email
>                          236n   68% lib/deliverable
>                          141n   93% lib/deliverable
>                          140n   91% lib/deliverable
>     communities ≥25 nodes  369   covering 21,027 of 43,723 code-plane nodes
>     singletons           1,434   cohesion range 0.012–0.051
>
> No prose community remains in the top 20 by size. **The detected partition is materially closer to
> PART 7's declared list than this document claims.** What did NOT change: the edge-sparsity floor
> (`docs/standards/graph-compartments.md` §1) and low cohesion everywhere.
>
> **PART 5 item 4 (the drift number) was never built, and PART 7's ~26 compartments were never
> written to disk** — verified 08/12/2026 by grepping the tree for the compartment names and for
> "declared partition": zero hits outside this file.
>
> **PART 2 undersold the tool.** It lists the CLI knobs but not the analysis graphify already writes
> every run — `.graphify_analysis.json` carries per-community cohesion, god nodes, cross-community
> "surprises" with a written why, and generated questions. That omission is what let a later session
> propose BUILDING a metric the tool had already computed. See CLAUDE.md RULE 0.5b.
>
> Reproduce any number above with `node scripts/graphify-compartments-report.mjs`.

**Date:** 08/11/2026
**Lane:** RULE 0.4 (ours first, then crawl4ai) + RULE 0.5 (probe the real artifact)
**Operator ask (verbatim):** *"Instead of one big yarn ball of paths, we need to put the things that
are mostly related together together. Email design goes with email design, email sending with email
sending… easier for Claude to work in the area it is supposed to be in and easier for me to see when
we have too many routes for one thing or neighbors data not connected to anything."*

**Sources crawled in-session (crawl4ai, 08/11/2026):**
- https://graphify.com — hero, community/god-node explainer
- https://graphify.com/docs — quickstart, MCP tool list
- https://graphify.com/docs/cli — CLI reference
- https://graphify.com/concepts — build model, EXTRACTED/INFERRED/AMBIGUOUS provenance
- https://raw.githubusercontent.com/Graphify-Labs/graphify/main/README.md — tech stack, flags
- https://www.reddit.com/r/ClaudeAI/comments/1ukf99y/... — "Code graphs are solving the wrong problem"
- Reddit r/ClaudeAI search "graphify" — also "Graphify Test Does Not Look Good", "I benchmarked
  5 token saving tools… the 60-90% claims didnt hold up" (titles captured; bodies not read)

**PRIOR RESEARCH CHECKED FIRST — one near-collision, resolved.**
`_RESEARCH/competitor-and-strategy/2026-08-11-standing-technology-rejections.md` §3 carries
**"k-means / runtime clustering — REJECTED TWICE (07/22/2026)"**, verdict verbatim *"at our N it is
theater"*, backed by `_RESEARCH/real-estate-market/2026-07-22-kmeans-clustering-applicability.md`.
**That rejection does NOT cover this work, and the distinction must be stated so no future session
reads a false collision.** It rejects clustering *SWFL market data at runtime* — grouping a few
hundred properties or comps that carry no edges, where the clusters would then be *served to a user*
as if they meant something. What PART 5–7 propose is clustering the **code dependency graph**: 48,777
nodes and 83,716 real, extracted edges, offline, as an internal architecture instrument that is never
rendered to a customer and never produces a number in a deliverable. Different N by two orders of
magnitude, different data (edges exist and are AST-extracted, not invented from a distance metric),
different consumer. The "at our N it is theater" argument is about a rounding error of market rows;
it does not transfer. Also checked and non-overlapping:
`2026-07-22-naive-bayes-knn-algorithm-fit.md`, `_RESEARCH/private/brains-for-stocks-architecture.md`.
A `docs/` grep for community detection / Leiden / Louvain / god node returned **zero files** — this
is the first time the topic has been written down here.

**Local source of truth read directly (not from docs):**
`C:\Users\ethan\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\graphify\cluster.py`
and `cli.py` — the installed package, which carries flags the published CLI reference omits.

---

## PART 1 — The names for what the operator is describing

This is not a vague preference. Every piece of it is a named, decades-old problem with published
algorithms. The list below is the vocabulary to use so we stop re-describing it each session.

**"Put the things that are mostly related together"**
= **community detection** / **graph clustering**. The objective function is **modularity (Newman's
Q)** or the **Constant Potts Model**. Algorithms: Louvain, **Leiden** (Traag et al., strictly better
— guarantees no internally-disconnected communities), Infomap, Label Propagation. Graphify already
runs **Leiden via graspologic** (confirmed in its README tech-stack line and in `cluster.py:48`).

**"Break it down even further — what type, what pages"**
= **multi-resolution / hierarchical community detection**. Controlled by the **resolution parameter
γ**. γ > 1 → more, smaller communities; γ < 1 → fewer, larger. The reason you need it at all is the
**resolution limit** (Fortunato–Barthélemy): plain modularity maximization is mathematically unable
to see communities below a size that scales with the whole graph, so a big repo's small-but-real
modules get swallowed. Nested levels = a **dendrogram**.

**"Email design with email design"** (semantics, not just topology)
= **bounded contexts** (Domain-Driven Design) and, in the graph literature, **semi-supervised /
constrained community detection** — you supply must-link / cannot-link seeds instead of letting the
algorithm guess. The measure of whether the detected partition matches your intended one is
**NMI (normalized mutual information)** or **ARI (adjusted Rand index)** between the two partitions.

**"Easier for Claude to work in the area it is supposed to be in"**
= **architecture conformance checking** / **architecture erosion (drift) detection**. Declare the
intended module boundaries, then continuously test the real graph against them. In practice this is
an **architecture fitness function** (ArchUnit in Java, dependency-cruiser / Nx module boundaries in
JS). Our declared partition already exists: `docs/section-map.md`'s five sections plus the eight area
`CLAUDE.md` files. Nothing has ever compared it to the detected partition.

**"Too many routes for one thing"**
= high **fan-in / fan-out**, **god nodes** (hubs), and **redundant parallel paths** between the same
two modules. The precise metric is **Guimerà–Amaral cartography**: for each node compute the
**within-module degree z-score** (how central inside its own community) and the **participation
coefficient P** (how evenly its edges spread across other communities). That two-axis plot classifies
every node as ultra-peripheral, peripheral, **connector**, **provincial hub**, **connector hub**, or
**kinless**. A concept that should have one root but has four connector hubs is visible instantly.
This is the graph-theory twin of `data-roots.md`'s "one root per concept."

**"Neighbors data not connected to anything"**
= **isolated nodes (degree 0)**, **weakly connected components** other than the giant component, and
— for our data plane — the **dark roots** already tracked in `ingest/cadence_registry.yaml`
(`consuming_pack: none`). Dead code detection is the same query run the other direction:
**unreachable nodes from any entrypoint**.

**Quality of a compartment, as a number**
= **conductance** and **cut ratio** (fraction of a community's edges that leave it — lower is a
cleaner boundary), and **cohesion** (intra-community edges over possible intra-community edges).
Graphify computes cohesion already (`cluster.py: cohesion_score`) and uses it to re-split
low-cohesion communities.

**The Rubik's-cube-to-circle image on graphify.com**
= a **Design Structure Matrix (DSM)** reordered into **block-diagonal** form. Baldwin & Clark's
*Design Rules* is the canonical reference. Blocks on the diagonal are modules; everything off the
diagonal is coupling you either designed on purpose or are paying for by accident. It is the same
information as the force-directed circle, but a DSM makes "too many routes for one thing" a visible
rectangle instead of a hairball.

**Names for the whole exercise:** *software module clustering*, *software architecture recovery*,
*remodularization*. Classic tool: **Bunch** (Mancoridis et al.), which optimizes a **Modularization
Quality (MQ)** score — intra-cluster cohesion minus inter-cluster coupling. That is literally the
1998 version of what the operator asked for.

---

## PART 2 — What graphify actually gives us (read from the installed package, not the docs)

Graphify already does community detection, god nodes, and cohesion-based splitting. The knobs are
real but **three of them are undocumented on graphify.com/docs/cli** — they exist only in the
installed `cli.py`:

- `graphify cluster-only <path> --resolution <float>` — Leiden γ. Default **1.0**.
  (`cli.py:1751-1754`, applied at `cli.py:1822`.)
- `graphify cluster-only <path> --exclude-hubs <percentile>` — nodes above that degree percentile are
  **held out of partitioning** and reattached afterwards by majority-vote of their neighbours, so a
  super-hub stops dragging unrelated subsystems into one blob (`cli.py:1755-1758`, `cluster.py:163+`,
  upstream issue #919). This is the direct fix for `lib/` (in-degree ~684) smearing across everything.
- `graphify extract <path> --resolution / --exclude-hubs` — same two knobs on the full extract path
  (`cli.py:2853-2942`).
- `graphify label <path>` — re-name communities with an LLM backend; `--missing-only` keeps existing
  names. Names persist in `graphify-out/.graphify_labels.json` and are re-attached across rebuilds
  by node-overlap (`cli.py:1824`), so **hand-written community names survive a re-cluster**.
- `--min-community-size=N` (default 3) on `cluster-only` / `label`.
- `.graphifyignore` — corpus scoping. **We do not have one.**
- `graphify god-nodes --top N --json` — hub list, machine-readable.
- `graphify affected "X" --depth N` — reverse blast radius.
- `graphify tree` — D3 collapsible **hierarchy** HTML; `export callflow-html` — Mermaid architecture view.
- `graphify diagnose multigraph` — same-endpoint edge collapse risk.
- `graphify merge-graphs` / `global add` — cross-repo graphs (relevant to the /go carve-out).
- `graphify prs --conflicts` — which open PRs touch the same **communities**. Merge-risk before conflict.
- `save-result` / `reflect` — a feedback loop: record whether a graph answer was `useful` /
  `dead_end` / `corrected`, aggregate into `LESSONS.md` with a 30-day half-life.

Internals worth knowing (`cluster.py`):
- Community IDs are **stable across runs** (seed 42, size-descending re-index with a total-order
  tiebreak) — a cid diff is a real structural change, not churn.
- Communities larger than **25% of the graph** are automatically re-split.
- A second pass re-splits any community whose cohesion falls below threshold, specifically because
  **doc hub nodes like `CLAUDE.md` bridge unrelated subsystems** — the upstream author hit our exact
  problem and patched around it.

---

## PART 3 — What we measured on OUR graph, 08/11/2026

`graphify-out/graph.json`, 90.9 MB, rebuilt 08/11/2026 19:59.

    nodes                     48,777
    edges                     83,716
    communities                3,740
    singleton communities      1,266
    communities of size ≤3     1,572   (covering 1,944 nodes)
    communities of size ≥50      167
    isolated nodes (degree 0)    308   (0.6%)
    connected components       2,093   — largest holds only 51.1% of nodes
    cross-community edges     19.9%

**3,740 compartments is not compartmentalization. It is the yarn ball with extra steps.**

The top communities by size, with the dominant source folder and the auto-assigned label:

    c16   1,370n  100% SESSION_LOG.md          "SESSION_LOG.md"
    c0      672n  100% SESSION_LOG.md          "SESSION_LOG.md — Append-Only Cross-Ses…"
    c1      582n  100% app/_design             "$"
    c2      330n   65% lib/deliverable + lib/email        "EmailDoc"
    c3      315n  100% app/_design             ".check"
    c4      313n  100% _ASSISTANT              "SCRATCHPAD.md"
    c5      269n  100% app/_design             "$n"
    c7      266n   86% lib/email               "doc/types.ts"
    c8      248n  100% app/_design             "bv"
    c1899   247n   19% lib/lab-entry+email+deliverable   "ProjectEmailLabClient.tsx"
    c9      229n   31% refinery/lib+constitution+packs   "brain-output.mts"
    c11     221n   74% scripts/email           "shared.ts"
    c14     209n   92% lib/deliverable         "market-comps.ts"
    c17     200n   28% lib/social+email+listings         "build-week.ts"
    c18     199n  100% app/_design             "meteo-ashwyn-bundle.beauty.js"
    c20     194n   58% lib/email + lib/deliverable       "agent-brand-intro.ts"
    c23     174n   59% lib/email + app/api     "blast/route.ts"

Four defects fall straight out of that table:

1. **The two biggest communities in the entire repo are `SESSION_LOG.md`** — 2,042 nodes of an
   append-only changelog. `_ASSISTANT/SCRATCHPAD.md` is another 313. Prose is outranking code.
2. **`app/_design` occupies six separate communities (~1,793 nodes) labelled `$`, `.check`, `$n`,
   `bv`, `es`, `meteo-ashwyn-bundle.beauty.js`.** Confirmed by printing the distinct `source_file`
   values per community rather than inferring from the labels: **c1 (582n), c5 (269n), c8 (248n) and
   c22 (180n) each resolve to exactly ONE file — `app/_design/assets/reference-builds/
   pudding-happy-map-page-component.beauty.js` — and c3 (315n) is that same file plus one animejs
   example. c18 (199n) is `meteo-ashwyn-bundle.beauty.js`.** So roughly **1,480 nodes, the largest
   block in the repo after the changelog, come from TWO downloaded beautified reference bundles.**
   They are design references we saved to look at, being AST-parsed as if they were our source.
3. **Email is scattered across at least seven communities** (c2, c7, c11, c14, c17, c20, c23, c1899)
   at purities from 19% to 92%. The operator's "email design with email design" is not happening —
   and the reason is visible: `lib/email` and `lib/deliverable` interleave everywhere.
4. **Auto-labelling names a community after its biggest node, not its job.** `$` and `.check` are not
   names. This is why the graph is unreadable to a human scanning for "where is email sending."

**Ruled out — the singletons are NOT our merge script.** `scripts/graphify-app-nodes.mjs` patches
app-plane nodes into `graph.json` *after* Leiden runs, so the obvious suspicion is that our own
script injects unclustered nodes and inflates the count. Checked by tallying `_origin`: all nodes =
`ast:46,941 semantic:1,754 (none):82`. Only 82 nodes carry no origin, so the merge script is not the
driver. **Singleton communities are `semantic:1,134 / ast:132` — 90% of them are LLM-extracted
concept nodes from docs that never got connected to anything.** That is a different fix from
resolution tuning: it is corpus scoping (item 1 below), not γ.

Nothing here is a graphify failure. It is **an unscoped corpus at default resolution with no hub
exclusion and no declared intended partition to check against.**

---

## PART 4 — The skeptic lane (Reddit, same day)

Three r/ClaudeAI threads push back on code graphs; the substantive one is
`1ukf99y` — *"Code graphs are solving the wrong problem for coding agents"* (Comprehensive_Quit67,
~1 month old, pitching a competing tool, Greplica). Argument, verbatim in substance:

> "A coding session first tries to find the exact reasoning of how things work in your codebase, it
> derives it by grepping all over and tries to rebuild context… If we start saving these
> understandings, as well as nuances that you explained in your sessions, and then pass it along to
> your agent — it reduces the wandering."
> …"I do not want to replace Claude's code exploration. That's the agent's job. I want to save the
> part Claude learned after the exploration."

Also: *"If repo graphs gave agents a step-change in performance, either Cursor would have
incorporated it, or one of these tools should be worth $60B."* Self-reported Greplica numbers: ~50%
fewer planning tokens, ~30% planning time saved. **Vendor-reported, benchmarked by the vendor, not
independently verified — treat as a claim, not a fact.** Two further threads exist and were not read:
*"Graphify Test Does Not Look Good"* (`1vg2tvy`) and *"I benchmarked 5 token saving tools across
Codex and Claude code. The 60-90% token saving claims didnt hold up"* (`1viyokr`). Titles captured
08/11/2026; **bodies unread — do not cite their contents.**

**Why this matters to us and does not overturn the decree.** The critique is aimed at the graph as a
*retrieval* mechanism (grep replacement). Our operator's ask is different and the critique does not
touch it: he wants the graph as an **architecture instrument** — compartments, over-routing,
orphans. Nothing about "the agent still needs to read code" argues against that. The honest read is
that the two are complementary, and graphify already ships the memory half the critique asks for
(`save-result` / `reflect` → `LESSONS.md`), which we have never turned on.

---

## PART 5 — What we want, stated exactly

1. **A scoped corpus.** A `.graphifyignore` that excludes minified/vendor bundles under
   `app/_design`, and treats `SESSION_LOG.md` / `_ASSISTANT/*.md` as non-nodes. Target: the graph is
   code plus the docs that describe code, nothing else.
2. **A declared intended partition** — the compartments, written down, one line each, derived from
   the five sections in `docs/section-map.md` and the eight area `CLAUDE.md` files, but broken finer
   where the operator asked: email *design* vs email *sending* vs email *recipes*; website by page
   family; ingest by source; refinery by stage.
3. **A tuned detected partition** — `--resolution` raised until compartment count lands in the tens,
   not thousands, and `--exclude-hubs` set so `lib/` stops smearing. Verified by cohesion and
   cross-community edge share, not by eyeballing the picture.
4. **A drift number.** NMI/ARI (or a plain purity table like PART 3's) comparing declared vs
   detected, regenerated on every graph rebuild. When a new file lands in the wrong compartment, the
   number moves. That is the mechanism the operator has asked for repeatedly and never gotten:
   *"I still find out we build different ways."*
5. **Two standing reports:** over-routing (Guimerà–Amaral connector hubs / multiple roots for one
   concept) and orphans (degree-0, non-giant components, and `consuming_pack: none` dark roots in one
   place instead of two).
6. **Hand-written community names that persist** — `.graphify_labels.json` survives re-clustering by
   node overlap, so naming a compartment "Email — sending & blast" is durable, not cosmetic.

**Not yet decided and not assumed:** whether this ships as a repo script, a hook, or an /ops page.
That is a build decision requiring RULE 3.5 brainstorming and operator sign-off.

---

## PART 6 — WHICH GRAPH. The caveat that decides whether any of this matters.

There are **three** graphs in this system and they are not the same artifact:

1. **Local `graphify-out/graph.json`** — 90.9 MB, gitignored build product. Built by
   `bun run graphify:update` = `graphify update .` then `scripts/graphify-app-nodes.mjs`.
   **This is what PART 3 measured.**
2. **The ops `/graph` page snapshot** — `swfldatagulf-ops/app/graph/brain-graph.json`, a transformed
   subset of #1 written by `scripts/graphify-publish.mjs`. Regenerated daily at 07:37 UTC by
   `.github/workflows/graphify-republish.yml` (green 8-of-8 runs since the 07/16/2026 PAT re-mint).
3. **The HOSTED graphify MCP index** — `https://api.graphify.com/mcp`, repository
   `ethanrickyjrjr-wq/SWFL-Data-Gulf`. **This is the one CLAUDE.md RULE 0.5 decrees sessions query
   first**, precisely because the local artifact was measured stale on 08/11/2026.

**`--resolution` and `--exclude-hubs` are CLI flags on a LOCAL run. They reach #1 and therefore #2.
There is no evidence they reach #3.** Whether `.graphifyignore` propagates to the hosted index is
**UNVERIFIED** — it is a repo file, so it plausibly does, but plausibly is not verified.

**UPDATE, same day — crawl4ai of https://graphify.com/mcp makes the likely answer NO.** Their own
FAQ, verbatim: *"Does it send my code anywhere? **No. The server reads a local graph.json and runs on
your machine (HTTP binds to 127.0.0.1 by default). There is no hosted backend and no telemetry.**"*
And: *"Graphify also hosts a separate docs-search MCP server at graphify.com/api/mcp with a single
tool, `search_graphify_docs`, for querying the documentation."*

Neither of those is what we have wired. `.mcp.json` points at **`https://api.graphify.com/mcp`** — a
different host from the documented `graphify.com/api/mcp` — and the tools it exposes (`gx_rank_files`,
`gx_callers`, `gx_impact`, `gx_trace`, `gx_tests_for`, `gx_find`, `list_repositories`, `remember`,
`recall`, `ingest_turns`) match **neither** the 10 documented local tools **nor** the single
docs-search tool. So we are talking to a real hosted code index that graphify.com's public MCP page
does not describe — consistent with the gated Enterprise / `app.graphify.com` product, but that is
inference, not something read.

**What this changes:** if that index is built server-side from our GitHub repo, then a *local* CLI
flag cannot possibly reach it, and `.graphifyignore` reaching it depends entirely on whether their
indexer honors the file. **Unknown, and now the single highest-value thing to test.** Test is cheap:
commit a one-line `.graphifyignore` excluding one uniquely-named symbol's file, push, wait for
re-index, then ask the hosted graph for that symbol. Note the latency — re-index is not instant and
the wait is not measured.

This is the discriminating question and it must be answered before any tuning work is scheduled.
Tuning #1 while sessions query #3 is the *fixed-but-not-live* strike shape, which already has five
strikes in `_ASSISTANT/STRIKES.md`. Everything else in PART 5 (scoping, the declared partition, the
drift number, the two standing reports, the named compartments) survives either answer, because they
are repo artifacts rather than CLI invocations.

---

## PART 7 — THE COMPARTMENTS, WRITTEN OUT

The operator asked for the list, not a description of a list. This is the proposed **declared
partition**: the compartments we intend, at the grain he asked for (email split by job, website
split by page family). Every path below was verified to exist on disk 08/11/2026 (`ls -d lib/*/`,
`app/*/`, `app/api/*/`, `refinery/*/`). **Proposed, not ratified — this is a C1/C2 shape decision
needing sign-off.**

**EMAIL — 5 compartments, currently smeared across 7+ detected communities**
- `email/design` — the chrome, type scale, grid, branding: `lib/email` layout+chrome, `lib/brand`,
  `lib/templates`, `app/_design` (source files only, never the reference-build bundles)
- `email/recipes` — the 17 authored recipes and their guards: `lib/email` recipe modules,
  `lib/narratives`, `lib/figures`
- `email/assembly` — the shared pipe: `lib/deliverable`, `lib/lab-entry`, `lib/export`, `lib/pdf`
- `email/sending` — blast, unsubscribe, CAN-SPAM, delivery: `app/api/email`, `app/api/unsubscribe`,
  `app/api/deliverables`, `lib/campaigns`
- `email/lab-ui` — the operator surface: `app/email-lab`, `components/email-lab`, `app/api/email-lab`,
  `app/api/lab`, `scripts/email`

**WEBSITE — 6 compartments, by page family (his "break it down to what type or what pages")**
- `web/marketing` — `app/(landing)`, `lib/landing`, `app/for-agents`, `app/showcase`, `app/guides`
- `web/report-pages` — `app/r`, `app/z`, `app/zip-*`, `lib/zip-report`, `lib/zip-summary`,
  `lib/report`, `lib/citations`
- `web/map` — `app/map`, `lib/map`, `lib/geo`
- `web/charts` — `app/charts`, `components/charts`, `lib/charts`
- `web/account` — `app/account`, `app/@accountModal`, `app/billing`, `app/settings`, `app/login`,
  `app/auth`, `lib/auth`, `lib/billing`, `lib/identity`
- `web/project` — `app/project`, `app/p`, `lib/project`, `lib/briefcase`, `lib/contacts`

**ANSWER ENGINE — 2**
- `answer/assistant` — `lib/assistant`, `app/ask`, `app/api/assistant`, `app/api/chat`
- `answer/mcp` — `app/api/mcp`, `app/api/b`, `mcp-widget`, `refinery/lib/rules-of-engagement.mts`

**BRAIN FACTORY — 4** (matches the real `refinery/` layout, not an invented one)
- `refinery/packs` · `refinery/stages` (+ `agents`, `render`, `post`)
- `refinery/sources` (+ `context`, `config`) · `refinery/guards` (`validate`, `vocab`,
  `constitution`, `grade`, `types`)

**DATA INGEST — by source family, not one blob**
- `ingest/parcels` · `ingest/permits` · `ingest/census` · `ingest/listings` · `ingest/market`
  · `ingest/env` — plus `ingest/cadence_registry.yaml` and the GHA cron wrappers as their own
  `ingest/scheduling` compartment

**SOCIAL — 1** `lib/social`, `lib/social-pulse`, `app/social-lab`, `app/api/social`

**OPS / PLATFORM — 2** `lib/supabase`+`lib/observability`+`app/api/cron`+`app/api/webhooks`;
and `scripts/`.

That is **~26 compartments.** Not 5 (too coarse to answer "which email surface"), not 3,740.
The test of whether it is right is not aesthetics: it is whether the **detected** Leiden partition,
run on a scoped corpus at a tuned γ, lands within shouting distance of it. Where it doesn't, one of
the two is wrong — and that disagreement is exactly the signal the operator has been asking for.
