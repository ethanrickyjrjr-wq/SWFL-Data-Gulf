# Handoff — graphify hosted index: reindex verified, and where the tool lies

**Session:** 08/12/2026 (Opus 5). **Repo:** brain-platform, branch `main`.
**Companion doc:** `docs/handoff/2026-08-12-graph-compartments-step2-negative-result.md` (clustering knobs).
**Prior research:** `_RESEARCH/agent-behavior/2026-08-11-graphify-community-structure-crawl4ai-research.md`.

Everything below was measured in-session. Where a number came from a command, the command is named.
Nothing here is inferred from the vendor's marketing or from memory.

---

## 1. One-line state

The hosted index now carries prose, honors `.graphifyignore`, and returns exact resolved call edges —
all four verified live. **But the dashboard's narrative view fabricates call chains and mislabels
symbol kinds, and the index serves ghost nodes for deleted files.** The MCP tools and the dashboard
prose are not the same instrument and must not be trusted the same way.

---

## 2. Three artifacts, still distinct — do not conflate

1. **Hosted MCP index** — `api.graphify.com/mcp`, repository `ethanrickyjrjr-wq/SWFL-Data-Gulf`.
   The `mcp__graphify__gx_*` tools. This is the first reach per RULE 0.5.
2. **Local artifact** — `graphify-out/graph.json`, gitignored build product, rebuilt only by
   `bun run graphify:update`. Stale by definition. Served by the `graphify-local` MCP server, which
   is wired in `.mcp.json` and already answers prose questions.
3. **Ops published snapshot** — rendered at `app/graph/page.tsx` in the swfldatagulf-ops repo off a
   published `brain-graph.json`. A third copy on its own cadence.

---

## 3. Reindex: before and after (measured via `graph_stats`)

Before, at commit `658c25ba`, 31 commits behind HEAD:
- 20,798 nodes · 49,152 edges · 792 communities
- Two prose probes returned zero markdown nodes.

After, buildId `61ecb33c`, commit `2e0f6087`:
- 21,997 nodes · 43,290 edges · 1,882 communities

Reading the deltas honestly:
- **Nodes barely moved** because two changes cancelled — docs came in, `.graphifyignore`d blobs went out.
- **Edges dropped ~6k** because the removed files were hubs, not leaves.
- **Communities more than doubled** — that is the intended compartmentalization, not a regression.

Local artifact for contrast, last measured: 43,814 nodes, 19,717 of them markdown, all 110 tracked
`_RESEARCH/` files present, 4,069 communities, 1,434 singletons (618 `.ts`, 324 `.tsx`, 171 `.sql`,
103 `.py`, 102 `.yaml`).

**Cadence caveat, and it matters.** A same-day `graph_stats` recheck found the hosted index stamped
24 commits behind actual HEAD, on a commit predating that day's `.graphifyignore` push. Nothing in
this repo controls the reindex cadence. "At HEAD" is a snapshot claim that ages — check `commitSha`
against `git log` before trusting freshness.

---

## 4. The four wins, each verified

1. **Docs are indexed.** `gx_find "Data Roots"` returns 2 markdown matches typed document/concept.
2. **Docs are connected, not floating.** `data-roots.md` resolves to 39 symbols and 11 neighbour
   files over typed `references` edges at confidence 0.75–1.0, reaching into `_RESEARCH/` and
   `_ASSISTANT/RULES.md`.
3. **`.graphifyignore` propagates to hosted.** `gx_find "SESSION_LOG"` returns `n=0`. This settles the
   question the 08/11 research left explicitly open and flagged as the highest-value thing to test.
4. **Prose questions rank correctly.** A prose query now ranks `data-roots.md` first.

---

## 5. THE TRUST BOUNDARY — the most important section

### 5a. The MCP tools are exact. Verified end to end.

Worked example, `run_schema_drift` → `read_live_schema` in `ingest/scripts/check_data_quality.py`:

- Graph said: `run_schema_drift()` calls `read_live_schema()`, provenance **extracted**, 3 sources.
- `gx_callers(read_live_schema, strict_calls=true)` → exactly 2 callers, both confidence 1:
  `run_schema_drift()` defined L286, call site L299; `main()` defined L524, call site L553.
- File confirms: `read_live_schema` L254, `run_schema_drift` L286, the call at L299.
- Third source confirms: `ingest/tests/quality/test_contract_registry.py:303` asserts
  `tables["data_lake.zhvi_swfl"]["schema_baseline"] is True`.

Every claim held. When the sources are labeled **extracted**, act on the answer.

### 5b. The dashboard's narrative view invents call chains. Two confirmed instances.

**False chain #1.** Dashboard reported:
`useAnimatedSeriesPath() → computeSeriesPathPoints() → interpolateSeriesPathPoints() →
seriesPathFromPoints() → seriesPathTransitionSignature()`.

Reality — all four are sibling top-level exports in
`components/charts/vendor/bklit/series-path-utils.ts` at L12, L30, L68, L81, and **none of them
appears inside any other**. `components/charts/vendor/bklit/use-animated-series-path.ts` imports all
four at L7–L11 and calls them itself at L54, L66, L112, L119, L159. It is a **star**, not a chain.
The strict-call probe agreed with reality, not the dashboard: `gx_callees(computeSeriesPathPoints,
strict_calls=true)` → empty; `gx_callers` → exactly one caller, call site L66, confidence 1.

**False chain #2.** Dashboard reported `SiteFooter() → isHiddenPath() → isChromeFree()`.

Reality — `isHiddenPath` and `isChromeFree` are siblings in `components/nav/nav-config.ts` at L131
and L146. `components/nav/SiteFooter.tsx:6` imports both, and L59 reads
`if (isHiddenPath(pathname) || isChromeFree(pathname)) return null;`. One caller invoking both inside
a single condition. Neither calls the other.

**The pattern is identical in both:** siblings used together by a common caller, reported as one
calling the next. That is a systematic behaviour of the narrative layer, not a one-off.

### 5c. It mislabels symbol kinds. Six confirmed, all called "Function".

- `SeriesPathPoint` — `export interface`, `series-path-utils.ts:6`
- `PathStrokeMetrics` — `interface`, `path-stroke-utils.ts:28`
- `EMPTY_METRICS` — `const`, `path-stroke-utils.ts:33`
- `ASSISTANT_DOCKED_PATHS` — `export const`, `lib/briefcase/pill-mount.ts:65`
- `ENV_PATH` — `const`
- `paths` — a key in `tsconfig.json`

### 5d. It serves ghost nodes for deleted files.

`lib/email/author-recipes.ts` returns nodes but is not on disk. It was deleted in commit `77f28c68`,
which **is an ancestor of the indexed commit `2e0f6087`**. So this is not reindex lag — the index
retained nodes for a file that was already gone at the commit it claims to represent.

### 5e. The single cheapest tell

**Read the provenance label on every source.**
- All sources **extracted** → the parser saw it in the AST. Trust it.
- All sources **inferred** → a model connected the dots. Verify before acting.

The verified-correct schema-drift answer was 3-for-3 extracted. The fabricated four-hop chain was
21 sources, every single one inferred.

---

## 6. Question shapes — what works, what fails

**Works** (returns exact line numbers and confidence):
- Who calls this named symbol.
- What does this named symbol call.
- What does this file connect to.
- Which document describes this concept.
- Find symbols matching a fragment.

**Fails, predictably:** anything phrased as a set difference — "which tables have no consumer",
"which pipelines nobody reads". The retrieval scatters and returns nothing usable. A live attempt at
"which `data_lake` tables are written by an ingest pipeline but never read by any pack, brain, or
email recipe" produced no answer. **That class of question is a script, not a prompt.**

**Also worth knowing:** it abstains honestly. Asked a question shape with no concrete symbol in it —
"what calls a function you're about to change" — it replied that it had no grounded path and would
not guess. A retrieval layer that always answers tells you nothing by answering; this one's refusals
are what make its assertions worth something. **Fill the symbol name into the question before asking.**

---

## 7. Worked example, fully run to ground (useful as a template)

The graph generated its own follow-up: *does `read_live_schema()` get fooled the same way
`information_schema.tables` does for view-vs-table detection, given the LANDMINE in the pg_catalog
tests?*

Answer: **no**, and the reasoning is worth keeping.

- `read_live_schema` (`check_data_quality.py:254-263`) selects `column_name, data_type` from
  `information_schema.columns`. It never asks the view-vs-table question at all.
- The landmine (`ingest/tests/scripts/test_doctor.py:16`) is about `information_schema.tables`
  reporting the wrong relkind — a different catalog view answering a different question.
- **Live probe, run 08/12/2026 against the real database:** `read_live_schema("data_lake.zhvi_swfl")`
  → 12 columns; `read_live_schema("data_lake.listing_active_stats")` (a view) → 7 columns, clean.
  `pg_class.relkind` → `r` and `v`. Over a **direct** psycopg connection `information_schema.tables`
  correctly reports BASE TABLE and VIEW.
- **Therefore the landmine is specific to the lake MCP proxy path**, exactly as that test's docstring
  scopes it. That scoping is load-bearing, not throat-clearing.
- **The answer was already written on disk, twice, a month earlier:**
  `docs/audit/2026-07-11-pipeline-problems/08f-code-surface.md:101` predicted it and recorded
  `cols_visible = 7` — the same 7 measured live today — and the same note is inline at
  `ingest/quality/quality_registry.yaml:239`.

---

## 8. Incidental findings (not the task, but real)

- **`scripts/check-lake-reads.mts` already exists** (dated 07/21/2026). A ratchet on raw lake reads in
  page/loader code, written after `/desk` rendered blank and `/charts` showed a database error to real
  visitors. Do not rebuild it.
- **Leftover workflow worktrees inflate every repo-wide search.** `.claude/worktrees/wf_80061966-e13-101`,
  `-102`, `-103` hold full duplicate copies of the tree. A tree-wide grep currently matches the same
  file three or four times, which quietly corrupts any count taken that way. It also made one grep
  exceed a 120-second timeout. **Not touched — needs a decision on whether they are safe to remove.**

---

## 9. Open questions

- How many hosted doc nodes are genuinely edgeless (outer ring) versus connected.
- Whether extracted-vs-inferred provenance is exposed per edge in every tool, or only in some.
- What pushed commit `7a2b1ee9` 11 seconds after it was made (measured via `git reflog show origin/main`:
  commit 09:52:52, origin moved 09:53:03). The post-commit hook contains no `git push`. **Actor still
  unidentified — do not narrate a cause for this.**

---

## 10. Owed and NOT done — nothing here is approved

None of the following has operator sign-off. Do not execute without asking.

1. **Amend RULE 0.5 in `CLAUDE.md`** — hosted now carries prose, honors `.graphifyignore`, returns
   exact resolved call edges; plus the §5 caveat that the dashboard narrative view is not structure.
2. **`SESSION_LOG.md` entry** for these findings.
3. **File this under `_RESEARCH/agent-behavior/` with its line in `_RESEARCH/INDEX.md`** — this is a
   RULE 0.4 obligation and it closes the propagation question the 08/11 research left open. Unindexed
   research does not exist.
4. **Rebuild the stale local artifact** (`bun run graphify:update`), last measured 13 commits behind.
5. **The `architecture-drift-no-detector` guard is still OWED** (`_ASSISTANT/STRIKES.md`) — a
   declared-vs-detected partition diff regenerated on every graph rebuild. Section 6 is the reason it
   must be a script: it is a set-difference question, and those do not survive this retrieval.

**Uncommitted in the working tree right now:** `_ASSISTANT/STRIKES.md` and `_ASSISTANT/SCRATCHPAD.md`.

---

## 11. Reproduce

```
node scripts/graphify-compartments-report.mjs
bun run graphify:update
```

Load the hosted tools in one round-trip — they are deferred, and that asymmetry against pre-loaded
Grep/Read is the documented reason the graph went unqueried while wired:

```
ToolSearch("select:mcp__graphify__gx_rank_files,mcp__graphify__gx_callers,mcp__graphify__gx_impact,mcp__graphify__gx_trace,mcp__graphify__gx_tests_for,mcp__graphify__gx_find")
```
