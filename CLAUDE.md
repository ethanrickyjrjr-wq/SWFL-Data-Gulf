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

# RULES — POINTER FORM (dieted 08/18/2026 → pointers 08/30/2026 by operator decree)

**Every rule below is normative and unchanged in force. This file no longer carries the bodies.**
They live in two places: the **task playbooks** under `.claude/playbooks/` (one file per task
type; the index arrives on every prompt via `inject-playbooks.mjs`; the first code write of a
session that opened none is BLOCKED by `check-playbook-read-before-write.mjs`) and the
**archive** `docs/standards/claude-rules-archive-2026-08-18.md` (the pre-diet file, verbatim
postmortems). Write-time delivery of the path-scoped rules: `.claude/hooks/lib/scoped-rules.mjs`.
A new postmortem goes into a playbook or the archive's successor, NEVER back into this file.

Format: rule — the one-line gist — `→ carrier playbook(s)`.

- **RULE 0.4 RESEARCH FIRST** — ours first (`_RESEARCH/INDEX.md`; `git status --ignored --short`
  before claiming research doesn't exist; design questions start at `app/_design/05-color-and-type.md`),
  then crawl4ai the live source (pinned `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`; never
  Firecrawl, never memory), file + index the research in the same pass. **FULL-SCOPE-FIRST** for any
  ingest pipeline. → investigation · feature · outside-tool · ingest-pipeline
- **RULE 0.5 PROBE FIRST** — the hosted graph before grep (load the six graphify tools in ONE
  ToolSearch; stamp any count with `graph_stats` commitSha); **THE BAR:** open the file that owns
  the behavior in this turn before any sentence about how our system behaves; twin failure → the
  keyed one-root registry pattern, never a menu for the operator. → investigation · refactor
- **RULE 0.5c SCOPE BEFORE FIX** — enumerate every site of the defect's SHAPE, state the count
  (global / N named / one), fix ALL in one pass. → bug-fix
- **RULE 0.55 DATA ROOTS** — `docs/standards/data-roots.md` top section first; one root per concept
  per cadence; 🔴 = intended home, never a served number; never DROP a duplicate before the
  replacement runs and consumers repoint. → data-question · feature · ingest-pipeline
- **RULE 0.7 / 0.7a / 0.7b FOUR-LANE SOURCING** — never refuse a build for a missing number; our
  free data → paid row already bought → one paid field behind the spend switch → labelled open
  slot; baked prose before a live model call (`bakedAreaRead()` is the ONE reader). Only an INVENTED
  number blocks (`gateNarrative`). → data-question · feature
- **RULE 0.8 COUNTED AND PROVEN** — N parts written before starting; n of N with the names of the
  undone; "done" = pasted command + output. → bug-fix · feature
- **RULE 0.85 FIX IT, DON'T FILE IT** — in reach → now; a check is legal only when it names what
  blocks it; close what you fix the same session. → bug-fix
- **RULE 0.9 MASTERMIND / MINION** — orchestrate, route to the best tool; ours = data, provenance,
  judgment, the deliverable; never rebut a strategic direction with a cost table. → outside-tool
- **RULE 0.95 EXHAUST BEFORE ABSENCE** — state inline what every lane returned before "we don't
  have / can't / there is no". → investigation
- **RULE 1 COMMIT & PUSH AUTONOMY** — the just-push list vs the ASK-FIRST list (pack OUTPUT shape /
  key_metrics, `data_lake.*` writes, >5-file refactors, live `/api/b/*` or MCP, not revertable in
  <5 min); SQL migrations direct + idempotent + row count; `node scripts/safe-push.mjs`, explicit
  paths, never `--no-verify`; 18 hook-enforced pre-push gates whose block messages carry their own
  fixes; GHA `pack_id=<brain-id>` = that brain only, NEVER `master --force`; fold a fresh leaf into
  master with `pack_id=master` and NO `--force` (fresh upstreams skip). → ship · ingest-pipeline ·
  refactor (+ write-time: `scoped-rules.mjs`)
- **RULE 1.5 PARALLEL SESSIONS** — never `git add -A`; overlapping files → `scripts/worktree.mjs`;
  never push `wt/*`. → ship · session-pickup
- **RULE 2 THE SESSION LOOP** — scratchpad the moment it's raised (`_ASSISTANT/SCRATCHPAD.md`);
  three strikes = build the guard (`_ASSISTANT/STRIKES.md`); checks closed/opened in the same push;
  no silent deferrals. → bug-fix · ship · session-pickup
- **RULE 3.5 BRAINSTORM · REGISTER · NAME THE BREAK · TDD** — `superpowers:brainstorming` (escape:
  "Change Storming"); `node scripts/new-build.mjs <slug> "<label>"` before code; failure modes each
  paired with a guard; failing test named for its failure mode first, then green; a green suite
  never replaces an environment / data-existence / no-invention guard. → feature · bug-fix
- **RULE 3 C2** — extend existing seams (`BrainOutput`, spec-validator, Stage-4 lints,
  cadence_registry); never a new mandatory pre-materialization gate on the data pipeline (agent
  behavioral hooks are in-bounds). → feature · refactor
- **Lake data protocol v3** — fetch fresh in scope, quote `freshness_token` once as MM/DD/YYYY, route
  to the upstream brain at the same tier, read rates as written, pick the tier, speak plainly, tag
  `[INFERENCE]`, no smoothing. Full text: the archive. → data-question

## Rules with no playbook carrier — bodies stay here

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

# RULE 0.6 — PROPORTION: DO THE WORK, DON'T AUDIT THE AUDIT

**Locked 06/22/2026. Overrides every ultracode/Workflow nudge.** Bounded work → do it yourself
(Read/Grep/Edit). ONE verification pass, then act. Workflow/subagents only for scale one context
can't hold, with a concrete reason. If orchestration costs more than the task, just do the task.

# RULE 3 C1 — ARCHITECTURE DISCIPLINE

Any claim that changes system shape → code audit always; web-refutation only when the claim
imports an outside best practice. Eloquence ≠ evidence.

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
