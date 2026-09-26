# 2026-09-26 Pipeline plans — THE BRIEF (read in full before touching anything)

Operator's ask, 09/26/2026, verbatim gist: **one Opus on each pipeline** figuring out problems, what is working,
what is being brought in, what is missing, how we make it better or whether it is good enough. **Checks and
balances for every process that are NOT 500 GitHub issues.** What should be on the Fedora/Spectre box that
isn't. Not little detail. **Every Opus comes back with a COMPLETE plan for its pipelines and double-checks
its work.** A second Opus then tries to break each plan.

You are one of those Opus agents. Your family (the pipelines you own) is named in your prompt and mapped in
`00-FAMILIES.md`. Your output is ONE file: `docs/audit/2026-09-26-pipeline-plans/<NN>-<family>.md`.
You write nothing else in the repo. You do not fix code. You do not open GitHub issues. You do not push.

## Hard rules (violating one voids the plan)

1. **Never an invented number.** Every count, date, row total, run id, dollar figure or percentage in your
   plan is preceded by the command or file:line that produced it. If you did not run it, you do not write it.
2. **Anthropic API console credit is NOT a lane.** Do not propose, mention, price, or hint at adding or topping
   up Anthropic API credit — not as an option, not as "the cheap one". A leg that is dead on the credit wall
   (`400 credit balance too low`) is re-routed to a permitted lane (§Compute lanes) or PARKED with a name.
   This has been decreed seven times; the operator reads every plan.
3. **The operator's standing decision:** these pipelines are internal / not customer-facing, so the Max plan
   is a legitimate lane for unattended LLM legs. Do not relitigate the Agent-SDK terms paragraph in
   `wiki/pipeline-health.md`. Record the decision once if a leg depends on it, then move on.
4. **Open the file that owns the behavior before any sentence about how it behaves** (RULE 0.5 THE BAR).
   A registry line, a wiki page or a doc is a claim; the pipeline code, the workflow YAML, `gh run view` and
   the live table are evidence. Where they disagree, say "X verified, Y needs review".
5. **Research first, ours first.** `_RESEARCH/` is gitignored and invisible to repo-wide Grep — search it with
   `rg --no-ignore -i <source> _RESEARCH/` or Grep with `path=_RESEARCH`. Read `_RESEARCH/INDEX.md` lines for
   your sources. `docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md` and
   `docs/handoff/2026-07-11-reliable-sources-findings.md` already hold findings for most sources — cite them,
   never re-derive them. Then `docs/standards/data-inventory.md` (source → size/cadence),
   `docs/standards/data-roots.md` (concept → root), `wiki/pipeline-census.md`, `wiki/pipeline-health.md`,
   `docs/cron-rebuild-failures.md`.
6. **No relitigation of closed decisions:** SteadyAPI is OUT (09/15). Listings legs are PARKED by his word.
   No RentCast. No ATTOM (does not exist here). Daily digest is killed. Lee ArcGIS permit layers are frozen at
   March 2025 — do not retire the Accela cron on them. The 09/15 ledger bankruptcy stands — do not resurrect
   old checks. NORTH STAR (`_ASSISTANT/NORTH-STAR.md`) is the standing plan; your plan extends it.
7. **Plain text.** No blockquotes, no tables. Headings, bullets, code fences for commands only. Paths as
   `path:line`. As-of dates MM/DD/YYYY.
8. **Read `.claude/playbooks/investigation.md` first** (a hook blocks the first write of a session that opened
   no playbook). Run `graphify query "<your family> pipeline"` once at the start — the Bash hook demands it
   before grep; one call satisfies it.
9. Do NOT dump `.env.local`. A hook blocks any command that names the file without the single-variable
   pattern. To query the lake, copy the connection approach in `scripts/apply-fdic-sod-view.mts:10-30`
   (Bun.SQL, credentials from the dlt secret) into a throwaway `bun -e` or a script in your scratchpad dir —
   never commit it. `node scripts/check.mjs list` is the checks ledger. `gh run list --workflow <file> --limit 15
   --json databaseId,status,conclusion,createdAt,event` and `gh run view <id> --log-failed | tail -80` are the
   run evidence. The GitHub CLI is logged in.
10. Never run a pipeline for real. `--dry-run` is allowed ONLY if the pipeline's own docstring proves it is
    read-only (four pipelines' dry-run was a full production write until 09/20 — check the fix landed for
    yours before trusting it). Never dispatch a workflow. Never write to `data_lake.*`.

## What you must establish per pipeline (the evidence chain)

source → ingest (workflow file + pipeline dir) → `data_lake.*` table(s) → `consuming_pack` (leaf brain, or a
repo path, or `none`) → master. For EACH pipeline in your family, in this order:

- registry entry (`ingest/cadence_registry.yaml`, quote the `name:` line number), lane, cadence_days,
  workflow, consuming_pack, expected_rows_min, source_scope.source_ceiling
- workflow YAML: runner (`runs-on`), schedule, secrets it needs, LLM calls (grep for anthropic / claude /
  ANTHROPIC_API_KEY / openai / refinery in the workflow and in the pipeline dir), timeout
- last 15 runs: how many green / red / cancelled, the newest green date, the newest red's classified cause
  (`.github/scripts/classify-cron-failure.mjs` is the classifier; quote the log line)
- live table: row count, MAX of the freshness column, MIN/MAX of the source period column, distinct county
  coverage (Lee 12071 / Collier 12021 / Hendry 12051 are the scope; anything else is not coverage)
- tests: `ingest/tests/` or `ingest/pipelines/<name>/tests` — count, last run status if you can see it
  (`bun test` / `pytest -q <path>` are allowed, they do not write)
- consumers: who reads the table — grep `refinery/sources`, `refinery/packs`, `lib/`, `app/` for the table
  name; if nothing does, that is a finding (DARK ROOT), not a footnote
- source freshness: does the SOURCE still publish? (crawl4ai the source page if the registry line has no
  freshness field — `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`; never Firecrawl, never memory)

## Required sections of your plan file (exact headings, in this order)

1. `# <NN> <family> — pipeline plan (09/26/2026)` then one paragraph: the family, the pipelines, the verdict.
2. `## 1. Scope` — the pipelines (registry names), their workflow files, tables, consumers. Count them.
3. `## 2. What is being brought in` — per pipeline: source, fields, geography, cadence, live rows + freshness
   (command shown), coverage of the three counties.
4. `## 3. What is working` — per pipeline, with the run ids / test counts that prove it.
5. `## 4. Problems` — each one: symptom (quoted log / query), root cause (file:line), severity (blocks a served
   number / blocks a consumer / cosmetic), first seen (date, from the run list or the known-problems ledger).
6. `## 5. What is missing` — vs `source_ceiling`, vs what the consumer pack needs, vs data-roots; fields or
   years or geographies the free source publishes that we do not pull; consumers that should exist and do not.
7. `## 6. Verdict per pipeline` — one of GOOD ENOUGH / IMPROVE / REPAIR / PARK / RETIRE, one line of reason,
   the single number that would change the verdict.
8. `## 7. The plan` — ordered items. Each item: what, where (file), lane (see §Compute lanes), effort
   (S / M / L), the proof command that shows it landed, and what it unblocks. Items that need the operator's
   word (schema drop, data_lake write shape, a paid switch) are marked ASK-FIRST. Everything else is DO.
9. `## 8. Checks and balances` — the monitoring design for this family using EXISTING seams only:
   `ingest/check_freshness.py` + the registry's `freshness_sla` / `expected_rows_min`, `assert_landed.py`,
   the doctor (find it: `rg -l "doctor" scripts .github/scripts`), `node scripts/check.mjs`,
   `.github/scripts/classify-cron-failure.mjs` + `heal-cron-failure.mjs` + `log-cron-incident.mjs`, and the ops
   site (`https://swfldatagulf-ops.vercel.app/coverage`). Design rule: ONE signal per pipeline that fires only
   when a served number would be wrong or a consumer would read stale, auto-closes when green, and NEVER files
   a GitHub issue per run. Name what existing noise to delete (issues, checks, labels) and what to add. If the
   right mechanism is a registry field, name the field and the value.
10. `## 9. Box placement` — for each pipeline: stays on GHA `ubuntu-latest` / moves to the Fedora runner
    (`runs-on: [self-hosted, swfl-local]`, gated by `SWFL_LOCAL_RUNNER_READY`) / becomes a Hermes `no_agent`
    script job on Spectre / stays where it is. Reasons that count: WAF or residential IP needed, job > 6 h,
    needs the SSD archive (`SWFL_RESEARCH_ROOT=/srv/swfl/research`), needs a browser, needs a local model.
    Also: anything ALREADY on the box that should not be. Read `_ASSISTANT/2026-09-15-fedora-runner-runbook.md`
    and `docs/superpowers/handoffs/2026-09-20-runner-live-what-is-next.md` first — the runner is live.
11. `## 10. Compute lane per LLM leg` — list every LLM call in your family (grep proves the list; "none" is a
    valid answer with the grep shown). For each: what it does, current auth (API key / mocked / dead), the
    replacement lane, and whether the leg can be redesigned to need no model at all (preferred — deterministic
    first, `bakedAreaRead()` before a live call).
12. `## 11. Double-check log` — you re-read your own plan top to bottom and, for every numbered claim, write:
    claim · the command or file that verifies it · verified / corrected / could-not-verify. Corrections are
    applied in the sections above, not only logged here. A plan with an empty double-check log is rejected.
13. `## 12. Questions for the operator` — only decisions that are genuinely his (money, structure, product
    shape). Zero is a fine number. No design choices dressed as questions.

## Compute lanes (the only ones that exist)

- **Lane D — deterministic, no model.** GHA `ubuntu-latest` (free while the repo is public), the Fedora
  runner (residential IP, always on, no minute cost, the T5 SSD at `/srv/swfl`), or a Hermes `no_agent`
  script job on Spectre (`cronjob_tools.py` supports it). Preferred for everything that fetches, counts,
  grades or compares.
- **Lane M — Max plan.** An unattended `claude -p` on the Fedora runner authenticated with the operator's
  Max login (`CLAUDE_CODE_OAUTH_TOKEN`, not an API key), a Claude Code cloud routine (the repo already has
  `weekly-dep-scan` / `weekly-platform-health` on that seam), or an interactive Max session authoring content
  directly (the Issue 001 pattern). For LLM legs that must run unattended.
- **Lane C — Codex CLI.** `codex` 0.157.0 is installed on the Windows box on the operator's OpenAI plan. Use it
  as the independent second reviewer of a plan or a diff, or for a bounded unattended job where a second
  vendor is wanted. Verify live (`codex --help`, the docs) before naming a flag.
- **Lane L — local models.** Ollama on Windows (qwen3.6:35b-a3b, gpt-oss:20b, gemma4:12b, hermes3:8b,
  UserLM-8b — `ollama list` 09/18) and Hermes agent. Draft-only: a local model may propose, never certify a
  number. Never part of numeric extraction, comparison, or grading. Our research on Hermes is already written
  — read before designing a Hermes job: `_RESEARCH/agent-behavior/2026-08-08-hermes-model-upgrade-research.md`,
  `2026-08-09-hermes-continuous-work-research.md` (the `/goal` completion-contract loop, cron, Telegram
  delivery; division of labor: Hermes = bounded gated grinding + watchdogs, Claude = judgment + anything landing
  on main, Hermes never pushes) and `2026-08-10-hermes-skills-hooks-blueprints-research.md` (webhook trigger).
  Confirm the paths with `ls _RESEARCH/agent-behavior/ | grep hermes`; `_RESEARCH/INDEX.md:90-107` lists them.
- **Not a lane:** Anthropic API console credit. See rule 2.

## Standing facts you do not re-derive (cite, then act)

- Spectre = the Fedora box = one HP Spectre x360 running Fedora 44, always on, `ssh fedora`, runner
  `fedora-swfl-local` labels `self-hosted, Linux, X64, swfl-local`, venv `~/swfl-runner-venv` (py 3.12),
  `SWFL_LOCAL_RUNNER_READY=true` since 09/20. dbpr-sirs and crexi are hard-pinned to it; collier records is
  gated to it; the Windows runner never re-registered. Proven runs: 35493215223 (smoke), 35493240512 (sirs),
  35493241730 (crexi), 35494269223 (collier records). The T5 SSD: ext4 `SWFLDATA` at `/srv/swfl`, ~973 GB
  free, backup and reboot test untested.
- The DB REST layer was DOWN on 09/21 (PGRST002, egress throttle shape from 07/21). It is up on 09/26 at the
  time this brief was written (`node scripts/check.mjs list` returned 21 open). If a query fails with
  PGRST002 or a statement timeout, say so and move on; do not restart anything.
- `nightly-chain.yml` has failed its `assert_landed` row gate every run since ~08/25 because the listings legs
  and city pulse (credit wall) are parked; `daily-rebuild`, `narrative-bake`, `gate-a-parity`,
  `grade-predictions` are stalled behind it. Master brain last rebuilt 08/19.
- 111–113 workflows; the census is `wiki/pipeline-census.md`; `node scripts/schedule-catalog.mjs` prints what
  runs when; Gate 10 enforces registry membership.
- Five DARK ROOTS (data lands, nothing reads it): listing_week, dbpr_re_licensees, cre_figures,
  swfl_search_demand, realtor_geo_trends. Plus fdic_locations / fdic_institutions (check
  `fdic_directories_no_consumer`).
- 21 open checks (09/26): `node scripts/check.mjs list`. Read them; the ones in your family are yours to plan.

## How the second Opus will try to break your plan

It re-runs your commands. It opens every file:line you cite. It checks every number against the live table.
It looks for a pipeline in your family you did not cover, a consumer you did not find, a run you called green
that was red, a section you left thin, an LLM leg you missed, a box-placement claim with no reason, an issue-per-
run alert you left standing, and any sentence that could be read as an API-credit suggestion. Every miss is
corrected in your file and counted against it. Write so it finds nothing.
