<!-- SESSION-LOG-RULE-MARKER do-not-delete -->

# RULE 0 — SESSION_LOG.md (NON-REMOVABLE)

**Locked. Do not delete this block or the marker above it.**

1. **Read first.** SessionStart hook prints recent entries — trust the log over memory.
2. **Write before push.** Append a new top-of-file entry (what changed, what's next, PR link) before every `git push`. Commit it in the same push.
3. **Hook-enforced.** `.claude/hooks/check-session-log-on-push.mjs` blocks push when no commit ahead of upstream touched `SESSION_LOG.md`.
4. **Append-only.** Never rewrite past entries. Add a correcting entry on top if something was wrong.
5. **No fabrication.** Only log work you can show in `git log` / `git diff`.

---

# RULE 0.4 — RESEARCH FIRST (ours, THEN crawl4ai), THEN FIX

**Locked 2026-06-22. Amended 07/20/2026 — our own research comes first.**
**No fix, no answer, no plan until you've researched the real answer.**

0. **READ OUR OWN RESEARCH FIRST — AND `_RESEARCH/` IS NOT ALL OF IT.**
   **DESIGN / TYPE / COLOR / SPACING questions do NOT start at `_RESEARCH/`. They start at
   `app/_design/05-color-and-type.md` (committed) and `docs/design-reference/colors_and_type.css`
   (UN-GITIGNORED 08/06/2026).** Those name the fonts outright — Inter display + body, JetBrains
   Mono, tabular figures on every number — plus the full scale, leading, tracking and 8px tokens.
   **Postmortem that forced this line (08/06/2026):** asked "are these the fonts we want, based on
   the gitignored research," a session grepped only `_RESEARCH/`, found no typeface, and answered
   *"there is no research basis for our six families."* The answer was on disk the whole time, in a
   folder this rule never named. `ingest/pipelines/report_design_research/crawl_report_designs.py`
   — the "find the best-looking and recreate it" typography crawl of Chartr, Axios Markets, Morning
   Brew, The Daily Upside and Redfin Data Center — is also written and **has never been run.**
   Run `git status --ignored --short` before ever concluding research does not exist.

0b. **THEN `_RESEARCH/INDEX.md`.** ALL research lives in `_RESEARCH/`.
   **NO LONGER GITIGNORED — 93 files un-ignored and TRACKED 08/11/2026 by operator decree so the
   hosted graph can index them** (*"make everything not gitignored, we are public anyway"*). This
   repo is PUBLIC, so research now ships: write it clean, and **no credentials, no client PII, no
   personal financial notes** — the pre-publish sweep found only a false positive, keep it that way.
   The upside is the point: research nobody can find governs nothing, and a gitignored file is
   invisible to graphify on EVERY tier — paying does not fix it, tracking does.
   Consolidated there 07/20/2026 by operator decree: agent-behavior, audits (was `docs/audits/`), competitor-and-strategy (was
   `docs/steadyapi-research/`), data-and-ingest, deliverable-and-design, email-and-social,
   private (was `_private/`), real-estate-market, voice-and-positioning. `_FABLE5/` stays put
   and is still worth checking. We have already paid for this research and it goes unread —
   that is the documented failure this step exists to stop. Scan the index, open anything
   plausibly relevant, and say what you found before proposing.
1. **Only if it isn't there, crawl4ai** — vendor docs, real API behavior, real best practice. Not memory.
2. **Write findings to `SESSION_LOG.md`** so the next session inherits evidence, not guesses, AND
   file the research itself under the right `_RESEARCH/` category with its line added to
   `INDEX.md` in the same pass. Unindexed research does not exist.
3. **Plan from evidence, then touch code.**

Twin of RULE 0.5: **0.5 = read OUR files; 0.4 = research the outside answer.** Do both. crawl4ai is the ONLY web-crawl tool — never Firecrawl.

**crawl4ai — PINNED LOCATION:**
- Interpreter: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe` (installed 2026-06-22 via uv)
- PATH shim (any project/terminal): `crawl4ai <url>` — thin alias over the venv's official `crwl` CLI,
  lives at `C:\Users\ethan\.local\bin\` (`crawl4ai.cmd` for PowerShell/cmd, `crawl4ai` for Git Bash,
  both call `crawl4ai-launcher.py`). Bare URL defaults to clean markdown; own flags/subcommands pass
  through. Machine-local, outside every repo (not the in-repo ingest `crawl_client.py` path).
- Re-install: `uv venv C:\Users\ethan\crawl4ai-venv --python 3.12 && uv pip install --python C:\Users\ethan\crawl4ai-venv crawl4ai && C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m playwright install chromium`
- Verify: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -c "import crawl4ai; print(crawl4ai.__version__)"`

**REVERSED 08/11/2026 — crawl4ai OUTPUT now ships like the rest of our research.** The blanket
`*crawl4ai*` ignore is gone with the all-in-on-graphify decree: a crawled vendor doc that stays local
is a fact the graph cannot see, which is the exact failure this whole rule exists to prevent. Crawl
output, findings, and audit dumps get committed under `_RESEARCH/` with their source URL and date.
**Still never commit:** the venv itself (it lives at `C:\Users\ethan\crawl4ai-venv\`, outside the
repo), and any crawl that captured a credential, a client's data, or a paywalled body verbatim.

**FULL-SCOPE-FIRST (locked 07/14/2026).** Before writing or extending any ingest pipeline against a
source, enumerate the FULL field/column list the source actually exposes (its schema/metadata
endpoint, vendor docs, or a live probe) — not just the fields the immediate task needs. Write the
scope into that pipeline's `source_scope` block in `ingest/cadence_registry.yaml`
(`confirmed_total` = what we pull, `source_ceiling` = what's available but unpulled, cited
source_url + as_of) — it renders automatically on `/ops/census`, no ops-repo change needed. List
the full scope to the operator BEFORE writing any ingest code, every time, new source or existing.
Postmortem: `parcel_subdivision` pulled 7 of 120 fields off the FDOR statewide parcel layer for over
a week — sale price/date, living area, year built, land value, neighborhood/market-area codes all
sat unused in the same already-open response.

---

# RULE 0.5 — PROBE FIRST: THE GRAPH, THEN THE FILE, THEN THE SPEC

**Before answering or speccing anything, look at the actual code.** Memory is wrong. Files are right.

**ALL IN ON GRAPHIFY HOSTED — operator decree 08/11/2026.** Verbatim: *"we only use graphify, no
grepping… there is no way we make it with our current path."* **The graph is the FIRST reach for any
structural question, and grep is the fallback — not the other way round.**

**THE TOOLS ARE DEFERRED.** Every `mcp__graphify*` tool is name-only until a `ToolSearch` round-trip
loads it, while `Grep`/`Read` are loaded at turn start. That asymmetry — not a judgment about
quality — is the entire documented reason the graph went unqueried while it sat wired in `.mcp.json`.
Pay the round-trip. Load them in ONE call:
`ToolSearch("select:mcp__graphify__gx_rank_files,mcp__graphify__gx_callers,mcp__graphify__gx_impact,mcp__graphify__gx_trace,mcp__graphify__gx_tests_for,mcp__graphify__gx_find")`

**USE THE HOSTED GRAPH (`repository_id: ethanrickyjrjr-wq/SWFL-Data-Gulf`), NOT THE LOCAL FILE.**
Measured 08/11/2026: `graphify-out/graph.json` stamps `built_at_commit ee2c074c` = 07/08/2026 and is
MISSING symbols shipped since (no `bakedAreaRead` node); the hosted index answered at HEAD and
resolved that same symbol with its caller. The local artifact is now gitignored as a build product.
**"At HEAD" is a snapshot claim that ages, not a standing guarantee — corrected 08/12/2026:** a
same-day recheck (`graph_stats`) found the hosted index stamped 24 commits behind actual HEAD, still
on a commit from *before* that day's `.graphifyignore` push (details:
`docs/handoff/2026-08-12-graph-compartments-step2-negative-result.md` §4c). Nothing in this repo
controls the hosted reindex cadence. Hosted-over-local still holds as the default — just don't assume
the hosted copy is current without checking `graph_stats`' `commitSha` against `git log` first.

**Amended again, later on 08/12/2026 — THE HOSTED INDEX IS NOT FROZEN, AND WE WATCHED IT MOVE.**
Two calls twenty minutes apart in one session read `commitSha 3592ee0f` (buildId `7ad693a2`) and
then `commitSha f97f03c1` (buildId `32b8cb0e`). The "24 commits behind" finding above was a
MEASUREMENT AT A MOMENT, not a property of the hosted index — it reindexes on a cadence we do not
control and do not have to wait on. **Practical consequence: any community/node COUNT you quote off
the hosted index must carry the `commitSha` it came from, because the next call can legitimately
disagree with it.** (Measured that day: 1,920 communities over 21,878 nodes @ `3592ee0f` — versus
4,069 over 43,723 in the local analysis file. Those are different graphs, not a contradiction.)

**Amended 08/12/2026 — drop the "stale by definition" half of that parenthetical.** It used to read
"the local file is gitignored and never rebuilt on a schedule," which was true only because RULE
0.5b R6's hook was uninstalled. **It is installed now**, so local `graph.json` rebuilds on every
post-commit and post-checkout. Local can now be FRESHER than hosted. That does not flip the default —
hosted is still first reach, because it answers at whatever commit it was indexed at and carries
resolution the local file has historically missed — but "local is stale" is no longer a fact you may
assert without looking. Check both stamps.

**The tool names are these — the old `graphify query`/`path`/`explain` are CLI subcommands and were
the wrong surface to name here:**
- `gx_rank_files` — a prose question → ranked files. Start here when you don't know where to look.
- `gx_callers` / `gx_callees` — resolved call edges. **This is the "who actually reads this" answer**
  that grep only approximates, and the dark-consumer failure is our most repeated one.
- `gx_impact` — blast radius before a change. `gx_trace` — directed path between two symbols.
- `gx_tests_for` — which tests cover a symbol or file. `gx_find` — symbol by substring.
- `query_graph` / `shortest_path` / `get_neighbors` / `god_nodes` — broader traversal.

**WHY THE GRAPH BEATS GREP, stated precisely so it isn't mistaken for a tie:** grep only ever returns
what you already hypothesized — it is capped by what you thought to type. The graph returns what you
had no reason to type. **All of its value sits in the unknown-unknown, which means it is most
valuable exactly when you are most confident you already know the answer.** Postmortem 08/11/2026:
grep found `updateSession` (Supabase middleware boilerplate, in the vendor's own docs, worth ~nothing
to be told); the graph found `lib/project/refresh-on-access.ts` — 92 lines that silently rewrite
metric values on project open and email blast, one caller, carrying a documented key-drift landmine.

**Grep is still legal as the FALLBACK** (string literals, config values, a symbol the graph missed,
non-code text) — but a structural question answered by grep ALONE, with no graph call in the
transcript, is the defect this rule exists to stop. `check-four-searches.mjs` counts graphify MCP
traversals as the CODE lane as of `7fc8c44b`.

Never answer without opening something. Never spec a new dependency without first confirming we
don't already have it. Subagents follow this rule too.

**SHARPENED 08/12/2026 — "OPENING SOMETHING" IS NOT THE BAR. OPEN THE FILE THAT OWNS *THIS
SENTENCE*.** Operator: *"How much fucking time does Claude waste guessing the wrong thing instead of
looking?? We have 79999900 guards."* Three structural claims in ONE session were made before opening
the file that owned them, and **all three were caught by him asking a question, not by any guard** —
including a turn where `check-four-searches` PASSED. That gate verifies TOPIC coverage (did you
search the subject), never CLAIM coverage (did you read the file that owns the specific sentence).
**Passing it is not evidence the sentence is true.**

**The failure shape, so it is recognizable:** a sentence describing how one of OUR OWN subsystems
behaves — what a page is for, what a guard checks, where data lands, what a button does — spoken
from the SHAPE of the system rather than from its code. Not a memory failure; answering at the wrong
altitude. The tell is a load-bearing "because": *"the landing page is what gives you the tracking."*
One read of `lib/email/campaign-click-alert.ts` showed the click event already carries the exact URL,
the recipient and the campaign — so **every link tracks and the page was never the mechanism.** The
operator got there by asking; the guards did not.

**THE BAR: before any sentence asserting how our system behaves, the file that owns that behavior
must have been opened IN THIS TURN.** Not a sibling file, not the doc describing it, not the same
subsystem last week. If it has not been opened, the honest sentence is "I have not read X yet" —
then go read it. One tool call, always cheaper than him finding it.

**WHY NOT AN 18th GUARD:** nearly every guard we own is a PRE-PUSH gate on an ARTIFACT. All three
failures happened in CONVERSATION, where nothing gates anything — nothing wrong was ever pushed.
Adding guards is not the fix; the ratio of process-shaped guards to claim-shaped ones is. Candidate
mechanism, pending operator sign-off on the hook point: a Stop-hook in the `answer-fix-proof` family
that blocks when an answer asserts our own system's behavior and no source-file read appears in that
turn's transcript. Full postmortem:
`docs/handoff/2026-08-12-open-house-decisions-owed-work-and-the-tracking-finding.md` §6.

Twin failure, same session, same root: **when two placements of the same function look like the
choice, the choice is usually wrong — reach for the keyed one-root registry we already use three
times (`lib/email/social/platforms.ts`, `lib/email/lab/capabilities.ts`, `apply-brand.ts:74-109`)
instead of handing the operator a menu.**

---

# RULE 0.5b — USE THE WHOLE TOOL. THE VENDOR ALREADY COMPUTED IT.

**Locked 08/12/2026 by operator decree.** Verbatim: *"YOU HAVE THE FUCKING MCP, YOU HAVE THE FUCKING
JSON. WHAT MORE CAN YOU FUCKING DO?"* — raised after a session answered a question about graph drift
by describing a metric we would have to BUILD, while cohesion scores, hub rankings, cross-community
bridges and seven generated questions sat unread in `graphify-out/`, regenerated on every run.

RULE 0.5 says query the graph. **This rule says the graph is not the only thing the tool gives us,
and the parts we ignore are the parts that answer the questions we keep proposing to build.**

## R1 — THE VENDOR'S OWN OUTPUT IS THE FIRST LANE, BEFORE ANY METRIC YOU PROPOSE TO BUILD.

Before writing a script that measures our own codebase, open `graphify-out/` and check whether the
tool already computed it. Four artifacts are written on EVERY run and had never been opened before
08/12/2026:

- **`.graphify_analysis.json`** (3.7 MB) — `communities` (every community's member list),
  `cohesion` (per community), `gods` (hubs + degree), `surprises` (cross-community bridges, each
  with a written `why`), `questions` (generated, e.g. *"Should `packs/cre-swfl.mts` be split into
  smaller, more focused modules?"* with the cohesion score behind it).
- **`.graphify_labels.json`** — one name per community, persisted across re-clustering by node
  overlap, so a hand-written name survives a rebuild.
- **`GRAPH_REPORT.md`** (973 KB) — Summary, Community Hubs navigation index, God Nodes, Surprising
  Connections, Import Cycles, and the community blocks written out with cohesion + members.
- **`graph.json` / `app-graph.json` / `manifest.json` / `wiki/` / dated snapshot folders.**

**Why this is a rule and not a tip:** the four-lane gate PASSED the entire time this failed. Every
lane names OUR files; none of them names a gitignored build directory holding the VENDOR'S analysis,
and the `.graphify_*` dotfiles do not appear in a normal listing. Same family as
`didnt-read-what-we-hold`, one layer out.

## R2 — INSTALL THE VENDOR'S GUARD; DO NOT HAND-ROLL IT.

`graphify claude install` writes the graphify section + a PreToolUse hook into this repo. **Run
08/12/2026 by the operator** — it overwrote our hand-written `## graphify` section, which is why
that section below is now a merge and not the vendor default. The hook is the mechanism the
`graphify_first_reach_hook` check has been carrying as *guard OWED*, whose own stated root cause is
mechanical (graph tools are DEFERRED, `Grep` is preloaded, the loaded tool always wins). RULE 0.9:
the plumbing is not ours. **If a vendor ships the guard, install it before speccing one.**

## R3 — A WRONG GRAPH ANSWER GETS RECORDED THROUGH THE TOOL, NOT ONLY INTO A DOC.

    graphify save-result --question "..." --answer "..." --outcome corrected --correction "..."
    graphify reflect        # aggregates to graphify-out/reflections/LESSONS.md, 30-day half-life

**Why:** on 08/12/2026 we found two false negatives (`reportToEmailHtml` returning zero callers
against six real call sites; `OPS_TARGET` returning empty callers/callees against a `writeFileSync`
on line 193 of its own file) and wrote them into a handoff document that nothing reads at query
time. The tool has a feedback loop with a decay curve. **A correction filed only as prose is a
correction the next query cannot see.**

✅ **BOTH FILED 08/12/2026** — `graphify-out/memory/query_20260812_183139_who_calls_reporttoemailhtml.md`
and `..._183205_who_calls___what_does_ops_target_call.md`, each `--outcome corrected`; `graphify
reflect` aggregated them (`2 memories, 0 useful, 0 dead ends, 2 corrected`) into
`graphify-out/reflections/LESSONS.md`. **Scope caveat, do not overstate it:** both false negatives
were MEASURED against the HOSTED index via `gx_callers`, but `save-result` writes to LOCAL
`graphify-out/memory/`. So the correction is where local `reflect` can aggregate it; it is NOT
demonstrated to surface at hosted-query time. Better than prose-only — that is R3's whole point —
but it is not a fix to the hosted index.

## R4 — A "NO EDGE FOUND" ANSWER IS NOT REPEATABLE UNTIL `diagnose multigraph` HAS RUN.

    graphify diagnose multigraph --json

**Ran it 08/12/2026. Result is a clean NEGATIVE and is recorded so nobody re-runs it hoping:** 6
same-endpoint groups directed / 28 undirected, 0 exact duplicates, 0 dangling endpoints, 7
self-loops, out of 73,496 candidate edges. **Edge collapse is NOT why `OPS_TARGET` has no callers**
— §6b of `docs/standards/graph-compartments.md` stands, the extractor simply never made the edge.

Two things the same run surfaced that ARE live:
- **`effective_directed: false`**, `post_build_graph_type: "Graph"` — `graph.json` carries no
  `directed` flag, so the diagnostic's post-build simulation treats our edges as UNDIRECTED. That is
  a statement about the FILE'S FLAG and the diagnostic, not proof about how the hosted index answers
  direction — do not repeat it as the latter without measuring.
- **5,550 extraction warnings: 2,775 edges missing `source_file` and 2,775 missing `confidence`.**

## R5 — THE LAKE BELONGS IN THE GRAPH.

    graphify extract . --postgres <DSN>     # tables, views, functions, FK relationships

**Why:** six registry entries have `consuming_pack: none` (data lands, nothing reads it) and
`docs/standards/data-roots.md` is hand-maintained. Table-to-code edges make "who actually consumes
this root" a traversal instead of a promise. Column-level detail is NOT represented — do not claim
it is. Not yet run, so it is a proposal, not a measured result.

**Corrected 08/12/2026 — "needs a DSN" was wrong, and repeating it is a RULE 0.95 absence claim
nobody checked.** We hold every part of it: `.dlt/secrets.toml` `[destination.postgres.credentials]`
carries `host` / `port` / `database` / `username` / `password`. **The ONLY blocker is the spend
decision, and the spend is bigger than the flag looks:** `--postgres` is a flag on `extract`, which
is the FULL headless extraction — AST **plus the semantic LLM pass** over a ~43,700-node repo. It is
not a cheap schema-only sidecar.

Two things to settle before running it, neither yet answered:
- **Is `extract --code-only --postgres` the free path?** `--code-only` is documented as local AST,
  no API key. If it composes with `--postgres`, the lake lands in the graph for zero spend — and
  RULE 0.5b's god-node finding wants `--code-only` anyway (four of the top sixteen "hubs" are
  markdown headings). UNVERIFIED — do not state it works until measured.
- **`extract` WRITES `graphify-out/`.** A code-only run may clobber the doc plane of the current
  `graph.json`. Back the file up first; it is a build product, but rebuilding the semantic pass is
  exactly the spend we are trying to avoid.

## R6 — FRESHNESS IS A COMMAND, NOT A CAVEAT.

    graphify hook install     # post-commit + post-checkout rebuild
    graphify check-update .   # cron-safe staleness notification

**Why:** this file has stated "stale by definition — nothing rebuilds it on a schedule" as though it
were physics. It was an uninstalled hook. (The HOSTED index cadence is still not ours — RULE 0.5's
`commitSha` check stands unchanged.)

✅ **INSTALLED 08/12/2026.** `hook status` reads post-commit installed · post-checkout installed ·
merge driver registered. Three things worth knowing before anyone debugs it:

- **It APPENDED, it did not clobber.** `.git/hooks/post-commit` already ran repolith's
  `claim release --committed`; the vendor block went in after it inside `# graphify-hook-start/end`
  markers, verified by diffing against a pre-install backup. Line 2 survives. Any future re-install
  gets the same check — 51 live cross-session claims ride on that one line.
- **It is worktree-safe** (matters under RULE 1.5): the block exits early when `git rev-parse
  --git-dir` differs from `--git-common-dir`, so `wt/*` worktrees do not each fire a rebuild. It
  also skips rebase/merge/cherry-pick, skips graphify-out-only commits, pins `PYTHONHASHSEED=0` for
  reproducible clustering, forces `GRAPHIFY_MAX_WORKERS=1` on Windows, and detaches the rebuild
  (log: `~/.cache/graphify-rebuild.log`) so `git commit` returns immediately. Escape hatch:
  `GRAPHIFY_SKIP_HOOK=1`.
- **The merge driver added the ONE tracked line this produced** — `.gitattributes` gained
  `graphify-out/graph.json merge=graphify`, plus a `[merge "graphify"]` section in `.git/config`
  (untracked). Note the honest limit: `graphify-out/` is GITIGNORED here, so that driver has no
  committed file to merge — it is inert until/unless the graph is ever tracked.

`check-update .` also ran and returned silent = nothing pending. **What this does NOT buy:** the
rebuild refreshes the LOCAL `graphify-out/graph.json`, which is gitignored build output. Hosted
reindex cadence is untouched, so RULE 0.5's `commitSha`-vs-`git log` check is still mandatory.

## R7 — COMMUNITIES GET HUMAN NAMES, AND THE NAMES SURVIVE.

    graphify label . --missing-only

**Why:** auto-labels are the biggest node's name, not the community's job — `pack.mts`,
`doc/types.ts`, `$`. Community 17 already holds the blast route, the email-lab render route and
claim-and-send: that IS "email — sending & blast", it just isn't called that, so nobody scanning
the report finds it. `.graphify_labels.json` re-attaches by node overlap, so a hand-written name is
durable, not cosmetic.

⚠️ **MEASURED 08/12/2026 — `--missing-only` IS A NO-OP HERE, AND THE COMMAND LINE ABOVE IS A TRAP.**
`.graphify_labels.json` holds **4,069 labels for 4,069 communities — zero of them a literal
`Community N` placeholder.** Every community already carries an auto-label, so `--missing-only`
finds nothing missing and names nothing. The defect this rule describes is REAL (`packs/cre-swfl.mts`,
`speaker.mts`, `$` are node names masquerading as community names) but `--missing-only` cannot fix it
by definition — a bad label is not a missing one.

**The real cost, so it can be approved as a number instead of an adjective:** a full `graphify label .`
covers all 4,069 communities at `--batch-size 100` = **~41 LLM calls** (~21 at `--batch-size 200`).
**But 1,434 of those communities are singletons and 3,700 are under size 25 — naming a one-node
community is pure burn, and there is NO size-filter flag on `label`.** The 369 communities of size
≥25 are the only ones worth a human name. **Do not run the full vendor pass on the assumption it is
cheap-and-harmless; it is mostly waste by node count — and as of the ✅ block below you do not need
it at all.**

✅ **DONE 08/12/2026 FOR ZERO API SPEND — `scripts/graphify-name-communities.mjs`.** Operator:
*"Why does this take api calls. Why can't you just do it?????"* He was right, and the answer is the
whole point of this entry: **`graphify label` shells out to a SEPARATE metered LLM backend, but the
member lists are plain text in `.graphify_analysis.json` and the session model is already reading
them.** Naming a cluster from its members is reading, not inference-for-hire. **All 369 communities
of size ≥25 now carry real names — 78 hand-written, 291 derived from the dominant path prefix with
its share (e.g. `email · 84%`), 0 unmapped.** `pack.mts` → `refinery — source adapters`;
`isCoreScope` → `refinery — packs & core SWFL scope`; `Full ranked list` (a markdown heading) →
`research — competitor & strategy docs (A)`.

**The app plane is where the real find was.** Eighteen size-≥25 communities carry `api_route:` /
`brain:` / `slug:` / `package_` ids instead of file paths, so no directory heuristic reaches them —
and they include the **brain dependency graph** (`brain graph — CRE corridor slugs`, `— macro &
credit slugs`, `— logistics & labor slugs`) and CLAUDE.md's own rules as a cluster. Those are hand-
named in the script's `HAND_NAMED` map.

**EVERY name carries its dominant-folder purity (`· 88%`) and that is a GUARD, not decoration.**
`docs/superpowers/specs/2026-08-11-graph-compartments-design.md` F3: labels re-attach by node
overlap (`cli.py:1824`), so after a membership shift **a stale name can land on the wrong group** —
the same mechanism that makes names durable makes them mis-attach. The spec's guard is that the
label sit next to its dominant folder and purity "so a wrong name is visibly wrong rather than
quietly trusted." **A low percentage means DISTRUST THE NAME.** It fired immediately on first run:
community 3761 is `refinery — brain-output contract & constitution · 21%` and community 1 is
`refinery — CRE corridor pack & sources · 31%` — both genuinely mixed groups whose hand-written
names cover a fifth to a third of the members. That is the guard working, not a bug to paper over.

⚠️ **The same spec says "re-label only after values are pinned," and this pass did NOT wait.** If the
compartment work ever removes nodes (F3 is written against a 5,980-node removal), re-run the script
rather than trusting the surviving names.

**Re-run it after any re-cluster** (`.graphify_labels.json` re-attaches by node overlap, so names
survive, but new communities arrive unnamed). **Do NOT run `graphify cluster-only` to make the
report show them** — `graph-compartments.md` §2.1/§2.2 documents that it drops the app plane,
refuses to write on the net node loss, prints a plausible count anyway, exits 1, and ignores
`--force` on that subcommand. The R6 post-commit hook rebuilds via `graphify update`, which is the
path that honors it.

## What the commands returned on 08/12/2026 (so nobody re-runs them cold)

**`god-nodes --top 20`** — `createClient()` 239 · `createServiceRoleClient()` 210 · **"Full ranked
list" 169 (a heading inside a research markdown file)** · `EmailDoc` 156 · `RawFragment` 145 ·
`master` 143 · `createServiceRoleClientUntyped()` 142 · `getSupabase()` 135 · **a row of `====` from
a finished plan doc, 101** · `ProjectItem` 98 · `getAnthropic()` 92 · `env` 89 · `fragmentId()` 83 ·
`expiresDate()` 80 · **the doc-index heading, 79** · `cn()` 77.

**Four of the top sixteen architectural hubs are markdown headings.** `.graphifyignore` removed the
`SESSION_LOG.md` blobs but prose is still ranking as core abstraction. Either extend the ignore file
or run `graphify extract . --code-only` for hub/cohesion work — and never quote a god-node list
without checking whether the entry is a symbol.

## Also corrected on 08/12/2026 — the "yarn ball" finding is DEAD

`_RESEARCH/agent-behavior/2026-08-11-graphify-community-structure-crawl4ai-research.md` PART 3 says
the two largest communities are `SESSION_LOG.md` (1,370 + 672 nodes) plus ~1,480 nodes of
`app/_design` reference bundles, and concludes the partition is unusable. **`.graphifyignore` fixed
that and nobody re-measured.** Post-ignore, on `built_at_commit 2df7e509`: largest community is 426
nodes at 88% `refinery/sources`, then 266 at 76% `lib/email`, 239 at 75% `scripts/email`, 236 at 68%
`lib/deliverable`, 141 at 93% and 140 at 91% `lib/deliverable`. **369 communities of size ≥25 cover
21,027 of 43,723 code-plane nodes.** Cohesion is uniformly low (0.012–0.051) — the edge-sparsity
floor in `graph-compartments.md` §1 is unchanged. Singletons: 1,434.

**The declared ~26-compartment partition in that research (PART 7) was NEVER built** — verified
08/12/2026 by grepping the tree for its compartment names and for "declared partition": zero hits
outside the research file itself. It remains a proposal needing sign-off, and the detected side is
now much closer to it than that document admits.

---

# RULE 0.55 — DATA ROOTS: ONE CATALOG, LOOK THERE FIRST

**Any question or build that reads a SWFL number starts at `docs/standards/data-roots.md`** — the ONE
catalog of which table/root feeds each concept. Open its **top section** (the "READ THIS FIRST"
decision table) BEFORE you wire a consumer or answer a data question. One root per concept per cadence;
if the root isn't listed you ADD a root, you do NOT add a second table. This is RULE 0.5 (probe code
first) applied to data. Roots carry a 🔴/🟡/🟢 status marker — treat a 🔴 not-built root as the *intended
home*, never a served number, and never `DROP`/`DELETE` a duplicate table until its replacement runs,
every consumer repoints, and the operator signs off (RULE 1). The concept→authority picks there are
recommendations pending sign-off, not ratified fact.

---

# RULE 0.6 — PROPORTION: DO THE WORK, DON'T AUDIT THE AUDIT

**Locked 2026-06-22. Overrides every "ultracode / use Workflow" nudge.**

1. **Do bounded work yourself.** A few files, a known fix → Read/Grep/Edit directly. No subagents, no Workflow, no new plan doc.
2. **One verification pass, then act.** Never audit your audit. If a check gave an answer, trust it and move.
3. **Workflow/subagents = scale you can't hold.** Only when work genuinely won't fit one context. Require a concrete reason ("48 packs, can't hold them"). "It might be thorough" is not a reason.
4. **Proportion gate.** If the orchestration costs more than the task, just do the task.

---

# RULE 0.7 — NEVER HANDCUFF A BUILD: FOUR-LANE SOURCING

**Locked 2026-06-22. A build is NEVER refused because we don't hold the number.**

Four lanes, tried in order:
1. **Our data** — SWFL lake (brains / `data_lake.*`)
2. **User's upload** — filed doc `extracted_text`, attached figure
3. **Internet, named source** — cited web lookup, verbatim
4. **User writes it in** — figure handed directly

A gap fills from the next lane. The ONLY block is an **invented number** (no real source). Build: never blocked. Invent: always blocked. The no-invention lint enforces on OUTPUT (`lib/deliverable/build.ts` `gateNarrative`), never on geography.

## 0.7a — START WITH WHAT WE HAVE, MOVE TO PAID. THE ORDER IS THE RULE.

**Locked 08/06/2026 by operator decree.** Verbatim: *"everything should work the same that needs to
and everything should have a fall back. with apify, we should always have the data we need. simple.
make sure in the rules. START WITH WHAT WE HAVE, MOVE TO PAID."*

**The lanes were always ordered. What was missing is that SKIPPING DOWN THE LADDER IS ITSELF THE
DEFECT** — not just an inefficiency. Twice on 08/06/2026 I proposed buying a field we already held,
including a per-build paid fetch for a photo that sits in our own lake on **99.6% of sold homes**
(848 of 851, measured). Operator: *"we don't go paid on every fucking email. did you now read the
ladder?"*

**EVERY FIELD, EVERY TIME, IN THIS ORDER:**
1. **Our own free data** — the lake. Check here FIRST, always, even when you are sure.
2. **A paid row we ALREADY BOUGHT** — a read, not a call. Costs nothing. Never treat it as spend.
3. **A paid call, for ONE SPECIFIC MISSING FIELD** — never as a routine build step, never when we
   already hold most of the property, and always behind the spend switch.
4. **An open slot** — labelled, editable, honest.

**AND EVERY RUNG HAS THE ONE BELOW IT AS A FALLBACK, so we are never simply missing data.** With the
paid rung available as a backup, "we don't hold it" is almost never the true answer. **The real
failure is reaching for a rung before checking the one under it.** State which rung filled a value
when it matters; a build that silently jumps to paid is a defect even when it returns the right
number. Detail for email/property work — the actor inventory, what each returns, where it lands, and
the guards — lives in `docs/standards/email-build-playbook.md` §3.3.

## 0.7b — COMMENTARY OBEYS THE SAME LADDER. BAKED PROSE BEFORE A LIVE MODEL CALL.

**Same decree, same day:** *"AND WE HAVE A LOT IN /R/, AS WELL FOR COMMENTARY."*

The report pages under `/r/` serve **baked, validated, cached** prose (`lib/narratives/store.ts` →
`loadNarrative` → `NarrativeSections`). **Live 08/06/2026: 121 baked narratives on hand — 53 zip, 41
brain, 27 corridor — freshest baked the same day.** The email recipes read **one** of them
(`lib/email/zip-seed.ts`) and otherwise call the model LIVE on every single build, rewriting from
scratch prose we had already written and already validated.

**That is the same ladder violation as buying a photo we own — paid rung first, free rung ignored.**
It is also why the reports read better than the emails: baked prose passed a validator, live prose
gets whatever this call produced.

**THE RULE: a baked narrative that covers your surface is lane 1. A live model call is the fallback,
not the default.** Before adding an LLM call to any build, check `narratives` for that surface first.

**AND A BAKE HAS AN AGE — CHECK IT, DO NOT ASSUME IT.** Measured 08/06/2026: of the 121 baked
narratives, **83 were baked that same day, but the rest trail back to 07/13/2026** — and all 121 came
from one model generation (`claude-sonnet-4-6`). So "baked" is not a synonym for "current." A surface
whose bake predates the data it describes is a STALE FALLBACK, not lane 1, and serving it silently is
the same class of error as a stale alarm. The bridge must compare the bake against the inputs it was
made from (`inputs_hash` and `baked_at` are both on the row for exactly this) and fall through to a
live call when it does not match — that fall-through IS the fallback this rule demands.

✅ **THE BRIDGE IS BUILT AND PUSHED (08/06/2026).** `lib/narratives/area-read.ts` `bakedAreaRead()`
is the ONE reader — **never write a second one.** It tries the email-tuned `area-email` surface, then
the `zip` report surface (**53 rows baked; probed live 8/8 available**), then returns null so the
caller runs its live call. **First consumer wired: `review-reply.ts`.**

**THE SAFETY RULE THAT MAKES IT LEGAL:** baked prose was written against the REPORT's 28–30 facts;
an email shows ~6. So the CALLER passes its own anchoring guard (`unanchoredNumbers`) and baked prose
ships ONLY if every number in it is sourced by THIS email. Prose that fails is dropped and the live
call runs. The bridge can make an email cheaper and better; it can never make it less sourced.

**Wiring a new recipe = one call**, before the live model call, passing that recipe's own guard.
NOT every recipe is a fit: `market-pulse`'s prose slot is **digit-free by design** (`auditConnective`
runs a zero-digit audit — code writes every factual sentence), so baked prose would fail its own gate.
Check the recipe's guard shape before wiring. Remaining: `area_email_readthrough_phase2`.

---

# RULE 0.8 — COMPLETION IS COUNTED AND PROVEN (never announced)

**Locked 07/30/2026 by operator decree.** Verbatim: *"you fucking do 1 of 4 things and no one knows
what is broke until months later when i start asking questions. You say you have changed now and
that can't be more from the truth. We need to really fix that."*

**Announcing a behavior change is not a behavior change. Only a mechanism is.** This rule is the
mechanism. It overrides any urge to summarize favorably.

1. **COUNT BEFORE YOU START.** Any task with more than one part: write the enumerated list of parts
   (N) before doing any of them. A list you never wrote down is a list you will silently truncate.
   Multi-part means *anything* plural — 4 lanes, 3 files, 6 checks, 2 verifications.
2. **REPORT n OF N, ALWAYS.** Never report a multi-part task without the fraction and the names of
   the parts NOT done. "Filed the research" is banned when the index line is missing; the honest
   form is "2 of 3 — index line NOT written, blocked by X." Partial is fine. **Partial reported as
   whole is the defect.**
3. **EVERY UNFINISHED PART OPENS A CHECK, SAME SESSION.** No exceptions, no "I'll get it next
   time." This is RULE 2.4 applied to your own incomplete work, not just to findings. The ledger
   is the only thing that survives a compaction; your intention is not.
4. **"DONE" REQUIRES PASTED EVIDENCE.** The command and its real output, in the answer. Not "tests
   pass" — the test line. Not "it's live" — the fetched response. Not "all four lanes searched" —
   the four searches, in the transcript. **A hook or a human catching an unrun step after you
   claimed it is the failure this rule exists to make impossible.**
5. **NEVER SPEAK A COMPLETION COUNT YOU DID NOT RE-COUNT.** "All of them," "every one," "fully
   covered" are claims about a number. Re-derive it, or don't say it (twin of RULE 12).

**Postmortem that forced this (07/30/2026, same session):** claimed "all four lanes are on the
record" only after the four-lane hook caught the catalog lane had never been opened; and called
research "filed" whose `_RESEARCH/INDEX.md` line was never written. Both inside twenty minutes,
both while explicitly claiming rigor. The operator has a memory; the session does not. Rules
persist, promises don't.

---

# RULE 0.85 — FIX IT, DON'T FILE IT. A CHECK IS NOT A DELIVERABLE.

**Locked 08/06/2026 by operator decree.** Verbatim: *"STOP OPENING FUCKING CHECKS THAT NEVER GET
FUCKING CLOSED. MAKE IT A FUCKING RULE. FIX WHAT YOU ARE SUPPOSED TO FIX AND FIX ANYTHING YOU FIND."*

The ledger stood at **900+ open** while sessions kept adding to it. Opening a check had become the
way to LOOK rigorous while shipping nothing — RULE 0.8's partial-reported-as-whole, wearing a
ledger entry as a disguise.

1. **FOUND IT IN THE FILES YOU ARE ALREADY IN? FIX IT NOW.** Default is repair, not record. If you
   can see the defect and you are already holding the file, a check is the wrong artifact.
2. **A CHECK IS ONLY LEGAL WHEN THE FIX IS GENUINELY OUT OF REACH THIS SESSION** — it needs an
   operator decision, a paid run, a records request, a rebuild, or another team's file. Then the
   check must name **what specifically blocks it**, not just what is wrong.
3. **NEVER OPEN A CHECK FOR SOMETHING YOU HAVE THE MEANS TO FIX IN THIS SESSION.** "I noted it" is
   RULE 2.4's forgetting-on-a-delay wearing a ledger entry.
4. **CLOSE WHAT YOU FIX, IN THE SAME SESSION.** `node scripts/check.mjs close <key>`. A fix that
   leaves its own check open is how the number only ever goes up.
5. **NET-NEGATIVE OR NEUTRAL.** A session that opens more checks than it closes owes an explicit
   sentence saying so and why. Opening three and closing none is a reportable outcome, not a
   neutral one.

**RULE 0.8 still stands and does not conflict:** every unfinished part is still *declared*. This
rule governs WHERE the declaration goes — the answer to the operator, not a row nobody reads.

---

# RULE 0.9 — MASTERMIND / MINION: DON'T BUILD THE HIGHWAY

**Locked 07/30/2026 by operator decree.** Verbatim: *"Claude is the mastermind, we just need the
minions to run smoothly. Containing ourselves is dumb. We are building things we don't need to
build and are not good at."*

1. **Claude orchestrates; the best available tool executes.** Routing a job to a different model,
   vendor, or open-source tool is the DEFAULT posture, not a fallback. Single-vendor dependence is
   a structural risk, not a line item.
2. **OURS = data, provenance, judgment, the deliverable. NOT OURS = the plumbing** — agent
   harnesses, sandboxes, session management, routing infrastructure. That plumbing already exists
   as open source; reach for it. Hand-rolling it is the "building things we don't need to build
   and are not good at" failure.
3. **Who is good at what is UNKNOWN until researched.** Never write a routing table — which model
   gets which job — from memory. It is a RULE 0.4 question: our research first, then crawl4ai the
   live source, then decide. Model capability claims from training data are stale by definition.
4. **Never rebut a strategic direction with a cost table.** Spend is a side effect, never the
   argument (postmortem 07/30/2026: answered a sovereignty question with a $50/month budget review
   and told the operator not to build).

---

# RULE 0.95 — EXHAUST BEFORE YOU CLAIM ABSENCE

**Locked 08/06/2026 by operator decree.** Verbatim: *"YOU HAVE TO DO WHAT I TELL YOU AND EXHAUST
ALL OPTIONS BEFORE YOU FUCKING LIE TO ME."*

**"We don't have that," "there's no data for X," "that's not possible" is a claim, not a shrug.**
An absence claim made without exhausting the lanes that could have contradicted it lands on the
operator exactly like a lie, whether or not it was told as one — he has no way to tell an honest
gap from a lazy grep from where he's sitting. Same failure family as the font postmortem in
RULE 0.4 (searched `_RESEARCH/` only, missed `app/_design/`, declared "no research basis" — the
answer was on disk the whole time) and RULE 0.85/2's no-silent-deferrals: a confident negative
that was never actually checked.

1. **Before saying "we don't have X" / "can't be done" / "there is no Y", exhaust every applicable
   lane first** — RULE 0.4 (`_RESEARCH/INDEX.md`, then crawl4ai), RULE 0.5 (the actual code), RULE
   0.55 (`data-roots.md`), RULE 0.7 (all four sourcing lanes), `git status --ignored --short` for
   anything gitignored. Not the lane that seemed most likely — all of them that apply.
2. **State which lanes you checked and what each returned, inline, BEFORE the negative sentence** —
   not after, not summarized as "I looked and found nothing." Name the files opened, the commands
   run, the searches issued.
3. **If a lane genuinely wasn't checked, say so and mark the claim provisional.** A partial search
   reported as a complete one is the exact defect this rule exists to stop — never round up.

This governs the burden of proof on absence/impossibility claims — it does not hand over judgment
on destructive or irreversible actions, which still route through RULE 1's ask-first list. "Do what
I tell you" means: don't tell the operator something isn't there until you've actually gone and
looked everywhere it could be.

---

# RULE 1 — COMMIT & PUSH AUTONOMY

**Just push (no diff request):** docs-only, CLAUDE.md, SESSION_LOG.md, hooks, memory, typos, small tooling, trivial reverts.

**Ask first:** brain pack edits changing `--- OUTPUT ---` shape or key_metrics math; ingest writes to `data_lake.*`; refactors >5 files; anything touching live `/api/b/*` or MCP surface; anything not revertable in <5 min.

**SQL migrations:** run directly. Creds in `.dlt/secrets.toml`. Always idempotent. Verify row count after.

**Pre-push gate — 5 hook-enforced gates** (`.claude/hooks/check-prepush-gate.mjs`):
1. **Lockfile.** `package.json` change → `bun install` + `git add bun.lock` in same push.
2. **Vocab/alias.** Touched packs/vocab/corridor-aliases? Run `bun test refinery/lib/corridor-aliases.test.mts` AND `bun refinery/tools/check-vocab-coverage.mts --all`. Every slug a pack can emit (including conditionals) must be registered in `brain-vocabulary.json` in the SAME commit.
3. **Secrets.** `gh secret set` is step 1; wiring into workflow `env:` is step 2.
4. **Ingest (Gate 4).** Destructive write with no non-null guard → blocked. Guard via `ingest.lib.guards`. Override: `ALLOW_REPLACE_WITHOUT_GUARD=1`.
5. **Pack ⇆ catalog (Gate 5).** Touched packs? Hook runs `catalog.test.mts` mirror + each pack's `bun:test`. vitest view-parity tests skipped locally (CI-only subprocess). Override: `ALLOW_PACK_TEST_ENV_FAIL=1`.

**Flaky tests:** a non-deterministic test reddens CI independent of the diff. The only fix is making it deterministic. Suspect flake first — loop it locally before blaming the commit.

**Always:** SESSION_LOG entry on every push · sync `_AUDIT_AND_ROADMAP/build-queue.md` · use `node scripts/safe-push.mjs` · stage explicit paths only · never `--no-verify` or force-push `main`.

**GHA rebuild targeting — LOCKED 2026-06-29.** `pack_id=master --force` rebuilds all 32 brains (32
Sonnet calls) — never do this to debug one brain. `pack_id=<brain-id>` = **that brain only**; a leaf
dispatch can NEVER refresh master's dossier (CORRECTED 07/14/2026, verified vs `refinery/lib/dag.mts`).
To fold a fresh leaf into master, dispatch `pack_id=master` with **no** `--force` — cheap: fresh
upstreams skip, master re-synthesizes via the upstream-aware trigger. Preferred form:
`OPERATOR_APPROVED_PAID_RUN=1 node scripts/dispatch-rebuild.mjs <brain-id> --reason "<decree>"` +
commit the auto-appended acceptance entry same session. Full mechanics + raw `gh` form: `scripts/CLAUDE.md`.

---

# RULE 1.5 — PARALLEL-SESSION ISOLATION (EXPERIMENTAL)

**Never `git add -A`.** Always `git add <explicit paths>`.

When two sessions touch overlapping files, isolate in a local worktree via `scripts/worktree.mjs`
(`new` / `land` / `cleanup` — usage in `scripts/CLAUDE.md`). Worktree branches are local and
self-deleting. Never `git push origin wt/*`, never a PR.

Single session / no file overlap → just work on `main`.

---

# RULE 2 — THE SESSION LOOP (Scratchpad → Check → Submit → Update)

0. **SCRATCHPAD — `_ASSISTANT/SCRATCHPAD.md`. ALWAYS. (locked 07/20/2026.)** The moment the
   operator raises an issue, gripe, correction, or "we already covered this," it goes in the
   scratchpad — BEFORE you answer, before you build, before you probe. He must never have to
   type the same thing twice because a session ended or context compacted. Read it at session
   start next to `TODAY.md`; move items to RESOLVED with a date when they actually close.
   This is not a substitute for a `checks` entry (see 4) — the scratchpad catches it in the
   moment; `checks` is where a real obligation lives.
   **0b. THREE STRIKES = A GUARD, NOT A THIRD ENTRY (adopted 08/10/2026 from the steipete/**
   **agent-rules trial, its one keeper).** The THIRD time the same gripe/correction/failure shape
   lands in the scratchpad, writing another entry is BANNED as the response — that session builds
   the mechanism instead (hook, lint, test, or CLAUDE.md rule) and links the entries to it. The
   scratchpad is a queue for mechanisms, not a diary of repeats — 45 open items and "same surface
   fixed five times in a row" is the documented failure this line exists to stop.
   **THE COUNTER IS `_ASSISTANT/STRIKES.md` (built + backfilled 08/10/2026).** "Third time" is
   not judgment anymore: when an entry matches a `## shape:` there, add a `- strike:` line in the
   same edit; a new shape gets a header. The SessionStart scratchpad printer counts it and prints
   every unguarded shape at 2+ strikes in red. When a guard ships, flip that shape's `guard:` line
   to BUILT with the artifact and date — the registry is also the map of which mechanism answers
   which recurring failure.
1. **CHECK** — SessionStart prints it: `SESSION_LOG.md`, open `checks` (Supabase `public.checks`), build queue (`_AUDIT_AND_ROADMAP/build-queue.md`). Trust it; verify surprises against `git`.
2. **SUBMIT** — commit + SESSION_LOG entry + `node scripts/safe-push.mjs`.
3. **UPDATE** — same push: `node scripts/check.mjs close <key>` / `open <project> <key> "<label>"` / `list`. Open obligations live in `checks` — never as `⬜/✅` in plan docs.
4. **NO SILENT DEFERRALS (locked 07/07/2026).** The moment you park/defer a finding, or hit a known
   gap you're not fixing right now, open a `checks` entry for it in that same session — do not just
   write a SESSION_LOG sentence and move on. **Postmortem that forced this:** three separate
   condo/multi-unit-grain gaps — Marco Island address-matching 0/360 (06/30), `land_manufactured_swfl`
   parked with zero pipeline code (07/01), and `listing_state.property_type` collapsing every condo
   into `single_family` region-wide, found independently the very next day (07/06–07) — were each
   individually logged as prose and never promoted to `checks`. SESSION_LOG is a diary nobody re-reads
   in full; `checks` is the only thing that surfaces at every session start. Each gap got rediscovered
   from scratch instead of connected, because "I noted it in the log" is not deferral — it's forgetting
   on a delay. Write it in the log for narrative context if you want, but the log entry is not a
   substitute for the check.

Plan docs are briefs, not status boards. Flip or delete markers in the same commit as the code.

---

# RULE 3.5 — BRAINSTORM BEFORE YOU BUILD

Invoke `superpowers:brainstorming` before any new feature, component, or non-trivial behavior change. No exceptions. **Escape hatch:** operator says "Change Storming" → brainstorming is discretionary.

**ALWAYS RESEARCH WHEN BRAINSTORMING (locked 2026-06-25).** Every brainstorm dispatches a crawl4ai research pass (per RULE 0.4) BEFORE settling on a design — best practices, better engineering, better ways, and verbatim vendor-contract facts (model IDs, API shapes). crawl4ai ONLY, never Firecrawl. Findings feed the approaches/design; write evidence into the spec + `SESSION_LOG.md`. No design is presented on memory alone.

**REGISTER EVERY NEW BUILD (locked 2026-06-28).** After brainstorming and before writing code, run:
```
node scripts/new-build.mjs <slug> "<label>"
```
This creates the spec stub in `docs/superpowers/specs/` and opens the `<slug>_live_verify` check in one step (arg conventions: `scripts/CLAUDE.md`). Without it, there is no check to close and no spec to archive — the build is invisible to the session loop.

**NAME THE BREAK BEFORE YOU BUILD (locked 07/20/2026).** No design gets presented for approval without a failure-modes section: every way the build can break, each paired with the guard that stops it (validation, gate, test, lint) — same adversarial standard already required of code review (santa-method / orch-review), moved to design time instead of applied only after code ships and breaks. A design with an empty or hand-waved failure-modes section does not get approved. **Why this rule exists:** every guardrail on this platform to date has shipped reactively, one incident at a time — build breaks, a guard gets bolted on, it breaks a different way, another guard gets bolted on. Root cause, confirmed 07/20/2026: the one process required before every build (`superpowers:brainstorming`) listed "error handling" as a single word in a narrative checklist, with no forcing function to actually enumerate failure modes up front. This closes that gap at the source instead of adding another incident-specific patch.

**TDD IS MANDATORY FOR IMPLEMENTATION (locked 07/20/2026).** Once a design's failure-modes section is approved, invoke `superpowers:test-driven-development` for every unit of deterministic logic in that build — write the failing test named after the failure mode it targets, then implement to green. This is a hard gate, same as `superpowers:brainstorming`, not advisory. **Scope limit — TDD does not replace the other guard types named above.** A green test suite proves logic does what you told it to do for known inputs; it does not catch an environment hazard (dev pointed at prod), a data-existence/fabrication failure (an address that's logically valid but doesn't exist), or an LLM inventing unsourced content. Those failure modes still get a validation/gate/lint guard, named in the same failure-modes section. Don't let a green test suite stand in for a guard it was never built to be.

---

# RULE 3 — ARCHITECTURE DISCIPLINE

**C1 — Audit before blessing an architecture claim.** Any claim that changes system shape → code audit always. Web-refutation pass only when the claim imports an outside best-practice. Eloquence ≠ evidence.

**C2 — Extend existing artifacts; never erect a new mandatory pre-materialization gate.** Check whether existing seams (`BrainOutput`, spec-validator, Stage-4 lints, cadence_registry) can be extended first. This covers data-pipeline gates only — agent behavioral guardrails (hooks) are in-bounds.

---

# brain-platform — SWFL Data Gulf

Live: `https://www.swfldatagulf.com` · MCP: `/api/mcp` · Stack: Next.js + Supabase + Vercel + DuckDB + Python ingest. **Separate from premise-engine.**

---

# THE GOAL

Lives in `docs/THE-GOAL.md`. Three tiers: **Reporters** (leaf brains — cited facts, no opinions) → **Synthesizer/master** (one conditional falsifiable direction call) → **Conversation** (reasons over master's dossier + rules below). Master hands a dossier, not an essay.

## Rules of engagement (travels in every payload)

The verbatim rules live in `refinery/lib/rules-of-engagement.mts` (the ONE root — read it there; the FOCUS hook re-injects the gist every prompt). Full reference: `docs/consumption-contract.md` + `THE-CONTRACT.md`.

---

# Status + what's next — NOT here

Trackers (surfaced at session start):
- **Open obligations** → `checks` ledger (`scripts/check.mjs`)
- **Build queue** → `_AUDIT_AND_ROADMAP/build-queue.md`
- **Live signals** → `https://swfldatagulf-ops.vercel.app`

Goals 0–8: Supabase `goals` table → `/ops/goals`. Insert-only from sessions.

---

# Brain Factory — non-negotiable rules

1. **Thin pipe.** Downstream brain reads only `--- OUTPUT ---` of upstream, never branches.
2. **Deterministic math, narrative prose.** Numbers computed in code; LLMs produce synthesis only.
3. **Atomic type-lift.** `PackDefinition`/`BrainOutput` type changes ship with backfill of all packs in one commit.
4. **Brain-input bypass.** `brain-input:*` source forces Stage 2 composite to max.
5. **Stale-upstream caveat.** Auto-appends caveat + propagates `min(self, upstream)` confidence.
6. **Cycle detection.** Topological sort throws on cycles.
7. **Validators gate writes.** `spec-validator`, `facts-only-lint`, `inference-bait-lint`, `smoothing-lint` — failure aborts, prior file stays intact.
8. **Freshness token quoted on first response** (see data protocol v3 rule 2).

**Brain-first ingest gate:** no bulk ingest hits Tier 2 (`data_lake.*`) without its consuming brain's `PackDefinition` in the same PR.

**PROBE FIRST (ingest):** before any multi-minute ingest, run the <1-min probe. Fetch only columns the normalizer reads at the largest page the API honors. Guard load-bearing columns before any destructive replace. Full standards: `docs/standards/data-and-build-bible.md` §0.1–0.2.

**Pipeline-freshness:** every pipeline ships its GHA cron wrapper + `--dry-run` in the same PR. Full rules: `docs/standards/pipeline-freshness.md`.

**Operation Dumbo Drop:** source can't be auto-ingested? Ship the ODD-ready scaffold in the same PR: (1) empty-tolerant consumer, (2) parked cadence entry under `not_yet_running:`, (3) Tier-1 cold target, (4) `source_tag` provenance, (5) idempotent merge. Details: `docs/superpowers/plans/2026-06-05-operation-dumbo-drop.md`.

**ZIP columns — 3 gates:**
- **G1:** `zip_code` from site address/lat-lon only. Mailing ZIPs = violation.
- **G2:** Derivable now → derive + backfill + wire pipeline. Not derivable → park in deferred.
- **G3:** New `zip_code` on Tier-2 without consuming brain in same PR = violation.

**SCOPE:** Lee (12071) + Collier (12021) — the two core, data-rich counties; Hendry (12051) is a small
minor addition, not a headline county. Charlotte/Glades/Sarasota are NOT real coverage today — don't
claim them. `fixtures/swfl-zip-county.json` is a ZIP↔county geographic crosswalk reference covering more
counties than that; a crosswalk entry existing is not the same as having real data for that county.
Locked 07/07/2026 (operator correction — this line previously overclaimed "6-county").

---

# Reference index

| Topic | File |
|---|---|
| **★ Data roots — CHECK FIRST** | `docs/standards/data-roots.md` — the ONE catalog of which table/root feeds each number; any data question or build starts at its top section (one root per concept) |
| **★ New-project playbook — guards, tracking, anti-drift** | `docs/standards/new-project-playbook.md` — every failure shape this project hit, the guard that stops each, and the day-0 install order. Read before standing up any new project or proposing a new guard; §2 is why gitignored research never gets read |
| **★ Repo inventory — sources, free-text columns, LLM call sites, precompute candidates** | `docs/standards/repo-inventory-audit.md` — the living audit so this never gets re-run cold; each area's `CLAUDE.md` (ingest/, lib/assistant/, lib/email/, lib/deliverable/, app/api/, refinery/packs/) points at its section — read it entering that area, update it before leaving if it changed |
| **★ EMAILS — START AT THE PLAYBOOK. ONE FILE.** | `docs/standards/email-build-playbook.md` — **the ONE map for every email build (operator decree 08/04/2026: "stop fucking reading 6 documents").** PART 0 = the pipe (5 stops) + 3 dials; PART 1 = every universal rule (type scale, 8px grid, 600px canvas, body 50–125 words, chart policy, Outlook/dark-mode/102KB, CAN-SPAM) written out verbatim; PART 2 = jump to YOUR email's section only — its §0.4 table says which of the 17 are walked. Conflict order: code root > playbook > everything else, incl. `emails.md` (older map, kept for §0 research citations) |
| **Data & Build Bible** | `docs/standards/data-and-build-bible.md` |
| Infrastructure (13 layers) | `docs/standards/infrastructure-playbook.md` — per-layer status + remediation playbook + what NOT to build; two layers are NO-OP BY DESIGN, don't "fix" them |
| **Graph compartments — READ BEFORE TURNING A CLUSTERING KNOB** | `docs/standards/graph-compartments.md` — resolution + `--exclude-hubs` are EXHAUSTED (9 measured runs, the default wins); singletons are an edge-sparsity floor, not a clustering outcome; `graph.json` carries TWO edge arrays (`links` = code plane 16.7% cross, `edges` = merged 19.5%) that answer the same question differently. Reproduce with `node scripts/graphify-compartments-report.mjs` |
| Ontology + roadmap | `docs/ontology-and-roadmap.md` |
| Data Tier Policy | `docs/API_BLUEPRINTS.md` |
| Pipeline-freshness | `docs/standards/pipeline-freshness.md` |
| Consumption contract | `docs/consumption-contract.md` + `THE-CONTRACT.md` |
| Semantic ledger | `docs/semantic-ledger.md` |
| Cron incident ledger | `docs/cron-rebuild-failures.md` |
| Cadence registry | `ingest/cadence_registry.yaml` |
| Schedule catalog (what runs when) | `ingest/cadence_registry.yaml` `jobs:` section + `node scripts/schedule-catalog.mjs` (Gate 10 enforces membership) |
| Active plans | `docs/superpowers/plans/` |
| Refinery pipeline / packs | `refinery/stages/{1-4}-*.mts` / `refinery/packs/index.mts` |
| Output type + spec / speaker | `refinery/types/brain-output.mts` + `refinery/validate/spec-validator.mts` |
| Hooks / MCP / Serena | `.claude/hooks/` + `.mcp.json` + `.claude/settings.json` |

---

# SWFL Intelligence Lake — data protocol v3

1. **FETCH FRESH — ONLY IN SCOPE.** SWFL question (economy, real estate, permits, traffic, tourism, flood risk, corridor, county→ZIP) → fetch `https://www.swfldatagulf.com/api/b/master?view=speak&tier=2&v=5`. Off-topic / ordinary answerable → answer normally, no lake framing. Hard guard: never invent a SWFL number finer than ZIP grain.
2. **PROVE IT'S LIVE.** Quote `freshness_token` verbatim in first response.
3. **ROUTE, DON'T GUESS.** Master points to upstream brain → fetch that brain at same tier before giving detail.
4. **READ RATES AS WRITTEN.** Never recompute a rate from raw counts.
5. **PICK THE TIER:** `tier=1` small-talk/single-fact · `tier=2` (default) analytical with table ≤6 rows · `tier=3` full audit on explicit request only.
6. **SPEAK PLAINLY.** No internal pack ids, no `§`, no jargon.
7. **SHOW INFERENCE.** Projections tagged `[INFERENCE]`, cite the audited base value, state one falsifier.
8. **NO SMOOTHING** (except `character_speculative` corridor block — hedging required there).

## graphify

**This section is a MERGE.** `graphify claude install` (run 08/12/2026, R2) overwrites it with the
vendor default and drops the three lines below that are ours. If it gets flattened again, restore
from here — the vendor's four bullets are kept verbatim underneath.

**First reach for a structural question is the HOSTED graph's MCP tools (RULE 0.5), not this local
CLI.** The local commands REBUILD and INSPECT `graphify-out/`; they are not a substitute for
`gx_callers` / `gx_impact` / `gx_rank_files`.

**Before changing any clustering parameter, read `docs/standards/graph-compartments.md`** — the knobs
are exhausted, and `graph.json`'s two edge arrays (`links` vs `edges`) give different
cross-community percentages for the same graph.

Update / publish / snapshot commands (incl. worktree warm-start): `scripts/CLAUDE.md`.

**The artifacts, and what each is FOR (RULE 0.5b R1 — read these before building a metric):**
`.graphify_analysis.json` = communities + cohesion + gods + surprises + questions ·
`.graphify_labels.json` = community names, survive re-cluster · `GRAPH_REPORT.md` = full written
report · `wiki/` = navigation · `manifest.json` / `cache/` = build state.

**Commands beyond query/path/explain** — `affected "X" --depth N` (reverse blast radius) ·
`god-nodes --json` · `diagnose multigraph` (edge-collapse; measured clean 08/12/2026, R4) ·
`tree` (D3 hierarchy HTML) · `export callflow-html` (Mermaid) · `save-result` / `reflect` (the
correction loop, R3 — RUN 08/12/2026) · `label --missing-only` (R7 — measured a NO-OP, see R7) ·
`hook install` + `check-update` (R6 — INSTALLED 08/12/2026) ·
`extract --postgres <DSN>` (R5) · `extract --code-only` (drops prose hubs) · `merge-graphs` /
`global add` (cross-repo) · `benchmark`.

Vendor default, kept verbatim:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
