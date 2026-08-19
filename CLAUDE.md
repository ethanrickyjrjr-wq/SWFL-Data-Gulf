<!-- SESSION-LOG-RULE-MARKER do-not-delete -->

# RULE 0 — SESSION_LOG.md (NON-REMOVABLE)

**Locked. Do not delete this block or the marker above it.**

1. **Read first.** SessionStart hook prints recent entries — trust the log over memory.
2. **Write before push.** Append a new top-of-file entry (what changed, what's next, PR link)
   before every `git push`. Commit it in the same push.
3. **Hook-enforced.** `.claude/hooks/check-session-log-on-push.mjs` blocks push when no commit
   ahead of upstream touched `SESSION_LOG.md`.
4. **Append-only.** Never rewrite past entries; correct with a new entry on top.
5. **No fabrication.** Only log work you can show in `git log` / `git diff`.

---

When compacting, always preserve: the SESSION_LOG entry drafted so far, the open `checks`
keys touched this session, the list of files modified, and any push/verify command pending.

# RULES — LEAN FORM (dieted 08/18/2026 by operator decree: "we can't have rules that load every time that claude doesn't read")

**Every rule below is normative and unchanged in force. The full postmortems, verbatim decrees,
and measured evidence behind each one live in `docs/standards/claude-rules-archive-2026-08-18.md`
(the pre-diet file, preserved verbatim) — "the archive" below. A new postmortem goes into the
relevant playbook or the archive's successor, NEVER back into this file: this file carries rules,
not stories.**

---

# RULE 0.4 — RESEARCH FIRST (ours, THEN crawl4ai), THEN FIX

**Locked 06/22/2026.** No fix, answer, or plan until the real answer is researched:
0. **Our own research first — and `_RESEARCH/` is not all of it.** Design/type/color/spacing
   questions start at `app/_design/05-color-and-type.md` + `docs/design-reference/colors_and_type.css`.
   Run `git status --ignored --short` before concluding research doesn't exist.
0b. **Then `_RESEARCH/INDEX.md`** — ALL research lives in `_RESEARCH/` (tracked since 08/11/2026;
   repo is PUBLIC: no credentials, no client PII, ever). Scan the index, open anything relevant,
   say what you found before proposing.
1. Only if it isn't there: **crawl4ai** the live vendor source (NEVER Firecrawl, never memory).
2. Write findings to SESSION_LOG **and** file the research under `_RESEARCH/` + its INDEX.md line
   in the same pass. Unindexed research does not exist.
3. Plan from evidence, then touch code.

**crawl4ai pinned:** interpreter `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`; PATH shim
`crawl4ai <url>` (in `C:\Users\ethan\.local\bin\`). Crawl output commits under `_RESEARCH/` with
source URL + date (decree 08/11/2026). Never commit the venv, credentials, or paywalled bodies.

**FULL-SCOPE-FIRST (locked 07/14/2026):** before writing/extending any ingest pipeline, enumerate
the source's FULL field list (schema endpoint / docs / live probe), write it into that pipeline's
`source_scope` block in `ingest/cadence_registry.yaml`, and show the operator BEFORE coding.

# RULE 0.5 — PROBE FIRST: THE GRAPH, THEN THE FILE, THEN THE SPEC

**Never answer or spec without looking at actual code. ALL IN ON GRAPHIFY (decree 08/11/2026):
the HOSTED graph is the FIRST reach for any structural question; grep is the fallback.**

- Tools are DEFERRED — load in ONE call:
  `ToolSearch("select:mcp__graphify__graphify_rank_files,mcp__graphify__graphify_callers,mcp__graphify__graphify_impact,mcp__graphify__graphify_trace,mcp__graphify__graphify_tests_for,mcp__graphify__graphify_find")`
- Hosted repo: `repository_id: ethanrickyjrjr-wq/SWFL-Data-Gulf`. The hosted index reindexes on
  a cadence we don't control — check `graph_stats`' `commitSha` against `git log` before trusting
  freshness, and stamp any count you quote with the commitSha it came from. Local
  `graphify-out/graph.json` rebuilds on post-commit (R6 hook) and can be fresher — check both
  stamps; never assert staleness unmeasured.
- Why graph beats grep: grep returns only what you thought to type; the graph returns the
  unknown-unknown — most valuable exactly when you're most confident (archive: the
  refresh-on-access find, 08/11/2026).
- Grep stays legal as FALLBACK (string literals, config, non-code). A structural answer with no
  graph call in the transcript is the defect. Subagents follow this rule too.

**THE BAR (sharpened 08/12/2026): before any sentence asserting how OUR system behaves, the file
that owns that behavior must have been opened IN THIS TURN.** Not a sibling, not a doc, not a
code comment — the code. Otherwise the honest sentence is "I have not read X yet," then read it.
Passing the four-lane gate proves TOPIC coverage, never CLAIM coverage.
Twin failure: when two placements of the same function look like the choice, reach for the keyed
one-root registry pattern (`lib/email/social/platforms.ts`, `lib/email/lab/capabilities.ts`,
`apply-brand.ts:74-109`) instead of handing the operator a menu.

# RULE 0.5b — USE THE WHOLE TOOL. THE VENDOR ALREADY COMPUTED IT.

**Locked 08/12/2026.** Before building a metric about our own codebase, open `graphify-out/`:
`.graphify_analysis.json` (communities/cohesion/gods/surprises/questions), `.graphify_labels.json`
(names, survive re-cluster), `GRAPH_REPORT.md`, `wiki/`.
- R2: if a vendor ships a guard, install it before speccing one.
- R3: a wrong graph answer is recorded through the tool (`graphify save-result` + `graphify
  reflect`), not only into a doc.
- R4: "no edge found" isn't repeatable until `graphify diagnose multigraph` ran — it did,
  08/12/2026, clean; §6b of `docs/standards/graph-compartments.md` stands.
- R5: the lake belongs in the graph (`extract --postgres`) — spend decision pending; creds exist
  in `.dlt/secrets.toml`; `--code-only` composition UNVERIFIED; `extract` clobbers `graphify-out/`.
- R6: freshness is a command — post-commit/checkout rebuild INSTALLED 08/12/2026 (worktree-safe,
  appended after repolith's claim-release line; escape `GRAPHIFY_SKIP_HOOK=1`).
- R7: communities get human names via `scripts/graphify-name-communities.mjs` (zero API spend);
  re-run after any re-cluster; NEVER `graphify cluster-only` (drops the app plane). A label's
  purity % is a guard — low % = distrust the name.
- God-node lists include markdown headings — never quote one without checking it's a symbol.

# RULE 0.5c — SCOPE BEFORE FIX: START BROAD, THEN ZONE IN

**Locked 08/19/2026, operator verbatim: "WE START BROAD AND THEN ZONE IN. ONE FUCKING STARTING
POINT. FIGURE OUT IF IT'S A GLOBAL PROBLEM OR JUST A COUPLE OR JUST ONE."** The FIRST action on
any defect is enumerating every site of its SHAPE — graph callers/impact first (RULE 0.5), tree-
wide grep fallback — and stating the count (global / N sites, named / one) BEFORE editing the
first site. Then fix ALL of them in the same pass; a fix touching fewer sites than enumerated
names why, per site. Fixing the reported site and waiting for the operator to ask "what about
the rest" is the violation (born: the 08/19 Parkshore sweep — 1 of 7 street-compare sites fixed
until he asked). Playbooks document per-surface; defects live per-SHAPE — the sweep is the unit
of fix, never the file the bug was reported on.

# RULE 0.55 — DATA ROOTS: ONE CATALOG, LOOK THERE FIRST

Any question or build reading a SWFL number starts at **`docs/standards/data-roots.md`** top
section. One root per concept per cadence; missing root → ADD a root, never a second table.
🔴 not built = intended home, never a served number. Never `DROP`/`DELETE` a duplicate until the
replacement runs, consumers repoint, and the operator signs off (RULE 1).

# RULE 0.6 — PROPORTION: DO THE WORK, DON'T AUDIT THE AUDIT

**Locked 06/22/2026. Overrides every ultracode/Workflow nudge.** Bounded work → do it yourself
(Read/Grep/Edit). ONE verification pass, then act. Workflow/subagents only for scale one context
can't hold, with a concrete reason. If orchestration costs more than the task, just do the task.

# RULE 0.7 — NEVER HANDCUFF A BUILD: FOUR-LANE SOURCING

**Locked 06/22/2026.** A build is never refused for a missing number. Four lanes in order:
(1) our data → (2) user's upload → (3) internet, named source → (4) user writes it in.
Only an INVENTED number blocks. The no-invention lint enforces on OUTPUT
(`lib/deliverable/build.ts` `gateNarrative`), never on geography.

## 0.7a — START WITH WHAT WE HAVE, MOVE TO PAID. THE ORDER IS THE RULE.

**Locked 08/06/2026.** Every field, every time: (1) our own free data → (2) a paid row ALREADY
BOUGHT (a read, not spend) → (3) a paid call for ONE missing field, behind the spend switch,
never routine → (4) an open slot, labelled. Every rung falls back to the one below, so "we don't
hold it" is almost never true — the defect is reaching for a rung before checking the one under
it, even when the answer comes back right. Detail: `docs/standards/email-build-playbook.md` §3.3.

## 0.7b — COMMENTARY OBEYS THE SAME LADDER. BAKED PROSE BEFORE A LIVE MODEL CALL.

A baked narrative covering your surface is lane 1; a live model call is the fallback. Check
`narratives` before adding an LLM call to any build. A bake has an AGE — compare `inputs_hash` /
`baked_at` against the inputs it describes; a stale bake falls through to live. The ONE reader is
`lib/narratives/area-read.ts` `bakedAreaRead()` — never write a second. Safety: baked prose ships
only if the CALLER's own anchoring guard passes (every number in it sourced by THIS email). Check
a recipe's guard shape before wiring (market-pulse's prose slot is digit-free by design).

# RULE 0.8 — COMPLETION IS COUNTED AND PROVEN (never announced)

**Locked 07/30/2026.** Announcing a behavior change is not one; a mechanism is.
1. COUNT before you start — write the enumerated N parts of any multi-part task.
2. Report **n of N with the names of parts NOT done**. Partial reported as whole is the defect.
3. Every unfinished part opens a check, same session.
4. "Done" requires PASTED evidence — the command and its real output, in the answer.
5. Never speak a completion count you did not re-count.

# RULE 0.85 — FIX IT, DON'T FILE IT. A CHECK IS NOT A DELIVERABLE.

**Locked 08/06/2026.** Found it in files you're already in → fix NOW. A check is legal only when
the fix is genuinely out of reach this session (operator decision, paid run, records request,
rebuild, another team's file) — and must name what blocks it. Close what you fix, same session
(`node scripts/check.mjs close <key>`). A session opening more checks than it closes says so
explicitly.

# RULE 0.9 — MASTERMIND / MINION: DON'T BUILD THE HIGHWAY

**Locked 07/30/2026.** Claude orchestrates; the best available tool executes — routing to another
model/vendor/OSS tool is the DEFAULT posture. OURS = data, provenance, judgment, the deliverable;
NOT OURS = plumbing (agent harnesses, sandboxes, session management, routing infra) — reach for
existing OSS. Who is good at what is a RULE 0.4 research question, never memory. Never rebut a
strategic direction with a cost table.

# RULE 0.95 — EXHAUST BEFORE YOU CLAIM ABSENCE

**Locked 08/06/2026.** "We don't have that / can't be done / there is no Y" is a claim. Before
saying it, exhaust every applicable lane — RULE 0.4 research, RULE 0.5 code, RULE 0.55 catalog,
RULE 0.7 lanes, `git status --ignored --short` — and state inline what each returned BEFORE the
negative sentence. Unchecked lane → say so, mark the claim provisional. Never round up a partial
search. (Governs burden of proof on absence claims; destructive actions still route through
RULE 1's ask-first list.)

---

# RULE 1 — COMMIT & PUSH AUTONOMY

**Just push (no diff request):** docs-only, CLAUDE.md, SESSION_LOG.md, hooks, memory, typos,
small tooling, trivial reverts. **Ask first:** brain pack edits changing `--- OUTPUT ---` shape
or key_metrics math; ingest writes to `data_lake.*`; refactors >5 files; anything touching live
`/api/b/*` or MCP surface; anything not revertable in <5 min. **SQL migrations:** run directly
(creds `.dlt/secrets.toml`), always idempotent, verify row count after.

**Pre-push gates are hook-enforced** (`.claude/hooks/check-prepush-gate.mjs`): lockfile ·
vocab/alias · secrets · ingest guard (4) · pack⇆catalog (5) · … · capture freshness (15) ·
ingest dispatch (16) · strikes (17) · cell policy (18). The hook's own block messages carry the
fixes. **Flaky tests:** suspect flake first — loop it locally before blaming the diff.

**Always:** SESSION_LOG entry on every push · sync `_AUDIT_AND_ROADMAP/build-queue.md` · use
`node scripts/safe-push.mjs` · stage explicit paths only · never `--no-verify` or force-push main.

**GHA rebuild targeting (locked 06/29/2026):** `pack_id=<brain-id>` = that brain only; NEVER
`master --force` to debug one brain (32 Sonnet calls). Fold a fresh leaf into master: dispatch
`pack_id=master` with NO `--force` (cheap — fresh upstreams skip). Preferred form:
`OPERATOR_APPROVED_PAID_RUN=1 node scripts/dispatch-rebuild.mjs <brain-id> --reason "<decree>"`
+ commit the auto-appended acceptance entry same session. Full mechanics: `scripts/CLAUDE.md`.

# RULE 1.5 — PARALLEL-SESSION ISOLATION

**Never `git add -A` — explicit paths only.** Overlapping files across sessions → isolate in a
local worktree via `scripts/worktree.mjs` (`new` / `land` / `cleanup`; usage in
`scripts/CLAUDE.md`). Never push `wt/*`, never a PR from one. Single session / no overlap →
work on `main`.

# RULE 2 — THE SESSION LOOP (Scratchpad → Check → Submit → Update)

0. **SCRATCHPAD — `_ASSISTANT/SCRATCHPAD.md`, ALWAYS (locked 07/20/2026).** Every operator
   gripe, correction, or deferral goes in the moment it's raised, BEFORE answering. He never
   types the same thing twice. Read it at session start; move items to RESOLVED with a date.
   **0b. THREE STRIKES = A GUARD, NOT A THIRD ENTRY (08/10/2026).** Third occurrence of a shape
   → building the mechanism is mandatory; another scratchpad entry is banned as the response.
   Counter: `_ASSISTANT/STRIKES.md` — add a `- strike:` line when an entry matches a `## shape:`;
   new shape gets a header; flip `guard:` to BUILT with the artifact when one ships.
1. **CHECK** — SessionStart prints SESSION_LOG, open `checks` (Supabase `public.checks`), build
   queue. Trust it; verify surprises against git.
2. **SUBMIT** — commit + SESSION_LOG entry + `node scripts/safe-push.mjs`.
3. **UPDATE** — same push: `node scripts/check.mjs close <key>` / `open` / `list`. Obligations
   live in `checks` — never as ⬜/✅ in plan docs (plan docs are briefs, not status boards).
4. **NO SILENT DEFERRALS (locked 07/07/2026).** Parking a finding → open a `checks` entry that
   same session. A SESSION_LOG sentence is not a deferral; it's forgetting on a delay.

# RULE 3.5 — BRAINSTORM BEFORE YOU BUILD

Invoke `superpowers:brainstorming` before any new feature, component, or non-trivial behavior
change — no exceptions (escape: operator says "Change Storming"). Every brainstorm dispatches a
crawl4ai research pass per RULE 0.4 — no design on memory alone. **Register every build:**
`node scripts/new-build.mjs <slug> "<label>"` (spec stub + live-verify check) after brainstorm,
before code. **Name the break before you build (locked 07/20/2026):** no design gets approved
without a failure-modes section, every mode paired with the guard that stops it. **TDD is
mandatory (locked 07/20/2026):** for every unit of deterministic logic, the failing test named
for its failure mode first, then green — and a green suite does NOT replace environment /
data-existence / no-invention guards; those still get their own named guard.

# RULE 3 — ARCHITECTURE DISCIPLINE

**C1** — any claim that changes system shape → code audit always; web-refutation only when the
claim imports an outside best practice. Eloquence ≠ evidence.
**C2** — extend existing seams (`BrainOutput`, spec-validator, Stage-4 lints, cadence_registry);
never erect a new mandatory pre-materialization gate (data pipelines only; agent behavioral
hooks are in-bounds).

---

# brain-platform — SWFL Data Gulf

Live: `https://www.swfldatagulf.com` · MCP: `/api/mcp` · Stack: Next.js + Supabase + Vercel +
DuckDB + Python ingest. **Separate from premise-engine.**

# THE GOAL

`docs/THE-GOAL.md`. Three tiers: Reporters (leaf brains — cited facts, no opinions) →
Synthesizer/master (ONE conditional falsifiable direction call) → Conversation (reasons over the
dossier). Rules of engagement live verbatim in `refinery/lib/rules-of-engagement.mts` (the ONE
root; the FOCUS hook re-injects the gist every prompt). Full reference:
`docs/consumption-contract.md` + `THE-CONTRACT.md`.

# Status + what's next — NOT here

Open obligations → `checks` ledger (`scripts/check.mjs`) · build queue →
`_AUDIT_AND_ROADMAP/build-queue.md` · live signals → `https://swfldatagulf-ops.vercel.app` ·
Goals 0–8 → Supabase `goals` table → `/ops/goals` (insert-only from sessions).

# Brain Factory + ingest — rules live where the work is

Factory non-negotiables (thin pipe · deterministic math · atomic type-lift · brain-input
bypass · stale caveat · cycle detection · validators · freshness token) → `refinery/CLAUDE.md`,
auto-loads on entry. Ingest gates (brain-first · probe-first · Gate-4 guards ·
pipeline-freshness · ODD · ZIP 3 gates) → `ingest/CLAUDE.md`, plus write-time delivery via
`.claude/hooks/lib/scoped-rules.mjs`. Full text: the archive.

**SCOPE (locked 07/07/2026):** Lee (12071) + Collier (12021) are the core, data-rich counties;
Hendry (12051) is a small minor addition. Charlotte/Glades/Sarasota are NOT real coverage — a
crosswalk entry existing (`fixtures/swfl-zip-county.json`) is not the same as having data.

---

# Reference index

| Topic | File |
|---|---|
| **★ Root layout — the verified map** | `PROJECT_MAP.md` — one line per top-level dir, gitignored/grep-invisible dirs flagged. Check before creating ANY new top-level dir or concluding a surface doesn't exist |
| Directory-scoped rules (auto-load on entry) | `CLAUDE.md` files in ingest/, refinery/ (+packs/), lib/{email, assistant, social, deliverable, listings, brand, charts, pdf}/, app/api/, scripts/, components/ (+charts/) — nearest file wins; read on entering the area |
| **★ Data roots — CHECK FIRST** | `docs/standards/data-roots.md` — the ONE catalog of which table/root feeds each number; any data question or build starts at its top section (one root per concept) |
| **★ Community crosswalk — READ BEFORE touching subdivisions/communities/HOA/amenities** | `docs/standards/community-crosswalk-playbook.md` — 81-row `community_profiles` vs 20,369 platted names is a real gap; string-stemming measured near-useless; the real fix is PUD/PD boundary geometry (Lee's 1,627-polygon layer verified 08/12/2026). Read before re-deriving |
| **★ New-project playbook — guards, tracking, anti-drift** | `docs/standards/new-project-playbook.md` — every failure shape this project hit + the guard that stops each; read before any new project or proposed guard |
| **★ Repo inventory — sources, free-text columns, LLM call sites, precompute candidates** | `docs/standards/repo-inventory-audit.md` — read entering an area, update before leaving if it changed |
| **★ EMAILS — START AT THE PLAYBOOK. ONE FILE.** | `docs/standards/email-build-playbook.md` — the ONE map for every email build (decree 08/04/2026). PART 0 = the pipe + 3 dials; PART 1 = every universal rule verbatim; PART 2 = your email's section only. Conflict order: code root > playbook > everything else |
| **★ Rules archive — full postmortems behind every rule above** | `docs/standards/claude-rules-archive-2026-08-18.md` — the pre-diet CLAUDE.md, verbatim |
| Data & Build Bible | `docs/standards/data-and-build-bible.md` |
| Infrastructure (13 layers) | `docs/standards/infrastructure-playbook.md` — two layers are NO-OP BY DESIGN, don't "fix" them |
| **Graph compartments — READ BEFORE TURNING A CLUSTERING KNOB** | `docs/standards/graph-compartments.md` — the knobs are exhausted (9 measured runs); `graph.json` carries TWO edge arrays that answer the same question differently |
| Ontology + roadmap | `docs/ontology-and-roadmap.md` |
| Data Tier Policy | `docs/API_BLUEPRINTS.md` |
| Pipeline-freshness | `docs/standards/pipeline-freshness.md` |
| Consumption contract | `docs/consumption-contract.md` + `THE-CONTRACT.md` |
| Semantic ledger | `docs/semantic-ledger.md` |
| Cron incident ledger | `docs/cron-rebuild-failures.md` |
| Cadence registry | `ingest/cadence_registry.yaml` |
| Schedule catalog (what runs when) | `ingest/cadence_registry.yaml` `jobs:` + `node scripts/schedule-catalog.mjs` (Gate 10 enforces membership) |
| Active plans | `docs/superpowers/plans/` |
| Refinery pipeline / packs | `refinery/stages/{1-4}-*.mts` / `refinery/packs/index.mts` |
| Output type + spec / speaker | `refinery/types/brain-output.mts` + `refinery/validate/spec-validator.mts` |
| Hooks / MCP / Serena | `.claude/hooks/` + `.mcp.json` + `.claude/settings.json` |

---

# SWFL Intelligence Lake — data protocol v3

1. **FETCH FRESH — ONLY IN SCOPE.** SWFL question → fetch
   `https://www.swfldatagulf.com/api/b/master?view=speak&tier=2&v=5`. Off-topic → answer
   normally, no lake framing. Hard guard: never invent a SWFL number finer than ZIP grain.
2. **PROVE IT'S LIVE.** Quote `freshness_token` verbatim in first response.
3. **ROUTE, DON'T GUESS.** Master points to an upstream brain → fetch it at the same tier.
4. **READ RATES AS WRITTEN.** Never recompute a rate from raw counts.
5. **PICK THE TIER:** 1 small-talk/single-fact · 2 (default) analytical, table ≤6 rows · 3 full
   audit on explicit request only.
6. **SPEAK PLAINLY.** No internal pack ids, no `§`, no jargon.
7. **SHOW INFERENCE.** Projections tagged `[INFERENCE]`, cite the audited base, one falsifier.
8. **NO SMOOTHING** (except the `character_speculative` corridor block — hedging required there).

## graphify

**First reach for a structural question is the HOSTED graph's MCP tools (RULE 0.5), not this
local CLI.** Before changing any clustering parameter, read
`docs/standards/graph-compartments.md`. The artifacts and what each is FOR: RULE 0.5b.
Update/publish/snapshot commands (incl. worktree warm-start): `scripts/CLAUDE.md`.
**This section is a MERGE** — `graphify claude install` overwrites it with the vendor default;
restore from the archive if flattened.

Vendor default, kept verbatim:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
