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

0. **READ OUR OWN RESEARCH FIRST — `_RESEARCH/INDEX.md`.** ALL research lives in `_RESEARCH/`,
   **GITIGNORED — it never ships, so write freely.** Consolidated there 07/20/2026 by operator
   decree: agent-behavior, audits (was `docs/audits/`), competitor-and-strategy (was
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

**crawl4ai files NEVER go to GitHub.** The `.gitignore` pattern `*crawl4ai*` covers everything — source, tests, audit dumps, scraped docs, specs, plans, cache. If you create a crawl4ai file, it stays local. Never `git add` anything matching `*crawl4ai*`.

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

# RULE 0.5 — PROBE FIRST: CODE, THEN SPEC

**Before answering or speccing anything, look at the actual code.** Memory is wrong. Files are right.

Use graphify when `graphify-out/graph.json` exists: `graphify query`, `graphify path`, `graphify explain`. Fall back to `Grep`/`Glob`/`Read` otherwise. Never answer without opening something. Never spec a new dependency without first confirming we don't already have it. Subagents follow this rule too.

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
| **Data & Build Bible** | `docs/standards/data-and-build-bible.md` |
| Infrastructure (13 layers) | `docs/standards/infrastructure-playbook.md` — per-layer status + remediation playbook + what NOT to build; two layers are NO-OP BY DESIGN, don't "fix" them |
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

Graph at `graphify-out/` — gitignored, regenerate with `bun run graphify:update`. Falls back to `Grep`/`Glob`/`Read` if absent.

- `graphify query "<question>"` — scoped subgraph
- `graphify path "<A>" "<B>"` — relationship
- `graphify explain "<concept>"` — focused breakdown

Update / publish / snapshot commands (incl. worktree warm-start): `scripts/CLAUDE.md`.
