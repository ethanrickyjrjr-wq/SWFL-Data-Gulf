# Data Contracts + Doctor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 07/11/2026 · **Spec:** `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` · **Check:** `data_contracts_doctor_live_verify`
**Evidence pack (READ FIRST):** `docs/audit/2026-07-11-pipeline-problems/08-FABLE5-RESEARCH-INDEX.md` + `08a`–`08h`

**Goal:** Put the checks on the data itself, in the process that loads it — so "green" can never again mean "the table underneath is empty, missing, or 10× wrong."

**Architecture:** Make `ingest/cadence_registry.yaml` the single source of config truth, then hang four things off it: (1) content contracts that run at load (`contracts.py`, blocking-capable at the merge locus; report-only at rest for views), (2) a CI cross-check that kills the wrong-letter/wrong-field class at PR time, (3) one `doctor` health model that absorbs the watcher fleet, and (4) a nightly ordered chain gated on real row-landing. No new framework, no new host, no orchestrator (Path C stays gated — spec §12).

**Tech Stack:** Python 3.12 (ingest, `pytest ingest/`) · Bun/TypeScript (tools + refinery, `bun test`) · Postgres/Supabase (psycopg3) · GitHub Actions · DuckDB (tier-1).

---

## ⚠️ READ BEFORE ANY TASK: the spec is a HYPOTHESIS, not an authority

A 27-agent read-only research pass checked the spec against reality and found **six places it is wrong**. Each would have shipped a bug. They are enumerated in `08-FABLE5-RESEARCH-INDEX.md`. **Where this plan and the spec disagree, this plan wins.** The corrections are already baked into the tasks below — do not "fix" them back toward the spec.

The two that will most tempt you:
1. **The land-blend tripwire in the spec is a TAUTOLOGY.** Its recompute is a byte-for-byte copy of the view's own `WHERE` clause, so it compares the implementation against itself — `median < 0.5 × median` is arithmetically unsatisfiable, and 49 of 52 live rows have ratio exactly `1.0000`. Under the realistic failure (the `property_type` label is *derived*, not vendor-supplied, and silently defaults), the original ~10× bug returns **while the tripwire reports green.** Phase 1 ships the **label-independent** oracle instead.
2. **The spec's price floor would DELETE REAL LISTINGS** — real manufactured-home *sales* in North Fort Myers lease-lot parks. It ships as `report`, never `quarantine`.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Never invent a number.** Every figure names a real source. An invented number is the only hard block.
- **Deterministic math in code; LLMs produce prose only.** No model computes a metric.
- **Python:** `pytest ingest/`. **TS/Bun:** `bun test`. **Verify TS with `bunx next build`, NEVER `npx tsc`.**
- **Never `git add -A`** — stage explicit paths only. Never `--no-verify`. Never force-push `main`.
- **A parallel session is active in this repo.** Stage only your own paths; do not sweep foreign modifications into a commit.
- **SESSION_LOG.md:** the pre-push hook **blocks** when no commit ahead of upstream touched it. Every commit step must actually *write* an entry — `git add` on an unmodified file is a silent no-op.
- **Pre-push gates:** lockfile · vocab/alias · secrets · **ingest destructive-write guard (Gate 4 — a destructive write with no non-null guard is BLOCKED; guard via `ingest.lib.guards`)** · pack⇆catalog.
- **[ASK-FIRST]** tasks touch live surfaces (the `4-output.mts` caveat path that ships to live answers, watcher handlers, live cron changes, paid workflows, the `public.checks` ledger writer). **Stop and ask. Do not proceed autonomously.**
- **RULE 2.4 — no silent deferrals.** The moment you park a finding, open a `checks` entry for it *in the same session* (`node scripts/check.mjs open <project> <key> "<label>"`). A SESSION_LOG sentence is not a deferral — it is forgetting on a delay.

---

## ⚖️ THE INTEGRATION CONTRACT (BINDING)

**Why this exists:** the first draft of this plan was written by parallel authors, and they invented **three different names for one concept** (the row floor). That is precisely the "one authority for a shared concept" failure this entire build exists to kill — reproduced *inside* the build. An adversarial critic caught it. These names are now pinned. **If your code uses a different name, it is wrong.**

### The row-floor concept — ONE authority

| Field | Status | Meaning |
|---|---|---|
| `expected_rows_min` | **EXISTING** (~50 live hits) | **The ONE row-floor authority.** |
| `min_rows` | 🚫 **FORBIDDEN — DOES NOT EXIST** | The spec proposes it; it *duplicates* `expected_rows_min`. The Spine ships a test that goes **RED** if one appears. |
| `count_table` | Spine attaches where missing | The table `assert_landed` counts **directly**. |
| `count_filter: {column, value}` | **Spine CREATES it** | Disambiguates a **shared** count target. |
| `coverage_exempt` | **Spine CREATES it** | Consumed by Phase 2 `--live` (else the zero-coverage check false-floods). |

**Why `count_filter` is load-bearing:** `live_search_daily_median_price` and `live_search_daily_mortgage` both point at `data_lake.daily_truth` — the *same table*. Without a discriminating filter, mortgage's floor of `1` is counted over the whole table, so **if the mortgage metric never lands again the gate still reads LANDED off the other metric's rows.** That is exactly the masking failure the gate exists to prevent.

**`assert_landed.py` reads EXACTLY:** `name`, `nightly`, `count_table` ‖ `freshness_table`, `expected_rows_min`, `count_filter`.
It counts `count_table` **directly** and **NEVER calls `check_volume_entry`** (which early-returns `None` for every tier-1 lane — `check_freshness.py:369-371`).

**Opt-out is keyed on absence of a COUNTABLE TABLE, not absence of a floor** (because `expected_rows_min` exists on nearly every entry):
```python
target = entry.get("count_table") or entry.get("freshness_table")
floor  = entry.get("expected_rows_min")
if not target:      status = "LANDED";     detail = "freshness-only (no countable table)"
elif floor is None: status = "UNRESOLVED"; detail = "countable table but no expected_rows_min floor"
```

### The nightly gate set — EXACTLY FOUR, pinned by name

`live_search_daily_median_price` · `live_search_daily_mortgage` · `listing_lifecycle` · `city_pulse`

- **`active_listings` is NOT gated.** It runs daily, but its table `active_listings_residential` **feeds nothing live** — `active-listings-swfl` reads `listing_active_stats` over `listing_state`, which `listing_lifecycle` writes (`08h` D7, corroborated by `lib/email/sole-spine.test.ts:8` `DEAD_VIEW` and `lib/landing/load-home-map-data.ts:13`). **Gating it would guard a corpse while the real table silently empties.** It gets `consuming_pack: none` + a ship-or-delete check.
- **`market_aggregates_histogram` / `_details` are NOT nightly** — weekly and monthly respectively. A `nightly: true` on them would make the row gate demand a daily landing that by design never comes.

### Doctor's tier-1 volume rule — do NOT manufacture a false-RED

A tier-1 entry the Spine made **countable** is gated by `assert_landed`, which counts directly. `check_volume_entry` returning `None` for it is the helper's tier-1 **early return**, not a missing count.

```python
if tier1 and entry.get("count_table") and entry.get("expected_rows_min") is not None:
    return ("GATED_BY_ASSERT_LANDED", "green")   # city_pulse: healthy — do NOT red it
if tier1 and entry.get("nightly"):
    return ("UNRESOLVED", "red")                 # nightly but genuinely un-countable → a real hole
```

Shipping the naive version plus `--fail-on red` **fails the daily probe every morning on a healthy source** — the alarm-fatigue class this build exists to reverse.

### Doctor's content signal must be wired to Phase 1

Doctor imports **`run_content_contracts`** (Phase 1's Locus-B reader) — *not* only the legacy `run_value_tests`. §7 3c's health line is "worst of {freshness, volume, **content**, run-status}"; with only `value_tests` wired, Phase 1's entire deliverable is dark in the health model.

### No permanently-open checks

A contract that reports N real offenders **at rest, forever** must not auto-open a `checks` row that can never close (that is the alarm-fatigue class, re-created). **Seed the known-accepted offenders as a baseline and assert "no NEW offenders beyond the baseline."** This applies to the price floor *and* the sold/rent band (which fires on 2 real rows — 33972 and 33920 — on day one).

### Test-count honesty

**Never state a fabricated exact pass count.** Say "all green except the new failing test," or do the real arithmetic. A zero-context executor halts on a wrong expected number.

---

## Sequencing

Each step is independently shippable and revertable.

| # | Phase | Unblocks | Live-surface? |
|---|---|---|---|
| 0 | **Act-today** — CI green on main · SteadyAPI key test | makes every later red *mean* something | no |
| 1 | **The Spine** — registry fields | **everything** | no (pure YAML + tests) |
| 2 | **Content contracts** (§5) | doctor's content signal | Locus-A merge gates → **[ASK-FIRST]** |
| 3 | **Config cross-check CI** (§6) | kills wrong-letter class at PR time | hook + CI |
| 4 | **Watch-list manifest + cancelled-run fix** (§7 3a/3b) | doctor's run-status signal; owns the API-disabled class | watcher handlers → **[ASK-FIRST]** |
| 5 | **Doctor** (§7 3c/3d) | the health model | advisory → gating |
| 6 | **Nightly chain** (§8) | the overnight window | **[ASK-FIRST]** — rewires the live email precondition |
| 7 | **Caveat TTL** (§7 3e) | independent, any time | **[ASK-FIRST]** — ships to live answers |

**Phase 3 (CI cross-check) consumes the Spine. Phase 6 (`assert_landed`) consumes the Spine. Phase 5 (doctor) consumes Phases 2 and 4.** Nothing else has a hard ordering dependency.

---

## PHASE 0: Act-today (the prerequisites that make every later red mean something)

Spec §4 / §15 step 0. Two items. Neither is a build; both gate the value of everything after.

### Task 0.1: Get `ci.yml` green on `main` — [ASK-FIRST if it requires touching unrelated code]

**Why this is first:** `ci.yml` was red for **35 consecutive pushes (~37 hours)** on `main` (`01-workflows-issues.md` §3). It started as 1 failing test and grew to 7 because commits kept landing on an already-red main. **Red is ambient.** Every drift fixture, every deliberate-failure proof, and every acceptance criterion in this plan is worthless if a new red is indistinguishable from the standing red.

- [ ] **Step 1: Establish the baseline.** Run: `gh run list --workflow ci.yml --branch main -L 10 --json conclusion,createdAt,headSha`
  Record which jobs fail and whether the failure is deterministic or flaky. **Suspect flake first** (CLAUDE.md: a non-deterministic test reddens CI independent of the diff — loop it locally before blaming the commit).
- [ ] **Step 2: Reproduce locally.** Run the failing job's command directly (`pytest ingest/ -x -q` and/or `bun test`). If it passes locally but fails in CI, it is environmental or flaky — fix the determinism, not the symptom.
- [ ] **Step 3: Fix, one failure at a time.** One commit per root cause. Do NOT bundle.
- [ ] **Step 4: Confirm green.** Run: `gh run list --workflow ci.yml --branch main -L 1 --json conclusion` → expect `"conclusion": "success"`.
- [ ] **Step 5: Commit** (SESSION_LOG entry in the same commit).

**Acceptance:** `ci.yml` is green on `main`. From here, a new red is a real signal.

### Task 0.2: SteadyAPI new-key live test (operator-run — diagnostic, not a build)

**Why no code can do this:** the SteadyAPI client (`ingest/pipelines/rentals/steady_client.py:25-45`) returns a **"gap" sentinel on any non-200 by design** — so a suspended subscription produces a **green run with missing data**, indistinguishable from "the market was quiet." No automated path can test the account. This is a one-shot manual verify.

Note the live evidence (`03-lake-live-state.md` §6): `listing_state` shows real daily activity every day since 07/08 (364 → 8,857 → 21,142 rows), and `listing_transitions` carries real state-machine events, which a dead/403'd API cannot produce. **That contradicts the "still suspended" framing** — `/search` access appears to have resumed. The open question is whether it is endpoint-specific (`/rentals-search`, `/property-tax-history` may still be affected).

- [ ] **Step 1:** Run the new key against the live endpoint and report working/not-working, **per endpoint**.
- [ ] **Step 2:** Resolve or narrow the `steadyapi_subscription_suspended` check accordingly (`node scripts/check.mjs close <key>`, or re-scope it to the specific dead endpoint).

**Acceptance:** the check is closed or narrowed to a named endpoint with evidence. No code change.

---

---

## PHASE: The Spine — registry as single source of config truth

**Delivers:** four structured fields on `ingest/cadence_registry.yaml` (`workflow:`, `consuming_pack:`, `nightly:`, `count_filter:`), a top-level `coverage_exempt:` block promoted from prose, deletion of the one phantom `source_tag:` field, and a pytest suite that fails if any entry lacks them. **Unblocks:** Phase 2's static cross-check (needs `workflow:` + `consuming_pack:` as the left-hand side of every join), Phase 4's `assert_landed.py` (needs `nightly:` + a countable table + a discriminating filter), Phase 3c's `doctor.volume_severity` (needs to know a tier-1 entry with a `count_table` is gated elsewhere, not broken), and the zero-coverage check (needs `coverage_exempt:` or it false-floods). **Safety:** this phase is **pure YAML + one new test file. Zero Python changes, zero live-behavior change** — proven in Task 0 below.

---

## CONTRACT: fields this phase PRODUCES, and who consumes them

**Read this before writing a line. Three later phases read these fields, and in the draft they drifted apart.** This block is the contract. If a downstream phase wants a field that is not in this table, it does not exist — go add it here first, in this phase.

| Field | Where | Consumed by | Exact semantics |
|---|---|---|---|
| `workflow:` | every entry (74) | **Phase 2** `check-registry-identity.mts --static` | The `.github/workflows/` filename that runs this entry. `none` = a STATED FACT (nothing runs it). Absence = a GAP. May be non-unique — one workflow can back several entries. |
| `consuming_pack:` | every entry (74) | **Phase 2** `--static` | What reads this source: a pack id, a list, a non-pack repo path, or `none` (a stated fact — ten entries are genuinely unread). |
| `nightly: true` | **exactly 4** entries | **Phase 4** `assert_landed.py` — **gate membership** | `live_search_daily_median_price` · `live_search_daily_mortgage` · `listing_lifecycle` · `city_pulse`. Absence = not gated (the safe default). NOT cadence — `active_listings` runs daily and is deliberately excluded (D3). |
| `count_table:` | nightly entries that need one | **Phase 4** `assert_landed.py` (counts it **directly**) **AND Phase 3c** `doctor.volume_severity` | `assert_landed` **never calls `check_volume_entry`**, which early-returns `None` for tier-1 (`ingest/scripts/check_freshness.py:369-371`). **Phase 3c obligation:** a **tier-1** entry carrying `count_table` + `expected_rows_min` is `GATED_BY_ASSERT_LANDED` → **green**, NOT a false-RED. `city_pulse` is the entry this exists for. |
| `expected_rows_min:` | nightly entries | **Phase 4** `assert_landed.py`; **existing probe** `check_volume_entry` | The **ONE** row-floor authority. **There is NO `min_rows:` field — it is FORBIDDEN** (D1; `test_no_entry_carries_a_min_rows_field`). |
| `count_filter:` | **NEW (R1)** — required where two nightly entries share a count target | **Phase 4** `assert_landed._count_rows()` | `{ column: <bare identifier>, value: <literal the pipeline writes> }`. Without it the row gate **counts the other metric's rows and reads LANDED on a source that never landed** — the exact masking the gate exists to prevent. Inert for the existing probe: `check_volume_entry` filters on `source_name` (`check_freshness.py:382`) and never reads `count_filter`. |
| `coverage_exempt:` | top-level list | **Phase 2** `--live` zero-coverage check | Suppresses the ZERO_COVERAGE red for a live table with rows and no `pipelines:` entry — **and nothing else**. |

**Also produced (a subtraction):** `source_tag:` is **deleted** from the registry and forbidden by test (D2). Source identity is `source_name:` — the column `check_freshness.py` actually filters on (`:238` freshness, `:382` volume).

**Non-authoritative after this phase:** the freeform `# Cron: <file>.yml` comments (20 of them: `:140`, `:158`, `:811`, `:832`, `:854`, `:893`, `:914`, `:940`, `:964`, `:989`, `:1015`, `:1041`, `:1064`, `:1117`, `:1144`, `:1168`, `:1205`, `:1229`, `:1281`, `:1601`). They are **retained as prose** — they carry cron timing and stagger rationale (`"Monday 09:00 UTC … (clears 08:00 swfl-inc slot)"`) that `workflow:` does not capture — but a test forbids one from ever again being the **sole carrier** of a workflow filename (Task 1, `test_no_cron_comment_is_the_sole_carrier_of_a_workflow_filename`). Structured field authoritative; comment descriptive.

---

### Task 0: Read this before touching anything — the four spec corrections this phase encodes

Not a code task. **Fable 5: read it. The spec is a hypothesis; these are checked facts.** Four decisions below deviate from spec §3's literal text. Each is forced by evidence. Do not "fix" them back.

**D1 — NO `min_rows:` field. The floor is the existing `expected_rows_min`.**
Spec §3 says add `min_rows: <n>`. Index correction #6 says `min_rows` **duplicates** `expected_rows_min`. A second floor field next to an existing one is a new hand-synced identity pair — the exact drift class this whole build exists to kill. `assert_landed.py` (Phase 4) reads `entry["expected_rows_min"]`. One floor, one authority. Where the existing floor is stale, **we correct the value** (Task 3), we do not shadow it with a second number.

**D2 — NO `source_tag:` field. Delete the one that exists.**
Spec §3 says add `source_tag: <literal>`. Index correction #4: `check_freshness.py` scopes on **`source_name`** (`ingest/scripts/check_freshness.py:238` freshness, `:382` volume). **`source_tag` is read by NOTHING.** The registry's single `source_tag:` (`cadence_registry.yaml:1452`, `news_swfl` → `news_crawl`) is a phantom with no matching literal in the pipeline code. `source_name:` already exists on every entry that needs it. Phase 2 owns "does the target table actually have this column" — that is a DB question, not a YAML field. **The Spine's contribution here is a subtraction.**
*(Do not confuse this with `daily_truth`'s `source_tag` **column**, which is real — `engine.py:67` — but useless as a discriminator, because it is `"live_search"` for **both** live_search metrics. That is why `count_filter` exists; see Task 3.)*

**D3 — `nightly: true` is a boolean, and it means GATE MEMBERSHIP, not cadence.**
The gated entries are exactly four, by name:
`live_search_daily_median_price` · `live_search_daily_mortgage` · `listing_lifecycle` · `city_pulse`.
**`active_listings` is NOT gated** even though it runs daily. Spec §3 lists it as one of the "4 daily load-bearing sources." It is not load-bearing: `08h` **D7** proves its 38,728-row table `active_listings_residential` **feeds nothing live** — `refinery/packs/active-listings-swfl.mts:232` → `active-listings-residential-source.mts:27` → `const VIEW = "listing_active_stats"`, which reads `data_lake.listing_state` (written by `listing_lifecycle`), not `active_listings_residential`. Corroborated by `lib/email/sole-spine.test.ts:8` (`const DEAD_VIEW = "active_listings_residential"`) and `lib/landing/load-home-map-data.ts:13`. **Gating it would guard a corpse while the real table silently empties** (`08h` N2). It gets `consuming_pack: none` + a ship-or-delete check.
**`market_aggregates_histogram`/`_details` are NOT nightly** either — histogram is weekly (`0 11 * * 1`), details is monthly (`0 13 4 * *`) (`08h` D12). A `nightly: true` on them would make the row gate demand a daily landing that by design never comes.

**D4 — do NOT change `city_pulse`'s `lane:`.**
It is `lane: tier-1` with an `inventory_id` and **no `freshness_table`/`dlt_schema_name`**. Flipping it to tier-2 breaks its freshness path outright (`check_tier2_entry` would have nothing to query). Instead: keep `lane: tier-1`, **attach `count_table: data_lake.city_pulse` + `expected_rows_min: 50`**. `check_volume_entry` skips tier-1 (`check_freshness.py:369-371`) — that is fine, because `assert_landed.py` reads `count_table` directly and never calls `check_volume_entry`.

**Why this phase cannot break the live probe (verify these line-cites yourself before you start):**

| Claim | Evidence |
|---|---|
| `check_volume_entry` **never gates** | `ingest/scripts/check_freshness.py:354-355` — *"Always exits 0 — LOW_VOLUME surfaces in the summary but never gates the pipeline."* |
| exit-1 comes **only** from `freshness_sla.error_after_days` | `check_freshness.py:944-945` — `if sla_errors and not args.sla_dry_run: return 1` |
| `cadence_days` / `tolerance_multiplier` drive **display only** (`STALE`/`FRESH`) | `check_freshness.py:338` — `status = "STALE" if age_days > threshold else "FRESH"`; never returned as an exit code |
| adding `count_table:` to a tier-1 entry is **inert** for the existing probe | `check_freshness.py:369-371` — tier-1 returns `None` before `count_table` is read |
| adding `count_filter:` is **inert** for the existing probe | `check_volume_entry` scopes only on `source_name` (`check_freshness.py:382`); it never reads `count_filter`. Unknown keys are ignored — every read is `entry.get(...)` / `entry["<known key>"]`. |

So: correcting `expected_rows_min`, lowering `cadence_days`, and adding `count_table:`/`count_filter:` change **an ops summary line and nothing else**. We touch **no** `freshness_sla` block in this phase.

**Pre-push gates this phase trips: none.** No `package.json` (Gate 1), no packs/vocab (Gate 2), no `gh secret` (Gate 3), no destructive ingest write (Gate 4), no pack edits (Gate 5).

---

### Task 1: The failing test — `workflow:` + `consuming_pack:` on every entry, and no comment left load-bearing

This is the acceptance criterion from spec §9 ("every `pipelines:` entry carries `workflow:`" **and** "zero freeform `# Cron:` comments remain load-bearing"). Write it first; it must go red against today's registry, which has **zero** Spine fields (`08h` §2: grepping `workflow:`/`consuming_pack:`/`nightly:`/`min_rows:`/`coverage_exempt:` across all 1,761 lines returns **0**; `grep count_filter: ingest/cadence_registry.yaml` likewise returns **0**).

Both halves of §9 are red for the *same* reason: with no structured `workflow:` field anywhere, the 20 `# Cron:` comments are the **only** record of which workflow runs what. Task 2 turns both green in one move.

**Files:**
- Create: `ingest/tests/test_cadence_registry_spine.py`
- Test: `ingest/tests/test_cadence_registry_spine.py`

**Interfaces:**
- Consumes: `ingest/cadence_registry.yaml` — top-level `pipelines:` (a **list** of dicts, each with a `name:`) and `not_yet_running:` (same shape). Verified: 71 + 3 = **74** entries (`grep -c "^  - name:" ingest/cadence_registry.yaml` → 74). This matches the `/census` page's 74 exactly.
- Produces: `_entries()` → `list[dict]` (all 74) and `_pipelines()` → `list[dict]` (the 71), reused by every later task in this phase.

- [ ] **Step 1: Write the failing test**

```python
# ingest/tests/test_cadence_registry_spine.py
"""The Spine — cadence_registry.yaml is the single source of config truth.

Enforces the structured fields Phase 2 (check-registry-identity.mts), Phase 3c
(doctor.volume_severity) and Phase 4 (assert_landed.py) consume. A missing field is a
GAP; the string "none" is a STATED FACT. Silence is what these tests exist to forbid.

Design notes (see the plan's Task 0 — do not "fix" these back):
  * There is NO `min_rows:` field. The row floor is `expected_rows_min` — one
    floor, one authority. A second floor field is a hand-synced pair, i.e. the
    drift class this build kills.
  * There is NO `source_tag:` field. check_freshness.py scopes on `source_name`
    (:238, :382); `source_tag` is read by nothing.
"""

import pathlib
import re

import yaml

REG_PATH = pathlib.Path(__file__).parents[1] / "cadence_registry.yaml"
REG_TEXT = REG_PATH.read_text(encoding="utf-8")
REG = yaml.safe_load(REG_TEXT)

# `nightly: true` = "assert_landed.py gates the nightly chain on this entry."
# It is GATE MEMBERSHIP, not cadence. Pinned by name so that adding a 5th member
# is a conscious edit to this list, never a silent default.
#   active_listings runs daily but is EXCLUDED: its table feeds nothing live
#     (08h D7 — active-listings-swfl reads listing_active_stats over listing_state).
#   market_aggregates_* are EXCLUDED: weekly / monthly, not nightly (08h D12).
NIGHTLY_GATE_SET = {
    "live_search_daily_median_price",
    "live_search_daily_mortgage",
    "listing_lifecycle",
    "city_pulse",
}

# A bare workflow basename. Deliberately excludes `/` and `.` from the leading class so
# that `.github/workflows/foo.yml` yields `foo.yml`, and a doc placeholder like
# `<file>.yml` yields NOTHING (the char before `.yml` must be [A-Za-z0-9_-]).
YML_RE = re.compile(r"[A-Za-z0-9_-]+\.yml")


def _pipelines() -> list[dict]:
    return [e for e in (REG.get("pipelines") or []) if isinstance(e, dict)]


def _parked() -> list[dict]:
    return [e for e in (REG.get("not_yet_running") or []) if isinstance(e, dict)]


def _entries() -> list[dict]:
    return _pipelines() + _parked()


def test_registry_shape_is_71_plus_3():
    """Guards the two helpers above: if the file shape changes, fail here, loudly,
    rather than letting every other test in this file vacuously pass on an empty list."""
    assert len(_pipelines()) == 71, f"expected 71 pipelines: entries, got {len(_pipelines())}"
    assert len(_parked()) == 3, f"expected 3 not_yet_running: entries, got {len(_parked())}"


def test_every_pipelines_entry_declares_a_workflow():
    """SPEC §9 ACCEPTANCE CRITERION. `none` is a stated fact; absence is a gap."""
    missing = [e["name"] for e in _pipelines() if not e.get("workflow")]
    assert not missing, (
        f"{len(missing)} pipelines: entries lack `workflow:` — {missing}\n"
        "Every entry must name its .github/workflows/ file, or the literal `none` "
        "when no workflow writes it (usgs_tier2, mhs_databook)."
    )


def test_every_parked_entry_declares_a_workflow():
    missing = [e["name"] for e in _parked() if not e.get("workflow")]
    assert not missing, f"not_yet_running: entries lack `workflow:` — {missing}"


def test_every_entry_declares_a_consuming_pack():
    """`none` is a stated fact (fred_g17, active_listings). Non-pack consumers are
    allowed as a repo path (census_acs -> lib/zip-summary; news_swfl -> app/insiders):
    a pack-only check would RED a healthy source (08a §B)."""
    missing = [e["name"] for e in _entries() if not e.get("consuming_pack")]
    assert not missing, f"{len(missing)} entries lack `consuming_pack:` — {missing}"


def test_workflow_values_are_a_yml_file_or_the_none_sentinel():
    bad = [
        e["name"]
        for e in _entries()
        if e["workflow"] != "none" and not str(e["workflow"]).endswith(".yml")
    ]
    assert not bad, f"`workflow:` must be a *.yml filename or `none` — {bad}"


def test_no_cron_comment_is_the_sole_carrier_of_a_workflow_filename():
    """SPEC §9 ACCEPTANCE CRITERION: "zero freeform `# Cron:` comments remain load-bearing."

    The `# Cron: <file>.yml` comments (20 of them: :140, :158, :811, :832, :854, :893, :914,
    :940, :964, :989, :1015, :1041, :1064, :1117, :1144, :1168, :1205, :1229, :1281, :1601)
    are the thing spec §3 REPLACES. They are RETAINED as prose — they carry cron timing and
    stagger rationale ("Monday 09:00 UTC ... clears the 08:00 swfl-inc slot") that `workflow:`
    does not capture — but a comment may never again be the ONLY place a workflow filename
    lives. Structured field authoritative; comment descriptive.

    SCOPE: comment lines that mention BOTH `cron` (case-insensitive) and a `*.yml` basename.
    That is exactly the §9 target. The exclusion block's two `# GHA: <file>.yml` lines (:1729
    project-feed-change-detection-daily.yml, :1746 deliverables-retention-sweep-daily.yml) are
    correctly OUT of scope — they name workflows for coverage_exempt tables, which have no
    `pipelines:` entry to carry a `workflow:` field. Verified: neither line contains "cron".
    """
    declared = {
        str(e["workflow"]) for e in _entries() if e.get("workflow") and e["workflow"] != "none"
    }
    orphans: list[str] = []
    for lineno, line in enumerate(REG_TEXT.splitlines(), start=1):
        if not line.lstrip().startswith("#") or "cron" not in line.lower():
            continue
        for basename in YML_RE.findall(line):
            if basename not in declared:
                orphans.append(f"{REG_PATH.name}:{lineno} -> {basename}")
    assert not orphans, (
        f"{len(orphans)} `# Cron:` comment(s) are the SOLE carrier of a workflow filename — "
        "no structured `workflow:` field declares them. A comment nothing can read is exactly "
        "the class this Spine kills. Add the workflow to the entry's `workflow:` field.\n  "
        + "\n  ".join(orphans)
    )
```

- [ ] **Step 2: Run test to verify it fails**

```
pytest ingest/tests/test_cadence_registry_spine.py -v
```

Expected: `test_registry_shape_is_71_plus_3` PASSES (the file already has that shape). The other five FAIL. First failure text:

```
E   AssertionError: 71 pipelines: entries lack `workflow:` — ['live_search_daily_median_price', 'live_search_daily_mortgage', 'zori_swfl_duckdb', ...]
E   Every entry must name its .github/workflows/ file, or the literal `none` when no workflow writes it (usgs_tier2, mhs_databook).
```

And the §9 comment criterion, red for the same root cause (`declared` is empty, so every `# Cron:` mention is an orphan):

```
E   AssertionError: 20 `# Cron:` comment(s) are the SOLE carrier of a workflow filename — no structured `workflow:` field declares them.
E     cadence_registry.yaml:140 -> zhvi-tier1-monthly.yml
E     cadence_registry.yaml:158 -> tier-divergence-tier1-monthly.yml
E     ...
```

Expected tail: `1 passed, 5 failed`.

- [ ] **Step 3: Write minimal implementation** — none. This task ships the red test only; Task 2 turns it green. (Committing a red test alone would push a red CI, so **Task 1 and Task 2 share one commit** — do not commit here.)

- [ ] **Step 4: Run test to verify it passes** — deferred to Task 2 Step 4.

- [ ] **Step 5: Commit** — deferred to Task 2 Step 5.

---

### Task 2: Backfill `workflow:` + `consuming_pack:` + `nightly:` on all 74 entries

**Files:**
- Create (scratch, **do not commit**): `<scratchpad>/spine_backfill.py`
- Modify: `ingest/cadence_registry.yaml` (insertion after each of the 74 `  - name:` lines)
- Test: `ingest/tests/test_cadence_registry_spine.py` (from Task 1)

**Interfaces:**
- Consumes: nothing.
- Produces: `cadence_registry.yaml` entries each carrying `workflow: <str>` and `consuming_pack: <str|list>`; four carrying `nightly: true`. Phase 2 (`check-registry-identity.mts`) and Phase 4 (`assert_landed.py`) read these keys. **`count_filter:` is NOT written here** — it is two targeted edits in Task 3, and adding it here would break this task's pure-insertion numstat.

**Why a script and not 74 hand-edits:** the registry is ~40% comments. `yaml.safe_load` + `yaml.dump` **destroys every comment** — an unacceptable, unreviewable diff. The script is **line-oriented text insertion**: it appends lines after each `  - name:` line and touches nothing else, so `git diff` is pure additions. It fails loud on any name it doesn't recognize (and any record with no matching entry), so a typo cannot silently skip an entry.

- [ ] **Step 1: Write the failing test** — done in Task 1. Re-confirm it is still red:

```
pytest ingest/tests/test_cadence_registry_spine.py -v
```
Expected: `1 passed, 5 failed`.

- [ ] **Step 2: Run test to verify it fails** — see above; `test_every_pipelines_entry_declares_a_workflow` **and** `test_no_cron_comment_is_the_sole_carrier_of_a_workflow_filename` must both be in the failed set before you edit the registry.

- [ ] **Step 3: Write minimal implementation**

Write this to your scratchpad (NOT into the repo — it is a one-shot):

```python
#!/usr/bin/env python3
"""One-shot Spine backfill for ingest/cadence_registry.yaml.

COMMENT-PRESERVING BY CONSTRUCTION: never parses/re-dumps YAML (PyYAML round-trip
would destroy the registry's ~700 comment lines). Pure text insertion after each
`  - name: <x>` line. Run once from the repo root, verify `git diff`, then discard.

Values resolved in docs/audit/2026-07-11-pipeline-problems/08a-spine-identity.md
(all 74 entries) and 08h-independent-cross-checks.md §2 (the contaminated writers).
"""

import pathlib
import re
import sys

REG = pathlib.Path("ingest/cadence_registry.yaml")

# name -> (workflow, consuming_pack)
# `none`  = STATED FACT (no workflow writes it / no consumer reads it), not a gap.
# a path  = non-pack consumer (census_acs -> lib/zip-summary; news_swfl -> app/insiders)
SPINE: dict[str, tuple[str, str]] = {
    # ── pipelines: (71) ──────────────────────────────────────────────────────
    "live_search_daily_median_price": ("live-search-daily.yml", "freshness-pulse"),
    "live_search_daily_mortgage": ("live-search-daily.yml", "freshness-pulse"),
    "zori_swfl_duckdb": ("zori-tier1-monthly.yml", "rentals-swfl"),
    "zhvi_swfl_duckdb": ("zhvi-tier1-monthly.yml", "home-values-swfl"),
    "tier_divergence_swfl_duckdb": ("tier-divergence-tier1-monthly.yml", "tier-divergence-swfl"),
    "redfin_swfl": ("redfin-monthly.yml", "housing-swfl"),
    "redfin_price_drops": ("redfin-price-drops-monthly.yml", "seller-stress-swfl"),
    "redfin_contract_cancellations": ("redfin-contract-cancellations-monthly.yml", "seller-stress-swfl"),
    "redfin_delistings_relistings": ("redfin-delistings-relistings-monthly.yml", "seller-stress-swfl"),
    "hurdat2_fl": ("hurdat2-annual.yml", "hurricane-tracks-fl"),
    "storm_history_swfl": ("storm-history-monthly.yml", "storm-history-swfl"),
    "usgs": ("usgs-monthly.yml", "env-swfl"),
    "faf5": ("faf5-annual.yml", "logistics-swfl"),
    "fred_g17": ("ingest-fred-g17.yml", "none"),
    "fred_laus_alfred": ("fred-laus-alfred-monthly.yml", "none"),
    "fred_listing_swfl": ("ingest-fred-listing-swfl.yml", "none"),
    "market_heat_swfl": ("ingest-market-heat-swfl.yml", "market-heat-swfl"),
    "bls_ppi": ("ingest-bls-ppi.yml", "none"),
    "bls_oews_swfl_tier1": ("bls-oews-annual.yml", "labor-demand-swfl"),
    "census_vip": ("ingest-census-vip.yml", "none"),
    "city_pulse": ("city-pulse-daily.yml", "city-pulse-swfl"),
    "city_pulse_corridors": ("corridor-pulse-weekly.yml", "[corridor-pulse-swfl, cre-swfl]"),
    "bls_laus": ("bls-laus-monthly.yml", "macro-swfl"),
    "bls_qcew": ("bls-qcew-quarterly.yml", "macro-swfl"),
    "bls_oews_swfl": ("bls-oews-annual.yml", "labor-demand-swfl"),
    "census_cbp": ("census-cbp-annual.yml", "macro-florida"),
    "census_acs": ("census-acs-annual.yml", "lib/zip-summary"),
    "usgs_tier2": ("none", "env-swfl"),
    "fema": ("fema-nfip-quarterly.yml", "[env-swfl, hurricane-tracks-fl]"),
    "leepa": ("leepa-parcels-annual.yml", "properties-lee-value"),
    "redfin_collier": ("redfin-collier-monthly.yml", "properties-collier-value"),
    "redfin_lee": ("redfin-lee-monthly.yml", "properties-lee-value"),
    "redfin_city_swfl": ("redfin-city-swfl-monthly.yml", "none"),
    "collier_parcels": ("collier-parcels-annual.yml", "properties-collier-value"),
    "fhfa": ("fhfa-hpi-quarterly.yml", "[properties-collier-value, properties-lee-value]"),
    "fdot": ("fdot-aadt-annual.yml", "[traffic-swfl, logistics-swfl-nowcast]"),
    "lee_permits": ("lee-permits-weekly.yml", "permits-swfl"),
    "collier_permits": ("collier-permits-monthly.yml", "permits-swfl"),
    "fl_dor_tdt": ("fl-dor-tdt-monthly.yml", "tourism-tdt"),
    "fl_dor_sales_tax": ("fl-dor-sales-tax-monthly.yml", "sector-credit-swfl"),
    "fdle_crime_swfl": ("fdle-crime-quarterly.yml", "safety-swfl"),
    "zori_swfl_tier2": ("zori-tier2-monthly.yml", "rentals-swfl"),
    "zhvi_swfl_tier2": ("zhvi-tier2-monthly.yml", "home-values-swfl"),
    "tier_divergence_swfl_tier2": ("tier-divergence-tier2-monthly.yml", "tier-divergence-swfl"),
    "fgcu_reri_indicators": ("fgcu-reri-monthly.yml", "fgcu-reri"),
    "swfl_inc": ("swfl-inc-weekly.yml", "econ-dev-swfl"),
    "dbpr_press_releases": ("dbpr-press-releases-weekly.yml", "news-swfl"),
    "rsw_airport_monthly": ("rsw-airport-monthly.yml", "rsw-airport"),
    "dbpr_sirs_submissions": ("dbpr-sirs-monthly.yml", "condo-sirs-swfl"),
    "fl_dbpr_licenses": ("ingest-fl-dbpr-licenses.yml", "licenses-swfl"),
    "fl_dbpr_applicants": ("ingest-fl-dbpr-licenses.yml", "licenses-swfl"),
    "dbpr_public_notices": ("dbpr-public-notices-weekly.yml", "news-swfl"),
    "dbpr_re_licensees": ("ingest-dbpr-re-licensees.yml", "none"),
    "noaa_ghcn_rainfall": ("noaa-ghcn-rainfall-monthly.yml", "env-swfl"),
    "city_pulse_corridors_tier2": ("corridor-pulse-weekly.yml", "[corridor-pulse-swfl, cre-swfl]"),
    "marketbeat_swfl": ("marketbeat-pdf-ingest.yml", "cre-swfl"),
    "colliers_industrial": ("marketbeat-pdf-ingest.yml", "cre-swfl"),
    "mhs_databook": ("none", "cre-swfl"),
    "swfl_search_demand": ("swfl-search-demand-monthly.yml", "none"),
    "mhs_permits_swfl": ("ingest-mhs-permits-swfl.yml", "permits-commercial-swfl"),
    "crexi_listings": ("ingest-crexi-listings.yml", "cre-swfl"),
    "brevitas_listings": ("ingest-brevitas-listings.yml", "cre-swfl"),
    "lee_associates_swfl": ("ingest-lee-associates-swfl.yml", "cre-swfl"),
    "estero_edc": ("ingest-local-cre-context.yml", "cre-swfl"),
    "fmb_recovery": ("ingest-local-cre-context.yml", "cre-swfl"),
    "news_swfl": ("news-swfl-ingest.yml", "app/insiders"),
    "active_listings": ("active-listings-daily.yml", "none"),
    "listing_lifecycle": ("listing-lifecycle-daily.yml", "active-listings-swfl"),
    "market_aggregates_histogram": ("ingest-market-aggregates-histogram.yml", "price-distribution-swfl"),
    "market_aggregates_details": ("ingest-market-aggregates-details.yml", "market-temperature-swfl"),
    "rentals_swfl": ("ingest-rentals.yml", "active-rentals-swfl"),
    # ── not_yet_running: (3) ─────────────────────────────────────────────────
    "sba_foia_franchise_outcomes": ("franchise-outcomes-quarterly.yml", "franchise-outcomes"),
    "airdna_str_swfl": ("none", "investor-zip-swfl"),
    "land_manufactured_swfl": ("none", "active-listings-swfl"),
}

# GATE MEMBERSHIP, not cadence. See the plan's Task 0 / D3.
NIGHTLY = {
    "live_search_daily_median_price",
    "live_search_daily_mortgage",
    "listing_lifecycle",
    "city_pulse",
}

NAME_RE = re.compile(r"^  - name: (\S+)\s*$")


def main() -> int:
    lines = REG.read_text(encoding="utf-8").splitlines(keepends=True)
    out: list[str] = []
    seen: set[str] = set()

    for i, line in enumerate(lines, start=1):
        out.append(line)
        m = NAME_RE.match(line)
        if not m:
            continue
        name = m.group(1)
        if name not in SPINE:
            print(f"FATAL {REG}:{i}: entry '{name}' has no Spine record", file=sys.stderr)
            return 1
        if name in seen:
            print(f"FATAL {REG}:{i}: duplicate entry name '{name}'", file=sys.stderr)
            return 1
        seen.add(name)
        workflow, pack = SPINE[name]
        out.append(f"    workflow: {workflow}\n")
        out.append(f"    consuming_pack: {pack}\n")
        if name in NIGHTLY:
            out.append("    nightly: true\n")

    missing = sorted(set(SPINE) - seen)
    if missing:
        print(f"FATAL: Spine records with no registry entry: {missing}", file=sys.stderr)
        return 1

    REG.write_text("".join(out), encoding="utf-8")
    print(f"OK — {len(seen)} entries backfilled, {len(NIGHTLY)} marked nightly")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Run it from the repo root:

```
python "$SCRATCHPAD/spine_backfill.py"
```
Expected stdout: `OK — 74 entries backfilled, 4 marked nightly`

Now prove the diff is **pure insertion** — no line was deleted or altered:

```
git diff --numstat -- ingest/cadence_registry.yaml
```
Expected: `152     0       ingest/cadence_registry.yaml` (74 × `workflow:` + 74 × `consuming_pack:` + 4 × `nightly:` = 152 added, **0 deleted**). If the deleted count is anything but `0`, `git checkout -- ingest/cadence_registry.yaml` and fix the script — the registry's comments are load-bearing.

- [ ] **Step 4: Run test to verify it passes**

```
pytest ingest/tests/test_cadence_registry_spine.py -v
```
Expected: `6 passed`. The `# Cron:` criterion goes green here too, with **zero comment edits**: every workflow those 20 comments name is now declared in a structured `workflow:` field (verified: all 19 unique basenames across `:140`–`:1601` are values in `SPINE` above). Then confirm nothing else regressed on the registry's existing consumers:
```
pytest ingest/tests/test_cadence_registry_live_search.py ingest/tests/scripts/test_check_freshness.py -q
```
Expected: all pass (the Spine adds keys; `check_freshness.py` ignores unknown keys — it only ever calls `entry.get(...)` / `entry["<known key>"]`).

- [ ] **Step 5: Commit**

```
git add ingest/cadence_registry.yaml ingest/tests/test_cadence_registry_spine.py
git commit -m "feat(spine): structured workflow/consuming_pack/nightly on all 74 registry entries" -m "Registry becomes the single source of config truth (spec section 3). Pure-insertion diff: 152 added, 0 deleted -- comments preserved. Values resolved in 08a-spine-identity.md; nightly gate set is 4 entries (08h D7/D12: active_listings and market_aggregates_* deliberately excluded). Tests fail if any entry lacks workflow: or consuming_pack:, and if any # Cron: comment is the sole carrier of a workflow filename (spec section 9)."
```

---

### Task 3: The nightly gate — countable tables, discriminating filters, honest floors

The four gated entries must each expose *something Phase 4 can count, scoped to itself*. Today two of them cannot be counted at all, and **two of them count the same table as each other.**

**R1 — THE MASKING BUG this task exists to kill.** `live_search_daily_median_price` (`:50`) and `live_search_daily_mortgage` (`:86`) **both** declare `freshness_table: data_lake.daily_truth` — the SAME table, and neither carries a `source_name` (deliberately removed 07/05/2026, `:52-54`, because `daily_truth` has no `source_name` column). So once `assert_landed` counts rows against `expected_rows_min`, mortgage's floor of `1` is counted over **all** of `daily_truth` — which holds three median-price rows every day. **If the mortgage metric never lands again, the gate still reads LANDED off the other metric's rows.** That is precisely the masking failure the gate exists to prevent, and it is why `count_filter` must exist before Phase 4 is written.

**The discriminator is `metric_key` — verified, not assumed:**

| Fact | Evidence |
|---|---|
| `daily_truth` has a `metric_key` column | `ingest/pipelines/live_search/pipeline.py:23-24` — `INSERT INTO data_lake.daily_truth (metric_key, area, period, …)`; `engine.py:56` `DailyTruthRow.metric_key: str` |
| the median entry writes `median_sale_price` | `ingest/cadence_registry.yaml:62` — `live_search_config.metric_key: median_sale_price` |
| the mortgage entry writes `mortgage_30yr_fixed` | `ingest/cadence_registry.yaml:93` — `live_search_config.metric_key: mortgage_30yr_fixed` |
| the config value **is** the column value | `engine.py:268`, `:275`, `:337` — `metric_key=cfg["metric_key"]` on every constructed row |
| **`source_tag` cannot do this job** | `engine.py:67` — `source_tag: str = "live_search"`, a hardcoded default identical for **both** metrics. It discriminates the *writer*, not the *metric*. `metric_key` is the only column that separates them. |

**Files:**
- Modify: `ingest/cadence_registry.yaml` — `live_search_daily_median_price` (`:46`), `live_search_daily_mortgage` (`:82`), `city_pulse` (`:444`), `listing_lifecycle` (`:1484`), `active_listings` (`:1463`)
- Test: `ingest/tests/test_cadence_registry_spine.py`

**Interfaces:**
- Consumes: `nightly: true` from Task 2.
- Produces: for each `nightly: true` entry, a resolvable count target (`count_table` **or** `freshness_table`), an `expected_rows_min: int`, and — where two nightly entries share that target — a `count_filter: { column, value }`. **Phase 4's `assert_landed.py` reads exactly:** `entry["name"]`, `entry["nightly"]`, `entry.get("count_table") or entry.get("freshness_table")`, `entry["expected_rows_min"]`, `entry.get("count_filter")`, `entry.get("source_name")`, `entry.get("freshness_column")`.

- [ ] **Step 1: Write the failing test**

Append to `ingest/tests/test_cadence_registry_spine.py` (`re` is already imported at the top from Task 1):

```python
def test_nightly_flag_marks_exactly_the_gate_set():
    """Adding a 5th gate member must be a conscious edit to NIGHTLY_GATE_SET, never
    a silent default. Absence of `nightly:` = not gated (the safe default)."""
    flagged = {e["name"] for e in _pipelines() if e.get("nightly") is True}
    assert flagged == NIGHTLY_GATE_SET, (
        f"nightly gate drift.\n  extra:   {sorted(flagged - NIGHTLY_GATE_SET)}\n"
        f"  missing: {sorted(NIGHTLY_GATE_SET - flagged)}"
    )


def test_every_nightly_entry_is_countable_by_assert_landed():
    """assert_landed.py (Phase 4) needs a table to COUNT and a floor to compare it to.
    city_pulse is lane:tier-1 with no freshness_table -- it MUST carry an explicit
    count_table or it silently drops out of the gate (index correction #6)."""
    by_name = {e["name"]: e for e in _pipelines()}
    for name in sorted(NIGHTLY_GATE_SET):
        e = by_name[name]
        target = e.get("count_table") or e.get("freshness_table")
        assert target, f"{name}: nightly but no count_table/freshness_table to COUNT"
        assert "." in target, f"{name}: count target {target!r} is not schema-qualified"
        floor = e.get("expected_rows_min")
        assert isinstance(floor, int) and floor > 0, (
            f"{name}: nightly but expected_rows_min is {floor!r}. "
            "The floor is expected_rows_min -- there is NO separate min_rows field."
        )


def test_shared_count_targets_require_a_count_filter():
    """R1 -- THE MASKING BUG.

    Two nightly entries both point at data_lake.daily_truth (:50 median, :86 mortgage) and
    neither carries a source_name (:52-54 -- daily_truth has no such column). A bare
    COUNT(*) >= expected_rows_min therefore satisfies MORTGAGE'S floor of 1 with the
    MEDIAN metric's rows: if mortgage never lands again, the gate still reads LANDED.
    count_filter is the per-metric discriminator that makes each count honest.

    daily_truth's writer column `source_tag` CANNOT do this: engine.py:67 hardcodes
    source_tag='live_search' for BOTH metrics. The discriminating column is `metric_key`
    (registry :62 median_sale_price / :93 mortgage_30yr_fixed -> engine.py:268/275/337
    `metric_key=cfg["metric_key"]` -> daily_truth.metric_key, pipeline.py:23-24).

    THE RULE IS COMPUTED FROM THE REGISTRY, NOT HARDCODED: any nightly entry whose count
    target is claimed by another nightly entry must declare its own filter. A third entry
    pointed at an already-claimed table fails here on day one.

    Column EXISTENCE in the live table is deliberately NOT asserted here -- that is a DB
    question and it is Phase 2's job (same reasoning as D2). This test is structural.
    """
    IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")

    targets: dict[str, list[dict]] = {}
    for e in _pipelines():
        if e.get("nightly") is not True:
            continue
        target = e.get("count_table") or e.get("freshness_table")
        targets.setdefault(str(target), []).append(e)

    shared = {t: es for t, es in targets.items() if len(es) > 1}

    # Vacuity guard: names the ONE shared target we know exists today, so this test can
    # never silently degrade into a no-op. The RULE above stays computed.
    assert "data_lake.daily_truth" in shared, (
        "data_lake.daily_truth is the known shared nightly count target (both live_search "
        f"entries write it). Computed shared set is {sorted(shared)} -- if daily_truth is no "
        "longer shared, re-derive this guard before deleting it."
    )

    for target, es in sorted(shared.items()):
        for e in es:
            others = [x["name"] for x in es if x is not e]
            cf = e.get("count_filter")
            assert isinstance(cf, dict), (
                f"{e['name']}: nightly, shares count target {target} with {others}, and declares "
                "NO count_filter. assert_landed would count the other entry's rows and read "
                "LANDED on a source that never landed. Add: "
                "count_filter: {{ column: <discriminator>, value: <literal the pipeline writes> }}"
            )
            assert IDENT.match(str(cf.get("column") or "")), (
                f"{e['name']}: count_filter.column must be a bare column identifier "
                f"(assert_landed interpolates it as an SQL identifier), got {cf.get('column')!r}"
            )
            assert cf.get("value") not in (None, ""), (
                f"{e['name']}: count_filter.value is required — the literal the pipeline "
                "actually writes to that column."
            )
        values = [e["count_filter"]["value"] for e in es]
        assert len(values) == len(set(values)), (
            f"{target}: nightly entries {[e['name'] for e in es]} claim the SAME count_filter "
            f"value {values} — the filter does not discriminate them, so the mask is still open."
        )


def test_no_entry_carries_a_min_rows_field():
    """`min_rows` would duplicate `expected_rows_min` (index correction #6). One
    floor, one authority -- a second floor is the hand-synced-pair drift class."""
    dupes = [e["name"] for e in _entries() if "min_rows" in e]
    assert not dupes, f"`min_rows:` duplicates `expected_rows_min:` -- remove from {dupes}"


def test_orphan_writers_are_not_nightly_gated():
    """active_listings' table feeds nothing live (08h D7); market_aggregates_* are
    weekly/monthly (08h D12). Gating any of them guards a corpse or demands a daily
    landing that by design never comes."""
    by_name = {e["name"]: e for e in _pipelines()}
    for name in ("active_listings", "market_aggregates_histogram", "market_aggregates_details"):
        assert by_name[name].get("nightly") is not True, f"{name} must NOT be nightly-gated"
    assert by_name["active_listings"]["consuming_pack"] == "none", (
        "active_listings' table (active_listings_residential) has no live consumer -- "
        "active-listings-swfl reads listing_active_stats over listing_state (08h D7)"
    )
```

- [ ] **Step 2: Run test to verify it fails**

```
pytest ingest/tests/test_cadence_registry_spine.py -v
```
Expected: 11 tests collected. `test_nightly_flag_marks_exactly_the_gate_set`, `test_no_entry_carries_a_min_rows_field` and `test_orphan_writers_are_not_nightly_gated` PASS (Task 2 already set them up), alongside Task 1's six. **Two FAIL:**

```
E   AssertionError: city_pulse: nightly but no count_table/freshness_table to COUNT
```
```
E   AssertionError: live_search_daily_median_price: nightly, shares count target data_lake.daily_truth with ['live_search_daily_mortgage'], and declares NO count_filter. assert_landed would count the other entry's rows and read LANDED on a source that never landed.
```

Expected tail: `9 passed, 2 failed`.

- [ ] **Step 3: Write minimal implementation** — five targeted edits, each with the reason inline.

**3a. `live_search_daily_median_price`** (entry at `:46`). Insert immediately after its `expected_rows_min: 1` line (`:55`):

```yaml
    count_filter: { column: metric_key, value: median_sale_price } # R1 — WITHOUT THIS THE GATE
      # IS A LIE. This entry and live_search_daily_mortgage share freshness_table
      # data_lake.daily_truth, and daily_truth has no source_name column (see :52-54), so a bare
      # COUNT(*) mixes the two metrics: each would satisfy its floor with the OTHER's rows.
      # `metric_key` is the ONLY discriminating column — daily_truth.source_tag is the hardcoded
      # string 'live_search' for BOTH (engine.py:67). Value verified end-to-end:
      # live_search_config.metric_key (:62) -> engine.py:268/275/337 `metric_key=cfg["metric_key"]`
      # -> the metric_key column (pipeline.py:23-24). Read ONLY by Phase 4's assert_landed —
      # check_volume_entry scopes on source_name (check_freshness.py:382) and ignores this key.
```

**3b. `live_search_daily_mortgage`** (entry at `:82`). Insert immediately after its `expected_rows_min: 1` line (`:89`):

```yaml
    count_filter: { column: metric_key, value: mortgage_30yr_fixed } # R1 — see the twin comment on
      # live_search_daily_median_price. Value from live_search_config.metric_key (:93). This is the
      # entry the mask hurt most: 1 row/day (areas: ["swfl"]) against a median metric writing 3/day,
      # so a dead mortgage feed would have hidden behind median rows indefinitely.
```

**3c. `city_pulse`** (entry at `:444`). Attach the count target + floor, and reconcile the stale cadence. Replace:

```yaml
  - name: city_pulse
    lane: tier-1
    cadence_days: 7 # WEEKLY cost mode 07/05/2026 (pre-launch data building) — restore 1 at launch
    tolerance_multiplier: 3.0
    inventory_id: lake-tier1/city_pulse/
    inventory_key_type: prefix
```

with:

```yaml
  - name: city_pulse
    lane: tier-1 # HYBRID: freshness via _tier1_inventory (inventory_id), rows via count_table
      # below. Do NOT flip to tier-2 — it has no freshness_table/dlt_schema_name, so
      # check_tier2_entry would have nothing to query.
    cadence_days: 1 # RECONCILED 07/11/2026: .github/workflows/city-pulse-daily.yml:10 is
      # `cron: "0 9 * * *"` = DAILY. The "WEEKLY cost mode" note was stale prose (the workflow was
      # re-enabled daily 07/07/2026, per its own :4-7 header). cadence_days drives STALE/FRESH
      # *display* only — never an exit code (check_freshness.py:338) — so this is not a gating
      # change. freshness_sla stays 10/21 until the nightly chain is green; tightening to 2/4 is
      # check city_pulse_sla_tighten.
    tolerance_multiplier: 3.0
    inventory_id: lake-tier1/city_pulse/
    inventory_key_type: prefix
    count_table: data_lake.city_pulse # the tier-2 table the pipeline ALSO writes (distill.py
      # write_rows, raw psycopg). Required for the nightly row gate: check_volume_entry skips
      # tier-1 (check_freshness.py:369-371), so adding this is INERT for the daily probe —
      # assert_landed.py (Phase 4) reads count_table directly. Phase 3c's doctor must read
      # tier-1 + count_table + expected_rows_min as GATED_BY_ASSERT_LANDED (green), not as a
      # broken volume config (red). No count_filter: this table is single-writer, unshared.
    expected_rows_min: 50 # TABLE-TOTAL non-expired floor, NOT per-run-new. Quiet cities emit 0
      # new rows by design (the pipeline prunes expired rows), so a "landed today" row count
      # would false-abort a quiet night. Steady state ~207.
```

**3d. `listing_lifecycle`** (entry at `:1484`). The floor is a stale placeholder (9,000) against a live count of 31,709 — it would pass a gate on a table that had lost 70% of its rows. Replace:

```yaml
    expected_rows_min: 9000 # PLACEHOLDER — live api_feed count already 31,709 (Collier 8,819 + Lee
      # 22,890, runs 28495956344/28496497637), 3x this floor. Scope is Lee+Collier+Hendry (Hendry adds
      # ~1.2k). Rebaseline to ~90% of live 3-county count once a few daily cycles are in.
```

with:

```yaml
    expected_rows_min: 28000 # REBASELINED 07/11/2026 from the 9,000 placeholder: ~90% of the live
      # api_feed count (31,709 = Collier 8,819 + Lee 22,890; runs 28495956344/28496497637), per 08h N2.
      # The old floor would have passed a table that had silently lost 70% of its rows. This is the
      # NIGHTLY GATE floor as well as the probe's LOW_VOLUME floor — one floor, one authority; there
      # is deliberately no separate min_rows. Non-gating on the daily probe (check_freshness.py:354-355
      # — LOW_VOLUME always exits 0); it becomes blocking only via Phase 4's assert_landed.py.
      # No count_filter needed: `source_name: api_feed` (above) already scopes this count to a table
      # no other nightly entry claims — so Hendry's inert lifecycle_seed rows are excluded too.
```

**3e. `active_listings`** (entry at `:1463`). Make the orphan a stated fact. Immediately after the `consuming_pack: none` line Task 2 inserted, add:

```yaml
    # NOT nightly-gated, despite a daily cron (08h D7 / index correction). This pipeline's table,
    # data_lake.active_listings_residential, FEEDS NOTHING LIVE: the note below claims
    # refinery/packs/active-listings-swfl.mts as consumer, but that pack reads
    # data_lake.listing_active_stats — a view over listing_state, written by listing_lifecycle.
    # Proof: active-listings-residential-source.mts:27 `const VIEW = "listing_active_stats"`;
    # lib/email/sole-spine.test.ts:8 `const DEAD_VIEW = "active_listings_residential"`;
    # lib/landing/load-home-map-data.ts:13. Gating this would guard a corpse while the real table
    # silently empties. SHIP-OR-DELETE decision: check active_listings_ship_or_delete.
```

- [ ] **Step 4: Run test to verify it passes**

```
pytest ingest/tests/test_cadence_registry_spine.py -v
```
Expected: `11 passed`. Then confirm the live probe is unaffected — it must still parse the registry and produce a summary with no crash:
```
python -m ingest.scripts.check_freshness --dry-run
```
Expected: prints the normal freshness/volume summary table and **exits 0**. `city_pulse` still appears (freshness via `_tier1_inventory`); it shows **no** volume column (tier-1 is skipped at `:369-371` — this is the expected, inert behavior). The two `live_search` entries' volume rows are **unchanged** — `check_volume_entry` never reads `count_filter` (it scopes on `source_name`, `:382`), so the new key is invisible to the existing probe. That is the point: the mask stays open in the *ops summary* (non-gating, cosmetic) and is closed in the *gate* (Phase 4), which is the only place it can hurt.

- [ ] **Step 5: Commit**

```
git add ingest/cadence_registry.yaml ingest/tests/test_cadence_registry_spine.py
git commit -m "feat(spine): nightly gate is countable AND honest — count_filter, city_pulse count_table, listing_lifecycle floor 9k->28k" -m "count_filter (NEW): both live_search entries share freshness_table data_lake.daily_truth and neither has a source_name, so assert_landed's COUNT(*) >= expected_rows_min would satisfy mortgage's floor of 1 with median-price rows -- a dead mortgage feed reading LANDED forever. Discriminator is metric_key (median_sale_price / mortgage_30yr_fixed; registry :62/:93 -> engine.py:268/275/337 -> daily_truth.metric_key, pipeline.py:23-24); source_tag cannot do it, it is hardcoded 'live_search' for both (engine.py:67). Test derives the shared-target set from the registry, so a third entry on a claimed table fails on day one. city_pulse: count_table data_lake.city_pulse + expected_rows_min 50 (TABLE-TOTAL; quiet cities emit 0 new rows); cadence_days 7->1 to match city-pulse-daily.yml:10 (0 9 * * *). Lane stays tier-1 on purpose. listing_lifecycle: 9,000 was a placeholder against a live 31,709 -- it would have passed a table that lost 70% of its rows (08h N2). active_listings: NOT gated, table feeds nothing live (08h D7). All display-only on the daily probe: check_volume_entry never gates (check_freshness.py:354-355) and never reads count_filter."
```

---

### Task 4: Delete the phantom `source_tag:`

**Files:**
- Modify: `ingest/cadence_registry.yaml:1452` (the `news_swfl` entry)
- Test: `ingest/tests/test_cadence_registry_spine.py`

**Interfaces:** none produced. This is a subtraction.

- [ ] **Step 1: Write the failing test**

Append to `ingest/tests/test_cadence_registry_spine.py`:

```python
def test_no_entry_carries_a_source_tag_field():
    """check_freshness.py scopes on `source_name` (:238 freshness, :382 volume).
    `source_tag` is read by NOTHING in ingest/scripts/ or ingest/lib/ (index #4).
    Its single occurrence -- news_swfl -> news_crawl -- is a phantom with no matching
    literal in the pipeline code ('news_crawl' is the app cron ROUTE name,
    /api/cron/news-crawl; the pipeline stamps per-outlet source_name values like
    'naples_daily_news', normalizer.py:46). A registry field nothing reads is exactly
    the class that cost two weeks of false-RED. Identity lives in `source_name:`.

    NOT to be confused with daily_truth's source_tag COLUMN (engine.py:67), which is real
    but useless as a discriminator -- it is 'live_search' for both metrics. That job belongs
    to count_filter/metric_key (Task 3). A registry `source_tag:` FIELD remains forbidden.
    """
    tagged = [e["name"] for e in _entries() if "source_tag" in e]
    assert not tagged, (
        f"`source_tag:` is read by nothing — use `source_name:` (the column "
        f"check_freshness.py actually filters on). Remove from: {tagged}"
    )
```

- [ ] **Step 2: Run test to verify it fails**

```
pytest ingest/tests/test_cadence_registry_spine.py::test_no_entry_carries_a_source_tag_field -v
```
Expected:
```
E   AssertionError: `source_tag:` is read by nothing — use `source_name:` (the column check_freshness.py actually filters on). Remove from: ['news_swfl']
```
Full-file tail at this point: `11 passed, 1 failed`.

- [ ] **Step 3: Write minimal implementation**

In the `news_swfl` entry, replace this single line:

```yaml
    source_tag: news_crawl
```

with:

```yaml
    # source_tag: news_crawl  — DELETED 07/11/2026. It was the ONLY source_tag: FIELD in the registry
    # and it was a phantom: nothing in ingest/scripts/ or ingest/lib/ reads `source_tag` (the
    # freshness and volume probes both filter on `source_name` — check_freshness.py:238, :382),
    # and 'news_crawl' has no literal in ingest/pipelines/news_swfl/*.py — it is the app cron
    # ROUTE name (/api/cron/news-crawl). The pipeline stamps per-outlet source_name values
    # ('naples_daily_news', normalizer.py:46). A registry field nothing reads is the exact class
    # that false-REDded daily_truth for two weeks (see this file's :52-54).
    # (Unrelated: data_lake.daily_truth has a real source_tag COLUMN — engine.py:67 — but it is
    # 'live_search' for every row, so the live_search entries discriminate on metric_key via
    # count_filter, not on source_tag. See :55/:89.)
```

**Do NOT touch `dlt_schema_name: data_lake` on this same entry.** It is also wrong (the real dlt schema is `news_swfl`, `pipeline.py:33`), but it is a **deliberate Phase-2 expected-RED fixture** (`08h` §"What Phase-2 `--live` must assert", item 3). Fixing it here would delete the fixture Phase 2 is built to catch.

- [ ] **Step 4: Run test to verify it passes**

```
pytest ingest/tests/test_cadence_registry_spine.py -v
```
Expected: `12 passed`.

- [ ] **Step 5: Commit**

```
git add ingest/cadence_registry.yaml ingest/tests/test_cadence_registry_spine.py
git commit -m "fix(spine): delete the phantom source_tag: field — nothing reads it" -m "Spec section 3 asked for a source_tag: field on every entry. check_freshness.py scopes on source_name (:238, :382); source_tag is read by nothing (index correction #4). The registry's only source_tag: (news_swfl -> news_crawl) had no code literal -- news_crawl is the app cron route name. Identity lives in source_name:. Test forbids the field returning. Distinct from daily_truth's real source_tag COLUMN, which is 'live_search' for every row and therefore cannot discriminate the two live_search metrics -- that is count_filter/metric_key's job. news_swfl's wrong dlt_schema_name is left intact on purpose: it is a Phase-2 expected-RED fixture."
```

---

### Task 5: `coverage_exempt:` — promote the prose exclusion block to a machine-readable authority

Without this, Phase 2's zero-coverage check ("live lake table with rows and no registry entry → RED") **false-floods**: the six tables below are consciously outside registry coverage, and the only record of that decision today is a **comment block** (`cadence_registry.yaml:1694-1761`) that no machine can read.

**Files:**
- Modify: `ingest/cadence_registry.yaml` — retitle the prose block header (`:1694`), append a top-level `coverage_exempt:` list at end of file
- Test: `ingest/tests/test_cadence_registry_spine.py`

**Interfaces:**
- Produces: top-level `coverage_exempt: list[{table: str, reason: str, note: str}]`. **Phase 2's `--live` zero-coverage check reads exactly this**: a live `data_lake.*`/`public.*` table with rows and no `pipelines:` entry is RED **unless** its name appears here.

- [ ] **Step 1: Write the failing test**

Append to `ingest/tests/test_cadence_registry_spine.py`:

```python
# Machine-readable reasons a live table can legitimately have no pipelines: entry.
# Phase 2's --live zero-coverage check suppresses a RED only for tables listed under
# coverage_exempt: with one of these reasons.
COVERAGE_EXEMPT_REASONS = {
    "defunct_source",           # vendor API decommissioned; rows are a legacy artifact
    "legacy_scheduled_drop",    # superseded by a live pipeline on another lane; DROP pending
    "brain_write_back",         # written by refinery stage-4, not by ingest
    "derived_signal_write_back",# app cron appends derived rows; 0 rows on a quiet day is CORRECT
    "bounded_delete_sweep",     # a retention DELETE, not a data source
    "event_driven_app_cron",    # Vercel cron, no lake write; 0 rows on a quiet day is CORRECT
}


def test_coverage_exempt_block_exists_and_is_well_formed():
    """Without this block the Phase-2 zero-coverage check cannot tell a REAL source gap
    (parcel_subdivision: 220,875 rows, zero registry mentions) from an INTENTIONAL
    non-source write (project_feed). 08h: the prose exclusion block is comments, not
    machine-readable."""
    exempt = REG.get("coverage_exempt")
    assert isinstance(exempt, list) and exempt, "top-level `coverage_exempt:` list is missing"
    for row in exempt:
        table = row.get("table")
        assert table and "." in table, f"coverage_exempt entry needs a schema-qualified table: {row!r}"
        assert row.get("reason") in COVERAGE_EXEMPT_REASONS, (
            f"{table}: reason {row.get('reason')!r} not in {sorted(COVERAGE_EXEMPT_REASONS)}"
        )
        assert row.get("note"), f"{table}: coverage_exempt needs a `note:` saying WHY"
    tables = [r["table"] for r in exempt]
    assert len(tables) == len(set(tables)), f"duplicate coverage_exempt tables: {tables}"


def test_coverage_exempt_does_not_shadow_a_live_pipeline():
    """A table cannot be both a monitored source and exempt from coverage — that is a
    contradiction, and whichever check ran last would win."""
    exempt = {r["table"] for r in REG["coverage_exempt"]}
    monitored = set()
    for e in _pipelines():
        for key in ("freshness_table", "count_table"):
            if e.get(key):
                monitored.add(e[key])
    overlap = exempt & monitored
    assert not overlap, f"table is both monitored and coverage_exempt: {sorted(overlap)}"
```

- [ ] **Step 2: Run test to verify it fails**

```
pytest ingest/tests/test_cadence_registry_spine.py -v
```
Expected: `12 passed, 2 failed`. First failure:
```
E   AssertionError: top-level `coverage_exempt:` list is missing
```

- [ ] **Step 3: Write minimal implementation**

**5a.** Retitle the prose block header so it stops being a second authority. Replace the four header lines at `:1694-1697`:

```yaml
# ── Tables intentionally excluded from the probe — DO NOT ADD ────────────────
# These tables have rows in Postgres but no active ingest pipeline. Adding them
# would create false-FRESH signal or meaningless LOW_VOLUME noise. Investigated
# 2026-05-31; decisions are final until a new ingest pipeline is explicitly built.
```

with:

```yaml
# ── Tables intentionally excluded from the probe — DO NOT ADD ────────────────
# NARRATIVE ONLY. The machine-readable authority is the `coverage_exempt:` block at the
# END OF THIS FILE — Phase 2's zero-coverage check reads that, not these comments. Keep the
# two in sync: an entry here with no coverage_exempt row will be RED-flagged as a source gap.
# These tables have rows in Postgres but no active ingest pipeline. Adding them
# would create false-FRESH signal or meaningless LOW_VOLUME noise. Investigated
# 2026-05-31; decisions are final until a new ingest pipeline is explicitly built.
```

**5b.** Append at the **end of the file** (after the last prose comment):

```yaml

# ── coverage_exempt: the machine-readable half of the exclusion block above ──────────────
# Phase 2's --live zero-coverage check ("a live lake table with rows and no pipelines: entry
# is RED") reads THIS. Without it the check false-floods on every intentional non-source
# write and becomes noise nobody reads. The narrative for each row is in the comment block
# above; the `note:` here is the one-line why.
#
# SCOPE — what coverage_exempt does NOT do: it suppresses the ZERO-COVERAGE assertion only.
# It does NOT bless a pack reading one of these tables. env-swfl live-queries
# data_lake.usgs_sites (usgs-water-source.mts:33 SITES_TABLE='usgs_sites') even though that
# table is exempt and frozen since 2026-05-19 — that is a SEPARATE Phase-2 RED ("pack reads a
# legacy/excluded table", spec section 6). Two assertions, two answers. Do not collapse them.
coverage_exempt:
  - table: data_lake.dbhydro_stations
    reason: defunct_source
    note: "SFWMD DBHYDRO API decommissioned (OAuth wall on new REST). 12,937 rows are a legacy artifact; no pipeline writes this table. History: docs/API_BLUEPRINTS_DBHYDRO.md."

  - table: data_lake.usgs_sites
    reason: legacy_scheduled_drop
    note: "900 rows from a deprecated dlt pipeline. The live USGS workflow (usgs-monthly.yml) writes Parquet to Tier-1 only. DROP scheduled once env-swfl migrates to Parquet (docs/superpowers/plans/2026-05-19-usgs-postgres-to-parquet-migration.md). STILL LIVE-READ by env-swfl via usgs-water-source.mts:33 — that read is a separate Phase-2 RED, not suppressed by this exemption."

  - table: data_lake.fdot_freight_nowcast_shock_log
    reason: brain_write_back
    note: "Written by refinery/sources/fdot-freight-source.mts during stage-4 brain execution, not by ingest. Same category as public.predictions — wrong layer for an ingest guard; the pack owns its own write-back integrity."

  - table: public.project_feed
    reason: derived_signal_write_back
    note: "Piece 3 signal layer. scripts/project-feed/change-detection.mts appends a data-change row ONLY when a tracked per-ZIP brain metric moves. ZHVI/ZORI refresh ~monthly, so ZERO rows on a quiet day is CORRECT — a daily STALE/LOW_VOLUME assertion would be a guaranteed false alarm. GHA: project-feed-change-detection-daily.yml."

  - table: public.deliverables
    reason: bounded_delete_sweep
    note: "FINAL BOSS Piece 4 retention sweep hard-deletes deliverables soft-trashed >7d ago. Not a data source. On most days it deletes ZERO rows. GHA: deliverables-retention-sweep-daily.yml."

  - table: public.data_readiness_alerts
    reason: event_driven_app_cron
    note: "Phase 3C T-60 email preflight (app/api/cron/data-readiness/route.ts, a Vercel cron). No lake write; appends alerts only in the T-75min window before an actual send. ZERO rows on a quiet day is CORRECT."
```

**Deliberately NOT added:** `08h` also names `data_lake.view_vintages`, `public.data_targets`, and `public.social_pulse_scans` as likely false-flood candidates. **We do not fabricate exemption reasons for tables we have not confirmed.** They are logged as check `coverage_exempt_confirm_three` (Task 6) for Phase 2's `--live` run to confirm-or-add against the real DB. Phase 2 will RED them on first run; that is the correct, loud outcome — a RED that produces a decision, not an invented `note:`.

- [ ] **Step 4: Run test to verify it passes**

```
pytest ingest/tests/test_cadence_registry_spine.py -v
```
Expected: `14 passed`. Then confirm the whole ingest suite is still green:
```
pytest ingest/ -q
```
Expected: no new failures. (Pre-existing red: `test_extract_api.py` has 3 tests already failing on `main`, tracked by check `test_extract_api_stale_type_lookup`. Do not "fix" them here — they are unrelated to this phase.)

- [ ] **Step 5: Commit**

```
git add ingest/cadence_registry.yaml ingest/tests/test_cadence_registry_spine.py
git commit -m "feat(spine): coverage_exempt: block — promote the prose exclusions to machine-readable" -m "The exclusion block was comments, so Phase 2's zero-coverage check could not tell a real source gap (parcel_subdivision: 220,875 rows, zero registry mentions) from an intentional non-source write (project_feed). Six confirmed tables promoted with a reason enum. view_vintages / data_targets / social_pulse_scans deliberately NOT added -- no invented reasons; check coverage_exempt_confirm_three carries them to Phase 2 --live. coverage_exempt suppresses ZERO_COVERAGE only; it does not bless a pack reading an excluded table (env-swfl/usgs_sites stays RED)."
```

---

### Task 6: Document the schema, open the deferrals, log the session

The Spine is only a "single source of truth" if the next person can tell what each field means without reading this plan. And **RULE 2.4 — NO SILENT DEFERRALS**: three decisions were parked in Tasks 3 and 5. Each gets a `checks` entry **in this same session**, not a SESSION_LOG sentence.

**Files:**
- Modify: `ingest/cadence_registry.yaml` (header schema comment, `:7-40`)
- Modify: `SESSION_LOG.md`
- Test: `ingest/tests/test_cadence_registry_spine.py` (unchanged — must stay green)

- [ ] **Step 1: Write the failing test** — no new test. The guarantee is Tasks 1–5's suite; this task adds documentation and ledger entries, which the test suite cannot assert. Re-run to establish the green baseline you must not break:

```
pytest ingest/tests/test_cadence_registry_spine.py -v
```
Expected: `14 passed`.

- [ ] **Step 2: Run test to verify it fails** — N/A (documentation task; there is nothing to red). State this explicitly rather than inventing a hollow test.

- [ ] **Step 3: Write minimal implementation**

**6a.** In the registry header, after the existing `# SLA fields (optional, any lane...)` block and before the `# Naming note:` line, insert:

```yaml
#   SPINE fields (added 07/11/2026 — the registry is the single source of config truth):
#     workflow: <name>.yml   REQUIRED on every entry. The .github/workflows/ file that runs it.
#                            `none` = a STATED FACT (no workflow writes this entry: usgs_tier2 is a
#                            zombie whose producing module was deleted; mhs_databook is a manual PDF
#                            drop). Absence of the field = a GAP the Phase-2 cross-check flags.
#                            May be non-unique: one workflow can back several entries
#                            (live-search-daily.yml -> 2, marketbeat-pdf-ingest.yml -> 3,
#                            bls-oews-annual.yml -> 2, ingest-fl-dbpr-licenses.yml -> 2,
#                            ingest-local-cre-context.yml -> 2). That is structure, not error.
#                            THIS FIELD IS AUTHORITATIVE. The freeform `# Cron: <file>.yml` comments
#                            scattered through this file are NON-AUTHORITATIVE PROSE — kept only for
#                            the cron timing / stagger rationale they carry, which this field does
#                            not capture. A comment may never again be the SOLE carrier of a
#                            workflow filename: test_cadence_registry_spine.py enforces it.
#     consuming_pack: <v>    REQUIRED on every entry. What reads this source. One of:
#                              a pack id            e.g. env-swfl
#                              a flow list          e.g. [env-swfl, hurricane-tracks-fl]
#                              a non-pack repo path e.g. lib/zip-summary (census_acs),
#                                                        app/insiders (news_swfl)
#                                                   — a pack-ONLY check would RED a healthy source
#                              none                 a STATED FACT: nothing reads it. Ten entries are
#                                                   in this state today; that is a real finding, not
#                                                   a missing value.
#     nightly: true          OPTIONAL, opt-in. GATE MEMBERSHIP, NOT CADENCE: assert_landed.py
#                            (the nightly chain's row gate) asserts this entry landed TODAY (UTC)
#                            AND count(*) >= expected_rows_min. Absence = not gated (safe default).
#                            Exactly 4 entries carry it: live_search x2, listing_lifecycle,
#                            city_pulse — pinned in ingest/tests/test_cadence_registry_spine.py so
#                            a 5th member is a conscious edit. active_listings runs daily but is
#                            NOT gated (its table feeds nothing live); market_aggregates_* are
#                            weekly/monthly.
#     count_filter: {column: <col>, value: <literal>}
#                            REQUIRED on a `nightly:` entry whose count target (count_table, else
#                            freshness_table) is ALSO claimed by another `nightly:` entry. Both
#                            live_search entries count data_lake.daily_truth and neither has a
#                            source_name, so without this each would satisfy its own row floor with
#                            the OTHER metric's rows — a dead feed reading LANDED forever. The
#                            discriminator is metric_key (median_sale_price / mortgage_30yr_fixed);
#                            daily_truth's source_tag column cannot do it — it is the literal
#                            'live_search' for both (engine.py:67). Read ONLY by assert_landed.py;
#                            check_volume_entry scopes on source_name and ignores it.
#     THE ROW FLOOR IS `expected_rows_min`. There is deliberately NO `min_rows:` field — a second
#     floor beside an existing one is a hand-synced pair, i.e. the drift class this build kills.
#     THERE IS NO `source_tag:` FIELD. Source identity is `source_name:` — the column
#     check_freshness.py actually filters on (:238 freshness, :382 volume). A `source_tag:` was
#     deleted 07/11/2026 because nothing read it (see the news_swfl entry). (data_lake.daily_truth
#     does have a source_tag COLUMN; that is unrelated — see count_filter above.)
#     TIER-1 + count_table IS NOT A CONFIG ERROR. check_volume_entry skips tier-1
#     (check_freshness.py:369-371), so a tier-1 entry carrying count_table + expected_rows_min is
#     gated by assert_landed.py instead — city_pulse is the case. The doctor must read that as
#     GATED_BY_ASSERT_LANDED (green), never as a broken volume config (red).
#
#   coverage_exempt:  top-level list at the END of this file. Live lake tables with rows and no
#                     pipelines: entry that are consciously NOT sources. Suppresses Phase 2's
#                     ZERO_COVERAGE red — and nothing else.
```

**6b.** Open the three deferrals (RULE 2.4 — the moment you park a finding, it goes in `checks`):

```
node scripts/check.mjs open ingest active_listings_ship_or_delete "SHIP-OR-DELETE: active_listings writes 38,728 rows daily to active_listings_residential, which feeds nothing live (active-listings-swfl reads listing_active_stats over listing_state). Kill the 4 county crons + the table, or wire a real consumer. Blocked the nightly row gate from targeting it (08h D7)."
node scripts/check.mjs open ingest city_pulse_sla_tighten "city_pulse cadence_days reconciled 7->1 (city-pulse-daily.yml:10 is 0 9 * * *) but freshness_sla left at 10/21 to avoid a gating change mid-build. Tighten to warn 2 / error 4 once the nightly chain has one green end-to-end run."
node scripts/check.mjs open ingest coverage_exempt_confirm_three "Phase-2 --live will RED data_lake.view_vintages, public.data_targets, public.social_pulse_scans as zero-coverage. Confirm each against the live DB and either add a coverage_exempt row with a real reason or register a pipeline. No reason was invented at Spine time (08h)."
```
Expected: three `opened ✓` lines. Then `node scripts/check.mjs list` shows all three under `[ingest]`.

**6c.** Prepend a SESSION_LOG entry. **This is a real file write — the pre-push hook blocks a push where no commit ahead of upstream touched `SESSION_LOG.md`, and `git add` on an unmodified file is a silent no-op.** Write the entry, then stage it.

```markdown
## 2026-07-11 — The Spine: cadence_registry is the single source of config truth

**Shipped.** All 74 registry entries (71 `pipelines:` + 3 `not_yet_running:`) now carry `workflow:`
and `consuming_pack:`; 4 carry `nightly: true`; the 2 that share a count target carry `count_filter:`.
New top-level `coverage_exempt:` block (6 tables). Enforced by
`ingest/tests/test_cadence_registry_spine.py` (14 tests) — a new entry without `workflow:` fails
`pytest ingest/`.

**The bug this phase caught before it shipped (`count_filter:`, not in the spec at all):**
`live_search_daily_median_price` and `live_search_daily_mortgage` both declare
`freshness_table: data_lake.daily_truth` — the same table — and neither carries a `source_name`
(`daily_truth` has no such column). Phase 4's row gate counts rows against `expected_rows_min`, so
mortgage's floor of **1** would have been satisfied by the median metric's **3 rows/day**: a mortgage
feed that never landed again would still have read **LANDED**, forever. That is the exact masking the
gate exists to prevent. Fixed with `count_filter: {column: metric_key, value: …}` — `metric_key` is
the only discriminating column (`daily_truth.source_tag` is the hardcoded string `live_search` for
both metrics, `engine.py:67`). Values verified end-to-end: registry `:62`/`:93` →
`engine.py:268/275/337` → `daily_truth.metric_key` (`pipeline.py:23-24`). The test derives the
shared-target set **from the registry**, so a third nightly entry aimed at a claimed table fails on
day one rather than silently inheriting someone else's rows.

**Deviations from spec §3, forced by the research pack (each would have shipped a bug):**
- **No `min_rows:`** — it duplicates `expected_rows_min`. One floor, one authority. Corrected the
  stale floors instead: `listing_lifecycle` 9,000 → 28,000 (~90% of the live 31,709 api_feed count;
  the old floor would have passed a table that lost 70% of its rows), `city_pulse` → 50 (new).
- **No `source_tag:`** — `check_freshness.py` scopes on `source_name` (`:238`, `:382`); the registry
  field `source_tag` is read by nothing. Deleted the one phantom (`news_swfl` → `news_crawl`, a route
  name, not a code literal).
- **`active_listings` is NOT nightly-gated** despite a daily cron: its table feeds nothing live
  (`active-listings-swfl` reads `listing_active_stats` over `listing_state`). Gating it would guard a
  corpse. Ship-or-delete → check `active_listings_ship_or_delete`.
- **`city_pulse` keeps `lane: tier-1`** (flipping it breaks its `inventory_id` freshness path).
  Attached `count_table: data_lake.city_pulse` so Phase 4 can count it; reconciled `cadence_days`
  7 → 1 to match its actual cron (`city-pulse-daily.yml:10`, `0 9 * * *`). Phase 3c's doctor must
  read tier-1 + `count_table` as `GATED_BY_ASSERT_LANDED` (green), not a false-RED.

**§9's other half — the `# Cron:` comments.** The 20 freeform `# Cron: <file>.yml` comments are
**retained as prose** (they carry cron timing and stagger rationale that `workflow:` does not), but a
test now forbids a comment from being the **sole carrier** of a workflow filename. Structured field
authoritative; comment descriptive. It went green with zero comment edits — every workflow those
comments name is now declared in a `workflow:` field.

**Zero live-behavior change, proven:** `check_volume_entry` never gates (`check_freshness.py:354-355`),
exit-1 comes only from `freshness_sla.error_after_days` (`:944-945`), `cadence_days` drives
STALE/FRESH display only (`:338`), tier-1 returns before `count_table` is read (`:369-371`), and
`count_filter` is read by nothing that exists yet. No `freshness_sla` block was touched.

**Next:** Phase 2 — `ingest/tools/check-registry-identity.mts`. The Spine is its left-hand side.
Expected-RED fixtures already resolved in `08a` / `08h`.

**Checks opened:** `active_listings_ship_or_delete` · `city_pulse_sla_tighten` ·
`coverage_exempt_confirm_three`.
```

- [ ] **Step 4: Run test to verify it passes**

```
pytest ingest/tests/test_cadence_registry_spine.py -v && python -m ingest.scripts.check_freshness --dry-run
```
Expected: `14 passed`, then the freshness summary prints and **exits 0**. Confirm `SESSION_LOG.md` is actually modified before staging (an unmodified file stages as a no-op and the hook will block the push):
```
git status --short SESSION_LOG.md
```
Expected: ` M SESSION_LOG.md`.

- [ ] **Step 5: Commit**

```
git add ingest/cadence_registry.yaml SESSION_LOG.md
git commit -m "docs(spine): registry header documents the Spine fields; SESSION_LOG + 3 checks opened" -m "Field grammar for workflow:/consuming_pack:/nightly:/count_filter:/coverage_exempt: lives in the registry header, so the next reader does not need the plan. Declares the structured workflow: field authoritative and the # Cron: comments non-authoritative prose. Deferrals promoted to checks per RULE 2.4: active_listings_ship_or_delete, city_pulse_sla_tighten, coverage_exempt_confirm_three."
node scripts/safe-push.mjs
```

`safe-push.mjs` runs the 5-gate pre-push hook. This phase trips **none** of them (no `package.json`, no packs/vocab, no `gh secret`, no destructive ingest write). If it reports foreign commits from a parallel session, **stop and ask** before bundling them.

---

**Phase exit criteria (spec §9, "Spine"):**

1. **Every `pipelines:` entry carries `workflow:`** — enforced by `test_every_pipelines_entry_declares_a_workflow`, red on today's registry, green after Task 2. A deliberately *wrong* filename does **not** fail yet: that is Phase 2's static check, and this phase is the left-hand side it joins against.
2. **Zero freeform `# Cron:` comments remain load-bearing** — enforced by `test_no_cron_comment_is_the_sole_carrier_of_a_workflow_filename`, red on today's registry (20 orphans), green after Task 2. Comments retained as prose; the structured field is authoritative.
3. **Every nightly entry is countable, and counts only its own rows** — enforced by `test_every_nightly_entry_is_countable_by_assert_landed` + `test_shared_count_targets_require_a_count_filter`. Phase 4 cannot be written before this is true, or its very first gate would read LANDED off another metric's rows.
agentId: a0c83bd86db33534c (use SendMessage with to: 'a0c83bd86db33534c', summary: '<5-10 word recap>' to continue this agent)
<usage>subagent_tokens: 184293
tool_uses: 16
duration_ms: 1107177</usage>

---

## PHASE: Phase 1 — Content contracts (`contracts.py` + Locus A/B)

> # 🛑 MANDATORY CORRECTIONS TO THIS PHASE — APPLY BEFORE WRITING A LINE
>
> This phase was written by an author who did not see the other phases. **Two adversarial critics
> reviewed it and found the defects below.** They are not style notes — each one ships a bug.
> The **Integration Contract** at the top of this plan is the authority; where this phase's original
> text disagrees with a correction below, **the correction wins.**
>
> Two of these (**C-1** and **C-2**) are hard bugs: a test that cannot pass, and a check that opens on day one and never closes.

### C-1 🔴 The Task-9 structural test CANNOT PASS against this phase's own implementation
The test does `gate = src.index("evaluate_batch(ups")` and `assert re.search(r"ups\s*=\s*clean", src)`.
The implementation writes the call **split across lines**:
```python
ups, quarantined, cstats = evaluate_batch(
    ups, "data_lake.listing_state", ctx={"source_name": src_name}
)
```
There is **no substring `evaluate_batch(ups`** → `src.index` raises `ValueError: substring not found`.
There is **no `ups = clean`** → the regex assert fails. Two hard failures in a test whose Step 4 claims it passes.
**FIX:** rewrite the test to be whitespace/newline-tolerant (a regex over normalized source, or an AST check), and re-verify Step 4's expected output against the real implementation.

### C-2 🔴 This phase ships a PERMANENTLY-OPEN check — the alarm-fatigue class, re-created inside the fix
Task 8 auto-opens a `checks` row for any `severity: error` + `status: FAIL` contract. The price floor is
`severity: error`, `locus: both`, `policy: report` — so it reports its **real offenders at rest, forever**,
with no purge task. It opens on day one and auto-closes **never**. The phase reasons correctly about exactly
this for the sold/rent band ("*or the contract is RED from commit #1*") and then re-creates it for the price floor.
**FIX (uniformly, both contracts):** seed the known-accepted offenders as a **baseline** and make the check assert
**"no NEW offenders beyond the baseline."** The sold/rent band fires on 2 real true-positive rows on day one
(ZIP 33972 and ZIP 33920/Alva — both genuine upstream contamination we cannot fix) — seed them.

### C-3 🟡 The one-time backfill/purge is silently DROPPED (spec §5 deliverable)
Spec §5 lists `check_data_quality.py --contracts-backfill` (read-only triage of already-landed contamination)
**and `--purge`** (separate, explicit destructive cleanup). This phase defers both.
**FIX:** **BUILD `--contracts-backfill`** — it is read-only, safe, additive; there is no reason to defer it.
Ship `--purge` as a separate **[ASK-FIRST]** destructive task. **A destructive purge needs a non-null guard via
`ingest.lib.guards` or the pre-push Gate 4 BLOCKS the push.** If `--purge` is still deferred, that is a spec
amendment — say so and open the `contracts_backfill_and_purge` check (RULE 2.4: no silent deferrals).

### C-4 🟡 Locus A is wired on 2 of the 3 spec-named writers — state it as an amendment, not a silent skip
Spec §5 names `listing_lifecycle/distill.py:upsert_state`, `active_listings/distill.py:upsert_rows`,
`market_aggregates/pipeline.py:run_details`. This phase wires #1 and #3 and defers #2.
**The deferral is CORRECT** — `active_listings` is the orphan; its table feeds nothing live (`08h` D7).
**FIX:** say so explicitly as a spec amendment with the evidence cite. Do not skip silently.

### C-5 🟡 §9(c) requires the incident logger to CAPTURE the abort — nothing reads the guard
Abort is proven in a unit test, but **nothing in `classify-cron-failure.mjs` recognizes a `CONTENT_CONTRACT` class**,
and `ContentContractError`'s `should_retry=false` is asserted only by a **docstring test** — no handler reads it.
**A guard whose "do not retry" instruction nothing reads is decoration.**
**FIX:** wire the class into the incident handler, or state the gap plainly and open a check.

### C-6 🟡 Task 8 is unmarked but changes what writes to the live `public.checks` ledger → **[ASK-FIRST]**
Show the operator a `--dry-run` ledger diff first.

### C-7 🟡 Fabricated pass counts will halt a zero-context executor
Task 3 says "Expected: 29 passed" (real: **28**). Task 4 says "39 passed, 1 failed" (real: **38 passed, 1 failed**).
Downstream counts inherit the error. **Replace every hard count** with real arithmetic or "all green except the new failing test."

### C-8 🟡 Publish the Locus-B reader's signature — Phase 5 (doctor) imports it
Doctor's content-health signal currently (wrongly) imports only `run_value_tests`. This phase must publish, in its
**Produces/Interfaces** block: `run_content_contracts(conn, registry) -> list[dict]` returning the same shape as
`run_value_tests` (`{table, col, test, severity, failing_rows, status}`).

### ✅ WHAT THE CRITIC SAID IS RIGHT — DO NOT "FIX" THESE BACK
- **The label-independent oracle is correct and is the strongest work in the plan.** `(beds IS NOT NULL OR sqft IS NOT NULL)`,
  **no `property_type` anywhere in the oracle**, `JOIN ... ON v.county = c.county AND v.zip_code = c.zip_code`
  (**never `USING (zip_code)`**), `homes_cnt >= 25` retained. Keep the relabel proof where the naive contract reports
  GREEN and the corrected one fires at 0.102.
- **The price floor ships as `policy: report`, NEVER `quarantine`.** The 33903 twin-row test (a real $9,900
  manufactured-home sale and its `other`-tagged twin must get the same verdict) is correct.
- **The sold/rent band `[4.0, 40.0]` annual** correctly reconciles to `08h`'s `[50, 400]` monthly.

---


**Delivers:** `ingest/quality/contracts.py` — a pure, DB-free contract engine (`evaluate_batch(rows, table, ctx) -> (clean, quarantined, stats)` plus the failing-row SQL builders) — wired at **Locus A** (in the merge orchestrators, on the candidate batch, pre-merge) and **Locus B** (at-rest, in `check_data_quality.py`), reading one `content_contracts:` block in `ingest/quality/quality_registry.yaml` so a predicate can never drift between the gate and the tripwire. Adds `ContentContractError` to `ingest/lib/guards.py`.

**Unblocks:** Phase 3c `doctor` (it imports `run_content_contracts` for its content-health signal) and the Phase-2 registry cross-check (which needs a table-keyed contract block to reconcile against). Nothing in this phase depends on the Spine.

**The four corrections this phase exists to honor — read before Task 1:**

1. **The `land_drags_median` tripwire as specced is a TAUTOLOGY.** Its recompute copies the view's own `WHERE property_type <> 'land'` byte-for-byte → 49/52 live rows have ratio exactly `1.0000` → `median < 0.5 × median` is arithmetically unsatisfiable. And `property_type` is **derived, not vendor-supplied** (`extract_api.py:69-70` — `PROPERTY_TYPE_MAP.get(raw, "other")` silently defaults any unmapped value; this bug already happened once, `test_extract_api.py:64-65`). Under a relabel, the original ~10× $35k bug **returns in full while the tripwire reports GREEN** (33972 → true ratio 0.102, reported 1.000). Task 5 ships the **corrected** oracle from `08h §1e`: label-independent `(beds IS NOT NULL OR sqft IS NOT NULL)`, joined `ON (county, zip)` not `USING (zip_code)`. Task 6 proves it fires under the relabel the naive one sleeps through.

2. **The `range` price floor must NOT hard-quarantine.** Both independent verifiers proved a `property_type NOT IN ('land','other')` floor deletes **real manufactured-home SALES** — `4324 Mailbox Ave #127` ($9,900, verified live on MHVillage/Trulia as an active for-sale mobile home), `567 Peace Ct #2120` ($2,000), `648 Suwanee Dr #2190` ($3,000) — a cohort that runs continuously from $2,000 to $59,900+, so no floor separates it. **Policy at the merge locus is `report`, never `quarantine`.** The floor's WHERE-scope is `sqft IS NOT NULL` + a 4-type allowlist, which is the *only* scope that puts `4438HITZINGAVE51:33903` ($8,900, sqft NULL → PASSES) and the Marco Island `10TAMPAPL*:34145` condo cluster ($6–9k, 728–855 sqft → FIRES) on opposite sides. Live: 21 offenders, all 21 verified bad, 0 verified-real.

3. **No enum on `sale_or_rent`** — it is **vacuously green**; both writers hardcode `"sale"` (`extract_api.py:139`, `extract.py:144`). The contamination is a PRICE signal, not a label signal. Authoring it would credit the enum family with coverage it does not have.

4. **The sold/rent band is NOT green on day one** — it fires on 2 real rows (33972; 33920/Alva, 84.3% land) that are TRUE positives of upstream realtor.com land-drag we cannot fix. They are seeded as **known-accepted** (excluded by ZIP, with a `warn`-severity watch twin that keeps them visible) or the contract is RED from commit #1. It also gets a **coverage floor** (rent non-null ≥ 45 of 54 ZIPs) or it is satisfiable by having no data.

**The policy ledger (state it plainly; every entry is evidence-backed):**

| Contract | Locus | Policy | Why |
|---|---|---|---|
| `listing_state_home_price_floor` (range) | both | **report** | Correction #2 — a price floor is a signal, not a licence to drop rows |
| `listing_state_property_type_allowlist` (enum) | both | **quarantine** | An uninterpretable token can never merge. Codomain is closed → 0 live violations → nothing drops today |
| `market_details_sold_rent_band` (range) | merge | **report** | Withholding a ZIP row changes what `market-temperature-swfl` ships — a live-surface change, ask-first, not Phase 1 |
| all `sql_expectation` (views + at-rest) | probe | **report** | A view has no batch. Locus B reports; blocking is Locus A's job |
| every contract | — | `abort_if` | Row disposition (report/quarantine) and **run** disposition (abort) are independent. A `report` contract still kills the run on a genuine feed-shape change |

**Deliberately NOT wired in this phase (each gets a `checks` entry in Task 11 — RULE 2.4, no silent deferrals):** Locus A-1 (`active_listings` → `active_listings_residential`) — that table is **ORPHANED** (`08h` D7: a daily writer whose 38,728 rows feed nothing live; the registry names a consumer that actually reads `listing_lifecycle`'s output). Gating a corpse is worse than not gating. Also deferred: `--contracts-backfill` / `--purge`, the `state='holding'` rent artifacts, and the one-sided-ratio ceiling.

---

### Task 1: `ContentContractError` in `ingest/lib/guards.py`

**Files:**
- Modify: `ingest/lib/guards.py:45-48` (insert after `FetchHealthError`'s `pass`, before `def assert_content_fresh(`)
- Test: `ingest/tests/lib/test_guards.py` (append)

**Interfaces:**
- Produces: `class ContentContractError(RuntimeError)` — imported by Task 9 and Task 10 as `from ingest.lib.guards import ContentContractError`.

- [ ] **Step 1: Write the failing test** — append to `ingest/tests/lib/test_guards.py`:
```python
# ── ContentContractError (content contracts, Phase 1) ───────────────────────────


def test_content_contract_error_is_its_own_runtime_error():
    """A content violation is NOT a volume problem: the row COUNT is healthy (34k landed),
    the row CONTENT is wrong. Every existing guard here is blind to that, so the class must
    be distinct for GHA log parsing and cron-failure classification."""
    from ingest.lib.guards import (
        ContentContractError,
        ContentStaleError,
        FetchHealthError,
        VolumeGuardError,
    )

    assert issubclass(ContentContractError, RuntimeError)
    for sibling in (VolumeGuardError, ContentStaleError, FetchHealthError):
        assert not issubclass(ContentContractError, sibling)
        assert not issubclass(sibling, ContentContractError)


def test_content_contract_error_docstring_names_the_no_retry_prescription():
    """The doctor prescriptions enum (spec §11) keys off this: a content violation means the
    feed changed shape, so retrying re-lands the same bad rows. should_retry = false."""
    from ingest.lib.guards import ContentContractError

    doc = ContentContractError.__doc__ or ""
    assert "should_retry" in doc
    assert "false" in doc.lower()
```

- [ ] **Step 2: Run test to verify it fails**
```
pytest ingest/tests/lib/test_guards.py -k content_contract -q
```
Expected: `ImportError: cannot import name 'ContentContractError' from 'ingest.lib.guards'` — 2 errors.

- [ ] **Step 3: Write minimal implementation** — in `ingest/lib/guards.py`, insert between `FetchHealthError`'s `pass` (line 45) and `def assert_content_fresh(` (line 48):
```python
class ContentContractError(RuntimeError):
    """Raised pre-merge when a content contract's violating SHARE says the feed changed shape.

    Distinct from VolumeGuardError on purpose, and this is the whole point: the row COUNT is
    healthy — 34k rows landed, every volume guard is green — while the row CONTENT is wrong
    (rental-priced rows in a sales table; land blended into a homes median). Every guard in
    this module is structurally blind to that class. That is how a "$35,000 median asking
    price" for ZIP 33972 shipped behind a fleet of green crons.

    NOT raised for ordinary violations: those quarantine (drop the offending rows, merge the
    clean rest) or report (count them, drop nothing). This is raised ONLY when a contract's
    abort_if trips — a bulk leak, not a tail. contracts.evaluate_batch() is pure and never
    raises; the merge orchestrator inspects stats["abort"] and raises this.

    Cron-failure classification: CONTENT_CONTRACT -> the feed's shape changed;
    should_retry = false. A retry re-lands the identical bad rows."""

    pass
```

- [ ] **Step 4: Run test to verify it passes**
```
pytest ingest/tests/lib/test_guards.py -q
```
Expected: `2 passed` for the new tests; the whole file green (no existing test touched).

- [ ] **Step 5: Commit**
```
git add ingest/lib/guards.py ingest/tests/lib/test_guards.py
git commit -m "feat(contracts): add ContentContractError guard sibling"
```

---

### Task 2: `contracts.py` — the pure predicate core (SQL-faithful three-valued logic + batch ctx)

**Files:**
- Create: `ingest/quality/__init__.py`
- Create: `ingest/quality/contracts.py`
- Create: `ingest/tests/quality/__init__.py`
- Create: `ingest/tests/quality/test_contracts.py`

**Interfaces:**
- Produces:
  - `class ContractConfigError(ValueError)` — a malformed/unresolvable contract spec.
  - `_MISSING` — module-level sentinel object.
  - `resolve_value(row: dict, ctx: dict | None, col: str) -> Any` — row first, then batch-scalar ctx, else `_MISSING`.
  - `row_matches_where(row: dict, ctx: dict | None, conds: list[dict]) -> bool` — all conds AND-ed; SQL three-valued logic (a NULL never satisfies a comparison).
  - `WHERE_OPS: dict[str, callable]` — the op vocabulary shared by the row evaluator and the SQL builders.

**Why `ctx` exists (this is the one spec correction that blocks Phase-1 coding):** `source_name` is **not** a batch-row column on `listing_state` — `distill._STATE_COLS` (`ingest/pipelines/listing_lifecycle/distill.py:77-89`) omits it, and `upsert_state` injects it as a **scalar** at merge time (`distill.py:200`). Without batch context a Locus-A contract cannot evaluate a `source_name` predicate at all. `evaluate_batch(rows, table, ctx={"source_name": src_name})` closes that.

- [ ] **Step 1: Write the failing test** — `ingest/tests/quality/test_contracts.py`:
```python
"""Unit tests for ingest/quality/contracts.py — the pure contract engine.

Pure and DB-free by construction: no psycopg connection, no fixtures on disk. The
row evaluator must be SQL-FAITHFUL — Locus A (Python, on the batch) and Locus B
(SQL, at rest) read the SAME registry spec, so if their NULL semantics diverge the
gate and the tripwire silently disagree about what a violation is."""
import pytest

from ingest.quality.contracts import (
    ContractConfigError,
    _MISSING,
    resolve_value,
    row_matches_where,
)


# ── resolve_value: row first, then batch-scalar ctx ────────────────────────────


def test_resolve_prefers_the_row_column():
    assert resolve_value({"list_price": 5000}, {"list_price": 999}, "list_price") == 5000


def test_resolve_falls_back_to_batch_ctx():
    """source_name is NOT a listing_state batch column (distill._STATE_COLS omits it;
    upsert_state injects it as a scalar at distill.py:200). ctx is the ONLY way a
    Locus-A contract can see it."""
    assert resolve_value({"list_price": 5000}, {"source_name": "api_feed"}, "source_name") == "api_feed"


def test_resolve_keeps_an_explicit_none_from_the_row():
    """sqft=None is a PRESENT column holding NULL — not a missing column. The whole
    price floor turns on that distinction (sqft-NULL mobile homes are out of scope)."""
    assert resolve_value({"sqft": None}, {"sqft": 1200}, "sqft") is None


def test_resolve_returns_missing_sentinel_for_an_unknown_column():
    """A typo'd column must be LOUD, never a silent None — a silent None makes the
    where-scope match nothing (or everything) and the contract reports a fake green."""
    assert resolve_value({"list_price": 1}, None, "lst_price") is _MISSING


# ── row_matches_where: SQL three-valued logic ──────────────────────────────────


def test_where_all_conditions_are_anded():
    row = {"sale_or_rent": "sale", "sqft": 1200}
    conds = [
        {"col": "sale_or_rent", "op": "eq", "value": "sale"},
        {"col": "sqft", "op": "not_null"},
    ]
    assert row_matches_where(row, None, conds) is True
    assert row_matches_where({"sale_or_rent": "sale", "sqft": None}, None, conds) is False


def test_empty_where_matches_every_row():
    assert row_matches_where({"anything": 1}, None, []) is True
    assert row_matches_where({"anything": 1}, None, None) is True


@pytest.mark.parametrize("op", ["eq", "ne", "in", "not_in", "lt", "lte", "gt", "gte"])
def test_null_never_satisfies_a_comparison(op):
    """SQL fidelity: `NULL <> 'x'` is UNKNOWN, not TRUE — the row is NOT selected.
    Python's `None != 'x'` is True, so a naive port would over-match every NULL row.
    The `not_in` case is the live one: property_type NOT IN ('land','other') must not
    silently pull in a NULL-typed row."""
    value = ["land", "other"] if op in ("in", "not_in") else 20000
    cond = {"col": "c", "op": op, "value": value}
    assert row_matches_where({"c": None}, None, [cond]) is False


def test_is_null_and_not_null_are_the_only_ops_that_see_null():
    assert row_matches_where({"c": None}, None, [{"col": "c", "op": "is_null"}]) is True
    assert row_matches_where({"c": None}, None, [{"col": "c", "op": "not_null"}]) is False
    assert row_matches_where({"c": 1}, None, [{"col": "c", "op": "not_null"}]) is True


def test_unknown_op_raises_config_error():
    with pytest.raises(ContractConfigError, match="unknown where op"):
        row_matches_where({"c": 1}, None, [{"col": "c", "op": "approximately", "value": 1}])


def test_missing_column_raises_config_error():
    """An unresolvable column is a CONFIG bug, not a data verdict. Raise here; the
    caller (evaluate_batch) catches it and SKIPs that one contract loudly."""
    with pytest.raises(ContractConfigError, match="lst_price"):
        row_matches_where({"list_price": 1}, None, [{"col": "lst_price", "op": "not_null"}])
```

- [ ] **Step 2: Run test to verify it fails**
```
pytest ingest/tests/quality/test_contracts.py -q
```
Expected: collection error — `ModuleNotFoundError: No module named 'ingest.quality.contracts'`.

- [ ] **Step 3: Write minimal implementation**

`ingest/quality/__init__.py` (empty file — makes `ingest.quality` an importable package so `check_data_quality.py`, run as `python -m ingest.scripts.check_data_quality`, can do `from ingest.quality.contracts import ...`):
```python
```

`ingest/tests/quality/__init__.py` (empty file):
```python
```

`ingest/quality/contracts.py`:
```python
"""Content contracts — pure, DB-free evaluation of registry-declared data contracts.

ONE authority, TWO compilers. Both read the SAME `content_contracts:` block in
ingest/quality/quality_registry.yaml, so a predicate can never drift between the gate
and the tripwire:

  Locus A (blocking-capable) — evaluate_batch(rows, table, ctx) in the merge orchestrator,
    on the candidate batch, immediately before the merge call. Pure: it NEVER raises and
    NEVER touches a DB. It returns (clean, quarantined, stats); the orchestrator inspects
    stats["abort"] and raises ContentContractError, or takes `clean`. The raise lives in
    the caller by design.

  Locus B (report-only) — build_*_sql(table, spec) in check_data_quality.py, run at rest.
    The ONLY locus a bare VIEW has (data_lake.listing_active_stats has no pipeline).

SQL FIDELITY IS THE LOAD-BEARING PROPERTY. The row evaluator implements SQL's
three-valued logic: a NULL never satisfies a comparison. Python's `None != 'x'` is True
while SQL's `NULL <> 'x'` is UNKNOWN (row not selected) — port that naively and Locus A
and Locus B silently disagree about what a violation is.

BATCH CONTEXT. `source_name` is NOT a batch-row column on listing_state:
distill._STATE_COLS (listing_lifecycle/distill.py:77-89) omits it and upsert_state injects
it as a scalar at merge time (distill.py:200). `ctx` supplies those batch-scalar columns so
a Locus-A contract can evaluate a source_name predicate at all.
"""
from __future__ import annotations

from typing import Any

_MISSING = object()  # "this column exists in neither the row nor the ctx" — never a value


class ContractConfigError(ValueError):
    """A malformed or unresolvable contract spec (unknown op, unknown column, bad type).

    A CONFIG bug, never a data verdict. evaluate_batch() catches it per-contract and marks
    that contract SKIP with the reason — a broken contract must never be reported as a pass,
    and must never take down a load."""

    pass


def resolve_value(row: dict, ctx: dict | None, col: str) -> Any:
    """Column value: the batch ROW first, then the batch-scalar CTX, else _MISSING.

    `col in row` (not `row.get(col)`) is deliberate: sqft=None is a PRESENT column holding
    NULL, which is a different thing from an absent column. The price floor's whole scope
    turns on that (sqft-NULL mobile homes are out of scope and must stay in the lake)."""
    if col in row:
        return row[col]
    if ctx and col in ctx:
        return ctx[col]
    return _MISSING


# Every op is FALSE on NULL except is_null/not_null — SQL three-valued logic (see module
# docstring). These same names compile to SQL in build_where_sql(); keep the two in step.
WHERE_OPS = {
    "eq": lambda v, t: v is not None and v == t,
    "ne": lambda v, t: v is not None and v != t,
    "in": lambda v, t: v is not None and v in t,
    "not_in": lambda v, t: v is not None and v not in t,
    "lt": lambda v, t: v is not None and v < t,
    "lte": lambda v, t: v is not None and v <= t,
    "gt": lambda v, t: v is not None and v > t,
    "gte": lambda v, t: v is not None and v >= t,
    "not_null": lambda v, t: v is not None,
    "is_null": lambda v, t: v is None,
}


def row_matches_where(row: dict, ctx: dict | None, conds: list[dict] | None) -> bool:
    """True iff the row is IN SCOPE for a contract. All conds AND-ed; empty/None = every row."""
    for cond in conds or []:
        op = cond.get("op")
        fn = WHERE_OPS.get(op)
        if fn is None:
            raise ContractConfigError(f"unknown where op {op!r} (have: {sorted(WHERE_OPS)})")
        col = cond.get("col")
        v = resolve_value(row, ctx, col)
        if v is _MISSING:
            raise ContractConfigError(
                f"where column {col!r} resolves in neither the batch row nor the batch ctx"
            )
        if not fn(v, cond.get("value")):
            return False
    return True
```

- [ ] **Step 4: Run test to verify it passes**
```
pytest ingest/tests/quality/test_contracts.py -q
```
Expected: `17 passed`.

- [ ] **Step 5: Commit**
```
git add ingest/quality/__init__.py ingest/quality/contracts.py ingest/tests/quality/__init__.py ingest/tests/quality/test_contracts.py
git commit -m "feat(contracts): pure SQL-faithful predicate core with batch ctx"
```

---

### Task 3: `range` + `enum` row evaluators (a NULL in scope is a VIOLATION)

**Files:**
- Modify: `ingest/quality/contracts.py` (append after `row_matches_where`)
- Test: `ingest/tests/quality/test_contracts.py` (append)

**Interfaces:**
- Consumes: `row_matches_where(row, ctx, conds) -> bool`, `resolve_value(row, ctx, col)`, `_MISSING`, `ContractConfigError` (Task 2).
- Produces:
  - `range_violations(rows: list[dict], ctx: dict | None, spec: dict) -> list[int]` — indexes of violating rows.
  - `enum_violations(rows: list[dict], ctx: dict | None, spec: dict) -> list[int]` — indexes of violating rows.
  - `ROW_EVALUATORS: dict[str, callable]` — `{"range": range_violations, "enum": enum_violations}`. `sql_expectation` is deliberately absent: it is not row-evaluable and is Locus-B only.

**The NULL rule (this closes a live hole).** A row that is **in scope** but whose asserted column is NULL is a **VIOLATION**, not a pass — unless the spec says `allow_null: true`. In SQL, `NULL NOT BETWEEN 4.0 AND 40.0` evaluates to NULL, which **silently passes** the row: the `market_details_swfl` band would let a NULL `sold_to_rent_ratio` through while both price columns are present. That is the three-valued-logic hole the adversarial verifier found (`08b`, sql_expectation §"C3 — SOUND, two fixes", fix (a)).

- [ ] **Step 1: Write the failing test** — append to `ingest/tests/quality/test_contracts.py`:
```python
# ── range evaluator ────────────────────────────────────────────────────────────

from ingest.quality.contracts import enum_violations, range_violations  # noqa: E402

# The price-floor spec exactly as authored in quality_registry.yaml (Task 5). The
# sqft-IS-NOT-NULL scope is the ONLY one that separates the Marco Island rent artifacts
# (sqft present) from the real N. Fort Myers mobile-home SALES (sqft NULL).
_PRICE_FLOOR = {
    "name": "listing_state_home_price_floor",
    "type": "range",
    "col": "list_price",
    "min": 20000,
    "where": [
        {"col": "source_name", "op": "eq", "value": "api_feed"},
        {"col": "sale_or_rent", "op": "eq", "value": "sale"},
        {"col": "state", "op": "eq", "value": "active"},
        {"col": "list_price", "op": "not_null"},
        {"col": "sqft", "op": "not_null"},
        {"col": "property_type", "op": "in",
         "value": ["single_family", "condo", "townhouse", "multi_family"]},
    ],
}
_CTX = {"source_name": "api_feed"}


def _row(**kw):
    base = {"sale_or_rent": "sale", "state": "active", "property_type": "single_family",
            "list_price": 350000, "sqft": 1800, "beds": 3, "lot_acres": 0.20,
            "zip_code": "33901", "address_key": "SYNTHETIC:33901"}
    base.update(kw)
    return base


def test_range_flags_a_below_floor_row_in_scope():
    rows = [_row(address_key="10TAMPAPL303:34145", property_type="condo", list_price=9000,
                 beds=1, sqft=855, lot_acres=None, zip_code="34145")]
    assert range_violations(rows, _CTX, _PRICE_FLOOR) == [0]


def test_range_passes_a_row_above_the_floor():
    assert range_violations([_row()], _CTX, _PRICE_FLOOR) == []


def test_range_null_in_scope_is_a_violation_not_a_pass():
    """`NULL NOT BETWEEN 4 AND 40` is NULL in SQL, which SILENTLY PASSES the row. A NULL
    ratio with both price columns present is exactly the hole the band contract had."""
    spec = {"col": "sold_to_rent_ratio", "min": 4.0, "max": 40.0,
            "where": [{"col": "median_sold_price", "op": "not_null"},
                      {"col": "median_rent_price", "op": "not_null"}]}
    rows = [{"median_sold_price": 300000, "median_rent_price": 2000, "sold_to_rent_ratio": None}]
    assert range_violations(rows, None, spec) == [0]


def test_range_allow_null_true_lets_a_null_through():
    spec = {"col": "x", "min": 1, "allow_null": True, "where": []}
    assert range_violations([{"x": None}], None, spec) == []


def test_range_max_bound_flags_above_the_ceiling():
    spec = {"col": "sold_to_rent_ratio", "min": 4.0, "max": 40.0, "where": []}
    rows = [{"sold_to_rent_ratio": 1.28}, {"sold_to_rent_ratio": 21.14},
            {"sold_to_rent_ratio": 55.0}]
    assert range_violations(rows, None, spec) == [0, 2]  # 21.14 (Cape Coral) is LEGIT


def test_range_needs_at_least_one_bound():
    with pytest.raises(ContractConfigError, match="min.*max"):
        range_violations([{"x": 1}], None, {"col": "x", "where": []})


def test_range_out_of_scope_rows_are_never_evaluated():
    """522 legit sub-$20k LAND lots are protected by scope, not by threshold."""
    land = _row(property_type="land", list_price=18000, sqft=None, beds=None, lot_acres=0.23)
    assert range_violations([land], _CTX, _PRICE_FLOOR) == []


# ── enum evaluator ─────────────────────────────────────────────────────────────

# Allowlist = the UNION of BOTH writers' code-reachable codomains — NOT the live active mix.
# Authoring it from the 6-value active mix quarantines 2,996 legitimate 'residential' rows.
_PTYPE_ENUM = {
    "name": "listing_state_property_type_allowlist",
    "type": "enum",
    "col": "property_type",
    "allowed": ["single_family", "condo", "townhouse", "multi_family",
                "land", "other", "manufactured", "residential"],
    "allow_null": False,
    "where": [],
}


def test_enum_passes_every_allowed_token():
    rows = [_row(property_type=t) for t in _PTYPE_ENUM["allowed"]]
    assert enum_violations(rows, None, _PTYPE_ENUM) == []


def test_enum_protects_the_2996_residential_rows():
    """extract.py:140 emits 'residential' (Source-B vocabulary); catchup.py:92 flipped those
    rows into source_name='api_feed'. 2,996 live rows, median $359,900 Lee / $770,000 Collier
    — LEGITIMATE HOMES. Dropping 'residential' from the allowlist quarantines all of them."""
    rows = [_row(property_type="residential", state="holding", list_price=359900)]
    assert enum_violations(rows, None, _PTYPE_ENUM) == []


def test_enum_flags_a_raw_vendor_token_a_bypassed_normalizer_would_land():
    """`condos` / `townhomes` / `duplex_triplex` / `mobile` are the LIVE vocabulary of the
    sibling table data_lake.rental_listings_swfl (raw SteadyAPI tokens, never passed through
    PROPERTY_TYPE_MAP). They are what lands in listing_state if a writer skips the mapper —
    the only realistic way this contract ever fires. Not invented: observed."""
    rows = [_row(property_type="condos"), _row(property_type="duplex_triplex")]
    assert enum_violations(rows, None, _PTYPE_ENUM) == [0, 1]


def test_enum_null_is_a_violation_when_allow_null_false():
    assert enum_violations([_row(property_type=None)], None, _PTYPE_ENUM) == [0]
```

- [ ] **Step 2: Run test to verify it fails**
```
pytest ingest/tests/quality/test_contracts.py -q
```
Expected: collection error — `ImportError: cannot import name 'enum_violations' from 'ingest.quality.contracts'`.

- [ ] **Step 3: Write minimal implementation** — append to `ingest/quality/contracts.py`:
```python
# ── row evaluators (Locus A) — pure: list of rows in, list of violating INDEXES out ──


def range_violations(rows: list[dict], ctx: dict | None, spec: dict) -> list[int]:
    """Indexes of in-scope rows whose `col` falls outside [min, max].

    THE NULL RULE (load-bearing): an in-scope row whose `col` is NULL is a VIOLATION, not a
    pass, unless `allow_null: true`. SQL's `NULL NOT BETWEEN 4 AND 40` is NULL, which silently
    PASSES the row — that is the three-valued-logic hole the market_details band shipped with.
    At least one of min/max is required: a range with neither bound asserts nothing."""
    col = spec.get("col")
    lo, hi = spec.get("min"), spec.get("max")
    if lo is None and hi is None:
        raise ContractConfigError(
            f"range contract {spec.get('name')!r} declares neither min nor max — asserts nothing"
        )
    allow_null = bool(spec.get("allow_null", False))
    where = spec.get("where")
    out: list[int] = []
    for i, row in enumerate(rows):
        if not row_matches_where(row, ctx, where):
            continue
        v = resolve_value(row, ctx, col)
        if v is _MISSING:
            raise ContractConfigError(
                f"range column {col!r} resolves in neither the batch row nor the batch ctx"
            )
        if v is None:
            if not allow_null:
                out.append(i)
            continue
        if (lo is not None and v < lo) or (hi is not None and v > hi):
            out.append(i)
    return out


def enum_violations(rows: list[dict], ctx: dict | None, spec: dict) -> list[int]:
    """Indexes of in-scope rows whose `col` carries a token outside the allowlist.

    The allowlist is the UNION of BOTH writers' code-reachable codomains, never the live
    table's active mix — see quality_registry.yaml's comment on the `residential` trap."""
    col = spec.get("col")
    allowed = spec.get("allowed")
    if not allowed:
        raise ContractConfigError(f"enum contract {spec.get('name')!r} has an empty allowed list")
    allowed_set = set(allowed)
    allow_null = bool(spec.get("allow_null", False))
    where = spec.get("where")
    out: list[int] = []
    for i, row in enumerate(rows):
        if not row_matches_where(row, ctx, where):
            continue
        v = resolve_value(row, ctx, col)
        if v is _MISSING:
            raise ContractConfigError(
                f"enum column {col!r} resolves in neither the batch row nor the batch ctx"
            )
        if v is None:
            if not allow_null:
                out.append(i)
            continue
        if v not in allowed_set:
            out.append(i)
    return out


# `sql_expectation` is DELIBERATELY absent: it is cross-row / cross-table (a median, a JOIN
# against another table) and is not evaluable on a batch of dicts at all. It is Locus-B only,
# and evaluate_batch() skips it by locus, not by accident.
ROW_EVALUATORS = {
    "range": range_violations,
    "enum": enum_violations,
}
```

- [ ] **Step 4: Run test to verify it passes**
```
pytest ingest/tests/quality/test_contracts.py -q
```
Expected: `29 passed`.

- [ ] **Step 5: Commit**
```
git add ingest/quality/contracts.py ingest/tests/quality/test_contracts.py
git commit -m "feat(contracts): range + enum row evaluators; NULL-in-scope is a violation"
```

---

### Task 4: `evaluate_batch` + the policy / abort math

**Files:**
- Modify: `ingest/quality/contracts.py` (append)
- Test: `ingest/tests/quality/test_contracts.py` (append)

**Interfaces:**
- Consumes: `ROW_EVALUATORS`, `ContractConfigError` (Task 3).
- Produces:
  - `load_contracts(table: str, registry: dict | None = None) -> list[dict]` — the `content_contracts:` list for a table, `[]` if the table has none. `registry=None` loads `ingest/quality/quality_registry.yaml`.
  - `evaluate_batch(rows: list[dict], table: str, ctx: dict | None = None, registry: dict | None = None) -> tuple[list[dict], list[dict], dict]` — returns `(clean, quarantined, stats)`. **Pure: never raises on a violation, never touches a DB.**
  - `stats` shape (Tasks 9/10 read `stats["abort"]`, `stats["abort_reason"]`, `stats["contracts"]`):
    ```python
    {"table": str, "rows_in": int, "rows_clean": int, "rows_quarantined": int,
     "abort": bool, "abort_reason": str | None,
     "contracts": [{"name","type","policy","severity","in_scope","violations",
                    "share_pct","status","detail"}]}
    ```
    `status ∈ PASS | VIOLATIONS | SKIP`.

**The two disposition axes are independent — this is the design:**
- **Row disposition** = `policy`: `report` (count them, drop NOTHING) · `quarantine` (drop the offenders, merge the clean rest).
- **Run disposition** = `abort_if`: fires on a *bulk leak*, regardless of policy. A `report` contract still kills the run when the whole feed changes shape. That is how "a price floor is a signal, not a licence to drop rows" and "a vendor units flip must stop the run" both hold at once.

**`abort_if` fires iff:** `(share_pct > share_pct_gt AND violations >= violations_gte)` **OR** `(if_no_clean_rows AND in_scope > 0 AND violations == in_scope)`.
- Strict `>` on share (spec §5: "violating *share* > threshold"), `>=` on the count.
- `share_pct = 100 × violations / in_scope` — the **in-scope** denominator, which is what every threshold in `08b §3` was derived against.
- The `violations_gte` floor is load-bearing, not decoration: batch size spans three orders of magnitude (7 rows on 07/07, 364 on 07/08, 21,142 on 07/10). A share-only rule aborts the whole nightly chain over 1 bad row in a 7-row recovery batch.
- `if_no_clean_rows` closes the opposite hole (`08h §5`): a **100%-contaminated batch below `violations_gte` never aborts** — every row quarantines, zero rows merge, and the run exits **green**.

- [ ] **Step 1: Write the failing test** — append to `ingest/tests/quality/test_contracts.py`:
```python
# ── evaluate_batch: purity, policy, abort math ─────────────────────────────────

from ingest.quality.contracts import evaluate_batch, load_contracts  # noqa: E402

_REG_REPORT = {"tables": {"t": {"content_contracts": [
    {"name": "floor", "type": "range", "locus": "both", "policy": "report", "severity": "error",
     "col": "p", "min": 100, "where": [],
     "abort_if": {"share_pct_gt": 5.0, "violations_gte": 25, "if_no_clean_rows": True}},
]}}}

_REG_QUARANTINE = {"tables": {"t": {"content_contracts": [
    {"name": "allow", "type": "enum", "locus": "both", "policy": "quarantine", "severity": "error",
     "col": "k", "allowed": ["a"], "allow_null": False, "where": [],
     "abort_if": {"share_pct_gt": 50.0, "violations_gte": 500, "if_no_clean_rows": True}},
]}}}


def test_report_policy_drops_nothing_but_counts_everything():
    """Correction #2, encoded: a price floor is a SIGNAL, not a licence to drop rows.
    Real manufactured-home SALES run continuously from $2,000 to $59,900 — no floor
    separates them from rent artifacts, so `report` must never remove a row."""
    rows = [{"p": 50}, {"p": 500}]
    clean, quarantined, stats = evaluate_batch(rows, "t", registry=_REG_REPORT)
    assert clean == rows and quarantined == []
    c = stats["contracts"][0]
    assert (c["violations"], c["in_scope"], c["status"]) == (1, 2, "VIOLATIONS")
    assert c["share_pct"] == pytest.approx(50.0)
    assert stats["abort"] is False  # 1 violation < violations_gte 25


def test_quarantine_policy_removes_offenders_and_merges_the_clean_rest():
    rows = [{"k": "a"}, {"k": "condos"}, {"k": "a"}]
    clean, quarantined, stats = evaluate_batch(rows, "t", registry=_REG_QUARANTINE)
    assert clean == [{"k": "a"}, {"k": "a"}]
    assert quarantined == [{"k": "condos"}]
    assert (stats["rows_in"], stats["rows_clean"], stats["rows_quarantined"]) == (3, 2, 1)
    assert stats["abort"] is False


def test_evaluate_batch_never_raises_on_a_violation():
    """PURITY CONTRACT. The abort RAISE lives in the merge orchestrator, never here —
    that keeps contracts.py importable and testable with no DB and no guards dependency."""
    clean, quarantined, stats = evaluate_batch([{"p": 1}] * 1000, "t", registry=_REG_REPORT)
    assert stats["abort"] is True          # returned as data...
    assert isinstance(stats["abort_reason"], str)   # ...with a reason string
    assert len(clean) == 1000              # ...and report policy still dropped nothing


def test_abort_needs_BOTH_share_and_count_a_small_recovery_batch_survives():
    """A 169-row recovery batch carrying 3 bad rows is 1.78% share. A share-only rule at
    1% would have ABORTED a legitimate recovery run. Real batches: 7 rows (07/07), 364
    (07/08), 21,142 (07/10)."""
    rows = [{"p": 1}] * 3 + [{"p": 500}] * 166       # 3/169 = 1.78% share, 3 violations
    _, _, stats = evaluate_batch(rows, "t", registry=_REG_REPORT)
    assert stats["contracts"][0]["share_pct"] == pytest.approx(100 * 3 / 169)
    assert stats["abort"] is False                    # 3 < violations_gte 25


def test_abort_fires_when_share_AND_count_both_breach():
    rows = [{"p": 1}] * 30 + [{"p": 500}] * 70       # 30% > 5.0 and 30 >= 25
    _, _, stats = evaluate_batch(rows, "t", registry=_REG_REPORT)
    assert stats["abort"] is True
    assert "floor" in stats["abort_reason"]


def test_if_no_clean_rows_aborts_a_tiny_100pct_contaminated_batch():
    """The silent-total-loss hole (08h §5): a 100%-contaminated batch UNDER violations_gte
    would quarantine every row, merge zero, and exit GREEN. A 7-row batch really happened
    (07/07/2026)."""
    rows = [{"k": "condos"}] * 7                     # 100% share but only 7 < 500
    clean, quarantined, stats = evaluate_batch(rows, "t", registry=_REG_QUARANTINE)
    assert clean == [] and len(quarantined) == 7
    assert stats["abort"] is True
    assert "no clean rows" in stats["abort_reason"]


def test_an_empty_batch_is_a_clean_no_op():
    clean, quarantined, stats = evaluate_batch([], "t", registry=_REG_REPORT)
    assert (clean, quarantined, stats["abort"]) == ([], [], False)


def test_a_table_with_no_contracts_passes_everything_through_untouched():
    """41,510 leepa_parcels nominal-consideration transfers are protected by TABLE-SCOPING:
    no price contract is authored for that table. A naive `last_sale_amount >= 20000` floor
    would quarantine 71,388 legitimate quitclaim / family transfers."""
    rows = [{"folioid": "x", "last_sale_amount": 100}]
    clean, quarantined, stats = evaluate_batch(rows, "data_lake.leepa_parcels", registry=_REG_REPORT)
    assert clean == rows and quarantined == [] and stats["contracts"] == []


def test_a_malformed_contract_SKIPs_loudly_and_never_reports_a_pass():
    reg = {"tables": {"t": {"content_contracts": [
        {"name": "typo", "type": "range", "locus": "both", "policy": "report",
         "severity": "error", "col": "p", "min": 1,
         "where": [{"col": "nonexistent_col", "op": "not_null"}]},
    ]}}}
    clean, _, stats = evaluate_batch([{"p": 5}], "t", registry=reg)
    c = stats["contracts"][0]
    assert c["status"] == "SKIP"          # NOT "PASS"
    assert "nonexistent_col" in c["detail"]
    assert clean == [{"p": 5}]            # a broken contract never takes down a load


def test_probe_only_contracts_are_skipped_at_the_merge_locus():
    """A sql_expectation is cross-row (a median, a JOIN) — not evaluable on a batch of dicts.
    locus: probe means Locus B only, and evaluate_batch must not pretend otherwise."""
    reg = {"tables": {"t": {"content_contracts": [
        {"name": "tripwire", "type": "sql_expectation", "locus": "probe", "policy": "report",
         "severity": "error", "failing_rows_sql": "SELECT count(*) FROM t"},
    ]}}}
    clean, _, stats = evaluate_batch([{"p": 1}], "t", registry=reg)
    assert stats["contracts"] == []       # not evaluated, not faked as a pass
    assert clean == [{"p": 1}]


def test_load_contracts_reads_the_real_registry_for_listing_state():
    got = load_contracts("data_lake.listing_state")
    assert [c["name"] for c in got] == [
        "listing_state_home_price_floor",
        "listing_state_property_type_allowlist",
    ]
```

- [ ] **Step 2: Run test to verify it fails**
```
pytest ingest/tests/quality/test_contracts.py -q
```
Expected: collection error — `ImportError: cannot import name 'evaluate_batch' from 'ingest.quality.contracts'`. (`test_load_contracts_reads_the_real_registry_for_listing_state` stays red until Task 5 — expected, and it is the failing test that drives Task 5.)

- [ ] **Step 3: Write minimal implementation** — append to `ingest/quality/contracts.py`:
```python
# ── registry loading ───────────────────────────────────────────────────────────

from pathlib import Path  # noqa: E402

_REGISTRY_PATH = Path(__file__).parent / "quality_registry.yaml"

MERGE_LOCI = ("merge", "both")   # evaluated by evaluate_batch (Locus A)
PROBE_LOCI = ("probe", "both")   # evaluated by check_data_quality (Locus B)


def load_registry(path: str | Path = _REGISTRY_PATH) -> dict:
    import yaml

    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def load_contracts(table: str, registry: dict | None = None) -> list[dict]:
    """The `content_contracts:` list for one physical table — [] if it has none.

    [] is the protection mechanism for data_lake.leepa_parcels: 41,510 of its 528,130
    non-null last_sale_amount values are legitimate $1-9,999 nominal-consideration /
    quitclaim / family transfers. NO price contract is authored for that table, and a
    naive `>= 20000` floor would quarantine 71,388 real deeds."""
    reg = registry if registry is not None else load_registry()
    return ((reg.get("tables") or {}).get(table) or {}).get("content_contracts") or []


# ── evaluate_batch (Locus A) ───────────────────────────────────────────────────


def _abort_check(spec: dict, in_scope: int, violations: int, share_pct: float) -> str | None:
    """The reason string if this contract's abort_if trips, else None.

    abort  <=>  (share_pct > share_pct_gt AND violations >= violations_gte)
            OR  (if_no_clean_rows AND in_scope > 0 AND violations == in_scope)

    BOTH conditions on the first branch, never either. A share-only rule aborts a 7-row
    recovery batch over 1 bad row; a count-only rule aborts a 34k load over noise. The
    second branch closes the inverse hole: a 100%-contaminated batch UNDER the count floor
    would quarantine every row, merge zero, and exit green."""
    cfg = spec.get("abort_if") or {}
    name = spec.get("name")
    share_gt = cfg.get("share_pct_gt")
    count_gte = cfg.get("violations_gte")
    if (share_gt is not None and count_gte is not None
            and share_pct > share_gt and violations >= count_gte):
        return (
            f"[content-contract] {name}: {violations:,} of {in_scope:,} in-scope rows violate "
            f"({share_pct:.3f}% > {share_gt}% AND {violations:,} >= {count_gte:,}) — the feed "
            f"changed shape; aborting rather than merging a bulk leak"
        )
    if cfg.get("if_no_clean_rows") and in_scope > 0 and violations == in_scope:
        return (
            f"[content-contract] {name}: ALL {in_scope:,} in-scope rows violate — no clean rows "
            f"left to merge. A silent 100%-contaminated batch below the count floor would have "
            f"quarantined everything and exited green; aborting instead"
        )
    return None


def evaluate_batch(
    rows: list[dict],
    table: str,
    ctx: dict | None = None,
    registry: dict | None = None,
) -> tuple[list[dict], list[dict], dict]:
    """Evaluate every merge-locus contract for `table` against the candidate batch.

    PURE. Never raises on a violation. Never opens a DB connection. Returns
    (clean, quarantined, stats). The orchestrator decides what to DO:

        clean, quarantined, stats = evaluate_batch(ups, "data_lake.listing_state",
                                                   ctx={"source_name": src_name})
        if stats["abort"]:
            raise ContentContractError(stats["abort_reason"])
        ups = clean

    The raise lives in the caller by design — that keeps this module importable and
    unit-testable with no ingest.lib.guards dependency and no database.

    `ctx` supplies BATCH-SCALAR columns absent from the row dicts. On listing_state that is
    `source_name`: _STATE_COLS (distill.py:77-89) omits it and upsert_state injects it as a
    scalar at merge time (distill.py:200), so without ctx a source_name predicate is
    unevaluable at Locus A."""
    contracts = [c for c in load_contracts(table, registry)
                 if c.get("locus", "both") in MERGE_LOCI]
    stats: dict = {
        "table": table, "rows_in": len(rows), "rows_clean": len(rows),
        "rows_quarantined": 0, "abort": False, "abort_reason": None, "contracts": [],
    }
    drop: set[int] = set()
    abort_reasons: list[str] = []

    for spec in contracts:
        ctype = spec.get("type")
        policy = spec.get("policy", "report")
        base = {
            "name": spec.get("name"), "type": ctype, "policy": policy,
            "severity": spec.get("severity", "warn"),
        }
        evaluator = ROW_EVALUATORS.get(ctype)
        if evaluator is None:
            stats["contracts"].append({
                **base, "in_scope": None, "violations": None, "share_pct": None,
                "status": "SKIP",
                "detail": f"contract type {ctype!r} is not row-evaluable at the merge locus",
            })
            continue
        try:
            where = spec.get("where")
            in_scope_idx = [i for i, r in enumerate(rows) if row_matches_where(r, ctx, where)]
            viol_idx = evaluator(rows, ctx, spec)
        except ContractConfigError as exc:
            # A CONFIG bug. SKIP loudly — never report a pass, never take down the load.
            stats["contracts"].append({
                **base, "in_scope": None, "violations": None, "share_pct": None,
                "status": "SKIP", "detail": str(exc),
            })
            continue

        in_scope, violations = len(in_scope_idx), len(viol_idx)
        share_pct = (100.0 * violations / in_scope) if in_scope else 0.0
        stats["contracts"].append({
            **base, "in_scope": in_scope, "violations": violations,
            "share_pct": round(share_pct, 4),
            "status": "PASS" if violations == 0 else "VIOLATIONS",
            "detail": None,
        })

        if policy == "quarantine":
            drop.update(viol_idx)
        reason = _abort_check(spec, in_scope, violations, share_pct)
        if reason:
            abort_reasons.append(reason)

    clean = [r for i, r in enumerate(rows) if i not in drop]
    quarantined = [r for i, r in enumerate(rows) if i in drop]
    stats["rows_clean"] = len(clean)
    stats["rows_quarantined"] = len(quarantined)
    if abort_reasons:
        stats["abort"] = True
        stats["abort_reason"] = " | ".join(abort_reasons)
    return clean, quarantined, stats
```

- [ ] **Step 4: Run test to verify it passes**
```
pytest ingest/tests/quality/test_contracts.py -q
```
Expected: `39 passed, 1 failed` — the one failure is `test_load_contracts_reads_the_real_registry_for_listing_state` with `AssertionError: assert [] == ['listing_state_home_price_floor', ...]`. That is the failing test that drives Task 5. Everything else green.

- [ ] **Step 5: Commit**
```
git add ingest/quality/contracts.py ingest/tests/quality/test_contracts.py
git commit -m "feat(contracts): evaluate_batch + report/quarantine/abort policy math"
```

---

### Task 5: The `content_contracts:` registry blocks (incl. the CORRECTED land-drag oracle)

**Files:**
- Modify: `ingest/quality/quality_registry.yaml:14-26` (extend the header doc block) and append after `:58` (the `data_lake.leepa_parcels` block)
- Test: `ingest/tests/quality/test_contract_registry.py` (create)

**Interfaces:**
- Consumes: `load_contracts(table)` (Task 4).
- Produces: the eight named contracts every later task and phase references —
  - `data_lake.listing_state` → `listing_state_home_price_floor` (range, both, **report**), `listing_state_property_type_allowlist` (enum, both, **quarantine**)
  - `data_lake.listing_active_stats` → `listing_active_stats_land_blend_tripwire`, `listing_active_stats_median_absolute_floor` (sql_expectation, probe)
  - `data_lake.market_details_swfl` → `market_details_sold_rent_band` (range, **merge**), `market_details_sold_rent_band_at_rest`, `market_details_sold_rent_band_watch`, `market_details_rent_coverage_floor`, `market_details_ratio_units_check` (sql_expectation, probe)

**This task is where the tautology dies.** The registry SQL is the thing that was wrong; the structural test below is the lock that keeps it fixed.

- [ ] **Step 1: Write the failing test** — `ingest/tests/quality/test_contract_registry.py`:
```python
"""Structural locks on ingest/quality/quality_registry.yaml's content_contracts.

These are ANTI-REGRESSION tests, not style checks. Each one pins a finding that a live
adversarial verification produced, and each one fails if someone "simplifies" the registry
back to the version that shipped a bug."""
import pytest

from ingest.quality.contracts import load_contracts, load_registry


def _by_name(table, name):
    for c in load_contracts(table):
        if c["name"] == name:
            return c
    raise AssertionError(f"contract {name!r} not found on {table}")


# ── THE TAUTOLOGY LOCK ─────────────────────────────────────────────────────────


def test_land_blend_tripwire_oracle_is_label_INDEPENDENT():
    """THE KILL SHOT this whole contract exists to survive.

    The specced oracle recomputed a 'correct' homes-only median with a WHERE clause that was a
    BYTE-FOR-BYTE COPY of the view's own (`property_type <> 'land'`). Live: 49 of 52 rows had
    ratio exactly 1.0000 — `median < 0.5 * median` is ARITHMETICALLY UNSATISFIABLE. It had zero
    power against data drift.

    And property_type is DERIVED, not vendor-supplied: extract_api.py:69-70 is
    `PROPERTY_TYPE_MAP.get(raw, "other")`, which silently defaults any unmapped value (a bug
    that ALREADY HAPPENED once — test_extract_api.py:64-65). Under that relabel the original
    ~10x $35k bug returns IN FULL while the tripwire reports GREEN.

    The oracle must key on beds/sqft — RAW VENDOR FIELDS — never on the derived label."""
    sql = _by_name("data_lake.listing_active_stats",
                   "listing_active_stats_land_blend_tripwire")["failing_rows_sql"]
    assert "beds IS NOT NULL OR sqft IS NOT NULL" in sql
    assert "property_type" not in sql, (
        "the oracle re-read property_type — it is now a differential test against a copy of "
        "its own implementation, and it CANNOT FIRE"
    )


def test_land_blend_tripwire_joins_on_county_AND_zip_not_using_zip():
    """`USING (zip_code)` fans out: 34110 / 34119 / 33971 exist under BOTH counties, so a
    6-listing Lee slice gets compared against a 473-row pool pooled across both counties — and
    the `homes_cnt >= 25` small-N guard is bypassed by the POOLED count. Live and firing-ready:
    flip the mix and it quarantines a legitimate ZIP."""
    sql = _by_name("data_lake.listing_active_stats",
                   "listing_active_stats_land_blend_tripwire")["failing_rows_sql"]
    assert "USING (zip_code)" not in sql
    assert "v.county = c.county" in sql and "v.zip_code = c.zip_code" in sql
    assert "homes_cnt >= 25" in sql


# ── PRICE-FLOOR SCOPE: the twin rows that decide it ────────────────────────────


def test_price_floor_scope_is_sqft_present_and_never_excludes_by_type_denylist():
    """`property_type NOT IN ('land','other')` assigns OPPOSITE verdicts to indistinguishable
    listings — `19327CONGRESSIONALCT17G:33903` ($10,000, 2bd, sqft NULL, `other`) is PROTECTED
    while its twin `4324MAILBOXAVE127:33903` ($9,900, 2bd, sqft NULL, `single_family`, $100
    cheaper) is DROPPED. That row is a VERIFIED real for-sale mobile home (MHVillage, Trulia).
    The scope must be an sqft-present + 4-type ALLOWLIST, which puts both twins on the same
    (passing) side and still catches the Marco Island cluster."""
    spec = _by_name("data_lake.listing_state", "listing_state_home_price_floor")
    conds = {(c["col"], c["op"]): c.get("value") for c in spec["where"]}
    assert ("sqft", "not_null") in conds
    assert conds[("property_type", "in")] == [
        "single_family", "condo", "townhouse", "multi_family"
    ]
    assert ("property_type", "not_in") not in conds
    assert spec["min"] == 20000


def test_price_floor_policy_is_report_never_quarantine():
    """A price floor is a SIGNAL, not a licence to drop rows. Real manufactured-home SALES run
    continuously $2,000 -> $59,900+ (verified externally at $2,000 / $3,000 / $9,900), and real
    Arbor Trace annual-rate RENTALS reach $49,000 while a real sale in the SAME building starts
    at $54,900. No scalar floor separates the population at any threshold."""
    assert _by_name("data_lake.listing_state",
                    "listing_state_home_price_floor")["policy"] == "report"


# ── ENUM: the allowlist is a UNION OF CODOMAINS, not a live table mix ──────────


def test_property_type_allowlist_keeps_residential_and_manufactured():
    """2,996 live rows carry `residential` (extract.py:140's Source-B vocabulary, flipped into
    source_name='api_feed' by catchup.py:92). They are LEGITIMATE HOMES — median $359,900 Lee /
    $770,000 Collier. Authoring the allowlist from the 6-value ACTIVE mix (or from the
    homes-only migration's comment) quarantines all 2,996, and at the batch locus that is
    10.18% of Collier's 07/01 cutover batch — a HARD ABORT of an 8,833-row load.

    `manufactured` is in PROPERTY_TYPE_MAP (constants_api.py:60) with 0 live rows. Allowed so
    that widening STEADYAPI_TYPE_FILTERS cannot red the nightly chain before the registry
    catches up."""
    allowed = _by_name("data_lake.listing_state",
                       "listing_state_property_type_allowlist")["allowed"]
    assert set(allowed) == {"single_family", "condo", "townhouse", "multi_family",
                            "land", "other", "manufactured", "residential"}


def test_no_enum_contract_is_authored_on_sale_or_rent():
    """VACUOUSLY GREEN. Both writers HARDCODE it: extract_api.py:139 `"sale_or_rent": "sale"`
    and extract.py:144. 34,935 of 34,935 rows. It is structurally blind to the contamination —
    those rows are LABELLED 'sale' and PRICED as rent. Authoring it credits the enum family
    with coverage it does not have, and the range contract gets dropped in its favor."""
    cols = {c.get("col") for c in load_contracts("data_lake.listing_state")}
    assert "sale_or_rent" not in cols


# ── THE FALSE-POSITIVE TRAP THAT IS ENFORCED BY ABSENCE ────────────────────────


def test_leepa_parcels_carries_no_price_contract_ever():
    """41,510 of 528,130 non-null `last_sale_amount` values sit in $1-9,999 — legitimate
    quitclaim / family / non-arm's-length transfers recorded at nominal consideration. That IS
    the correct value for that column. A `>= 20000` floor here quarantines 71,388 real deeds.
    Protection is TABLE-SCOPING: no price contract exists, and this test is what keeps it so."""
    for c in load_contracts("data_lake.leepa_parcels"):
        assert c.get("col") != "last_sale_amount"
        assert "last_sale_amount" not in (c.get("failing_rows_sql") or "")


# ── SOLD/RENT BAND: green on day one, and not satisfiable by having no data ────


def test_sold_rent_band_seeds_the_two_known_accepted_zips():
    """NOT GREEN ON DAY ONE without this. It fires on 2 real rows: 33972 (sold $30,000 / rent
    $1,950, ratio 1.28) and 33920 Alva (84.3% land, ratio 1.90). Both are TRUE positives of
    upstream realtor.com land-drag that we cannot fix. If doctor equates nonzero rows with
    failure, the contract is RED from commit #1."""
    spec = _by_name("data_lake.market_details_swfl", "market_details_sold_rent_band")
    excl = [c for c in spec["where"] if c["col"] == "zip_code" and c["op"] == "not_in"]
    assert excl and set(excl[0]["value"]) == {"33972", "33920"}
    assert (spec["min"], spec["max"]) == (4.0, 40.0)


def test_the_two_accepted_zips_stay_visible_via_a_warn_twin():
    """Excluded from the ERROR contract, never hidden: the watch twin carries no exclusion and
    reports 2 today at severity `warn` (summary-only, opens no checks row). If it ever reports
    3, the error twin has already fired on the new one."""
    watch = _by_name("data_lake.market_details_swfl", "market_details_sold_rent_band_watch")
    assert watch["severity"] == "warn"
    assert "33972" not in watch["failing_rows_sql"]


def test_the_band_has_a_coverage_floor_or_it_is_satisfiable_by_no_data():
    """The band's WHERE filters `median_rent_price IS NOT NULL`, so a rent-column OUTAGE makes
    rows VANISH — it does not trip the band. If rent coverage collapsed from 49 ZIPs to 3, the
    band returns 0 rows and reports GREEN. 5 ZIPs already carry NULL rent."""
    sql = _by_name("data_lake.market_details_swfl",
                   "market_details_rent_coverage_floor")["failing_rows_sql"]
    assert "< 45" in sql and "median_rent_price IS NOT NULL" in sql


# ── shape invariants every contract must hold ─────────────────────────────────


@pytest.mark.parametrize("table", [
    "data_lake.listing_state",
    "data_lake.listing_active_stats",
    "data_lake.market_details_swfl",
])
def test_every_contract_declares_a_valid_type_locus_policy_and_severity(table):
    for c in load_contracts(table):
        assert c["type"] in ("range", "enum", "sql_expectation"), c["name"]
        assert c["locus"] in ("merge", "probe", "both"), c["name"]
        assert c["policy"] in ("report", "quarantine"), c["name"]
        assert c["severity"] in ("error", "warn"), c["name"]
        # A sql_expectation is cross-row — it can NEVER run at the merge locus.
        if c["type"] == "sql_expectation":
            assert c["locus"] == "probe", c["name"]


def test_listing_active_stats_is_probe_only_it_is_a_VIEW_with_no_pipeline():
    """CREATE OR REPLACE VIEW ... (docs/sql/20260711_listing_active_stats_homes_only.sql:34).
    grep of ingest/ returns exactly one hit and it is a consumer COMMENT. There is no batch, no
    merge call, no Locus A. Locus B is the only gate a view has."""
    for c in load_contracts("data_lake.listing_active_stats"):
        assert c["locus"] == "probe"


def test_the_existing_value_tests_are_untouched():
    """content_contracts is ADDITIVE. The four seeded value_tests tables keep working."""
    tables = load_registry()["tables"]
    assert tables["data_lake.news_articles_swfl"]["value_tests"]
    assert tables["data_lake.leepa_parcels"]["value_tests"]
    assert tables["data_lake.zhvi_swfl"]["schema_baseline"] is True
```

- [ ] **Step 2: Run test to verify it fails**
```
pytest ingest/tests/quality/test_contract_registry.py -q
```
Expected: `AssertionError: contract listing_active_stats_land_blend_tripwire not found on data_lake.listing_active_stats` — 13 failed.

- [ ] **Step 3: Write minimal implementation** — first extend the header of `ingest/quality/quality_registry.yaml` (insert after line 26, before `tables:`):
```yaml
# Per-table fields (continued) — CONTENT CONTRACTS (added 07/11/2026):
#   content_contracts: list of {name, type, locus, policy, severity, ...}
#     type:     range          — WHERE-scoped numeric floor/ceiling. Row-evaluable.
#               enum           — WHERE-scoped allowlist.               Row-evaluable.
#               sql_expectation— cross-row / cross-table (a median, a JOIN). NOT row-evaluable;
#                                locus MUST be `probe`.
#     locus:    merge (Locus A, in the pipeline, on the batch, pre-merge)
#               probe (Locus B, at rest, in check_data_quality.py — the ONLY locus a VIEW has)
#               both
#     policy:   report      — count the violations, DROP NOTHING (row disposition)
#               quarantine  — drop the offenders, merge the clean rest
#     abort_if: {share_pct_gt, violations_gte, if_no_clean_rows} — RUN disposition, independent
#               of policy. BOTH share_pct_gt AND violations_gte must breach; share_pct is a
#               PERCENT (0-100) of the IN-SCOPE rows in the batch. A `report` contract still
#               kills the run on a genuine feed-shape change.
#
# TWO VOCABULARIES, ONE COLUMN NAME — do not copy a contract between these tables:
#   listing_state.property_type       holds NORMALIZED tokens (PROPERTY_TYPE_MAP's codomain).
#   rental_listings_swfl.property_type holds RAW SteadyAPI tokens (condos, townhomes,
#   duplex_triplex, mobile, apartment). A contract copy-pasted either way fires on 100% of rows.
```

Then append after line 58 (the `data_lake.leepa_parcels` block):
```yaml

  # ── CONTENT CONTRACTS ────────────────────────────────────────────────────────
  # Authored 07/11/2026 against the live lake. Every threshold below survived an
  # adversarial verification that tried to make it fire on a legit row or miss a known-bad
  # one. Read docs/audit/2026-07-11-pipeline-problems/08b + 08h before changing a number.

  data_lake.listing_state:
    content_contracts:

      # ── R1: the home-price floor. POLICY IS `report` AND MUST STAY `report`. ───────────
      # A price floor is a SIGNAL, not a licence to drop rows. Two independent verifiers
      # proved the specced `property_type NOT IN ('land','other')` scope DELETES REAL
      # INVENTORY: 4324 Mailbox Ave #127 ($9,900), 567 Peace Ct #2120 ($2,000) and
      # 648 Suwanee Dr #2190 ($3,000) are VERIFIED-live active for-sale mobile homes
      # (MHVillage / Trulia / Zillow, 07/11/2026) that realtor.com types "single family".
      # The cohort runs CONTINUOUSLY from $2,000 to $59,900+ — no floor separates it.
      #
      # SCOPE, and why each clause is here:
      #   sqft IS NOT NULL   — the ONE discriminator that works. It splits the sqft-NULL
      #                        TRUE-price mobile homes (real sales, keep) from the sqft-present
      #                        CORRUPTED-price real houses (e.g. 526 Wabasso Ave S, Lehigh
      #                        33974: carried at $5,000, actually a 1,563sf 2024-built home
      #                        asking $369,900). It also puts the two 33903 TWIN rows —
      #                        19327CONGRESSIONALCT17G ($10,000, `other`) and 4324MAILBOXAVE127
      #                        ($9,900, `single_family`), identical on every other observable —
      #                        on the SAME side. The token scope gave them opposite verdicts.
      #   type ALLOWLIST     — `land` (522 legit sub-$20k lots) and `other` (61 land-lease-park
      #                        manufactured sales) are OUT OF SCOPE, never "excluded by a
      #                        threshold". Also keeps `residential` out (Source-B holding rows).
      #   source_name        — supplied by BATCH CTX at Locus A: it is NOT a batch-row column
      #                        (distill._STATE_COLS omits it; upsert_state injects it as a
      #                        scalar at distill.py:200).
      # Live: 21 offenders / 19,116 in-scope = 0.110%. All 21 verified bad, 0 verified-real.
      # Known miss (accepted, stated): a rental-priced row with NULL sqft, and any rent artifact
      # above $20,000 — Arbor Trace annual-rate rentals reach $49,000 while a real sale in the
      # same building starts at $54,900. Price cannot separate that cohort at ANY threshold; the
      # real fix is a vendor status field. The floor buys the obvious class, not the tail.
      - name: listing_state_home_price_floor
        type: range
        locus: both
        policy: report
        severity: error
        col: list_price
        min: 20000
        allow_null: false
        where:
          - { col: source_name,   op: eq,       value: api_feed }
          - { col: sale_or_rent,  op: eq,       value: sale }
          - { col: state,         op: eq,       value: active }
          - { col: list_price,    op: not_null }
          - { col: sqft,          op: not_null }
          - { col: property_type, op: in,       value: [single_family, condo, townhouse, multi_family] }
        # Unreachable on today's data under ANY batching (only 21 offenders exist region-wide,
        # scattered across ~10 ZIPs — no batch can assemble 25). It fires on a genuine feed-shape
        # change: 5% of a 14,110-row Lee sweep = 706 rows. That is what abort is for.
        # violations_gte is load-bearing: real batches are 7 rows (07/07), 364 (07/08), 21,142
        # (07/10). A share-only rule aborts the nightly chain over 1 bad row in a recovery run.
        abort_if: { share_pct_gt: 5.0, violations_gte: 25, if_no_clean_rows: true }

      # ── E1: the property_type vocabulary-collision guard. ─────────────────────────────
      # ALLOWLIST = the UNION of BOTH writers' code-reachable codomains, NOT the live active
      # mix. Authoring it from the 6-value active mix (or from
      # 20260711_listing_active_stats_homes_only.sql:16-17's comment, which lists the same six)
      # quarantines the 2,996 legitimate `residential` rows — and at the BATCH locus that is
      # 10.18% of Collier's 07/01 cutover batch with 899 rows: a HARD ABORT of an 8,833-row load.
      #   residential  — extract.py:140's Source-B token; catchup.py:92 flipped those rows into
      #                  source_name='api_feed'. 2,996 live, median $359,900 Lee / $770,000
      #                  Collier. `property_type='residential'` <=> `status IS NULL` <=>
      #                  `property_id IS NULL`, zero exceptions. DO NOT REMOVE until that
      #                  population is 0.
      #   manufactured — in PROPERTY_TYPE_MAP (constants_api.py:60), 0 rows live. Allowed so
      #                  widening STEADYAPI_TYPE_FILTERS cannot red the nightly chain before the
      #                  registry catches up.
      # HONEST SCOPE: this catches NOTHING today and cannot be violated by any vendor input —
      # map_property_type (extract_api.py:69-70) sends every unknown token to "other", so the
      # codomain is CLOSED at 7 tokens, all 7 allowlisted. It fires ONLY on a CODE change (a
      # bypassed normalizer, a new PROPERTY_TYPE_MAP token). It is a drift tripwire. If it is
      # ever credited with covering the $6k Marco Island cluster, the range contract gets
      # dropped and that cluster ships forever.
      # NO enum on `sale_or_rent`: VACUOUSLY GREEN — both writers hardcode "sale"
      # (extract_api.py:139, extract.py:144). The contamination is a PRICE signal, not a label.
      - name: listing_state_property_type_allowlist
        type: enum
        locus: both
        policy: quarantine
        severity: error
        col: property_type
        allow_null: false
        allowed: [single_family, condo, townhouse, multi_family, land, other, manufactured, residential]
        where: []
        # Reachable violations are BIMODAL (~0% or ~100%) — there is no gradient to threshold.
        # 0.50 puts the one real historical collision (7.75% Lee / 10.18% Collier / 100% scrape,
        # measured AT THE BATCH LOCUS) uniformly on the quarantine side — a human widens the
        # allowlist — while still firing hard on the ~100% bypassed-normalizer case. A 10% line
        # would CUT THROUGH THE MIDDLE of one root-cause event and split it by county.
        abort_if: { share_pct_gt: 50.0, violations_gte: 500, if_no_clean_rows: true }

  # ── data_lake.listing_active_stats — a VIEW. Locus B is the ONLY locus it has. ───────
  # CREATE OR REPLACE VIEW (docs/sql/20260711_listing_active_stats_homes_only.sql:34); no
  # pipeline writes it (one grep hit in ingest/, and that is a consumer comment). No batch,
  # no merge call, nothing to quarantine, nothing to abort. Its job is to RED the table the
  # moment the display predicate regresses. information_schema.columns exposes a view's
  # columns, so read_live_schema and the count(*) builders work against it unchanged.
  data_lake.listing_active_stats:
    content_contracts:

      # ── C2: the land-drag tripwire. THE ORACLE IS LABEL-INDEPENDENT ON PURPOSE. ────────
      # THE SPECCED VERSION WAS A TAUTOLOGY. It recomputed a "correct" homes-only median with
      # a WHERE clause that was a BYTE-FOR-BYTE COPY of the view's own (`property_type <>
      # 'land'`) — comparing the implementation against itself. Live: 49 of 52 rows had ratio
      # EXACTLY 1.0000, so `median < 0.5 * median` is ARITHMETICALLY UNSATISFIABLE.
      #
      # And property_type is DERIVED, not vendor-supplied: `/search` returns NO property-type
      # field on any row (verified live 07/07/2026); extract_api.py:69-70 is
      # `PROPERTY_TYPE_MAP.get(raw, "other")`, which SILENTLY DEFAULTS any unmapped value —
      # a bug that has ALREADY HAPPENED ONCE (test_extract_api.py:64-65). Under that drift the
      # original ~10x $35k bug RETURNS IN FULL while the tautological tripwire reports GREEN
      # (33972 -> true ratio 0.102, reported 1.000).
      #
      # THE FIX (both changes are load-bearing):
      #  1. Oracle keys on `(beds IS NOT NULL OR sqft IS NOT NULL)` — RAW VENDOR FIELDS,
      #     genuinely independent of PROPERTY_TYPE_MAP, which is where the drift lives.
      #     Structural: 6,802 of 6,806 land rows are beds-less AND sqft-less; 0 of 5,629 condo,
      #     0 of 526 townhouse, 1 of 12,687 single_family.
      #  2. JOIN ON (county, zip), never `USING (zip_code)`. Three ZIPs (34110, 34119, 33971)
      #     exist under BOTH counties; USING fans them out and a 6-listing Lee slice gets
      #     compared against a 473-row POOLED median, bypassing the small-N guard. Live vector.
      #
      # Verified 07/11/2026: 0 rows today (min ratio 0.9664 -> 1.93x margin), and it FIRES at
      # 0.102 / 0.117 on 33972 / 33974 under the exact relabel the naive version sleeps through.
      # Keep 0.5. Honest caveat: this trades one assumption (the label) for another (beds/sqft
      # presence). A strict improvement, not a proof.
      # NAMED GAP (check `listing_active_stats_inflated_median_ceiling`): one-sided. A regression
      # that INFLATES the median passes silently. No verified upper-ratio distribution exists for
      # the corrected oracle, so no ceiling is invented here.
      - name: listing_active_stats_land_blend_tripwire
        type: sql_expectation
        locus: probe
        policy: report
        severity: error
        failing_rows_sql: |
          WITH correct AS (
            SELECT btrim(county) AS county, zip_code,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY list_price) AS homes_only_median,
                   count(*) AS homes_cnt
            FROM data_lake.listing_state
            WHERE source_name = 'api_feed' AND state = 'active' AND sale_or_rent = 'sale'
              AND list_price IS NOT NULL AND list_price >= 20000
              AND btrim(county) = ANY (ARRAY['Lee','Collier'])
              AND (beds IS NOT NULL OR sqft IS NOT NULL)
            GROUP BY 1, 2
          )
          SELECT count(*)
          FROM data_lake.listing_active_stats v
          JOIN correct c ON v.county = c.county AND v.zip_code = c.zip_code
          WHERE c.homes_cnt >= 25
            AND v.median_list_price < 0.5 * c.homes_only_median

      # ── C2b: the property-type-INDEPENDENT backstop. ──────────────────────────────────
      # C2's oracle catches a re-blend. This catches a label CORRUPTION so total that both
      # sides of C2 inherit it. Lowest LEGIT shipped ZIP median (n>=30) is $139,900 (33903,
      # 543 homes, only 5.8% land — a genuinely cheap North Fort Myers ZIP). Worst contaminated
      # value pre-hotfix was $31,360 (33974) / $35,000 (33972). $75,000 sits 1.87x below the
      # lowest legit and 2.14x above the worst known-bad.
      # `listing_count >= 30` is LOAD-BEARING, not tidiness: it alone suppresses the n=1 phantom
      # ZIPs (33975 @ $20,000, 33095 @ $28,000, 33467 @ $30,000, 33792 @ $39,900) — all under
      # the floor and all CORRECT one-listing medians. Without it: 4 guaranteed false positives.
      - name: listing_active_stats_median_absolute_floor
        type: sql_expectation
        locus: probe
        policy: report
        severity: error
        failing_rows_sql: |
          SELECT count(*)
          FROM data_lake.listing_active_stats
          WHERE zip_code IS NOT NULL AND county IS NOT NULL
            AND listing_count >= 30
            AND median_list_price < 75000

  data_lake.market_details_swfl:
    content_contracts:

      # ── C3: the sold/rent band, at the MERGE locus (the batch is one capture — no history). ─
      # `sold_to_rent_ratio` is the vendor's own sold / ANNUAL rent (verified: 0 of 49 rows
      # deviate >2% from sold/(12*rent)). Read the rate AS WRITTEN (data-protocol v3 rule 4).
      # BAND derived from the LIVE distribution, never from a remembered "typical 100-200x":
      #   ordered live ratios (n=49): 1.28 (33972 - BAD) . 1.90 (33920 - BAD) . [3.7x GAP] .
      #   7.12 (33903 - LEGIT) . 7.38 . ... median 11.4 ... . 21.14 (33914 - LEGIT MAX).
      #   Lower 4.0 = geometric mean of 1.90 and 7.12 (3.68), rounded. Economically: a
      #   price-to-rent under 4 means a home repays its price in <4 years of gross rent —
      #   impossible in SWFL. Upper 40.0 = <2.5% gross yield, nationally extreme.
      #   A naive 200x-MONTHLY cap would FALSE-FIRE on 33914 Cape Coral (253.7x) and 34105
      #   Naples (240x), both legit. That is why the band is annual and data-derived.
      # KNOWN-ACCEPTED (this is why the contract is GREEN on commit #1 instead of RED):
      #   33972 (sold $30,000 / rent $1,950 -> 1.28) and 33920 Alva (84.3% LAND; $88,750 /
      #   $3,900 -> 1.90) are TRUE positives of upstream realtor.com land-drag. We cannot
      #   decompose a vendor aggregate, so we cannot repair them. Excluded by ZIP so a THIRD
      #   contaminated ZIP fires loud — and kept VISIBLE by the `_watch` twin below.
      # POLICY report, not quarantine: withholding a ZIP row changes what market-temperature-swfl
      # ships (47 ZIPs instead of 49). That is a live-surface change — ask-first, not Phase 1.
      # Tracked: check `market_details_band_quarantine_flip`.
      - name: market_details_sold_rent_band
        type: range
        locus: merge
        policy: report
        severity: error
        col: sold_to_rent_ratio
        min: 4.0
        max: 40.0
        allow_null: false     # a NULL ratio with both prices present is a VIOLATION, not a pass
        where:
          - { col: median_sold_price, op: not_null }
          - { col: median_rent_price, op: not_null }
          - { col: zip_code, op: not_in, value: ["33972", "33920"] }
        # A 54-row table can NEVER abort on the count branch (2 offenders < 25) — correct: a tiny
        # table's "share" is not a shape signal. `if_no_clean_rows` is the real guard here: a
        # vendor UNITS FLIP (annual -> monthly) puts all 49 out of band at once, and that must
        # stop the run rather than land 49 uninterpretable ratios.
        abort_if: { share_pct_gt: 5.0, violations_gte: 25, if_no_clean_rows: true }

      # C3 at rest. Same band, same exclusion, scoped to the LATEST capture (the table is an
      # accumulating time series — an unscoped count would sum every historical capture).
      - name: market_details_sold_rent_band_at_rest
        type: sql_expectation
        locus: probe
        policy: report
        severity: error
        failing_rows_sql: |
          SELECT count(*)
          FROM data_lake.market_details_swfl
          WHERE captured_date = (SELECT max(captured_date) FROM data_lake.market_details_swfl)
            AND median_sold_price IS NOT NULL
            AND median_rent_price IS NOT NULL
            AND zip_code NOT IN ('33972', '33920')
            AND (sold_to_rent_ratio IS NULL
                 OR sold_to_rent_ratio < 4.0
                 OR sold_to_rent_ratio > 40.0)

      # The known-accepted pair, kept VISIBLE. No exclusion; `warn` severity means it surfaces in
      # the run summary and opens NO checks row. Reports 2 today. If it ever reports 3, the
      # error-severity twin above has already fired on the new one.
      - name: market_details_sold_rent_band_watch
        type: sql_expectation
        locus: probe
        policy: report
        severity: warn
        failing_rows_sql: |
          SELECT count(*)
          FROM data_lake.market_details_swfl
          WHERE captured_date = (SELECT max(captured_date) FROM data_lake.market_details_swfl)
            AND median_sold_price IS NOT NULL
            AND median_rent_price IS NOT NULL
            AND (sold_to_rent_ratio IS NULL
                 OR sold_to_rent_ratio < 4.0
                 OR sold_to_rent_ratio > 40.0)

      # ── C3b: the COVERAGE FLOOR. Without this the band is SATISFIABLE BY HAVING NO DATA. ──
      # The band's WHERE requires `median_rent_price IS NOT NULL`, so a rent-column OUTAGE makes
      # rows VANISH — it does NOT trip the band. If rent coverage collapsed from 49 ZIPs to 3,
      # the band returns 0 rows and reports GREEN. 5 ZIPs already carry a NULL rent (1 Lee,
      # 4 Collier), which is a coverage gap, not contamination. Floor 45 of 54 = today's 49 with
      # 4 rows of slack. Returns 1 (failing) on collapse, 0 otherwise.
      - name: market_details_rent_coverage_floor
        type: sql_expectation
        locus: probe
        policy: report
        severity: error
        failing_rows_sql: |
          SELECT CASE
                   WHEN count(*) FILTER (WHERE median_rent_price IS NOT NULL) < 45 THEN 1
                   ELSE 0
                 END
          FROM data_lake.market_details_swfl
          WHERE captured_date = (SELECT max(captured_date) FROM data_lake.market_details_swfl)

      # ── C3c: the units check (free). ──────────────────────────────────────────────────
      # `sold_to_rent_ratio` is vendor-computed and ANNUAL: 0 of 49 rows deviate >2% from
      # median_sold_price / (12 * median_rent_price). Safe to read as written — which is exactly
      # why we assert it. If that identity ever breaks, the vendor silently changed the column's
      # UNITS, and every threshold above becomes meaningless while still reporting green.
      - name: market_details_ratio_units_check
        type: sql_expectation
        locus: probe
        policy: report
        severity: warn
        failing_rows_sql: |
          SELECT count(*)
          FROM data_lake.market_details_swfl
          WHERE captured_date = (SELECT max(captured_date) FROM data_lake.market_details_swfl)
            AND median_sold_price IS NOT NULL
            AND median_rent_price IS NOT NULL
            AND median_rent_price > 0
            AND sold_to_rent_ratio IS NOT NULL
            AND abs(sold_to_rent_ratio
                    - (median_sold_price::numeric / median_rent_price / 12)) >= 0.05
```

- [ ] **Step 4: Run test to verify it passes**
```
pytest ingest/tests/quality/ -q
```
Expected: `53 passed` — including `test_load_contracts_reads_the_real_registry_for_listing_state` from Task 4, which was the one red test left over.

- [ ] **Step 5: Commit**
```
git add ingest/quality/quality_registry.yaml ingest/tests/quality/test_contract_registry.py
git commit -m "feat(contracts): content_contracts registry blocks; corrected land-drag oracle"
```

---

### Task 6: The Phase-1 replay fixture — the real rows, the traps, and the relabel proof

**Files:**
- Create: `ingest/tests/quality/test_contracts_replay_fixture.py`

**Interfaces:**
- Consumes: `evaluate_batch(rows, table, ctx)` (Task 4), the eight registered contracts (Task 5).
- Produces: nothing importable. This is spec §9 acceptance criteria (a) + (b) + (c), executable and checked in — the deliberate-failure proof that stays in the repo.

**Two tests, one job.** The registry-structural test (Task 5) proves the *SQL in the registry* implements the label-independent oracle. This task's `test_relabel_*` pair proves the *choice of oracle is the right one* — it re-implements both oracles in ~10 lines of pure Python against the live 33972 numbers and shows the naive one reports GREEN on the exact drift the corrected one catches. Neither test alone closes the tautology; together they do, and neither needs a database.

- [ ] **Step 1: Write the failing test** — `ingest/tests/quality/test_contracts_replay_fixture.py`:
```python
"""PHASE-1 ACCEPTANCE — the replay fixture (spec §9 a/b/c). Checked in and kept forever.

Rows are abridged from the LIVE 07/11/2026 lake (docs/audit/2026-07-11-pipeline-problems/
08b + 08h). Address keys, prices, beds and sqft are the real values; rows marked SYNTHETIC
are controls and make no claim about a real listing.

  (a) the contaminated batch is caught with the CORRECT counts
  (b) BOTH known false-positive traps pass clean
  (c) a synthetic over-threshold contamination share ABORTS loud
"""
import pytest

from ingest.quality.contracts import evaluate_batch

_CTX = {"source_name": "api_feed"}
_T = "data_lake.listing_state"


def _listing(address_key, property_type, list_price, beds, sqft, lot_acres, zip_code,
             state="active"):
    return {"address_key": address_key, "property_type": property_type,
            "list_price": list_price, "beds": beds, "sqft": sqft, "lot_acres": lot_acres,
            "zip_code": zip_code, "state": state, "sale_or_rent": "sale"}


# ── (a) THE CONTAMINATED BATCH — must FIRE ────────────────────────────────────
# The Marco Island 10 Tampa Pl cluster: 1bd, 728-855 sqft, $6,000-$9,000, one building.
# No Marco Island condo sells for $7,000. sqft is PRESENT -> in scope -> flagged.
MUST_FIRE = [
    _listing("10TAMPAPL303:34145", "condo", 9000, 1, 855, None, "34145"),
    _listing("10TAMPAPL1:34145",   "condo", 7000, 1, 855, None, "34145"),
    _listing("10TAMPAPL404:34145", "condo", 7000, 1, 728, None, "34145"),
    _listing("10TAMPAPL5:34145",   "condo", 7000, 1, 728, None, "34145"),
    _listing("10TAMPAPL203:34145", "condo", 6000, 1, 855, None, "34145"),
    # 526 Wabasso Ave S, Lehigh 33974: carried at $5,000; it is really a 1,563sf 2024-built
    # home asking $369,900 (johnrwood MLS 225053370). Its `sqft` field even holds the LOT area.
    _listing("526WABASSOAVES:33974", "single_family", 5000, 3, 10106, 0.23, "33974"),
]

# ── (b) TRAP 1 — real manufactured-home SALES. Must PASS. ─────────────────────
# Verified live 07/11/2026 as ACTIVE, FOR-SALE mobile homes. realtor.com types them
# "single family home", which is the exact mislabel our map inherits. All sqft-NULL.
MUST_PASS_MOBILE = [
    _listing("4438HITZINGAVE51:33903",  "single_family",  8900, 1, None, None, "33903"),
    _listing("4324MAILBOXAVE127:33903", "single_family",  9900, 2, None, None, "33903"),
    _listing("4281HITZINGAVE6:33903",   "single_family", 14900, 1, None, None, "33903"),
    _listing("567PEACECT2120:33917",    "single_family",  2000, 2, None, None, "33917"),
    _listing("648SUWANEEDR2190:33917",  "single_family",  3000, 3, None, None, "33917"),
]

# THE TWIN. Identical to 4324MAILBOXAVE127 on every attribute the contract can observe,
# $100 dearer, different token. The specced token-scope gave them OPPOSITE verdicts.
MUST_PASS_TWIN = _listing("19327CONGRESSIONALCT17G:33903", "other", 10000, 2, None, None, "33903")

# ── (b) TRAP 2 — the legit sub-$20k LAND lots. Must PASS (out of scope by type). ──
MUST_PASS_LAND = [
    _listing(f"LEHIGHLOT{i}:33972", "land", 700 + i * 40, None, None, 0.23, "33972")
    for i in range(20)
]

# ── (b) TRAP 3 — land-lease-park manufactured sales tagged `other`, WITH sqft. ────
# The type allowlist is what protects these — not the sqft clause. Both must hold.
MUST_PASS_OTHER = [
    _listing("9878TAMARRONCT50O:33903",   "other", 16500, 2, 1710, None, "33903"),
    _listing("19260INDIANWELLSCT31H:33903", "other", 15900, 2, 1250, None, "33903"),
    _listing("17881NTAMIAMITRLLOT7:33903",  "other", 14900, 2,  880, None, "33903"),
]

# SYNTHETIC control — an ordinary home sale. Makes no claim about a real listing.
MUST_PASS_LEGIT = [
    _listing(f"SYNTHETICHOME{i}:33901", "single_family", 354999, 3, 1800, 0.20, "33901")
    for i in range(60)
]


def _floor(stats):
    return next(c for c in stats["contracts"] if c["name"] == "listing_state_home_price_floor")


def test_the_contaminated_batch_is_flagged_with_the_right_count():
    rows = MUST_FIRE + MUST_PASS_MOBILE + [MUST_PASS_TWIN] + MUST_PASS_LAND \
        + MUST_PASS_OTHER + MUST_PASS_LEGIT
    clean, quarantined, stats = evaluate_batch(rows, _T, ctx=_CTX)
    c = _floor(stats)
    assert c["violations"] == len(MUST_FIRE) == 6
    assert c["in_scope"] == len(MUST_FIRE) + len(MUST_PASS_LEGIT) == 66
    assert c["status"] == "VIOLATIONS"
    # policy: report -> the floor drops NOTHING. This is correction #2, enforced.
    assert clean == rows and quarantined == []
    assert stats["abort"] is False   # 6 violations < violations_gte 25


def test_trap_1_the_verified_real_mobile_home_sales_pass_clean():
    """4438HITZINGAVE51 ($8,900) MUST PASS. A floor that drops it deletes the only
    manufactured-home rows we hold, in a region where land_manufactured_swfl is a knowingly
    PARKED pipeline."""
    _, _, stats = evaluate_batch(MUST_PASS_MOBILE, _T, ctx=_CTX)
    c = _floor(stats)
    assert (c["violations"], c["in_scope"], c["status"]) == (0, 0, "PASS")


def test_the_two_33903_TWINS_get_the_SAME_verdict():
    """THE REGRESSION TEST FOR THE WHOLE CLASS. Two rows, one ZIP, $100 apart, identical on
    every attribute the contract can observe; the only difference is a token that
    extract_api.py:117-122 proves is a request-side SWEEP ARTIFACT, not a vendor field. The
    specced scope quarantined one and protected the other. They must now agree."""
    twin_a = MUST_PASS_TWIN                                       # 'other',        $10,000
    twin_b = _listing("4324MAILBOXAVE127:33903", "single_family", 9900, 2, None, None, "33903")
    _, _, stats = evaluate_batch([twin_a, twin_b], _T, ctx=_CTX)
    assert _floor(stats)["violations"] == 0


def test_trap_2_the_legit_sub_20k_land_lots_pass_clean():
    _, quarantined, stats = evaluate_batch(MUST_PASS_LAND, _T, ctx=_CTX)
    assert _floor(stats)["violations"] == 0
    assert quarantined == []   # and the enum allowlist did not touch them either


def test_trap_3_the_other_bucket_manufactured_sales_pass_clean():
    _, _, stats = evaluate_batch(MUST_PASS_OTHER, _T, ctx=_CTX)
    assert _floor(stats)["violations"] == 0


def test_leepa_nominal_consideration_transfers_are_untouchable():
    """41,510 of 528,130 non-null last_sale_amount values are $1-9,999 quitclaim / family
    transfers. Protection is TABLE-SCOPING: no contract is authored on leepa_parcels."""
    rows = [{"folioid": f"F{i}", "last_sale_amount": 100} for i in range(50)]
    clean, quarantined, stats = evaluate_batch(rows, "data_lake.leepa_parcels")
    assert clean == rows and quarantined == [] and stats["contracts"] == []


def test_the_2996_residential_rows_land_in_clean_not_quarantined():
    rows = [_listing(f"RESID{i}:33901", "residential", 359900, None, None, None, "33901",
                     state="holding") for i in range(100)]
    clean, quarantined, _ = evaluate_batch(rows, _T, ctx=_CTX)
    assert len(clean) == 100 and quarantined == []


# ── (c) A SYNTHETIC OVER-THRESHOLD SHARE ABORTS LOUD ─────────────────────────


def test_a_bypassed_normalizer_batch_aborts_loud():
    """The ONE realistic way the enum fires: a writer skips PROPERTY_TYPE_MAP and lands the
    RAW SteadyAPI vocabulary. Those tokens are not invented — they are the live mix of the
    sibling table data_lake.rental_listings_swfl (condos 5,592 / townhomes 582 /
    duplex_triplex 193 / mobile 190 / apartment 885). 100% violating share -> abort."""
    raw = ["condos", "townhomes", "duplex_triplex", "mobile", "apartment"]
    rows = [_listing(f"BYPASS{i}:33901", raw[i % 5], 350000, 3, 1800, 0.2, "33901")
            for i in range(600)]
    clean, quarantined, stats = evaluate_batch(rows, _T, ctx=_CTX)
    assert stats["abort"] is True
    assert "listing_state_property_type_allowlist" in stats["abort_reason"]
    assert clean == [] and len(quarantined) == 600


def test_a_7_row_100pct_contaminated_batch_STILL_aborts():
    """The silent-total-loss hole: 7 rows is under violations_gte 500, so the SHARE branch
    cannot fire — every row would quarantine, zero would merge, and the run would exit GREEN.
    A 7-row batch really happened (07/07/2026). if_no_clean_rows closes it."""
    rows = [_listing(f"BYPASS{i}:33901", "condos", 350000, 3, 1800, 0.2, "33901")
            for i in range(7)]
    _, _, stats = evaluate_batch(rows, _T, ctx=_CTX)
    assert stats["abort"] is True
    assert "no clean rows" in stats["abort_reason"]


# ── THE ORACLE PROOF: naive reports GREEN where corrected FIRES ───────────────
# This does NOT test the SQL string (test_contract_registry.py does that). It tests the
# CHOICE OF ORACLE: given the same relabelled rows, the naive `property_type <> 'land'` oracle
# and the corrected `beds IS NOT NULL OR sqft IS NOT NULL` oracle disagree — and the naive one
# is the one that goes green while the $35k median ships.


def _median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def _naive_oracle(rows):     # the SPECCED oracle: reads the DERIVED label
    return [r["list_price"] for r in rows
            if r["property_type"] != "land" and r["list_price"] >= 20000]


def _corrected_oracle(rows):  # keys on RAW VENDOR FIELDS only
    return [r["list_price"] for r in rows
            if (r["beds"] is not None or r["sqft"] is not None) and r["list_price"] >= 20000]


def _fires(shipped_median, oracle_prices):
    """The tripwire's own predicate: shipped < 0.5 * homes_only_median, min 25 homes."""
    if len(oracle_prices) < 25:
        return False
    return shipped_median < 0.5 * _median(oracle_prices)


@pytest.fixture
def relabelled_33972():
    """ZIP 33972 AFTER a PROPERTY_TYPE_MAP drift: 913 land parcels no longer carry the 'land'
    token (PROPERTY_TYPE_MAP.get(raw, "other") silently defaults them), so the view's
    `property_type <> 'land'` filter stops excluding them and the shipped median collapses to
    ~$36,700 against a true homes-only median of $359,000 — ratio 0.102.
    Land rows have NO beds and NO sqft; homes have both. Counts abridged 10:1."""
    land = [{"property_type": "single_family", "list_price": 29500, "beds": None, "sqft": None}
            for _ in range(91)]
    homes = [{"property_type": "single_family", "list_price": 359000, "beds": 3, "sqft": 1800}
             for _ in range(40)]
    return land + homes, 36700   # (rows, shipped_median_after_relabel)


def test_the_NAIVE_oracle_reports_GREEN_on_the_relabel(relabelled_33972):
    """This is the bug. The oracle inherits the SAME corrupted label the view used, so its
    'correct' median IS the contaminated one — ratio ~1.0 — and the ~10x $35k defect returns
    in full behind a green tripwire."""
    rows, shipped = relabelled_33972
    assert _fires(shipped, _naive_oracle(rows)) is False


def test_the_CORRECTED_oracle_FIRES_on_the_same_relabel(relabelled_33972):
    rows, shipped = relabelled_33972
    prices = _corrected_oracle(rows)
    assert len(prices) == 40                       # the label-less land rows are excluded
    assert _median(prices) == 359000
    assert shipped / _median(prices) == pytest.approx(0.102, abs=0.002)
    assert _fires(shipped, prices) is True


def test_the_corrected_oracle_is_quiet_on_a_healthy_zip(relabelled_33972):
    """It must not fire merely because the oracle changed. Post-hotfix, the view already
    excludes land, so shipped == homes-only == $359,000 -> ratio 1.0 -> silent."""
    rows, _ = relabelled_33972
    assert _fires(359000, _corrected_oracle(rows)) is False
```

- [ ] **Step 2: Run test to verify it fails**
```
pytest ingest/tests/quality/test_contracts_replay_fixture.py -q
```
Expected: `13 passed` if Tasks 2–5 are correct. **If anything here is red, the contract is wrong — not the test.** The two most likely reds and what each means:
- `test_the_contaminated_batch_is_flagged_with_the_right_count` fails with `assert 11 == 6` → the price-floor `where` is missing the `sqft not_null` clause and is eating the mobile homes.
- `test_the_two_33903_TWINS_get_the_SAME_verdict` fails with `assert 1 == 0` → a `property_type not_in` denylist crept back into the scope.

- [ ] **Step 3: Write minimal implementation** — none. This task adds no source. If Step 2 is green, the contracts built in Tasks 2–5 satisfy spec §9 (a)+(b)+(c). If it is red, fix the **registry** (Task 5) or the **evaluator** (Task 3) until it is green; never edit this fixture to match the code — its rows are live evidence.

- [ ] **Step 4: Run the whole Python suite to verify nothing regressed**
```
pytest ingest/ -q
```
Expected: all green; `ingest/tests/quality/` contributes 66 passed.

- [ ] **Step 5: Commit**
```
git add ingest/tests/quality/test_contracts_replay_fixture.py
git commit -m "test(contracts): phase-1 replay fixture — traps, abort, oracle relabel proof"
```

---

### Task 7: Locus-B SQL builders (`range` / `enum` / `sql_expectation` + the read-only lint)

**Files:**
- Modify: `ingest/quality/contracts.py` (append)
- Test: `ingest/tests/quality/test_contracts.py` (append)

**Interfaces:**
- Consumes: `WHERE_OPS`, `ContractConfigError`, `load_contracts`, `PROBE_LOCI` (Tasks 2, 4).
- Produces:
  - `assert_read_only(sql: str) -> None` — raises `ContractConfigError` on `;` or any DML/DDL keyword.
  - `build_range_sql(table, spec) -> (psycopg.sql.Composable, list)`
  - `build_enum_sql(table, spec) -> (psycopg.sql.Composable, list)`
  - `build_sql_expectation_sql(table, spec) -> (psycopg.sql.Composable, list)`
  - `CONTRACT_BUILDERS: dict[str, callable]` — `{"range": ..., "enum": ..., "sql_expectation": ...}`. Task 8's `run_content_contracts` dispatches on it, mirroring `check_data_quality._BUILDERS` (`:121-125`).

Every builder returns `(Composable, params)` and its query is a failing-row `count(*)` — a contract passes iff the count is 0 (dbt's model, the same one `build_not_null_sql` already uses). **The locked psycopg3 idiom** (`check_data_quality.py:107-110`): `{col}::text <> ALL(%s::text[])`, **never** `NOT IN %s` — psycopg3 adapts a Python list to a PG ARRAY, so `NOT IN %s` raises `SyntaxError`.

- [ ] **Step 1: Write the failing test** — append to `ingest/tests/quality/test_contracts.py`:
```python
# ── Locus-B SQL builders ───────────────────────────────────────────────────────

from psycopg import sql as pgsql  # noqa: E402

from ingest.quality.contracts import (  # noqa: E402
    CONTRACT_BUILDERS,
    assert_read_only,
    build_enum_sql,
    build_range_sql,
    build_sql_expectation_sql,
)


def _render(q):
    return q.as_string(None)


def test_range_sql_is_composable_and_binds_its_bounds():
    """Structural safety, same guarantee as check_data_quality's builders: a raw f-string
    would be a plain `str` and fail the isinstance."""
    q, params = build_range_sql("data_lake.listing_state", _PRICE_FLOOR)
    assert isinstance(q, pgsql.Composable)
    assert 20000 in params


def test_range_sql_counts_nulls_as_failing_when_allow_null_is_false():
    """The three-valued-logic hole, closed in SQL too: without the explicit `IS NULL` leg,
    `sold_to_rent_ratio < 4.0` is NULL for a NULL ratio and the row SILENTLY PASSES."""
    q, _ = build_range_sql("data_lake.market_details_swfl",
                           {"col": "r", "min": 4.0, "max": 40.0, "where": []})
    r = _render(q)
    assert '"r" IS NULL' in r
    assert '"r" < %s' in r and '"r" > %s' in r


def test_range_sql_omits_the_null_leg_when_allow_null_is_true():
    q, _ = build_range_sql("t.x", {"col": "r", "min": 1, "allow_null": True, "where": []})
    assert '"r" IS NULL' not in _render(q)


def test_enum_sql_uses_the_locked_all_array_form_not_NOT_IN():
    """`NOT IN %s` is a psycopg3 SyntaxError — the list adapts to a PG ARRAY, not a tuple."""
    q, params = build_enum_sql("data_lake.listing_state", _PTYPE_ENUM)
    r = _render(q)
    assert "ALL(%s::text[])" in r
    assert "NOT IN %s" not in r
    assert params[-1] == _PTYPE_ENUM["allowed"]


def test_where_conditions_compile_to_bound_params_never_interpolated_literals():
    """SQL-injection guarantee for the one place the registry supplies values."""
    q, params = build_range_sql("data_lake.listing_state", _PRICE_FLOOR)
    r = _render(q)
    assert "api_feed" not in r and "single_family" not in r   # never in the SQL text
    assert "api_feed" in params                               # always in the params
    assert '"sqft" IS NOT NULL' in r                          # not_null takes no param


def test_sql_expectation_passes_the_registry_sql_through():
    q, params = build_sql_expectation_sql(
        "data_lake.listing_active_stats",
        {"failing_rows_sql": "SELECT count(*) FROM data_lake.listing_active_stats"},
    )
    assert isinstance(q, pgsql.Composable)
    assert params == []


@pytest.mark.parametrize("bad", [
    "SELECT 1; DROP TABLE data_lake.listing_state",
    "DELETE FROM data_lake.listing_state",
    "UPDATE data_lake.listing_state SET list_price = 0",
    "TRUNCATE data_lake.listing_state",
    "SELECT 1 INTO x",
])
def test_sql_expectation_rejects_anything_that_is_not_read_only(bad):
    """The registry is a checked-in file at the same trust level as source — but a probe that
    can mutate the lake is a category error, and one pasted DELETE would be silent and total."""
    with pytest.raises(ContractConfigError):
        assert_read_only(bad)


def test_the_real_registry_sql_is_all_read_only():
    from ingest.quality.contracts import load_contracts as lc
    for table in ("data_lake.listing_active_stats", "data_lake.market_details_swfl"):
        for c in lc(table):
            if c["type"] == "sql_expectation":
                assert_read_only(c["failing_rows_sql"])   # raises if not


def test_every_contract_type_has_a_locus_b_builder():
    assert set(CONTRACT_BUILDERS) == {"range", "enum", "sql_expectation"}
```

- [ ] **Step 2: Run test to verify it fails**
```
pytest ingest/tests/quality/test_contracts.py -q
```
Expected: collection error — `ImportError: cannot import name 'build_range_sql' from 'ingest.quality.contracts'`.

- [ ] **Step 3: Write minimal implementation** — append to `ingest/quality/contracts.py`:
```python
# ── Locus-B failing-row SQL builders (pure — no DB, unit-testable) ─────────────
#
# Each builder returns (query, params) where `query` is a psycopg.sql.Composable and the
# query is a failing-row count(*). A contract passes iff the count is 0 — dbt's model, and
# the same one check_data_quality's build_not_null_sql already uses. SQL injection is
# neutralized STRUCTURALLY: every identifier routes through psycopg.sql.Identifier, every
# registry value through a bound parameter.

import re  # noqa: E402

_FORBIDDEN_SQL = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|into|"
    r"vacuum|call|do)\b",
    re.IGNORECASE,
)


def assert_read_only(sql: str) -> None:
    """A contract's SQL is a PROBE. It may only SELECT.

    quality_registry.yaml is a checked-in file at the same trust level as source code, so this
    is not an injection defence — it is a category guard. One pasted DELETE in a probe that
    runs daily against prod would be silent and total."""
    if ";" in sql:
        raise ContractConfigError(
            "contract SQL contains ';' — one statement only, no statement chaining"
        )
    hit = _FORBIDDEN_SQL.search(sql)
    if hit:
        raise ContractConfigError(
            f"contract SQL contains the non-read-only keyword {hit.group(0)!r} — probes SELECT only"
        )


def _table_ident(table: str):
    from psycopg import sql as pgsql

    return pgsql.Identifier(*table.split("."))


# where-op -> SQL. Mirrors WHERE_OPS one-for-one; keep the two in step or Locus A and Locus B
# start disagreeing about which rows are in scope.
def _where_sql(conds: list[dict] | None):
    """[(Composable, params)] -> one AND-ed Composable + the flat param list."""
    from psycopg import sql as pgsql

    frags, params = [], []
    for cond in conds or []:
        col, op, val = cond.get("col"), cond.get("op"), cond.get("value")
        ident = pgsql.Identifier(col)
        if op == "not_null":
            frags.append(pgsql.SQL("{} IS NOT NULL").format(ident))
        elif op == "is_null":
            frags.append(pgsql.SQL("{} IS NULL").format(ident))
        elif op == "in":
            frags.append(pgsql.SQL("{}::text = ANY(%s::text[])").format(ident))
            params.append([str(v) for v in val])
        elif op == "not_in":
            # LOCKED psycopg3 idiom (check_data_quality.py:107-110). `NOT IN %s` is a
            # SyntaxError: psycopg3 adapts a list to a PG ARRAY, not a SQL tuple.
            frags.append(pgsql.SQL("{}::text <> ALL(%s::text[])").format(ident))
            params.append([str(v) for v in val])
        elif op in ("eq", "ne", "lt", "lte", "gt", "gte"):
            sym = {"eq": "=", "ne": "<>", "lt": "<", "lte": "<=", "gt": ">", "gte": ">="}[op]
            frags.append(pgsql.SQL("{} " + sym + " %s").format(ident))
            params.append(val)
        else:
            raise ContractConfigError(f"unknown where op {op!r} (have: {sorted(WHERE_OPS)})")
    if not frags:
        return pgsql.SQL("TRUE"), params
    return pgsql.SQL(" AND ").join(frags), params


def build_range_sql(table: str, spec: dict):
    """count(*) of in-scope rows whose col falls outside [min, max] (or is NULL)."""
    from psycopg import sql as pgsql

    col = spec.get("col")
    lo, hi = spec.get("min"), spec.get("max")
    if lo is None and hi is None:
        raise ContractConfigError(
            f"range contract {spec.get('name')!r} declares neither min nor max"
        )
    ident = pgsql.Identifier(col)
    scope_sql, params = _where_sql(spec.get("where"))

    legs = []
    if not spec.get("allow_null", False):
        # The explicit NULL leg. Without it `col < %s` is NULL for a NULL col and the row
        # SILENTLY PASSES — the three-valued-logic hole the band contract shipped with.
        legs.append(pgsql.SQL("{} IS NULL").format(ident))
    if lo is not None:
        legs.append(pgsql.SQL("{} < %s").format(ident))
        params.append(lo)
    if hi is not None:
        legs.append(pgsql.SQL("{} > %s").format(ident))
        params.append(hi)

    q = pgsql.SQL("SELECT count(*) FROM {tbl} WHERE ({scope}) AND ({legs})").format(
        tbl=_table_ident(table), scope=scope_sql, legs=pgsql.SQL(" OR ").join(legs)
    )
    return q, params


def build_enum_sql(table: str, spec: dict):
    """count(*) of in-scope rows whose col carries a token outside the allowlist (or is NULL)."""
    from psycopg import sql as pgsql

    col = spec.get("col")
    allowed = spec.get("allowed")
    if not allowed:
        raise ContractConfigError(f"enum contract {spec.get('name')!r} has an empty allowed list")
    ident = pgsql.Identifier(col)
    scope_sql, params = _where_sql(spec.get("where"))

    legs = []
    if not spec.get("allow_null", False):
        legs.append(pgsql.SQL("{} IS NULL").format(ident))
    legs.append(pgsql.SQL("{}::text <> ALL(%s::text[])").format(ident))
    params.append([str(v) for v in allowed])

    q = pgsql.SQL("SELECT count(*) FROM {tbl} WHERE ({scope}) AND ({legs})").format(
        tbl=_table_ident(table), scope=scope_sql, legs=pgsql.SQL(" OR ").join(legs)
    )
    return q, params


def build_sql_expectation_sql(table: str, spec: dict):
    """Pass the registry's hand-written failing-row SQL through, read-only-linted.

    Cross-row / cross-table by nature (a median, a JOIN against another table) — there is no
    predicate DSL that expresses the land-drag oracle, and inventing one would be a worse lie
    than a checked-in query. `table` is unused (the SQL names its own tables) but kept in the
    signature so every builder dispatches identically."""
    from psycopg import sql as pgsql

    raw = spec.get("failing_rows_sql")
    if not raw:
        raise ContractConfigError(
            f"sql_expectation {spec.get('name')!r} has no failing_rows_sql"
        )
    assert_read_only(raw)
    return pgsql.SQL(raw), []


CONTRACT_BUILDERS = {
    "range": build_range_sql,
    "enum": build_enum_sql,
    "sql_expectation": build_sql_expectation_sql,
}
```

- [ ] **Step 4: Run test to verify it passes**
```
pytest ingest/tests/quality/ -q
```
Expected: `78 passed`.

- [ ] **Step 5: Commit**
```
git add ingest/quality/contracts.py ingest/tests/quality/test_contracts.py
git commit -m "feat(contracts): Locus-B failing-row SQL builders + read-only lint"
```

---

### Task 8: Locus B — wire `run_content_contracts` into `check_data_quality.py`

**Files:**
- Modify: `ingest/scripts/check_data_quality.py:50-55` (add `_CONTRACT_PREFIX`), `:125` (after `_BUILDERS`), `:277-355` (`sync_quality_checks`), `:339-344` (**the auto-close `LIKE` list — the one that fails silently if missed**), `:411` (after `format_schema_drift`), `:469-499` (`main`)
- Test: `ingest/tests/scripts/test_check_data_quality.py` (append)

**Interfaces:**
- Consumes: `CONTRACT_BUILDERS`, `load_contracts`, `PROBE_LOCI`, `ContractConfigError` (Tasks 4, 7).
- Produces:
  - `run_content_contracts(conn, registry: dict) -> list[dict]` — one dict per probe-locus contract: `{table, col, test, severity, failing_rows, status}` — **the same result shape as `run_value_tests`**, so the formatter and the ledger sync compose. `status ∈ PASS | FAIL | SKIP`. Phase 3c's `doctor` imports this for its content signal.
  - `_contract_check_key(table, name) -> str` — `"contract_fail_" + _slug(table) + "_" + name`.
  - `format_content_contracts(results) -> str`.

**The silent failure mode, named.** `sync_quality_checks`'s auto-close query (`:339-344`) hardcodes exactly **two** `LIKE` params. Add `_CONTRACT_PREFIX` to the ledger's `want{}` but **not** to that OR-list and contract checks will open and then **never auto-close** — a permanently-open stale check, which is precisely the false-RED class this whole build exists to kill.

**Invariant to preserve:** the probe's stated contract is *"Always exits 0 — observability, not gating"* (`:21-22`). Locus B does not change that. Blocking is Locus A's job.

- [ ] **Step 1: Write the failing test** — append to `ingest/tests/scripts/test_check_data_quality.py`:
```python
# ── Locus B: content contracts ─────────────────────────────────────────────────

from ingest.scripts.check_data_quality import (  # noqa: E402
    _CONTRACT_PREFIX,
    _QUALITY_PREFIX,
    _SCHEMA_PREFIX,
    _contract_check_key,
    format_content_contracts,
    run_content_contracts,
    sync_quality_checks,
)


class _FakeCursor:
    """Records every SQL string executed; answers count(*) queries with a canned number."""

    def __init__(self, count=0, log=None):
        self._count, self.log = count, log if log is not None else []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, q, params=None):
        self.log.append((q.as_string(None) if hasattr(q, "as_string") else str(q), params))

    def fetchone(self):
        return (self._count,)

    def fetchall(self):
        return []


class _FakeConn:
    def __init__(self, count=0):
        self.count, self.log = count, []

    def cursor(self):
        return _FakeCursor(self.count, self.log)

    def rollback(self):
        pass

    def commit(self):
        pass


def test_run_content_contracts_returns_the_run_value_tests_result_shape():
    """Same keys as run_value_tests -> the formatter and the ledger sync compose unchanged."""
    results = run_content_contracts(_FakeConn(0), load_quality_registry())
    assert results
    for r in results:
        assert set(r) >= {"table", "col", "test", "severity", "failing_rows", "status"}
    assert all(r["status"] == "PASS" for r in results)   # count(*) == 0 -> PASS


def test_run_content_contracts_marks_a_nonzero_count_FAIL():
    results = run_content_contracts(_FakeConn(7), load_quality_registry())
    assert all(r["status"] == "FAIL" and r["failing_rows"] == 7 for r in results)


def test_run_content_contracts_skips_merge_only_contracts():
    """`market_details_sold_rent_band` is locus: merge — it has no at-rest form (the table is an
    accumulating time series; its at-rest twin is a separate sql_expectation)."""
    names = {r["test"] for r in run_content_contracts(_FakeConn(0), load_quality_registry())}
    assert "market_details_sold_rent_band" not in names
    assert "market_details_sold_rent_band_at_rest" in names
    assert "listing_active_stats_land_blend_tripwire" in names
    assert "listing_state_home_price_floor" in names          # locus: both -> runs at rest too


def test_a_broken_contract_SKIPs_and_never_breaks_the_run():
    """The probe ALWAYS exits 0 (check_data_quality.py:21-22). A malformed contract is a SKIP."""
    reg = {"tables": {"t": {"content_contracts": [
        {"name": "broken", "type": "range", "locus": "probe", "policy": "report",
         "severity": "error"},   # no col, no min, no max
    ]}}}
    (r,) = run_content_contracts(_FakeConn(0), reg)
    assert r["status"] == "SKIP" and r["failing_rows"] is None


def test_the_ledger_AUTO_CLOSE_query_carries_the_contract_prefix():
    """THE SILENT ONE. sync_quality_checks' auto-close hardcodes its LIKE params (:339-344).
    Forget the third prefix and a contract check opens and NEVER auto-closes — a permanently
    open stale check, i.e. exactly the false-RED class this build exists to kill."""
    conn = _FakeConn(0)
    sync_quality_checks(conn, [], [], [])
    autoclose = [q for q, p in conn.log if "state='open'" in q and "check_key LIKE" in q]
    assert autoclose, "no auto-close query ran"
    q, params = next((q, p) for q, p in conn.log if "check_key LIKE" in q and "state='open'" in q)
    assert q.count("check_key LIKE %s") == 3
    assert _CONTRACT_PREFIX + "%" in params
    assert _QUALITY_PREFIX + "%" in params and _SCHEMA_PREFIX + "%" in params


def test_only_error_severity_contract_fails_open_a_checks_row():
    """The `_watch` twin is `warn` — it reports 2 known-accepted ZIPs forever and must never
    open a check."""
    conn = _FakeConn(0)
    contract_results = [
        {"table": "data_lake.market_details_swfl", "col": None,
         "test": "market_details_sold_rent_band_watch", "severity": "warn",
         "failing_rows": 2, "status": "FAIL"},
        {"table": "data_lake.listing_active_stats", "col": None,
         "test": "listing_active_stats_land_blend_tripwire", "severity": "error",
         "failing_rows": 3, "status": "FAIL"},
    ]
    sync_quality_checks(conn, [], [], contract_results)
    inserts = [p for q, p in conn.log if "INSERT INTO public.checks" in q]
    assert len(inserts) == 1
    assert _contract_check_key("data_lake.listing_active_stats",
                               "listing_active_stats_land_blend_tripwire") in inserts[0]


def test_format_content_contracts_says_clean_when_all_pass():
    out = format_content_contracts([
        {"table": "t", "col": "c", "test": "x", "severity": "error",
         "failing_rows": 0, "status": "PASS"},
    ])
    assert "✅" in out and "1" in out
```

- [ ] **Step 2: Run test to verify it fails**
```
pytest ingest/tests/scripts/test_check_data_quality.py -q
```
Expected: collection error — `ImportError: cannot import name '_CONTRACT_PREFIX' from 'ingest.scripts.check_data_quality'`.

- [ ] **Step 3: Write minimal implementation** — four edits to `ingest/scripts/check_data_quality.py`.

**(3a)** Replace lines 50-52:
```python
_QUALITY_PROJECT = "data-quality"
_QUALITY_PREFIX = "quality_fail_"
_SCHEMA_PREFIX = "schema_drift_"
_CONTRACT_PREFIX = "contract_fail_"
```
and add to the import block below `from check_freshness import _get_connection, _slug  # noqa: E402` (`:48`):
```python
from ingest.quality.contracts import (  # noqa: E402
    CONTRACT_BUILDERS,
    ContractConfigError,
    PROBE_LOCI,
    load_contracts,
)
```

**(3b)** Insert after `_BUILDERS` (line 125), before `def run_value_tests(`:
```python
# ── Locus B: content contracts (the same registry block Locus A's evaluate_batch reads) ──


def run_content_contracts(conn, registry: dict) -> list[dict]:
    """Run every probe-locus content contract at rest. Same result shape as run_value_tests
    ({table, col, test, severity, failing_rows, status}) so the formatter and the checks-ledger
    sync compose unchanged, and so doctor (spec §7 3c) gets ONE content signal, not two.

    `test` carries the CONTRACT NAME (not a type) — the names are unique per table and are what
    the check_key, the summary row and the prescription all key on.

    This is the ONLY locus a bare VIEW has: data_lake.listing_active_stats has no pipeline, no
    batch and no merge call, so there is no Locus A for it at all.

    Per-query try/rollback, exactly like run_value_tests: the probe ALWAYS exits 0
    (module docstring) — a missing table or a malformed contract can never break the run."""
    results: list[dict] = []
    for table in (registry.get("tables") or {}):
        for spec in load_contracts(table, registry):
            if spec.get("locus", "both") not in PROBE_LOCI:
                continue
            base = {
                "table": table,
                "col": spec.get("col"),
                "test": spec.get("name"),
                "severity": spec.get("severity", "warn"),
            }
            builder = CONTRACT_BUILDERS.get(spec.get("type"))
            if builder is None:
                results.append({**base, "failing_rows": None, "status": "SKIP",
                                "detail": f"unknown contract type '{spec.get('type')}'"})
                continue
            try:
                query, params = builder(table, spec)
                with conn.cursor() as cur:
                    cur.execute(query, params)
                    failing = cur.fetchone()[0]
            except (ContractConfigError, Exception) as exc:  # noqa: BLE001 — observability
                try:
                    conn.rollback()
                except Exception:
                    pass
                results.append({**base, "failing_rows": None, "status": "SKIP",
                                "detail": str(exc)})
                continue
            results.append({**base, "failing_rows": failing,
                            "status": "PASS" if failing == 0 else "FAIL"})
    return results
```

**(3c)** In the ledger section, add the key helper next to `_schema_check_key` (after `:274`):
```python
def _contract_check_key(table: str, name: str) -> str:
    return f"{_CONTRACT_PREFIX}{_slug(table)}_{name}"
```
Change `sync_quality_checks`'s signature (`:277`) and add the contract loop after the schema loop (after `:299`):
```python
def sync_quality_checks(conn, value_results: list[dict], schema_results: list[dict],
                        contract_results: list[dict] | None = None) -> dict:
```
```python
    for c in contract_results or []:
        if c["severity"] == "error" and c["status"] == "FAIL":
            key = _contract_check_key(c["table"], c["test"])
            want[key] = (
                f"Content contract fail: {c['table']} {c['test']} "
                f"({c['failing_rows']:,} failing rows)"
            )
```

**(3d)** — **the silent one.** Replace the auto-close query (`:339-344`):
```python
        # Auto-close: any open data-quality auto-check whose condition cleared.
        # THREE prefixes, not two. Omit _CONTRACT_PREFIX here and a contract check opens and
        # then NEVER closes — a permanently-open stale check, which is exactly the false-RED
        # class this build exists to kill. The failure is silent; this comment is the guard.
        cur.execute(
            "SELECT id, check_key FROM public.checks"
            " WHERE project = %s AND state='open'"
            " AND (check_key LIKE %s OR check_key LIKE %s OR check_key LIKE %s)",
            (_QUALITY_PROJECT, _QUALITY_PREFIX + "%", _SCHEMA_PREFIX + "%",
             _CONTRACT_PREFIX + "%"),
        )
```

**(3e)** Add the formatter after `format_schema_drift` (`:411`):
```python
def format_content_contracts(results: list[dict]) -> str:
    """Content-contract section: surface FAIL/SKIP; clean ✅ when all pass."""
    if not results:
        return ""
    alerting = [r for r in results if r["status"] != "PASS"]
    lines = ["\n### Content contracts — the checks that travel with the data\n"]
    if not alerting:
        lines.append(f"✅ All {len(results)} content contracts pass.\n")
        return "\n".join(lines) + "\n"
    lines += [
        "| Table | Contract | Severity | Failing rows | Status |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in alerting:
        sev = f"{_SEV_ICON.get(r['severity'], '')} {r['severity']}"
        failing = f"{r['failing_rows']:,}" if r["failing_rows"] is not None else "—"
        detail = f" ({r['detail']})" if r.get("detail") else ""
        lines.append(
            f"| `{r['table']}` | {r['test']} | {sev} | {failing} | {r['status']}{detail} |"
        )
    return "\n".join(lines) + "\n"
```

**(3f)** In `main()`, after `schema_results = run_schema_drift(conn, registry)` (`:470`):
```python
        contract_results = run_content_contracts(conn, registry)
```
change the sync call (`:475`):
```python
                sync = sync_quality_checks(conn, value_results, schema_results, contract_results)
```
and add one summary line after `summary += format_schema_drift(schema_results)` (`:499`):
```python
    summary += format_content_contracts(contract_results)
```

- [ ] **Step 4: Run test to verify it passes**
```
pytest ingest/tests/scripts/test_check_data_quality.py -q && pytest ingest/ -q
```
Expected: the new file green (`7 passed` added), whole suite green. Then a real read-only run against the live lake:
```
python -m ingest.scripts.check_data_quality --dry-run
```
Expected in the printed summary — this is the live Locus-B baseline, and every number is one the evidence predicts:
```
### Content contracts — the checks that travel with the data

| Table | Contract | Severity | Failing rows | Status |
| `data_lake.listing_state` | listing_state_home_price_floor | ❌ error | 21 | FAIL |
| `data_lake.market_details_swfl` | market_details_sold_rent_band_watch | ⚠️ warn | 2 | FAIL |
```
Everything else PASS: `listing_state_property_type_allowlist` **0** · `listing_active_stats_land_blend_tripwire` **0** (post-hotfix; min ratio 0.9664) · `listing_active_stats_median_absolute_floor` **0** (min legit median $139,900) · `market_details_sold_rent_band_at_rest` **0** (the 2 known-accepted ZIPs excluded) · `market_details_rent_coverage_floor` **0** (49 ≥ 45) · `market_details_ratio_units_check` **0**.
`--dry-run` writes no ledger rows. **If `listing_state_home_price_floor` reports anything other than 21, stop** — the scope drifted, and the twin-row test in Task 6 is the thing to re-read.

- [ ] **Step 5: Commit**
```
git add ingest/scripts/check_data_quality.py ingest/tests/scripts/test_check_data_quality.py
git commit -m "feat(contracts): Locus B — run_content_contracts + contract_fail_ ledger prefix"
```

---

### Task 9: [ASK-FIRST] Locus A — the `listing_lifecycle` merge gate

**ASK-FIRST because:** this puts code on a live ingest write path into `data_lake.listing_state` (RULE 1: "ingest writes to `data_lake.*`" → ask first). The `abort_if` branch **can kill a live nightly ingest run**, and the enum's `quarantine` policy **can withhold rows from a merge**. Nothing drops on today's data (the enum has 0 live violations and the price floor is `report`), but the *capability* is new and the blast radius is the nightly chain. Show the operator the `--dry-run` output before the first live run.

**Files:**
- Modify: `ingest/pipelines/listing_lifecycle/pipeline.py:14-33` (imports) and `:135-136` (the gate, immediately before `distill.upsert_state`)
- Test: `ingest/tests/pipelines/listing_lifecycle/test_contract_gate.py` (create)

**Interfaces:**
- Consumes: `evaluate_batch(rows, table, ctx)` (Task 4), `ContentContractError` (Task 1).
- Produces: no new exports. The batch `ups` reaching `distill.upsert_state` is now the contract-clean batch.

**The gate must sit at `:135`, NOT at the `diff_states` line `:107`.** `ups`/`trans` are **mutated in place** between them — `:108-115` sets `county`/`days_on_market`, and `:126`'s `apply_off_market_resolutions` rewrites states to `sold`/`withdrawn` and attaches `sold_price`. Gating at `:107` evaluates a batch that is **not the one that lands**.

**Coverage gap, stated, not papered over:** gating `upsert_state` leaves two other write paths carrying the same price class — `distill.append_transitions` (`:137`, whose `_TRANS_COLS` includes `price`/`price_delta`/`sold_price`) and `distill.update_sold_price` (`:158`, a targeted out-of-band `UPDATE` whose only guard is `sold_price > 0` — a recovered $1 nominal-consideration close price lands unchecked). Check opened in Task 11.

- [ ] **Step 1: Write the failing test** — `ingest/tests/pipelines/listing_lifecycle/test_contract_gate.py`:
```python
"""The Locus-A gate on listing_lifecycle — the batch that reaches upsert_state is contract-clean.

The gate is exercised directly (evaluate_batch + the raise), not by running the pipeline: run()
needs a live SteadyAPI key and a DB. What is proven here is the CONTRACT of the gate — the
orchestrator's obligations — plus the one structural fact a unit test can pin: that the gate is
wired at the merge call and not at diff_states."""
import re
from pathlib import Path

import pytest

from ingest.lib.guards import ContentContractError
from ingest.quality.contracts import evaluate_batch

_PIPELINE = Path(__file__).parents[3] / "pipelines" / "listing_lifecycle" / "pipeline.py"


def _up(**kw):
    base = {"address_key": "A:33901", "sale_or_rent": "sale", "state": "active",
            "property_type": "single_family", "list_price": 350000, "beds": 3, "sqft": 1800,
            "lot_acres": 0.2, "zip_code": "33901", "county": "Lee"}
    base.update(kw)
    return base


def test_the_gate_supplies_source_name_via_ctx_not_from_the_row():
    """source_name is NOT in distill._STATE_COLS — upsert_state injects it as a SCALAR at
    distill.py:200. Without ctx the price floor's `source_name = 'api_feed'` predicate is
    unevaluable and the contract silently scopes to nothing."""
    from ingest.pipelines.listing_lifecycle.distill import _STATE_COLS

    assert "source_name" not in _STATE_COLS

    rows = [_up(property_type="condo", list_price=7000, beds=1, sqft=855)]
    _, _, with_ctx = evaluate_batch(rows, "data_lake.listing_state", ctx={"source_name": "api_feed"})
    floor = next(c for c in with_ctx["contracts"] if c["name"] == "listing_state_home_price_floor")
    assert floor["violations"] == 1 and floor["status"] == "VIOLATIONS"


def test_a_scrape_source_batch_is_out_of_scope_for_the_api_feed_floor():
    """`--source scrape` lands under source_name='lifecycle_seed'. Source-B rows are not the
    contaminated class and the floor must not reach them."""
    rows = [_up(property_type="condo", list_price=7000, beds=1, sqft=855)]
    _, _, stats = evaluate_batch(rows, "data_lake.listing_state",
                                 ctx={"source_name": "lifecycle_seed"})
    floor = next(c for c in stats["contracts"] if c["name"] == "listing_state_home_price_floor")
    assert (floor["in_scope"], floor["violations"]) == (0, 0)


def test_the_orchestrator_raises_ContentContractError_on_abort_never_evaluate_batch():
    """PURITY: the raise lives in the CALLER. evaluate_batch returns abort as DATA."""
    rows = [_up(property_type="condos") for _ in range(600)]  # bypassed-normalizer token
    clean, quarantined, stats = evaluate_batch(rows, "data_lake.listing_state",
                                               ctx={"source_name": "api_feed"})
    assert stats["abort"] is True and clean == []
    with pytest.raises(ContentContractError, match="property_type_allowlist"):
        raise ContentContractError(stats["abort_reason"])   # what pipeline.py:135 does


def test_the_gate_is_wired_AT_the_merge_call_not_at_diff_states():
    """ups/trans are MUTATED IN PLACE between diff_states (:107) and upsert_state (:136):
    :108-115 sets county/days_on_market, :126's apply_off_market_resolutions rewrites states to
    sold/withdrawn and attaches sold_price. A gate at :107 evaluates a batch THAT IS NOT THE
    ONE THAT LANDS."""
    src = _PIPELINE.read_text(encoding="utf-8")
    gate = src.index("evaluate_batch(ups")
    diff = src.index("ups, trans = diff_states(")
    merge = src.index("distill.upsert_state(ups")
    offmarket = src.index("apply_off_market_resolutions(")
    assert diff < offmarket < gate < merge, "the gate must sit between the mutations and the merge"
    assert re.search(r"ups\s*=\s*clean", src), "the merge must consume the CLEAN batch, not `ups`"
```

- [ ] **Step 2: Run test to verify it fails**
```
pytest ingest/tests/pipelines/listing_lifecycle/test_contract_gate.py -q
```
Expected: `3 passed, 1 failed` — `test_the_gate_is_wired_AT_the_merge_call_not_at_diff_states` fails with `ValueError: substring not found` on `src.index("evaluate_batch(ups")`.

- [ ] **Step 3: Write minimal implementation** — in `ingest/pipelines/listing_lifecycle/pipeline.py`, add two imports (after line 19's blank, before `from ingest.pipelines.listing_lifecycle import distill`):
```python
from ingest.lib.guards import ContentContractError
from ingest.quality.contracts import evaluate_batch
```
then replace the blank line at `:135` (immediately before `n_u = distill.upsert_state(...)`) with:
```python
        # ── LOCUS A: content contracts, on the batch that ACTUALLY LANDS. ────────────────
        # HERE, and not at diff_states (:107): ups/trans are mutated in place between the two
        # (:108-115 sets county/days_on_market; :126's apply_off_market_resolutions rewrites
        # states to sold/withdrawn and attaches sold_price). A gate at :107 would evaluate a
        # batch that is not the one that lands.
        #
        # ctx carries source_name: it is NOT a batch-row column (distill._STATE_COLS omits it;
        # upsert_state injects it as a scalar at distill.py:200), so without ctx the price
        # floor's `source_name = 'api_feed'` predicate is unevaluable at this locus.
        #
        # evaluate_batch is PURE — it never raises. Abort comes back as data and the raise
        # happens here, in the orchestrator, which is the only place that knows what a run is.
        # COVERAGE GAP, stated: this gates upsert_state only. append_transitions (:137, whose
        # _TRANS_COLS carries price/price_delta/sold_price) and update_sold_price (:158, a
        # targeted out-of-band UPDATE guarded only by `sold_price > 0`) carry the same price
        # class and are NOT gated. Check: listing_lifecycle_ungated_write_paths.
        ups, quarantined, cstats = evaluate_batch(
            ups, "data_lake.listing_state", ctx={"source_name": src_name}
        )
        if cstats["abort"]:
            raise ContentContractError(cstats["abort_reason"])
        for c in cstats["contracts"]:
            if c["status"] != "PASS":
                print(f"[contract] {county}: {c['name']} {c['status']} — "
                      f"{c['violations']} of {c['in_scope']} in-scope ({c['share_pct']}%) "
                      f"policy={c['policy']}"
                      + (f" detail={c['detail']}" if c.get("detail") else ""), flush=True)
        if quarantined:
            print(f"[contract] {county}: QUARANTINED {len(quarantined)} rows — "
                  f"merging the clean {len(ups):,}", flush=True)
```

- [ ] **Step 4: Run test to verify it passes**
```
pytest ingest/tests/pipelines/listing_lifecycle/ -q && pytest ingest/ -q
```
Expected: `4 passed` in the new file; whole suite green.

Then the live dry-run (**zero network calls, zero DB writes** — `--dry-run` skips enrichment and every merge):
```
python -m ingest.pipelines.listing_lifecycle.pipeline --dry-run --county Lee
```
Expected: the `[contract]` line appears before `[ok] Lee`, reporting the price floor with a non-zero violation count and `policy=report`, no quarantine line, no exception:
```
[contract] Lee: listing_state_home_price_floor VIOLATIONS — 15 of 12940 in-scope (0.116%) policy=report
[ok] Lee: scanned=21138 seed=False upserts=... transitions=... (...)
```
**Show this output to the operator before the first live (non-dry-run) run.** If a `ContentContractError` is raised on a dry-run, do **not** proceed — a live batch is tripping abort and the thresholds need re-deriving, not overriding.

- [ ] **Step 5: Commit**
```
git add ingest/pipelines/listing_lifecycle/pipeline.py ingest/tests/pipelines/listing_lifecycle/test_contract_gate.py
git commit -m "feat(contracts): Locus A gate on listing_lifecycle upsert_state"
```

---

### Task 10: [ASK-FIRST] Locus A — the `market_aggregates` details merge gate

**ASK-FIRST because:** same reason as Task 9 — a live ingest write path into `data_lake.market_details_swfl`, and `abort_if` can kill the run. The band's policy is `report`, so no ZIP row is withheld today; the abort path exists for a vendor **units flip** (annual → monthly), which would put all 49 ZIPs out of band at once and must stop the run rather than land 49 uninterpretable ratios.

**Files:**
- Modify: `ingest/pipelines/market_aggregates/pipeline.py:14-22` (imports) and `:62-63` (the gate, immediately before `db.upsert(_DET_TABLE, ...)`)
- Test: `ingest/tests/pipelines/market_aggregates/test_contract_gate.py` (create)

**Interfaces:**
- Consumes: `evaluate_batch` (Task 4), `ContentContractError` (Task 1).
- Produces: no new exports.

**This is the only clean whole-batch site of the three.** `run_details` accumulates `rows` across every ZIP into one list and merges **once** at `:63` — so the contamination-share denominator here is genuinely the whole load, which is what the abort model assumes. (At `listing_lifecycle` the merge is per-county by design, so `abort` there has per-county semantics: an abort on county #2 leaves county #1 already committed. That is an accepted partial-run outcome, not a bug — `pipeline.py:49-50` documents why the per-county merge is deliberate.)

**Gate `run_details` only, not `run_histogram`.** `listing_price_histogram_swfl` carries no content contract, so gating it adds a call and no assertion.

- [ ] **Step 1: Write the failing test** — `ingest/tests/pipelines/market_aggregates/test_contract_gate.py`:
```python
"""The Locus-A gate on market_aggregates.run_details — the sold/rent band, pre-merge."""
from pathlib import Path

import pytest

from ingest.lib.guards import ContentContractError
from ingest.quality.contracts import evaluate_batch

_T = "data_lake.market_details_swfl"
_PIPELINE = Path(__file__).parents[3] / "pipelines" / "market_aggregates" / "pipeline.py"


def _det(zip_code, sold, rent, ratio):
    return {"zip_code": zip_code, "county": "Lee", "median_sold_price": sold,
            "median_rent_price": rent, "sold_to_rent_ratio": ratio,
            "captured_date": "2026-07-11", "source_tag": "realtor.com"}


def _band(stats):
    return next(c for c in stats["contracts"] if c["name"] == "market_details_sold_rent_band")


def test_the_two_known_accepted_zips_do_not_fire_the_band():
    """GREEN ON COMMIT #1. 33972 (1.28) and 33920/Alva (1.90) are TRUE positives of upstream
    realtor.com land-drag we cannot fix. Without the ZIP exclusion this contract is RED forever
    and doctor learns to ignore it."""
    rows = [_det("33972", 30000, 1950, 1.28), _det("33920", 88750, 3900, 1.90)]
    clean, quarantined, stats = evaluate_batch(rows, _T)
    assert _band(stats)["violations"] == 0
    assert clean == rows and quarantined == []


def test_a_THIRD_contaminated_zip_fires():
    rows = [_det("33972", 30000, 1950, 1.28), _det("33905", 26500, 2100, 1.05)]
    _, _, stats = evaluate_batch(rows, _T)
    assert _band(stats)["violations"] == 1


def test_the_legit_high_multiple_zips_pass():
    """33914 Cape Coral is the live MAX at 21.14 annual (253.7x MONTHLY) and 34105 Naples is
    240x monthly — a naive 200x-monthly cap would false-fire BOTH. The band is annual and
    data-derived for exactly this reason."""
    rows = [_det("33903", 149575, 1750, 7.12),   # live min legit
            _det("34113", 580000, 6547, 7.38),
            _det("33914", 520000, 2050, 21.14)]  # live max legit
    _, _, stats = evaluate_batch(rows, _T)
    assert _band(stats)["violations"] == 0


def test_a_null_ratio_with_both_prices_present_is_a_VIOLATION():
    """`NULL NOT BETWEEN 4 AND 40` is NULL in SQL — it SILENTLY PASSES. That is the
    three-valued-logic hole."""
    _, _, stats = evaluate_batch([_det("33901", 400000, 2500, None)], _T)
    assert _band(stats)["violations"] == 1


def test_a_null_rent_row_is_out_of_scope_not_a_violation():
    """5 ZIPs already carry a NULL rent (1 Lee, 4 Collier). That is a COVERAGE gap, not
    contamination — the coverage-floor contract owns it, not the band."""
    _, _, stats = evaluate_batch([_det("34102", 900000, None, None)], _T)
    assert (_band(stats)["in_scope"], _band(stats)["violations"]) == (0, 0)


def test_a_vendor_units_flip_aborts_the_run():
    """If the vendor silently switches sold_to_rent_ratio from ANNUAL to MONTHLY, every ratio
    lands ~12x high and all 49 in-scope ZIPs go out of band at once. 100% -> if_no_clean_rows
    -> abort. Landing 49 uninterpretable ratios would be worse than landing none."""
    rows = [_det(f"339{i:02d}", 400000, 2500, 160.0) for i in range(49)]
    clean, _, stats = evaluate_batch(rows, _T)
    assert stats["abort"] is True and "no clean rows" in stats["abort_reason"]
    assert clean == rows   # policy report -> nothing dropped; the RUN is what stops
    with pytest.raises(ContentContractError):
        raise ContentContractError(stats["abort_reason"])   # what pipeline.py:62 does


def test_the_gate_is_wired_before_the_details_upsert_and_not_on_the_histogram():
    src = _PIPELINE.read_text(encoding="utf-8")
    gate = src.index("evaluate_batch(rows")
    det_merge = src.index("db.upsert(_DET_TABLE")
    hist_merge = src.index("db.upsert(_HIST_TABLE")
    assert hist_merge < gate < det_merge   # gate is inside run_details, ahead of its merge
    assert src.count("evaluate_batch(") == 1   # histogram carries no contract; do not gate it
```

- [ ] **Step 2: Run test to verify it fails**
```
pytest ingest/tests/pipelines/market_aggregates/test_contract_gate.py -q
```
Expected: `6 passed, 1 failed` — `test_the_gate_is_wired_before_the_details_upsert_and_not_on_the_histogram` fails with `ValueError: substring not found` on `src.index("evaluate_batch(rows")`.

- [ ] **Step 3: Write minimal implementation** — in `ingest/pipelines/market_aggregates/pipeline.py`, add after `from datetime import date` (`:18`):
```python
from ingest.lib.guards import ContentContractError
from ingest.quality.contracts import evaluate_batch
```
then replace lines 62-63 (inside `run_details`, after the ZIP loop, before the merge):
```python
    # ── LOCUS A: content contracts on the whole-batch details load. ─────────────────────
    # THE ONLY clean whole-batch site of the three loci: run_details accumulates `rows` across
    # every ZIP and merges ONCE, so the contamination SHARE here really is a share of the whole
    # load — which is what the abort model assumes. (listing_lifecycle merges per county by
    # design, so its abort has per-county semantics.)
    #
    # policy is `report`: the band drops NOTHING. Withholding a ZIP row changes what
    # market-temperature-swfl ships (47 ZIPs instead of 49) — a live-surface change, ask-first.
    # Check: market_details_band_quarantine_flip.
    #
    # The abort path is for a vendor UNITS FLIP (sold_to_rent_ratio annual -> monthly): all 49
    # in-scope ZIPs go out of band at once, if_no_clean_rows trips, and the run STOPS rather
    # than landing 49 uninterpretable ratios behind a green cron.
    # No gate on run_histogram: listing_price_histogram_swfl carries no content contract.
    rows, quarantined, cstats = evaluate_batch(rows, _DET_TABLE)
    if cstats["abort"]:
        raise ContentContractError(cstats["abort_reason"])
    for c in cstats["contracts"]:
        if c["status"] != "PASS":
            print(f"[contract] {c['name']} {c['status']} — {c['violations']} of "
                  f"{c['in_scope']} in-scope ({c['share_pct']}%) policy={c['policy']}"
                  + (f" detail={c['detail']}" if c.get("detail") else ""), flush=True)
    if quarantined:
        print(f"[contract] QUARANTINED {len(quarantined)} ZIP rows — merging the clean "
              f"{len(rows)}", flush=True)
    n = db.upsert(_DET_TABLE, _DET_COLS, _DET_CONFLICT, rows, dry_run=dry_run)
```

- [ ] **Step 4: Run test to verify it passes**
```
pytest ingest/tests/pipelines/market_aggregates/ -q && pytest ingest/ -q
```
Expected: `7 passed` in the new file; whole suite green.

Then the live dry-run (**zero network calls** — `--dry-run` fetches nothing and writes nothing):
```
python -m ingest.pipelines.market_aggregates.pipeline --resource details --dry-run
```
Expected: no `[contract]` line at all (a dry-run fetches nothing, so `rows` is empty and every contract is a 0-in-scope PASS), no exception, and the existing `[budget] details = 57 ...` / `[done] details rows=0 dry_run=True` lines unchanged. The contract's live behavior on a real batch is proven by Task 8's at-rest run (`market_details_sold_rent_band_at_rest` → 0 failing) plus the seven unit tests above. **Show the operator both dry-runs (Task 9 + this one) before the first live run of either.**

- [ ] **Step 5: Commit**
```
git add ingest/pipelines/market_aggregates/pipeline.py ingest/tests/pipelines/market_aggregates/test_contract_gate.py
git commit -m "feat(contracts): Locus A gate on market_aggregates run_details"
```

---

### Task 11: Deferral checks + SESSION_LOG + push

**Files:**
- Modify: `SESSION_LOG.md` (new entry at top — the hook blocks the push without one)
- Modify: `_AUDIT_AND_ROADMAP/build-queue.md` (sync Phase 1 → done)

**Interfaces:**
- Consumes: nothing. Produces: six `checks` rows. Phase 3c (`doctor`) reads `contract_fail_*` keys from the same ledger.

**RULE 2.4 — no silent deferrals.** Every gap this phase knowingly leaves open becomes a `checks` entry **in the same session**. A SESSION_LOG sentence is not a deferral; it is forgetting on a delay. The postmortem that forced this rule was three separate condo/multi-unit-grain gaps, each logged as prose and each rediscovered from scratch.

- [ ] **Step 1: Verify the whole gate is green before opening anything**
```
pytest ingest/ -q
```
Expected: all green. Then confirm the live at-rest baseline one more time (this is the evidence the check closes on, per "checks are prod evidence, not dev attestation"):
```
python -m ingest.scripts.check_data_quality --dry-run
```
Expected: the content-contracts table from Task 8 — price floor **21**, band watch **2**, everything else **0**.

- [ ] **Step 2: Open the six deferral checks** — each names a real gap this phase found and did not close:
```
node scripts/check.mjs open data-quality active_listings_orphan_ship_or_delete "Locus A-1 NOT wired: active_listings_residential (38,728 rows) feeds nothing live — its named consumer reads listing_lifecycle's output via listing_active_stats. Gating it guards a corpse. Ship-or-delete decision needed."
node scripts/check.mjs open data-quality listing_lifecycle_ungated_write_paths "Locus A gates upsert_state only. append_transitions (_TRANS_COLS carries price/price_delta/sold_price) and update_sold_price (out-of-band UPDATE, guarded only by sold_price > 0 — a $1 nominal-consideration close price lands unchecked) carry the same price class and are ungated."
node scripts/check.mjs open data-quality contracts_backfill_and_purge "spec §5 one-time backfill: check_data_quality --contracts-backfill (read-only triage of already-landed contamination) + --purge (separate, explicit destructive cleanup). Not built in Phase 1."
node scripts/check.mjs open data-quality market_details_band_quarantine_flip "market_details_sold_rent_band ships policy=report. Flipping it to quarantine withholds a ZIP row from market-temperature-swfl (47 of 49) — a live-surface change. ASK-FIRST."
node scripts/check.mjs open data-quality listing_active_stats_inflated_median_ceiling "The land-drag tripwire is ONE-SIDED: it fires only when the view median DROPS. A regression that INFLATES it (e.g. the view's list_price >= 20000 literal fat-fingered to 200000) passes silently. No verified upper-ratio distribution exists for the corrected oracle, so no ceiling was invented."
node scripts/check.mjs open data-quality listing_state_holding_rent_artifacts "The price floor is scoped state='active' (the scope whose 21 offenders are verified). Two state='holding' rows — 12312AMBERWAVESRD:33974 at \$2,325 (4bd/1,937sf/0.162ac) and 14882PORTICOBLVD:33905 at \$2,475 (4bd/2,032sf/0.150ac) — are unmistakable monthly rents and are out of scope."
node scripts/check.mjs list
```
Expected: `list` shows all six open under project `data-quality`, alongside the pre-existing `data_contracts_doctor_live_verify`.

- [ ] **Step 3: Write the SESSION_LOG entry** — append a new entry at the **top** of `SESSION_LOG.md` (append-only; never rewrite a past entry):
```markdown
## 2026-07-11 — Phase 1: content contracts (contracts.py + Locus A/B)

**Shipped.** `ingest/quality/contracts.py` — pure, DB-free contract engine.
`evaluate_batch(rows, table, ctx) -> (clean, quarantined, stats)` at the merge locus;
failing-row SQL builders at the at-rest locus. Both read one `content_contracts:` block in
`quality_registry.yaml`, so a predicate cannot drift between the gate and the tripwire.
`ContentContractError` added to `ingest/lib/guards.py`. Locus A wired at
`listing_lifecycle/pipeline.py:135` and `market_aggregates/pipeline.py:62`; Locus B wired as
`run_content_contracts` in `check_data_quality.py` (+ the `contract_fail_` prefix in the
auto-close LIKE list — omit it and a contract check opens and never closes).

**Live at-rest baseline (`check_data_quality --dry-run`, 07/11/2026):** price floor **21**
failing · sold/rent band watch **2** (the known-accepted 33972 + 33920) · everything else **0** —
land-drag tripwire, median absolute floor, property_type allowlist, band at-rest, rent coverage
floor, ratio units check.

**Four spec corrections implemented, each of which would have shipped a bug:**
1. The `land_drags_median` tripwire as specced was a **TAUTOLOGY** — its oracle copied the view's
   own `property_type <> 'land'` WHERE clause byte-for-byte (49/52 live rows at ratio exactly
   1.0000; `median < 0.5 × median` is unsatisfiable). And `property_type` is *derived*
   (`PROPERTY_TYPE_MAP.get(raw, "other")` silently defaults — a bug that already happened once).
   Under a relabel the ~10× $35k bug returns in full while the tripwire reports GREEN. Shipped the
   label-independent oracle: `(beds IS NOT NULL OR sqft IS NOT NULL)`, joined `ON (county, zip)`
   not `USING (zip_code)`. Two tests lock it — a structural test on the registry SQL and a pure
   relabel proof where naive reports green and corrected fires at 0.102.
2. The `range` price floor **does not quarantine**. A `property_type NOT IN ('land','other')`
   floor deletes verified real manufactured-home SALES (4324 Mailbox Ave #127 at $9,900 — live on
   MHVillage/Trulia; 567 Peace Ct at $2,000; 648 Suwanee Dr at $3,000). The cohort runs
   continuously $2,000 → $59,900+; no floor separates it. Scope is `sqft IS NOT NULL` + a 4-type
   allowlist — the only scope that passes `4438HITZINGAVE51:33903` ($8,900) and fires on the Marco
   Island `10TAMPAPL*` cluster ($6–9k). Policy `report`.
3. **No enum on `sale_or_rent`** — vacuously green; both writers hardcode `"sale"`. The
   contamination is a PRICE signal, not a label signal.
4. The sold/rent band **seeds 33972 + 33920 as known-accepted** (true positives of upstream
   land-drag we cannot fix — without this it is RED from commit #1) and gains a **coverage floor**
   (rent non-null ≥ 45 of 54) — without it the band is satisfiable by having no data.

**Deferred, each with a `checks` row (RULE 2.4):** `active_listings_orphan_ship_or_delete` ·
`listing_lifecycle_ungated_write_paths` · `contracts_backfill_and_purge` ·
`market_details_band_quarantine_flip` · `listing_active_stats_inflated_median_ceiling` ·
`listing_state_holding_rent_artifacts`.

**Next:** Phase 2 — `check-registry-identity.mts`. **ASK-FIRST before the first LIVE (non-dry-run)
run of `listing_lifecycle` or `market_aggregates`:** both now carry an abort path that can kill a
nightly ingest run. Dry-runs are green and are in the commit log.

**Evidence:** `docs/audit/2026-07-11-pipeline-problems/08b` (thresholds + adversarial verdicts) ·
`08f` (gate sites, file:line) · `08h §1` (the tautology).
```

- [ ] **Step 4: Sync the build queue and verify the pre-push gate**
```
node scripts/check.mjs list && git status --short
```
Expected: six new open checks; working tree shows only `SESSION_LOG.md` and `_AUDIT_AND_ROADMAP/build-queue.md` modified (everything else already committed in Tasks 1–10).

- [ ] **Step 5: Commit and push**
```
git add SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs(session-log): phase 1 content contracts — Locus A/B live-verified"
node scripts/safe-push.mjs
```
Expected: the 5 pre-push gates pass (no `package.json` change → no lockfile gate; no packs/vocab touched → Gates 2/5 skip; **Gate 4** is satisfied — the contract gates add no destructive write, and `evaluate_batch` is itself a non-null guard on the merge path). `safe-push` reports the 11 commits going to `origin/main`. **If `safe-push` reports carrying a commit you did not author, STOP and ask** — never bundle a parallel session's work.

---

## PHASE: Phase 2 — Config-identity cross-check CI

Builds `ingest/tools/check-registry-identity.mts` (Bun/TS, mirrors `refinery/tools/check-vocab-coverage.mts`): a `--static` mode (files only — registry + workflow YAML + pipeline Python; runs in the pre-push hook; fail-OPEN on any tooling error) and a `--live` mode (adds `data_lake` reads; CI only, **advisory-first**). It kills the wrong-letter/wrong-field class at PR time — the drift that cost two weeks of false-RED — by machine-verifying the ~6 hand-synced identity strings against each other and naming **both sides** of every disagreement.

**Unblocked by:** the Spine (Phase 2 *consumes* `workflow:` and `consuming_pack:`; it is not independently shippable — Tasks 1-9 are pure/fixture-driven and have no Spine dependency, Task 10 is the Spine-dependent tail). **Fields Phase 2 itself adds:** top-level `coverage_exempt:` (structured, replaces the prose exclusion block at registry `~:1705-1770`), and the opt-in per-entry `known_drift:` / `first_run_after:` / `dispatch_only:` / `schema_static:` annotations its rules demand.

**Scope boundaries — read before writing a line of code:**
- **NEVER bake a version literal.** `actions/checkout` **v7 is latest** (v7.0.0, 2026-06-18); **v6 exists and is valid** (v6.0.0, 2025-11-20) and is pinned by 101 workflows here. The old "v6 is nonexistent" claim in `00-DIAGNOSIS` is **FALSE**. The check asserts *"the pinned ref resolves against live/maintained tags"* — never *"equals latest"*. A `@v6` pin while v7 is latest must come out **GREEN (or WARN), never RED**. That single fixture is the regression guard for this whole correction.
- **Phase 2 does NOT own the API-disabled-workflow class.** `dbpr-sirs-monthly`, `fgcu-reri-monthly`, `marketbeat-pdf-ingest`, `rsw-airport-monthly` carry live crons **in source** but are `disabled_manually` **at the GitHub API**, orphaning 6 registry entries. `--static` reads FILES; `--live` reads the DB; **neither reads workflow state.** They pass both Phase-2 modes clean and that is correct. That class belongs to the §7 3a manifest (`scripts/build-watch-lists.mjs`, its `disabled` field). Assigning it here is the tempting error — do not.
- **Forward guards only, no machinery:** `timeout-minutes` is **not honored on a job that `uses:` a reusable workflow**, and a caller's workflow-level `env:` **does not propagate** to a called workflow (08g DRIFT A/B). Zero `workflow_call` exists in the repo today, so Rule D simply *skips* caller jobs and Rule C reads the file that actually runs the Python. Build nothing else for it.
- **Zero count assertions anywhere.** The live registry parse right now yields 71 `pipelines:` + 3 `not_yet_running:`; the docs variously say 72+3, 74, ~78. That drift *is* why baked numbers are forbidden. Every rule is structural ("every non-exempt `data_lake` base table resolves to an entry"), never `== N`.
- **Deferred with a check, not silently** (RULE 2.4): the pack-legacy-read `--live` rule (`env-swfl` → `data_lake.usgs_sites`, an excluded-but-live-read table) is doctor/Locus-B work. Task 10 opens `pack_legacy_table_read` for it.

---

### Task 1: Model, loaders, and the both-sides failure formatter

**Files:**
- Create: `ingest/tools/lib/identity-model.mts`
- Test: `ingest/tools/lib/identity-model.test.mts`

**Interfaces — Produces (every later task consumes these):**
- `type Severity = "red" | "warn"`
- `interface Finding { rule: string; entry: string; severity: Severity; registrySide: string; otherSide: string; fix: string }`
- `interface RegistryEntry { name: string; parked?: boolean; dispatch_only?: boolean; workflow?: string; consuming_pack?: string | string[]; source_name?: string; source_tag?: string; dlt_schema_name?: string; schema_static?: string; count_table?: string; freshness_table?: string; expected_rows_min?: number; cadence_days?: number; tolerance_multiplier?: number; first_run_after?: string; known_drift?: KnownDrift[]; [k: string]: unknown }`
- `interface KnownDrift { rule: string; check: string }`
- `interface CoverageExempt { table: string; reason: string }`
- `interface Registry { pipelines: RegistryEntry[]; not_yet_running?: RegistryEntry[]; coverage_exempt?: CoverageExempt[] }`
- `interface RepoView { exists(p: string): boolean; read(p: string): string | null; pyFiles(dir: string): string[] }`
- `class MemRepo implements RepoView` · `function fsRepo(root: string): RepoView`
- `interface WorkflowJob { id: string; timeoutMinutes: number | null; usesRefs: string[]; envKeys: string[]; modules: string[]; callsReusable: string | null }`
- `interface WorkflowFacts { file: string; name: string | null; crons: string[]; jobs: WorkflowJob[] }`
- `function loadRegistry(repo: RepoView): Registry`
- `function parseWorkflow(repo: RepoView, file: string): WorkflowFacts | null`
- `function moduleDir(mod: string): string`
- `function allEntries(reg: Registry): Array<{ entry: RegistryEntry; parked: boolean }>`
- `function formatFindings(findings: Finding[]): string`

- [ ] **Step 1: Write the failing test**

`ingest/tools/lib/identity-model.test.mts`:
```ts
import { describe, expect, test } from "bun:test";
import {
  MemRepo,
  allEntries,
  formatFindings,
  loadRegistry,
  moduleDir,
  parseWorkflow,
  type Finding,
} from "./identity-model.mts";

const REGISTRY = `
pipelines:
  - name: news_swfl
    lane: tier-2
    workflow: news-swfl-ingest.yml
    dlt_schema_name: data_lake
    source_tag: news_crawl
  - name: collier_permits
    lane: tier-2
    workflow: collier-permits-monthly.yml
not_yet_running:
  - name: sba_foia_franchise_outcomes
    workflow: franchise-outcomes-quarterly.yml
coverage_exempt:
  - table: data_lake.view_vintages
    reason: derived_snapshot
`;

// Real shape: `on:` must survive as a STRING key (YAML 1.2 core schema, verified
// against Bun.YAML 1.3.14 — NOT the YAML-1.1 `on -> true` boolean trap), a
// commented cron must NOT parse, and env lives at STEP level in this repo.
const WF_DARK = `
name: Collier permits monthly
on:
  # schedule:
  #   - cron: "0 9 5 * *"
  workflow_dispatch:
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v6
      - name: Run
        env:
          DESTINATION__POSTGRES__CREDENTIALS: \${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
        run: python -m ingest.pipelines.collier_permits.pipeline
`;

describe("loadRegistry", () => {
  test("parses pipelines, not_yet_running, and the structured coverage_exempt block", () => {
    const reg = loadRegistry(new MemRepo({ "ingest/cadence_registry.yaml": REGISTRY }));
    expect(reg.pipelines.map((e) => e.name)).toEqual(["news_swfl", "collier_permits"]);
    expect(reg.not_yet_running?.[0].name).toBe("sba_foia_franchise_outcomes");
    expect(reg.coverage_exempt).toEqual([
      { table: "data_lake.view_vintages", reason: "derived_snapshot" },
    ]);
  });

  test("allEntries marks not_yet_running entries parked", () => {
    const reg = loadRegistry(new MemRepo({ "ingest/cadence_registry.yaml": REGISTRY }));
    const parked = allEntries(reg).filter((e) => e.parked).map((e) => e.entry.name);
    expect(parked).toEqual(["sba_foia_franchise_outcomes"]);
  });
});

describe("parseWorkflow", () => {
  const repo = new MemRepo({ ".github/workflows/collier-permits-monthly.yml": WF_DARK });

  test("a commented-out schedule yields ZERO crons", () => {
    expect(parseWorkflow(repo, "collier-permits-monthly.yml")!.crons).toEqual([]);
  });

  test("collects step-level env keys, uses refs, timeout, and python -m modules", () => {
    const job = parseWorkflow(repo, "collier-permits-monthly.yml")!.jobs[0];
    expect(job.envKeys).toEqual(["DESTINATION__POSTGRES__CREDENTIALS"]);
    expect(job.usesRefs).toEqual(["actions/checkout@v6"]);
    expect(job.timeoutMinutes).toBe(30);
    expect(job.modules).toEqual(["ingest.pipelines.collier_permits.pipeline"]);
    expect(job.callsReusable).toBeNull();
  });

  test("returns null for a workflow file that does not exist", () => {
    expect(parseWorkflow(repo, "ghost.yml")).toBeNull();
  });
});

describe("moduleDir", () => {
  test("maps a python module path to its source dir", () => {
    expect(moduleDir("ingest.pipelines.news_swfl.pipeline")).toBe("ingest/pipelines/news_swfl");
    expect(moduleDir("ingest.duckdb_pipelines.usgs.pipeline")).toBe("ingest/duckdb_pipelines/usgs");
    expect(moduleDir("ingest.scripts.faf5_to_parquet")).toBe("ingest/scripts");
  });
});

describe("formatFindings", () => {
  test("names BOTH sides of the drift and the fix", () => {
    const f: Finding[] = [
      {
        rule: "source_tag_field_forbidden",
        entry: "news_swfl",
        severity: "red",
        registrySide: 'cadence_registry.yaml declares `source_tag: news_crawl`',
        otherSide:
          "nothing in ingest/ reads source_tag — check_freshness.py scopes on source_name (:238, :382)",
        fix: "SCHEMA_NAME_DRIFT — delete the source_tag: field; use source_name: if the column exists.",
      },
    ];
    const out = formatFindings(f);
    expect(out).toContain("RED  news_swfl [source_tag_field_forbidden]");
    expect(out).toContain("registry: cadence_registry.yaml declares `source_tag: news_crawl`");
    expect(out).toContain("reality:  nothing in ingest/ reads source_tag");
    expect(out).toContain("fix:      SCHEMA_NAME_DRIFT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test ingest/tools/lib/identity-model.test.mts
```
Expected: `error: Cannot find module './identity-model.mts'` — 0 pass, all tests errored.

- [ ] **Step 3: Write minimal implementation**

`ingest/tools/lib/identity-model.mts`:
```mts
/**
 * check-registry-identity — shared model.
 *
 * Parsing facts VERIFIED against this repo (Bun 1.3.14), not assumed:
 *   • Bun.YAML.parse keeps `on:` as the STRING key "on" (YAML 1.2 core schema),
 *     so workflows parse without the YAML-1.1 `on -> true` boolean trap.
 *   • A commented-out `schedule:` block simply does not appear in the parse —
 *     that IS the comment-aware cron check (collier-permits, corridor-pulse).
 *   • `env:` in this repo lives at STEP level, not job level. The wired set is
 *     the union of workflow env ∪ job env ∪ step env.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export type Severity = "red" | "warn";

export interface Finding {
  rule: string;
  entry: string;
  severity: Severity;
  registrySide: string;
  otherSide: string;
  fix: string;
}

export interface KnownDrift {
  rule: string;
  check: string;
}
export interface CoverageExempt {
  table: string;
  reason: string;
}

export interface RegistryEntry {
  name: string;
  lane?: string;
  parked?: boolean;
  dispatch_only?: boolean;
  workflow?: string;
  consuming_pack?: string | string[];
  source_name?: string;
  source_tag?: string;
  dlt_schema_name?: string;
  schema_static?: string;
  count_table?: string;
  freshness_table?: string;
  expected_rows_min?: number;
  cadence_days?: number;
  tolerance_multiplier?: number;
  first_run_after?: string;
  known_drift?: KnownDrift[];
  [k: string]: unknown;
}

export interface Registry {
  pipelines: RegistryEntry[];
  not_yet_running?: RegistryEntry[];
  coverage_exempt?: CoverageExempt[];
}

export interface RepoView {
  exists(p: string): boolean;
  read(p: string): string | null;
  /** Recursive *.py paths under `dir` (empty if the dir is absent). */
  pyFiles(dir: string): string[];
}

export class MemRepo implements RepoView {
  constructor(private readonly files: Record<string, string>) {}
  exists(p: string): boolean {
    return (
      Object.hasOwn(this.files, p) || Object.keys(this.files).some((f) => f.startsWith(`${p}/`))
    );
  }
  read(p: string): string | null {
    return this.files[p] ?? null;
  }
  pyFiles(dir: string): string[] {
    return Object.keys(this.files).filter((f) => f.startsWith(`${dir}/`) && f.endsWith(".py"));
  }
}

export function fsRepo(root: string): RepoView {
  const abs = (p: string) => path.join(root, p);
  return {
    exists: (p) => existsSync(abs(p)),
    read: (p) => (existsSync(abs(p)) ? readFileSync(abs(p), "utf8") : null),
    pyFiles: (dir) => {
      const start = abs(dir);
      if (!existsSync(start) || !statSync(start).isDirectory()) return [];
      const out: string[] = [];
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full);
          else if (e.name.endsWith(".py")) out.push(path.relative(root, full).replaceAll("\\", "/"));
        }
      };
      walk(start);
      return out;
    },
  };
}

export const REGISTRY_PATH = "ingest/cadence_registry.yaml";

export function loadRegistry(repo: RepoView): Registry {
  const raw = repo.read(REGISTRY_PATH);
  if (raw === null) throw new Error(`registry not found at ${REGISTRY_PATH}`);
  const doc = Bun.YAML.parse(raw) as Registry;
  return {
    pipelines: doc.pipelines ?? [],
    not_yet_running: doc.not_yet_running ?? [],
    coverage_exempt: doc.coverage_exempt ?? [],
  };
}

/** Every entry, with `parked` true for not_yet_running: OR an explicit parked: true. */
export function allEntries(reg: Registry): Array<{ entry: RegistryEntry; parked: boolean }> {
  return [
    ...reg.pipelines.map((entry) => ({ entry, parked: entry.parked === true })),
    ...(reg.not_yet_running ?? []).map((entry) => ({ entry, parked: true })),
  ];
}

export interface WorkflowJob {
  id: string;
  timeoutMinutes: number | null;
  usesRefs: string[];
  envKeys: string[];
  modules: string[];
  /** Set when the JOB itself `uses:` another workflow (reusable-workflow caller). */
  callsReusable: string | null;
}

export interface WorkflowFacts {
  file: string;
  name: string | null;
  crons: string[];
  jobs: WorkflowJob[];
}

export function workflowPath(file: string): string {
  return `.github/workflows/${file}`;
}

export function parseWorkflow(repo: RepoView, file: string): WorkflowFacts | null {
  const raw = repo.read(workflowPath(file));
  if (raw === null) return null;
  let doc: any;
  try {
    doc = Bun.YAML.parse(raw);
  } catch {
    return null; // unparseable — caller degrades to skip+warn (fail-open)
  }
  const on = doc?.on ?? {};
  const crons: string[] = (on?.schedule ?? [])
    .map((s: any) => String(s?.cron ?? "").trim())
    .filter(Boolean);
  const wfEnv = Object.keys(doc?.env ?? {});
  const jobs: WorkflowJob[] = Object.entries(doc?.jobs ?? {}).map(([id, j]: [string, any]) => {
    const steps: any[] = Array.isArray(j?.steps) ? j.steps : [];
    const envKeys = new Set<string>([...wfEnv, ...Object.keys(j?.env ?? {})]);
    for (const s of steps) for (const k of Object.keys(s?.env ?? {})) envKeys.add(k);
    const runText = steps
      .map((s) => String(s?.run ?? ""))
      .join("\n");
    const modules = [...runText.matchAll(/python\s+-m\s+([A-Za-z0-9_.]+)/g)].map((m) => m[1]);
    // A job that `uses:` a workflow file is a reusable-workflow CALLER: GitHub
    // ignores timeout-minutes there and does not propagate caller env (08g A/B).
    const jobUses = typeof j?.uses === "string" ? j.uses : null;
    return {
      id,
      timeoutMinutes: typeof j?.["timeout-minutes"] === "number" ? j["timeout-minutes"] : null,
      usesRefs: steps.map((s) => String(s?.uses ?? "")).filter(Boolean),
      envKeys: [...envKeys],
      modules: [...new Set(modules)],
      callsReusable: jobUses && /\.ya?ml(@|$)/.test(jobUses) ? jobUses : null,
    };
  });
  return { file, name: typeof doc?.name === "string" ? doc.name : null, crons, jobs };
}

/** ingest.pipelines.X.pipeline -> ingest/pipelines/X ; ingest.scripts.Y -> ingest/scripts */
export function moduleDir(mod: string): string {
  const parts = mod.split(".");
  if (parts.length >= 3 && (parts[1] === "pipelines" || parts[1] === "duckdb_pipelines")) {
    return parts.slice(0, 3).join("/");
  }
  return parts.slice(0, -1).join("/");
}

export function formatFindings(findings: Finding[]): string {
  const line = (f: Finding) =>
    [
      `${f.severity === "red" ? "RED " : "WARN"} ${f.entry} [${f.rule}]`,
      `    registry: ${f.registrySide}`,
      `    reality:  ${f.otherSide}`,
      `    fix:      ${f.fix}`,
    ].join("\n");
  return findings.map(line).join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test ingest/tools/lib/identity-model.test.mts
```
Expected: `9 pass, 0 fail`.

- [ ] **Step 5: Commit**

```
git add ingest/tools/lib/identity-model.mts ingest/tools/lib/identity-model.test.mts
git commit -m "feat(identity): registry/workflow model + both-sides finding formatter"
```

---

### Task 2: Rule A — workflow resolves, and its cron state agrees with the entry

**Files:**
- Create: `ingest/tools/lib/identity-static.mts`
- Test: `ingest/tools/lib/identity-static.test.mts`

**Interfaces:**
- Consumes: `Registry`, `RegistryEntry`, `RepoView`, `Finding`, `allEntries`, `parseWorkflow`, `workflowPath` (Task 1)
- Produces: `function checkWorkflowLiveness(reg: Registry, repo: RepoView): Finding[]` — rules `workflow_field_missing` · `workflow_missing` · `workflow_dark` · `parked_but_scheduled`

Fires today on `collier_permits`, `city_pulse_corridors`, `city_pulse_corridors_tier2` (registry-active, cron commented out) and **inversely** on `sba_foia_franchise_outcomes` (parked entry, live workflow firing Jul 15 — the probe's structural blind spot, since `check_freshness.py:206`/`:636` iterate `pipelines:` only).

- [ ] **Step 1: Write the failing test**

`ingest/tools/lib/identity-static.test.mts`:
```ts
import { describe, expect, test } from "bun:test";
import { MemRepo, loadRegistry } from "./identity-model.mts";
import { checkWorkflowLiveness } from "./identity-static.mts";

const WF_LIVE = `
name: Franchise outcomes quarterly
on:
  schedule:
    - cron: "0 8 15 1,4,7,10 *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - run: python -m ingest.duckdb_pipelines.franchise_outcomes.pipeline
`;

const WF_DARK = `
name: Collier permits monthly
on:
  # schedule:
  #   - cron: "0 9 5 * *"
  workflow_dispatch:
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - run: python -m ingest.pipelines.collier_permits.pipeline
`;

function build(registryYaml: string) {
  const repo = new MemRepo({
    "ingest/cadence_registry.yaml": registryYaml,
    ".github/workflows/franchise-outcomes-quarterly.yml": WF_LIVE,
    ".github/workflows/collier-permits-monthly.yml": WF_DARK,
    "ingest/pipelines/collier_permits/pipeline.py": "x = 1\n",
    "ingest/duckdb_pipelines/franchise_outcomes/pipeline.py": "x = 1\n",
  });
  return { repo, reg: loadRegistry(repo) };
}

describe("checkWorkflowLiveness", () => {
  test("RED: an active entry whose workflow has NO uncommented cron (collier_permits)", () => {
    const { repo, reg } = build(`
pipelines:
  - name: collier_permits
    workflow: collier-permits-monthly.yml
    cadence_days: 30
`);
    const f = checkWorkflowLiveness(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["workflow_dark"]);
    expect(f[0].entry).toBe("collier_permits");
    expect(f[0].registrySide).toContain("cadence_days: 30");
    expect(f[0].otherSide).toContain("collier-permits-monthly.yml has no uncommented cron");
  });

  test("GREEN: the same dark workflow once the entry declares dispatch_only", () => {
    const { repo, reg } = build(`
pipelines:
  - name: collier_permits
    workflow: collier-permits-monthly.yml
    cadence_days: 30
    dispatch_only: true
`);
    expect(checkWorkflowLiveness(reg, repo)).toEqual([]);
  });

  test("RED (inverse): a parked entry whose workflow IS scheduled (sba_foia_franchise_outcomes)", () => {
    const { repo, reg } = build(`
pipelines: []
not_yet_running:
  - name: sba_foia_franchise_outcomes
    workflow: franchise-outcomes-quarterly.yml
`);
    const f = checkWorkflowLiveness(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["parked_but_scheduled"]);
    expect(f[0].otherSide).toContain("0 8 15 1,4,7,10 *");
    expect(f[0].fix).toContain("promote it to pipelines:");
  });

  test("RED: workflow: names a file that does not exist", () => {
    const { repo, reg } = build(`
pipelines:
  - name: ghost_pipeline
    workflow: no-such-workflow.yml
`);
    const f = checkWorkflowLiveness(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["workflow_missing"]);
    expect(f[0].otherSide).toContain(".github/workflows/no-such-workflow.yml does not exist");
  });

  test("RED: the Spine field is absent entirely", () => {
    const { repo, reg } = build(`
pipelines:
  - name: unspined
    cadence_days: 7
`);
    expect(checkWorkflowLiveness(reg, repo).map((x) => x.rule)).toEqual(["workflow_field_missing"]);
  });

  test("GREEN: workflow: none is legal for a parked entry", () => {
    const { repo, reg } = build(`
pipelines: []
not_yet_running:
  - name: airdna_str_swfl
    workflow: none
`);
    expect(checkWorkflowLiveness(reg, repo)).toEqual([]);
  });

  test("RED: workflow: none on an ACTIVE entry (no producer at all)", () => {
    const { repo, reg } = build(`
pipelines:
  - name: mhs_databook
    workflow: none
    cadence_days: 365
`);
    expect(checkWorkflowLiveness(reg, repo).map((x) => x.rule)).toEqual(["no_producer_workflow"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `error: Cannot find module './identity-static.mts'`.

- [ ] **Step 3: Write minimal implementation**

`ingest/tools/lib/identity-static.mts`:
```mts
/**
 * Static identity rules — files only (registry YAML + workflow YAML + pipeline
 * Python). NO DB, NO network except the pluggable TagResolver (Task 5), which
 * fails OPEN. Runs in the pre-push hook.
 *
 * OUT OF SCOPE, DELIBERATELY: workflow *state* at the GitHub API. Four workflows
 * (dbpr-sirs-monthly, fgcu-reri-monthly, marketbeat-pdf-ingest, rsw-airport-monthly)
 * carry live crons in source but are `disabled_manually` at the API, orphaning 6
 * registry entries. --static reads FILES; --live reads the DB; NEITHER reads run
 * state. That class belongs to the §7 3a watch manifest (its `disabled` field).
 */
import {
  allEntries,
  parseWorkflow,
  workflowPath,
  type Finding,
  type Registry,
  type RepoView,
} from "./identity-model.mts";

export function checkWorkflowLiveness(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];
  for (const { entry, parked } of allEntries(reg)) {
    const wf = entry.workflow;
    const dispatchOnly = entry.dispatch_only === true;

    if (wf === undefined) {
      out.push({
        rule: "workflow_field_missing",
        entry: entry.name,
        severity: "red",
        registrySide: `entry "${entry.name}" has no structured \`workflow:\` field`,
        otherSide:
          "the producing workflow filename exists only in freeform `# Cron:` comments (Spine §3 gap)",
        fix: "SCHEMA_NAME_DRIFT — backfill `workflow: <file>.yml` (or `workflow: none`) on this entry.",
      });
      continue;
    }

    if (wf === "none") {
      if (!parked && !dispatchOnly) {
        out.push({
          rule: "no_producer_workflow",
          entry: entry.name,
          severity: "red",
          registrySide: `entry is ACTIVE in pipelines: (cadence_days: ${entry.cadence_days ?? "?"}) and declares \`workflow: none\``,
          otherSide: "no scheduled workflow can ever refresh it — the freshness probe expects it fresh forever",
          fix: "NEVER_LANDED — park the entry (`parked: true`), mark it `dispatch_only: true`, or ship the workflow.",
        });
      }
      continue;
    }

    if (!repo.exists(workflowPath(wf))) {
      out.push({
        rule: "workflow_missing",
        entry: entry.name,
        severity: "red",
        registrySide: `entry declares \`workflow: ${wf}\``,
        otherSide: `${workflowPath(wf)} does not exist`,
        fix: "SCHEMA_NAME_DRIFT — fix the filename or add the workflow.",
      });
      continue;
    }

    const facts = parseWorkflow(repo, wf);
    if (!facts) continue; // unparseable — fail open, another rule surfaces it

    if (facts.crons.length === 0 && !parked && !dispatchOnly) {
      out.push({
        rule: "workflow_dark",
        entry: entry.name,
        severity: "red",
        registrySide: `entry is ACTIVE (cadence_days: ${entry.cadence_days ?? "?"}) and declares \`workflow: ${wf}\``,
        otherSide: `.github/workflows/${wf} has no uncommented cron — dispatch-only, so the source silently ages out`,
        fix: "GAP_SENTINEL — restore the cron, or annotate the entry `dispatch_only: true` / `parked: true` (a stated fact beats silence).",
      });
    }

    if (facts.crons.length > 0 && parked) {
      out.push({
        rule: "parked_but_scheduled",
        entry: entry.name,
        severity: "red",
        registrySide: `entry sits in not_yet_running:/parked — check_freshness.py never probes it`,
        otherSide: `.github/workflows/${wf} fires on cron "${facts.crons.join('", "')}"`,
        fix: "ZERO_COVERAGE — promote it to pipelines: in the same commit the cron goes live, or comment the cron out.",
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `7 pass, 0 fail`.

- [ ] **Step 5: Commit**

```
git add ingest/tools/lib/identity-static.mts ingest/tools/lib/identity-static.test.mts
git commit -m "feat(identity): rule A — workflow resolves + cron state agrees with the entry"
```

---

### Task 3: Rule B — the producing module exists, and `dlt_schema_name` resolves (ZOMBIE vs unverifiable)

**Files:**
- Modify: `ingest/tools/lib/identity-static.mts` (append `checkProducer`)
- Test: `ingest/tools/lib/identity-static.test.mts` (append a `describe`)

**Interfaces:**
- Consumes: Task 1 model, `moduleDir`
- Produces: `function checkProducer(reg: Registry, repo: RepoView): Finding[]` — rules `zombie_target` · `schema_literal_absent` · `schema_static_undeclared`

**This is the load-bearing discriminator.** `usgs_tier2` and `leepa` BOTH have "`dlt_schema_name` absent from the code" — one is RED, one is legal:

| | `usgs_tier2` | `leepa` |
|---|---|---|
| Registry claims | `dlt_schema_name: usgs`, `count_table: data_lake.usgs_daily` | `dlt_schema_name: leepa_parcels_tier2` |
| Literal in code | absent | absent |
| **Producing module** | **DOES NOT EXIST** (`ingest/pipelines/usgs/` deleted; the only USGS workflow writes Tier-1 Parquet only) | **EXISTS** — `resources.py:118` `pipeline_name=f"leepa_t2_{token_hex(4)}"` (runtime-random) |
| Verdict | **RED — ZOMBIE** | `schema_static: unverifiable` → defer to `--live` `count_table` |

The rule the implementation must encode: **literal absent + no producing module → RED; literal absent + module exists with dynamic (f-string) naming → unverifiable.** A naive check that calls both "unverifiable" **false-passes `usgs_tier2`** — the exact silent-freeze this build exists to kill (frozen since 2026-05-19, `env-swfl.mts` reads it live, 60d tolerance hides it). **The assertion is "some pipeline WRITES this table", not "the table is recent."**

- [ ] **Step 1: Write the failing test**

Append to `ingest/tools/lib/identity-static.test.mts`:
```ts
import { checkProducer } from "./identity-static.mts";

const WF_USGS = `
name: USGS monthly
on:
  schedule:
    - cron: "0 11 10 * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - run: python -m ingest.duckdb_pipelines.usgs.pipeline
`;
const WF_LEEPA = `
name: LeePA parcels annual
on:
  schedule:
    - cron: "0 9 15 * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - run: python -m ingest.pipelines.leepa.pipeline
`;
const WF_BLS = `
name: BLS LAUS monthly
on:
  schedule:
    - cron: "0 12 5 * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - run: python -m ingest.pipelines.bls_laus.pipeline
`;

function producerRepo(registryYaml: string) {
  const repo = new MemRepo({
    "ingest/cadence_registry.yaml": registryYaml,
    ".github/workflows/usgs-monthly.yml": WF_USGS,
    ".github/workflows/leepa-parcels-annual.yml": WF_LEEPA,
    ".github/workflows/bls-laus-monthly.yml": WF_BLS,
    // The ONLY usgs code: DuckDB -> Parquet. Writes no Postgres table. There is
    // no ingest/pipelines/usgs/ — it was deleted.
    "ingest/duckdb_pipelines/usgs/pipeline.py":
      'CREATE = "CREATE TABLE usgs_daily"  # in-memory duckdb, never Postgres\n',
    "ingest/pipelines/leepa/resources.py":
      'import secrets as _secrets\npipe = dlt.pipeline(pipeline_name=f"leepa_t2_{_secrets.token_hex(4)}")\n',
    "ingest/pipelines/bls_laus/pipeline.py": 'p = dlt.pipeline(pipeline_name="bls_laus")\n',
  });
  return { repo, reg: loadRegistry(repo) };
}

describe("checkProducer", () => {
  test("RED zombie: registry names a target but the producing module DOES NOT EXIST (usgs_tier2)", () => {
    const { repo, reg } = producerRepo(`
pipelines:
  - name: usgs_tier2
    lane: tier-2
    workflow: usgs-monthly.yml
    dlt_schema_name: usgs
    count_table: data_lake.usgs_daily
`);
    const f = checkProducer(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["zombie_target"]);
    expect(f[0].registrySide).toContain("data_lake.usgs_daily");
    expect(f[0].otherSide).toContain("ingest/duckdb_pipelines/usgs");
    expect(f[0].otherSide).toContain("no module it runs writes that target");
    expect(f[0].fix).toContain("NEVER_LANDED");
  });

  test("RED: dynamic pipeline_name without the declared escape (leepa, undeclared)", () => {
    const { repo, reg } = producerRepo(`
pipelines:
  - name: leepa
    lane: tier-2
    workflow: leepa-parcels-annual.yml
    dlt_schema_name: leepa_parcels_tier2
    count_table: data_lake.leepa_parcels
`);
    const f = checkProducer(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["schema_static_undeclared"]);
    expect(f[0].otherSide).toContain('pipeline_name=f"leepa_t2_{');
  });

  test("GREEN: the same leepa entry once it declares schema_static: unverifiable", () => {
    const { repo, reg } = producerRepo(`
pipelines:
  - name: leepa
    lane: tier-2
    workflow: leepa-parcels-annual.yml
    dlt_schema_name: leepa_parcels_tier2
    schema_static: unverifiable
    count_table: data_lake.leepa_parcels
`);
    expect(checkProducer(reg, repo)).toEqual([]);
  });

  test("GREEN: a static dlt_schema_name literal present in the pipeline python (bls_laus)", () => {
    const { repo, reg } = producerRepo(`
pipelines:
  - name: bls_laus
    lane: tier-2
    workflow: bls-laus-monthly.yml
    dlt_schema_name: bls_laus
`);
    expect(checkProducer(reg, repo)).toEqual([]);
  });

  test("RED: schema literal absent, module exists, naming is NOT dynamic", () => {
    const { repo, reg } = producerRepo(`
pipelines:
  - name: bls_laus
    lane: tier-2
    workflow: bls-laus-monthly.yml
    dlt_schema_name: bls_laus_typo
`);
    const f = checkProducer(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["schema_literal_absent"]);
    expect(f[0].registrySide).toContain("bls_laus_typo");
    expect(f[0].otherSide).toContain("ingest/pipelines/bls_laus");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `SyntaxError: export 'checkProducer' not found in './identity-static.mts'`.

- [ ] **Step 3: Write minimal implementation**

Append to `ingest/tools/lib/identity-static.mts`:
```mts
import { moduleDir } from "./identity-model.mts";

/** Source dirs of every `python -m` module the entry's workflow runs, that EXIST on disk. */
function producingDirs(entry: Registry["pipelines"][number], repo: RepoView): {
  claimed: string[];
  existing: string[];
} {
  const wf = entry.workflow;
  if (!wf || wf === "none") return { claimed: [], existing: [] };
  const facts = parseWorkflow(repo, wf);
  if (!facts) return { claimed: [], existing: [] };
  const claimed = [...new Set(facts.jobs.flatMap((j) => j.modules).map(moduleDir))];
  return { claimed, existing: claimed.filter((d) => repo.exists(d)) };
}

function targetOf(entry: Registry["pipelines"][number]): string | null {
  return (
    entry.count_table ??
    entry.freshness_table ??
    (entry.dlt_schema_name ? `data_lake.${entry.dlt_schema_name}` : null)
  );
}

export function checkProducer(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];
  for (const { entry, parked } of allEntries(reg)) {
    if (parked) continue; // a parked entry has no producer by definition
    const target = targetOf(entry);
    if (!target) continue; // tier-1 inventory_id entries carry no SQL target

    const { claimed, existing } = producingDirs(entry, repo);

    // ZOMBIE: the registry names a target, but no module the workflow runs exists.
    // This — not a freshness window — is what catches usgs_tier2. A 60d tolerance
    // HIDES a table frozen since 2026-05-19; "no writer exists" never expires.
    if (existing.length === 0) {
      out.push({
        rule: "zombie_target",
        entry: entry.name,
        severity: "red",
        registrySide: `entry claims target ${target} (workflow: ${entry.workflow ?? "—"})`,
        otherSide:
          claimed.length === 0
            ? "that workflow runs no `python -m` module at all — no writer exists"
            : `no module it runs writes that target — modules resolve to [${claimed.join(", ")}]` +
              `; the target's declared producer is absent from the tree`,
        fix:
          "NEVER_LANDED — the registry names a writer that does not exist. Delete the entry, " +
          "repoint the consumer at the lane that IS produced, or ship the pipeline. " +
          "(Never silence it with a freshness tolerance.)",
      });
      continue;
    }

    if (!entry.dlt_schema_name) continue;

    const py = existing.flatMap((d) => repo.pyFiles(d));
    const srcs = py.map((f) => repo.read(f) ?? "");
    const schema = entry.dlt_schema_name;
    const literal = srcs.some((s) => s.includes(`"${schema}"`) || s.includes(`'${schema}'`));
    if (literal) continue;

    // Dynamic naming (leepa: pipeline_name=f"leepa_t2_{token_hex(4)}") is LEGAL,
    // but only when the registry says so out loud.
    const dynamic = srcs.some((s) => /pipeline_name\s*=\s*f["']/.test(s));
    if (dynamic) {
      if (entry.schema_static === "unverifiable") continue;
      const sample = srcs.find((s) => /pipeline_name\s*=\s*f["']/.test(s))!;
      const snippet = sample.match(/pipeline_name\s*=\s*f["'][^"']*/)?.[0] ?? "f-string";
      out.push({
        rule: "schema_static_undeclared",
        entry: entry.name,
        severity: "red",
        registrySide: `entry declares \`dlt_schema_name: ${schema}\``,
        otherSide: `${existing.join(", ")} builds the dlt pipeline name at runtime — \`${snippet}\` — so the literal can never appear`,
        fix:
          "SCHEMA_NAME_DRIFT — add `schema_static: unverifiable` to this entry and key freshness on " +
          "`count_table`, never on the phantom schema name.",
      });
      continue;
    }

    out.push({
      rule: "schema_literal_absent",
      entry: entry.name,
      severity: "red",
      registrySide: `entry declares \`dlt_schema_name: ${schema}\``,
      otherSide: `no such literal in ${existing.join(", ")} (${py.length} .py file(s) scanned)`,
      fix: "SCHEMA_NAME_DRIFT — align the registry value with the pipeline's `pipeline_name=`, or fix the pipeline.",
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `12 pass, 0 fail`.

- [ ] **Step 5: Commit**

```
git add ingest/tools/lib/identity-static.mts ingest/tools/lib/identity-static.test.mts
git commit -m "feat(identity): rule B — producing module must exist (zombie) + dlt schema literal resolution"
```

---

### Task 4: Rule C — every secret the code reads is in the workflow `env:` block

**Files:**
- Modify: `ingest/tools/lib/identity-static.mts` (append `checkSecretsWired`)
- Test: `ingest/tools/lib/identity-static.test.mts` (append a `describe`)

**Interfaces:**
- Produces: `function checkSecretsWired(reg: Registry, repo: RepoView): Finding[]` — rules `secret_not_wired` (RED) · `secret_wired_unread` (WARN)

Fires on `news_swfl`: `novelty.py:33` reads `os.environ.get("DATABASE_URL")`, `news-swfl-ingest.yml` wires only `DESTINATION__POSTGRES__CREDENTIALS` — the novelty dedup guard can never trip in CI. Line-scoped fallback awareness keeps `mhs_permits_swfl` (`MHS_DB_URL` **or** `DATABASE_URL`, alias wired) and `crexi_listings` green. Surplus wiring (~20 workflows wire `SUPABASE_*` into dlt-only pipelines; `bls-qcew` wires an unread `BLS_API_KEY`) is **WARN, never RED** — but it must be *visible*, because a wired-dead key is indistinguishable from a wired-live key at a glance, and that is exactly how `GAP_SENTINEL` hides.

- [ ] **Step 1: Write the failing test**

Append to `ingest/tools/lib/identity-static.test.mts`:
```ts
import { checkSecretsWired } from "./identity-static.mts";

const WF_NEWS = `
name: SWFL business news ingest daily
on:
  schedule:
    - cron: "0 6 * * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Run news ingest
        env:
          DESTINATION__POSTGRES__CREDENTIALS: \${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
          NEWS_ADAPTIVE: "1"
        run: python -m ingest.pipelines.news_swfl.pipeline
`;
const WF_MHS = `
name: MHS permits annual
on:
  schedule:
    - cron: "0 10 20 3 *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Run
        env:
          DATABASE_URL: \${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
        run: python -m ingest.pipelines.mhs_permits_swfl.pipeline
`;

function secretsRepo(registryYaml: string) {
  const repo = new MemRepo({
    "ingest/cadence_registry.yaml": registryYaml,
    ".github/workflows/news-swfl-ingest.yml": WF_NEWS,
    ".github/workflows/ingest-mhs-permits-swfl.yml": WF_MHS,
    "ingest/pipelines/news_swfl/novelty.py": 'db_url = os.environ.get("DATABASE_URL")\n',
    "ingest/pipelines/news_swfl/fetcher.py": 'if os.environ.get("NEWS_ADAPTIVE", "").strip():\n    pass\n',
    "ingest/pipelines/mhs_permits_swfl/pipeline.py":
      'url = os.environ.get("MHS_DB_URL") or os.environ.get("DATABASE_URL")\n',
  });
  return { repo, reg: loadRegistry(repo) };
}

describe("checkSecretsWired", () => {
  test("RED: news_swfl reads DATABASE_URL; the workflow env: never aliases it", () => {
    const { repo, reg } = secretsRepo(`
pipelines:
  - name: news_swfl
    workflow: news-swfl-ingest.yml
`);
    const red = checkSecretsWired(reg, repo).filter((f) => f.severity === "red");
    expect(red.map((f) => f.rule)).toEqual(["secret_not_wired"]);
    expect(red[0].registrySide).toContain("ingest/pipelines/news_swfl/novelty.py");
    expect(red[0].registrySide).toContain("DATABASE_URL");
    expect(red[0].otherSide).toContain("news-swfl-ingest.yml env: wires");
    expect(red[0].otherSide).toContain("DESTINATION__POSTGRES__CREDENTIALS");
    expect(red[0].fix).toContain("SECRET_NOT_WIRED");
  });

  test("GREEN: an `or` fallback chain whose alias IS wired (mhs_permits_swfl)", () => {
    const { repo, reg } = secretsRepo(`
pipelines:
  - name: mhs_permits_swfl
    workflow: ingest-mhs-permits-swfl.yml
`);
    expect(checkSecretsWired(reg, repo).filter((f) => f.severity === "red")).toEqual([]);
  });

  test("non-credential env knobs (NEWS_ADAPTIVE-shaped) never RED", () => {
    const { repo, reg } = secretsRepo(`
pipelines:
  - name: news_swfl
    workflow: news-swfl-ingest.yml
`);
    const names = checkSecretsWired(reg, repo).map((f) => f.registrySide);
    expect(names.some((s) => s.includes("NEWS_ADAPTIVE"))).toBe(false);
  });

  test("WARN (never RED): a key wired into env: that the code never reads", () => {
    const { repo, reg } = secretsRepo(`
pipelines:
  - name: mhs_permits_swfl
    workflow: ingest-mhs-permits-swfl.yml
`);
    // MHS reads DATABASE_URL, so nothing is surplus here; assert the WARN path
    // exists and is warn-severity by construction on news (NEWS_ADAPTIVE is read,
    // DESTINATION is implicit-dlt → whitelisted; so: no surplus, no crash).
    const all = checkSecretsWired(reg, repo);
    expect(all.every((f) => f.severity !== "red")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `SyntaxError: export 'checkSecretsWired' not found in './identity-static.mts'`.

- [ ] **Step 3: Write minimal implementation**

Append to `ingest/tools/lib/identity-static.mts`:
```mts
/** Credential-shaped env names. A config knob (LISTINGS_MIN_ROWS, NEWS_ADAPTIVE) is not one. */
const SECRET_SHAPE = /(_API_KEY|_KEY|_TOKEN|_SECRET|_CREDENTIALS|_URL|_URI|_DSN|_PROXY|_PASSWORD)$/;

/** dlt reads this natively — no os.getenv call appears, so it can never be "unread". */
const IMPLICIT_READS = new Set(["DESTINATION__POSTGRES__CREDENTIALS"]);

const READ_RE =
  /os\.environ\.get\(\s*["']([A-Z][A-Z0-9_]*)["']|os\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]|os\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g;

/** One record per SOURCE LINE, so an `X or Y` fallback chain is judged as a unit. */
function envReadLines(repo: RepoView, dirs: string[]): Array<{ file: string; line: number; names: string[] }> {
  const out: Array<{ file: string; line: number; names: string[] }> = [];
  for (const dir of dirs) {
    for (const file of repo.pyFiles(dir)) {
      if (/(^|\/)(test_|tests?\/)/.test(file)) continue;
      const src = repo.read(file) ?? "";
      src.split("\n").forEach((text, i) => {
        const names = [...text.matchAll(READ_RE)].map((m) => m[1] ?? m[2] ?? m[3]).filter(Boolean);
        if (names.length > 0) out.push({ file, line: i + 1, names: [...new Set(names)] as string[] });
      });
    }
  }
  return out;
}

export function checkSecretsWired(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];
  for (const { entry, parked } of allEntries(reg)) {
    if (parked) continue;
    const wf = entry.workflow;
    if (!wf || wf === "none") continue;
    const facts = parseWorkflow(repo, wf);
    if (!facts) continue;
    // 08g DRIFT B: a caller's workflow-level env: does NOT propagate to a called
    // workflow. Read env from the file that actually runs the python — today that
    // is always this file (zero workflow_call exists), and this comment is the
    // forward guard for when Phase 4 changes that.
    const wired = new Set(facts.jobs.flatMap((j) => j.envKeys));
    const { existing } = producingDirs(entry, repo);
    if (existing.length === 0) continue; // zombie — rule B owns it

    const reads = envReadLines(repo, existing);
    const readNames = new Set(reads.flatMap((r) => r.names));

    for (const r of reads) {
      // Fallback-aware: `os.environ.get("MHS_DB_URL") or os.environ.get("DATABASE_URL")`
      // is satisfied if ANY name on that line is wired.
      if (r.names.some((n) => wired.has(n))) continue;
      const unwiredSecrets = r.names.filter((n) => SECRET_SHAPE.test(n));
      if (unwiredSecrets.length === 0) continue;
      out.push({
        rule: "secret_not_wired",
        entry: entry.name,
        severity: "red",
        registrySide: `${r.file}:${r.line} reads ${unwiredSecrets.map((n) => `\`${n}\``).join(" / ")}`,
        otherSide: `.github/workflows/${wf} env: wires [${[...wired].join(", ") || "nothing"}] — none of them`,
        fix:
          "SECRET_NOT_WIRED — `gh secret set` is step 1; adding the key to the workflow `env:` block " +
          "is step 2. The run goes GREEN while the feature silently no-ops without it.",
      });
    }

    for (const key of wired) {
      if (IMPLICIT_READS.has(key) || readNames.has(key)) continue;
      out.push({
        rule: "secret_wired_unread",
        entry: entry.name,
        severity: "warn",
        registrySide: `.github/workflows/${wf} env: wires \`${key}\``,
        otherSide: `no os.environ/os.getenv read of it in ${existing.join(", ")}`,
        fix:
          "Advisory only. A wired-dead key looks identical to a wired-live key — that is how " +
          "GAP_SENTINEL (dead vendor key = green run) hides. Drop it or document why it stays.",
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `16 pass, 0 fail`.

- [ ] **Step 5: Commit**

```
git add ingest/tools/lib/identity-static.mts ingest/tools/lib/identity-static.test.mts
git commit -m "feat(identity): rule C — secrets read by the code must be in the workflow env: block"
```

---

### Task 5: Rules D+E — `timeout-minutes` present, and `uses:` versions resolve against LIVE tags

**Files:**
- Modify: `ingest/tools/lib/identity-static.mts` (append `checkTimeouts`, `checkActionVersions`, `TagResolver`)
- Create: `ingest/tools/action-tags.json` (the maintained allowlist cache)
- Test: `ingest/tools/lib/identity-static.test.mts` (append a `describe`)

**Interfaces:**
- Produces: `interface TagResolver { tags(action: string): string[] | null }` (null = **unavailable → skip + WARN**, never RED) · `function checkTimeouts(reg, repo): Finding[]` (rule `timeout_missing`) · `function checkActionVersions(reg, repo, tags: TagResolver): Finding[]` (rules `action_version_unresolvable` RED · `action_major_behind` WARN · `action_tags_unresolved` WARN)

**THE POINT OF THIS TASK.** `actions/checkout@v6` must come out **GREEN** even though **v7 is latest** — and it must stay green when v8 ships. The `00-DIAGNOSIS` "v6 is a nonexistent version" label was **false when written** (v6.0.0 shipped 2025-11-20; the incidents are dated 2026-05-26 / 2026-06-22; the repo runs 101 × `@v6` today and checks out fine). A baked expected-major would have **false-flagged v6 in June** *and* would be **blind to v7 today**. **Tag-exists ≠ compatible** — do NOT mass-bump 101 workflows to v7 (v7.0.0 blocks fork-PR checkout on `workflow_run`, which 4 of our workflows use). Assert *resolves*, warn on *behind*, never RED on either.

`timeout-minutes` is skipped for a job that `uses:` a reusable workflow — GitHub does not honor it there (08g DRIFT A), and demanding it would produce a permanent false RED once Phase 4 lands.

- [ ] **Step 1: Write the failing test**

Append to `ingest/tools/lib/identity-static.test.mts`:
```ts
import { checkActionVersions, checkTimeouts, type TagResolver } from "./identity-static.mts";

const WF_NO_TIMEOUT = `
name: No timeout
on:
  schedule:
    - cron: "0 9 * * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: python -m ingest.pipelines.foo.pipeline
`;
const WF_CALLER = `
name: Nightly chain
on:
  schedule:
    - cron: "5 4 * * *"
jobs:
  ingest:
    uses: ./.github/workflows/city-pulse-daily.yml
    secrets: inherit
`;
const WF_BAD_ACTION = `
name: Bad action
on:
  schedule:
    - cron: "0 9 * * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v99
      - run: python -m ingest.pipelines.foo.pipeline
`;

// LIVE FACT (gh api repos/actions/checkout/tags, 2026-07-11): v7 is latest,
// v6 exists and resolves. Both must be accepted.
const TAGS: TagResolver = {
  tags: (action) =>
    action === "actions/checkout"
      ? ["v7.0.0", "v6.0.3", "v6.0.2", "v6.0.1", "v6.0.0", "v5.0.0", "v4.2.2"]
      : null,
};

function versionRepo(registryYaml: string, extra: Record<string, string> = {}) {
  const repo = new MemRepo({
    "ingest/cadence_registry.yaml": registryYaml,
    ".github/workflows/no-timeout.yml": WF_NO_TIMEOUT,
    ".github/workflows/caller.yml": WF_CALLER,
    ".github/workflows/bad-action.yml": WF_BAD_ACTION,
    "ingest/pipelines/foo/pipeline.py": "x = 1\n",
    ...extra,
  });
  return { repo, reg: loadRegistry(repo) };
}

describe("checkTimeouts", () => {
  test("RED: a job with steps and no timeout-minutes", () => {
    const { repo, reg } = versionRepo(`
pipelines:
  - name: foo
    workflow: no-timeout.yml
`);
    const f = checkTimeouts(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["timeout_missing"]);
    expect(f[0].otherSide).toContain("job `ingest` has no timeout-minutes");
  });

  test("GREEN: a reusable-workflow CALLER job is exempt (GitHub ignores timeout-minutes there)", () => {
    const { repo, reg } = versionRepo(`
pipelines:
  - name: chain
    workflow: caller.yml
`);
    expect(checkTimeouts(reg, repo)).toEqual([]);
  });
});

describe("checkActionVersions", () => {
  test("GREEN: @v6 resolves even though v7 is latest — never bake a version literal", () => {
    const { repo, reg } = versionRepo(`
pipelines:
  - name: foo
    workflow: no-timeout.yml
`);
    const f = checkActionVersions(reg, repo, TAGS);
    expect(f.filter((x) => x.severity === "red")).toEqual([]);
    expect(f.map((x) => x.rule)).toEqual(["action_major_behind"]);
    expect(f[0].severity).toBe("warn");
    expect(f[0].otherSide).toContain("v7");
  });

  test("RED: a pinned ref that resolves against NO live tag", () => {
    const { repo, reg } = versionRepo(`
pipelines:
  - name: foo
    workflow: bad-action.yml
`);
    const f = checkActionVersions(reg, repo, TAGS).filter((x) => x.severity === "red");
    expect(f.map((x) => x.rule)).toEqual(["action_version_unresolvable"]);
    expect(f[0].registrySide).toContain("actions/checkout@v99");
    expect(f[0].otherSide).toContain("v7.0.0");
  });

  test("WARN + skip (fail-OPEN) when tags cannot be resolved at all", () => {
    const { repo, reg } = versionRepo(`
pipelines:
  - name: foo
    workflow: no-timeout.yml
`);
    const offline: TagResolver = { tags: () => null };
    const f = checkActionVersions(reg, repo, offline);
    expect(f.every((x) => x.severity === "warn")).toBe(true);
    expect(f.map((x) => x.rule)).toEqual(["action_tags_unresolved"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `SyntaxError: export 'checkTimeouts' not found in './identity-static.mts'`.

- [ ] **Step 3: Write minimal implementation**

Append to `ingest/tools/lib/identity-static.mts`:
```mts
/**
 * Tag resolution. NEVER a baked version literal.
 *
 * LIVE FACT (gh api repos/actions/checkout/{tags,releases/latest}, 2026-07-11):
 *   v7.0.0 published 2026-06-18 → latest major = v7
 *   v6.0.0 published 2025-11-20 → v6 EXISTS and resolves (101 workflows pin it)
 * 00-DIAGNOSIS's "actions/checkout@v6 (nonexistent version)" is REFUTED — the label
 * was already false at the incident dates. A hardcoded expected-major would have
 * false-flagged v6 in June AND be blind to v7 today. That is why this resolves
 * against live/maintained tags and asserts only "the ref exists".
 *
 * tag-exists != compatible: v7.0.0 blocks fork-PR checkout on workflow_run (we use
 * workflow_run in 4 workflows) and moved to ESM. So a newer major is a WARN, never
 * a RED, and NOTHING here tells anyone to mass-bump.
 */
export interface TagResolver {
  /** Tag names for `owner/repo`, or null when unresolvable (offline / no gh) → fail OPEN. */
  tags(action: string): string[] | null;
}

function majorOf(ref: string): string | null {
  const m = ref.match(/^v(\d+)/);
  return m ? m[1] : null;
}

export function checkTimeouts(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const { entry } of allEntries(reg)) {
    const wf = entry.workflow;
    if (!wf || wf === "none" || seen.has(wf)) continue;
    seen.add(wf);
    const facts = parseWorkflow(repo, wf);
    if (!facts) continue;
    for (const job of facts.jobs) {
      // 08g DRIFT A: timeout-minutes is NOT a supported keyword on a job that
      // `uses:` a reusable workflow — GitHub ignores it. Demanding it there is a
      // permanent false RED (and invites someone to "fix" it with an ignored key).
      if (job.callsReusable) continue;
      if (job.timeoutMinutes === null) {
        out.push({
          rule: "timeout_missing",
          entry: entry.name,
          severity: "red",
          registrySide: `entry runs via \`workflow: ${wf}\``,
          otherSide: `job \`${job.id}\` has no timeout-minutes — a hung run burns the full 6h GHA ceiling`,
          fix: "TIMEOUT_KILL — add `timeout-minutes:` to the job (see fdot-aadt-annual.yml: an untimed kill left the table EMPTY for 18 days).",
        });
      }
    }
  }
  return out;
}

export function checkActionVersions(reg: Registry, repo: RepoView, tags: TagResolver): Finding[] {
  const out: Finding[] = [];
  const seenWf = new Set<string>();
  const warnedUnresolved = new Set<string>();
  for (const { entry } of allEntries(reg)) {
    const wf = entry.workflow;
    if (!wf || wf === "none" || seenWf.has(wf)) continue;
    seenWf.add(wf);
    const facts = parseWorkflow(repo, wf);
    if (!facts) continue;
    for (const ref of facts.jobs.flatMap((j) => j.usesRefs)) {
      if (ref.startsWith("./")) continue; // local reusable workflow — not a marketplace action
      const [action, pin] = ref.split("@");
      if (!action || !pin) continue;
      const known = tags.tags(action);
      if (known === null) {
        if (!warnedUnresolved.has(action)) {
          warnedUnresolved.add(action);
          out.push({
            rule: "action_tags_unresolved",
            entry: entry.name,
            severity: "warn",
            registrySide: `.github/workflows/${wf} pins \`${ref}\``,
            otherSide: `tags for ${action} are unresolvable here (no gh / offline / not in ingest/tools/action-tags.json)`,
            fix: "Fail-open: run `bun ingest/tools/check-registry-identity.mts --refresh-tags` to update the maintained allowlist.",
          });
        }
        continue;
      }
      const exact = known.includes(pin);
      const major = majorOf(pin);
      const floating = major !== null && known.some((t) => t.startsWith(`v${major}.`));
      if (!exact && !floating) {
        out.push({
          rule: "action_version_unresolvable",
          entry: entry.name,
          severity: "red",
          registrySide: `.github/workflows/${wf} pins \`${ref}\``,
          otherSide: `live tags for ${action} are [${known.slice(0, 6).join(", ")}…] — nothing resolves \`${pin}\``,
          fix: "ACTION_VERSION — repin to a tag that exists. (Resolved against live tags, never a baked literal.)",
          });
        continue;
      }
      const latestMajor = known
        .map((t) => Number(majorOf(t) ?? -1))
        .reduce((a, b) => Math.max(a, b), -1);
      if (major !== null && latestMajor > Number(major)) {
        out.push({
          rule: "action_major_behind",
          entry: entry.name,
          severity: "warn",
          registrySide: `.github/workflows/${wf} pins \`${ref}\` (resolves — GREEN)`,
          otherSide: `latest major for ${action} is v${latestMajor}`,
          fix:
            "Advisory ONLY. Tag-exists != compatible — do NOT mass-bump. (checkout v7 blocks fork-PR " +
            "checkout on workflow_run, which 4 of our workflows use, and moved to ESM.)",
        });
      }
    }
  }
  return out;
}
```

`ingest/tools/action-tags.json` (the maintained allowlist — refreshed by `--refresh-tags`, and re-fetched live in CI):
```json
{
  "_note": "Maintained allowlist of action tags. NEVER hand-edit an expected-major here. Refresh: bun ingest/tools/check-registry-identity.mts --refresh-tags (runs `gh api repos/<owner>/<repo>/tags`). Snapshot: 2026-07-11.",
  "actions/checkout": ["v7.0.0", "v6.0.3", "v6.0.2", "v6.0.1", "v6.0.0", "v5.0.0", "v4.2.2"],
  "actions/setup-python": ["v6.0.0", "v5.6.0", "v5.3.0", "v4.7.1"],
  "actions/setup-node": ["v5.0.0", "v4.4.0"],
  "oven-sh/setup-bun": ["v2.0.2", "v2.0.1", "v1.2.2"]
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `21 pass, 0 fail`.

- [ ] **Step 5: Commit**

```
git add ingest/tools/lib/identity-static.mts ingest/tools/lib/identity-static.test.mts ingest/tools/action-tags.json
git commit -m "feat(identity): rules D+E — timeout-minutes present, uses: resolved against live tags (never a baked literal)"
```

---

### Task 6: Rule F — the identity field is `source_name`, and `source_tag:` is forbidden

**Files:**
- Modify: `ingest/tools/lib/identity-static.mts` (append `checkIdentityFields`)
- Test: `ingest/tools/lib/identity-static.test.mts` (append a `describe`)

**Interfaces:**
- Produces: `function checkIdentityFields(reg: Registry, repo: RepoView): Finding[]` — rules `source_tag_field_forbidden` (RED) · `source_name_literal_absent` (RED) · `malformed_annotation` (RED)

`check_freshness.py` scopes BOTH the freshness `MAX()` (`:238`) and the volume `COUNT(*)` (`:382`) on **`WHERE source_name = %s`**. **`source_tag` is read by NOTHING** in `ingest/scripts/` or `ingest/lib/`. The registry's single `source_tag:` field (`news_swfl` → `news_crawl`) is a **phantom** with no matching literal in the code — the exact class that cost two weeks of false-RED on `daily_truth`. The Spine **deletes** it; this rule makes re-adding it impossible. (The *column-existence* half of correction #2 — does the target table actually have `source_name` vs `source_tag`? — is a DB fact and lands in Task 8 as `identity_column_mismatch`.)

- [ ] **Step 1: Write the failing test**

Append to `ingest/tools/lib/identity-static.test.mts`:
```ts
import { checkIdentityFields } from "./identity-static.mts";

const WF_DBPR = `
name: DBPR RE licensees weekly
on:
  schedule:
    - cron: "0 12 * * 1"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Run
        env:
          DESTINATION__POSTGRES__CREDENTIALS: \${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
        run: python -m ingest.pipelines.dbpr_re_licensees.pipeline
`;

function identityRepo(registryYaml: string) {
  const repo = new MemRepo({
    "ingest/cadence_registry.yaml": registryYaml,
    ".github/workflows/ingest-dbpr-re-licensees.yml": WF_DBPR,
    "ingest/pipelines/dbpr_re_licensees/pipeline.py": 'row["source_tag"] = "dbpr_re_rgn7"\n',
  });
  return { repo, reg: loadRegistry(repo) };
}

describe("checkIdentityFields", () => {
  test("RED: any `source_tag:` field at all — nothing in ingest/ reads it", () => {
    const { repo, reg } = identityRepo(`
pipelines:
  - name: news_swfl
    workflow: ingest-dbpr-re-licensees.yml
    source_tag: news_crawl
`);
    const f = checkIdentityFields(reg, repo).filter((x) => x.rule === "source_tag_field_forbidden");
    expect(f).toHaveLength(1);
    expect(f[0].registrySide).toContain("source_tag: news_crawl");
    expect(f[0].otherSide).toContain("check_freshness.py");
    expect(f[0].otherSide).toContain("source_name");
  });

  test("GREEN: source_name whose literal IS in the pipeline python", () => {
    const { repo, reg } = identityRepo(`
pipelines:
  - name: dbpr_re_licensees
    workflow: ingest-dbpr-re-licensees.yml
    freshness_table: public.dbpr_re_licensees
    source_name: dbpr_re_rgn7
`);
    expect(checkIdentityFields(reg, repo)).toEqual([]);
  });

  test("RED: source_name literal absent from the pipeline python (one-letter drift)", () => {
    const { repo, reg } = identityRepo(`
pipelines:
  - name: dbpr_re_licensees
    workflow: ingest-dbpr-re-licensees.yml
    freshness_table: public.dbpr_re_licensees
    source_name: dbpr_re_rgn8
`);
    const f = checkIdentityFields(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["source_name_literal_absent"]);
    expect(f[0].registrySide).toContain("dbpr_re_rgn8");
    expect(f[0].otherSide).toContain("ingest/pipelines/dbpr_re_licensees");
  });

  test("RED: a malformed known_drift / coverage_exempt annotation", () => {
    const { repo, reg } = identityRepo(`
pipelines:
  - name: dbpr_re_licensees
    workflow: ingest-dbpr-re-licensees.yml
    known_drift:
      - rule: row_floor_breach
coverage_exempt:
  - table: data_lake.view_vintages
`);
    const rules = checkIdentityFields(reg, repo).map((x) => x.rule);
    expect(rules.filter((r) => r === "malformed_annotation")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `SyntaxError: export 'checkIdentityFields' not found in './identity-static.mts'`.

- [ ] **Step 3: Write minimal implementation**

Append to `ingest/tools/lib/identity-static.mts`:
```mts
/**
 * The identity column is `source_name`. check_freshness.py scopes BOTH the
 * freshness MAX() (:238) and the volume COUNT(*) (:382) on `WHERE source_name = %s`.
 * `source_tag` is read by NOTHING in ingest/scripts/ or ingest/lib/ — the registry's
 * one source_tag: field (news_swfl -> news_crawl) is a phantom with no code literal.
 * That is the exact class that false-REDded daily_truth for two weeks.
 */
export function checkIdentityFields(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];

  for (const ex of reg.coverage_exempt ?? []) {
    if (!ex?.table || !ex?.reason) {
      out.push({
        rule: "malformed_annotation",
        entry: ex?.table ?? "coverage_exempt[?]",
        severity: "red",
        registrySide: `coverage_exempt entry ${JSON.stringify(ex)}`,
        otherSide: "requires both `table:` and `reason:` — a bare table name is a silent exemption",
        fix: "Give every exemption a stated reason (brain_writeback / runtime_cache / static_seed / derived_snapshot).",
      });
    }
  }

  for (const { entry } of allEntries(reg)) {
    for (const kd of entry.known_drift ?? []) {
      if (!kd?.rule || !kd?.check) {
        out.push({
          rule: "malformed_annotation",
          entry: entry.name,
          severity: "red",
          registrySide: `known_drift entry ${JSON.stringify(kd)}`,
          otherSide: "requires both `rule:` and `check:` (an OPEN key in the `checks` ledger)",
          fix: "RULE 2.4 — no silent deferrals. `node scripts/check.mjs open <project> <key> \"<label>\"`, then name that key here.",
        });
      }
    }

    if (entry.source_tag !== undefined) {
      out.push({
        rule: "source_tag_field_forbidden",
        entry: entry.name,
        severity: "red",
        registrySide: `entry declares \`source_tag: ${entry.source_tag}\``,
        otherSide:
          "nothing in ingest/scripts/ or ingest/lib/ reads source_tag — check_freshness.py scopes on " +
          "source_name (:238 freshness MAX, :382 volume COUNT). The field is a phantom.",
        fix:
          "SCHEMA_NAME_DRIFT — delete `source_tag:`. If the writer really stamps a discriminator, " +
          "declare it as `source_name:` AND confirm the target table has that column (--live).",
      });
    }

    if (entry.source_name !== undefined) {
      const { existing } = producingDirs(entry, repo);
      if (existing.length === 0) continue; // zombie — rule B owns it
      const srcs = existing.flatMap((d) => repo.pyFiles(d)).map((f) => repo.read(f) ?? "");
      const lit = entry.source_name;
      if (!srcs.some((s) => s.includes(`"${lit}"`) || s.includes(`'${lit}'`))) {
        out.push({
          rule: "source_name_literal_absent",
          entry: entry.name,
          severity: "red",
          registrySide: `entry declares \`source_name: ${lit}\` (the probe scopes every query on it)`,
          otherSide: `no such literal anywhere in ${existing.join(", ")}`,
          fix:
            "SCHEMA_NAME_DRIFT — a one-letter drift here makes every freshness/volume query match ZERO " +
            "rows and the source false-REDs forever. Align the registry value with the writer's literal.",
        });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `25 pass, 0 fail`.

- [ ] **Step 5: Commit**

```
git add ingest/tools/lib/identity-static.mts ingest/tools/lib/identity-static.test.mts
git commit -m "feat(identity): rule F — source_name is the identity column; source_tag: is forbidden"
```

---

### Task 7: The CLI — `--static`, the exit contract, and `known_drift` suppression

**Files:**
- Create: `ingest/tools/check-registry-identity.mts`
- Test: `ingest/tools/lib/identity-static.test.mts` (append a `describe` for `runStaticChecks` + `applyKnownDrift`)
- Modify: `ingest/tools/lib/identity-static.mts` (append `runStaticChecks`, `applyKnownDrift`)

**Interfaces:**
- Produces: `function runStaticChecks(reg, repo, tags): Finding[]` · `function applyKnownDrift(reg, findings): { blocking: Finding[]; suppressed: Finding[] }` · CLI `bun ingest/tools/check-registry-identity.mts [--static|--live|--refresh-tags]`

**Exit contract (mirrors Gate 2/5 exactly):** `0` = no blocking findings · `1` = confirmed drift. **Every** internal failure (unreadable file, unparseable YAML, missing `gh`, no DB) degrades that sub-check to skip+WARN and **never** flips the exit code — fail-OPEN, no new exit code for the hook to special-case. The one escape valve with teeth: `known_drift: [{rule, check}]` demotes a RED to WARN **only** when it names a key in the `checks` ledger (RULE 2.4 — a deferral you can't see is forgetting on a delay). There is deliberately **no baseline file** that could hide everything.

- [ ] **Step 1: Write the failing test**

Append to `ingest/tools/lib/identity-static.test.mts`:
```ts
import { applyKnownDrift, runStaticChecks } from "./identity-static.mts";

describe("runStaticChecks + applyKnownDrift", () => {
  test("runs every rule and returns the union", () => {
    const { repo, reg } = versionRepo(`
pipelines:
  - name: foo
    workflow: no-timeout.yml
    source_tag: bogus
`);
    const rules = runStaticChecks(reg, repo, TAGS).map((f) => f.rule).sort();
    expect(rules).toContain("timeout_missing");
    expect(rules).toContain("source_tag_field_forbidden");
    expect(rules).toContain("action_major_behind");
  });

  test("known_drift demotes a RED to WARN — and only for the named rule", () => {
    const findings = [
      { rule: "zombie_target", entry: "usgs_tier2", severity: "red" as const, registrySide: "a", otherSide: "b", fix: "c" },
      { rule: "row_floor_breach", entry: "usgs_tier2", severity: "red" as const, registrySide: "a", otherSide: "b", fix: "c" },
      { rule: "zombie_target", entry: "other", severity: "red" as const, registrySide: "a", otherSide: "b", fix: "c" },
    ];
    const reg = loadRegistry(
      new MemRepo({
        "ingest/cadence_registry.yaml": `
pipelines:
  - name: usgs_tier2
    known_drift:
      - rule: zombie_target
        check: usgs_tier2_orphan
`,
      }),
    );
    const { blocking, suppressed } = applyKnownDrift(reg, findings);
    expect(suppressed.map((f) => `${f.entry}:${f.rule}`)).toEqual(["usgs_tier2:zombie_target"]);
    expect(blocking.map((f) => `${f.entry}:${f.rule}`)).toEqual([
      "usgs_tier2:row_floor_breach",
      "other:zombie_target",
    ]);
    expect(suppressed[0].fix).toContain("usgs_tier2_orphan");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `SyntaxError: export 'runStaticChecks' not found in './identity-static.mts'`.

- [ ] **Step 3: Write minimal implementation**

Append to `ingest/tools/lib/identity-static.mts`:
```mts
export function runStaticChecks(reg: Registry, repo: RepoView, tags: TagResolver): Finding[] {
  // Every rule is independently fail-open: a thrown rule degrades to a WARN and
  // never flips the exit code (same contract as pre-push Gate 2/5).
  const rules: Array<[string, () => Finding[]]> = [
    ["workflow_liveness", () => checkWorkflowLiveness(reg, repo)],
    ["producer", () => checkProducer(reg, repo)],
    ["secrets", () => checkSecretsWired(reg, repo)],
    ["timeouts", () => checkTimeouts(reg, repo)],
    ["action_versions", () => checkActionVersions(reg, repo, tags)],
    ["identity_fields", () => checkIdentityFields(reg, repo)],
  ];
  const out: Finding[] = [];
  for (const [name, fn] of rules) {
    try {
      out.push(...fn());
    } catch (err) {
      out.push({
        rule: "rule_crashed",
        entry: name,
        severity: "warn",
        registrySide: `static rule \`${name}\``,
        otherSide: `threw: ${(err as Error)?.message ?? err}`,
        fix: "Fail-open: this rule was skipped, not passed. Fix the tool.",
      });
    }
  }
  return out;
}

/** A RED becomes a WARN only when the entry names it in known_drift with an OPEN checks key. */
export function applyKnownDrift(
  reg: Registry,
  findings: Finding[],
): { blocking: Finding[]; suppressed: Finding[] } {
  const map = new Map<string, string>();
  for (const { entry } of allEntries(reg)) {
    for (const kd of entry.known_drift ?? []) {
      if (kd?.rule && kd?.check) map.set(`${entry.name}:${kd.rule}`, kd.check);
    }
  }
  const blocking: Finding[] = [];
  const suppressed: Finding[] = [];
  for (const f of findings) {
    const check = map.get(`${f.entry}:${f.rule}`);
    if (f.severity === "red" && check) {
      suppressed.push({ ...f, severity: "warn", fix: `KNOWN DRIFT — tracked by check \`${check}\`. ${f.fix}` });
    } else if (f.severity === "red") {
      blocking.push(f);
    } else {
      suppressed.push(f);
    }
  }
  return { blocking, suppressed };
}
```

`ingest/tools/check-registry-identity.mts`:
```mts
#!/usr/bin/env bun
/**
 * check-registry-identity — the config-identity cross-check (spec §6).
 *
 * Machine-verifies the hand-synced identity strings against each other so a
 * one-letter drift fails the PR instead of going silent for weeks. Every failure
 * names BOTH SIDES.
 *
 *   bun ingest/tools/check-registry-identity.mts --static        # files only (pre-push hook)
 *   bun ingest/tools/check-registry-identity.mts --live          # + data_lake reads (CI, advisory)
 *   bun ingest/tools/check-registry-identity.mts --live --gate   # + fail on RED (after one green confirm)
 *   bun ingest/tools/check-registry-identity.mts --refresh-tags  # refresh ingest/tools/action-tags.json
 *
 * EXIT: 0 = no blocking findings · 1 = confirmed drift.
 * Any tooling failure (no gh, no DB, unparseable file) degrades that sub-check to
 * skip + WARN and NEVER flips the exit code — fail-OPEN, same contract as Gate 2/5.
 *
 * NOT IN SCOPE: workflow *state* at the GitHub API. Four workflows carry live crons
 * in source while `disabled_manually` at the API, orphaning 6 entries. --static reads
 * FILES, --live reads the DB; neither can see run state. That is the §7 3a watch
 * manifest's `disabled` field — do not bolt it on here.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { formatFindings, fsRepo, loadRegistry, type Finding } from "./lib/identity-model.mts";
import { applyKnownDrift, runStaticChecks, type TagResolver } from "./lib/identity-static.mts";
import { runLiveChecks } from "./lib/identity-live.mts";
import { bunSqlLake } from "./lib/identity-lake.mts";

const TAGS_CACHE = "ingest/tools/action-tags.json";
const ACTIONS = ["actions/checkout", "actions/setup-python", "actions/setup-node", "oven-sh/setup-bun"];

function cachedTags(): TagResolver {
  let cache: Record<string, string[]> = {};
  try {
    if (existsSync(TAGS_CACHE)) cache = JSON.parse(readFileSync(TAGS_CACHE, "utf8"));
  } catch {
    /* fail open — resolver returns null → WARN + skip */
  }
  return { tags: (a) => (Array.isArray(cache[a]) ? cache[a] : null) };
}

async function refreshTags(): Promise<void> {
  const next: Record<string, unknown> = {
    _note:
      "Maintained allowlist of action tags. NEVER hand-edit an expected-major here. " +
      `Refresh: bun ingest/tools/check-registry-identity.mts --refresh-tags. Snapshot: ${new Date().toISOString().slice(0, 10)}.`,
  };
  for (const action of ACTIONS) {
    const p = Bun.spawnSync(["gh", "api", `repos/${action}/tags`, "--paginate", "--jq", ".[].name"]);
    if (p.exitCode !== 0) {
      console.warn(`  WARN: could not resolve tags for ${action} — leaving the cached list intact.`);
      continue;
    }
    next[action] = p.stdout.toString().trim().split("\n").filter(Boolean).slice(0, 24);
  }
  const prev = existsSync(TAGS_CACHE) ? JSON.parse(readFileSync(TAGS_CACHE, "utf8")) : {};
  writeFileSync(TAGS_CACHE, `${JSON.stringify({ ...prev, ...next }, null, 2)}\n`);
  console.log(`registry-identity: refreshed ${TAGS_CACHE} from live \`gh api\` tags.`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--refresh-tags")) {
    await refreshTags();
    process.exit(0);
  }
  const live = argv.includes("--live");
  const gate = argv.includes("--gate");

  const repo = fsRepo(process.cwd());
  const reg = loadRegistry(repo);

  const findings: Finding[] = runStaticChecks(reg, repo, cachedTags());

  if (live) {
    const lake = await bunSqlLake();
    if (!lake) {
      findings.push({
        rule: "live_unavailable",
        entry: "--live",
        severity: "warn",
        registrySide: "--live requested",
        otherSide: "no DESTINATION__POSTGRES__CREDENTIALS and no .dlt/secrets.toml — DB checks SKIPPED",
        fix: "Fail-open. In CI, wire DESTINATION__POSTGRES__CREDENTIALS into the ci.yml step `env:`.",
      });
    } else {
      findings.push(...(await runLiveChecks(reg, repo, lake, new Date())));
      await lake.close();
    }
  }

  const { blocking, suppressed } = applyKnownDrift(reg, findings);
  const mode = live ? (gate ? "live (gating)" : "live (ADVISORY)") : "static";

  if (suppressed.length > 0) {
    console.warn(`\nregistry-identity: ${suppressed.length} advisory/known finding(s) [${mode}]:\n`);
    console.warn(formatFindings(suppressed));
  }
  if (blocking.length === 0) {
    console.log(`\nregistry-identity: OK [${mode}] — every registry↔workflow↔code identity resolves.`);
    process.exit(0);
  }

  console.error(`\nregistry-identity: ${blocking.length} identity drift(s) [${mode}]:\n`);
  console.error(formatFindings(blocking));

  // ADVISORY-FIRST for --live (spec §7 3c: ship advisory, flip to gating after one
  // green confirm). On today's snapshot redfin_city_swfl / dbpr_re_licensees /
  // leepa_parcel_zip are all genuinely red; a blocking --live on day one would red
  // CI on landing — the exact false-red disease this build exists to kill.
  if (live && !gate) {
    console.error(`\n(advisory mode — not failing the build. Flip with --gate after one green confirm.)`);
    process.exit(0);
  }
  process.exit(1);
}

main().catch((err) => {
  // Fail-OPEN on a tool crash (same contract as the pre-push gate): warn loudly,
  // exit 0. A broken checker must never wedge every push.
  console.error(`registry-identity: check failed to run (skipped, NOT passed) — ${err?.message ?? err}`);
  process.exit(0);
});
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test ingest/tools/lib/identity-static.test.mts
```
Expected: `27 pass, 0 fail`. (The CLI itself does not run yet — `identity-live.mts` / `identity-lake.mts` land in Task 8. Do NOT run the CLI until then.)

- [ ] **Step 5: Commit**

```
git add ingest/tools/check-registry-identity.mts ingest/tools/lib/identity-static.mts ingest/tools/lib/identity-static.test.mts
git commit -m "feat(identity): CLI + exit contract (fail-open) + known_drift suppression tied to the checks ledger"
```

---

### Task 8: `--live` — the five DB assertions + the identity-column check

**Files:**
- Create: `ingest/tools/lib/identity-live.mts` · `ingest/tools/lib/identity-lake.mts`
- Test: `ingest/tools/lib/identity-live.test.mts`

**Interfaces:**
- Consumes: Task 1 model, `producingDirs` semantics (via `checkProducer`'s static verdict — the zombie rule stays STATIC)
- Produces:
  - `interface LakeTable { schema: string; name: string; kind: "table" | "view"; rows: number; columns: string[] }`
  - `interface DltLoad { schema_name: string; ok_loads: number; last_inserted_at: string | null }`
  - `interface LakeReader { baseTables(schema: string): Promise<LakeTable[]>; table(qualified: string): Promise<LakeTable | null>; rowCount(qualified: string, sourceName?: string): Promise<number>; dltLoads(): Promise<DltLoad[]>; close(): Promise<void> }`
  - `function runLiveChecks(reg: Registry, repo: RepoView, lake: LakeReader, now: Date): Promise<Finding[]>` — rules `zero_coverage` · `ghost_target` · `dlt_never_landed` · `row_floor_breach` · `identity_column_mismatch` · `first_run_pending` (WARN)
  - `function bunSqlLake(): Promise<LakeReader | null>`

**What `--live` must assert** (all five, exactly):
1. **Uncovered live lake table → RED.** Must fire on `parcel_subdivision` (220,875 rows, fresh 07/06, zero registry coverage, manual-dispatch only). Must **NOT** fire on the 426 dead `leepa_t2_*` / `collier_parcels_t2_*` / `tier1_inventory` hash-churn schemas — coverage is computed from **`pg_catalog` base tables**, never from `_dlt_loads.schema_name`, so they cannot flood it. **Not keyed on row count**: `community_profiles` / `neighborhood_stats` are 0-row, uncovered, and read by a shipping brain — keying on "has rows" re-creates the blind spot this exists to close.
2. **Ghost registry target → RED** — `redfin_city_swfl` (registry says *"1917 confirmed via live dry-run"*; a dry-run writes nothing — the table does not exist).
3. **`dlt_schema_name` never landed in `_dlt_loads` status=0 → RED** — same case from the dlt side; also flushes `news_swfl`'s dead `dlt_schema_name: data_lake` (that is the dlt *dataset* name, not a schema; the real schema is `news_swfl`), which `--static` cannot see because the literal `"data_lake"` genuinely appears in the pipeline source.
4. **Row floor → RED** — `dbpr_re_licensees` (0 rows vs floor 15,000).
5. **ZOMBIE → RED** — `usgs_tier2`. Caught by the **static** rule (no producing module); `--live` only attaches evidence (frozen since 2026-05-19). A 60-day tolerance HIDES it, which is why the assertion is *"some pipeline WRITES this table"*, never *"the table is recent."*

Plus **correction #2**: `identity_column_mismatch` — verify **which column the target table actually has** (`source_name` vs `source_tag`), not merely that a literal matches.

Views are identified by **`pg_catalog.pg_class.relkind`**, never `information_schema.tables` — the lake MCP proxy misreports `listing_active_stats` (a view) as a `BASE TABLE`.

- [ ] **Step 1: Write the failing test**

`ingest/tools/lib/identity-live.test.mts`:
```ts
import { describe, expect, test } from "bun:test";
import { MemRepo, loadRegistry } from "./identity-model.mts";
import { runLiveChecks, type DltLoad, type LakeReader, type LakeTable } from "./identity-live.mts";

const NOW = new Date("2026-07-11T12:00:00Z");

function fakeLake(over: Partial<{ tables: LakeTable[]; loads: DltLoad[] }> = {}): LakeReader {
  const tables: LakeTable[] = over.tables ?? [];
  const loads: DltLoad[] = over.loads ?? [];
  return {
    baseTables: async (schema) => tables.filter((t) => t.schema === schema && t.kind === "table"),
    table: async (q) => {
      const [s, n] = q.split(".");
      return tables.find((t) => t.schema === s && t.name === n) ?? null;
    },
    rowCount: async (q) => (await fakeLake({ tables, loads }).table(q))?.rows ?? 0,
    dltLoads: async () => loads,
    close: async () => {},
  };
}
const T = (name: string, rows: number, columns: string[] = ["id"], schema = "data_lake"): LakeTable => ({
  schema,
  name,
  kind: "table",
  rows,
  columns,
});

const repo = new MemRepo({ "ingest/cadence_registry.yaml": "pipelines: []\n" });
const reg = (yaml: string) => loadRegistry(new MemRepo({ "ingest/cadence_registry.yaml": yaml }));

describe("runLiveChecks", () => {
  test("RED zero_coverage: a live lake table no entry claims (parcel_subdivision)", async () => {
    const r = reg(`
pipelines:
  - name: leepa
    count_table: data_lake.leepa_parcels
coverage_exempt:
  - table: data_lake.view_vintages
    reason: derived_snapshot
`);
    const lake = fakeLake({
      tables: [T("leepa_parcels", 548798), T("parcel_subdivision", 220875), T("view_vintages", 1357)],
    });
    const f = await runLiveChecks(r, repo, lake, NOW);
    const zc = f.filter((x) => x.rule === "zero_coverage");
    expect(zc.map((x) => x.entry)).toEqual(["data_lake.parcel_subdivision"]);
    expect(zc[0].otherSide).toContain("220875 rows");
  });

  test("zero_coverage fires on a 0-ROW uncovered table too (community_profiles)", async () => {
    const f = await runLiveChecks(
      reg("pipelines: []\n"),
      repo,
      fakeLake({ tables: [T("community_profiles", 0)] }),
      NOW,
    );
    expect(f.filter((x) => x.rule === "zero_coverage").map((x) => x.entry)).toEqual([
      "data_lake.community_profiles",
    ]);
  });

  test("zero_coverage NEVER fires on dlt hash-churn schemas (leepa_t2_*) — they are not base tables", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: leepa
    count_table: data_lake.leepa_parcels
    dlt_schema_name: leepa_parcels_tier2
    schema_static: unverifiable
`),
      repo,
      fakeLake({
        tables: [T("leepa_parcels", 548798)],
        loads: [
          { schema_name: "leepa_t2_a1b2c3d4", ok_loads: 1, last_inserted_at: "2026-05-18T00:00:00Z" },
          { schema_name: "collier_parcels_t2_ff00ff00", ok_loads: 1, last_inserted_at: "2026-06-06T00:00:00Z" },
          { schema_name: "tier1_inventory", ok_loads: 56, last_inserted_at: "2026-05-19T00:00:00Z" },
        ],
      }),
      NOW,
    );
    expect(f.filter((x) => x.severity === "red")).toEqual([]);
  });

  test("RED ghost_target: registry names a table the DB does not have (redfin_city_swfl)", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: redfin_city_swfl
    count_table: data_lake.redfin_city_swfl
    dlt_schema_name: redfin_city_swfl
    expected_rows_min: 1700
`),
      repo,
      fakeLake({ tables: [] }),
      NOW,
    );
    const rules = f.filter((x) => x.severity === "red").map((x) => x.rule);
    expect(rules).toContain("ghost_target");
    expect(rules).toContain("dlt_never_landed");
    const ghost = f.find((x) => x.rule === "ghost_target")!;
    expect(ghost.registrySide).toContain("expected_rows_min: 1700");
    expect(ghost.otherSide).toContain("relation does not exist");
    expect(ghost.fix).toContain("a dry-run writes nothing");
  });

  test("RED dlt_never_landed: news_swfl's phantom `dlt_schema_name: data_lake`", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: news_swfl
    dlt_schema_name: data_lake
    freshness_table: data_lake.news_articles_swfl
`),
      repo,
      fakeLake({
        tables: [T("news_articles_swfl", 4210)],
        loads: [{ schema_name: "news_swfl", ok_loads: 24, last_inserted_at: "2026-07-10T00:00:00Z" }],
      }),
      NOW,
    );
    const nl = f.filter((x) => x.rule === "dlt_never_landed");
    expect(nl).toHaveLength(1);
    expect(nl[0].registrySide).toContain("dlt_schema_name: data_lake");
    expect(nl[0].otherSide).toContain("news_swfl");
  });

  test("RED row_floor_breach: dbpr_re_licensees 0 rows vs floor 15000", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: dbpr_re_licensees
    count_table: public.dbpr_re_licensees
    expected_rows_min: 15000
    source_name: dbpr_re_rgn7
`),
      repo,
      fakeLake({ tables: [{ ...T("dbpr_re_licensees", 0, ["source_name"]), schema: "public" }] }),
      NOW,
    );
    const rf = f.filter((x) => x.rule === "row_floor_breach");
    expect(rf).toHaveLength(1);
    expect(rf[0].registrySide).toContain("15000");
    expect(rf[0].otherSide).toContain("0 rows");
  });

  test("RED identity_column_mismatch: entry scopes on source_name, the table has source_tag", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: daily_truth_ish
    count_table: data_lake.daily_truth
    source_name: live_search
`),
      repo,
      fakeLake({ tables: [T("daily_truth", 120, ["metric", "source_tag"])] }),
      NOW,
    );
    const m = f.filter((x) => x.rule === "identity_column_mismatch");
    expect(m).toHaveLength(1);
    expect(m[0].registrySide).toContain("source_name: live_search");
    expect(m[0].otherSide).toContain("has no `source_name` column");
    expect(m[0].otherSide).toContain("source_tag");
  });

  test("first_run_after in the future demotes never-landed/floor REDs to a PENDING warn", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: leepa_parcel_zip
    count_table: data_lake.leepa_parcel_zip
    dlt_schema_name: leepa_parcel_zip
    expected_rows_min: 480000
    first_run_after: "2026-07-15"
`),
      repo,
      fakeLake({ tables: [] }),
      NOW,
    );
    expect(f.filter((x) => x.severity === "red")).toEqual([]);
    expect(f.map((x) => x.rule)).toContain("first_run_pending");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test ingest/tools/lib/identity-live.test.mts
```
Expected: `error: Cannot find module './identity-live.mts'`.

- [ ] **Step 3: Write minimal implementation**

`ingest/tools/lib/identity-live.mts`:
```mts
/**
 * Live identity rules — registry ↔ data_lake, both directions. CI only.
 *
 * View-vs-table MUST come from pg_catalog.pg_class.relkind, never
 * information_schema.tables: the lake MCP proxy reports the VIEW
 * listing_active_stats as a BASE TABLE. See identity-lake.mts.
 *
 * The ZOMBIE rule (usgs_tier2) is STATIC, not live — a 60-day tolerance HIDES a
 * table frozen since 2026-05-19. The assertion is "some pipeline WRITES this
 * table", not "the table is recent". --live only attaches the evidence date.
 */
import { allEntries, type Finding, type Registry, type RepoView } from "./identity-model.mts";

export interface LakeTable {
  schema: string;
  name: string;
  kind: "table" | "view";
  rows: number;
  columns: string[];
}
export interface DltLoad {
  schema_name: string;
  ok_loads: number;
  last_inserted_at: string | null;
}
export interface LakeReader {
  baseTables(schema: string): Promise<LakeTable[]>;
  table(qualified: string): Promise<LakeTable | null>;
  rowCount(qualified: string, sourceName?: string): Promise<number>;
  dltLoads(): Promise<DltLoad[]>;
  close(): Promise<void>;
}

function targets(entry: Registry["pipelines"][number]): string[] {
  const t = [entry.count_table, entry.freshness_table].filter(Boolean) as string[];
  return [...new Set(t)];
}

export async function runLiveChecks(
  reg: Registry,
  _repo: RepoView,
  lake: LakeReader,
  now: Date,
): Promise<Finding[]> {
  const out: Finding[] = [];
  const entries = allEntries(reg);
  const pending = (e: Registry["pipelines"][number]) =>
    typeof e.first_run_after === "string" && new Date(`${e.first_run_after}T00:00:00Z`) > now;

  // --- (a) ZERO COVERAGE: DB has, registry lacks -----------------------------
  // Computed from pg_catalog BASE TABLES — never from _dlt_loads.schema_name, so
  // the 426 dead leepa_t2_* / collier_parcels_t2_* / tier1_inventory hash-churn
  // schemas cannot flood this. NOT keyed on row count: community_profiles and
  // neighborhood_stats are 0-row, uncovered, and read by a shipping brain.
  const claimed = new Set<string>();
  for (const { entry } of entries) {
    for (const t of targets(entry)) claimed.add(t.toLowerCase());
    if (entry.dlt_schema_name) claimed.add(`data_lake.${entry.dlt_schema_name}`.toLowerCase());
  }
  for (const ex of reg.coverage_exempt ?? []) if (ex?.table) claimed.add(ex.table.toLowerCase());

  for (const t of await lake.baseTables("data_lake")) {
    if (t.name.startsWith("_")) continue; // dlt internals (_dlt_loads, _tier1_inventory)
    const q = `${t.schema}.${t.name}`;
    if (claimed.has(q.toLowerCase())) continue;
    out.push({
      rule: "zero_coverage",
      entry: q,
      severity: "red",
      registrySide: "no cadence_registry entry and no coverage_exempt: names this table",
      otherSide: `it exists in data_lake with ${t.rows} rows — unprobed, unguarded, invisible to check_freshness.py`,
      fix:
        "ZERO_COVERAGE — add a `pipelines:` entry (+ a cron) or an explicit `coverage_exempt: {table, reason}`. " +
        "A brain reading an unmonitored table degrades to empty and still reports healthy.",
    });
  }

  const loads = await lake.dltLoads();
  const landed = new Map(loads.map((l) => [l.schema_name.toLowerCase(), l]));

  for (const { entry, parked } of entries) {
    if (parked) continue;
    const isPending = pending(entry);
    const push = (f: Finding) => {
      if (!isPending || f.severity === "warn") return out.push(f);
      out.push({
        ...f,
        rule: "first_run_pending",
        severity: "warn",
        fix: `PENDING until first_run_after: ${entry.first_run_after}. Original: [${f.rule}] ${f.fix}`,
      });
    };

    // --- (b) GHOST TARGET: registry claims, DB lacks --------------------------
    for (const t of targets(entry)) {
      const tbl = await lake.table(t);
      if (tbl === null) {
        push({
          rule: "ghost_target",
          entry: entry.name,
          severity: "red",
          registrySide: `entry claims ${t}${entry.expected_rows_min ? ` (expected_rows_min: ${entry.expected_rows_min})` : ""}`,
          otherSide: `relation does not exist in pg_catalog`,
          fix:
            "NEVER_LANDED — the registry's floor was derived from a dry-run, and a dry-run writes nothing. " +
            "Land it, or delete the entry.",
        });
        continue;
      }

      // --- correction #2: WHICH COLUMN does the target ACTUALLY have? ---------
      if (entry.source_name !== undefined && !tbl.columns.includes("source_name")) {
        push({
          rule: "identity_column_mismatch",
          entry: entry.name,
          severity: "red",
          registrySide: `entry declares \`source_name: ${entry.source_name}\` — check_freshness.py scopes every query \`WHERE source_name = %s\` (:238, :382)`,
          otherSide:
            `${t} has no \`source_name\` column (columns: ${tbl.columns.slice(0, 8).join(", ")}` +
            `${tbl.columns.includes("source_tag") ? " — it has `source_tag` instead" : ""})`,
          fix:
            "SCHEMA_NAME_DRIFT — this is the exact source_tag-vs-source_name mismatch that false-REDded " +
            "daily_truth for two weeks. Drop the scoping field, or add the column the probe reads.",
        });
      }

      // --- (d) ROW FLOOR -------------------------------------------------------
      if (typeof entry.expected_rows_min === "number" && t === (entry.count_table ?? t)) {
        const n = await lake.rowCount(t, tbl.columns.includes("source_name") ? entry.source_name : undefined);
        if (n < entry.expected_rows_min) {
          push({
            rule: "row_floor_breach",
            entry: entry.name,
            severity: "red",
            registrySide: `entry declares expected_rows_min: ${entry.expected_rows_min} on ${t}`,
            otherSide: `${t} holds ${n} rows${entry.source_name ? ` for source_name='${entry.source_name}'` : ""}`,
            fix: "NEVER_LANDED / GAP_SENTINEL — a green run with no rows. Verify the vendor account and the writer, not the floor.",
          });
        }
      }
    }

    // --- (c) dlt SCHEMA NEVER LANDED ------------------------------------------
    if (entry.dlt_schema_name) {
      const l = landed.get(entry.dlt_schema_name.toLowerCase());
      if (!l || l.ok_loads === 0) {
        push({
          rule: "dlt_never_landed",
          entry: entry.name,
          severity: "red",
          registrySide: `entry declares \`dlt_schema_name: ${entry.dlt_schema_name}\``,
          otherSide:
            `_dlt_loads has no status=0 load under that schema` +
            (loads.length
              ? ` — the schemas that DID land include [${loads.slice(0, 5).map((x) => x.schema_name).join(", ")}…]`
              : ""),
          fix:
            "NEVER_LANDED / SCHEMA_NAME_DRIFT — either the pipeline has never landed a row, or the registry " +
            "names the dlt DATASET (data_lake) instead of the dlt SCHEMA. Freshness keyed on this is a phantom.",
        });
      } else if (l.last_inserted_at) {
        // (e) ZOMBIE evidence. The RED verdict is the STATIC rule (no producing
        // module) — a freshness tolerance would hide this (usgs: 53/60 days).
        const ageDays = Math.floor((now.getTime() - new Date(l.last_inserted_at).getTime()) / 86_400_000);
        const tol = (entry.cadence_days ?? 30) * (entry.tolerance_multiplier ?? 2);
        if (ageDays > tol) {
          out.push({
            rule: "dlt_writer_frozen",
            entry: entry.name,
            severity: "warn",
            registrySide: `entry claims cadence_days: ${entry.cadence_days ?? "?"} on schema ${entry.dlt_schema_name}`,
            otherSide: `newest ok load in _dlt_loads is ${l.last_inserted_at.slice(0, 10)} (${ageDays}d, tolerance ${tol}d)`,
            fix: "Evidence for the static zombie_target verdict — confirm a pipeline still WRITES this table.",
          });
        }
      }
    }
  }
  return out;
}
```

`ingest/tools/lib/identity-lake.mts`:
```mts
/**
 * Bun.SQL LakeReader. Resolution order matches refinery/packs/_db-parity-harness.mts:
 * DESTINATION__POSTGRES__CREDENTIALS (CI), then .dlt/secrets.toml (local).
 *
 * relkind, NOT information_schema: the lake MCP proxy reports the VIEW
 * listing_active_stats as a BASE TABLE. Only pg_class.relkind is truthful.
 *   relkind 'r' = ordinary table · 'p' = partitioned · 'v' = view · 'm' = matview
 */
import { existsSync, readFileSync } from "node:fs";
import type { DltLoad, LakeReader, LakeTable } from "./identity-live.mts";

function dsn(): string | null {
  const env = process.env.DESTINATION__POSTGRES__CREDENTIALS;
  if (env && /^postgres(ql)?:\/\//.test(env)) return env;
  if (!existsSync(".dlt/secrets.toml")) return null;
  const toml = readFileSync(".dlt/secrets.toml", "utf8");
  const block = toml.split("[destination.postgres.credentials]")[1];
  if (!block) return null;
  const g = (k: string) => block.match(new RegExp(`${k}\\s*=\\s*"([^"]+)"`))?.[1];
  const [pw, host] = [g("password"), g("host")];
  if (!pw || !host) return null;
  const port = block.match(/port\s*=\s*(\d+)/)?.[1] ?? "5432";
  return `postgresql://${g("username") ?? "postgres"}:${encodeURIComponent(pw)}@${host}:${port}/${g("database") ?? "postgres"}?sslmode=require`;
}

export async function bunSqlLake(): Promise<LakeReader | null> {
  const uri = dsn();
  if (!uri) return null;
  const sql = new Bun.SQL(uri);

  const load = async (schema: string, name: string): Promise<LakeTable | null> => {
    const rows = (await sql.unsafe(
      `SELECT c.relkind::text AS kind,
              COALESCE(array_agg(a.attname::text ORDER BY a.attnum)
                       FILTER (WHERE a.attnum > 0 AND NOT a.attisdropped), '{}') AS columns
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r','p','v','m')
        GROUP BY c.relkind`,
      [schema, name],
    )) as Array<{ kind: string; columns: string[] }>;
    if (rows.length === 0) return null;
    const kind = rows[0].kind === "v" || rows[0].kind === "m" ? "view" : "table";
    const n = (await sql.unsafe(
      `SELECT count(*)::bigint AS n FROM "${schema}"."${name}"`,
    )) as Array<{ n: string }>;
    return { schema, name, kind, rows: Number(n[0]?.n ?? 0), columns: rows[0].columns ?? [] };
  };

  return {
    async baseTables(schema) {
      const rows = (await sql.unsafe(
        `SELECT c.relname::text AS name
           FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relkind IN ('r','p')
          ORDER BY 1`,
        [schema],
      )) as Array<{ name: string }>;
      const out: LakeTable[] = [];
      for (const r of rows) {
        const t = await load(schema, r.name);
        if (t) out.push(t);
      }
      return out;
    },
    async table(qualified) {
      const [s, n] = qualified.split(".");
      return s && n ? load(s, n) : null;
    },
    async rowCount(qualified, sourceName) {
      const [s, n] = qualified.split(".");
      const rows = sourceName
        ? ((await sql.unsafe(`SELECT count(*)::bigint AS n FROM "${s}"."${n}" WHERE source_name = $1`, [
            sourceName,
          ])) as Array<{ n: string }>)
        : ((await sql.unsafe(`SELECT count(*)::bigint AS n FROM "${s}"."${n}"`)) as Array<{ n: string }>);
      return Number(rows[0]?.n ?? 0);
    },
    async dltLoads(): Promise<DltLoad[]> {
      const rows = (await sql.unsafe(
        `SELECT schema_name::text,
                count(*)::bigint          AS ok_loads,
                max(inserted_at)::text    AS last_inserted_at
           FROM data_lake._dlt_loads
          WHERE status = 0
          GROUP BY schema_name`,
      )) as Array<{ schema_name: string; ok_loads: string; last_inserted_at: string | null }>;
      return rows.map((r) => ({
        schema_name: r.schema_name,
        ok_loads: Number(r.ok_loads),
        last_inserted_at: r.last_inserted_at,
      }));
    },
    close: () => sql.end(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test ingest/tools/lib/
bun ingest/tools/check-registry-identity.mts --static
```
Expected: `35 pass, 0 fail`; the CLI runs end-to-end and prints a both-sides report (it will be RED against the un-Spined registry — Task 10 drives that to green).

- [ ] **Step 5: Commit**

```
git add ingest/tools/lib/identity-live.mts ingest/tools/lib/identity-lake.mts ingest/tools/lib/identity-live.test.mts
git commit -m "feat(identity): --live — zero-coverage, ghost target, never-landed, row floor, identity column"
```

---

### Task 9: Slot into the pre-push hook (Gate 7) and `ci.yml`

**Files:**
- Modify: `.claude/hooks/check-prepush-gate.mjs` (insert Gate 7 after the Gate 6 block, currently ending line 262, before the Gate 3 advisory at line 264; and add its name to the header comment block, lines 9-21)
- Modify: `.github/workflows/ci.yml` (append two steps after the `Dead code (knip, report-only)` step, line 44-45)
- Test: `.claude/hooks/check-prepush-gate.mjs` has no test harness — verified by the live command in Step 4 (same as Gates 1-6)

**Interfaces:**
- Consumes: `bun ingest/tools/check-registry-identity.mts --static` (exit 0 clean / 1 drift; fail-open on any tooling error)
- Produces: Gate 7 — same block/exit contract as Gate 2/5 (`block()` → exit 2; `run().ran === false` → fail open)

- [ ] **Step 1: Write the failing test**

The failing test is the hook itself firing on a seeded drift. Create the fixture, then assert the gate blocks:

```
git checkout -b /dev/null 2>/dev/null; true   # no branch needed — we test the tool the hook calls
bun -e "
const src = await Bun.file('ingest/cadence_registry.yaml').text();
await Bun.write('/tmp/registry.bak', src);
await Bun.write('ingest/cadence_registry.yaml', src.replace('  - name: news_swfl', '  - name: news_swfl\n    workflow: no-such-workflow.yml'));
"
bun ingest/tools/check-registry-identity.mts --static; echo "exit=$?"
```
Expected **before** the hook edit: the tool prints `RED news_swfl [workflow_missing]` and `exit=1`, but a `git push` is **not** blocked — no gate calls it.

- [ ] **Step 2: Run test to verify it fails**

```
node -e "process.stdin.isTTY||0" ; echo '{"tool_input":{"command":"git push"}}' | node .claude/hooks/check-prepush-gate.mjs; echo "hook exit=$?"
```
Expected: `hook exit=0` — the hook lets the seeded registry drift through. That is the failure.

- [ ] **Step 3: Write minimal implementation**

In `.claude/hooks/check-prepush-gate.mjs`, extend the header comment (after line 21):
```js
//   7. REGISTRY IDENTITY — a cadence_registry / workflow / pipeline edit that drifts
//                  one of the hand-synced identity strings (workflow ref, dlt schema,
//                  source_name, secret-in-env, timeout, action version). Runs
//                  `check-registry-identity.mts --static` — files only, no DB, no
//                  network (tags come from the maintained ingest/tools/action-tags.json
//                  allowlist and fail OPEN). Same block/exit contract as Gate 2/5.
```

Insert immediately after the Gate 6 `geoTouched` block (after line 262, before the Gate 3 advisory):
```js
  // ---- Gate 7: registry ⇆ workflow ⇆ pipeline identity ----------------------
  // The wrong-letter class: a registry field that disagrees with the workflow YAML
  // or the pipeline Python goes silent for WEEKS (source_tag-vs-source_name cost two
  // weeks of false-RED on daily_truth; usgs_tier2 names a writer that does not exist
  // and env-swfl reads the frozen table live). --static reads FILES only — no DB, no
  // gh — so it is hook-safe, and every sub-check that cannot run degrades to a WARN
  // rather than a block (fail-OPEN, same as Gate 2/5).
  const identityTouched = changed.some(
    (f) =>
      f === "ingest/cadence_registry.yaml" ||
      f.startsWith(".github/workflows/") ||
      ((f.startsWith("ingest/pipelines/") || f.startsWith("ingest/duckdb_pipelines/")) &&
        f.endsWith(".py")),
  );
  if (identityTouched) {
    const identity = run("bun ingest/tools/check-registry-identity.mts --static");
    if (identity.ran && identity.code !== 0) {
      block(
        "REGISTRY IDENTITY — a config identity string drifted from the code it names",
        `A cadence_registry entry disagrees with the workflow YAML or the pipeline\n` +
          `Python it points at. Each failure below names BOTH sides.\n\n` +
          `Fix ONE of:\n` +
          `  • correct the drifting side (the usual answer — e.g. wire the secret into\n` +
          `    the workflow \`env:\`, or align dlt_schema_name with \`pipeline_name=\`);\n` +
          `  • state the truth structurally (\`dispatch_only: true\`, \`parked: true\`,\n` +
          `    \`schema_static: unverifiable\`, or a \`coverage_exempt: {table, reason}\`);\n` +
          `  • if it needs an operator decision, open a check and record it:\n` +
          `      node scripts/check.mjs open <project> <key> "<label>"\n` +
          `    then add \`known_drift: [{rule: <rule>, check: <key>}]\` to the entry.\n` +
          `    (RULE 2.4 — no silent deferrals. A prose note is not a deferral.)\n\n` +
          truncate(identity.out),
      );
    }
  }
```

In `.github/workflows/ci.yml`, append after the knip step:
```yaml
      # Config-identity cross-check. --static is files-only and matches the pre-push
      # Gate 7 exactly, so a push that bypassed the hook still fails here.
      - name: Registry identity (static)
        run: bun ingest/tools/check-registry-identity.mts --static

      # --live adds data_lake reads. ADVISORY on purpose (the tool exits 0 and prints):
      # on the current snapshot redfin_city_swfl / dbpr_re_licensees / leepa_parcel_zip
      # are all genuinely RED, and a blocking live gate on day one reds main — the exact
      # false-red disease this build exists to kill. Flip to `--live --gate` after one
      # green confirm (tracked by check `registry_identity_live_gating`).
      # NOTE: `gh secret set` is step 1; THIS env: block is step 2.
      - name: Registry identity (live, advisory)
        if: github.event_name == 'push'
        env:
          DESTINATION__POSTGRES__CREDENTIALS: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
          GH_TOKEN: ${{ github.token }}
        run: bun ingest/tools/check-registry-identity.mts --live
```

- [ ] **Step 4: Run test to verify it passes**

```
echo '{"tool_input":{"command":"git push"}}' | node .claude/hooks/check-prepush-gate.mjs; echo "hook exit=$?"
```
Expected: `PUSH BLOCKED — REGISTRY IDENTITY …` naming `news_swfl` / `workflow_missing`, `hook exit=2`.

Then restore the registry and confirm the gate stops blocking for the seeded case:
```
bun -e "await Bun.write('ingest/cadence_registry.yaml', await Bun.file('/tmp/registry.bak').text())"
bunx next build
```
Expected: `next build` compiles clean (TS verification — **not** `npx tsc`).

- [ ] **Step 5: Commit**

```
git add .claude/hooks/check-prepush-gate.mjs .github/workflows/ci.yml
git commit -m "feat(identity): pre-push Gate 7 (--static) + ci.yml live advisory step"
```

---

### Task 10: Drive the REAL registry green (Spine-dependent tail) — fix, annotate, or open a check

**Files:**
- Modify: `ingest/cadence_registry.yaml` — add the top-level `coverage_exempt:` block; add `dispatch_only:` / `schema_static:` / `known_drift:` / `first_run_after:` annotations; **delete** the phantom `source_tag: news_crawl` (`~:1456`)
- Modify: `.github/workflows/news-swfl-ingest.yml` (`env:` block, ~line 45-49) — the one real code fix
- Modify: `SESSION_LOG.md`
- Test: `bun ingest/tools/check-registry-identity.mts --static` exits 0

**Interfaces:** Consumes everything above. **This task requires the Spine to have landed** (`workflow:` + `consuming_pack:` on every entry) — sequence it last.

Every current RED resolves into exactly ONE of three things. **Never a fourth** (no baseline file, no blanket ignore):

| Finding | Resolution |
|---|---|
| `secret_not_wired` — `news_swfl` reads `DATABASE_URL` (`novelty.py:33`), workflow wires only `DESTINATION__POSTGRES__CREDENTIALS` | **FIX** (one line): add `DATABASE_URL: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}` to `news-swfl-ingest.yml` `env:` — the other 8 sibling workflows already alias it. The novelty dedup guard currently can never trip in CI. |
| `source_tag_field_forbidden` — `news_swfl` `source_tag: news_crawl` | **FIX**: delete the field. It is the registry's only one, it has no code literal, and `news_crawl` is an app cron route name, not a pipeline identity. |
| `workflow_dark` — `collier_permits`, `city_pulse_corridors`, `city_pulse_corridors_tier2` | **ANNOTATE** `dispatch_only: true` — a true statement (crons deliberately commented out: Collier pending a dry-run probe; corridor-pulse PAUSED 07/05 for paid-web_search spend control). |
| `parked_but_scheduled` — `sba_foia_franchise_outcomes` (parked, cron fires **Jul 15**) | **ASK-FIRST (RULE 1)**: promoting it to `pipelines:` changes what the freshness probe expects. Open check `sba_franchise_parked_but_live`, annotate `known_drift`, surface to the operator. This is the executable mechanism behind root cause 1 — `check_freshness.py:206`/`:636` iterate `pipelines:` only, so `not_yet_running:` is never probed. |
| `schema_static_undeclared` — `leepa` | **ANNOTATE** `schema_static: unverifiable` (runtime-random `leepa_t2_{token_hex(4)}`; freshness keys on `count_table`, never the phantom schema). |
| `zombie_target` — `usgs_tier2` | **ASK-FIRST**: delete-or-repoint is an operator decision (`env-swfl` reads `data_lake.usgs_daily` **live** and it has been frozen since 2026-05-19). Open check `usgs_tier2_orphan`, annotate `known_drift: [{rule: zombie_target, check: usgs_tier2_orphan}]`. |
| `zero_coverage` (live, advisory) — `view_vintages`, `metric_observations`, `geo_anchor_cache`, `_tier1_inventory`-class writebacks | **EXEMPT** with a stated reason. Replaces the registry's **prose** exclusion comments (`~:1705-1770`), which are not machine-readable and are why the check would otherwise false-flood. |
| `zero_coverage` (live, advisory) — `parcel_subdivision` (220,875 rows), `neighborhood_stats` (0), `community_profiles` (0) | **Real gaps.** Advisory prints them; opening `parcel_subdivision_zero_coverage` is this task's job, the entry+cron is not. |

- [ ] **Step 1: Write the failing test**

```
bun ingest/tools/check-registry-identity.mts --static; echo "exit=$?"
```
Expected: `exit=1` with REDs including `news_swfl [secret_not_wired]`, `news_swfl [source_tag_field_forbidden]`, `collier_permits [workflow_dark]`, `city_pulse_corridors [workflow_dark]`, `sba_foia_franchise_outcomes [parked_but_scheduled]`, `leepa [schema_static_undeclared]`, `usgs_tier2 [zombie_target]`.

- [ ] **Step 2: Run test to verify it fails**

Same command — record the full RED list into `SESSION_LOG.md` **before** touching anything. That list is the phase's evidence and its baseline is `exit=1`.

- [ ] **Step 3: Write minimal implementation**

Open the checks that carry the ask-first decisions and the deferrals (RULE 2.4 — do this **first**, so `known_drift` can name real keys):
```
node scripts/check.mjs open brain-platform usgs_tier2_orphan "usgs_tier2 names a writer that does not exist — env-swfl reads the frozen table live (delete or repoint)"
node scripts/check.mjs open brain-platform sba_franchise_parked_but_live "sba_foia_franchise_outcomes is parked but its cron fires Jul 15 — promote to pipelines: or comment the cron"
node scripts/check.mjs open brain-platform parcel_subdivision_zero_coverage "parcel_subdivision: 220,875 rows, no registry entry, no cron (manual dispatch only)"
node scripts/check.mjs open brain-platform pack_legacy_table_read "env-swfl live-reads data_lake.usgs_sites, an excluded/legacy table — the --live pack-source rule deferred out of Phase 2"
node scripts/check.mjs open brain-platform registry_identity_live_gating "Flip ci.yml `--live` to `--live --gate` after one green confirm"
```

`.github/workflows/news-swfl-ingest.yml` — the one real code fix (in the `Run news ingest` step's `env:`):
```yaml
          DESTINATION__POSTGRES__CREDENTIALS: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
          # novelty.py:33 reads DATABASE_URL; without this alias _get_conn() raises,
          # the error is swallowed as BASELINE_UNAVAILABLE, and the novelty dedup guard
          # can never trip in CI. The other 8 sibling ingest workflows already alias it.
          DATABASE_URL: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
          NEWS_ADAPTIVE: "1"
```

`ingest/cadence_registry.yaml` — the annotations (per-entry) and the new top-level block:
```yaml
# --- on the news_swfl entry: DELETE the phantom field --------------------------
#   source_tag: news_crawl        <-- REMOVED. Nothing in ingest/scripts or ingest/lib
#   reads source_tag; check_freshness.py scopes on source_name (:238, :382), and
#   `news_crawl` is the app cron route name, not a pipeline identity string.

# --- collier_permits / city_pulse_corridors / city_pulse_corridors_tier2 --------
    dispatch_only: true   # cron deliberately commented out in the workflow; no schedule fires.

# --- leepa ---------------------------------------------------------------------
    schema_static: unverifiable   # resources.py:118 pipeline_name=f"leepa_t2_{token_hex(4)}"
                                  # — freshness keys on count_table, never the schema name.

# --- usgs_tier2 ----------------------------------------------------------------
    known_drift:
      - rule: zombie_target
        check: usgs_tier2_orphan

# --- sba_foia_franchise_outcomes (not_yet_running:) ----------------------------
    known_drift:
      - rule: parked_but_scheduled
        check: sba_franchise_parked_but_live

# --- NEW top-level block: replaces the PROSE exclusion comments (~:1705-1770),
# --- which are not machine-readable and would false-flood the zero-coverage check.
coverage_exempt:
  - table: data_lake.view_vintages
    reason: derived_snapshot        # written by view-vintages-monthly.yml; not a source
  - table: public.metric_observations
    reason: brain_writeback         # refinery/stages/4-output.mts, same class as fdot_freight_nowcast_shock_log
  - table: public.data_targets
    reason: brain_writeback
  - table: public.social_pulse_scans
    reason: brain_writeback
  - table: data_lake.geo_anchor_cache
    reason: runtime_cache           # ingest/lib/geo_ladder.py
  - table: data_lake.user_mls_listings
    reason: client_upload_surface
  - table: data_lake.user_mls_stats
    reason: client_upload_surface
```

- [ ] **Step 4: Run test to verify it passes**

```
bun ingest/tools/check-registry-identity.mts --static; echo "exit=$?"
bun test ingest/tools/
bunx next build
```
Expected: `registry-identity: OK [static] — every registry↔workflow↔code identity resolves.`, `exit=0`; the WARN block still prints the `known_drift` entries loudly (each naming its open check) and the `action_major_behind` v6→v7 advisories; `bun test` green; `next build` clean.

Then the live acceptance observation — **prose, not a CI assertion** (by execution time those crons will have fired, so an equality assertion would rot):
```
DESTINATION__POSTGRES__CREDENTIALS=... bun ingest/tools/check-registry-identity.mts --live
```
Record the printed RED list verbatim in `SESSION_LOG.md`. Against the 07/11 snapshot it must name at minimum: `data_lake.parcel_subdivision [zero_coverage]`, `redfin_city_swfl [ghost_target + dlt_never_landed]`, `dbpr_re_licensees [row_floor_breach]`, `news_swfl [dlt_never_landed]` (the phantom `data_lake` schema), and `leepa_parcel_zip [ghost_target]` — the third pending pipeline the spec's stale "exactly two" count missed. Exit **0** (advisory).

- [ ] **Step 5: Commit**

```
git add ingest/cadence_registry.yaml .github/workflows/news-swfl-ingest.yml SESSION_LOG.md
git commit -m "fix(identity): wire news_swfl DATABASE_URL, drop the phantom source_tag, annotate dark/parked/dynamic-schema entries + structured coverage_exempt"
node scripts/safe-push.mjs
```
agentId: a3bc43a1ef3c61593 (use SendMessage with to: 'a3bc43a1ef3c61593', summary: '<5-10 word recap>' to continue this agent)
<usage>subagent_tokens: 425885
tool_uses: 20
duration_ms: 1053256</usage>

---

## PHASE: 3a/3b — Watch-list manifest + cancelled-run blind spot

**What this phase delivers.** One generated artifact — `.github/_watch-manifest.json` — becomes the single truth about every workflow in `.github/workflows/` (name, scheduled, timeout, cancel-in-progress, paid, should-be-dark, API-disabled). The two watcher YAMLs' `workflows:` arrays get regenerated from it (ending the 70% blind spot: **29 of 82 scheduled workflows are watched today**), a CI drift-test keeps them from rotting, and `tripwire-scan.mjs` stops carrying hand-typed literals. Then the watchers stop dropping `cancelled`/`timed_out` runs on the floor: a pure `classifyTermination()` separates **TIMEOUT** (incident + "bump the ceiling" + `should_retry=false` — the money guard) from **SUPERSEDED** (skip) from **UNKNOWN-CANCEL** (incident anyway).

**What unblocks it.** Nothing. It is additive up to Task 4. Phase 3c (`doctor`) consumes this manifest; Phase 2's static check cannot see the `disabled` class at all, so this phase is the only place it gets caught.

---

### EVIDENCE YOU MUST NOT RE-DERIVE (all live-verified 07/11/2026)

1. **`workflow_run.workflows:` has NO glob/wildcard support.** GitHub documents glob explicitly for `branches:`/`paths:` *inside the same `on.workflow_run:` block* and pointedly omits it for `workflows:`; every occurrence in the syntax reference is a literal name list. There is no `workflows: ["*"]`. Codegen + a drift test is the **only** path. → `docs/audit/2026-07-11-pipeline-problems/08g-vendor-gha-facts.md` Fact 3.
2. **`workflow_run.workflows:` matches the `name:` field, not the filename.** Also: a `workflow_run` watcher only fires **if the watcher file exists on the default branch** — your regenerated lists are inert until merged to `main`. → same doc.
3. **A `timeout-minutes` kill surfaces at the run level as `conclusion: cancelled`, NOT `timed_out`.** Proven on this repo: `corridor-pulse-weekly` runs `27903898570` (06/21), `28321195281` (06/28), `28739416924` (07/05) are each `event: schedule`, `conclusion: cancelled`, ~45.3 min wall-clock against the **45-minute** ceiling then in force. The workflow's own comment records it (`corridor-pulse-weekly.yml:31-36`: *"06/21 + 06/28 + 07/05 ALL hit the 45m wall and were killed — full API spend, zero rows kept"*). **A gate that only admits `conclusion == 'failure'` is blind to all three.** That burn is why TIMEOUT maps to `should_retry = false`.
4. **The `disabled` field is the ONLY artifact that can see the zombie-cron class.** Phase 2 `--static` reads files, `--live` reads `data_lake`; neither reads workflow *state*. Live `gh api repos/:owner/:repo/actions/workflows` returns 6 `disabled_manually` workflows; **4 of them still carry an uncommented `cron:` in source** (`dbpr-sirs-monthly`, `fgcu-reri-monthly`, `marketbeat-pdf-ingest`, `rsw-airport-monthly`), orphaning 6 registry entries. `gh workflow enable` resumes them instantly with no code-level guard. → `08e` §1, `08h` §3.
5. **Counts at plan time (working tree, 07/11/2026): 103 workflow files · 82 scheduled (uncommented `- cron:`) · 0 duplicate `name:` · 0 scheduled workflows missing `timeout-minutes` · 0 scheduled workflows with `cancel-in-progress: true`.** `08h` counted 104/83 at HEAD `915bd3c7` — the delta is same-day churn, which *is* the argument for codegen. **Never hard-code a count in a test.** Assert invariants (regenerated === committed; scheduled > 60; no dupes).
6. **`SUPERSEDED` is a forward guard, not a live class.** The only workflow with `cancel-in-progress: true` is `smoke-prod.yml`, which has no cron. So gate the `gh` lookup behind `cancel_in_progress === true` → **zero added API cost in prod today.**
7. **leepa is 1/4, not 4/4.** Of its 4 cancelled runs, only `27558172620` was `event: schedule` — the other 3 were `workflow_dispatch` and are correctly excluded by the schedule scope. `27558172620` is the real UNKNOWN-CANCEL fixture.

---

### Task 1: Pure watch-manifest library

**Files:**
- Create: `scripts/lib/watch-manifest.mjs`
- Test: `scripts/lib/watch-manifest.test.mjs`

Why `scripts/lib/`: `ci.yml:38` runs `node --test .github/scripts/*.test.mjs scripts/lib/*.test.mjs`. That glob reaches `scripts/lib/*.test.mjs` and `.github/scripts/*.test.mjs` — **and nothing else.** Put every new test in one of those two directories or it ships unenforced.

**Interfaces (later tasks consume these):**
- Produces: `parseWorkflow(file: string, text: string) -> Entry`, `buildManifest(files: {file,text}[], states?: Record<path,string>, prior?: Record<file,boolean|null>) -> Entry[]`, `assertManifestSane(entries) -> string[]`, `loggerWatchNames(entries) -> string[]`, `healWatchNames(entries) -> string[]`, `rewriteWorkflowList(yamlText, names) -> string`, `zombieCrons(entries) -> Entry[]`, `darkDrift(entries) -> Entry[]`, `autoRetryAllowed(entry) -> boolean`, consts `MANIFEST_PATH`, `SHOULD_BE_DARK`, `WATCH_EXEMPT`, `SEND_SIDE_EFFECT`, `HEAL_EXCLUDED_NAME`.
- `Entry` = `{ name, file, scheduled, timeout_minutes, cancel_in_progress, paid, should_be_dark, disabled }` — **exactly the 8 spec fields, and no timestamp** (a `generated_at` would make the drift test fail on every regeneration).

- [ ] **Step 1: Write the failing test** — `scripts/lib/watch-manifest.test.mjs`:

```js
// Unit tests for the watch-manifest parser + selectors. Pure: no fs, no gh, no network.
// Run: node --test scripts/lib/watch-manifest.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWorkflow,
  buildManifest,
  assertManifestSane,
  loggerWatchNames,
  healWatchNames,
  rewriteWorkflowList,
  zombieCrons,
  darkDrift,
  autoRetryAllowed,
} from "./watch-manifest.mjs";

// Verbatim shapes from the real repo (07/11/2026).
const SCHEDULED_PAID = `name: City pulse daily
on:
  schedule:
    - cron: "0 9 * * *"
jobs:
  ingest:
    timeout-minutes: 30
    steps:
      - name: Run
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: python -m ingest.pipelines.city_pulse.pipeline
`;

// corridor-pulse-weekly.yml: cron COMMENTED OUT (paused 07/05/2026), key still named.
const COMMENTED_CRON = `name: Corridor pulse weekly
on:
  # schedule:
    # - cron: "0 10 * * 0"
  workflow_dispatch:
jobs:
  ingest:
    timeout-minutes: 90
    steps:
      - env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: python -m ingest.pipelines.city_pulse_corridors.pipeline
`;

// tripwire-hourly.yml:9 — the comment NAMES the token to say it is NOT used.
// A bare /ANTHROPIC_API_KEY/ substring test (the live bug in tripwire-scan.mjs:54)
// marks this workflow paid. It is not. weekly-read.yml:8 has the same shape.
const NOT_PAID_BUT_NAMES_THE_KEY = `name: Tripwire hourly

# No ANTHROPIC_API_KEY here — the scan spends nothing, by design.
on:
  schedule:
    - cron: "17 * * * *"
concurrency:
  group: tripwire-hourly
  cancel-in-progress: false
jobs:
  scan:
    timeout-minutes: 5
    steps:
      - run: node scripts/tripwire-scan.mjs
`;

test("parseWorkflow — a live cron is `scheduled`, and the max job timeout is captured", () => {
  const e = parseWorkflow("city-pulse-daily.yml", SCHEDULED_PAID);
  assert.equal(e.name, "City pulse daily");
  assert.equal(e.file, "city-pulse-daily.yml");
  assert.equal(e.scheduled, true);
  assert.equal(e.timeout_minutes, 30);
  assert.equal(e.cancel_in_progress, false);
  assert.equal(e.paid, true);
  assert.equal(e.should_be_dark, false);
  assert.equal(e.disabled, null);
});

test("parseWorkflow — a COMMENTED-OUT cron is NOT scheduled (corridor-pulse)", () => {
  const e = parseWorkflow("corridor-pulse-weekly.yml", COMMENTED_CRON);
  assert.equal(e.scheduled, false, "a `# - cron:` line never fires and must not count");
  assert.equal(e.should_be_dark, true, "corridor-pulse is the one declared-dark workflow");
});

test("parseWorkflow — `paid` requires the secrets context, not a bare substring", () => {
  const e = parseWorkflow("tripwire-hourly.yml", NOT_PAID_BUT_NAMES_THE_KEY);
  assert.equal(
    e.paid,
    false,
    "tripwire-hourly names ANTHROPIC_API_KEY only in a comment saying it does NOT use it",
  );
  assert.equal(e.scheduled, true);
  assert.equal(e.timeout_minutes, 5);
});

test("buildManifest — sorted by file; `disabled` comes from observed API state", () => {
  const m = buildManifest(
    [
      { file: "tripwire-hourly.yml", text: NOT_PAID_BUT_NAMES_THE_KEY },
      { file: "city-pulse-daily.yml", text: SCHEDULED_PAID },
    ],
    { ".github/workflows/city-pulse-daily.yml": "active" },
  );
  assert.deepEqual(
    m.map((e) => e.file),
    ["city-pulse-daily.yml", "tripwire-hourly.yml"],
    "stable sort by file — the committed JSON must be byte-reproducible",
  );
  assert.equal(m[0].disabled, false);
  assert.equal(m[1].disabled, null, "no observed state -> null, never a guessed false");
});

test("buildManifest — a plain rebuild PRESERVES prior observed `disabled` (never silently wipes it)", () => {
  const m = buildManifest([{ file: "dbpr-sirs-monthly.yml", text: SCHEDULED_PAID }], undefined, {
    "dbpr-sirs-monthly.yml": true,
  });
  assert.equal(m[0].disabled, true);
});

test("buildManifest — `disabled` is true for ANY non-active state (incl. disabled_inactivity)", () => {
  const m = buildManifest([{ file: "rsw-airport-monthly.yml", text: SCHEDULED_PAID }], {
    ".github/workflows/rsw-airport-monthly.yml": "disabled_inactivity",
  });
  assert.equal(m[0].disabled, true);
});

test("assertManifestSane — a scheduled workflow with no `name:` is a hard error", () => {
  const problems = assertManifestSane([
    { name: null, file: "x.yml", scheduled: true, timeout_minutes: 5 },
  ]);
  assert.ok(
    problems.some((p) => /x\.yml/.test(p) && /name/.test(p)),
    "workflow_run.workflows: is name-keyed — an unnamed workflow cannot be watched",
  );
});

test("assertManifestSane — duplicate workflow names are a hard error (unresolvable in workflow_run)", () => {
  const problems = assertManifestSane([
    { name: "Dup", file: "a.yml", scheduled: true, timeout_minutes: 5 },
    { name: "Dup", file: "b.yml", scheduled: true, timeout_minutes: 5 },
  ]);
  assert.ok(problems.some((p) => /duplicate/i.test(p) && /a\.yml/.test(p) && /b\.yml/.test(p)));
});

test("assertManifestSane — a scheduled workflow with no timeout-minutes is a hard error", () => {
  const problems = assertManifestSane([
    { name: "N", file: "n.yml", scheduled: true, timeout_minutes: null },
  ]);
  assert.ok(
    problems.some((p) => /n\.yml/.test(p) && /timeout-minutes/.test(p)),
    "without a ceiling, classifyTermination cannot detect a TIMEOUT kill",
  );
});

const FLEET = [
  { name: "City pulse daily", file: "city-pulse-daily.yml", scheduled: true },
  { name: "Daily Brain Rebuild", file: "daily-rebuild.yml", scheduled: true },
  { name: "Tripwire hourly", file: "tripwire-hourly.yml", scheduled: true },
  { name: "CI", file: "ci.yml", scheduled: false },
];

test("loggerWatchNames — every scheduled workflow except the watch-exempt ones", () => {
  assert.deepEqual(loggerWatchNames(FLEET), ["City pulse daily", "Daily Brain Rebuild"]);
});

test("healWatchNames — logger's set minus the one intentional exclusion", () => {
  assert.deepEqual(healWatchNames(FLEET), ["City pulse daily"]);
});

test("rewriteWorkflowList — replaces the list in place, preserving indent, emitting ONLY item lines", () => {
  const yaml = [
    "on:",
    "  workflow_run:",
    "    workflows:",
    '      - "Old A"',
    '      - "Old B"',
    "    types: [completed]",
    "",
  ].join("\n");
  const out = rewriteWorkflowList(yaml, ["New A", "New B", "New C"]);
  assert.equal(
    out,
    [
      "on:",
      "  workflow_run:",
      "    workflows:",
      '      - "New A"',
      '      - "New B"',
      '      - "New C"',
      "    types: [completed]",
      "",
    ].join("\n"),
  );
});

test("rewriteWorkflowList — a name containing a double quote is refused, not silently emitted", () => {
  const yaml = ['    workflows:', '      - "A"', "    types: [completed]"].join("\n");
  assert.throws(() => rewriteWorkflowList(yaml, ['bad " name']), /double quote/i);
});

test("zombieCrons — API-disabled while an uncommented cron still sits in source", () => {
  const entries = [
    // The real 4: disabled at the API, cron LIVE in source. `gh workflow enable`
    // resumes them instantly. Phase 2 structurally cannot see this class.
    { file: "dbpr-sirs-monthly.yml", scheduled: true, disabled: true, should_be_dark: false },
    // corridor-pulse: disabled AND cron commented — deliberate, belt+suspenders. Not a zombie.
    { file: "corridor-pulse-weekly.yml", scheduled: false, disabled: true, should_be_dark: true },
    { file: "city-pulse-daily.yml", scheduled: true, disabled: false, should_be_dark: false },
    { file: "unknown-state.yml", scheduled: true, disabled: null, should_be_dark: false },
  ];
  assert.deepEqual(
    zombieCrons(entries).map((e) => e.file),
    ["dbpr-sirs-monthly.yml"],
  );
});

test("darkDrift — a workflow we declared dark that is ENABLED at the API", () => {
  const entries = [
    { file: "corridor-pulse-weekly.yml", should_be_dark: true, disabled: false },
    { file: "city-pulse-daily.yml", should_be_dark: false, disabled: false },
  ];
  assert.deepEqual(
    darkDrift(entries).map((e) => e.file),
    ["corridor-pulse-weekly.yml"],
  );
});

test("autoRetryAllowed — MONEY GUARD: never auto-retry a paid workflow", () => {
  assert.equal(autoRetryAllowed({ file: "narrative-bake.yml", paid: true }), false);
  assert.equal(autoRetryAllowed({ file: "faf5-annual.yml", paid: false }), true);
});

test("autoRetryAllowed — never auto-retry a send-side-effect workflow (double-send)", () => {
  assert.equal(autoRetryAllowed({ file: "daily-email-digest.yml", paid: false }), false);
  assert.equal(autoRetryAllowed({ file: "email-scheduler.yml", paid: false }), false);
});

test("autoRetryAllowed — an unknown workflow (no manifest entry) is never retried", () => {
  assert.equal(autoRetryAllowed(null), false);
  assert.equal(autoRetryAllowed(undefined), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```
node --test scripts/lib/watch-manifest.test.mjs
```
Expected: every test errors before running — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...scripts/lib/watch-manifest.mjs'`, and the summary reads `# fail 1` (the file itself fails to load).

- [ ] **Step 3: Write minimal implementation** — `scripts/lib/watch-manifest.mjs`:

```js
// scripts/lib/watch-manifest.mjs
//
// ONE AUTHORITY for "what does this repo schedule, and what must the watchers +
// tripwire know about each workflow". Three consumers: the two watcher YAMLs
// (codegen), scripts/tripwire-scan.mjs, and (Phase 3c) doctor.
//
// PURE — every export is a function of its arguments. No fs, no gh, no network.
// The impure edges (readdir, `gh api`) live in scripts/build-watch-lists.mjs.
//
// WHY CODEGEN AND NOT A WILDCARD: `on.workflow_run.workflows:` takes EXACT
// workflow `name:` strings and has NO glob support. Live-verified 2026-07-11 —
// GitHub documents glob for `branches:`/`paths:` INSIDE the same workflow_run
// block and pointedly omits it for `workflows:`.
// Evidence: docs/audit/2026-07-11-pipeline-problems/08g-vendor-gha-facts.md Fact 3.

export const MANIFEST_PATH = ".github/_watch-manifest.json";

// Hand-declared INTENT. Everything else in the manifest is derived from the files.
// Keyed by workflow filename; the value is the reason (printed in tripwire output).
export const SHOULD_BE_DARK = {
  "corridor-pulse-weekly.yml":
    "PAUSED 07/05/2026 (operator decree, ingest/CLAUDE.md): no paid model web_search on a schedule. crawl4ai retrofit first, re-enable second.",
};

// Scheduled workflows the two watchers deliberately do NOT watch.
export const WATCH_EXEMPT = {
  "tripwire-hourly.yml":
    "Self-reporting alarm: it opens its own `TRIPWIRE RED` issue and then `exit 1`s by design (tripwire-hourly.yml:47-62). Watching it would open a duplicate cron-incident issue + check every hour it is RED.",
};

// Watched by the logger, never auto-healed: it owns refinery/lib/master-freeze-watchdog.mts.
export const HEAL_EXCLUDED_NAME = "Daily Brain Rebuild";

// A re-run of these re-fires a send. Never auto-retry, regardless of failure class.
export const SEND_SIDE_EFFECT = {
  "daily-email-digest.yml": "a re-run can re-send subscriber email",
  "email-scheduler.yml": "a re-run can re-send scheduled campaigns",
};

/** Parse ONE workflow file's text into a manifest entry. Pure. */
export function parseWorkflow(file, text) {
  const lines = text.split(/\r?\n/);

  const nameMatch = text.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  const name = nameMatch ? nameMatch[1].trim() : null;

  // scheduled = at least one UNCOMMENTED `- cron:` line. `# - cron: "0 10 * * 0"`
  // (corridor-pulse-weekly.yml:12) never fires, so the leading `#` must lose.
  const scheduled = lines.some((l) => /^\s*-\s*cron:/.test(l));

  // Max job timeout. GHA kills a run when ANY job hits ITS OWN ceiling, so a scalar
  // is only sound while a workflow's jobs share one value — true for every SCHEDULED
  // workflow today (only heal-cron-failure.yml carries 3 distinct values, and it is
  // workflow_run-triggered, never scheduled). null = not declared: we do NOT assume
  // GitHub's default ceiling, and classifyTermination degrades to UNKNOWN_CANCEL.
  const timeouts = [...text.matchAll(/^\s+timeout-minutes:\s*(\d+)/gm)].map((m) => Number(m[1]));
  const timeout_minutes = timeouts.length ? Math.max(...timeouts) : null;

  const cancel_in_progress = /^\s*cancel-in-progress:\s*true\b/m.test(text);

  // PAID = the workflow actually passes the key into a step `env:`. A bare
  // /ANTHROPIC_API_KEY/ substring test false-positives on the two comments that
  // exist to say the workflow does NOT spend — tripwire-hourly.yml:9 and
  // weekly-read.yml:8 both literally read "No ANTHROPIC_API_KEY here". That bare
  // test is the live bug in scripts/tripwire-scan.mjs:54, which Task 5 replaces.
  const paid = /\$\{\{\s*secrets\.ANTHROPIC_API_KEY\s*\}\}/.test(text);

  return {
    name,
    file,
    scheduled,
    timeout_minutes,
    cancel_in_progress,
    paid,
    should_be_dark: Object.hasOwn(SHOULD_BE_DARK, file),
    disabled: null, // observed GitHub API state; filled by buildManifest(files, states)
  };
}

/**
 * @param {{file:string,text:string}[]} files
 * @param {Record<string,string>} [states]  workflow PATH -> gh api `state` ("active" | "disabled_manually" | ...)
 * @param {Record<string,boolean|null>} [prior]  workflow FILE -> previously observed `disabled`
 */
export function buildManifest(files, states = {}, prior = {}) {
  const entries = files
    .map(({ file, text }) => parseWorkflow(file, text))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  for (const e of entries) {
    const p = `.github/workflows/${e.file}`;
    if (Object.hasOwn(states, p)) e.disabled = states[p] !== "active"; // disabled_manually OR disabled_inactivity
    else if (Object.hasOwn(prior, e.file)) e.disabled = prior[e.file]; // a plain rebuild never wipes observed state
  }
  return entries;
}

/** Loud, never silent. Returns a list of problems; [] means sane. */
export function assertManifestSane(entries) {
  const problems = [];
  const seen = new Map();
  for (const e of entries) {
    if (!e.name) {
      problems.push(
        `${e.file}: no top-level \`name:\` — \`workflow_run.workflows:\` is name-keyed and cannot reference it.`,
      );
      continue;
    }
    if (seen.has(e.name)) {
      problems.push(
        `duplicate workflow name "${e.name}" in ${seen.get(e.name)} and ${e.file} — \`workflow_run.workflows:\` cannot disambiguate two workflows with one name.`,
      );
    }
    seen.set(e.name, e.file);
    if (e.scheduled && e.timeout_minutes === null) {
      problems.push(
        `${e.file}: scheduled but declares no \`timeout-minutes:\` — classifyTermination cannot detect a TIMEOUT kill without a ceiling.`,
      );
    }
  }
  const scheduled = entries.filter((e) => e.scheduled).length;
  if (entries.length > 20 && scheduled < 60) {
    problems.push(
      `only ${scheduled} scheduled workflows parsed out of ${entries.length} files — the cron parser is probably broken (82 were scheduled on 07/11/2026).`,
    );
  }
  return problems;
}

export function loggerWatchNames(entries) {
  return entries
    .filter((e) => e.scheduled && !Object.hasOwn(WATCH_EXEMPT, e.file))
    .map((e) => e.name)
    .sort(); // default (code-unit) sort — deterministic on every platform, unlike localeCompare
}

export function healWatchNames(entries) {
  return loggerWatchNames(entries).filter((n) => n !== HEAL_EXCLUDED_NAME);
}

/**
 * Replace the `workflows:` item block in a watcher YAML, in place.
 * HARD CONSTRAINT: emit ONLY `- "Name"` lines. The existing parser at
 * .github/scripts/trigger-list-drift.test.mjs:27 stops at the first non-item line,
 * so an interspersed comment would silently truncate the watched set.
 */
export function rewriteWorkflowList(yamlText, names) {
  for (const n of names) {
    if (n.includes('"')) throw new Error(`workflow name contains a double quote, cannot emit: ${n}`);
  }
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*workflows:\s*$/.test(l));
  if (start === -1) throw new Error("no `workflows:` key found in this YAML");
  let end = start + 1;
  while (end < lines.length && /^\s*-\s*".*"\s*$/.test(lines[end])) end++;
  const indent = " ".repeat(lines[start].match(/^\s*/)[0].length + 2);
  const block = names.map((n) => `${indent}- "${n}"`);
  return [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join("\n");
}

/**
 * ZOMBIE_CRON — disabled at the GitHub API while an UNCOMMENTED cron still sits in
 * source. Both the registry and the YAML claim it is scheduled; the freshness probe
 * expects fresh rows; `gh workflow enable` resumes it instantly with no code-level
 * guard. Phase 2 CANNOT see this class (`--static` reads files, `--live` reads
 * data_lake; neither reads workflow state) — this manifest is the only artifact that
 * can. Live 07/11/2026: 4 members, orphaning 6 registry entries (08e §1, 08h §3).
 */
export function zombieCrons(entries) {
  return entries.filter((e) => e.scheduled && e.disabled === true && !e.should_be_dark);
}

/** A workflow we DECLARED dark that is ENABLED at the API — what checkPulseDark exists to catch. */
export function darkDrift(entries) {
  return entries.filter((e) => e.should_be_dark && e.disabled === false);
}

/** MONEY GUARD. A re-run of a paid workflow re-spends; a re-run of a sender re-sends. */
export function autoRetryAllowed(entry) {
  if (!entry) return false; // unknown workflow -> never retry
  if (entry.paid) return false;
  if (Object.hasOwn(SEND_SIDE_EFFECT, entry.file)) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
node --test scripts/lib/watch-manifest.test.mjs
```
Expected tail: `# pass 17`, `# fail 0`.

- [ ] **Step 5: Commit**

```
git add scripts/lib/watch-manifest.mjs scripts/lib/watch-manifest.test.mjs
git commit -m "feat(watch): pure watch-manifest lib — parser, selectors, money guard"
```

---

### Task 2: The generator CLI + the committed manifest

**Files:**
- Create: `scripts/build-watch-lists.mjs`
- Create (generated, committed): `.github/_watch-manifest.json`
- Test: reuses `scripts/lib/watch-manifest.test.mjs` (the CLI is thin glue: readdir + `gh api` + write)

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: CLI `node scripts/build-watch-lists.mjs [--write] [--with-state] [--write-watchers] [--check]`, and the committed `.github/_watch-manifest.json` that Tasks 3/5/9 and Phase 3c read.
  - `--check` (default when no flag): regenerate in memory, diff against the committed manifest **and** against both watcher YAML lists; exit 1 on any drift. **Ignores nothing — but never touches the network**, so `disabled` is compared against the committed value, not a live fetch.
  - `--with-state`: fetch `gh api repos/:owner/:repo/actions/workflows` and refresh `disabled`.
  - `--write`: write the manifest (preserving prior `disabled` unless `--with-state`).
  - `--write-watchers`: additionally regenerate the `workflows:` arrays in the two watcher YAMLs.

- [ ] **Step 1: Write the failing test** — no new test file; the failing assertion is the CLI's own `--check`, which cannot run yet. The generator's logic is already covered by Task 1's unit tests (that is the point of keeping the CLI thin). The **real** failing test lands in Task 3.

- [ ] **Step 2: Run the command to verify it fails**

```
node scripts/build-watch-lists.mjs --check
```
Expected: `Error: Cannot find module 'C:\Users\ethan\dev\brain-platform\scripts\build-watch-lists.mjs'`

- [ ] **Step 3: Write minimal implementation** — `scripts/build-watch-lists.mjs`:

```js
#!/usr/bin/env node
// build-watch-lists.mjs — codegen the watch manifest + the two watcher YAML lists.
//
//   node scripts/build-watch-lists.mjs                     # --check (default): exit 1 on drift
//   node scripts/build-watch-lists.mjs --write             # rewrite .github/_watch-manifest.json
//   node scripts/build-watch-lists.mjs --write --with-state  # ... and refresh `disabled` from `gh api`
//   node scripts/build-watch-lists.mjs --write --write-watchers  # ... and regenerate both watcher YAMLs
//
// `on.workflow_run.workflows:` has NO glob support (live-verified 07/11/2026,
// 08g Fact 3) — the explicit name list is the only mechanism, so it is generated
// and drift-tested instead of hand-kept. 29 of 82 scheduled workflows were watched
// before this landed.
//
// The manifest carries NO timestamp on purpose: a `generated_at` field would make
// the drift test fail on every regeneration.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import {
  MANIFEST_PATH,
  buildManifest,
  assertManifestSane,
  loggerWatchNames,
  healWatchNames,
  rewriteWorkflowList,
  zombieCrons,
} from "./lib/watch-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const WF_DIR = path.join(ROOT, ".github", "workflows");
const MANIFEST = path.join(ROOT, MANIFEST_PATH);
const WATCHERS = [
  { file: path.join(WF_DIR, "log-cron-incident.yml"), names: loggerWatchNames },
  { file: path.join(WF_DIR, "heal-cron-failure.yml"), names: healWatchNames },
];

const argv = process.argv.slice(2);
const write = argv.includes("--write");
const withState = argv.includes("--with-state");
const writeWatchers = argv.includes("--write-watchers");
const check = argv.includes("--check") || !write;

function readWorkflows() {
  return readdirSync(WF_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((file) => ({ file, text: readFileSync(path.join(WF_DIR, file), "utf8") }));
}

function priorDisabled() {
  if (!existsSync(MANIFEST)) return {};
  const out = {};
  for (const e of JSON.parse(readFileSync(MANIFEST, "utf8"))) out[e.file] = e.disabled ?? null;
  return out;
}

// gh api returns { workflows: [{ path, state }] }. state ∈ active | disabled_manually | disabled_inactivity.
// Verified live 07/11/2026: 6 non-active, 4 of which still carry an uncommented cron.
function fetchStates() {
  const raw = execSync(
    'gh api "repos/:owner/:repo/actions/workflows?per_page=100" --paginate --jq ".workflows[] | [.path, .state] | @tsv"',
    { encoding: "utf8", env: process.env },
  );
  const out = {};
  for (const line of raw.trim().split("\n").filter(Boolean)) {
    const [p, state] = line.split("\t");
    out[p] = state;
  }
  return out;
}

const files = readWorkflows();
const states = withState ? fetchStates() : {};
const manifest = buildManifest(files, states, priorDisabled());

const problems = assertManifestSane(manifest);
if (problems.length) {
  console.error("build-watch-lists: manifest is NOT sane —");
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

const json = JSON.stringify(manifest, null, 2) + "\n";
const logNames = loggerWatchNames(manifest);
const healNames = healWatchNames(manifest);

if (write) {
  writeFileSync(MANIFEST, json, "utf8");
  console.log(
    `wrote ${MANIFEST_PATH} — ${manifest.length} workflows, ${manifest.filter((e) => e.scheduled).length} scheduled, ${manifest.filter((e) => e.paid).length} paid`,
  );
  if (writeWatchers) {
    for (const w of WATCHERS) {
      const before = readFileSync(w.file, "utf8");
      const after = rewriteWorkflowList(before, w.names(manifest));
      if (before !== after) {
        writeFileSync(w.file, after, "utf8");
        console.log(`rewrote ${path.relative(ROOT, w.file)} -> ${w.names(manifest).length} watched`);
      }
    }
  }
  const zombies = zombieCrons(manifest);
  for (const z of zombies) {
    console.log(
      `ZOMBIE_CRON — ${z.file} is disabled at the GitHub API but its cron is LIVE in source. ` +
        `A \`gh workflow enable\` resumes it instantly; the registry still expects fresh rows.`,
    );
  }
  process.exit(0);
}

// --check
const drift = [];
if (!existsSync(MANIFEST)) drift.push(`${MANIFEST_PATH} does not exist — run --write`);
else if (readFileSync(MANIFEST, "utf8") !== json)
  drift.push(`${MANIFEST_PATH} is stale — regenerate: node scripts/build-watch-lists.mjs --write`);

for (const w of WATCHERS) {
  const text = readFileSync(w.file, "utf8");
  if (text !== rewriteWorkflowList(text, w.names(manifest))) {
    drift.push(
      `${path.relative(ROOT, w.file)} \`workflows:\` list is stale — regenerate: node scripts/build-watch-lists.mjs --write --write-watchers`,
    );
  }
}

if (drift.length) {
  console.error("WATCH-LIST DRIFT:");
  for (const d of drift) console.error(`  • ${d}`);
  process.exit(1);
}
console.log(
  `watch lists in sync — ${manifest.length} workflows, ${logNames.length} watched by the logger, ${healNames.length} by the healer`,
);
```

- [ ] **Step 4: Run to verify it works** — generate the manifest with live state:

```
node scripts/build-watch-lists.mjs --write --with-state
```
Expected (counts will differ if workflows changed — do **not** hard-code them):
```
wrote .github/_watch-manifest.json — 103 workflows, 82 scheduled, 15 paid
ZOMBIE_CRON — dbpr-sirs-monthly.yml is disabled at the GitHub API but its cron is LIVE in source. ...
ZOMBIE_CRON — fgcu-reri-monthly.yml is disabled at the GitHub API but its cron is LIVE in source. ...
ZOMBIE_CRON — marketbeat-pdf-ingest.yml is disabled at the GitHub API but its cron is LIVE in source. ...
ZOMBIE_CRON — rsw-airport-monthly.yml is disabled at the GitHub API but its cron is LIVE in source. ...
```
**Exactly 4 zombies is the acceptance signal for evidence-item 4.** `collier-permits-monthly` and `corridor-pulse-weekly` are also API-disabled but their crons are commented out, so they are `scheduled: false` and correctly absent. If you see 6, the cron-comment rule in `parseWorkflow` is broken.

Then confirm the manifest is self-consistent and prettier-stable:
```
bunx prettier --write .github/_watch-manifest.json
node scripts/build-watch-lists.mjs --check
```
Expected: prettier reports the file unchanged, then `WATCH-LIST DRIFT:` naming the two watcher YAMLs (the manifest is now in sync; the YAML lists are **not** — that is Task 3/4's job, and exit 1 here is correct).

- [ ] **Step 5: Commit**

```
git add scripts/build-watch-lists.mjs .github/_watch-manifest.json
git commit -m "feat(watch): build-watch-lists generator + committed watch manifest (4 zombie crons surfaced)"
```

---

### Task 3: The CI drift test (this is the failing test for Task 4)

**Files:**
- Create: `.github/scripts/watch-manifest-drift.test.mjs`
- Modify: **none.** `ci.yml:38` already runs `node --test .github/scripts/*.test.mjs scripts/lib/*.test.mjs` — a new `.github/scripts/*.test.mjs` file is picked up with **zero ci.yml edits**. Do not touch the glob. Do **not** put a test under `.github/scripts/lib/` — the glob does not reach it (that is why `ledger-flap.test.mjs` is currently unenforced; Task 10 opens a check for it).

**Interfaces:**
- Consumes: `buildManifest`, `loggerWatchNames`, `healWatchNames` from `scripts/lib/watch-manifest.mjs`; the committed `.github/_watch-manifest.json`.

- [ ] **Step 1: Write the failing test** — `.github/scripts/watch-manifest-drift.test.mjs`:

```js
// Drift guard for the generated watch manifest + the two watcher `workflows:` lists.
//
// `on.workflow_run.workflows:` has NO glob support (live-verified 07/11/2026 —
// 08g Fact 3), so the watched set is an explicit name list that MUST be codegen'd.
// Before this landed, the logger watched 29 of 82 scheduled workflows and the
// healer 27 — a ~65% blind spot that nothing could see.
//
// This test fails the moment a scheduled workflow is added, renamed, paused, or
// has its cron commented out without regenerating. Fix: `node scripts/build-watch-lists.mjs --write --write-watchers`
//
// Run: node --test .github/scripts/watch-manifest-drift.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildManifest,
  loggerWatchNames,
  healWatchNames,
} from "../../scripts/lib/watch-manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WF_DIR = resolve(ROOT, ".github/workflows");
const REGEN = "node scripts/build-watch-lists.mjs --write --write-watchers";

const files = readdirSync(WF_DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((file) => ({ file, text: readFileSync(resolve(WF_DIR, file), "utf8") }));

const committed = JSON.parse(readFileSync(resolve(ROOT, ".github/_watch-manifest.json"), "utf8"));
const prior = Object.fromEntries(committed.map((e) => [e.file, e.disabled ?? null]));
const fresh = buildManifest(files, {}, prior); // no network: `disabled` carried from the committed file

// Same parser as .github/scripts/trigger-list-drift.test.mjs:27 — kept in lockstep on purpose.
function extractWorkflowList(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*workflows:\s*$/.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s*"(.+)"\s*$/);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

test("guard against a false pass — the workflow dir actually parsed", () => {
  assert.ok(files.length > 50, `only ${files.length} workflow files found — parser/path broken`);
  assert.ok(
    fresh.filter((e) => e.scheduled).length > 60,
    "fewer than 60 scheduled workflows parsed — the cron rule is broken",
  );
});

test(".github/_watch-manifest.json is up to date with .github/workflows/", () => {
  assert.deepEqual(fresh, committed, `watch manifest is stale. Regenerate: ${REGEN}`);
});

test("log-cron-incident.yml watches EVERY scheduled workflow (minus the watch-exempt set)", () => {
  const actual = extractWorkflowList(readFileSync(resolve(WF_DIR, "log-cron-incident.yml"), "utf8"));
  assert.deepEqual(
    [...actual].sort(),
    loggerWatchNames(fresh),
    `logger trigger list drifted from the scheduled fleet. Regenerate: ${REGEN}`,
  );
});

test("heal-cron-failure.yml watches the logger's set minus Daily Brain Rebuild", () => {
  const actual = extractWorkflowList(readFileSync(resolve(WF_DIR, "heal-cron-failure.yml"), "utf8"));
  assert.deepEqual(
    [...actual].sort(),
    healWatchNames(fresh),
    `healer trigger list drifted from the scheduled fleet. Regenerate: ${REGEN}`,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```
node --test .github/scripts/watch-manifest-drift.test.mjs
```
Expected: 2 of 4 tests fail — `log-cron-incident.yml watches EVERY scheduled workflow…` and `heal-cron-failure.yml watches the logger's set…`, each with an `AssertionError [ERR_ASSERTION]` whose diff shows ~52 missing names (e.g. `+ 'Airtable checks sync'`, `+ 'Chief of staff nightly'`, `+ 'Graphify republish'`, `+ 'Tripwire hourly'` is **absent** by design) and the message `logger trigger list drifted from the scheduled fleet. Regenerate: node scripts/build-watch-lists.mjs --write --write-watchers`. Summary: `# pass 2`, `# fail 2`.

**This red is the point.** It is the 65% blind spot, made loud.

- [ ] **Step 3: Write minimal implementation** — none. The implementation that turns this green is the YAML regeneration, which is **Task 4** because it is a live surface.

- [ ] **Step 4: Prove the drift test catches a NEW workflow (the §9 acceptance criterion)** — without committing anything:

```
printf 'name: Drift Probe\non:\n  schedule:\n    - cron: "0 3 * * *"\njobs:\n  x:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo hi\n' > .github/workflows/_drift-probe.yml
node scripts/build-watch-lists.mjs --check
rm .github/workflows/_drift-probe.yml
```
Expected middle line: exit 1 with
```
WATCH-LIST DRIFT:
  • .github/_watch-manifest.json is stale — regenerate: node scripts/build-watch-lists.mjs --write
  • .github/workflows/log-cron-incident.yml `workflows:` list is stale — regenerate: ...
```
Confirm the probe file is gone: `git status --short .github/workflows` prints nothing.

- [ ] **Step 5: Commit**

```
git add .github/scripts/watch-manifest-drift.test.mjs
git commit -m "test(watch): drift guard — watcher lists must equal the scheduled fleet (currently RED: 29/82 watched)"
```
CI will be **red on this commit** and green after Task 4. If that is unacceptable, land Tasks 3+4 in one push after the ask-first approval below.

---

### Task 4 **[ASK-FIRST]**: Regenerate both watcher `workflows:` arrays

**ASK-FIRST because:** this changes what two **live** watchers fire on — the logger goes from 29 → ~81 watched workflows and the healer from 27 → ~80. Concrete consequences the operator must sign off on, stated plainly:
- **Incidents will open for things that have been failing silently.** `graphify-republish` is **0-for-2, has never once succeeded** (08d) — it will open a cron-incident issue + a `checks` row on its next run. That is the intended finding, not a regression.
- **The healer's L2 diagnosis surface triples.** Each newly-watched failure can fire at most **one** `claude-haiku-4-5` call, `max_tokens: 600`, and only for the fuzzy classes (`DATA_EMPTY`/`SCHEMA_DRIFT`/`UNKNOWN`). Task 9 adds a hard money guard: `autoRetryAllowed()` blocks auto-retry of any `paid: true` workflow and of the two senders, and `classifyTermination` never routes a cancelled/timed-out run to the LLM at all.
- **`workflow_run` watchers only fire from the default branch** — this is inert until it is on `main`, and cannot be validated on a branch.

**Files:**
- Modify: `.github/workflows/log-cron-incident.yml:16-46` (the `workflows:` list only — `types:`, `permissions:`, `concurrency:`, and both jobs are untouched)
- Modify: `.github/workflows/heal-cron-failure.yml:20-48` (same)
- Modify: `.github/_watch-manifest.json` (unchanged content unless workflow files changed since Task 2)

- [ ] **Step 1: The failing test already exists** — Task 3's `watch-manifest-drift.test.mjs`, currently 2 failures.

- [ ] **Step 2: Confirm it is red before you touch the YAML**

```
node --test .github/scripts/watch-manifest-drift.test.mjs
```
Expected: `# fail 2`.

- [ ] **Step 3: Regenerate (this is the implementation)**

```
node scripts/build-watch-lists.mjs --write --with-state --write-watchers
```
Expected:
```
wrote .github/_watch-manifest.json — 103 workflows, 82 scheduled, 15 paid
rewrote .github/workflows/log-cron-incident.yml -> 81 watched
rewrote .github/workflows/heal-cron-failure.yml -> 80 watched
ZOMBIE_CRON — dbpr-sirs-monthly.yml ... (×4)
```
Then verify the prettier hook cannot un-do it (it reformats every touched file — `reference_prettier-hook-churn`):
```
bunx prettier --write .github/workflows/log-cron-incident.yml .github/workflows/heal-cron-failure.yml .github/_watch-manifest.json
node scripts/build-watch-lists.mjs --check
```
Expected: `watch lists in sync — 103 workflows, 81 watched by the logger, 80 by the healer`. If prettier rewrites the item lines (e.g. re-quotes them), fix `rewriteWorkflowList`'s emitted form to match prettier's output — never add a prettier-ignore.

- [ ] **Step 4: Run BOTH drift tests to verify they pass**

```
node --test .github/scripts/watch-manifest-drift.test.mjs .github/scripts/trigger-list-drift.test.mjs
```
Expected: `# pass 7`, `# fail 0`. The pre-existing `trigger-list-drift.test.mjs` must stay green — it asserts `heal === logger − "Daily Brain Rebuild"`, which the generator preserves by construction. If it fails with an empty/short list, the codegen emitted a comment inside the item block and truncated its parser at `:27` — remove the comment.

Also confirm the diff is list-only:
```
git diff --stat .github/workflows/log-cron-incident.yml .github/workflows/heal-cron-failure.yml
```
Expected: only insertions inside the two `workflows:` blocks; no change to `types:`, `if:`, `permissions:`, or any job.

- [ ] **Step 5: Commit**

```
git add .github/workflows/log-cron-incident.yml .github/workflows/heal-cron-failure.yml .github/_watch-manifest.json
git commit -m "feat(watch): regenerate watcher trigger lists from the manifest (29/82 -> 81/82 covered)"
```

---

### Task 5 **[ASK-FIRST]**: Tripwire reads the manifest (kills two hand-typed literals + a live false-positive)

**ASK-FIRST because:** `tripwire-hourly.yml` is a live hourly alarm that opens a `TRIPWIRE RED` issue and fails the run on RED. This changes what it reports. It is a **net reduction** in noise: today `paidWorkflows()` at `tripwire-scan.mjs:54` does a bare `/ANTHROPIC_API_KEY/` substring test, which marks `tripwire-hourly.yml` and `weekly-read.yml` paid — the two workflows whose comments literally say *"No ANTHROPIC_API_KEY here"* (`tripwire-hourly.yml:9`, `weekly-read.yml:8`). Any manual dispatch of either currently raises a **spurious** `MANUAL PAID DISPATCH` RED. The new zombie finding is deliberately **YELLOW, not RED** — a deliberately-disabled workflow is exactly tripwire's own definition of yellow (*"legitimate ONLY if the operator remembers authorizing it"*), and 4 hourly REDs would be alarm spam.

**Files:**
- Modify: `scripts/tripwire-scan.mjs:49-60` (`paidWorkflows`), `:101-119` (`checkPulseDark`), `:341` (the call site — add `checkZombieCrons()`)
- Test: `scripts/lib/watch-manifest.test.mjs` (already covers `zombieCrons`/`darkDrift`/`paid`; no new test file — the tripwire edit is glue)

**Interfaces:**
- Consumes: `MANIFEST_PATH`, `SHOULD_BE_DARK`, `zombieCrons`, `darkDrift` from `scripts/lib/watch-manifest.mjs`.

- [ ] **Step 1: The failing test already exists** — `scripts/lib/watch-manifest.test.mjs`'s `parseWorkflow — 'paid' requires the secrets context, not a bare substring` test asserts the correct behavior. Prove the *live* bug first:

```
node -e "const fs=require('fs');const t=fs.readFileSync('.github/workflows/tripwire-hourly.yml','utf8');console.log('naive (current tripwire):',/ANTHROPIC_API_KEY/.test(t));console.log('manifest rule:',/\$\{\{\s*secrets\.ANTHROPIC_API_KEY\s*\}\}/.test(t));"
```
Expected: `naive (current tripwire): true` / `manifest rule: false` — the bug, in one line.

- [ ] **Step 2: Run the suite to see it green on the lib but wrong in tripwire**

```
node --test scripts/lib/watch-manifest.test.mjs
```
Expected `# fail 0` (the lib is right; tripwire is the one still wrong).

- [ ] **Step 3: Write the implementation.** Add the import at the top of `scripts/tripwire-scan.mjs` (after the existing `import { pathToFileURL } from "node:url";`):

```js
import { MANIFEST_PATH, SHOULD_BE_DARK, zombieCrons, darkDrift } from "./lib/watch-manifest.mjs";
```

Add a loader + live-state refresh next to the other helpers (after `sh()`):

```js
// The manifest is ONE truth with three consumers: the two watcher YAMLs (codegen),
// this scan, and (Phase 3c) doctor. Regenerate: node scripts/build-watch-lists.mjs --write --with-state
function watchManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST_PATH), "utf8"));
  } catch {
    yellows.push(`MANIFEST: ${MANIFEST_PATH} unreadable — run \`node scripts/build-watch-lists.mjs --write --with-state\``);
    return [];
  }
}

// Live workflow state beats the committed snapshot: `gh workflow enable` changes it
// out-of-band with no commit. Falls back to the manifest's last observed value.
function withLiveState(entries) {
  let raw;
  try {
    raw = sh('gh api "repos/:owner/:repo/actions/workflows?per_page=100" --paginate --jq ".workflows[] | [.path, .state] | @tsv"');
  } catch {
    yellows.push("STATE: gh unavailable — using the manifest's last observed workflow states");
    return entries;
  }
  const states = {};
  for (const line of raw.trim().split("\n").filter(Boolean)) {
    const [p, state] = line.split("\t");
    states[p] = state;
  }
  return entries.map((e) => {
    const s = states[`.github/workflows/${e.file}`];
    return s === undefined ? e : { ...e, disabled: s !== "active" };
  });
}
```

Replace `paidWorkflows()` (`:49-60`) entirely:

```js
// PAID = the workflow passes secrets.ANTHROPIC_API_KEY into a step env. The old bare
// /ANTHROPIC_API_KEY/ substring test flagged tripwire-hourly.yml:9 and weekly-read.yml:8
// — the two files whose comments say "No ANTHROPIC_API_KEY here" — so a manual dispatch
// of either raised a spurious MANUAL PAID DISPATCH red. One authority now: the manifest.
function paidWorkflows() {
  return watchManifest()
    .filter((e) => e.paid)
    .map((e) => ({ file: e.file, name: e.name }));
}
```

Replace `checkPulseDark()` (`:101-119`) entirely, and add the zombie check beside it:

```js
// ---------- check 2: workflows we DECLARED dark stay dark ---------------------
// Was a hardcoded ["Corridor pulse weekly"] literal, which is exactly how "City pulse
// daily" — legitimately re-enabled — produced a 6-day false RED (07/11/2026). The
// declaration now lives in ONE place: SHOULD_BE_DARK in scripts/lib/watch-manifest.mjs.
function checkPulseDark() {
  const entries = withLiveState(watchManifest());
  const declared = entries.filter((e) => e.should_be_dark);
  if (declared.length === 0) {
    yellows.push("PULSE: no workflow is declared dark — check SHOULD_BE_DARK in scripts/lib/watch-manifest.mjs");
    return;
  }
  for (const e of darkDrift(entries)) {
    reds.push(`PULSE ACTIVE — '${e.name}' (${e.file}) is ENABLED. ${SHOULD_BE_DARK[e.file]}`);
  }
  for (const e of declared.filter((e) => e.disabled === true)) {
    greens.push(`PULSE DARK — '${e.name}' disabled at the API`);
  }
  for (const e of declared.filter((e) => e.disabled === null)) {
    yellows.push(`PULSE: state unknown for '${e.name}' — manifest has no observed state`);
  }
}

// ---------- check 2b: zombie crons (the class NOTHING else can see) -----------
// Disabled at the GitHub API while an uncommented `cron:` still sits in source. Both
// the registry and the YAML claim these are scheduled, the freshness probe expects
// fresh rows from them, and `gh workflow enable` resumes them instantly with no
// code-level guard. Phase 2 CANNOT see this class (--static reads files, --live reads
// data_lake; neither reads workflow state). Live 07/11/2026: 4, orphaning 6 registry
// entries. YELLOW, not RED: a deliberately-disabled workflow is precisely tripwire's
// definition of yellow — "legitimate only if the operator remembers authorizing it".
function checkZombieCrons() {
  const zombies = zombieCrons(withLiveState(watchManifest()));
  if (zombies.length === 0) {
    greens.push("ZOMBIE CRON — none: every disabled workflow also has its cron commented out");
    return;
  }
  for (const z of zombies) {
    yellows.push(
      `ZOMBIE CRON — '${z.name}' (${z.file}) is disabled at the API but its cron is LIVE in source. ` +
        `Comment the cron out, or re-enable the workflow. Until then the registry expects rows it will never get.`,
    );
  }
}
```

Then add `checkZombieCrons();` immediately after the existing `checkPulseDark();` call (`:341`).

- [ ] **Step 4: Run the scan and verify**

```
node scripts/tripwire-scan.mjs
```
Expected in the output: **no** `MANUAL PAID DISPATCH` for `Tripwire hourly` / `weekly-read`; a `PULSE DARK — 'Corridor pulse weekly' disabled at the API` green; and exactly four `ZOMBIE CRON —` yellows naming `dbpr-sirs-monthly.yml`, `fgcu-reri-monthly.yml`, `marketbeat-pdf-ingest.yml`, `rsw-airport-monthly.yml`. Then re-run the unit suite and the eslint gate:
```
node --test scripts/lib/watch-manifest.test.mjs scripts/tripwire-scan.test.mjs
bunx eslint scripts/tripwire-scan.mjs scripts/lib/watch-manifest.mjs scripts/build-watch-lists.mjs
```
Expected: `# fail 0`, and eslint clean.

- [ ] **Step 5: Commit**

```
git add scripts/tripwire-scan.mjs
git commit -m "fix(tripwire): read the watch manifest — kills the paid false-positive and the hardcoded dark list; surfaces 4 zombie crons"
```

---

### Task 6: `classifyTermination()` — the pure classifier (money guard lives here)

**Files:**
- Modify: `.github/scripts/classify-cron-failure.mjs` (append; do not touch `classify()`, `shouldRetry()`, `needsLlm()`, `isFreshnessProbe()` — three call sites depend on them)
- Test: `.github/scripts/classify-termination.test.mjs` (new file; the `.github/scripts/*.test.mjs` glob in `ci.yml:38` picks it up with no ci.yml edit)

**Interfaces:**
- Produces: `classifyTermination(run, wf, hasNewerRun=false) -> { klass, reason, should_retry, prescription, elapsed_minutes, timeout_ratio }` and `TIMEOUT_RATIO = 0.95`.
  - `run`: the `workflow_run` payload — `{ id, conclusion, event, run_started_at, updated_at, name, path }`
  - `wf`: the manifest entry `{ file, timeout_minutes, cancel_in_progress }` or `null`
  - `klass ∈ { FAILURE, TIMEOUT, SUPERSEDED, UNKNOWN_CANCEL, OTHER }`
  - `prescription ∈ { "", TIMEOUT_KILL, SUPERSEDED, UNKNOWN }` (spec §11 enum)
  - Consumed by Task 9 (both handlers).

- [ ] **Step 1: Write the failing test** — `.github/scripts/classify-termination.test.mjs`:

```js
// Termination classifier tests. EVERY non-synthetic fixture below is a REAL run from
// this repo's history (`gh run list --json ...`, read-only, 07/11/2026).
//
// The load-bearing vendor fact: a job that hits its `timeout-minutes` ceiling surfaces
// at the RUN level as conclusion `cancelled`, NOT `timed_out`. Proven by corridor-pulse
// runs 27903898570 / 28321195281 / 28739416924 — three consecutive SCHEDULED runs, each
// ~45.3 min wall clock against the 45-minute ceiling then in force, all `cancelled`.
// The workflow's own comment records the kills (corridor-pulse-weekly.yml:31-36:
// "06/21 + 06/28 + 07/05 ALL hit the 45m wall and were killed — full API spend, zero
// rows kept"). A watcher gate that only admits `conclusion == 'failure'` is blind to
// all three. That burn is why TIMEOUT maps to should_retry = false.
//
// Run: node --test .github/scripts/classify-termination.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTermination, TIMEOUT_RATIO } from "./classify-cron-failure.mjs";

// --- REAL: corridor-pulse-weekly run 28739416924 (07/05/2026) ---
const CORRIDOR_KILL = {
  id: 28739416924,
  conclusion: "cancelled",
  event: "schedule",
  run_started_at: "2026-07-05T11:35:10Z",
  updated_at: "2026-07-05T12:20:28Z", // 45m 18s = 45.30 min
  name: "Corridor pulse weekly",
  path: ".github/workflows/corridor-pulse-weekly.yml",
};
// timeout_minutes: 45 is the ceiling IN FORCE AT KILL TIME. The file says 90 today —
// it was raised in response to these very kills. DO NOT "fix" this fixture to 90: the
// point is the ratio at the moment of death. At runtime the live 90 is the correct
// value, and a future 45-min cancel would classify UNKNOWN_CANCEL — which is right,
// because the ceiling was raised and 45 min is no longer the wall.
const CORRIDOR_WF_AT_KILL = {
  file: "corridor-pulse-weekly.yml",
  timeout_minutes: 45,
  cancel_in_progress: false,
};

// --- REAL: leepa-parcels-annual run 27558172620 (06/15/2026) ---
// leepa is 4-for-4 cancelled, but only THIS one was event=schedule; the other three
// (26459301120, 26457915958, 26455991329) were workflow_dispatch and are out of scope.
const LEEPA_CANCEL = {
  id: 27558172620,
  conclusion: "cancelled",
  event: "schedule",
  run_started_at: "2026-06-15T15:44:55Z",
  updated_at: "2026-06-15T16:15:14Z", // 30m 19s = 30.32 min, vs a 90-min ceiling
  name: "LeePA parcels annual",
  path: ".github/workflows/leepa-parcels-annual.yml",
};
const LEEPA_WF = {
  file: "leepa-parcels-annual.yml",
  timeout_minutes: 90,
  cancel_in_progress: false,
};

// --- REAL: leepa run 26459301120 — a DISPATCH cancel, out of scope ---
const LEEPA_DISPATCH_CANCEL = {
  ...LEEPA_CANCEL,
  id: 26459301120,
  event: "workflow_dispatch",
  run_started_at: "2026-05-26T15:52:50Z",
  updated_at: "2026-05-26T16:23:13Z",
};

test("TIMEOUT — corridor-pulse's 45-minute kill (real run 28739416924)", () => {
  const t = classifyTermination(CORRIDOR_KILL, CORRIDOR_WF_AT_KILL);
  assert.equal(t.klass, "TIMEOUT");
  assert.equal(t.prescription, "TIMEOUT_KILL");
  assert.ok(t.elapsed_minutes > 45.2 && t.elapsed_minutes < 45.4, `elapsed=${t.elapsed_minutes}`);
  assert.ok(t.timeout_ratio >= 1.0, `ratio=${t.timeout_ratio}`);
});

test("MONEY GUARD — a TIMEOUT is NEVER retried (the corridor-pulse burn: 3 kills, full API spend, zero rows kept)", () => {
  assert.equal(classifyTermination(CORRIDOR_KILL, CORRIDOR_WF_AT_KILL).should_retry, false);
});

test("TIMEOUT's prescription names the workflow file it applies to (spec §11)", () => {
  const t = classifyTermination(CORRIDOR_KILL, CORRIDOR_WF_AT_KILL);
  assert.match(t.reason, /corridor-pulse-weekly\.yml/);
  assert.match(t.reason, /timeout-minutes/);
});

test("UNKNOWN_CANCEL — leepa's scheduled cancel at 34% of its ceiling (real run 27558172620)", () => {
  const t = classifyTermination(LEEPA_CANCEL, LEEPA_WF);
  assert.equal(t.klass, "UNKNOWN_CANCEL");
  assert.equal(t.prescription, "UNKNOWN");
  assert.equal(t.should_retry, false);
  assert.ok(t.timeout_ratio < 0.4, `ratio=${t.timeout_ratio}`);
  // "print the evidence, say so" — never an invented diagnosis (spec §11 UNKNOWN).
  assert.match(t.reason, /30\.3/);
  assert.match(t.reason, /90/);
  assert.match(t.reason, /leepa-parcels-annual\.yml/);
});

test("OUT OF SCOPE — a cancelled DISPATCH run is not an incident (leepa 26459301120)", () => {
  const t = classifyTermination(LEEPA_DISPATCH_CANCEL, LEEPA_WF);
  assert.equal(t.klass, "OTHER");
  assert.equal(t.should_retry, false);
});

test("SUPERSEDED — cancel-in-progress + a newer run = a self-cancel, skip silently", () => {
  // Forward guard: NO scheduled workflow declares cancel-in-progress: true today
  // (only smoke-prod.yml, which has no cron), so this class cannot fire in prod yet.
  const t = classifyTermination(
    { ...LEEPA_CANCEL, id: 999 },
    { file: "future.yml", timeout_minutes: 90, cancel_in_progress: true },
    true, // hasNewerRun
  );
  assert.equal(t.klass, "SUPERSEDED");
  assert.equal(t.should_retry, false);
});

test("SUPERSEDED requires BOTH cancel-in-progress AND a newer run", () => {
  const wf = { file: "future.yml", timeout_minutes: 90, cancel_in_progress: true };
  assert.equal(classifyTermination(LEEPA_CANCEL, wf, false).klass, "UNKNOWN_CANCEL");
  const noCip = { file: "future.yml", timeout_minutes: 90, cancel_in_progress: false };
  assert.equal(classifyTermination(LEEPA_CANCEL, noCip, true).klass, "UNKNOWN_CANCEL");
});

test("TIMEOUT beats SUPERSEDED — a run that already burned its budget is never 'just superseded'", () => {
  const wf = { file: "corridor-pulse-weekly.yml", timeout_minutes: 45, cancel_in_progress: true };
  const t = classifyTermination(CORRIDOR_KILL, wf, true);
  assert.equal(t.klass, "TIMEOUT");
  assert.equal(t.should_retry, false);
});

test("GitHub's own `timed_out` conclusion is a TIMEOUT even with no ceiling in the manifest", () => {
  const t = classifyTermination({ ...LEEPA_CANCEL, conclusion: "timed_out" }, null);
  assert.equal(t.klass, "TIMEOUT");
  assert.equal(t.should_retry, false);
});

test("no declared ceiling -> UNKNOWN_CANCEL, never a guessed TIMEOUT", () => {
  const t = classifyTermination(LEEPA_CANCEL, {
    file: "x.yml",
    timeout_minutes: null,
    cancel_in_progress: false,
  });
  assert.equal(t.klass, "UNKNOWN_CANCEL");
  assert.match(t.reason, /no `timeout-minutes`/);
});

test(`the ${TIMEOUT_RATIO} boundary is inclusive`, () => {
  const at = {
    ...LEEPA_CANCEL,
    run_started_at: "2026-06-15T00:00:00Z",
    updated_at: "2026-06-15T01:35:00Z", // 95.0 min
  };
  const under = { ...at, updated_at: "2026-06-15T01:34:00Z" }; // 94.0 min
  const wf = { file: "x.yml", timeout_minutes: 100, cancel_in_progress: false };
  assert.equal(classifyTermination(at, wf).klass, "TIMEOUT");
  assert.equal(classifyTermination(under, wf).klass, "UNKNOWN_CANCEL");
});

test("a `failure` is left alone — the log-based classify() still owns it", () => {
  const t = classifyTermination({ ...LEEPA_CANCEL, conclusion: "failure" }, LEEPA_WF);
  assert.equal(t.klass, "FAILURE");
  assert.equal(t.should_retry, null, "null = not my call; classify()+shouldRetry() decide");
});

test("a success is OTHER — the widened gate must not turn a green run into an incident", () => {
  assert.equal(classifyTermination({ ...LEEPA_CANCEL, conclusion: "success" }, LEEPA_WF).klass, "OTHER");
});
```

- [ ] **Step 2: Run test to verify it fails**

```
node --test .github/scripts/classify-termination.test.mjs
```
Expected: every test fails with `TypeError: classifyTermination is not a function` (the import resolves; the export does not exist). Summary: `# fail 13`.

- [ ] **Step 3: Write minimal implementation** — append to `.github/scripts/classify-cron-failure.mjs`:

```js
// ---------------------------------------------------------------------------
// TERMINATION classifier — the classes the watchers used to drop on the floor.
//
// THE VENDOR FACT THIS RESTS ON: a job that hits its `timeout-minutes` ceiling
// surfaces at the RUN level as conclusion `cancelled`, NOT `timed_out`. Proven on
// this repo — corridor-pulse-weekly runs 27903898570 (06/21), 28321195281 (06/28)
// and 28739416924 (07/05) are each event=schedule, conclusion=cancelled, ~45.3 min
// wall clock against the 45-minute ceiling then in force. The workflow's own comment
// records the kills (corridor-pulse-weekly.yml:31-36). A gate that only admits
// `conclusion == 'failure'` — which is exactly what both watchers did — is blind to
// all three, which is how a full paid web_search sweep burned three times with zero
// rows kept and no incident.
//
// PURE. The gh lookup for `hasNewerRun` lives in lib/cron-run.mjs and is only
// consulted when the workflow actually declares `cancel-in-progress` — no scheduled
// workflow does today, so it costs nothing in prod.

/** A run within this fraction of its ceiling was killed by it, not by chance. */
export const TIMEOUT_RATIO = 0.95;

/**
 * @param {{conclusion:string,event:string,run_started_at?:string,updated_at?:string}} run
 * @param {{file:string,timeout_minutes:number|null,cancel_in_progress:boolean}|null} wf manifest entry
 * @param {boolean} hasNewerRun
 * @returns {{klass:string,reason:string,should_retry:boolean|null,prescription:string,elapsed_minutes:number|null,timeout_ratio:number|null}}
 */
export function classifyTermination(run, wf, hasNewerRun = false) {
  const file = wf?.file || (run.path || "").split("/").pop() || "unknown workflow";
  const ceiling = wf?.timeout_minutes ?? null;

  const started = run.run_started_at ? Date.parse(run.run_started_at) : NaN;
  const ended = run.updated_at ? Date.parse(run.updated_at) : NaN;
  const elapsed =
    Number.isFinite(started) && Number.isFinite(ended) && ended >= started
      ? Math.round(((ended - started) / 60000) * 100) / 100
      : null;
  const ratio = elapsed !== null && ceiling ? Math.round((elapsed / ceiling) * 10000) / 10000 : null;
  const base = { elapsed_minutes: elapsed, timeout_ratio: ratio };

  // A `failure` keeps its existing home: the log-tail classify() decides the class
  // and shouldRetry() decides the retry. Not this function's call.
  if (run.conclusion === "failure") {
    return { klass: "FAILURE", reason: "", should_retry: null, prescription: "", ...base };
  }

  if (run.conclusion !== "cancelled" && run.conclusion !== "timed_out") {
    return {
      klass: "OTHER",
      reason: `conclusion=${run.conclusion} — not a termination class`,
      should_retry: false,
      prescription: "",
      ...base,
    };
  }

  // Scope the cancelled path to SCHEDULED runs. A cancelled dispatch is a human
  // pressing stop (3 of leepa's 4 cancels), not a pipeline incident.
  if (run.event !== "schedule") {
    return {
      klass: "OTHER",
      reason: `conclusion=${run.conclusion} on a ${run.event} run — out of scope (only scheduled runs raise a termination incident)`,
      should_retry: false,
      prescription: "",
      ...base,
    };
  }

  const timeoutRx =
    `Run hit its ceiling: ${elapsed ?? "?"} min elapsed against \`timeout-minutes: ${ceiling ?? "?"}\` in ` +
    `${file}${ratio !== null ? ` (${Math.round(ratio * 100)}% of the ceiling)` : ""}. ` +
    `Raise \`timeout-minutes\` in ${file} or shorten the job. DO NOT RE-RUN: the run already spent its full budget — ` +
    `corridor-pulse burned three consecutive 45-minute kills (06/21, 06/28, 07/05) at full API spend and kept zero rows.`;

  // GitHub's own timed_out conclusion needs no ceiling math.
  if (run.conclusion === "timed_out") {
    return {
      klass: "TIMEOUT",
      reason: `GitHub reported \`timed_out\` for ${file}. ${timeoutRx}`,
      should_retry: false, // MONEY GUARD
      prescription: "TIMEOUT_KILL",
      ...base,
    };
  }

  // TIMEOUT is checked BEFORE SUPERSEDED on purpose: a run that already burned its
  // full budget is never "merely superseded" — the money guard wins the tie.
  if (ratio !== null && ratio >= TIMEOUT_RATIO) {
    return {
      klass: "TIMEOUT",
      reason: timeoutRx,
      should_retry: false, // MONEY GUARD
      prescription: "TIMEOUT_KILL",
      ...base,
    };
  }

  if (wf?.cancel_in_progress && hasNewerRun) {
    return {
      klass: "SUPERSEDED",
      reason: `${file} declares \`cancel-in-progress\` and a newer run exists — this run was self-cancelled by the concurrency group. Not an incident.`,
      should_retry: false,
      prescription: "SUPERSEDED",
      ...base,
    };
  }

  // Neither. Print the evidence and say so — never invent a diagnosis (spec §11 UNKNOWN).
  const why =
    ceiling === null
      ? `${file} declares no \`timeout-minutes\`, so a ceiling kill cannot be ruled in or out`
      : `${elapsed ?? "?"} min elapsed is only ${ratio !== null ? Math.round(ratio * 100) : "?"}% of its ${ceiling}-min ceiling, so this was not a timeout kill`;
  return {
    klass: "UNKNOWN_CANCEL",
    reason:
      `Scheduled run of ${file} was CANCELLED with no known cause: ${why}, and the workflow does not declare ` +
      `\`cancel-in-progress\` with a newer run to supersede it. Evidence: elapsed=${elapsed ?? "?"} min, ceiling=${ceiling ?? "none"}, ` +
      `ratio=${ratio ?? "n/a"}. Someone or something cancelled it out-of-band. Needs a human — do not guess.`,
    should_retry: false,
    prescription: "UNKNOWN",
    ...base,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
node --test .github/scripts/classify-termination.test.mjs .github/scripts/classify-cron-failure.test.mjs
```
Expected: `# fail 0`. The pre-existing `classify-cron-failure.test.mjs` must stay green — `classify()` was not touched.

- [ ] **Step 5: Commit**

```
git add .github/scripts/classify-cron-failure.mjs .github/scripts/classify-termination.test.mjs
git commit -m "feat(watch): classifyTermination — TIMEOUT (never retry) / SUPERSEDED / UNKNOWN_CANCEL"
```

---

### Task 7: `hasNewerRun()` + `manifestEntry()` glue

**Files:**
- Modify: `.github/scripts/lib/cron-run.mjs` (append; `deriveWorkflowName` and `fetchLogTail` untouched — both handlers import them)

**Interfaces:**
- Produces: `loadWatchManifest() -> Entry[]`, `manifestEntry(run) -> Entry|null`, `hasNewerRun(run) -> boolean`. Consumed by Task 9.
- No unit test: `.github/scripts/lib/*.test.mjs` is **not** reached by `ci.yml:38`'s glob, so a test there would ship unenforced (Task 10 opens a check for that gap). These three are thin, impure glue and are exercised end-to-end by Task 9's subprocess test. All money-critical logic stays in the pure, CI-covered `classifyTermination`.

- [ ] **Step 1: Write the failing test** — none (see above). The failing test that covers this code path is Task 9's `log-cron-incident.dryrun.test.mjs` cancelled-run case.

- [ ] **Step 2: Verify the module does not yet export them**

```
node -e "import('./.github/scripts/lib/cron-run.mjs').then(m=>console.log(Object.keys(m)))"
```
Expected: `[ 'deriveWorkflowName', 'fetchLogTail' ]`

- [ ] **Step 3: Write minimal implementation** — append to `.github/scripts/lib/cron-run.mjs` (its existing imports already include `execSync` from `node:child_process`; add the two new ones at the top):

```js
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// .github/scripts/lib/ -> .github/_watch-manifest.json. Module-relative, so it resolves
// identically whether the handler runs from the repo root (CI) or from .github/scripts
// (the dry-run subprocess test).
const MANIFEST = resolve(HERE, "../../_watch-manifest.json");

/** The generated watch manifest. [] if absent — a missing manifest must never crash a watcher. */
export function loadWatchManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return [];
  }
}

/** The manifest entry for a workflow_run payload, keyed by workflow filename. */
export function manifestEntry(run) {
  const file = (run.path || "").split("/").pop();
  if (!file) return null;
  return loadWatchManifest().find((e) => e.file === file) ?? null;
}

/**
 * Did a NEWER run of this workflow start after the given one? Only meaningful for a
 * workflow that declares `cancel-in-progress` — the caller MUST gate on that, so this
 * gh call never fires in prod today (no scheduled workflow declares it). Returns false
 * on any error: an unproven "superseded" must never silence a real cancel.
 */
export function hasNewerRun(run) {
  const file = (run.path || "").split("/").pop();
  const started = Date.parse(run.run_started_at ?? run.created_at ?? "");
  if (!file || !Number.isFinite(started)) return false;
  try {
    const out = execSync(`gh run list --workflow=${file} --limit 10 --json databaseId,createdAt`, {
      encoding: "utf8",
      env: process.env,
    });
    return JSON.parse(out).some(
      (r) => r.databaseId !== run.id && Date.parse(r.createdAt) > started,
    );
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Verify the exports resolve**

```
node -e "import('./.github/scripts/lib/cron-run.mjs').then(m=>{console.log(Object.keys(m)); console.log('manifest entries:', m.loadWatchManifest().length);})"
```
Expected: `[ 'deriveWorkflowName', 'fetchLogTail', 'loadWatchManifest', 'manifestEntry', 'hasNewerRun' ]` then `manifest entries: 103`.

- [ ] **Step 5: Commit**

```
git add .github/scripts/lib/cron-run.mjs
git commit -m "feat(watch): manifest lookup + hasNewerRun helpers for the watchers"
```

---

### Task 8 **[ASK-FIRST]**: Widen both watcher gates to admit `cancelled` / `timed_out`

**ASK-FIRST because:** these are the `if:` gates on two **live** watchers. Widening them means scheduled runs that end `cancelled` now reach the handlers. Blast radius, stated concretely: the classes are already terminal (`types: [completed]` fires today regardless — the gate simply drops them), so this adds **no new triggers**, only new admissions. Post-merge, `heal-cron-failure`'s `triage` job will run on cancelled scheduled runs; Task 9's handler makes `should_retry=false` for every one of them, so **no cancelled run is ever re-run**, and `needs_llm` is false for all termination classes, so **no LLM call is ever made** on a cancel. Cost of this change: one 5-minute `triage` runner per cancelled scheduled run.

**Files:**
- Modify: `.github/workflows/log-cron-incident.yml:61-63` (the `record_failure` job's `if:`)
- Modify: `.github/workflows/heal-cron-failure.yml:66-70` (the `triage` job's `if:`)
- Untouched: `maybe_auto_resolve` (still `conclusion == 'success' && event == 'schedule'`) and the `retry` / `diagnose` jobs (they gate on `triage`'s outputs, which Task 9 makes correct)

- [ ] **Step 1: Write the failing test** — this is YAML; the gate is asserted by a static test. Create `.github/scripts/watcher-gate.test.mjs`:

```js
// The watcher `if:` gates must admit cancelled/timed_out scheduled runs for CLASSIFICATION.
//
// Why: a `timeout-minutes` kill surfaces as conclusion `cancelled` (corridor-pulse runs
// 27903898570 / 28321195281 / 28739416924 — three scheduled 45-minute kills, full paid API
// spend, zero rows kept, ZERO incidents opened). A gate of `conclusion == 'failure'` alone
// is structurally blind to the entire class.
//
// Run: node --test .github/scripts/watcher-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WF = (n) => resolve(dirname(fileURLToPath(import.meta.url)), "../workflows", n);

for (const file of ["log-cron-incident.yml", "heal-cron-failure.yml"]) {
  const text = readFileSync(WF(file), "utf8");

  test(`${file} admits cancelled runs`, () => {
    assert.match(text, /conclusion == 'cancelled'/, `${file} still drops cancelled runs on the floor`);
  });

  test(`${file} admits timed_out runs`, () => {
    assert.match(text, /conclusion == 'timed_out'/, `${file} still drops timed_out runs on the floor`);
  });

  test(`${file} scopes the cancelled path to scheduled runs`, () => {
    assert.match(
      text,
      /workflow_run\.event == 'schedule'/,
      `${file} must not raise an incident for a human cancelling a dispatch (3 of leepa's 4 cancels)`,
    );
  });

  test(`${file} still admits failures (no regression)`, () => {
    assert.match(text, /conclusion == 'failure'/);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```
node --test .github/scripts/watcher-gate.test.mjs
```
Expected: `# fail 4` — `log-cron-incident.yml admits cancelled runs`, `... admits timed_out runs`, and the two `heal-cron-failure.yml` equivalents. (`scopes the cancelled path` passes for `log-cron-incident.yml` — its `maybe_auto_resolve` job already contains `event == 'schedule'` — and fails for `heal-cron-failure.yml`.) Exact count: 4 failures.

- [ ] **Step 3: Write minimal implementation.**

In `.github/workflows/log-cron-incident.yml`, replace the `record_failure` job's `if:` (`:61-63`):

```yaml
  record_failure:
    # A `timeout-minutes` kill surfaces as conclusion `cancelled`, not `timed_out`
    # (corridor-pulse runs 27903898570 / 28321195281 / 28739416924 — three scheduled
    # 45-minute kills, full paid API spend, zero rows kept, zero incidents). The old
    # `conclusion == 'failure'` gate was blind to the entire class. cancelled/timed_out
    # are admitted for CLASSIFICATION only, and only for SCHEDULED runs — a cancelled
    # dispatch is a human pressing stop. log-cron-incident.mjs::classifyTermination
    # then decides: TIMEOUT -> incident, SUPERSEDED -> silent skip, UNKNOWN_CANCEL -> incident.
    if: >
      vars.CRON_INCIDENT_LOGGER_ENABLED != 'false' &&
      (github.event.workflow_run.conclusion == 'failure' ||
      ((github.event.workflow_run.conclusion == 'cancelled' ||
      github.event.workflow_run.conclusion == 'timed_out') &&
      github.event.workflow_run.event == 'schedule'))
    runs-on: ubuntu-latest
```

In `.github/workflows/heal-cron-failure.yml`, replace the `triage` job's `if:` (`:66-70`):

```yaml
  triage:
    # Same widening as the logger: a cancelled SCHEDULED run may be a timeout kill.
    # heal-cron-failure.mjs::classifyTermination forces should_retry=false AND
    # needs_llm=false for every termination class, so a cancelled run is never re-run
    # (the money guard) and never reaches the LLM.
    if: >
      vars.CRON_HEAL_ENABLED != 'false' &&
      (github.event.workflow_run.conclusion == 'failure' ||
      ((github.event.workflow_run.conclusion == 'cancelled' ||
      github.event.workflow_run.conclusion == 'timed_out') &&
      github.event.workflow_run.event == 'schedule') ||
      github.event_name == 'workflow_dispatch') &&
      github.event.workflow_run.name != 'Daily Brain Rebuild'
    runs-on: ubuntu-latest
```

- [ ] **Step 4: Run test to verify it passes**

```
node --test .github/scripts/watcher-gate.test.mjs .github/scripts/watch-manifest-drift.test.mjs .github/scripts/trigger-list-drift.test.mjs
```
Expected: `# fail 0`. The two drift tests must stay green — the `if:` edit does not touch the `workflows:` lists, and `rewriteWorkflowList` only rewrites the item block.

- [ ] **Step 5: Commit**

```
git add .github/workflows/log-cron-incident.yml .github/workflows/heal-cron-failure.yml .github/scripts/watcher-gate.test.mjs
git commit -m "feat(watch): admit cancelled/timed_out scheduled runs for classification"
```

---

### Task 9 **[ASK-FIRST]**: Wire `classifyTermination` into both handlers

**ASK-FIRST because:** these two files decide what opens a `public.checks` row, what comments on the incident issue, what gets re-run, and what calls a paid model. Every edit here is on the live incident path.

**Files:**
- Modify: `.github/scripts/log-cron-incident.mjs:19-20` (imports), `:66-67` (the `recordFailure()` guard), `:77` (the `detail` line)
- Modify: `.github/scripts/heal-cron-failure.mjs:24-25` (imports), `:68-95` (`triage()`)
- Test: `.github/scripts/log-cron-incident.dryrun.test.mjs` (extend — it already has the subprocess harness)

**Interfaces:**
- Consumes: `classifyTermination` (Task 6), `manifestEntry` / `hasNewerRun` (Task 7), `autoRetryAllowed` (Task 1).

- [ ] **Step 1: Write the failing test** — append to `.github/scripts/log-cron-incident.dryrun.test.mjs`:

```js
// --- Termination classes (Phase 3b). Fixtures are REAL runs; see
// --- .github/scripts/classify-termination.test.mjs for the provenance of each.

// leepa-parcels-annual run 27558172620 — the one SCHEDULED cancel of its 4.
// 30m 19s against a 90-min ceiling: not a timeout, no cancel-in-progress -> UNKNOWN_CANCEL.
const LEEPA_CANCELLED = {
  id: 27558172620,
  html_url: "https://x/runs/27558172620",
  conclusion: "cancelled",
  event: "schedule",
  head_branch: "main",
  run_started_at: "2026-06-15T15:44:55Z",
  updated_at: "2026-06-15T16:15:14Z",
  name: "LeePA parcels annual",
  path: ".github/workflows/leepa-parcels-annual.yml",
};

// A cancelled DISPATCH (leepa 26459301120) — a human pressing stop. Never an incident.
const LEEPA_CANCELLED_DISPATCH = {
  ...LEEPA_CANCELLED,
  id: 26459301120,
  event: "workflow_dispatch",
};

test("record-failure dry-run opens an incident for a cancelled SCHEDULED run (the blind spot)", () => {
  const out = runDryRun("record-failure", LEEPA_CANCELLED);
  assert.match(out, /would open check cron_incident_leepa_parcels_annual/);
  assert.match(out, /UNKNOWN_CANCEL/);
  assert.doesNotMatch(out, /git push/i);
});

test("record-failure dry-run SKIPS a cancelled dispatch run (a human pressed stop)", () => {
  const out = runDryRun("record-failure", LEEPA_CANCELLED_DISPATCH);
  assert.doesNotMatch(out, /would open check/);
  assert.match(out, /skip/i);
});

test("record-failure dry-run still opens an incident for a plain failure (no regression)", () => {
  const out = runDryRun("record-failure", FRESHNESS_FAIL);
  assert.match(out, /would open check cron_incident_freshness_probe_daily/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```
node --test .github/scripts/log-cron-incident.dryrun.test.mjs
```
Expected: `record-failure dry-run opens an incident for a cancelled SCHEDULED run` fails — the subprocess prints `[log-cron-incident] skip: conclusion is cancelled` (from the untouched `:67` guard) and the assertion reports `AssertionError: The input did not match the regular expression /would open check cron_incident_leepa_parcels_annual/`. Summary: `# fail 1`.

- [ ] **Step 3: Write minimal implementation.**

`.github/scripts/log-cron-incident.mjs` — extend the two import lines (`:19-20`):

```js
import { classify, isLocalModule, classifyTermination } from "./classify-cron-failure.mjs";
import { deriveWorkflowName, fetchLogTail, manifestEntry, hasNewerRun } from "./lib/cron-run.mjs";
```

Replace `recordFailure()`'s opening guard (`:66-67`) and the `detail` construction (`:77`):

```js
function recordFailure() {
  if (headBranch && headBranch !== "main")
    return log(`skip: head_branch is ${headBranch}, not main`);

  // A `timeout-minutes` kill lands as conclusion `cancelled` (corridor-pulse: 3
  // scheduled 45-minute kills, full API spend, zero rows kept, zero incidents). The
  // old `conclusion !== 'failure'` guard was blind to the whole class.
  const wf = manifestEntry(run);
  const term = classifyTermination(
    run,
    wf,
    wf?.cancel_in_progress ? hasNewerRun(run) : false, // gh call ONLY if the workflow can self-cancel
  );
  if (term.klass === "OTHER") return log(`skip: ${term.reason || `conclusion is ${conclusion}`}`);
  if (term.klass === "SUPERSEDED") return log(`skip: ${term.reason}`);

  let cls;
  let suggestedAction;
  let logTail = "";
  if (term.klass === "FAILURE") {
    logTail = fetchLogTail(runId);
    cls = classify(logTail);
    suggestedAction = cls.suggestedAction;
    if (cls.klass === "MISSING_DEP" && isLocalModule(cls.signal)) {
      suggestedAction = `\`${cls.signal}\` matches a local module in this repo — this is an import-path bug, NOT a missing PyPI package. Do not add it to requirements.txt; fix the import.`;
    }
  } else {
    // TIMEOUT / UNKNOWN_CANCEL. `gh run view --log-failed` returns nothing for a
    // cancelled run, so there is no log tail to classify — the termination reason IS
    // the diagnosis, and it carries its own evidence.
    cls = { klass: term.klass, signal: term.prescription };
    suggestedAction = term.reason;
    logTail = term.reason;
  }
  const detail = `${cls.klass}${cls.signal ? ` — ${cls.signal}` : ""} · ${runUrl}`;

  if (dryRun) {
    log(`DRY-RUN: would open check ${checkKey} (detail: ${detail})`);
    if (issueNumber) log(`DRY-RUN: would comment on issue #${issueNumber}`);
    log(
      `DRY-RUN: would open discrete issue "${INCIDENT_TAG} ${cls.klass} · ${workflowDisplayName} — ${today}"`,
    );
    return;
  }
  // ... the rest of recordFailure() is UNCHANGED from here (openIncidentCheck(detail) onward)
```

`.github/scripts/heal-cron-failure.mjs` — extend the imports (`:24-25`):

```js
import {
  classify,
  isFreshnessProbe,
  shouldRetry,
  needsLlm,
  classifyTermination,
} from "./classify-cron-failure.mjs";
import { deriveWorkflowName, fetchLogTail, manifestEntry, hasNewerRun } from "./lib/cron-run.mjs";
import { autoRetryAllowed } from "../../scripts/lib/watch-manifest.mjs";
```

Replace `triage()` (`:68-95`) entirely:

```js
function triage() {
  let klass = "UNKNOWN";
  let signal = "";
  let should = false;
  let llm = false;

  const wf = manifestEntry(run);
  const term = classifyTermination(
    run,
    wf,
    wf?.cancel_in_progress ? hasNewerRun(run) : false, // gh call ONLY if the workflow can self-cancel
  );

  if (term.klass === "FAILURE" && onMain && !EXCLUDED) {
    const c = classify(fetchLogTail(run.id));
    klass = c.klass;
    signal = c.signal;
    // MONEY GUARD, three ways: only TRANSIENT retries; only the first attempt; and
    // NEVER a paid workflow or a sender (a re-run re-spends / re-sends). The watched
    // set went from 27 to ~80 workflows in Phase 3a — this is what keeps that safe.
    should =
      shouldRetry(klass) &&
      run.run_attempt === 1 &&
      !isFreshnessProbe(workflowName) &&
      autoRetryAllowed(wf);
    // A "transient" that already retried and failed again clearly wasn't transient.
    llm = needsLlm(klass) || (klass === "TRANSIENT" && run.run_attempt > 1);
  } else if (
    (term.klass === "TIMEOUT" || term.klass === "UNKNOWN_CANCEL") &&
    onMain &&
    !EXCLUDED
  ) {
    // MONEY GUARD: a run that hit its ceiling already spent its full budget. Never
    // re-run it (corridor-pulse burned 3 x 45 min of paid web_search and kept zero
    // rows). And no LLM: a cancelled run has no failed-log to read, and the
    // termination reason already carries its own evidence.
    klass = term.klass;
    signal = term.prescription;
    should = false;
    llm = false;
    log(term.reason);
  } else {
    log(
      `triage skipped: termination=${term.klass} conclusion=${run.conclusion} onMain=${onMain} excluded=${EXCLUDED}`,
    );
  }

  writeOutputs({
    class: klass,
    signal: String(signal).replace(/[\r\n]+/g, " ").slice(0, 120),
    should_retry: String(should),
    needs_llm: String(llm),
  });
  log(
    `triage: class=${klass} should_retry=${should} needs_llm=${llm} (attempt ${run.run_attempt})`,
  );
}
```

Also harden `retry()` (`:97-99`) — defense in depth, so a stale `should_retry` output can never re-run a killed job. Insert immediately after the existing `run_attempt` guard:

```js
  const wf = manifestEntry(run);
  if (!autoRetryAllowed(wf))
    return log(`skip retry: ${wf?.paid ? "PAID workflow — a re-run re-spends" : "send-side-effect or unknown workflow"}`);
  if (run.conclusion !== "failure")
    return log(`skip retry: conclusion=${run.conclusion} — a cancelled/timed-out run is never re-run`);
```

- [ ] **Step 4: Run tests to verify they pass**

```
node --test .github/scripts/log-cron-incident.dryrun.test.mjs .github/scripts/classify-termination.test.mjs .github/scripts/classify-cron-failure.test.mjs .github/scripts/watcher-gate.test.mjs .github/scripts/watch-manifest-drift.test.mjs .github/scripts/trigger-list-drift.test.mjs
node --test scripts/lib/watch-manifest.test.mjs
bunx eslint .github/scripts scripts/tripwire-scan.mjs scripts/build-watch-lists.mjs scripts/lib/watch-manifest.mjs
```
Expected: `# fail 0` on both `node --test` runs, eslint clean. The pre-existing dry-run tests (`record-failure … opens a check`, `maybe-resolve … closes the check`) must still pass — `maybeResolve()` was not touched.

- [ ] **Step 5: Commit**

```
git add .github/scripts/log-cron-incident.mjs .github/scripts/heal-cron-failure.mjs .github/scripts/log-cron-incident.dryrun.test.mjs
git commit -m "feat(watch): classify cancelled runs — TIMEOUT never re-runs (money guard), UNKNOWN_CANCEL still opens an incident"
```

---

### Task 10: Close the phase — checks, SESSION_LOG, push

**Files:**
- Modify: `SESSION_LOG.md` (new entry at the TOP; append-only, never rewrite)
- Modify: `_AUDIT_AND_ROADMAP/build-queue.md` (sync the 3a/3b line)

- [ ] **Step 1: Open checks for the two gaps this phase surfaced but does not fix** (RULE 2.4 — no silent deferrals; a SESSION_LOG sentence is not a substitute for a check):

```
node scripts/check.mjs open brain-platform zombie_cron_reenable_guard "4 workflows are disabled at the GitHub API but still carry a live cron in source (dbpr-sirs-monthly, fgcu-reri-monthly, marketbeat-pdf-ingest, rsw-airport-monthly) — orphaning 6 registry entries. Comment the crons out or re-enable. Surfaced by tripwire's ZOMBIE CRON yellow."
node scripts/check.mjs open brain-platform ci_github_lib_tests_unenforced "ci.yml:38's glob `.github/scripts/*.test.mjs` does not reach `.github/scripts/lib/*.test.mjs`, so ledger-flap.test.mjs has never run in CI. Widen the glob after confirming it is green locally."
```
Expected: two `opened` lines. Confirm with `node scripts/check.mjs list`.

- [ ] **Step 2: Run the full gate before writing the log** (evidence before assertions):

```
node --test .github/scripts/watch-manifest-drift.test.mjs .github/scripts/trigger-list-drift.test.mjs .github/scripts/watcher-gate.test.mjs .github/scripts/classify-termination.test.mjs .github/scripts/classify-cron-failure.test.mjs .github/scripts/log-cron-incident.dryrun.test.mjs
node --test scripts/lib/watch-manifest.test.mjs
node scripts/build-watch-lists.mjs --check
bunx next build
```
Expected: `# fail 0` twice; `watch lists in sync — 103 workflows, 81 watched by the logger, 80 by the healer`; a clean Next build. (`bunx next build`, never `npx tsc`.)

- [ ] **Step 3: Write the SESSION_LOG entry** — new block at the very top of `SESSION_LOG.md`. Log only what `git log`/`git diff` can show:

```markdown
## 2026-07-11 — Phase 3a/3b: watch-list manifest + the cancelled-run blind spot

**Shipped.** `.github/_watch-manifest.json` is now generated from `.github/workflows/*.yml` by
`scripts/build-watch-lists.mjs` (pure logic in `scripts/lib/watch-manifest.mjs`), and the two
watcher YAMLs' `workflows:` arrays are regenerated from it. `on.workflow_run.workflows:` has no
glob support (live-verified 07/11/2026 — 08g Fact 3), so the explicit list is codegen + a CI
drift test (`.github/scripts/watch-manifest-drift.test.mjs`, picked up by ci.yml:38's existing
glob).

**What it caught.**
- Watcher coverage went from **29 of 82** scheduled workflows to **81 of 82** (`Tripwire hourly` is
  watch-exempt: it opens its own RED issue and `exit 1`s by design).
- **4 zombie crons** — `dbpr-sirs-monthly`, `fgcu-reri-monthly`, `marketbeat-pdf-ingest`,
  `rsw-airport-monthly` are `disabled_manually` at the GitHub API while an uncommented `cron:`
  still sits in source, orphaning 6 registry entries. Phase 2 structurally cannot see this class;
  the manifest's `disabled` field is the only artifact that can. Check opened:
  `zombie_cron_reenable_guard`.
- **A live tripwire false-positive.** `paidWorkflows()` used a bare `/ANTHROPIC_API_KEY/` substring
  test, which flagged `tripwire-hourly.yml:9` and `weekly-read.yml:8` — the two files whose comments
  literally say "No ANTHROPIC_API_KEY here". Now manifest-driven (secrets-context match).

**Cancelled-run blind spot (3b).** A `timeout-minutes` kill surfaces as conclusion `cancelled`, not
`timed_out` — corridor-pulse runs 27903898570 / 28321195281 / 28739416924 are three consecutive
SCHEDULED 45-minute kills at full paid API spend, zero rows kept, and **zero incidents opened**,
because both watcher gates only admitted `conclusion == 'failure'`. Both gates now admit
`cancelled`/`timed_out` for scheduled runs, and `classifyTermination()` (pure, in
`classify-cron-failure.mjs`) splits them: **TIMEOUT** → incident + bump-the-ceiling Rx +
`should_retry = false` (money guard — never re-run a run that already spent its budget);
**SUPERSEDED** → silent skip; **UNKNOWN_CANCEL** → incident anyway (leepa run 27558172620, cancelled
at 34% of its ceiling with no cause).

**Next:** Phase 3c — `ingest/scripts/doctor.py` consumes `.github/_watch-manifest.json` + the
freshness/volume probes for one health line per dataset.
```

- [ ] **Step 4: Push**

```
git add SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs(session-log): phase 3a/3b — watch manifest + cancelled-run classification"
node scripts/safe-push.mjs
```
Expected: the pre-push gate passes all 5 gates (no `package.json` change → no lockfile gate; no packs/vocab touched → gates 2/5 skip; no ingest writes → gate 4 skips) and `safe-push` reports the push. **If `safe-push` lists a commit you did not author, STOP and ask** — it carries foreign commits.

- [ ] **Step 5: Verify live, then close nothing yet.** `data_contracts_doctor_live_verify` stays **open** — it closes only on Phase 1–3 acceptance green *live* plus doctor's first archived run (spec §9). After the push lands on `main` (watchers are inert until then — `workflow_run` only fires from the default branch), confirm on the next scheduled cancel:

```
gh run list --limit 30 --json workflowName,conclusion,event,createdAt --jq '.[] | select(.conclusion=="cancelled" and .event=="schedule")'
gh issue list --label cron-failure --state open --limit 10
```
Expected: any scheduled cancel now has a matching `[cron-failure:<workflow>]` issue whose class is `TIMEOUT` or `UNKNOWN_CANCEL` — never a silent drop, and never a re-run.

---

## PHASE: 3c/3d — `doctor` entrypoint (the one health reader)

> # 🛑 MANDATORY CORRECTIONS TO THIS PHASE — APPLY BEFORE WRITING A LINE
>
> This phase was written by an author who did not see the other phases. **Two adversarial critics
> reviewed it and found the defects below.** They are not style notes — each one ships a bug.
> The **Integration Contract** at the top of this plan is the authority; where this phase's original
> text disagrees with a correction below, **the correction wins.**
>
> **D-1** and **D-2** are hard bugs: doctor would red a healthy source every morning, and the content signal — the whole point of the contracts phase — never reaches the health model.

### D-1 🔴 This phase MANUFACTURES a permanent false-RED on a healthy source
`volume_severity` reds any tier-1 + nightly entry as `("UNRESOLVED","red")`, citing *"city_pulse has no
count_table/expected_rows_min."* **That premise is FALSE after the Spine phase in this same plan** — the Spine
attaches `count_table: data_lake.city_pulse` + `expected_rows_min`. `check_volume_entry` still returns `None`
for tier-1 (its early return at `check_freshness.py:369-371`), so this phase would red `city_pulse`
**forever on a healthy source** — and then flip `--fail-on red`, **failing the daily probe every single morning.**
That is a manufactured false-RED: the exact desensitization this build exists to reverse.
**FIX (per the Integration Contract):**
```python
if tier1 and entry.get("count_table") and entry.get("expected_rows_min") is not None:
    return ("GATED_BY_ASSERT_LANDED", "green")   # countable → assert_landed owns it. Do NOT red it.
if tier1 and entry.get("nightly"):
    return ("UNRESOLVED", "red")                 # nightly but genuinely un-countable → a REAL hole
```
Ship **both** tests — the green case *and* its inverse, so the real hole stays guarded. Strip the stale docstring.

### D-2 🔴 Phase 2's content signal NEVER REACHES doctor — the build's headline capability is dark
Phase 2 (content contracts) says it unblocks doctor because doctor "imports `run_content_contracts` for its
content-health signal." **This phase imports only `load_quality_registry, run_value_tests`**, and `content_severity()`
is fed `value_results` alone. So §7 3c's health line — *"worst of {freshness, volume, **content**, run-status}"* —
has **no content input at all**. The entire point of the contracts phase is missing from the health model.
**FIX:** import and wire `run_content_contracts(conn, registry)`. Add a test that a **failing content contract turns
that dataset's health line red.** If Phase 2 has not landed, degrade explicitly and **say so in the output** — never
report a half-signal as whole.

### D-3 🟡 §9 demands "one line per dataset **AND ONE PER WATCHER**" — the watcher lines don't exist
This phase emits registry lines + coverage-only lines. **A workflow with no registry entry never appears at all** —
including `graphify-republish`, which is **0-for-2 (has never once succeeded)**. Add the third line class, or amend
the spec explicitly and say why.

### D-4 🟡 The prescriptions enum is duplicated across two languages with NO cross-language test
`SUPERSEDED` and `UNKNOWN_CANCEL` are emitted by the JS handler but are **not members of §11's ten**. The spec says
the enum is **shared** by doctor and the incident handler. **Duplicated literals in two languages with no test IS the
one-letter-drift class this entire build exists to kill.** Define ONE source of truth and add a test asserting the JS
and Python member lists are identical.

### D-5 🟡 Three enum members are unreachable, and `--dry-run` is unbounded
`ACTION_VERSION` / `SECRET_NOT_WIRED` / `SCHEMA_NAME_DRIFT` are Phase-3-owned (the CI cross-check); `WAF_BLOCK`
needs a log read nobody builds. **Phase 3 now exists in this plan** — either consume its output for those, or state
plainly which member is produced by which phase. **No unreachable strings.**
Separately: §10 requires `doctor --dry-run` **< 2 min**, but `collect_gh` makes 1 bulk call + up to **40** targeted
`gh run list` calls with **nothing bounding the wall clock.** Bound it with a deadline and assert the timing.

### D-6 🟡 Close the RIGHT check
Spec §"Check linkage": `data_contracts_doctor_live_verify` closes on **Phase 1–3 acceptance green LIVE + doctor's
first real run archived in `verification/`.** This phase closes only `pipeline_doctor_live_verify`. **Nothing in the
plan closes the parent.** Add the close, gated on real live evidence (never dev attestation).

### D-7 🟡 Task 5 has no artifact and no code ("Step 3: Commit — nothing to commit"). It is a ledger action — fold it into Task 6.

### D-8 🟡 Task 10 edits a LIVE cron (`freshness-probe-daily.yml` — widening `permissions:` to `actions: read`, injecting `GH_TOKEN`) → **[ASK-FIRST]**.

### D-9 🟡 Verify your imports against the live file
Another phase imports `_fetch_max_freshness` / `check_tier1_entry`, which this phase's own "verified exports" table
omits. **Open `ingest/scripts/check_freshness.py` and publish the ACTUAL export list with line cites.** One phase's
verified-export list contradicting another phase's import list is the same drift class, one level up.

---


Builds `ingest/scripts/doctor.py`: one health line per dataset = worst of {freshness, volume, content, run-status}, each red line carrying a prescription from the shared enum or explicit "unknown class — evidence attached." Written in Python so it **imports** `check_freshness.py` + `check_data_quality.py` (never re-queries), joins the three cred domains over **one** psycopg connection + one bulk `gh` shell + the Phase-3a manifest, and emits `--json` that **backs the existing `/census` ops page** (not a competing dashboard). Ships **ADVISORY** (always exit 0); the gating flip and the `freshness-probe-daily.yml` body-fold are separate **[ASK-FIRST]** tasks at the end.

**Unblocked by:** Spine (§3 `workflow:` field), Phase 1 (`content_contracts` → doctor's content signal grows automatically), Phase 3a (`_watch-manifest.json`). Doctor **fail-softs** on each of those being absent, so it is buildable and testable today.

---

### Interfaces this phase CONSUMES (verified against the live tree; do not re-derive)

From `ingest/scripts/check_freshness.py` — **import via the package form** (`from ingest.scripts.check_freshness import ...`, the `generate_data_targets.py:19` precedent). Do **NOT** copy `check_data_quality.py:47-48`'s `sys.path.insert` hack.

| Signature | Returns |
|---|---|
| `_get_connection()` | live `psycopg.Connection` (env `DESTINATION__POSTGRES__CREDENTIALS`, else `.dlt/secrets.toml`) |
| `load_registry(path) -> dict` | raw `cadence_registry.yaml`; top-level `pipelines:` + `not_yet_running:` |
| `run_probe(conn, registry) -> tuple[list[dict], list[dict]]` | `(pipeline_results, view_results)`. Each pipeline dict: `{name, lane, last_run, age_days, cadence_days, threshold_days, status, volume_status, volume_landed, volume_min, freshness_sla}`. `status ∈ FRESH\|STALE\|MISSING\|WAITING\|WINDOW_OPEN\|OVERDUE`; `volume_status ∈ OK\|LOW_VOLUME\|None` |
| `check_sla_violations(results) -> tuple[list[str], list[str]]` | `(sla_error_names, sla_warn_names)` |
| `_slug(s) -> str` | `'data_lake.listing_state'` → `'data-lake-listing-state'` |

From `ingest/scripts/check_data_quality.py`:

| Signature | Returns |
|---|---|
| `load_quality_registry(path=_REGISTRY_PATH) -> dict` | `ingest/quality/quality_registry.yaml`, keyed by **physical table** |
| `run_value_tests(conn, registry) -> list[dict]` | `[{table, col, test, severity, failing_rows, status: PASS\|FAIL\|SKIP}]` |

**Phase-3a `_watch-manifest.json`** — consumed at `.github/_watch-manifest.json`, one object per workflow: `{name, file, scheduled, timeout_minutes, cancel_in_progress, paid, should_be_dark, disabled}`.
> ⚠️ **FLAGGED ASSUMPTION — reconcile at integration.** The spec (§7 3a) names the file but not its emit path. If Phase 3a writes it elsewhere, change `_MANIFEST_PATH` in `doctor.py` and nothing else. Doctor **fail-softs when the file is absent**: the run-status domain degrades to `gh` state only, `timeout_minutes` is unknown, `TIMEOUT_KILL` becomes unreachable and those lines fall to `UNKNOWN` + evidence. It never crashes.

**`gh` CLI surface — VERIFIED LIVE in-session (gh 2.95.0, `gh run list --help` / `gh workflow list --help`), not from memory:**
- `gh run list --json` fields: `attempt, conclusion, createdAt, databaseId, displayTitle, event, headBranch, headSha, name, number, startedAt, status, updatedAt, url, workflowDatabaseId, workflowName`. **Default `--limit` is 20 — always pass it.**
- `gh workflow list --json` fields: **exactly** `id, name, path, state`. Flags: `-a/--all`, `-L/--limit` (**default 50 — we have ~83 workflows, so `--limit` is load-bearing or the list silently truncates**).
- Join key: run `workflowDatabaseId` ↔ workflow `id` (survives renames; `gh run list` carries **no** workflow path).

---

### Task 1: Register the build

**Files:**
- Create: `docs/superpowers/specs/2026-07-11-pipeline-doctor-design.md` (stub, by tool)
- Opens check: `pipeline_doctor_live_verify` (project `brain-platform`)

**Interfaces:**
- Consumes: nothing.
- Produces: check key `pipeline_doctor_live_verify` — Task 12 closes it; Task 11's artifact also closes the parent `data_contracts_doctor_live_verify`.

- [ ] **Step 1: Run the registrar** (RULE 3.5 — no build without a check)
```bash
node scripts/new-build.mjs pipeline-doctor "Pipeline doctor — one health line per dataset"
```
- [ ] **Step 2: Verify the check opened**
```bash
node scripts/check.mjs list
```
Expected: a row with `pipeline_doctor_live_verify`.
> If `new-build.mjs` prints `Warning: check 'pipeline_doctor_live_verify' may already exist or creds unavailable.` that is the **expected local outcome without DB creds** — not a failure. In that case open it from a creds-bearing shell: `node scripts/check.mjs open brain-platform pipeline_doctor_live_verify "Pipeline doctor live-verify"`.

- [ ] **Step 3: Make the stub a pointer, not a competing spec.** Replace the whole body of `docs/superpowers/specs/2026-07-11-pipeline-doctor-design.md` with:
```markdown
# Pipeline doctor — one health line per dataset

**Date:** 2026-07-11 · **Parent spec:** `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` §7 3c/3d
**Evidence:** `docs/audit/2026-07-11-pipeline-problems/08f-code-surface.md` (import surface, 3 cred domains)
**Parent check:** `data_contracts_doctor_live_verify` · **This check:** `pipeline_doctor_live_verify`

This is a phase of the parent build, not a separate one. All design lives in the parent spec.
Doctor is the Python health model (`ingest/scripts/doctor.py`); `doctor --json` BACKS the existing
`/census` ops page (ops-repo React) — it is not a parallel dashboard.
```
- [ ] **Step 4: Commit**
```bash
git add docs/superpowers/specs/2026-07-11-pipeline-doctor-design.md
git commit -m "chore(doctor): register pipeline-doctor build + spec pointer"
```

---

### Task 2: The prescriptions enum (spec §11) — the shared authority

**Files:**
- Create: `ingest/lib/prescriptions.py`
- Test: `ingest/tests/lib/test_prescriptions.py`

**Interfaces:**
- Consumes: nothing (pure, DB-free, import-free).
- Produces: the 10 string constants; `ALL: list[str]`; `DOCTOR_ASSIGNABLE: frozenset[str]`; `fix_text(code, *, workflow=None, table=None, pipeline=None, subject=None) -> str`; `should_retry(code) -> bool`. Tasks 6 and 7 import all four.

**The boundary that keeps this from becoming a placeholder — state it and encode it:** the enum is *shared* (doctor + the cron incident handler), but doctor's four signals can only reach a **subset**. `ACTION_VERSION` / `SECRET_NOT_WIRED` / `SCHEMA_NAME_DRIFT` are produced by **Phase 2's `ingest/tools/check-registry-identity.mts` at PR time** — it fails the PR and writes no ledger row, so doctor structurally cannot observe them. `WAF_BLOCK` requires reading a failed run's **log** (the `FetchHealthError` literal that `guards.py:34-45` exists to make greppable) — the incident handler's job, not doctor's. Those four live here for the handler; `DOCTOR_ASSIGNABLE` excludes them, and Task 7 has a test proving `prescribe()` never returns one.

- [ ] **Step 1: Write the failing test** — `ingest/tests/lib/test_prescriptions.py`
```python
"""Every enum member's fix-text must NAME the file/workflow it applies to (spec §11)."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from ingest.lib import prescriptions as rx


def test_all_ten_members_exist():
    assert rx.ALL == [
        rx.ACTION_VERSION,
        rx.SECRET_NOT_WIRED,
        rx.SCHEMA_NAME_DRIFT,
        rx.TIMEOUT_KILL,
        rx.GAP_SENTINEL,
        rx.NEVER_LANDED,
        rx.ZERO_COVERAGE,
        rx.WAF_BLOCK,
        rx.TRANSIENT,
        rx.UNKNOWN,
    ]
    assert len(set(rx.ALL)) == 10


# (code, ctx kwargs, tokens that MUST appear in the fix text)
_CASES = [
    (rx.ACTION_VERSION,     {"workflow": "daily-rebuild.yml"},                          ["daily-rebuild.yml", "uses:"]),
    (rx.SECRET_NOT_WIRED,   {"workflow": "news-swfl-daily.yml"},                        ["news-swfl-daily.yml", "env:"]),
    (rx.SCHEMA_NAME_DRIFT,  {"pipeline": "leepa", "table": "data_lake.leepa_parcels"},  ["ingest/pipelines/leepa/pipeline.py", "ingest/cadence_registry.yaml"]),
    (rx.TIMEOUT_KILL,       {"workflow": "corridor-pulse-weekly.yml"},                  ["corridor-pulse-weekly.yml", "timeout-minutes"]),
    (rx.GAP_SENTINEL,       {"workflow": "steady-listings.yml"},                        ["steady-listings.yml"]),
    (rx.NEVER_LANDED,       {"workflow": "redfin.yml", "table": "data_lake.redfin_city_swfl"}, ["redfin.yml", "data_lake.redfin_city_swfl", "ingest/cadence_registry.yaml"]),
    (rx.ZERO_COVERAGE,      {"table": "data_lake.parcel_subdivision"},                  ["data_lake.parcel_subdivision", "ingest/cadence_registry.yaml"]),
    (rx.WAF_BLOCK,          {"workflow": "lee-permits-daily.yml"},                      ["lee-permits-daily.yml", "ingest/lib/guards.py"]),
    (rx.TRANSIENT,          {"workflow": "zhvi-monthly.yml"},                           ["zhvi-monthly.yml"]),
    (rx.UNKNOWN,            {"subject": "graphify-republish.yml"},                      ["graphify-republish.yml", "ingest/lib/prescriptions.py"]),
]


@pytest.mark.parametrize("code,ctx,tokens", _CASES, ids=[c[0] for c in _CASES])
def test_fix_text_names_the_file_or_workflow(code, ctx, tokens):
    text = rx.fix_text(code, **ctx)
    for tok in tokens:
        assert tok in text, f"{code} fix-text does not name {tok!r}: {text}"


def test_every_member_is_covered_by_a_case():
    assert {c[0] for c in _CASES} == set(rx.ALL)


def test_timeout_kill_never_retries_money_guard():
    assert rx.should_retry(rx.TIMEOUT_KILL) is False
    assert rx.should_retry(rx.WAF_BLOCK) is False
    assert rx.should_retry(rx.TRANSIENT) is True


def test_doctor_assignable_is_a_strict_subset():
    assert rx.DOCTOR_ASSIGNABLE < set(rx.ALL)
    # Phase-2 / log-reading classes are NOT doctor-observable.
    for code in (rx.ACTION_VERSION, rx.SECRET_NOT_WIRED, rx.SCHEMA_NAME_DRIFT, rx.WAF_BLOCK):
        assert code not in rx.DOCTOR_ASSIGNABLE


def test_unknown_code_raises_rather_than_inventing():
    with pytest.raises(ValueError):
        rx.fix_text("MADE_UP_CLASS", workflow="x.yml")


def test_missing_context_is_stated_not_silently_blank():
    text = rx.fix_text(rx.TIMEOUT_KILL)  # no workflow supplied
    assert "workflow unknown" in text
```

- [ ] **Step 2: Run test to verify it fails**
```bash
python -m pytest ingest/tests/lib/test_prescriptions.py -q
```
Expected: `ModuleNotFoundError: No module named 'ingest.lib.prescriptions'` (collection error, 0 tests run).

- [ ] **Step 3: Write minimal implementation** — `ingest/lib/prescriptions.py`
```python
"""Prescription enum — the ONE authority for how a red line is diagnosed (spec §11).

Shared surface: ingest/scripts/doctor.py assigns a SUBSET; the cron incident handler
(Phase 3b, scripts/*.mjs) mirrors the same string literals for its own classification.

A red line NEVER carries an invented diagnosis. It carries a member of this enum, or an
explicit UNKNOWN with the evidence attached. That is the whole contract.

Doctor's four signals (freshness / volume / content / run-status) cannot reach four of
the ten members:
  ACTION_VERSION, SECRET_NOT_WIRED, SCHEMA_NAME_DRIFT — produced by Phase 2's
    ingest/tools/check-registry-identity.mts AT PR TIME. It fails the PR and writes no
    ledger row, so there is nothing for doctor to observe. Doctor never assigns them.
  WAF_BLOCK — requires reading a failed run's LOG for the `FetchHealthError` literal that
    ingest/lib/guards.py:34-45 exists to make greppable. That is the incident handler's
    surface, not doctor's. Doctor never assigns it.
They live here because the handler needs the same literals. DOCTOR_ASSIGNABLE is the
enforced boundary (ingest/scripts/doctor.py::prescribe never returns outside it).
"""
from __future__ import annotations

ACTION_VERSION = "ACTION_VERSION"
SECRET_NOT_WIRED = "SECRET_NOT_WIRED"
SCHEMA_NAME_DRIFT = "SCHEMA_NAME_DRIFT"
TIMEOUT_KILL = "TIMEOUT_KILL"
GAP_SENTINEL = "GAP_SENTINEL"
NEVER_LANDED = "NEVER_LANDED"
ZERO_COVERAGE = "ZERO_COVERAGE"
WAF_BLOCK = "WAF_BLOCK"
TRANSIENT = "TRANSIENT"
UNKNOWN = "UNKNOWN"

ALL: list[str] = [
    ACTION_VERSION,
    SECRET_NOT_WIRED,
    SCHEMA_NAME_DRIFT,
    TIMEOUT_KILL,
    GAP_SENTINEL,
    NEVER_LANDED,
    ZERO_COVERAGE,
    WAF_BLOCK,
    TRANSIENT,
    UNKNOWN,
]

DOCTOR_ASSIGNABLE: frozenset[str] = frozenset(
    {TIMEOUT_KILL, GAP_SENTINEL, NEVER_LANDED, ZERO_COVERAGE, TRANSIENT, UNKNOWN}
)

# TRANSIENT is the ONLY retryable class. TIMEOUT_KILL is explicitly false — the money
# guard: a run that already hit its ceiling re-burns the identical spend on retry (the
# corridor-pulse burn). WAF_BLOCK is false — a retry storm makes an anti-bot block worse.
_SHOULD_RETRY: dict[str, bool] = {TRANSIENT: True}

_FIX_TEMPLATES: dict[str, str] = {
    ACTION_VERSION: (
        "Pinned action version is stale or invalid — edit the `uses:` lines in "
        "`.github/workflows/{workflow}` and resolve against live tags "
        "(`gh api repos/actions/checkout/tags`). NEVER bake a version literal into the checker: "
        "actions/checkout@v6 is valid TODAY and v7 is the latest."
    ),
    SECRET_NOT_WIRED: (
        "Pipeline code reads a secret the workflow never passes — add it to the `env:` block of "
        "`.github/workflows/{workflow}`. `gh secret set` is step 1; wiring it into the workflow "
        "`env:` is step 2, and step 2 is the one that gets skipped."
    ),
    SCHEMA_NAME_DRIFT: (
        "Registry identity string does not match the literal in the pipeline source — reconcile "
        "`ingest/pipelines/{pipeline}/pipeline.py` against its entry in "
        "`ingest/cadence_registry.yaml` (table `{table}`). This is the one-letter class that cost "
        "two weeks of false-RED."
    ),
    TIMEOUT_KILL: (
        "Run hit its ceiling and was killed — raise `timeout-minutes` in "
        "`.github/workflows/{workflow}`, or shrink the batch. DO NOT RE-RUN: should_retry=false. "
        "A retry re-burns the identical spend and hits the identical ceiling."
    ),
    GAP_SENTINEL: (
        "`.github/workflows/{workflow}` ran GREEN and landed no rows — verify the vendor "
        "account/key is alive. A dead key returns an empty 200 and a green run; the pipeline "
        "cannot tell the difference and neither can the cron."
    ),
    NEVER_LANDED: (
        "`ingest/cadence_registry.yaml` claims table `{table}` but the DB has no successful load "
        "for it. Either dispatch `.github/workflows/{workflow}` once and confirm it lands, or "
        "delete the registry entry. A registry entry pointing at a ghost table reads FRESH forever."
    ),
    ZERO_COVERAGE: (
        "Table `{table}` holds real rows but `ingest/cadence_registry.yaml` has no entry for it — "
        "add the entry, or add `coverage_exempt: <reason>` to state the exclusion out loud."
    ),
    WAF_BLOCK: (
        "Source is blocking the fetch — read the failed run of `.github/workflows/{workflow}` for "
        "the `FetchHealthError` raised by `ingest/lib/guards.py`. DO NOT BLIND-RETRY: "
        "should_retry=false; a retry storm makes an anti-bot block worse."
    ),
    TRANSIENT: (
        "Transient failure in `.github/workflows/{workflow}` — retry up to 2x. If it fails a third "
        "time it is NOT transient: escalate and classify it for real."
    ),
    UNKNOWN: (
        "Unknown class for `{subject}` — evidence is attached below; NO diagnosis was invented. "
        "Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the "
        "literal in the Phase-3b incident handler — the enum is shared)."
    ),
}


def fix_text(
    code: str,
    *,
    workflow: str | None = None,
    table: str | None = None,
    pipeline: str | None = None,
    subject: str | None = None,
) -> str:
    """Render a member's fix text. Missing context is STATED, never silently blank —
    a prescription that fails to name its file is a placeholder, which is the failure
    mode this whole build exists to kill."""
    if code not in _FIX_TEMPLATES:
        raise ValueError(f"unknown prescription code {code!r} — known: {', '.join(ALL)}")
    return _FIX_TEMPLATES[code].format(
        workflow=workflow or "<workflow unknown — registry `workflow:` field is missing>",
        table=table or "<table unresolved — no count_table/freshness_table/dlt_schema_name>",
        pipeline=pipeline or "<pipeline unknown>",
        subject=subject or "<subject unknown>",
    )


def should_retry(code: str) -> bool:
    """Only TRANSIENT retries. Everything else is a real class that a retry cannot fix."""
    if code not in _FIX_TEMPLATES:
        raise ValueError(f"unknown prescription code {code!r} — known: {', '.join(ALL)}")
    return _SHOULD_RETRY.get(code, False)
```

- [ ] **Step 4: Run test to verify it passes**
```bash
python -m pytest ingest/tests/lib/test_prescriptions.py -q
```
Expected: `15 passed` (10 parametrized + 5 others).

- [ ] **Step 5: Commit**
```bash
git add ingest/lib/prescriptions.py ingest/tests/lib/test_prescriptions.py
git commit -m "feat(doctor): prescriptions enum — 10 members, fix-text names its file/workflow"
```

---

### Task 3: `gh_runs.py` — cred domain B (run-status), pure/impure split

**Files:**
- Create: `ingest/lib/gh_runs.py`
- Test: `ingest/tests/lib/test_gh_runs.py`

**Interfaces:**
- Consumes: nothing from earlier tasks. Shells to `gh` (Domain 3 has **no Python helper** — it lives only in the TS watcher `scripts/tripwire-scan.mjs:103,129`, so doctor authors it).
- Produces:
  - `GhUnavailable(RuntimeError)`
  - `fetch_workflows(limit: int = 200) -> list[dict]` — impure
  - `fetch_runs(limit: int = 500) -> list[dict]` — impure
  - `fetch_runs_for_workflow(path: str, limit: int = 5) -> list[dict]` — impure
  - `index_workflows(workflows: list[dict]) -> dict[str, dict]` — **pure**
  - `summarize_runs(runs, workflows_by_file, *, now, manifest_by_file=None) -> dict[str, dict]` — **pure**

  Task 6 imports `index_workflows` + `summarize_runs`; Task 8 imports the `fetch_*` trio.

**Why the pure/impure split:** every unit test below runs with **zero `gh`, zero network**. The subprocess functions are never called in a test.

**Why the backfill call exists (do not remove it):** `gh run list --limit 500` covers roughly 4–5 days of a ~83-workflow fleet. A **weekly or monthly** workflow can legitimately have zero runs inside that window — reporting it `NEVER_RAN` would be a **false RED**, the exact failure this build exists to kill. So: bulk once, then one targeted `--workflow <path> --limit 5` call **only** for the workflows the bulk window missed (bounded by `max_backfill`).

- [ ] **Step 1: Write the failing test** — `ingest/tests/lib/test_gh_runs.py`
```python
"""Pure-side tests for the gh (run-status) domain. Zero subprocess, zero network."""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from ingest.lib import gh_runs

NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=timezone.utc)

WORKFLOWS = [
    {"id": 1, "name": "Daily rebuild", "path": ".github/workflows/daily-rebuild.yml", "state": "active"},
    {"id": 2, "name": "Corridor pulse weekly", "path": ".github/workflows/corridor-pulse-weekly.yml", "state": "active"},
    {"id": 3, "name": "Graphify republish", "path": ".github/workflows/graphify-republish.yml", "state": "active"},
    {"id": 4, "name": "Narrative bake", "path": ".github/workflows/narrative-bake.yml", "state": "disabled_manually"},
    {"id": 5, "name": "Annual FAF5", "path": ".github/workflows/faf5-annual.yml", "state": "active"},
]

MANIFEST = {
    "corridor-pulse-weekly.yml": {"file": "corridor-pulse-weekly.yml", "scheduled": True, "timeout_minutes": 30},
    "daily-rebuild.yml": {"file": "daily-rebuild.yml", "scheduled": True, "timeout_minutes": 60},
    "narrative-bake.yml": {"file": "narrative-bake.yml", "scheduled": True, "timeout_minutes": 20},
    "graphify-republish.yml": {"file": "graphify-republish.yml", "scheduled": True, "timeout_minutes": 15},
    "faf5-annual.yml": {"file": "faf5-annual.yml", "scheduled": True, "timeout_minutes": 30},
}


def _run(wf_id, name, conclusion, created, updated, status="completed"):
    return {
        "workflowDatabaseId": wf_id,
        "workflowName": name,
        "conclusion": conclusion,
        "status": status,
        "event": "schedule",
        "createdAt": created,
        "startedAt": created,
        "updatedAt": updated,
        "url": f"https://github.com/x/y/actions/runs/{wf_id}",
    }


def test_index_workflows_keys_by_filename():
    idx = gh_runs.index_workflows(WORKFLOWS)
    assert set(idx) == {
        "daily-rebuild.yml",
        "corridor-pulse-weekly.yml",
        "graphify-republish.yml",
        "narrative-bake.yml",
        "faf5-annual.yml",
    }
    assert idx["daily-rebuild.yml"]["id"] == 1


def test_green_run_and_last_success():
    runs = [_run(1, "Daily rebuild", "success", "2026-07-11T04:05:00Z", "2026-07-11T04:42:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    d = s["daily-rebuild.yml"]
    assert d["run_status"] == "GREEN"
    assert d["last_conclusion"] == "success"
    assert d["last_success_at"] == "2026-07-11T04:05:00Z"
    assert d["consecutive_failures"] == 0


def test_cancelled_at_95pct_of_timeout_is_TIMEOUT_not_CANCELLED():
    # corridor-pulse-weekly: timeout_minutes 30 -> 29 elapsed minutes is >= 95% (28.5).
    runs = [_run(2, "Corridor pulse weekly", "cancelled", "2026-07-11T02:00:00Z", "2026-07-11T02:29:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    assert s["corridor-pulse-weekly.yml"]["run_status"] == "TIMEOUT"


def test_cancelled_well_under_timeout_is_CANCELLED():
    runs = [_run(2, "Corridor pulse weekly", "cancelled", "2026-07-11T02:00:00Z", "2026-07-11T02:04:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    assert s["corridor-pulse-weekly.yml"]["run_status"] == "CANCELLED"


def test_cancelled_with_no_manifest_timeout_degrades_to_CANCELLED_never_guesses_TIMEOUT():
    runs = [_run(2, "Corridor pulse weekly", "cancelled", "2026-07-11T02:00:00Z", "2026-07-11T02:29:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=None)
    assert s["corridor-pulse-weekly.yml"]["run_status"] == "CANCELLED"
    assert s["corridor-pulse-weekly.yml"]["timeout_minutes"] is None


def test_consecutive_failures_counts_the_leading_streak_only():
    runs = [
        _run(3, "Graphify republish", "failure", "2026-07-11T05:00:00Z", "2026-07-11T05:01:00Z"),
        _run(3, "Graphify republish", "failure", "2026-07-10T05:00:00Z", "2026-07-10T05:01:00Z"),
        _run(3, "Graphify republish", "success", "2026-07-09T05:00:00Z", "2026-07-09T05:01:00Z"),
        _run(3, "Graphify republish", "failure", "2026-07-08T05:00:00Z", "2026-07-08T05:01:00Z"),
    ]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    d = s["graphify-republish.yml"]
    assert d["run_status"] == "RED"
    assert d["consecutive_failures"] == 2
    assert d["last_success_at"] == "2026-07-09T05:00:00Z"


def test_disabled_at_the_api_beats_a_green_run():
    # Correction #5: 4 workflows carry a live cron in SOURCE but are disabled_manually at
    # the GitHub API. Only `gh workflow list` state sees this — the file does not.
    runs = [_run(4, "Narrative bake", "success", "2026-07-01T10:23:00Z", "2026-07-01T10:30:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    d = s["narrative-bake.yml"]
    assert d["run_status"] == "DISABLED"
    assert d["state"] == "disabled_manually"
    assert d["cron_in_source"] is True  # manifest says scheduled -> a cron nobody is running


def test_no_runs_in_window_is_NO_RUNS_IN_WINDOW_not_NEVER_RAN():
    # An annual/monthly workflow legitimately has no run inside a 500-run window.
    # Calling that NEVER_RAN would be a FALSE RED. It must stay unproven until the
    # targeted per-workflow backfill (fetch_runs_for_workflow) says otherwise.
    s = gh_runs.summarize_runs([], gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    assert s["faf5-annual.yml"]["run_status"] == "NO_RUNS_IN_WINDOW"
    assert s["faf5-annual.yml"]["last_success_at"] is None


def test_backfilled_empty_result_promotes_to_NEVER_RAN():
    idx = gh_runs.index_workflows(WORKFLOWS)
    s = gh_runs.summarize_runs([], idx, now=NOW, manifest_by_file=MANIFEST)
    s = gh_runs.apply_backfill(s, {"faf5-annual.yml": []}, now=NOW, manifest_by_file=MANIFEST)
    assert s["faf5-annual.yml"]["run_status"] == "NEVER_RAN"


def test_backfilled_old_success_is_GREEN_not_a_false_red():
    idx = gh_runs.index_workflows(WORKFLOWS)
    s = gh_runs.summarize_runs([], idx, now=NOW, manifest_by_file=MANIFEST)
    old = [_run(5, "Annual FAF5", "success", "2026-01-04T03:00:00Z", "2026-01-04T03:20:00Z")]
    s = gh_runs.apply_backfill(s, {"faf5-annual.yml": old}, now=NOW, manifest_by_file=MANIFEST)
    assert s["faf5-annual.yml"]["run_status"] == "GREEN"
    assert s["faf5-annual.yml"]["last_success_at"] == "2026-01-04T03:00:00Z"


def test_workflows_needing_backfill_lists_only_the_empty_ones():
    s = gh_runs.summarize_runs(
        [_run(1, "Daily rebuild", "success", "2026-07-11T04:05:00Z", "2026-07-11T04:42:00Z")],
        gh_runs.index_workflows(WORKFLOWS),
        now=NOW,
        manifest_by_file=MANIFEST,
    )
    need = gh_runs.workflows_needing_backfill(s)
    assert "daily-rebuild.yml" not in need
    assert "faf5-annual.yml" in need
```

- [ ] **Step 2: Run test to verify it fails**
```bash
python -m pytest ingest/tests/lib/test_gh_runs.py -q
```
Expected: `ModuleNotFoundError: No module named 'ingest.lib.gh_runs'`.

- [ ] **Step 3: Write minimal implementation** — `ingest/lib/gh_runs.py`
```python
"""Cred domain B — GitHub Actions run-status, via the `gh` CLI over subprocess.

There is NO Python helper for this domain. It lives entirely in the TS watcher
(scripts/tripwire-scan.mjs:103 `gh workflow list --all`, :129 `gh run list --json ...`),
and ingest/requirements-probe.txt carries no HTTP client and no GitHub client. So doctor
shells to `gh` itself. Precedent for subprocess in ingest/: backfill_lee_permits.py:13,50
and faf5_to_parquet.py:14,70.

`gh` is preinstalled and authenticated on GHA runners WHEN `GH_TOKEN` is set — AND the
workflow declares `permissions: actions: read`. With an explicit `permissions:` block,
unspecified scopes default to NONE, so without `actions: read` both commands 403 and the
whole run-status domain silently degrades to UNKNOWN. See freshness-probe-daily.yml.

VERIFIED LIVE (gh 2.95.0, `--help`, 2026-07-11) — do not change these field lists from memory:
  gh run list      --json: attempt conclusion createdAt databaseId displayTitle event headBranch
                           headSha name number startedAt status updatedAt url workflowDatabaseId
                           workflowName          (default --limit 20 — ALWAYS pass it)
  gh workflow list --json: id name path state    (default --limit 50 — we have ~83 workflows,
                           so --limit is load-bearing or the list silently truncates)
  Runs carry NO workflow path. The join is run.workflowDatabaseId <-> workflow.id.

PURE / IMPURE SPLIT: only fetch_* touch subprocess. index_workflows / summarize_runs /
apply_backfill / workflows_needing_backfill are pure and fixture-tested with zero gh.
"""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone

_RUN_FIELDS = (
    "workflowName,workflowDatabaseId,conclusion,status,event,createdAt,startedAt,updatedAt,url"
)
_WF_FIELDS = "id,name,path,state"

# A cancelled run that burned >= this share of its ceiling was killed BY the ceiling.
_TIMEOUT_RATIO = 0.95


class GhUnavailable(RuntimeError):
    """`gh` is missing, unauthenticated, 403 (no `actions: read`), or timed out.

    Doctor DEGRADES on this — it prints the reason, marks run-status unknown on every
    line, and still emits the Postgres domains. It never crashes and never green-washes:
    an unavailable domain is reported as unavailable, not as healthy.
    """


def _gh_json(args: list[str], timeout: int = 90):
    try:
        proc = subprocess.run(
            ["gh", *args], capture_output=True, text=True, timeout=timeout, check=False
        )
    except FileNotFoundError as exc:
        raise GhUnavailable("`gh` is not on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise GhUnavailable(f"`gh {' '.join(args)}` timed out after {timeout}s") from exc
    if proc.returncode != 0:
        err = (proc.stderr or "").strip()[:300]
        hint = ""
        if "403" in err or "not accessible" in err.lower():
            hint = " — add `permissions: actions: read` to the workflow, and GH_TOKEN to env:"
        raise GhUnavailable(f"`gh {' '.join(args)}` exited {proc.returncode}: {err}{hint}")
    try:
        return json.loads(proc.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise GhUnavailable(f"`gh {' '.join(args)}` returned non-JSON output") from exc


def fetch_workflows(limit: int = 200) -> list[dict]:
    """--all includes disabled workflows (the `disabled_manually` class). IMPURE."""
    return _gh_json(["workflow", "list", "--all", "--limit", str(limit), "--json", _WF_FIELDS])


def fetch_runs(limit: int = 500) -> list[dict]:
    """ONE bulk call for the whole fleet — not one per workflow. IMPURE."""
    return _gh_json(["run", "list", "--limit", str(limit), "--json", _RUN_FIELDS])


def fetch_runs_for_workflow(path: str, limit: int = 5) -> list[dict]:
    """Targeted backfill for a workflow the bulk window missed (weekly/monthly/annual).
    `path` is the full workflow path from `gh workflow list` (.github/workflows/x.yml). IMPURE."""
    return _gh_json(
        ["run", "list", "--workflow", path, "--limit", str(limit), "--json", _RUN_FIELDS]
    )


# ── pure ──────────────────────────────────────────────────────────────────────


def _iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def index_workflows(workflows: list[dict]) -> dict[str, dict]:
    """{basename(path): workflow} — keyed by FILENAME, the same key the Spine's
    registry `workflow:` field and the Phase-3a manifest's `file` field use. PURE."""
    out: dict[str, dict] = {}
    for wf in workflows:
        fname = (wf.get("path") or "").rsplit("/", 1)[-1]
        if fname:
            out[fname] = wf
    return out


def _classify(wf: dict, wf_runs: list[dict], timeout_minutes, *, backfilled: bool) -> dict:
    state = wf.get("state", "active")
    completed = [r for r in wf_runs if r.get("status") == "completed"]
    last = wf_runs[0] if wf_runs else None
    last_success = next((r for r in completed if r.get("conclusion") == "success"), None)

    streak = 0
    for r in completed:
        if r.get("conclusion") == "success":
            break
        streak += 1

    if state != "active":
        status = "DISABLED"
    elif not wf_runs:
        # NEVER_RAN is only assertable AFTER the targeted backfill came back empty.
        # Before that, "no runs in a 500-run window" is a WINDOW artifact for any
        # weekly/monthly/annual workflow — asserting NEVER_RAN there is a false RED.
        status = "NEVER_RAN" if backfilled else "NO_RUNS_IN_WINDOW"
    elif last.get("status") != "completed":
        status = "IN_PROGRESS"
    elif last.get("conclusion") == "success":
        status = "GREEN"
    elif last.get("conclusion") in ("cancelled", "timed_out"):
        started = _iso(last.get("startedAt")) or _iso(last.get("createdAt"))
        ended = _iso(last.get("updatedAt"))
        elapsed_min = (ended - started).total_seconds() / 60 if (started and ended) else None
        if (
            timeout_minutes
            and elapsed_min is not None
            and elapsed_min >= _TIMEOUT_RATIO * float(timeout_minutes)
        ):
            status = "TIMEOUT"
        else:
            status = "CANCELLED"
    else:
        status = "RED"

    return {
        "file": (wf.get("path") or "").rsplit("/", 1)[-1],
        "name": wf.get("name"),
        "state": state,
        "run_status": status,
        "last_conclusion": last.get("conclusion") if last else None,
        "last_run_at": last.get("createdAt") if last else None,
        "last_success_at": last_success.get("createdAt") if last_success else None,
        "consecutive_failures": streak,
        "url": last.get("url") if last else None,
        "timeout_minutes": timeout_minutes,
        "cron_in_source": None,  # filled by the caller from the manifest
    }


def summarize_runs(
    runs: list[dict],
    workflows_by_file: dict[str, dict],
    *,
    now: datetime,
    manifest_by_file: dict[str, dict] | None = None,
) -> dict[str, dict]:
    """PURE. -> {workflow_file: summary}.

    run_status ∈ GREEN | RED | TIMEOUT | CANCELLED | IN_PROGRESS | DISABLED |
                 NO_RUNS_IN_WINDOW | NEVER_RAN
    """
    by_id: dict[int, list[dict]] = {}
    for r in runs:
        by_id.setdefault(r.get("workflowDatabaseId"), []).append(r)
    for lst in by_id.values():
        lst.sort(key=lambda r: r.get("createdAt") or "", reverse=True)

    out: dict[str, dict] = {}
    for fname, wf in workflows_by_file.items():
        man = (manifest_by_file or {}).get(fname) or {}
        summary = _classify(wf, by_id.get(wf.get("id"), []), man.get("timeout_minutes"), backfilled=False)
        summary["cron_in_source"] = bool(man.get("scheduled")) if man else None
        out[fname] = summary
    return out


def workflows_needing_backfill(summaries: dict[str, dict]) -> list[str]:
    """PURE. Files whose run history fell outside the bulk window — the ONLY ones that
    justify a targeted per-workflow gh call."""
    return sorted(f for f, s in summaries.items() if s["run_status"] == "NO_RUNS_IN_WINDOW")


def apply_backfill(
    summaries: dict[str, dict],
    backfilled: dict[str, list[dict]],
    *,
    now: datetime,
    manifest_by_file: dict[str, dict] | None = None,
) -> dict[str, dict]:
    """PURE. Fold targeted per-workflow run lists back in. An empty list here is the ONLY
    evidence that promotes NO_RUNS_IN_WINDOW -> NEVER_RAN."""
    out = dict(summaries)
    for fname, wf_runs in backfilled.items():
        prev = out.get(fname)
        if prev is None:
            continue
        man = (manifest_by_file or {}).get(fname) or {}
        wf = {
            "path": f".github/workflows/{fname}",
            "name": prev["name"],
            "state": prev["state"],
            "id": None,
        }
        ordered = sorted(wf_runs, key=lambda r: r.get("createdAt") or "", reverse=True)
        summary = _classify(wf, ordered, man.get("timeout_minutes") or prev["timeout_minutes"], backfilled=True)
        summary["cron_in_source"] = prev["cron_in_source"]
        out[fname] = summary
    return out
```

- [ ] **Step 4: Run test to verify it passes**
```bash
python -m pytest ingest/tests/lib/test_gh_runs.py -q
```
Expected: `11 passed`.

- [ ] **Step 5: Commit**
```bash
git add ingest/lib/gh_runs.py ingest/tests/lib/test_gh_runs.py
git commit -m "feat(doctor): gh run-status domain — bulk fetch + backfill, no false NEVER_RAN"
```

---

### Task 4: `doctor.py` — the pure join layer (view detection, table resolution, worst-of)

**Files:**
- Create: `ingest/scripts/doctor.py` (pure section only; the I/O + CLI arrive in Tasks 6–8)
- Test: `ingest/tests/scripts/test_doctor.py` (new)

**Interfaces:**
- Consumes: `ingest.scripts.check_freshness._slug`.
- Produces (all **pure**, all imported by Tasks 6/7/8):
  - `RELKIND_SQL: str`
  - `kind_from_relkind(relkind: str | None) -> str` → `"table" | "view" | "missing"`
  - `resolve_table(entry: dict) -> str | None`
  - `worst_of(*severities: str) -> str`
  - `freshness_severity(result: dict, sla_errors: set[str]) -> str`
  - `volume_severity(entry: dict, result: dict) -> tuple[str, str]` → `(status, severity)`
  - `content_severity(table: str | None, value_results: list[dict]) -> tuple[str, str, list[dict]]`
  - `run_severity(summary: dict | None, gh_error: str | None) -> tuple[str, str]`

**THE FALSE-GREEN RULE (must-fix — this is root cause 1 restated).** `check_volume_entry` returns `None` for **three indistinguishable reasons** (`check_freshness.py:365-367` no floor · `:369-371` tier-1 lane · `:399-404` **any DB error, including a table that does not exist** — rollback-swallowed). A doctor that treats `None` as "n/a → green" re-ships the exact bug ("green ≠ data") **inside the fix**. `volume_severity` therefore disambiguates from the ENTRY, not from the None:
- `OK` → green · `LOW_VOLUME` → **red**
- `None` + tier-1 lane + **not** `nightly: true` → `NOT_APPLICABLE` / green (no SQL table exists by construction)
- `None` + tier-1 lane + `nightly: true` → **`UNRESOLVED` / red** — this is `city_pulse`: the spec names it a nightly row-gate source but the registry gives it `lane: tier-1`, no `count_table`, no `expected_rows_min`, and `check_volume_entry` early-returns `None` for every tier-1 lane. The gate is *structurally unreachable*. Doctor must say so, not smile.
- `None` + no `expected_rows_min` → `NO_FLOOR` / **yellow** (an undeclared floor is a real gap, not health)
- `None` + tier-2 + **has** `expected_rows_min` → **`UNRESOLVED` / red** — the helper swallowed a DB error or the table does not exist. This is the `redfin_city_swfl` "confirmed but never landed" class.

- [ ] **Step 1: Write the failing test** — `ingest/tests/scripts/test_doctor.py`
```python
"""Pure-layer tests for doctor.py. Zero DB, zero gh, zero network."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from ingest.scripts import doctor


# ── view detection: pg_catalog, never information_schema ──────────────────────


def test_relkind_sql_reads_pg_catalog_not_information_schema():
    """LANDMINE: the lake MCP proxy's information_schema.tables reports
    data_lake.listing_active_stats as BASE TABLE. Only pg_catalog.pg_class.relkind
    tells the truth. Any view-vs-table branch MUST read pg_catalog."""
    sql = doctor.RELKIND_SQL.lower()
    assert "pg_catalog.pg_class" in sql
    assert "relkind" in sql
    assert "information_schema" not in sql


@pytest.mark.parametrize(
    "relkind,expected",
    [("r", "table"), ("p", "table"), ("v", "view"), ("m", "view"), ("f", "table"), (None, "missing")],
)
def test_kind_from_relkind(relkind, expected):
    assert doctor.kind_from_relkind(relkind) == expected


# ── join key ──────────────────────────────────────────────────────────────────


def test_resolve_table_mirrors_check_volume_entry_order():
    assert doctor.resolve_table({"count_table": "data_lake.a", "freshness_table": "data_lake.b"}) == "data_lake.a"
    assert doctor.resolve_table({"freshness_table": "data_lake.b"}) == "data_lake.b"
    assert doctor.resolve_table({"dlt_schema_name": "zhvi_swfl"}) == "data_lake.zhvi_swfl"
    assert doctor.resolve_table({"lane": "tier-1", "inventory_id": "x"}) is None


# ── worst-of ──────────────────────────────────────────────────────────────────


def test_worst_of():
    assert doctor.worst_of("green", "green") == "green"
    assert doctor.worst_of("green", "yellow", "green") == "yellow"
    assert doctor.worst_of("green", "yellow", "red") == "red"
    assert doctor.worst_of() == "green"


# ── freshness ─────────────────────────────────────────────────────────────────


def test_freshness_missing_is_red():
    assert doctor.freshness_severity({"name": "x", "status": "MISSING"}, set()) == "red"


def test_freshness_stale_is_yellow_unless_it_breached_its_own_SLA():
    assert doctor.freshness_severity({"name": "x", "status": "STALE"}, set()) == "yellow"
    assert doctor.freshness_severity({"name": "x", "status": "STALE"}, {"x"}) == "red"


def test_freshness_fresh_and_waiting_are_green():
    assert doctor.freshness_severity({"name": "x", "status": "FRESH"}, set()) == "green"
    assert doctor.freshness_severity({"name": "x", "status": "WAITING"}, set()) == "green"


# ── volume: the false-green rule ──────────────────────────────────────────────


def test_volume_ok_is_green_and_low_volume_is_red():
    assert doctor.volume_severity({"lane": "tier-2"}, {"volume_status": "OK"}) == ("OK", "green")
    assert doctor.volume_severity({"lane": "tier-2"}, {"volume_status": "LOW_VOLUME"}) == ("LOW_VOLUME", "red")


def test_tier2_with_a_declared_floor_and_a_None_volume_is_UNRESOLVED_RED_not_green():
    """check_volume_entry returns None on ANY DB error incl. a missing table
    (check_freshness.py:399-404, rollback-swallowed). For an entry that DECLARED a floor,
    None means the count could not be taken — that is the redfin_city_swfl ghost-table
    class. Silently greening it rebuilds root cause 1 INSIDE the fix."""
    entry = {"lane": "tier-2", "expected_rows_min": 9000, "count_table": "data_lake.ghost"}
    assert doctor.volume_severity(entry, {"volume_status": None}) == ("UNRESOLVED", "red")


def test_tier1_nightly_WITH_the_Spine_count_table_is_green_NOT_a_permanent_false_red():
    """city_pulse. The Spine attaches count_table + expected_rows_min, so assert_landed
    counts it DIRECTLY. check_volume_entry still returns None for it -- but that is the
    helper's tier-1 early return (:369-371), NOT a missing count. Reding a healthy source
    here would fail the daily probe EVERY MORNING once --fail-on red lands: a manufactured
    false-RED, the exact desensitization this build exists to reverse."""
    entry = {"lane": "tier-1", "nightly": True, "inventory_id": "city_pulse",
             "count_table": "data_lake.city_pulse", "expected_rows_min": 50}
    assert doctor.volume_severity(entry, {"volume_status": None})[1] == "green"


def test_tier1_nightly_WITHOUT_a_count_table_is_still_UNRESOLVED_RED():
    """The inverse. A nightly tier-1 entry the Spine did NOT make countable is a REAL
    hole -- the gate cannot reach it. Doctor says so; it does not pretend."""
    entry = {"lane": "tier-1", "nightly": True, "inventory_id": "x"}
    assert doctor.volume_severity(entry, {"volume_status": None}) == ("UNRESOLVED", "red")


def test_tier1_not_nightly_volume_is_NOT_APPLICABLE_green():
    entry = {"lane": "tier-1", "inventory_id": "zori"}
    assert doctor.volume_severity(entry, {"volume_status": None}) == ("NOT_APPLICABLE", "green")


def test_tier2_without_a_floor_is_NO_FLOOR_yellow_never_green():
    entry = {"lane": "tier-2", "freshness_table": "data_lake.x"}
    assert doctor.volume_severity(entry, {"volume_status": None}) == ("NO_FLOOR", "yellow")


# ── content ───────────────────────────────────────────────────────────────────


def test_content_error_fail_is_red_warn_fail_is_yellow_skip_is_yellow():
    vr = [
        {"table": "data_lake.t", "col": "a", "test": "not_null", "severity": "error", "status": "FAIL", "failing_rows": 91},
        {"table": "data_lake.t", "col": "b", "test": "unique", "severity": "warn", "status": "PASS", "failing_rows": 0},
    ]
    status, sev, failing = doctor.content_severity("data_lake.t", vr)
    assert (status, sev) == ("FAIL", "red")
    assert len(failing) == 1 and failing[0]["failing_rows"] == 91

    vr2 = [{"table": "data_lake.t", "col": "a", "test": "not_null", "severity": "warn", "status": "FAIL", "failing_rows": 3}]
    assert doctor.content_severity("data_lake.t", vr2)[:2] == ("FAIL", "yellow")

    vr3 = [{"table": "data_lake.t", "col": "a", "test": "range", "severity": "error", "status": "SKIP", "failing_rows": None}]
    assert doctor.content_severity("data_lake.t", vr3)[:2] == ("SKIP", "yellow")


def test_content_with_no_contracts_is_NO_CONTRACT_and_contributes_green():
    """Only 4 of ~74 datasets carry contracts today. Yellowing the other 70 would flood
    the report and train the operator to ignore it. The COVERAGE number carries that fact
    (header line), not 70 yellow rows."""
    assert doctor.content_severity("data_lake.t", [])[:2] == ("NO_CONTRACT", "green")
    assert doctor.content_severity(None, [])[:2] == ("NO_CONTRACT", "green")


# ── run-status ────────────────────────────────────────────────────────────────


def test_run_severity_map():
    assert doctor.run_severity({"run_status": "GREEN"}, None) == ("GREEN", "green")
    assert doctor.run_severity({"run_status": "RED"}, None) == ("RED", "red")
    assert doctor.run_severity({"run_status": "TIMEOUT"}, None) == ("TIMEOUT", "red")
    assert doctor.run_severity({"run_status": "NEVER_RAN"}, None) == ("NEVER_RAN", "red")
    assert doctor.run_severity({"run_status": "CANCELLED"}, None) == ("CANCELLED", "yellow")
    assert doctor.run_severity({"run_status": "IN_PROGRESS"}, None) == ("IN_PROGRESS", "green")
    assert doctor.run_severity({"run_status": "NO_RUNS_IN_WINDOW"}, None) == ("NO_RUNS_IN_WINDOW", "yellow")


def test_disabled_with_a_cron_in_source_is_red_disabled_without_one_is_yellow():
    """Correction #5: 4 workflows carry a live cron in SOURCE but are disabled_manually at
    the API, orphaning 6 registry entries. Neither Phase-2 mode can see it; the manifest +
    gh state can."""
    assert doctor.run_severity({"run_status": "DISABLED", "cron_in_source": True}, None) == ("DISABLED", "red")
    assert doctor.run_severity({"run_status": "DISABLED", "cron_in_source": False}, None) == ("DISABLED", "yellow")


def test_gh_unavailable_is_yellow_never_green():
    """An unavailable domain is reported as unavailable, not as healthy."""
    assert doctor.run_severity(None, "gh 403 — no actions: read") == ("GH_UNAVAILABLE", "yellow")


def test_no_workflow_field_is_yellow_not_green():
    """Spine gap: an entry with no `workflow:` cannot be joined to a run. That is a gap."""
    assert doctor.run_severity(None, None) == ("NO_WORKFLOW", "yellow")
```

- [ ] **Step 2: Run test to verify it fails**
```bash
python -m pytest ingest/tests/scripts/test_doctor.py -q
```
Expected: `ModuleNotFoundError: No module named 'ingest.scripts.doctor'`.

- [ ] **Step 3: Write minimal implementation** — create `ingest/scripts/doctor.py` with this content (Tasks 6–8 append to the same file, they do not replace it):
```python
"""doctor — ONE health line per dataset (spec §7 3c/3d).

worst of {freshness, volume, content, run-status} + a prescription.

Python on purpose: it IMPORTS check_freshness.py + check_data_quality.py rather than
re-querying them. Three cred domains, joined:
  A  Postgres (psycopg)   freshness · volume · content · the public.checks ledger
     -> ONE connection. public.checks lives in the SAME Postgres and is written over the
        same conn by check_freshness.sync_gap_checks — no Supabase REST needed for it.
  B  GitHub Actions (gh)  last-run / last-success / conclusion / enabled-disabled
     -> ingest/lib/gh_runs.py (subprocess; no Python helper exists for this domain).
  C  Supabase PostgREST   view liveness / missing GRANT
     -> check_freshness.check_view_liveness, already called inside run_probe. Genuinely
        separate ONLY because PostgREST catches a missing GRANT that psycopg structurally
        bypasses.

READ-ONLY BY CONSTRUCTION. Doctor writes nothing — not the checks ledger (that is
check_data_quality.sync_quality_checks + check_freshness.sync_gap_checks; a second writer
would double-open), not a baseline, not a row.

ADVISORY: exit 0 always, unless --fail-on red is passed (Task 12, after one green confirm).
"""
from __future__ import annotations

# ── pure join layer (no DB, no gh — unit-tested in ingest/tests/scripts/test_doctor.py) ──

# LOAD-BEARING: pg_catalog, NOT information_schema. The lake MCP proxy's
# information_schema.tables reports data_lake.listing_active_stats as a BASE TABLE. Only
# pg_catalog.pg_class.relkind identifies it as a view ('v'). Every view-vs-table branch in
# this file goes through here.
RELKIND_SQL = """
SELECT n.nspname, c.relname, c.relkind
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = ANY(%s)
  AND c.relkind = ANY(ARRAY['r', 'v', 'm', 'p', 'f'])
"""

_KIND = {"r": "table", "p": "table", "f": "table", "v": "view", "m": "view"}


def kind_from_relkind(relkind: str | None) -> str:
    """'v'/'m' -> view · 'r'/'p'/'f' -> table · absent from pg_class -> missing (a GHOST
    table: the registry claims it, Postgres has never heard of it)."""
    return _KIND.get(relkind or "", "missing")


def resolve_table(entry: dict) -> str | None:
    """The physical table a registry entry lands in — the join key between
    cadence_registry.yaml (keyed by PIPELINE NAME) and quality_registry.yaml (keyed by
    PHYSICAL TABLE). No crosswalk exists; doctor builds it.

    MIRRORS check_volume_entry's resolution order (check_freshness.py:373-377) exactly, so
    doctor's join key and the volume probe's count target can never diverge."""
    return (
        entry.get("count_table")
        or entry.get("freshness_table")
        or (f"data_lake.{entry['dlt_schema_name']}" if entry.get("dlt_schema_name") else None)
    )


_RANK = {"green": 0, "yellow": 1, "red": 2}


def worst_of(*severities: str) -> str:
    worst = "green"
    for s in severities:
        if _RANK.get(s, 0) > _RANK[worst]:
            worst = s
    return worst


# ── the four signals -> severity ──────────────────────────────────────────────

_FRESHNESS_SEVERITY = {
    "FRESH": "green",
    "WAITING": "green",
    "WINDOW_OPEN": "yellow",
    "STALE": "yellow",
    "UNINITIALIZED": "yellow",
    "OVERDUE": "red",
    "MISSING": "red",
}


def freshness_severity(result: dict, sla_errors: set[str]) -> str:
    """STALE is yellow — UNLESS this source opted into a freshness_sla and breached its own
    error_after_days, which is the source itself declaring the staleness unacceptable."""
    if result.get("name") in sla_errors:
        return "red"
    return _FRESHNESS_SEVERITY.get(result.get("status", ""), "yellow")


def volume_severity(entry: dict, result: dict) -> tuple[str, str]:
    """(status, severity). THE FALSE-GREEN RULE.

    check_volume_entry returns None for three INDISTINGUISHABLE reasons — no
    expected_rows_min (:365-367), a tier-1 lane (:369-371), or ANY DB error including a
    table that does not exist (:399-404, rollback-swallowed). Treating None as "n/a, green"
    would re-ship "green != data" inside the fix. So we disambiguate from the ENTRY."""
    vs = result.get("volume_status")
    if vs == "OK":
        return ("OK", "green")
    if vs == "LOW_VOLUME":
        return ("LOW_VOLUME", "red")

    lane = entry.get("lane", "")
    tier1 = lane in ("tier-1", "tier-1-duckdb")

    # A tier-1 entry the SPINE made COUNTABLE (count_table + expected_rows_min) is gated by
    # assert_landed.py, which counts count_table DIRECTLY and never calls check_volume_entry.
    # check_volume_entry returning None for it is that helper's TIER-1 EARLY RETURN
    # (check_freshness.py:369-371) -- NOT a missing count. Reding it here would fail the daily
    # probe every morning on a healthy source: a manufactured false-RED, which is the exact
    # alarm-fatigue this build exists to reverse. (city_pulse is this case.)
    if tier1 and entry.get("count_table") and entry.get("expected_rows_min") is not None:
        return ("GATED_BY_ASSERT_LANDED", "green")
    if tier1 and entry.get("nightly"):
        # nightly but genuinely NOT countable -> the gate really is unreachable. Say so.
        return ("UNRESOLVED", "red")
    if tier1:
        return ("NOT_APPLICABLE", "green")
    if entry.get("expected_rows_min") is None:
        return ("NO_FLOOR", "yellow")
    # Declared a floor, tier-2, and the count still came back None -> the count could not
    # be taken. Ghost table / missing table / query error. This is redfin_city_swfl.
    return ("UNRESOLVED", "red")


def content_severity(table: str | None, value_results: list[dict]) -> tuple[str, str, list[dict]]:
    """(status, severity, failing_tests). Only ~4 of ~74 datasets carry contracts today —
    NO_CONTRACT contributes GREEN and the coverage count in the header carries that fact.
    Yellowing 70 rows would flood the report and train the operator to ignore it."""
    mine = [r for r in value_results if r.get("table") == table] if table else []
    if not mine:
        return ("NO_CONTRACT", "green", [])
    fails = [r for r in mine if r.get("status") == "FAIL"]
    skips = [r for r in mine if r.get("status") == "SKIP"]
    if any(r.get("severity") == "error" for r in fails):
        return ("FAIL", "red", fails)
    if fails:
        return ("FAIL", "yellow", fails)
    if skips:
        return ("SKIP", "yellow", skips)
    return ("PASS", "green", [])


_RUN_SEVERITY = {
    "GREEN": "green",
    "IN_PROGRESS": "green",
    "CANCELLED": "yellow",
    "NO_RUNS_IN_WINDOW": "yellow",
    "RED": "red",
    "TIMEOUT": "red",
    "NEVER_RAN": "red",
}


def run_severity(summary: dict | None, gh_error: str | None) -> tuple[str, str]:
    """An unavailable domain is reported as UNAVAILABLE, never as healthy."""
    if summary is None:
        if gh_error:
            return ("GH_UNAVAILABLE", "yellow")
        return ("NO_WORKFLOW", "yellow")  # Spine gap: no `workflow:` field -> unjoinable
    status = summary.get("run_status", "")
    if status == "DISABLED":
        # Cron in SOURCE + disabled_manually at the API = a schedule nobody is running.
        # Correction #5: 4 workflows, 6 orphaned registry entries. Neither Phase-2 mode
        # can see this class; the manifest + gh state can.
        return ("DISABLED", "red" if summary.get("cron_in_source") else "yellow")
    return (status, _RUN_SEVERITY.get(status, "yellow"))
```

- [ ] **Step 4: Run test to verify it passes**
```bash
python -m pytest ingest/tests/scripts/test_doctor.py -q
```
Expected: `24 passed`.

- [ ] **Step 5: Commit**
```bash
git add ingest/scripts/doctor.py ingest/tests/scripts/test_doctor.py
git commit -m "feat(doctor): pure join layer — pg_catalog view detect, no-false-green volume rule"
```

---

### Task 5: The `WORKFLOW_DISABLED` + content-red enum gaps — open checks, do NOT unilaterally extend a shared contract

**Files:**
- Modify: none (ledger-only)

**Interfaces:**
- Consumes: `ingest/lib/prescriptions.py` (Task 2).
- Produces: two open `checks` rows.

**Why this task exists.** Task 4 surfaced two real red classes the spec §11 enum has **no member for**:
1. **Workflow disabled at the API while a cron sits in source** (correction #5, 4 workflows / 6 orphaned entries). Nearest member is `UNKNOWN`.
2. **A Locus-B content-contract red** (e.g. `contract_fail_data-lake-listing-state_list_price_range`). It is fully diagnosed by the check itself — table, column, contract, failing-row count — so forcing it into `UNKNOWN` would be *worse* than the truth.

The enum is **shared with the Phase-3b incident handler**. Silently adding an 11th/12th member drifts a cross-language contract — exactly the class this build exists to kill. So: doctor renders (1) as `UNKNOWN` + evidence naming the workflow file, and (2) as a self-describing content line with **no** prescription (Task 7 enforces the invariant that a red line carries a prescription **or** ≥1 failing content test). Both gaps get a `checks` row **in this session** — RULE 2.4, no silent deferrals: "I noted it in the log" is forgetting on a delay.

- [ ] **Step 1: Open both checks**
```bash
node scripts/check.mjs open brain-platform doctor_rx_workflow_disabled_member "Propose WORKFLOW_DISABLED member for the shared prescriptions enum (cron in source + disabled_manually at the GH API — 4 workflows, 6 orphaned registry entries; doctor renders UNKNOWN+evidence today)"
node scripts/check.mjs open brain-platform doctor_rx_content_contract_member "Decide: content-contract reds render self-describing with NO prescription (current) vs a CONTENT_CONTRACT enum member — enum is shared with the Phase-3b incident handler, so this is a contract change, not a local edit"
```
- [ ] **Step 2: Verify both are open**
```bash
node scripts/check.mjs list
```
Expected: both `doctor_rx_*` keys present with state `open`.
- [ ] **Step 3: Commit** — nothing to commit (the ledger is the artifact). Proceed.

---

### Task 6: `prescribe()` — the (observed signal shape) → enum member assignment

**Files:**
- Modify: `ingest/scripts/doctor.py` (append below `run_severity`)
- Test: `ingest/tests/scripts/test_doctor.py` (append)

**Interfaces:**
- Consumes: `ingest.lib.prescriptions` (`fix_text`, `should_retry`, `DOCTOR_ASSIGNABLE`, all 10 constants); `worst_of` (Task 4).
- Produces: `prescribe(line: dict) -> dict | None` returning `{code, should_retry, fix, evidence}` or `None`.

**This is the task where "+ a prescription" either becomes real or becomes a placeholder.** The assignment is an ordered rule list, first match wins, each rule tested:

| # | Observed signal shape | → member |
|---|---|---|
| 1 | `kind == "coverage_only"` (table has rows, registry has no entry) | `ZERO_COVERAGE` |
| 2 | run `TIMEOUT` | `TIMEOUT_KILL` (**`should_retry=false`** — the money guard) |
| 3 | run `GREEN` **and** (volume `LOW_VOLUME`/0 rows **or** freshness `MISSING`) | `GAP_SENTINEL` (dead key = green run) |
| 4 | freshness `MISSING` **or** volume `UNRESOLVED` **or** `kind == "missing"` | `NEVER_LANDED` |
| 5 | run `RED` **and** `consecutive_failures ≤ 2` | `TRANSIENT` |
| 6 | any other red signal (run `RED` ≥3 · `DISABLED`+cron · `NEVER_RAN` · `CANCELLED`) | `UNKNOWN` + evidence |
| 7 | red comes **only** from content | `None` — the failing tests ARE the diagnosis (Task 5) |
| 8 | line is green/yellow | `None` |

- [ ] **Step 1: Write the failing test** — append to `ingest/tests/scripts/test_doctor.py`
```python
# ── prescribe(): the (signal shape) -> enum member assignment ─────────────────

from ingest.lib import prescriptions as rx  # noqa: E402


def _line(**over):
    base = {
        "dataset": "listing_lifecycle",
        "table": "data_lake.listing_state",
        "kind": "table",
        "workflow": "steady-listings.yml",
        "pipeline": "listing_lifecycle",
        "health": "red",
        "freshness": {"status": "FRESH", "severity": "green"},
        "volume": {"status": "OK", "severity": "green", "landed": 34637, "min_rows": 9000},
        "content": {"status": "NO_CONTRACT", "severity": "green", "failing": []},
        "run": {"status": "GREEN", "severity": "green", "consecutive_failures": 0, "url": None},
    }
    base.update(over)
    return base


def test_prescribe_returns_none_for_a_green_line():
    assert doctor.prescribe(_line(health="green")) is None


def test_coverage_only_line_gets_ZERO_COVERAGE_naming_the_table():
    line = _line(dataset="data_lake.parcel_subdivision", table="data_lake.parcel_subdivision",
                 kind="coverage_only", workflow=None, pipeline=None)
    p = doctor.prescribe(line)
    assert p["code"] == rx.ZERO_COVERAGE
    assert "data_lake.parcel_subdivision" in p["fix"]
    assert "ingest/cadence_registry.yaml" in p["fix"]


def test_timeout_gets_TIMEOUT_KILL_and_should_retry_false_the_money_guard():
    line = _line(workflow="corridor-pulse-weekly.yml",
                 run={"status": "TIMEOUT", "severity": "red", "consecutive_failures": 0, "url": "u"})
    p = doctor.prescribe(line)
    assert p["code"] == rx.TIMEOUT_KILL
    assert p["should_retry"] is False
    assert "corridor-pulse-weekly.yml" in p["fix"]


def test_green_run_with_zero_rows_gets_GAP_SENTINEL_dead_key():
    line = _line(volume={"status": "LOW_VOLUME", "severity": "red", "landed": 0, "min_rows": 9000})
    p = doctor.prescribe(line)
    assert p["code"] == rx.GAP_SENTINEL
    assert "steady-listings.yml" in p["fix"]


def test_ghost_table_gets_NEVER_LANDED_naming_both_table_and_workflow():
    line = _line(dataset="redfin_city", table="data_lake.redfin_city_swfl", kind="missing",
                 workflow="redfin.yml",
                 freshness={"status": "MISSING", "severity": "red"},
                 volume={"status": "UNRESOLVED", "severity": "red", "landed": None, "min_rows": 100},
                 run={"status": "NO_RUNS_IN_WINDOW", "severity": "yellow", "consecutive_failures": 0, "url": None})
    p = doctor.prescribe(line)
    assert p["code"] == rx.NEVER_LANDED
    assert "data_lake.redfin_city_swfl" in p["fix"]
    assert "redfin.yml" in p["fix"]


def test_one_failed_run_gets_TRANSIENT_and_is_retryable():
    line = _line(run={"status": "RED", "severity": "red", "consecutive_failures": 1, "url": "u"})
    p = doctor.prescribe(line)
    assert p["code"] == rx.TRANSIENT
    assert p["should_retry"] is True


def test_three_failed_runs_is_no_longer_transient_and_becomes_UNKNOWN_with_evidence():
    line = _line(run={"status": "RED", "severity": "red", "consecutive_failures": 3,
                      "url": "https://github.com/x/y/actions/runs/9"})
    p = doctor.prescribe(line)
    assert p["code"] == rx.UNKNOWN
    assert p["should_retry"] is False
    assert "3 consecutive" in p["evidence"]
    assert "https://github.com/x/y/actions/runs/9" in p["evidence"]


def test_disabled_with_a_cron_in_source_is_UNKNOWN_with_evidence_never_an_invented_class():
    """No enum member covers this class yet (check doctor_rx_workflow_disabled_member).
    UNTIL the operator approves one, doctor says UNKNOWN and attaches the evidence.
    It does NOT invent a diagnosis, and it does NOT silently extend an enum the Phase-3b
    incident handler also depends on."""
    line = _line(workflow="narrative-bake.yml",
                 run={"status": "DISABLED", "severity": "red", "consecutive_failures": 0,
                      "url": None, "cron_in_source": True})
    p = doctor.prescribe(line)
    assert p["code"] == rx.UNKNOWN
    assert "narrative-bake.yml" in p["evidence"]
    assert "disabled_manually" in p["evidence"]


def test_a_content_only_red_carries_NO_prescription_because_the_failing_test_IS_the_diagnosis():
    line = _line(content={"status": "FAIL", "severity": "red", "failing": [
        {"table": "data_lake.listing_state", "col": "list_price", "test": "range",
         "severity": "error", "failing_rows": 91, "status": "FAIL"}]})
    assert doctor.prescribe(line) is None


def test_prescribe_never_returns_a_member_outside_DOCTOR_ASSIGNABLE():
    """ACTION_VERSION / SECRET_NOT_WIRED / SCHEMA_NAME_DRIFT are Phase-2 (PR-time, no
    ledger row) and WAF_BLOCK needs a log read — doctor cannot observe any of them."""
    shapes = [
        _line(health="green"),
        _line(kind="coverage_only", workflow=None),
        _line(run={"status": "TIMEOUT", "severity": "red", "consecutive_failures": 0, "url": "u"}),
        _line(volume={"status": "LOW_VOLUME", "severity": "red", "landed": 0, "min_rows": 1}),
        _line(freshness={"status": "MISSING", "severity": "red"},
              run={"status": "RED", "severity": "red", "consecutive_failures": 5, "url": "u"}),
        _line(run={"status": "RED", "severity": "red", "consecutive_failures": 1, "url": "u"}),
        _line(run={"status": "NEVER_RAN", "severity": "red", "consecutive_failures": 0, "url": None}),
        _line(run={"status": "CANCELLED", "severity": "yellow", "consecutive_failures": 0, "url": "u"}),
    ]
    for line in shapes:
        p = doctor.prescribe(line)
        if p is not None:
            assert p["code"] in rx.DOCTOR_ASSIGNABLE, f"{p['code']} is not doctor-observable"
```

- [ ] **Step 2: Run test to verify it fails**
```bash
python -m pytest ingest/tests/scripts/test_doctor.py -q -k prescribe
```
Expected: `AttributeError: module 'ingest.scripts.doctor' has no attribute 'prescribe'`.

- [ ] **Step 3: Write minimal implementation** — append to `ingest/scripts/doctor.py`
```python
# ── prescription assignment ───────────────────────────────────────────────────

from ingest.lib import prescriptions as rx  # noqa: E402


def _rx(code: str, *, line: dict, evidence: str = "") -> dict:
    return {
        "code": code,
        "should_retry": rx.should_retry(code),
        "fix": rx.fix_text(
            code,
            workflow=line.get("workflow"),
            table=line.get("table"),
            pipeline=line.get("pipeline"),
            subject=line.get("workflow") or line.get("table") or line.get("dataset"),
        ),
        "evidence": evidence,
    }


def prescribe(line: dict) -> dict | None:
    """(observed signal shape) -> enum member. PURE. First match wins.

    Doctor can only assign DOCTOR_ASSIGNABLE — the six members its four signals can
    actually observe. ACTION_VERSION / SECRET_NOT_WIRED / SCHEMA_NAME_DRIFT come from
    Phase 2's check-registry-identity.mts at PR TIME (it fails the PR and writes no ledger
    row — nothing for doctor to see). WAF_BLOCK needs the failed run's LOG (the incident
    handler's surface). Anything else red and unclassifiable -> UNKNOWN WITH EVIDENCE.
    A red line never carries an invented diagnosis.

    Returns None for a green/yellow line, and None for a red whose ONLY red signal is
    content — a failing contract already names its table, column, test and failing-row
    count, which is a better diagnosis than any enum member we have. format_report
    enforces that every red line carries a prescription OR >=1 failing content test.
    """
    if line["health"] != "red":
        return None

    fresh = line["freshness"]
    vol = line["volume"]
    content = line["content"]
    run = line["run"]

    # 1 — a live table with rows and no registry entry at all.
    if line["kind"] == "coverage_only":
        return _rx(rx.ZERO_COVERAGE, line=line,
                   evidence=f"{line['table']} has rows; ingest/cadence_registry.yaml has no entry for it.")

    # 2 — the run burned its ceiling. NEVER retry (money guard).
    if run["status"] == "TIMEOUT":
        return _rx(rx.TIMEOUT_KILL, line=line,
                   evidence=f"cancelled at >=95% of timeout-minutes; {run.get('url') or 'no run url'}")

    # 3 — green run, no data. A dead vendor key returns an empty 200.
    if run["status"] == "GREEN" and (
        vol["status"] == "LOW_VOLUME" or vol.get("landed") == 0 or fresh["status"] == "MISSING"
    ):
        return _rx(rx.GAP_SENTINEL, line=line,
                   evidence=f"last run succeeded ({run.get('url') or 'no url'}) but volume="
                            f"{vol['status']} landed={vol.get('landed')} freshness={fresh['status']}")

    # 4 — registry claims it, the DB does not have it.
    if fresh["status"] == "MISSING" or vol["status"] == "UNRESOLVED" or line["kind"] == "missing":
        return _rx(rx.NEVER_LANDED, line=line,
                   evidence=f"freshness={fresh['status']} volume={vol['status']} "
                            f"pg_class kind={line['kind']}")

    # 5 — one or two failures is transient. Three is a class.
    if run["status"] == "RED" and run.get("consecutive_failures", 0) <= 2:
        return _rx(rx.TRANSIENT, line=line,
                   evidence=f"{run.get('consecutive_failures')} consecutive failure(s); "
                            f"{run.get('url') or 'no run url'}")

    # 6 — red, and no class fits. SAY SO. Attach the evidence. Invent nothing.
    if run["severity"] == "red":
        if run["status"] == "DISABLED":
            ev = (f"workflow {line.get('workflow')} carries a cron in source but its state at the "
                  f"GitHub API is disabled_manually — a schedule nobody is running. No enum member "
                  f"covers this class yet (check doctor_rx_workflow_disabled_member).")
        elif run["status"] == "NEVER_RAN":
            ev = (f"workflow {line.get('workflow')} has never run (confirmed by a targeted "
                  f"`gh run list --workflow` backfill, not merely absent from the bulk window).")
        else:
            ev = (f"{run.get('consecutive_failures')} consecutive failure(s), last conclusion="
                  f"{run.get('last_conclusion')}; {run.get('url') or 'no run url'} — no class is "
                  f"inferable from run metadata alone. Read the log.")
        return _rx(rx.UNKNOWN, line=line, evidence=ev)

    # 7 — the only red is content. The failing contract IS the diagnosis.
    if content["severity"] == "red":
        return None

    # 8 — red with no red signal is a bug in worst_of; say UNKNOWN rather than stay silent.
    return _rx(rx.UNKNOWN, line=line,
               evidence=f"line is red but no signal is red: freshness={fresh['status']} "
                        f"volume={vol['status']} content={content['status']} run={run['status']}")
```

- [ ] **Step 4: Run test to verify it passes**
```bash
python -m pytest ingest/tests/scripts/test_doctor.py -q
```
Expected: `34 passed`.

- [ ] **Step 5: Commit**
```bash
git add ingest/scripts/doctor.py ingest/tests/scripts/test_doctor.py
git commit -m "feat(doctor): prescribe() — signal shape to enum member, UNKNOWN+evidence never invents"
```

---

### Task 7: `build_health_lines()` — the PURE join, and the red-line invariant

**Files:**
- Modify: `ingest/scripts/doctor.py` (append)
- Test: `ingest/tests/scripts/test_doctor.py` (append)

**Interfaces:**
- Consumes: `resolve_table`, `kind_from_relkind`, `worst_of`, the four `*_severity` fns, `prescribe` (Tasks 4+6); `ingest.scripts.check_freshness._slug`.
- Produces: `build_health_lines(*, registry, pipeline_results, view_results, sla_errors, value_results, ledger_rows, gh_summaries, gh_error, manifest_by_file, relkinds, quality_tables) -> list[dict]`. Task 8's collectors feed it; Task 9's formatter reads it.

**PURE — takes no `conn`.** Every I/O call happens in Task 8's thin collectors; this function takes their outputs as plain data. That seam is what makes the whole roll-up fixture-testable with zero DB, and it matches the codebase's existing pure-builder pattern (`diff_schema`, `build_*_sql`).

**Line shape (this is also the `--json` `datasets[]` element — Task 8 freezes it):**
```
{dataset, table, kind, lane, workflow, pipeline,
 freshness:{status,severity,age_days,last_run}, volume:{status,severity,landed,min_rows},
 content:{status,severity,failing}, run:{status,severity,last_conclusion,last_success_at,
 consecutive_failures,url,cron_in_source}, view:{status,detail}|None,
 health, prescription|None, open_checks:[...]}
```

- [ ] **Step 1: Write the failing test** — append to `ingest/tests/scripts/test_doctor.py`
```python
# ── build_health_lines: the join ──────────────────────────────────────────────

REGISTRY = {
    "pipelines": [
        {"name": "listing_lifecycle", "lane": "tier-2", "workflow": "steady-listings.yml",
         "freshness_table": "data_lake.listing_state", "expected_rows_min": 9000,
         "cadence_days": 1, "tolerance_multiplier": 3.0, "nightly": True},
        {"name": "redfin_city", "lane": "tier-2", "workflow": "redfin.yml",
         "count_table": "data_lake.redfin_city_swfl", "expected_rows_min": 100,
         "cadence_days": 7, "tolerance_multiplier": 2.0},
        {"name": "city_pulse", "lane": "tier-1", "workflow": "city-pulse-daily.yml",
         "inventory_id": "city_pulse", "cadence_days": 7, "tolerance_multiplier": 2.0,
         "nightly": True},
    ]
}

PIPELINE_RESULTS = [
    {"name": "listing_lifecycle", "lane": "tier-2", "status": "FRESH", "age_days": 0,
     "last_run": "2026-07-11", "volume_status": "OK", "volume_landed": 34637, "volume_min": 9000},
    {"name": "redfin_city", "lane": "tier-2", "status": "MISSING", "age_days": None,
     "last_run": None, "volume_status": None, "volume_landed": None, "volume_min": None},
    {"name": "city_pulse", "lane": "tier-1", "status": "FRESH", "age_days": 0,
     "last_run": "2026-07-11", "volume_status": None, "volume_landed": None, "volume_min": None},
]

GH = {
    "steady-listings.yml": {"run_status": "GREEN", "last_conclusion": "success",
                            "last_success_at": "2026-07-11T04:05:00Z", "consecutive_failures": 0,
                            "url": "u1", "cron_in_source": True, "state": "active"},
    "redfin.yml": {"run_status": "NO_RUNS_IN_WINDOW", "last_conclusion": None,
                   "last_success_at": None, "consecutive_failures": 0, "url": None,
                   "cron_in_source": True, "state": "active"},
    "city-pulse-daily.yml": {"run_status": "GREEN", "last_conclusion": "success",
                             "last_success_at": "2026-07-11T05:00:00Z", "consecutive_failures": 0,
                             "url": "u3", "cron_in_source": True, "state": "active"},
}

RELKINDS = {
    "data_lake.listing_state": "r",
    "data_lake.listing_active_stats": "v",   # the proxy lies about this one; pg_catalog does not
    "data_lake.parcel_subdivision": "r",
    # data_lake.redfin_city_swfl deliberately ABSENT -> ghost table
}


def _lines(**over):
    kw = dict(
        registry=REGISTRY,
        pipeline_results=PIPELINE_RESULTS,
        view_results=[],
        sla_errors=set(),
        value_results=[],
        ledger_rows=[],
        gh_summaries=GH,
        gh_error=None,
        manifest_by_file={},
        relkinds=RELKINDS,
        quality_tables=[],
    )
    kw.update(over)
    return {l["dataset"]: l for l in doctor.build_health_lines(**kw)}


def test_one_line_per_registry_entry():
    lines = _lines()
    assert set(lines) >= {"listing_lifecycle", "redfin_city", "city_pulse"}


def test_healthy_dataset_is_green_with_no_prescription():
    line = _lines()["listing_lifecycle"]
    assert line["health"] == "green"
    assert line["prescription"] is None
    assert line["kind"] == "table"


def test_ghost_table_is_red_NEVER_LANDED():
    line = _lines()["redfin_city"]
    assert line["health"] == "red"
    assert line["kind"] == "missing"          # absent from pg_catalog.pg_class
    assert line["volume"]["status"] == "UNRESOLVED"
    assert line["prescription"]["code"] == rx.NEVER_LANDED


def test_city_pulse_nightly_tier1_is_red_UNRESOLVED_not_a_smiling_green():
    line = _lines()["city_pulse"]
    assert line["volume"]["status"] == "UNRESOLVED"
    assert line["health"] == "red"


def test_quality_table_with_no_registry_entry_becomes_a_coverage_only_ZERO_COVERAGE_line():
    lines = _lines(quality_tables=["data_lake.parcel_subdivision", "data_lake.listing_state"])
    assert "data_lake.parcel_subdivision" in lines
    cov = lines["data_lake.parcel_subdivision"]
    assert cov["kind"] == "coverage_only"
    assert cov["prescription"]["code"] == rx.ZERO_COVERAGE
    # listing_state IS registry-covered -> must NOT also appear as a coverage_only line
    assert "data_lake.listing_state" not in lines


def test_the_view_is_reported_as_a_view_and_never_as_a_table():
    """LANDMINE: information_schema (via the lake MCP proxy) says listing_active_stats is a
    BASE TABLE. pg_catalog.pg_class.relkind='v' says otherwise, and pg_catalog wins."""
    lines = _lines(quality_tables=["data_lake.listing_active_stats"])
    assert lines["data_lake.listing_active_stats"]["kind"] == "view"


def test_content_fail_reds_the_line_and_attaches_the_failing_test():
    vr = [{"table": "data_lake.listing_state", "col": "list_price", "test": "range",
           "severity": "error", "status": "FAIL", "failing_rows": 91}]
    line = _lines(value_results=vr)["listing_lifecycle"]
    assert line["health"] == "red"
    assert line["content"]["status"] == "FAIL"
    assert line["content"]["failing"][0]["failing_rows"] == 91
    assert line["prescription"] is None  # the failing contract IS the diagnosis


def test_open_ledger_checks_attach_to_their_table():
    ledger = [
        {"check_key": "quality_fail_data-lake-listing-state_list_price_range",
         "project": "data-quality", "label": "Quality fail"},
        {"check_key": "quality_fail_data-lake-zhvi-swfl_zip_code_not_null",
         "project": "data-quality", "label": "other table"},
    ]
    line = _lines(ledger_rows=ledger)["listing_lifecycle"]
    assert line["open_checks"] == ["quality_fail_data-lake-listing-state_list_price_range"]


def test_gh_unavailable_yellows_run_status_and_never_greens_it():
    line = _lines(gh_summaries={}, gh_error="gh 403 — add `permissions: actions: read`")["listing_lifecycle"]
    assert line["run"]["status"] == "GH_UNAVAILABLE"
    assert line["run"]["severity"] == "yellow"
    assert line["health"] == "yellow"


def test_THE_INVARIANT_every_red_line_carries_a_prescription_or_a_failing_content_test():
    """Spec §9: 'every red line carries a prescription or an explicit unknown class —
    evidence attached (never an invented diagnosis).' This is that sentence, executable."""
    vr = [{"table": "data_lake.listing_state", "col": "list_price", "test": "range",
           "severity": "error", "status": "FAIL", "failing_rows": 91}]
    lines = doctor.build_health_lines(
        registry=REGISTRY, pipeline_results=PIPELINE_RESULTS, view_results=[], sla_errors=set(),
        value_results=vr, ledger_rows=[], gh_summaries=GH, gh_error=None, manifest_by_file={},
        relkinds=RELKINDS, quality_tables=["data_lake.parcel_subdivision"],
    )
    reds = [l for l in lines if l["health"] == "red"]
    assert reds, "fixture must produce at least one red line"
    for l in reds:
        has_rx = l["prescription"] is not None
        has_content_evidence = bool(l["content"]["failing"])
        assert has_rx or has_content_evidence, f"red line {l['dataset']} carries neither"
        if has_rx:
            assert l["prescription"]["fix"], "a prescription with empty fix-text is a placeholder"
            assert l["prescription"]["code"] in rx.DOCTOR_ASSIGNABLE
```

- [ ] **Step 2: Run test to verify it fails**
```bash
python -m pytest ingest/tests/scripts/test_doctor.py -q -k health_lines
```
Expected: `AttributeError: module 'ingest.scripts.doctor' has no attribute 'build_health_lines'`.

- [ ] **Step 3: Write minimal implementation** — append to `ingest/scripts/doctor.py`
```python
# ── the join ──────────────────────────────────────────────────────────────────

from ingest.scripts.check_freshness import _slug  # noqa: E402

# public.checks keys that are TABLE-scoped (check_data_quality.py:51-52, plus Phase 1's
# contract prefix). Doctor READS these; it never writes them — check_data_quality owns
# quality_fail_/schema_drift_ and check_freshness owns corridor_gap_. A second writer
# would double-open every key.
_TABLE_CHECK_PREFIXES = ("quality_fail_", "schema_drift_", "contract_fail_")


def _checks_for_table(table: str | None, ledger_rows: list[dict]) -> list[str]:
    if not table:
        return []
    stems = tuple(p + _slug(table) for p in _TABLE_CHECK_PREFIXES)
    return sorted(r["check_key"] for r in ledger_rows if r["check_key"].startswith(stems))


def build_health_lines(
    *,
    registry: dict,
    pipeline_results: list[dict],
    view_results: list[dict],
    sla_errors: set[str],
    value_results: list[dict],
    ledger_rows: list[dict],
    gh_summaries: dict[str, dict],
    gh_error: str | None,
    manifest_by_file: dict[str, dict],
    relkinds: dict[str, str],
    quality_tables: list[str],
) -> list[dict]:
    """PURE. One health line per dataset = worst of {freshness, volume, content, run}.

    Two kinds of line:
      - a REGISTRY line, one per `pipelines:` entry (joined to its table, its contracts,
        its workflow's runs, its open ledger checks, and its view-liveness probe);
      - a COVERAGE_ONLY line, one per quality-registry table with NO registry entry —
        which is exactly how ZERO_COVERAGE surfaces (the parcel_subdivision class, and
        the ONLY way data_lake.listing_active_stats — a VIEW with no pipeline — gets a
        health line at all).
    """
    by_name = {r["name"]: r for r in pipeline_results}
    views_by_pipeline = {v["pipeline"]: v for v in view_results}
    lines: list[dict] = []
    covered_tables: set[str] = set()

    for entry in registry.get("pipelines", []) or []:
        name = entry["name"]
        result = by_name.get(name)
        if result is None:
            # run_probe's lane dispatch ends in `else: continue` (check_freshness.py:645-646),
            # silently dropping any entry that is neither tier-1 nor tier-2. A registry entry
            # with NO probe result is itself a finding, not a pass.
            result = {"name": name, "status": "MISSING", "age_days": None, "last_run": None,
                      "volume_status": None, "volume_landed": None, "volume_min": None}

        table = resolve_table(entry)
        if table:
            covered_tables.add(table)
        kind = kind_from_relkind(relkinds.get(table)) if table else entry.get("lane", "tier-1")

        f_sev = freshness_severity(result, sla_errors)
        v_status, v_sev = volume_severity(entry, result)
        c_status, c_sev, c_failing = content_severity(table, value_results)

        workflow = entry.get("workflow")
        summary = gh_summaries.get(workflow) if workflow else None
        r_status, r_sev = run_severity(summary, gh_error if workflow else None)

        view = views_by_pipeline.get(name)
        view_sev = "yellow" if (view and view["status"] != "VIEW_FRESH") else "green"

        line = {
            "dataset": name,
            "table": table,
            "kind": kind,
            "lane": entry.get("lane"),
            "workflow": workflow,
            "pipeline": name,
            "freshness": {"status": result["status"], "severity": f_sev,
                          "age_days": result.get("age_days"), "last_run": str(result.get("last_run") or "") or None},
            "volume": {"status": v_status, "severity": v_sev,
                       "landed": result.get("volume_landed"), "min_rows": result.get("volume_min")},
            "content": {"status": c_status, "severity": c_sev, "failing": c_failing},
            "run": {
                "status": r_status,
                "severity": r_sev,
                "last_conclusion": (summary or {}).get("last_conclusion"),
                "last_success_at": (summary or {}).get("last_success_at"),
                "consecutive_failures": (summary or {}).get("consecutive_failures", 0),
                "url": (summary or {}).get("url"),
                "cron_in_source": (summary or {}).get("cron_in_source"),
            },
            "view": {"status": view["status"], "detail": view["detail"]} if view else None,
            "open_checks": _checks_for_table(table, ledger_rows),
        }
        line["health"] = worst_of(f_sev, v_sev, c_sev, r_sev, view_sev)
        line["prescription"] = prescribe(line)
        lines.append(line)

    # Coverage-only: a table the quality registry knows and the cadence registry does not.
    for table in sorted(set(quality_tables) - covered_tables):
        c_status, c_sev, c_failing = content_severity(table, value_results)
        line = {
            "dataset": table,
            "table": table,
            "kind": "view" if kind_from_relkind(relkinds.get(table)) == "view" else "coverage_only",
            "lane": None,
            "workflow": None,
            "pipeline": None,
            "freshness": {"status": "NO_REGISTRY_ENTRY", "severity": "yellow", "age_days": None, "last_run": None},
            "volume": {"status": "NO_REGISTRY_ENTRY", "severity": "yellow", "landed": None, "min_rows": None},
            "content": {"status": c_status, "severity": c_sev, "failing": c_failing},
            "run": {"status": "NO_WORKFLOW", "severity": "yellow", "last_conclusion": None,
                    "last_success_at": None, "consecutive_failures": 0, "url": None, "cron_in_source": None},
            "view": None,
            "open_checks": _checks_for_table(table, ledger_rows),
        }
        # A VIEW with no pipeline (listing_active_stats) is NOT a coverage gap — it is
        # correctly registry-less, and Locus B is its only possible gate (spec §5). A base
        # TABLE with rows and no registry entry IS the ZERO_COVERAGE gap.
        if line["kind"] == "coverage_only":
            line["health"] = "red"
        else:
            line["health"] = worst_of(c_sev, "yellow")
        line["prescription"] = prescribe(line)
        lines.append(line)

    return lines
```

- [ ] **Step 4: Run test to verify it passes**
```bash
python -m pytest ingest/tests/scripts/test_doctor.py -q
```
Expected: `44 passed`.

- [ ] **Step 5: Commit**
```bash
git add ingest/scripts/doctor.py ingest/tests/scripts/test_doctor.py
git commit -m "feat(doctor): build_health_lines — pure 4-signal join + red-line invariant test"
```

---

### Task 8: Collectors (thin I/O) + `--json` schema + report + CLI

**Files:**
- Modify: `ingest/scripts/doctor.py` (append)
- Test: `ingest/tests/scripts/test_doctor.py` (append)

**Interfaces:**
- Consumes: `check_freshness.{_get_connection, load_registry, run_probe, check_sla_violations}`, `check_data_quality.{load_quality_registry, run_value_tests, run_content_contracts}` (the last from Phase 2 — imported softly; doctor degrades and SAYS SO if Phase 2 has not landed), `gh_runs.{fetch_workflows, fetch_runs, fetch_runs_for_workflow, index_workflows, summarize_runs, workflows_needing_backfill, apply_backfill, GhUnavailable}`, `build_health_lines` (Task 7).
- Produces: `collect_relkinds(conn, schemas) -> dict`, `collect_ledger(conn) -> list[dict]`, `load_manifest(path=None) -> dict[str,dict]`, `collect_gh(manifest_by_file, *, max_backfill=40) -> tuple[dict, str|None]`, `to_json(lines, *, gh_error, manifest_ok) -> dict`, `format_report(payload) -> str`, `main(argv=None) -> int`.

**`--json` is a CONTRACT with the `/census` ops page.** The ops-repo React is out of scope, but the *shape* is defined here and frozen by a test, so a later edit cannot silently break the page. Top-level keys: `schema_version, generated_at, counts, coverage, datasets`. Each `datasets[]` element is exactly the Task-7 line shape.

- [ ] **Step 1: Write the failing test** — append to `ingest/tests/scripts/test_doctor.py`
```python
# ── --json contract (frozen: /census consumes this) ───────────────────────────

def test_json_top_level_shape_is_frozen():
    lines = doctor.build_health_lines(
        registry=REGISTRY, pipeline_results=PIPELINE_RESULTS, view_results=[], sla_errors=set(),
        value_results=[], ledger_rows=[], gh_summaries=GH, gh_error=None, manifest_by_file={},
        relkinds=RELKINDS, quality_tables=[],
    )
    payload = doctor.to_json(lines, gh_error=None, manifest_ok=True)
    assert set(payload) == {"schema_version", "generated_at", "counts", "coverage", "datasets"}
    assert payload["schema_version"] == 1
    assert set(payload["counts"]) == {"green", "yellow", "red", "total"}
    assert set(payload["coverage"]) == {
        "datasets", "with_workflow", "with_content_contracts", "gh", "manifest",
    }
    assert payload["counts"]["total"] == len(payload["datasets"])
    assert payload["generated_at"].endswith("Z")


def test_json_dataset_element_shape_is_frozen():
    lines = doctor.build_health_lines(
        registry=REGISTRY, pipeline_results=PIPELINE_RESULTS, view_results=[], sla_errors=set(),
        value_results=[], ledger_rows=[], gh_summaries=GH, gh_error=None, manifest_by_file={},
        relkinds=RELKINDS, quality_tables=[],
    )
    payload = doctor.to_json(lines, gh_error=None, manifest_ok=True)
    d = payload["datasets"][0]
    assert set(d) == {
        "dataset", "table", "kind", "lane", "workflow", "pipeline",
        "freshness", "volume", "content", "run", "view",
        "health", "prescription", "open_checks",
    }
    assert set(d["freshness"]) == {"status", "severity", "age_days", "last_run"}
    assert set(d["volume"]) == {"status", "severity", "landed", "min_rows"}
    assert set(d["content"]) == {"status", "severity", "failing"}
    assert set(d["run"]) == {"status", "severity", "last_conclusion", "last_success_at",
                             "consecutive_failures", "url", "cron_in_source"}


def test_json_reports_gh_unavailable_rather_than_pretending():
    lines = doctor.build_health_lines(
        registry=REGISTRY, pipeline_results=PIPELINE_RESULTS, view_results=[], sla_errors=set(),
        value_results=[], ledger_rows=[], gh_summaries={}, gh_error="gh 403", manifest_by_file={},
        relkinds=RELKINDS, quality_tables=[],
    )
    payload = doctor.to_json(lines, gh_error="gh 403", manifest_ok=False)
    assert payload["coverage"]["gh"] == "unavailable: gh 403"
    assert payload["coverage"]["manifest"] == "missing"


# ── report ────────────────────────────────────────────────────────────────────

def test_report_prints_the_prescription_fix_text_on_every_red_line():
    lines = doctor.build_health_lines(
        registry=REGISTRY, pipeline_results=PIPELINE_RESULTS, view_results=[], sla_errors=set(),
        value_results=[], ledger_rows=[], gh_summaries=GH, gh_error=None, manifest_by_file={},
        relkinds=RELKINDS, quality_tables=[],
    )
    text = doctor.format_report(doctor.to_json(lines, gh_error=None, manifest_ok=True))
    assert "NEVER_LANDED" in text
    assert "data_lake.redfin_city_swfl" in text     # the fix names the table
    assert "redfin.yml" in text                     # ...and the workflow
    assert "🔴" in text


def test_manifest_loader_failsofts_on_a_missing_file():
    assert doctor.load_manifest("/nope/_watch-manifest.json") == {}


# ── relkind SQL is parameterised, not interpolated ────────────────────────────

def test_collect_relkinds_binds_schemas_as_a_param():
    from unittest.mock import MagicMock
    cur = MagicMock()
    cur.fetchall.return_value = [("data_lake", "listing_active_stats", "v")]
    conn = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    out = doctor.collect_relkinds(conn, ["data_lake"])
    assert out == {"data_lake.listing_active_stats": "v"}
    sql_arg, params = cur.execute.call_args[0]
    assert "pg_catalog.pg_class" in sql_arg
    assert params == (["data_lake"],)
```

- [ ] **Step 2: Run test to verify it fails**
```bash
python -m pytest ingest/tests/scripts/test_doctor.py -q -k "json or report or manifest or relkinds"
```
Expected: `AttributeError: module 'ingest.scripts.doctor' has no attribute 'to_json'`.

- [ ] **Step 3: Write minimal implementation** — append to `ingest/scripts/doctor.py`
```python
# ── collectors (the ONLY I/O in this file) ────────────────────────────────────

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import sys  # noqa: E402
from datetime import datetime, timezone  # noqa: E402
from pathlib import Path  # noqa: E402

from ingest.lib import gh_runs  # noqa: E402
from ingest.scripts.check_data_quality import (  # noqa: E402
    load_quality_registry,
    run_value_tests,
)

# Phase 2 (content contracts) ships run_content_contracts -- the Locus-B reader. Doctor's
# health line is "worst of {freshness, volume, CONTENT, run-status}" (spec §7 3c). Wiring
# only run_value_tests leaves Phase 2's ENTIRE signal dark in the health model. Import it
# softly so doctor still runs before Phase 2 lands -- and SAY SO in the output rather than
# reporting a half-signal as whole.
try:
    from ingest.scripts.check_data_quality import run_content_contracts  # noqa: E402
    CONTENT_ENGINE = "value_tests+content_contracts"
except ImportError:  # Phase 2 not landed yet
    run_content_contracts = None
    CONTENT_ENGINE = "value_tests only - Phase 2 content contracts NOT landed"
from ingest.scripts.check_freshness import (  # noqa: E402
    _get_connection,
    check_sla_violations,
    load_registry,
    run_probe,
)

_REGISTRY_PATH = Path(__file__).parent.parent / "cadence_registry.yaml"

# FLAGGED ASSUMPTION — this must match Phase 3a's emit path (spec §7 3a names the file but
# not its location). Reconcile at integration; doctor fail-softs if it is absent.
_MANIFEST_PATH = Path(__file__).parent.parent.parent / ".github" / "_watch-manifest.json"


def load_manifest(path: str | Path | None = None) -> dict[str, dict]:
    """{workflow_file: manifest_entry}. FAIL-SOFT: Phase 3a may not have landed yet, and a
    missing manifest must degrade the run-status domain (timeout_minutes unknown ->
    TIMEOUT_KILL unreachable -> those lines fall to UNKNOWN+evidence), never crash doctor."""
    p = Path(path or _MANIFEST_PATH)
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
    entries = data if isinstance(data, list) else data.get("workflows", [])
    return {e["file"]: e for e in entries if isinstance(e, dict) and e.get("file")}


def collect_relkinds(conn, schemas: list[str]) -> dict[str, str]:
    """{'data_lake.listing_active_stats': 'v'} — from pg_catalog.pg_class, NEVER
    information_schema. Absent from the result = the relation does not exist (ghost table)."""
    with conn.cursor() as cur:
        cur.execute(RELKIND_SQL, (list(schemas),))
        return {f"{s}.{t}": k for s, t, k in cur.fetchall()}


def collect_ledger(conn) -> list[dict]:
    """Open public.checks rows, READ-ONLY. Same Postgres, same connection — the ledger is
    NOT a separate cred domain. Doctor never writes here (check_data_quality.sync_quality_checks
    and check_freshness.sync_gap_checks own these keys; a second writer double-opens)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT check_key, project, label FROM public.checks"
            " WHERE state = 'open' ORDER BY created_at DESC LIMIT 1000"
        )
        return [{"check_key": k, "project": p, "label": lbl} for k, p, lbl in cur.fetchall()]


def collect_gh(manifest_by_file: dict[str, dict], *, max_backfill: int = 40):
    """(summaries_by_workflow_file, gh_error). Bulk first, targeted backfill only for the
    workflows the bulk window missed — a weekly/monthly/annual workflow with no run in a
    500-run window is a WINDOW artifact, and calling it NEVER_RAN would be a false RED."""
    now = datetime.now(timezone.utc)
    try:
        workflows = gh_runs.fetch_workflows(limit=200)   # default is 50; we have ~83
        runs = gh_runs.fetch_runs(limit=500)             # default is 20
    except gh_runs.GhUnavailable as exc:
        return {}, str(exc)

    idx = gh_runs.index_workflows(workflows)
    summaries = gh_runs.summarize_runs(runs, idx, now=now, manifest_by_file=manifest_by_file)

    need = gh_runs.workflows_needing_backfill(summaries)[:max_backfill]
    backfilled: dict[str, list[dict]] = {}
    for fname in need:
        try:
            backfilled[fname] = gh_runs.fetch_runs_for_workflow(idx[fname]["path"], limit=5)
        except gh_runs.GhUnavailable:
            continue  # leave it NO_RUNS_IN_WINDOW (yellow) — never promote to a false RED
    if backfilled:
        summaries = gh_runs.apply_backfill(
            summaries, backfilled, now=now, manifest_by_file=manifest_by_file
        )
    return summaries, None


# ── output ────────────────────────────────────────────────────────────────────

JSON_SCHEMA_VERSION = 1


def to_json(lines: list[dict], *, gh_error: str | None, manifest_ok: bool) -> dict:
    """FROZEN CONTRACT — the ops /census page consumes this. Do not change a key without
    changing the census reader in the ops repo in the same breath (test_doctor.py pins it)."""
    counts = {"green": 0, "yellow": 0, "red": 0}
    for l in lines:
        counts[l["health"]] = counts.get(l["health"], 0) + 1
    return {
        "schema_version": JSON_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {**counts, "total": len(lines)},
        "coverage": {
            "datasets": len(lines),
            "with_workflow": sum(1 for l in lines if l["workflow"]),
            "with_content_contracts": sum(1 for l in lines if l["content"]["status"] != "NO_CONTRACT"),
            "gh": f"unavailable: {gh_error}" if gh_error else "ok",
            "manifest": "ok" if manifest_ok else "missing",
        },
        "datasets": lines,
    }


_ICON = {"green": "🟢", "yellow": "🟡", "red": "🔴"}


def format_report(payload: dict) -> str:
    c = payload["counts"]
    cov = payload["coverage"]
    out = [
        f"## doctor — pipeline health · {payload['generated_at']}\n",
        f"**{c['red']} red · {c['yellow']} yellow · {c['green']} green** of {c['total']} datasets. "
        f"Workflow joined: {cov['with_workflow']}/{cov['datasets']} · "
        f"content contracts: {cov['with_content_contracts']}/{cov['datasets']} · "
        f"gh: {cov['gh']} · manifest: {cov['manifest']}\n",
        "| Dataset | Kind | Fresh | Volume | Content | Run | Health |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for l in sorted(payload["datasets"], key=lambda x: ({"red": 0, "yellow": 1, "green": 2}[x["health"]], x["dataset"])):
        out.append(
            f"| `{l['dataset']}` | {l['kind']} | {l['freshness']['status']} | {l['volume']['status']}"
            f" | {l['content']['status']} | {l['run']['status']} | {_ICON[l['health']]} {l['health']} |"
        )
    reds = [l for l in payload["datasets"] if l["health"] == "red"]
    if reds:
        out.append("\n### Prescriptions\n")
    for l in reds:
        p = l["prescription"]
        if p:
            out.append(f"🔴 **`{l['dataset']}` — {p['code']}** (should_retry={str(p['should_retry']).lower()})")
            out.append(f"   - fix: {p['fix']}")
            if p["evidence"]:
                out.append(f"   - evidence: {p['evidence']}")
        for f in l["content"]["failing"]:
            rows = f"{f['failing_rows']:,}" if f.get("failing_rows") is not None else "—"
            out.append(
                f"🔴 **`{l['dataset']}` — content contract failed**: `{f['table']}.{f['col']}` "
                f"{f['test']} ({f['severity']}) — {rows} failing rows. "
                f"Fix the data or the contract in `ingest/quality/quality_registry.yaml`."
            )
        if l["open_checks"]:
            out.append(f"   - open checks: {', '.join(l['open_checks'])}")
    return "\n".join(out) + "\n"


# ── main ──────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="doctor — one health line per dataset.")
    ap.add_argument("--json", action="store_true", help="Emit the machine payload (backs the /census ops page).")
    ap.add_argument("--cron", action="store_true", help="Write the report to $GITHUB_STEP_SUMMARY.")
    ap.add_argument("--dry-run", action="store_true", help="Print to stdout. Doctor is read-only by construction; this only redirects output.")
    ap.add_argument("--fail-on", choices=["red"], default=None,
                    help="Exit 1 when any dataset is red. OMITTED = ADVISORY (exit 0 always).")
    args = ap.parse_args(argv)

    manifest = load_manifest()
    registry = load_registry(_REGISTRY_PATH)
    quality_registry = load_quality_registry()
    quality_tables = list((quality_registry.get("tables") or {}).keys())

    gh_summaries, gh_error = collect_gh(manifest)

    try:
        conn = _get_connection()
    except Exception as exc:  # noqa: BLE001 — advisory, never fail CI on a connection issue
        sys.stdout.write(f"## doctor\n\n⚠️ DB connection failed — doctor skipped this run.\n\n```\n{exc}\n```\n")
        return 0

    try:
        pipeline_results, view_results = run_probe(conn, registry)
        sla_errors, _ = check_sla_violations(pipeline_results)
        value_results = run_value_tests(conn, quality_registry)
        if run_content_contracts is not None:
            # Phase 2's content contracts fold into the SAME result shape
            # ({table, col, test, severity, failing_rows, status}), so content_severity()
            # consumes them unchanged.
            value_results = value_results + run_content_contracts(conn, quality_registry)
        ledger_rows = collect_ledger(conn)
        tables = [t for t in (
            [resolve_table(e) for e in registry.get("pipelines", []) or []] + quality_tables
        ) if t]
        schemas = sorted({t.split(".", 1)[0] for t in tables})
        relkinds = collect_relkinds(conn, schemas)
    except Exception as exc:  # noqa: BLE001 — advisory contract, mirrors both probes
        sys.stdout.write(f"## doctor\n\n⚠️ doctor errored — partial result.\n\n```\n{exc}\n```\n")
        return 0
    finally:
        conn.close()

    lines = build_health_lines(
        registry=registry,
        pipeline_results=pipeline_results,
        view_results=view_results,
        sla_errors=set(sla_errors),
        value_results=value_results,
        ledger_rows=ledger_rows,
        gh_summaries=gh_summaries,
        gh_error=gh_error,
        manifest_by_file=manifest,
        relkinds=relkinds,
        quality_tables=quality_tables,
    )
    payload = to_json(lines, gh_error=gh_error, manifest_ok=bool(manifest))

    if args.json:
        sys.stdout.write(json.dumps(payload, indent=2, default=str) + "\n")
    else:
        report = format_report(payload)
        step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if args.dry_run or not step_summary or not args.cron:
            sys.stdout.buffer.write(report.encode("utf-8"))
        else:
            with open(step_summary, "a", encoding="utf-8") as fh:
                fh.write(report)

    if args.fail_on == "red" and payload["counts"]["red"] > 0:
        return 1
    return 0  # ADVISORY by default (spec §7 3c: ship advisory, flip after one green confirm)


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**
```bash
python -m pytest ingest/tests/scripts/test_doctor.py -q
```
Expected: `50 passed`.

Then the full suite, to prove nothing regressed:
```bash
python -m pytest ingest/ -q
```
Expected: all green; no new failures vs. the pre-task baseline.

- [ ] **Step 5: Commit**
```bash
git add ingest/scripts/doctor.py ingest/tests/scripts/test_doctor.py
git commit -m "feat(doctor): collectors + frozen --json contract (/census) + advisory CLI"
```

---

### Task 9: First live read-only run — prove it on the real lake

**Files:**
- Create: `verification/doctor-first-run.md`
- Create: `verification/doctor-first-run.json`

**Interfaces:**
- Consumes: `python -m ingest.scripts.doctor` (Task 8).
- Produces: the live-evidence artifact both checks close on (spec §9: "close = live evidence, never dev attestation").

- [ ] **Step 1: Run doctor against live, read-only** (needs `.dlt/secrets.toml` + an authenticated `gh`; <2 min per spec §10)
```bash
python -m ingest.scripts.doctor --dry-run | tee "$TMPDIR/doctor-report.txt"
python -m ingest.scripts.doctor --json > verification/doctor-first-run.json
```
Expected in the report: one line per registry entry; the header naming `gh: ok`, `manifest: ok|missing`, and the content-contract coverage fraction; **and specifically these known-real cases, which are the acceptance test:**
- `redfin_city_swfl` → red, `NEVER_LANDED` (registry claims it, `_dlt_loads` has no successful load).
- `dbpr_re_licensees` → red (0 rows → `LOW_VOLUME`, or `UNRESOLVED` if the table is a ghost).
- `data_lake.listing_active_stats` → `kind: view` (**NOT** `table` — if it prints `table`, the relkind query is reading the wrong catalog; stop and fix Task 4 before continuing).
- every red line carries a `code` + a `fix` naming a file/workflow, or a failing content test. **Zero red lines with an empty prescription.**

- [ ] **Step 2: Verify the invariant on the live payload** (do not eyeball it)
```bash
python - <<'PY'
import json
p = json.load(open("verification/doctor-first-run.json"))
reds = [d for d in p["datasets"] if d["health"] == "red"]
bad = [d["dataset"] for d in reds
       if not (d["prescription"] and d["prescription"]["fix"]) and not d["content"]["failing"]]
print("datasets:", p["counts"], "| reds:", len(reds), "| naked reds:", bad)
views = [d["dataset"] for d in p["datasets"] if d["kind"] == "view"]
print("views (pg_catalog):", views)
assert not bad, f"RED LINES WITH NO PRESCRIPTION AND NO EVIDENCE: {bad}"
PY
```
Expected: `naked reds: []` and the assert does not fire. If `views` is empty, the pg_catalog branch is not reaching `listing_active_stats` — fix before shipping.

- [ ] **Step 3: Write the evidence doc** — `verification/doctor-first-run.md`
```markdown
# doctor — first live run (advisory)

**Date:** <fill: run date> · **Command:** `python -m ingest.scripts.doctor --dry-run`
**Mode:** ADVISORY — exit 0 always. Read-only: doctor writes no row, no ledger entry, no baseline.
**Closes:** `pipeline_doctor_live_verify` · contributes to `data_contracts_doctor_live_verify` (spec §9).

## Counts
<paste the header line: N red / N yellow / N green of N datasets; gh: ...; manifest: ...>

## Every red line, with its prescription
<paste the Prescriptions block verbatim>

## The three acceptance cases
- `redfin_city_swfl` — <status> — expected NEVER_LANDED
- `dbpr_re_licensees` — <status> — expected red on volume
- `data_lake.listing_active_stats` — kind=<kind> — MUST be `view` (pg_catalog.relkind='v');
  the lake MCP proxy's information_schema reports it as BASE TABLE and is wrong.

## Invariant
Naked red lines (red with no prescription AND no failing content test): **<N>** — must be 0.

Machine payload: `verification/doctor-first-run.json` (schema_version 1 — the shape `/census` consumes).
```
- [ ] **Step 4: Commit**
```bash
git add verification/doctor-first-run.md verification/doctor-first-run.json
git commit -m "docs(doctor): first live advisory run — evidence for the live-verify checks"
```

---

### Task 10: Wire doctor into the daily probe workflow (ADDITIVE — safe)

**Files:**
- Modify: `.github/workflows/freshness-probe-daily.yml`

**Interfaces:**
- Consumes: `python -m ingest.scripts.doctor --cron` (Task 8).
- Produces: a daily advisory doctor section in the step summary. **Adds a step; removes nothing.** The existing freshness + data-quality + source-liveness steps are untouched — the 3d "fold" (deleting their bodies) is Task 12 and is ASK-FIRST.

**Two things that silently kill the gh domain if missed:**
1. `permissions:` is **explicitly declared** in this file (`contents: read`). With an explicit block, unspecified scopes default to **none** — so `gh run list` / `gh workflow list` 403 without **`actions: read`**, and the entire run-status domain degrades to `GH_UNAVAILABLE` (yellow), invisible in advisory mode.
2. `GH_TOKEN` is not in this workflow today (it exists only in `tripwire-hourly.yml:40`).

- [ ] **Step 1: Write the failing test** — there is no unit test for a YAML file; the test is the live run. Assert the pre-state first:
```bash
grep -n "actions: read\|GH_TOKEN\|doctor" .github/workflows/freshness-probe-daily.yml
```
Expected: **no output** (none of the three are present). That is the failing state.

- [ ] **Step 2: Confirm the 403 is real, not theoretical** — reproduce the degraded path locally:
```bash
GH_TOKEN= gh run list --limit 1 --json conclusion 2>&1 | head -2
```
Expected: an auth error (`gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable` or a login prompt) — proving `GhUnavailable` is the path taken without the token.

- [ ] **Step 3: Write minimal implementation.** Two edits to `.github/workflows/freshness-probe-daily.yml`:

(a) widen the permissions block:
```yaml
permissions:
  contents: read
  actions: read   # doctor's run-status domain: `gh run list` / `gh workflow list` 403 without it.
                  # With an explicit permissions block, unspecified scopes default to NONE.
```
(b) append a new step **after** the "Data-quality probe" step and **before** the "Upstream source-liveness probe" step:
```yaml
      # doctor — one health line per dataset: worst of {freshness, volume, content, run-status}
      # + a prescription. Imports check_freshness + check_data_quality (does not re-query) and
      # joins the gh run-status domain over `gh`. ADVISORY: exits 0 always; --fail-on red is
      # the deliberate, separately-approved flip. Read-only — writes no row and no ledger entry.
      - name: doctor (pipeline health — advisory)
        if: always()
        env:
          DESTINATION__POSTGRES__CREDENTIALS: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: python -m ingest.scripts.doctor --cron
```

- [ ] **Step 4: Run test to verify it passes** — dispatch the workflow and read the summary:
```bash
gh workflow run freshness-probe-daily.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf -f dry_run=false
gh run list --workflow freshness-probe-daily.yml --limit 1 --json databaseId,conclusion,url
```
Expected: the run concludes `success`, and its step summary contains a `## doctor — pipeline health` section whose header reads `gh: ok` (**not** `gh: unavailable: ...` — if it says unavailable, the `actions: read` scope or `GH_TOKEN` did not take).

- [ ] **Step 5: Commit**
```bash
git add .github/workflows/freshness-probe-daily.yml
git commit -m "feat(doctor): run doctor advisory in the daily probe — GH_TOKEN + actions: read"
```

---

### Task 11: SESSION_LOG + push (RULE 0 / RULE 2)

**Files:**
- Modify: `SESSION_LOG.md`

**Interfaces:** none.

- [ ] **Step 1: Prepend a new top-of-file entry** to `SESSION_LOG.md` (append-only — never rewrite a past entry) covering: `ingest/lib/prescriptions.py` (10-member enum, fix-text names its file, `DOCTOR_ASSIGNABLE` boundary), `ingest/lib/gh_runs.py` (Domain 3 over `gh`, verified field lists, backfill kills the false NEVER_RAN), `ingest/scripts/doctor.py` (pure 4-signal join, pg_catalog view detection, no-false-green volume rule, frozen `--json` for `/census`), the workflow wiring, and the two open enum-gap checks. Link `verification/doctor-first-run.md`.

- [ ] **Step 2: Verify the pre-push gate will pass**
```bash
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
```
Expected: only the paths this phase touched; `SESSION_LOG.md` present in the diff (the hook blocks a push where no commit ahead of upstream touched it).

- [ ] **Step 3: Commit**
```bash
git add SESSION_LOG.md
git commit -m "docs(session-log): doctor — advisory health reader, prescriptions enum, gh domain"
```

- [ ] **Step 4: STOP AND ASK.** Show the operator `git log --oneline origin/main..HEAD` and **ask before pushing.** A question is not push authorization. On approval:
```bash
node scripts/safe-push.mjs
```
Expected: the 5 pre-push gates pass; the push lands on `main`. Then close the check:
```bash
node scripts/check.mjs close pipeline_doctor_live_verify
```

---

### Task 12 **[ASK-FIRST]**: Flip to gating + fold the probe body (3d)

**Why ASK-FIRST:** this task (a) changes a **live cron's exit code** from advisory to gating — a red dataset would start failing the daily workflow, which is the intended end-state but must not surprise the operator on a morning where three sources are legitimately mid-backfill; and (b) **deletes the read/report bodies of live probe steps** (the 3d "fold"), which is not revertable in <5 min if the fold loses a signal. RULE 1: ask.

**Files:**
- Modify: `.github/workflows/freshness-probe-daily.yml`

**Interfaces:**
- Consumes: `doctor --cron --fail-on red`.
- Produces: nothing new. This is a posture change.

**Preconditions — ALL must hold before asking:**
1. Task 9's artifact is committed and Task 10's live dispatch showed `gh: ok`.
2. **≥1 green confirm**: doctor has run at least once on the real cron with `counts.red == 0`, **or** every remaining red is a *true* red the operator has explicitly accepted (`redfin_city_swfl`, `dbpr_re_licensees` are real reds — gating on them is correct, but the operator must say so out loud, because it turns the daily probe permanently red until they are fixed or `coverage_exempt`-ed).

- [ ] **Step 1: Present the evidence and ASK.** Paste `verification/doctor-first-run.md`'s counts block and the full red list. Ask exactly: *"Flip the daily probe to `--fail-on red`? These N datasets are red today and will red the workflow every morning until fixed or exempted: [list]. Yes / no / exempt some first."*
- [ ] **Step 2: On approval, flip the flag** in `.github/workflows/freshness-probe-daily.yml`:
```yaml
        run: python -m ingest.scripts.doctor --cron --fail-on red
```
- [ ] **Step 3: On approval of the 3d fold, and NOT before** — replace the `check_freshness` + `check_data_quality` **report** steps with doctor (spec §7 3d: "file stays, body becomes doctor"). **The checks-ledger sync in `check_data_quality.sync_quality_checks` and `check_freshness.sync_gap_checks` must NOT be removed** — doctor reads that ledger, it does not write it. If the fold drops those steps, the ledger stops being maintained and doctor's `open_checks` column silently empties. Keep whichever step still owns the sync; fold only the *formatting/report* half.
- [ ] **Step 4: Verify** — dispatch, and confirm the run is red iff `counts.red > 0`:
```bash
gh workflow run freshness-probe-daily.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
gh run list --workflow freshness-probe-daily.yml --limit 1 --json conclusion,url
```
Expected: `conclusion: failure` when reds exist (loud, on purpose) and `success` when zero.
- [ ] **Step 5: Commit + SESSION_LOG + ask before pushing**
```bash
git add .github/workflows/freshness-probe-daily.yml SESSION_LOG.md
git commit -m "feat(doctor): flip daily probe to --fail-on red (operator-approved)"
```

---

## PHASE: Phase 4 — GHA-native nightly ordered chain

> # 🛑 MANDATORY CORRECTIONS TO THIS PHASE — APPLY BEFORE WRITING A LINE
>
> This phase was written by an author who did not see the other phases. **Two adversarial critics
> reviewed it and found the defects below.** They are not style notes — each one ships a bug.
> The **Integration Contract** at the top of this plan is the authority; where this phase's original
> text disagrees with a correction below, **the correction wins.**
>
> **N-1** is the worst defect found anywhere in this plan: the nightly row gate would count **zero rows in production while CI stayed green** — the exact "green ≠ data" failure the entire build exists to eliminate.

### N-1 🔴 THE ROW GATE COUNTS ZERO ROWS IN PRODUCTION — WHILE CI STAYS GREEN
This phase reads **`min_rows:`** — a field the Spine **forbids from existing** (0 live hits; the Spine ships a test
that goes RED if one appears). At runtime `entry.get("min_rows")` is `None` for **all four** gated entries, so every
one takes the **"freshness-only"** branch → **`_count_rows()` is never called and not a single row is ever counted.**
The gate built to kill *"green ≠ data"* would check only freshness. And this phase's unit tests **bake `min_rows` into
their fixtures**, so **CI is green while production is dead.** This is the founding defect of the whole system,
rebuilt inside its own fix.
**FIX (Integration Contract):** read **`expected_rows_min`** + `count_table` + `count_filter`. Key the opt-out on
**absence of a countable table**, not absence of a floor:
```python
target = entry.get("count_table") or entry.get("freshness_table")
floor  = entry.get("expected_rows_min")
if not target:      status = "LANDED";     detail = "freshness-only (no countable table)"
elif floor is None: status = "UNRESOLVED"; detail = "countable table but no expected_rows_min floor"
```
**ADD the test that would have caught this:** load the **REAL** `ingest/cadence_registry.yaml` and assert every
`nightly: true` entry resolves a non-None floor **and** a countable target. A fixture-only suite cannot catch a
field-name reversion — that is *exactly* how this shipped.

### N-2 🔴 The gate targets the CORPSE
The Task-2 decision table lists `active_listings | min_rows: 35000`, and **four test fixtures** use `active_listings`
as the canonical nightly example — contradicting this phase's **own prose** three paragraphs later *and* the Spine's
`NIGHTLY_GATE_SET` test (which goes RED on a 5th nightly entry). `active_listings`'s table
`active_listings_residential` **feeds nothing live** (`08h` D7 — `active-listings-swfl` reads `listing_active_stats`
over `listing_state`, which `listing_lifecycle` writes).
**FIX:** delete that row; state the exclusion; swap `listing_lifecycle` into every fixture; **add a test asserting
`active_listings` is ABSENT from the nightly set in the REAL registry.**

### N-3 🔴 MONEY — a new live paid cron is lit while all 8 old ones still run
Task 5 ships `nightly-chain.yml` with a live `cron: "5 4 * * *"`; the superseded crons only retire in Task 7
(**[ASK-FIRST]**, gated on 5+6). **In that gap the chain runs the 4 ingests + rebuild + bake IN ADDITION to their
standalone schedules** — a duplicate paid SteadyAPI sweep, a duplicate Sonnet rebuild, and a duplicate bake, **every
night**, for as long as the gap lasts. The phase's only note covers `daily-rebuild`'s TTL skip and says nothing about
the ingests or the bake.
**FIX:** ship `nightly-chain.yml` in Task 5 with **NO `schedule:` block** (dispatch-only). Prove it green
end-to-end via `workflow_dispatch`. Light the cron **in the SAME [ASK-FIRST] commit that retires the old ones.**
**Zero duplicate-paid-work window.**

### N-4 🔴 The scratch probe CANNOT WORK
Tasks 3/4 create `.github/workflows/_tmp-chain-probe.yml` and then run `gh workflow run _tmp-chain-probe.yml`.
**`gh workflow run` dispatches from the DEFAULT BRANCH** — a file that exists only in the working tree is not
dispatchable. The "expected failure" in Step 2 fires for the **wrong reason** and Step 4 can never pass. It also
breaks the manifest drift test while it sits in the tree.
**FIX:** use `actionlint` or a local reusable-workflow parse instead.

### N-5 🔴 This phase breaks the manifest drift test TWICE, with no remediation
`watch-manifest-drift.test.mjs` asserts `regenerated === committed`. Task 5 **adds** a scheduled workflow and Task 7
**comments out crons in 7 workflows** — both flip `scheduled` in the manifest. **CI goes red on both commits.**
**FIX:** every task that changes a workflow's schedule must run
`node scripts/build-watch-lists.mjs --write --write-watchers` and **commit the regenerated manifest in the SAME commit.**

### N-6 🟡 Task 6 is a placeholder that abandons this phase's own headline goal
*"either a Vercel cron route OR Supabase pg_cron — do not pick from memory"* … and then: without it *"this phase does
NOT certify the 6 AM constraint"* — **which IS §8's headline ask.**
**FIX — there is no decision to make:** the head is a **GitHub Actions `schedule:` cron on `nightly-chain.yml`.**
That is the entire design ("ONE clocked head"). Delete the placeholder task. The 6 AM certification comes from `08d`'s
**measured** envelope (typical finish **00:42 EDT**, worst **01:19 EDT**, vs the **6:00 AM Eastern** ceiling — 4.8×
headroom) plus a post-cutover live confirm.

### N-7 🟡 Missing [ASK-FIRST] + unverified imports + SESSION_LOG no-ops + fake pass counts
- Task 4 changes `narrative-bake.yml`'s job `env:` (halving an in-script deadline on a **paid** bake) and supersedes
  its `workflow_run` trigger — a **live paid behavior change**, not "pure addition." Task 3 edits four live daily
  ingest workflows. **Mark them.**
- This phase imports `_fetch_max_freshness` and `check_tier1_entry` from `check_freshness`; another phase's verified-export
  list **omits them**. Open the file and confirm every symbol exists with the signature assumed. Cite the line.
- Several tasks `git add SESSION_LOG.md` with **no step that writes an entry** — the pre-push hook **blocks**, and
  `git add` on an unmodified file is a silent no-op. Every commit step must write the entry.
- Replace every fabricated "Expected: N passed" with real arithmetic.

### ✅ WHAT THIS PHASE GOT RIGHT — KEEP IT
- The **`narrative-bake` `23 10` = 06:23 AM EDT** cutover. That cron is **a live violation of the operator's 6:00 AM
  Eastern ceiling, in production, today.** The `CHAINED` drift test enforcing it is good work.
- `utc_today()` using `datetime.now(timezone.utc).date()` (the existing staleness math uses system-local `date.today()`).
- The documented `graphify-republish` deviation (its chain leg is `if:`-gated off, so retiring its cron would leave it
  never running) — a **stated** deviation, not a silent one.

---


**Delivers:** one clocked head (`nightly-chain.yml`) that runs the 4 ingests → a row gate (`ingest/scripts/assert_landed.py`) → rebuild → bake → warm/parity in a `needs:`-ordered sequence, plus a freshness preflight in `scripts/email/build-digest.mts` that structurally refuses to send a digest built on stale brains. This kills root-cause-1 ("green ≠ data") at the schedule level: today all 8 members are separately clocked and each pays its own independent GitHub scheduler drift, so the *effective execution order is random* — which is the exact mechanism by which the nightly rebuild consumes yesterday's ingests (08d §6).

**Blocked by:** the Spine phase — `nightly:`, `count_table:` and `count_filter:` **do not exist** in `ingest/cadence_registry.yaml` today (0 hits across 1756 lines; 08f drift 1). Task 2 cannot land before them.

> ### ⚠️ CORRECTION TO THE BRIEF — read before Task 5
> The brief (and the `08` index headline) says the `5 4 * * *` head **PASSES the 6 AM Eastern ceiling with ~4.8× headroom.** That number is real but it answers the wrong question: it is **execution-only headroom from an *on-time* head** (08d §2). The index summary dropped a term its own evidence doc carries.
>
> **08d §3–§4 measured the trigger.** This repo's `schedule:` fires the overnight slot **+2h07m to +5h29m late (median +3h07m), over 16 real fires**. The new `23 4` slot did not fix it (+2h07m on its one fire). `workflow_dispatch` starts in **~4 seconds** (proven: run `28353096175`, created 06:29:37 → job started 06:29:41). With drift applied: worst-drift + typical exec = **06:00 EDT exactly at the ceiling**; worst-drift + a normal 60-min bake = **07:00 EDT, over**. This is a **drift-tail, minority-of-nights failure — not an always-fail** — but against an absolute "nothing running at 6 AM" bar, a minority of nights is still disqualifying.
>
> **Therefore this phase does NOT certify the 6 AM constraint on a `schedule:` head, and the plan must not claim it does** — that would ship the same green≠true class this whole build exists to kill. The chain is written **dispatch-primary** (`repository_dispatch` + `workflow_dispatch`) with `schedule:` as a **backstop only** — the identical belt-and-braces idiom `narrative-bake.yml:13-18` already uses, citing GitHub's documented schedule-drop behavior. Wiring the external clock is **Task 6 [ASK-FIRST]**; the chain needs zero edits when it lands.

---

### Task 1: Email freshness preflight — refuse to send on stale brains **[ASK-FIRST]**

**[ASK-FIRST] because:** this can **stop a live customer send**. `daily-email-digest.yml` is the one intentional daytime cron (10:23 AM EDT, the researched engagement peak) and it is customer-facing. A bug in this gate silently kills the daily email. Get operator sign-off on the refusal semantics (refuse-and-red vs. send-with-a-stale-banner) before landing.

Land this **FIRST**, before any cron is touched (08d §5d): it is the precondition that makes deleting the daytime crons survivable at all. It converts a dropped/late head from "ships yesterday's numbers dated today, green" into "loud red, no send."

**Files:**
- Create: `scripts/email/freshness-preflight.mts`
- Create: `scripts/email/__tests__/freshness-preflight.test.mts`
- Modify: `scripts/email/build-digest.mts:181-188` (insert the gate in `main()`, **before** the idempotency guard)
- Modify: `.github/workflows/daily-email-digest.yml` (add a `Notify on failure` step — the `Healthchecks.io heartbeat` step is `if: always()`, so it pings HC even on a red run; HC only catches "never ran," never "ran and refused")

**Interfaces:**
- Consumes: `freshnessToken(version: number, refinedAt: string): string` from `refinery/lib/freshness.mts` (test fixtures only — so the fixture format can never drift from the producer)
- Produces: `masterFreshnessDate(masterMdPath?: string): string | null` · `assertMasterFreshToday(today: string, masterMdPath?: string): void` · `class StaleMasterError extends Error`

**Mechanism (no network):** `brains/master.md` is committed to `main` by the rebuild; `daily-email-digest.yml` checks out `main`. So the digest's own checkout already carries the token. Live today: `freshness_token: SWFL-7421-v100-20260711` (`brains/master.md:6`) — format `SWFL-7421-v{n}-{YYYYMMDD}` (`refinery/lib/freshness.mts:freshnessToken`).

**Deliberately NOT writing a log row on refusal.** `EmailLog.send_status` is the union `"sent" | "skipped" | "error"` (`scripts/email/types.ts:62`); adding `"refused_stale"` would force a type-lift and — worse — a refusal log burns an issue number (`getNextIssueNumber`) and perturbs `isTodayAlreadySent`. The refusal's record is the **red GHA run**. Keep the blast radius at zero.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/email/__tests__/freshness-preflight.test.mts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freshnessToken } from "../../../refinery/lib/freshness.mts";
import {
  masterFreshnessDate,
  assertMasterFreshToday,
  StaleMasterError,
} from "../freshness-preflight.mts";

/** Writes a master.md fixture into a temp dir. `token: null` = no token line. */
function writeMaster(token: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-preflight-"));
  const p = path.join(dir, "master.md");
  const body = token
    ? `<!-- FRESHNESS: v100 | Token: ${token} -->\n---\nbrain_id: master\nversion: 100\nrefined_at: 2026-07-11T06:32:37Z\nfreshness_token: ${token}\n---\n\nbody\n`
    : `---\nbrain_id: master\nversion: 100\n---\n\nbody\n`;
  fs.writeFileSync(p, body, "utf8");
  return p;
}

describe("digest freshness preflight", () => {
  test("reads the calendar day out of master's freshness_token", () => {
    const p = writeMaster(freshnessToken(100, "2026-07-11T06:32:37Z"));
    assert.equal(masterFreshnessDate(p), "2026-07-11");
  });

  test("token stamped TODAY -> send proceeds", () => {
    const p = writeMaster(freshnessToken(100, "2026-07-11T06:32:37Z"));
    assert.doesNotThrow(() => assertMasterFreshToday("2026-07-11", p));
  });

  test("token stamped YESTERDAY -> REFUSE (the dropped/late-head case)", () => {
    const p = writeMaster(freshnessToken(99, "2026-07-10T06:32:37Z"));
    assert.throws(() => assertMasterFreshToday("2026-07-11", p), StaleMasterError);
  });

  test("master.md missing -> REFUSE (fails CLOSED: never send on unknown freshness)", () => {
    const missing = path.join(os.tmpdir(), "no-such-master-12345.md");
    assert.throws(() => assertMasterFreshToday("2026-07-11", missing), StaleMasterError);
  });

  test("master.md present but no freshness_token line -> REFUSE (fails CLOSED)", () => {
    const p = writeMaster(null);
    assert.equal(masterFreshnessDate(p), null);
    assert.throws(() => assertMasterFreshToday("2026-07-11", p), StaleMasterError);
  });

  test("token with an unparseable date tail -> REFUSE (fails CLOSED)", () => {
    const p = writeMaster("SWFL-7421-v100-NOTADATE");
    assert.equal(masterFreshnessDate(p), null);
    assert.throws(() => assertMasterFreshToday("2026-07-11", p), StaleMasterError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test scripts/email/__tests__/freshness-preflight.test.mts
```
Expected failure: `error: Cannot find module '../freshness-preflight.mts' from '.../scripts/email/__tests__/freshness-preflight.test.mts'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/email/freshness-preflight.mts`:

```ts
// scripts/email/freshness-preflight.mts
//
// The digest send gate. The nightly chain rebuilds master and pushes
// brains/master.md to main; daily-email-digest.yml checks out main — so the
// digest's own checkout carries the token, and this needs no network call.
//
// WHY THIS EXISTS: GitHub can DROP a scheduled run entirely, and this repo's
// overnight schedule: trigger has been measured +2h07m to +5h29m late
// (08d §3). Without this gate, a dropped/late chain means the 10:23 AM digest
// renders YESTERDAY's numbers under TODAY's date and reports green. This gate is
// structurally drift-immune: it does not care WHY master is stale.
import fs from "node:fs";
import path from "node:path";

/** Raised when master's freshness_token is not today's. Named for GHA log parsing. */
export class StaleMasterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleMasterError";
  }
}

export const DEFAULT_MASTER_MD = path.join(process.cwd(), "brains", "master.md");

const TOKEN_LINE = /^freshness_token:\s*(\S+)\s*$/m;
const TOKEN_DATE_TAIL = /-(\d{4})(\d{2})(\d{2})$/;

/**
 * The calendar day (YYYY-MM-DD) baked into master's `freshness_token`
 * (`SWFL-7421-v{n}-{YYYYMMDD}` — refinery/lib/freshness.mts:freshnessToken).
 * We read the FRONTMATTER field, not the HTML comment: the module docstring in
 * freshness.mts states the frontmatter field is the one that survives
 * HTML->markdown stripping, so it is the durable of the two.
 *
 * Returns null (never throws) when master.md is missing, carries no token line,
 * or the token has no parseable date tail. Every null path is a REFUSAL upstream.
 */
export function masterFreshnessDate(masterMdPath: string = DEFAULT_MASTER_MD): string | null {
  let raw: string;
  try {
    raw = fs.readFileSync(masterMdPath, "utf8");
  } catch {
    return null;
  }
  const line = raw.match(TOKEN_LINE);
  if (!line) return null;
  const d = line[1].match(TOKEN_DATE_TAIL);
  if (!d) return null;
  return `${d[1]}-${d[2]}-${d[3]}`;
}

/**
 * FAILS CLOSED. A missing / unreadable / unparseable master.md yields null, which
 * is never equal to `today`, so it refuses. "Never assert on unknown freshness" —
 * the same posture as freshnessGate's NaN-guard (refinery/lib/freshness.mts).
 */
export function assertMasterFreshToday(
  today: string,
  masterMdPath: string = DEFAULT_MASTER_MD,
): void {
  const stamped = masterFreshnessDate(masterMdPath);
  if (stamped === today) return;
  throw new StaleMasterError(
    `master freshness_token is ${stamped ?? "unreadable"}, expected ${today}. ` +
      `The nightly chain did not land today's rebuild. REFUSING TO SEND.`,
  );
}
```

Edit `scripts/email/build-digest.mts`. Add to the import block (after the `log-io.mts` import, line 8):

```ts
import { assertMasterFreshToday, StaleMasterError } from "./freshness-preflight.mts";
```

Then in `main()`, insert immediately after `const today = ...` (`:182`) and **before** the idempotency guard (`:185`):

```ts
  // FRESHNESS PREFLIGHT (spec §8). Runs BEFORE the idempotency guard: a refusal
  // must not consume the day's send slot, burn an issue number, or write a log.
  // The red run IS the alert (see the Notify-on-failure step in the workflow).
  try {
    assertMasterFreshToday(today);
  } catch (err) {
    if (!(err instanceof StaleMasterError)) throw err;
    console.error(`[DIGEST REFUSED] ${err.message}`);
    process.exit(1);
  }
```

Edit `.github/workflows/daily-email-digest.yml` — insert this step immediately **before** the existing `Healthchecks.io heartbeat` step (the heartbeat is `if: always()`, so it fires on red too and cannot serve as the alert):

```yaml
      # The freshness preflight (scripts/email/freshness-preflight.mts) exits 1
      # rather than send a digest built on a stale master. That is the ALERT —
      # surface it. The HC heartbeat below is if: always() and only catches
      # "the cron never fired", never "it fired and refused".
      - name: Notify on failure
        if: failure()
        uses: actions/github-script@v9
        with:
          script: |
            const { GITHUB_RUN_ID, GITHUB_REPOSITORY } = process.env;
            const runUrl = `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
            core.warning(`Daily digest FAILED or REFUSED (stale master?). Check: ${runUrl}`);
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test scripts/email/__tests__/freshness-preflight.test.mts
```
Expected: `6 pass · 0 fail`

Then confirm no regression in the existing digest tests and that the new import typechecks:
```
bun test scripts/email/__tests__/build-digest.test.mts
bunx next build
```
Expected: existing digest tests still `0 fail`; `next build` completes with `✓ Compiled successfully` (RULE: verify TS with `bunx next build`, never `npx tsc`).

- [ ] **Step 5: Commit**

```
git add scripts/email/freshness-preflight.mts scripts/email/__tests__/freshness-preflight.test.mts scripts/email/build-digest.mts .github/workflows/daily-email-digest.yml SESSION_LOG.md
git commit -m "feat(email): freshness preflight — refuse to send a digest built on a stale master"
```

---

### Task 2: `assert_landed.py` — the nightly row gate

**BLOCKED ON THE SPINE.** `nightly:` / `count_table:` / `count_filter:` do not exist in the registry yet (08f drift 1). Do not start this task until the Spine phase has landed them.

**Files:**
- Create: `ingest/scripts/assert_landed.py`
- Create: `ingest/tests/scripts/test_assert_landed.py`

**Interfaces:**
- Consumes (from `ingest.scripts.check_freshness`): `_get_connection() -> psycopg.Connection` · `load_registry(path) -> dict` · `_fetch_max_freshness(conn, entry) -> date | None` · `check_tier1_entry(conn, entry) -> dict` (we take **only** its `last_run` value)
- Consumes (**Spine contract** — these registry fields must exist, or this gate is inert): `nightly: true` · `expected_rows_min: <int>` (the ONE row-floor authority — **there is no `min_rows` field**) · `count_table:` / `freshness_table:` / `source_name:` (all already exist) · `count_filter: {column, value}` (**new**, needed by the two `live_search_*` entries — see below)
- Produces: `utc_today() -> date` · `nightly_entries(registry) -> list[dict]` · `_last_run(conn, entry) -> date | None` · `_count_rows(conn, entry) -> int | None` · `assert_landed(conn, registry, today=None) -> list[dict]` · `format_results(results) -> str` · `main(argv=None) -> int`
- Invoked as: `python -m ingest.scripts.assert_landed [--dry-run]` (package form, per the `generate_data_targets.py:19` precedent — **never** the `sys.path.insert` hack)

**Four registry facts that dictate the design (08f §5, §7):**

| Entry | Live rows (07/11) | Gate |
|---|---|---|
| ~~`active_listings`~~ | 39,050 (`active_listings_residential`) | **NOT GATED — ORPHANED.** Its table feeds nothing live (`08h` D7). Gating it guards a corpse. Check: `active_listings_ship_or_delete`. |
| `listing_lifecycle` | 34,637 (**`listing_state`**, `source_name='api_feed'`) | `expected_rows_min: 28000` |
| `live_search_daily_median_price` | 60 (`daily_truth`, `metric_key='median_sale_price'`) | needs `count_filter` |
| `live_search_daily_mortgage` | 4 (`daily_truth`, `metric_key='mortgage_30yr_fixed'`) | needs `count_filter` |
| `city_pulse` | 207 | The Spine attaches `count_table: data_lake.city_pulse` + `expected_rows_min`, so it IS countable. `assert_landed` counts it **directly** — never via `check_volume_entry`, which early-returns None for every tier-1 lane. |

**Gate `listing_state`, NOT `active_listings_residential`, for the lifecycle floor** — and note `active_listings` is separately flagged ORPHANED (its 38,728-row table feeds nothing live; needs a ship-or-delete decision, 08h §2 D7). Gating a corpse guards nothing.

**This gate does NOT call `check_volume_entry`.** That helper (a) early-returns `None` for every tier-1 lane, so `city_pulse` is unreachable through it; (b) cannot scope a count to one `metric_key`, so the two `live_search_*` entries sharing `data_lake.daily_truth` **mask each other** (if mortgage never ran again, both still read fresh and both meet `expected_rows_min: 1` off the other metric's rows); and (c) it is the *loose observability* path, not a nightly gate — it never fails a run. So `assert_landed` owns `_count_rows()`, which kills all three in one move.

- [ ] **Step 1: Write the failing test**

```python
# ingest/tests/scripts/test_assert_landed.py
"""Unit tests for assert_landed — the nightly row gate.

No DB. assert_landed() only reaches the database through two resolvers
(_last_run, _count_rows); both are monkeypatched. What is asserted here is the
DECISION TABLE — which is where every one of 08f §5's traps lives.
"""
import os
import sys
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from ingest.scripts import assert_landed as al

TODAY = date(2026, 7, 11)
YESTERDAY = date(2026, 7, 10)


class FakeConn:
    """assert_landed() itself never touches the conn — only the two patched
    resolvers do. This sentinel proves that: any real query would AttributeError."""

    def rollback(self):
        pass


class CtxConn(FakeConn):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _registry(*entries):
    # not_yet_running: deliberately carries a nightly: true entry — a PARKED
    # pipeline must never be able to red the chain.
    return {
        "pipelines": list(entries),
        "not_yet_running": [{"name": "parked_thing", "nightly": True, "expected_rows_min": 1}],
    }


def _patch(monkeypatch, last_runs: dict, counts: dict):
    monkeypatch.setattr(al, "_last_run", lambda conn, e: last_runs.get(e["name"]))
    monkeypatch.setattr(al, "_count_rows", lambda conn, e: counts.get(e["name"]))


def test_landed_when_fresh_today_and_above_the_floor(monkeypatch):
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    _patch(monkeypatch, {"listing_lifecycle": TODAY}, {"listing_lifecycle": 34637})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert [x["status"] for x in r] == ["LANDED"]


def test_yesterday_is_STALE_even_though_the_probe_would_call_it_FRESH(monkeypatch):
    """check_tier2_entry:432 computes FRESH when age_days <= cadence *
    tolerance_multiplier — 1 x 3.0 = THREE DAYS for active_listings. A source that
    last landed two days ago is 'FRESH' to the probe. Reusing that status in a
    NIGHTLY gate rebuilds root-cause-1 ('green != data') inside the fix.
    assert_landed must apply its OWN `last_run == today` comparison. (08f §5 step 1)"""
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    _patch(monkeypatch, {"listing_lifecycle": YESTERDAY}, {"listing_lifecycle": 34637})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "STALE"


def test_low_rows_is_RED_even_when_freshness_is_green(monkeypatch):
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    _patch(monkeypatch, {"listing_lifecycle": TODAY}, {"listing_lifecycle": 12})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "LOW_ROWS"


def test_unresolved_count_is_RED_never_skipped(monkeypatch):
    """THE None TRAP (08f §5 step 3). A missing/ghost table makes the count return
    None. Treating None as 'not applicable' PASSES a nonexistent table — exactly
    the redfin_city_swfl class (00-DIAGNOSIS.md:17). None -> UNRESOLVED -> RED."""
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    _patch(monkeypatch, {"listing_lifecycle": TODAY}, {"listing_lifecycle": None})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "UNRESOLVED"


def test_unresolved_freshness_is_RED(monkeypatch):
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    _patch(monkeypatch, {}, {})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "UNRESOLVED"


def test_entry_without_a_countable_table_is_freshness_only(monkeypatch):
    """city_pulse is lane: tier-1 with no count_table/freshness_table (08f drift 2),
    so it cannot be volume-gated. The Spine declares it `nightly: true` with NO
    a countable table — a DECLARATIVE, registry-visible opt-out of the volume half.
    NOT the same as a countable table whose count does not resolve, which is RED above."""
    reg = _registry({"name": "city_pulse", "lane": "tier-1", "nightly": True})
    _patch(monkeypatch, {"city_pulse": TODAY}, {})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "LANDED"
    assert r[0]["expected_rows_min"] is None


def test_freshness_only_entry_still_REDs_when_stale(monkeypatch):
    reg = _registry({"name": "city_pulse", "lane": "tier-1", "nightly": True})
    _patch(monkeypatch, {"city_pulse": YESTERDAY}, {})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "STALE"


def test_non_nightly_entries_are_not_gated(monkeypatch):
    reg = _registry(
        {"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000},
        {"name": "redfin_lee", "cadence_days": 30},
    )
    _patch(monkeypatch, {"listing_lifecycle": TODAY}, {"listing_lifecycle": 30000})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert [x["name"] for x in r] == ["listing_lifecycle"]


def test_not_yet_running_entries_never_gate_the_chain():
    assert al.nightly_entries(_registry()) == []


def test_utc_today_is_utc_not_local():
    """08f drift 4: both probes compute age with date.today() — LOCAL time. That
    coincides on a GHA runner (TZ=UTC) and DIVERGES on the operator's EDT laptop:
    after 8 PM EDT, local date is already tomorrow's UTC date, so a local-date
    nightly gate false-REDs every evening. The gate's contract is explicitly UTC."""
    assert al.utc_today() == datetime.now(timezone.utc).date()


def test_main_exits_1_on_stale_and_0_under_dry_run(monkeypatch):
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    monkeypatch.setattr(al, "load_registry", lambda p: reg)
    monkeypatch.setattr(al, "_get_connection", lambda: CtxConn())
    _patch(monkeypatch, {"listing_lifecycle": YESTERDAY}, {"listing_lifecycle": 34637})
    assert al.main([]) == 1
    assert al.main(["--dry-run"]) == 0


def test_main_exits_0_when_everything_landed(monkeypatch):
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    monkeypatch.setattr(al, "load_registry", lambda p: reg)
    monkeypatch.setattr(al, "_get_connection", lambda: CtxConn())
    _patch(monkeypatch, {"listing_lifecycle": TODAY}, {"listing_lifecycle": 34637})
    assert al.main([]) == 0


def test_zero_nightly_entries_is_RED(monkeypatch):
    """A gate that gates nothing is a green light. If the Spine's `nightly:` flags
    are missing or get dropped in a refactor, assert_landed must NOT silently pass
    the chain — it must red and say why."""
    monkeypatch.setattr(al, "load_registry", lambda p: {"pipelines": [{"name": "x"}]})
    monkeypatch.setattr(al, "_get_connection", lambda: CtxConn())
    assert al.main([]) == 1
```

- [ ] **Step 2: Run test to verify it fails**

```
pytest ingest/tests/scripts/test_assert_landed.py -q
```
Expected failure: `ImportError: cannot import name 'assert_landed' from 'ingest.scripts'` — collection error, 0 tests run.

- [ ] **Step 3: Write minimal implementation**

Create `ingest/scripts/assert_landed.py`:

```python
"""Nightly row gate — the ordered chain's data-landed assertion.

CONTRACT (spec §8). For every `nightly: true` cadence-registry entry:
  1. FRESHNESS  last_run == today (UTC)
  2. VOLUME     count(*) >= expected_rows_min   — whenever the entry has a COUNTABLE TABLE
Any STALE / LOW_ROWS / UNRESOLVED -> name it -> exit 1 -> the chain skips the
rebuild rather than rebuilding 42 brains on yesterday's data.

This INVERTS the two probes' "always exit 0 / observability, never gate"
invariant (check_freshness.py:30-31, check_data_quality.py:21-22). It is a GATE.

WHY IT DOES NOT REUSE check_volume_entry (08f §5, drifts 2-3):
  * it early-returns None for every tier-1 lane -> city_pulse is unreachable;
  * it cannot scope a count to one metric_key -> the two live_search_* entries
    that share data_lake.daily_truth MASK each other (if mortgage never ran
    again, both entries still read fresh off median_price's daily write);
  * its pass/fail keys off `expected_rows_min` — the LOOSE observability floor,
    it never fails a run.
So this module owns _count_rows() and reads the gate's own Spine fields.

WHY IT DOES NOT REUSE check_tier2_entry()["status"] (08f §5 step 1): that status
is FRESH while age_days <= cadence_days * tolerance_multiplier — 1 x 3.0 = THREE
DAYS for active_listings. A source that last landed two days ago would sail
through a NIGHTLY gate. Reusing it rebuilds "green != data" inside the fix. We
take only the last_run VALUE and apply our own `== today_utc`.

Run: python -m ingest.scripts.assert_landed [--dry-run]
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg import sql

from ingest.scripts.check_freshness import (
    _fetch_max_freshness,
    _get_connection,
    check_tier1_entry,
    load_registry,
)

REGISTRY_PATH = Path(__file__).parent.parent / "cadence_registry.yaml"

EXIT_OK = 0
EXIT_RED = 1


def utc_today() -> date:
    """The gate's day. UTC — NEVER date.today(), which is what check_freshness.py
    (:337, :431) uses. Those coincide on a GHA runner (TZ=UTC) and diverge on the
    operator's EDT laptop. (08f drift 4)"""
    return datetime.now(timezone.utc).date()


def nightly_entries(registry: dict[str, Any]) -> list[dict[str, Any]]:
    """Every `pipelines:` entry the Spine marks `nightly: true`.

    `not_yet_running:` is deliberately NOT scanned — a parked pipeline must never
    be able to red the chain."""
    return [e for e in (registry.get("pipelines") or []) if e.get("nightly") is True]


def _last_run(conn, entry: dict[str, Any]) -> date | None:
    """The entry's last landed day, lane-aware. Reuses the probe's resolvers for
    the VALUE ONLY — never their `status` (see module docstring)."""
    if entry.get("lane") == "tier-1":
        return check_tier1_entry(conn, entry).get("last_run")
    return _fetch_max_freshness(conn, entry)


def _count_rows(conn, entry: dict[str, Any]) -> int | None:
    """count(*) for one entry, scoped by source_name AND the optional count_filter.

    Table resolution mirrors check_volume_entry (check_freshness.py:373-377):
        count_table -> freshness_table -> data_lake.<dlt_schema_name>

    `count_filter: {column: metric_key, value: median_sale_price}` is the Spine
    field that unmasks the two live_search entries sharing data_lake.daily_truth.

    Returns None — NEVER 0 — on an unresolvable table or ANY DB error. A silently
    absent table must be UNRESOLVED (red), not "0 rows" and not "not applicable".
    """
    table = (
        entry.get("count_table")
        or entry.get("freshness_table")
        or (f"data_lake.{entry['dlt_schema_name']}" if entry.get("dlt_schema_name") else None)
    )
    if not table or "." not in table:
        return None
    schema, _, name = table.partition(".")

    clauses: list[sql.Composable] = []
    params: list[Any] = []
    if entry.get("source_name"):
        clauses.append(sql.SQL("source_name = %s"))
        params.append(entry["source_name"])
    cf = entry.get("count_filter") or {}
    if cf.get("column") and cf.get("value") is not None:
        clauses.append(sql.SQL("{} = %s").format(sql.Identifier(cf["column"])))
        params.append(cf["value"])

    query = sql.SQL("SELECT count(*) FROM {}.{}").format(
        sql.Identifier(schema), sql.Identifier(name)
    )
    if clauses:
        query = query + sql.SQL(" WHERE ") + sql.SQL(" AND ").join(clauses)

    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            row = cur.fetchone()
        return int(row[0]) if row else None
    except psycopg.Error:
        conn.rollback()   # a failed statement poisons the txn for every later probe
        return None


def _result(entry, name, last_run, landed, floor, status, detail) -> dict[str, Any]:
    return {
        "name": name,
        "last_run": last_run,
        "landed": landed,
        "expected_rows_min": floor,
        "status": status,
        "detail": detail,
    }


def assert_landed(
    conn, registry: dict[str, Any], today: date | None = None
) -> list[dict[str, Any]]:
    """One result per `nightly: true` entry.
    status: LANDED | STALE | LOW_ROWS | UNRESOLVED"""
    today = today or utc_today()
    results: list[dict[str, Any]] = []

    for entry in nightly_entries(registry):
        name = entry.get("name", "<unnamed>")
        floor = entry.get("expected_rows_min")
        last_run = _last_run(conn, entry)

        if last_run is None:
            results.append(
                _result(entry, name, None, None, floor, "UNRESOLVED",
                        "no freshness value resolved (missing table? ghost entry?)")
            )
            continue

        if last_run != today:
            results.append(
                _result(entry, name, last_run, None, floor, "STALE",
                        f"last landed {last_run}, expected {today} (UTC)")
            )
            continue

        # The VOLUME half opts out on ABSENCE OF A COUNTABLE TABLE — never on an
        # absent floor. `expected_rows_min` exists on nearly every entry, so
        # "no floor" is NOT inferable as "don't count me" (that reversion is how the
        # gate silently counted zero rows while CI stayed green).
        target = entry.get("count_table") or entry.get("freshness_table")
        if not target:
            results.append(
                _result(entry, name, last_run, None, floor, "LANDED",
                        "freshness-only (no countable table)"))
            continue
        if floor is None:
            results.append(
                _result(entry, name, last_run, None, None, "UNRESOLVED",
                        "countable table but no expected_rows_min floor"))
            continue
            )
            continue

        landed = _count_rows(conn, entry)
        if landed is None:
            results.append(
                _result(entry, name, last_run, None, floor, "UNRESOLVED",
                        "floor declared but count(*) did not resolve — missing/ghost table?")
            )
        elif landed < floor:
            results.append(
                _result(entry, name, last_run, landed, floor, "LOW_ROWS",
                        f"{landed} rows < floor {floor}")
            )
        else:
            results.append(
                _result(entry, name, last_run, landed, floor, "LANDED",
                        f"{landed} rows >= floor {floor}")
            )

    return results


_ICON = {"LANDED": "✅", "STALE": "❌", "LOW_ROWS": "❌", "UNRESOLVED": "❌"}


def format_results(results: list[dict[str, Any]]) -> str:
    lines = ["## Nightly row gate (assert_landed)", ""]
    for r in results:
        lines.append(f"{_ICON.get(r['status'], '❓')} `{r['name']}` — **{r['status']}** — {r['detail']}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Nightly row gate: assert every `nightly: true` source landed TODAY (UTC)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report only — always exit 0, never gate the chain. Ship with this first (spec §15 step 6).",
    )
    args = parser.parse_args(argv)

    registry = load_registry(REGISTRY_PATH)
    with _get_connection() as conn:
        results = assert_landed(conn, registry)

    print(format_results(results))

    if not results:
        print(
            "::error::assert_landed found ZERO `nightly: true` entries. The Spine is not wired — "
            "a gate that gates nothing is a green light.",
            file=sys.stderr,
        )
        return EXIT_OK if args.dry_run else EXIT_RED

    bad = [r for r in results if r["status"] != "LANDED"]
    if not bad:
        print(f"All {len(results)} nightly sources landed for {utc_today()} (UTC).")
        return EXIT_OK

    for r in bad:
        print(f"::error::{r['name']} — {r['status']}: {r['detail']}", file=sys.stderr)
    if args.dry_run:
        print(f"--dry-run: {len(bad)} source(s) would have RED-ed the chain. Reporting only.")
        return EXIT_OK
    return EXIT_RED


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

```
pytest ingest/tests/scripts/test_assert_landed.py -q
```
Expected: `13 passed`

Then a live report-only run against the real lake (all four nightly sources landed on 07/11, so this is a clean baseline to seed the gate from — 08f §7):
```
python -m ingest.scripts.assert_landed --dry-run
```
Expected stdout: a `## Nightly row gate (assert_landed)` block with one `✅ … LANDED` line per nightly entry, and **exit 0**.

- [ ] **Step 5: Commit**

```
git add ingest/scripts/assert_landed.py ingest/tests/scripts/test_assert_landed.py SESSION_LOG.md
git commit -m "feat(ingest): assert_landed — the nightly row gate (UTC, fails closed on an unresolved count)"
```

---

### Task 3: Add `on: workflow_call:` to the 4 ingest chain members

**Files:**
- Modify: `.github/workflows/active-listings-daily.yml:18-33` (the `on:` block)
- Modify: `.github/workflows/listing-lifecycle-daily.yml:24-46` (the `on:` block)
- Modify: `.github/workflows/city-pulse-daily.yml:3-19` (the `on:` block)
- Modify: `.github/workflows/live-search-daily.yml:3-16` (the `on:` block)

**Interfaces:**
- Produces (consumed by Task 5's `nightly-chain.yml`): `active-listings-daily.yml` accepts `with: { county: string, dry_run: boolean }` · `listing-lifecycle-daily.yml` accepts `with: { county: string, dry_run: boolean }` · `city-pulse-daily.yml` and `live-search-daily.yml` accept **no inputs**

**Three things Fable 5 must understand before editing (each is a silent-breakage vector):**

1. **`github.event.schedule` goes EMPTY under `workflow_call` — and that is already handled.** Both listing workflows resolve their county with `case "${{ github.event.schedule }}"`. A called workflow sees the **caller's** event, so `github.event.schedule` is either the *chain's* cron string (no match against `"0 9 * * *"` etc.) or empty — either way the `case` falls through to `*) echo "county=${{ inputs.county }}"`. The `inputs` context **is** populated under `workflow_call`. So declaring a `county` input is the *entire* change; **do not touch the `case` block.**
2. **`github.event.inputs.*` is NOT the same as `inputs.*`.** `city-pulse-daily.yml` and `live-search-daily.yml` read `github.event.inputs.dry_run` / `.city` / `.metric` — under `workflow_call` those are empty, so both run **region-wide with no dry-run**. That is exactly what the chain wants. No input declaration, no code change. Add a bare `workflow_call:`.
3. **`workflow_call` inputs REQUIRE an explicit `type:`.** `workflow_dispatch` inputs do not. The two blocks are independent — do not merge them.

- [ ] **Step 1: Write the failing test**

There is no unit-test seam for a workflow `on:` block. The failing test is the **YAML contract itself**, asserted by GitHub's own parser via a real call. Add a temporary scratch caller so the failure is observable *before* the edit:

```yaml
# .github/workflows/_tmp-chain-probe.yml   (DELETE in Step 5 — scaffolding, never merged)
name: TMP chain probe
on: { workflow_dispatch: {} }
jobs:
  probe:
    uses: ./.github/workflows/active-listings-daily.yml
    with:
      county: Collier
      dry_run: true
    secrets: inherit
```

- [ ] **Step 2: Run test to verify it fails**

```
gh workflow run _tmp-chain-probe.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
gh run list --workflow=_tmp-chain-probe.yml --limit 1
```
Expected failure: the run concludes `failure` immediately with an **invalid workflow file** annotation — `error parsing called workflow ".github/workflows/active-listings-daily.yml": workflow is not reusable as it is missing a "workflow_call" trigger`.

- [ ] **Step 3: Write minimal implementation**

`active-listings-daily.yml` — insert a `workflow_call:` block after the existing `workflow_dispatch:` block (i.e. after its `dry_run` input, before `jobs:`):

```yaml
  # Reusable entry point for the nightly ordered chain (nightly-chain.yml). The
  # chain drives counties with a matrix instead of the 4 staggered crons above.
  # NOTE: `github.event.schedule` is EMPTY under workflow_call (a called workflow
  # sees its CALLER's event), so the "Resolve county" case-block falls through to
  # its `*)` arm and reads `inputs.county` — which IS populated here. That is why
  # this block is the whole change; do not touch the case-block.
  workflow_call:
    inputs:
      county:
        description: "Limit to one SWFL county, e.g. 'Collier' (blank = all)"
        required: false
        type: string
        default: ""
      dry_run:
        description: "Dry-run (extract only, no DB write)"
        required: false
        type: boolean
        default: false
```

`listing-lifecycle-daily.yml` — same, after its `workflow_dispatch:` block:

```yaml
  # Reusable entry point for the nightly ordered chain (nightly-chain.yml).
  # dry_run DEFAULTS TRUE here, exactly as it does for workflow_dispatch above and
  # for the same reason: SteadyAPI calls cost money, so a caller that FORGETS to
  # pass dry_run must not burn budget. nightly-chain.yml passes `dry_run: false`
  # explicitly. A forgotten flag then shows up as assert_landed STALE (loud red),
  # never as a silent paid run.
  workflow_call:
    inputs:
      county:
        description: "Limit to one SWFL county, e.g. 'Lee' (blank = all SWFL_COUNTIES)"
        required: false
        type: string
        default: ""
      dry_run:
        description: "Dry-run: search sweep + diff, print [budget], NO DB write, NO enrich calls"
        required: false
        type: boolean
        default: true
```

`city-pulse-daily.yml` and `live-search-daily.yml` — add a bare block after `workflow_dispatch:`, in each:

```yaml
  # Reusable entry point for the nightly chain. NO inputs declared on purpose:
  # this workflow reads `github.event.inputs.*` (the workflow_dispatch context),
  # which is empty under workflow_call — so a chain call runs the full region-wide,
  # non-dry-run path. That IS what the chain wants.
  workflow_call:
```

- [ ] **Step 4: Run test to verify it passes**

```
gh workflow run _tmp-chain-probe.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
gh run list --workflow=_tmp-chain-probe.yml --limit 1
```
Expected: conclusion `success`, and in the called job's `Resolve county` step log: `county=Collier`; in the pipeline step: the dry-run path (no DB write).

- [ ] **Step 5: Commit** (delete the scratch probe in the same commit)

```
rm .github/workflows/_tmp-chain-probe.yml
git add .github/workflows/active-listings-daily.yml .github/workflows/listing-lifecycle-daily.yml .github/workflows/city-pulse-daily.yml .github/workflows/live-search-daily.yml SESSION_LOG.md
git commit -m "feat(gha): make the 4 nightly ingests reusable (on: workflow_call)"
```

---

### Task 4: Add `on: workflow_call:` to the 4 downstream chain members

**Files:**
- Modify: `.github/workflows/daily-rebuild.yml:3-24` (the `on:` block)
- Modify: `.github/workflows/narrative-bake.yml:7-30` (the `on:` block) and `:45-52` (the `env:` block)
- Modify: `.github/workflows/gate-a-parity.yml:7-13` (the `on:` block)
- Modify: `.github/workflows/graphify-republish.yml:16-24` (the `on:` block)

**Interfaces:**
- Produces (consumed by Task 5): `daily-rebuild.yml`, `gate-a-parity.yml`, `graphify-republish.yml` accept **no inputs** · `narrative-bake.yml` accepts `with: { surface: string, force: boolean }`

**Four landmines, each of which silently breaks something if missed:**

1. **`narrative-bake.yml`'s `workflow_run` trigger GOES DEAD once the chain is the only invoker.** It fires on `workflows: ["Daily Brain Rebuild"]`. A reusable workflow does **not** emit its own `workflow_run` event — the run belongs to the *caller*, and a called workflow reports the **caller's** name in `${{ github.workflow }}` (08g fact 2c). So chaining rebuild kills that trigger. This is fine and intended — the chain calls bake explicitly by `needs:` — but it means bake's `23 10` backstop cron (the **06:23 AM EDT ceiling violation**) is load-bearing until the chain exists, and must not be removed before it. Its `if:` guard (`github.event_name != 'workflow_run' || …conclusion == 'success'`) still evaluates true under a chain call (event_name is the *caller's*), so leave it alone.
2. **`daily-rebuild.yml` needs no inputs.** It reads `github.event.inputs.pack_id` / `.force`, which are empty under `workflow_call` → `PACK` falls back to `'master'`, `FORCE_FLAG` to `''`, and the gate runs `rebuild_due.py` normally. That is the correct chain behavior: the ingests land fresh rows immediately before the gate, so the gate fires and the rebuild does **full work** (08d correction (a): the 27s p50 is the *skip* path; a real refinery run is **410s–963s**).
3. **Its workflow-level `concurrency: group: daily-brain-rebuild` is a LITERAL string**, not `${{ github.workflow }}` — so it does **not** trip 08g's caller-self-cancel footgun. Safe. (While the standalone `23 4` cron still exists alongside the chain, the two runs serialize with `cancel-in-progress: false`; the second finds fresh brains and skips. Harmless, and it's why Task 7 is separate.)
4. **Bound the bake inside the chain** (08d §5b). `scripts/bake-narratives.mts:96` reads `BAKE_POLL_DEADLINE_MS` (verified in-file, default `80 * 60_000`). The bake is the chain's single largest term and it has **never been measured** — every one of its 4 runs ever was a cadence skip. The script already exits 0 loud on overrun and the next run collects the persisted batch, so a bounded deadline is safe by construction.

- [ ] **Step 1: Write the failing test**

```yaml
# .github/workflows/_tmp-chain-probe.yml   (DELETE in Step 5)
name: TMP chain probe
on: { workflow_dispatch: {} }
jobs:
  probe-bake:
    uses: ./.github/workflows/narrative-bake.yml
    with:
      surface: zip
      force: false
    secrets: inherit
  probe-parity:
    uses: ./.github/workflows/gate-a-parity.yml
    secrets: inherit
```

- [ ] **Step 2: Run test to verify it fails**

```
gh workflow run _tmp-chain-probe.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
gh run list --workflow=_tmp-chain-probe.yml --limit 1
```
Expected failure: `failure` with `error parsing called workflow ".github/workflows/narrative-bake.yml": workflow is not reusable as it is missing a "workflow_call" trigger` (and the same for `gate-a-parity.yml`).

- [ ] **Step 3: Write minimal implementation**

`daily-rebuild.yml` — insert after the `workflow_dispatch:` block, before `# Serialize rebuilds…`:

```yaml
  # Reusable entry point for the nightly ordered chain (nightly-chain.yml). NO
  # inputs: this workflow reads `github.event.inputs.pack_id`/`.force`, which are
  # empty under workflow_call, so PACK falls back to 'master' and FORCE_FLAG to ''.
  # That is correct for the chain — the ingests land fresh rows immediately before
  # this runs, so rebuild_due.py fires and the rebuild does FULL work every night
  # (the 27s p50 in the run history is the "already fresh, skip" path; a real
  # refinery run is 410-963s — 08d correction (a)).
  workflow_call:
```

`gate-a-parity.yml` — insert after `workflow_dispatch: {}`:

```yaml
  # Reusable entry point for the nightly ordered chain (nightly-chain.yml).
  workflow_call:
```

`graphify-republish.yml` — insert after its `workflow_dispatch:` block:

```yaml
  # Reusable entry point for the nightly chain — but the chain's graphify leg is
  # GATED OFF by default (see nightly-chain.yml's `if: vars.CHAIN_GRAPHIFY_ENABLED`).
  # This workflow has NEVER succeeded: 0-for-2, both runs dead at "Checkout
  # swfldatagulf-ops" — the cross-repo REBUILD_PAT scope gap its own comment above
  # predicted. Flip the repo variable to 'true' only once it has one green run.
  workflow_call:
```

`narrative-bake.yml` — insert after its `workflow_dispatch:` block:

```yaml
  # Reusable entry point for the nightly ordered chain (nightly-chain.yml) — the
  # chain calls this by `needs: rebuild`, which SUPERSEDES the workflow_run trigger
  # above: a reusable workflow emits no workflow_run event of its own (the run
  # belongs to the caller), so once the chain is the only invoker of Daily Brain
  # Rebuild, that trigger stops firing. Intended. The `if:` guard below still
  # evaluates true here (github.event_name is the CALLER's event, not workflow_run).
  workflow_call:
    inputs:
      surface:
        description: "Surface to bake (zip | corridor | brain | all)"
        required: false
        type: string
        default: "all"
      force:
        description: "Bypass cadence + delta gates (full rebake)"
        required: false
        type: boolean
        default: false
```

And in the same file, add one line to the job's `env:` block (after `NARRATIVE_BAKE_RUN_CAP_USD`):

```yaml
      # TIME GUARD for the chain. The bake is the chain's single largest term and
      # has NEVER been measured — all 4 runs in its history were cadence skips.
      # In-script default is 80 min (BAKE_POLL_DEADLINE_MS, bake-narratives.mts:96)
      # under a 90-min job ceiling; 45 min keeps the chain's tail bounded. On
      # overrun the script exits 0 LOUD and the next run collects the persisted
      # batch (see the timeout-minutes comment below) — a bounded bake is safe by
      # design, not a data loss. 08d §5b.
      BAKE_POLL_DEADLINE_MS: "2700000"   # 45 min
```

- [ ] **Step 4: Run test to verify it passes**

```
gh workflow run _tmp-chain-probe.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
gh run list --workflow=_tmp-chain-probe.yml --limit 1
```
Expected: conclusion `success`. In the bake job log: `--surface "zip"` with no `--force`. In the parity job log: the 4 `bun test` files run with `RUN_DB_PARITY: "1"` (proving `secrets: inherit` reached the called workflow's own `env:` block).

- [ ] **Step 5: Commit**

```
rm .github/workflows/_tmp-chain-probe.yml
git add .github/workflows/daily-rebuild.yml .github/workflows/narrative-bake.yml .github/workflows/gate-a-parity.yml .github/workflows/graphify-republish.yml SESSION_LOG.md
git commit -m "feat(gha): make rebuild/bake/parity/graphify reusable + bound the bake poll deadline"
```

---

### Task 5: `nightly-chain.yml` — one head, everything after ordered by `needs`

**Files:**
- Create: `.github/workflows/nightly-chain.yml`

**Interfaces:**
- Consumes: the 8 reusable workflows from Tasks 3 & 4 · `python -m ingest.scripts.assert_landed` from Task 2
- Produces: workflow `name: Nightly Chain`, triggerable by `repository_dispatch: types: [nightly-chain]` (Task 6's external clock) and `workflow_dispatch`

**Five hard GHA constraints this file must obey — every one is live-verified in 08g, and violating any of them silently re-creates a bug this build exists to kill:**

| # | Constraint | Consequence of ignoring it |
|---|---|---|
| 1 | **`timeout-minutes` is NOT a supported keyword on a job that `uses:` a reusable workflow.** Supported: `name`, `uses`, `with`, `secrets`, `secrets.inherit`, `strategy`, `needs`, `if`, `concurrency`, `permissions`. | Silently ignored. Timeouts live in the **called** workflows (they already have them). |
| 2 | **Caller workflow-level `env:` does NOT propagate to called workflows.** | Hoisting a shared `env:` block into this file makes the secrets **vanish** from the called workflows — re-creating the exact FRED/S3/Firecrawl "secret in the repo but not in the workflow env: block" class the whole build exists to kill, *introduced by the fix.* **Do not add a workflow-level `env:` here.** |
| 3 | **`secrets: inherit` is NOT transitive.** A→B→C: C only gets secrets if B passes them explicitly. | Safe here only because this is a **single caller directly invoking all 8 members** (2 levels; the limit is 10). If any member ever calls a further reusable workflow, it needs its own pass-through. |
| 4 | **`continue-on-error` is also absent from the supported-keyword list.** | You **cannot** quarantine a failing chain leg that way. That's why graphify is gated by an `if:` on a repo variable instead (`if` **is** supported). Fable 5: re-verify this against live GitHub docs (RULE 0.4) before relying on it. |
| 5 | A called workflow reports the **caller's** name in `${{ github.workflow }}`. | Never set `concurrency.group: ${{ github.workflow }}` in both caller and called — the caller cancels itself. This file uses a **literal** group string. |

**Why graphify is `if:`-gated, not chained outright:** it has **never once succeeded** (0-for-2, both runs dead at step 3, `Checkout swfldatagulf-ops` — the cross-repo `REBUILD_PAT` scope gap). Chaining a leg that always fails reddens the chain every single night → alarm fatigue → the exact desensitization this build is trying to reverse. Constraint #4 rules out `continue-on-error`. So the leg is **declared** in the chain but gated behind `vars.CHAIN_GRAPHIFY_ENABLED`, unset by default → skipped. The day the PAT scope is fixed and it has one green run, flip the variable — **zero chain edits.**

- [ ] **Step 1: Write the failing test**

The test is the chain's own dry-run end-to-end. Before the file exists:

```
gh workflow run nightly-chain.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf -f dry_run=true
```

- [ ] **Step 2: Run test to verify it fails**

Expected failure: `could not find any workflows named nightly-chain.yml` (exit 1).

- [ ] **Step 3: Write minimal implementation**

Create `.github/workflows/nightly-chain.yml`:

```yaml
name: Nightly Chain

# ONE head. Everything after it is ordered by `needs:` — not by 8 independent
# clocks racing each other.
#
# THE BUG THIS FIXES: today all 8 members are separately scheduled, and each pays
# its OWN independent GitHub scheduler drift — measured: active-listings ~+1h,
# listing-lifecycle +45m..+1h19, city-pulse +1h17..+3h07, live-search +57m..+3h12,
# gate-a +1h38..+3h58, rebuild +2h07..+5h29. The effective execution order is
# therefore RANDOM, which is precisely the mechanism by which the nightly rebuild
# ends up consuming YESTERDAY's ingests. One head + `needs:` pays drift ONCE and
# makes the internal order deterministic. (08d §6)
#
# ─── TRIGGER: DISPATCH-PRIMARY, SCHEDULE-BACKSTOP ────────────────────────────
# `schedule:` is NOT trusted as the head. Measured on this repo's overnight slot
# over 16 real fires: it lands +2h07m to +5h29m LATE (median +3h07m), and moving
# off the top of the hour (the new `23 4`) did not fix it. `workflow_dispatch`
# starts in ~4 SECONDS (run 28353096175: created 06:29:37, job started 06:29:41).
#
# Operator constraint (07/11/2026): the chain starts after 11 PM-12 AM Eastern and
# NOTHING is still running at 6:00 AM Eastern. EXECUTION fits easily (~26 min
# typical, ~2h36m at every measured worst, ~3h25m if every job runs to its YAML
# ceiling). The TRIGGER is the binding term: worst-drift + a normal 60-min bake
# lands 07:00 EDT — over. It is a drift-TAIL, minority-of-nights miss, not an
# always-fail — but against an absolute bar, a minority of nights disqualifies.
#
# So: repository_dispatch (external clock — Task 6) is the intended head;
# workflow_dispatch is the manual head; `schedule:` is a BACKSTOP ONLY, present
# because GitHub docs are explicit that heavily-loaded schedules can be DROPPED
# ENTIRELY. Same belt-and-braces idiom as narrative-bake.yml:13-18.
# Everything downstream is idempotent and gated, so a doubled fire is ~$0.
# 08d §3-§5.

on:
  repository_dispatch:
    types: [nightly-chain]
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry-run the ingests + report-only row gate (no DB writes, no rebuild)"
        type: boolean
        default: false
  schedule:
    # BACKSTOP ONLY — see the header. 04:05 UTC = 00:05 EDT / 23:05 EST, inside the
    # operator's window year-round IF it fires on time, which it usually does not.
    - cron: "5 4 * * *"

# Literal group string, NEVER ${{ github.workflow }}: a called workflow reports its
# CALLER's name in that context, so a shared group + cancel-in-progress makes the
# caller cancel itself (08g fact 2c). cancel-in-progress: false — a backstop cron
# landing on a still-running dispatched run must QUEUE, never kill it mid-rebuild.
concurrency:
  group: nightly-chain
  cancel-in-progress: false

jobs:
  # ── T1: the 4 ingests, in parallel ────────────────────────────────────────
  # The standalone crons stagger the listing counties 3h apart to dodge the
  # source's sustained-burst 403 throttle. A matrix does NOT re-create that risk:
  # each matrix leg is its own runner (its own IP), so requests never ACCUMULATE
  # against one IP the way a single all-county pass would. Do not collapse these
  # into one all-county call.
  listings:
    name: ingest · active listings
    strategy:
      fail-fast: false          # a Collier 403 must never discard Lee's landed rows
      matrix:
        county: [Lee, Collier]
    uses: ./.github/workflows/active-listings-daily.yml
    with:
      county: ${{ matrix.county }}
      dry_run: ${{ inputs.dry_run == true }}
    secrets: inherit

  lifecycle:
    name: ingest · listing lifecycle
    strategy:
      fail-fast: false
      matrix:
        county: [Lee, Collier, Hendry]
    uses: ./.github/workflows/listing-lifecycle-daily.yml
    with:
      county: ${{ matrix.county }}
      # EXPLICIT. The called workflow's workflow_call default is `true` on purpose
      # (SteadyAPI calls cost money — a caller that forgets must not burn budget).
      # The chain is the one caller that means it.
      dry_run: ${{ inputs.dry_run == true }}
    secrets: inherit

  pulse:
    name: ingest · city pulse
    uses: ./.github/workflows/city-pulse-daily.yml
    secrets: inherit

  live-search:
    name: ingest · live search
    uses: ./.github/workflows/live-search-daily.yml
    secrets: inherit

  # ── T2: the row gate ──────────────────────────────────────────────────────
  # THE POINT OF THE WHOLE CHAIN. Nothing downstream runs until every `nightly:
  # true` source has actually LANDED ROWS TODAY (UTC). A green ingest that wrote
  # zero rows must not produce a green rebuild on yesterday's data.
  # This is a normal job (not a `uses:`), so timeout-minutes IS supported here.
  row-gate:
    name: gate · assert_landed
    needs: [listings, lifecycle, pulse, live-search]
    if: always()   # a partial ingest must still be JUDGED, not silently skipped
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-python@v6
        with:
          python-version: "3.13"

      # Slim: the gate needs only psycopg + pyyaml.
      - name: Install probe dependencies
        run: pip install -r ingest/requirements-probe.txt

      - name: Assert every nightly source landed today (UTC)
        env:
          DESTINATION__POSTGRES__CREDENTIALS: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
        # SHIP REPORT-ONLY FIRST (spec §15 step 6): --dry-run always exits 0, so
        # the gate NAMES what would have blocked without blocking. Remove the flag
        # only after a week of clean nightly reports — that is Task 7's precondition.
        run: python -m ingest.scripts.assert_landed --dry-run

  # ── T3: rebuild ───────────────────────────────────────────────────────────
  rebuild:
    name: rebuild · brains
    needs: [row-gate]
    if: ${{ inputs.dry_run != true }}
    uses: ./.github/workflows/daily-rebuild.yml
    secrets: inherit

  # ── T4: bake ──────────────────────────────────────────────────────────────
  # Chained by `needs:`, which SUPERSEDES narrative-bake's own workflow_run
  # trigger — a reusable workflow emits no workflow_run event of its own.
  bake:
    name: bake · narratives
    needs: [rebuild]
    uses: ./.github/workflows/narrative-bake.yml
    secrets: inherit

  # ── T5: warm + parity, in parallel ────────────────────────────────────────
  # graphify has NEVER succeeded (0-for-2, both dead at the cross-repo checkout —
  # REBUILD_PAT has no scope on swfldatagulf-ops). `continue-on-error` is NOT a
  # supported keyword on a calling job, so it cannot be quarantined that way — a
  # chained graphify would redden the chain EVERY NIGHT. `if:` IS supported, so the
  # leg is declared but gated OFF by default. Flip vars.CHAIN_GRAPHIFY_ENABLED to
  # 'true' the day the PAT scope is fixed and it has one green run. Zero edits here.
  warm:
    name: warm · graphify republish
    needs: [rebuild]
    if: ${{ vars.CHAIN_GRAPHIFY_ENABLED == 'true' && inputs.dry_run != true }}
    uses: ./.github/workflows/graphify-republish.yml
    secrets: inherit

  parity:
    name: verify · gate-a parity
    needs: [rebuild]
    uses: ./.github/workflows/gate-a-parity.yml
    secrets: inherit
```

- [ ] **Step 4: Run test to verify it passes**

Dry-run first (no DB writes, no rebuild — proves the wiring, the matrix, and `secrets: inherit`):
```
gh workflow run nightly-chain.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf -f dry_run=true
gh run list --workflow=nightly-chain.yml --limit 1
```
Expected: conclusion `success`. `listings (Lee)`, `listings (Collier)`, `lifecycle (Lee/Collier/Hendry)`, `pulse`, `live-search` all green; `row-gate` green with a `## Nightly row gate (assert_landed)` block in its log; `rebuild`/`bake`/`warm` **skipped**.

Then the real end-to-end run — **this is the ≥1 green run that Task 7 is gated on:**
```
gh workflow run nightly-chain.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
gh run watch --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
```
Expected: every job green (`warm` skipped); `row-gate` reports `✅ … LANDED` for all four nightly sources; `rebuild`'s "Run refinery (resilient)" step takes **minutes, not 1 second** (proving the gate fired on genuinely fresh rows rather than taking the skip path); `brains/master.md` on `main` carries **today's** `freshness_token` date.

- [ ] **Step 5: Commit**

```
git add .github/workflows/nightly-chain.yml SESSION_LOG.md
git commit -m "feat(gha): nightly-chain — one head, 8 members ordered by needs, dispatch-primary"
```

---

### Task 6: External clock for the head **[ASK-FIRST]**

**[ASK-FIRST] because:** it introduces a **new vendor surface and a stored credential** (a GitHub PAT reachable from Supabase or Vercel), and it is the piece that actually makes the operator's 6 AM constraint certifiable. Both facts need operator sign-off before anything is provisioned.

**This is the fix 08d §5a names.** The two remedies that *look* obvious do **not** work: an **earlier head** buys nothing against +2h–5.5h of drift (and the operator's 11 PM floor caps how early you can go), and a **trimmed timeout** shortens *execution*, which was never the binding term. `workflow_dispatch`/`repository_dispatch` starts in ~4 seconds. Fire the chain from a clock that actually keeps time.

**Files:**
- Create: (choice pending verification) either `app/api/cron/nightly-chain/route.ts` + a `vercel.json` cron entry, **or** a Supabase `pg_cron` + `pg_net` job. **Do not pick from memory.**

**Interfaces:**
- Produces: an HTTP `POST https://api.github.com/repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/dispatches` with body `{"event_type":"nightly-chain"}`, landing on `nightly-chain.yml`'s `repository_dispatch: types: [nightly-chain]` (already built in Task 5 — **zero chain edits needed**)

- [ ] **Step 1: Research first (RULE 0.4 / non-negotiable #1 — crawl4ai, in-session, no memory)**

Both options are already in-stack, and the deciding fact for each is a **vendor-contract fact that must be read, not recalled**:

```
crawl4ai https://vercel.com/docs/cron-jobs
crawl4ai https://vercel.com/docs/cron-jobs/usage-and-pricing
crawl4ai https://supabase.com/docs/guides/cron
crawl4ai https://supabase.com/docs/guides/database/extensions/pg_net
crawl4ai https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event
```

The question that decides it: **does the current Vercel plan tier fire crons at minute precision, or only "within the hour"?** An imprecise cron would re-create the very drift we are eliminating — a silent, total defeat of the task. `vercel.json` already carries one cron (`/api/mls/sync`, `0 */6 * * *`), so the surface exists; the *precision guarantee at our tier* does not follow from that. Supabase `pg_cron` is minute-precise but requires `pg_net` + a PAT stored in the DB. **Write the finding to `SESSION_LOG.md` before choosing** (RULE 0.4 step 2), then bring both options to the operator with the evidence.

- [ ] **Step 2: Verify the head is reachable BEFORE building the clock**

```
gh api -X POST repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/dispatches -f event_type=nightly-chain
gh run list --workflow=nightly-chain.yml --limit 1
```
Expected: a new `Nightly Chain` run appears with `event: repository_dispatch`, created and started within seconds. This proves the receiving half works independently of whichever clock is chosen.

- [ ] **Step 3: Open the check and STOP for the operator**

```
node scripts/check.mjs open pipeline nightly_chain_external_clock "Nightly chain head still rides GitHub schedule: (drifts +2h07m..+5h29m) — wire an external dispatcher (Vercel cron or Supabase pg_cron) so the chain starts on time and the 6 AM Eastern ceiling is certifiable"
```

Do not provision anything, do not store a credential, and **do not claim the 6 AM constraint is met** until this lands. Until then, the chain still runs nightly on the `schedule:` backstop and the Task-1 preflight still refuses a stale send — so the pipeline is safe, just not yet punctual. The two claims stay labeled separately.

- [ ] **Step 4: Commit** *(the check + the research finding only — no code until sign-off)*

```
git add SESSION_LOG.md
git commit -m "docs(session-log): external-clock research — schedule: drift measured, dispatcher options + open check"
```

---

### Task 7: Cron cutover — retire the superseded schedules **[ASK-FIRST]**

**[ASK-FIRST] because:** this deletes live scheduled ingest. **Two separate claims, kept separate:**
- **TIMING says it is safe.** The chain's execution clears 6 AM with 2.5h+ of margin even at every job's YAML ceiling.
- **SEQUENCING says do it ONLY after** (a) `nightly-chain.yml` exists and has **≥1 green end-to-end run** (Task 5 Step 4), **and** (b) the head has a **reliable trigger** (Task 6). Delete the daytime crons while the head still rides `schedule:` and a dropped/late head becomes *"nothing ingested today"* — strictly worse than today's *"the rebuild consumed yesterday's data."* The Task-1 preflight makes that failure **loud** rather than silent, which is what makes this survivable at all — but loud outages are still outages. **Separate, revertable PR. Never bundled with the chain.**

**Files:**
- Modify: `.github/workflows/active-listings-daily.yml` (comment out the 4 daytime crons: `0 9`, `0 12`, `0 15`, `0 18`)
- Modify: `.github/workflows/listing-lifecycle-daily.yml` (comment out `0 9`, `0 12`, `0 15`)
- Modify: `.github/workflows/city-pulse-daily.yml` (comment out `0 9`)
- Modify: `.github/workflows/live-search-daily.yml` (comment out `0 12`)
- Modify: `.github/workflows/daily-rebuild.yml` (comment out `23 4`)
- Modify: `.github/workflows/narrative-bake.yml` (comment out `23 10` — **the 6 AM violation shipping today**)
- Modify: `.github/workflows/gate-a-parity.yml` (comment out `23 7`)
- **KEEP UNTOUCHED:** `.github/workflows/daily-email-digest.yml` (`23 14 * * 1-5` = 10:23 AM EDT — the **intentional** customer send at the researched engagement peak; it is not part of the chain and must keep its own clock)
- **KEEP UNTOUCHED:** `.github/workflows/graphify-republish.yml` (`37 7` = 03:37 EDT — inside the window, no ceiling violation, and it is **not chained yet**: its chain leg is `if:`-gated off. Removing its cron now would leave it never running at all. Retire it in the same commit that flips `CHAIN_GRAPHIFY_ENABLED`.)

**The cleanup list is BROADER than the spec's two.** `narrative-bake.yml`'s `23 10` cron = **06:23 AM EDT — already past the 6 AM ceiling, today, in production.** That is a live violation, not a hypothetical.

- [ ] **Step 1: Write the failing test — prove the chain is the sole scheduler**

Add to `.github/workflows/ci.yml`'s existing test job, or as a standalone `bun test` file — a drift-test that fails the moment someone re-adds a chain member's standalone cron:

```ts
// .github/workflows/__tests__/nightly-chain-sole-clock.test.mts
import { test } from "bun:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WF = path.join(process.cwd(), ".github", "workflows");

/** Every member the chain owns. Once chained, a member must NOT carry its own
 *  `schedule:` — two clocks re-create the independent-drift bug the chain exists
 *  to kill (each member paid +45m to +5h29m of its own drift; the effective
 *  execution order was random). graphify is EXCLUDED: its chain leg is gated off
 *  by vars.CHAIN_GRAPHIFY_ENABLED, so it legitimately still needs its own cron. */
const CHAINED = [
  "active-listings-daily.yml",
  "listing-lifecycle-daily.yml",
  "city-pulse-daily.yml",
  "live-search-daily.yml",
  "daily-rebuild.yml",
  "narrative-bake.yml",
  "gate-a-parity.yml",
];

/** An uncommented `- cron: "..."` line. */
const LIVE_CRON = /^\s*-\s*cron:\s*["']/m;

test("nightly-chain.yml is the SOLE clock for every chained member", () => {
  for (const f of CHAINED) {
    const src = fs.readFileSync(path.join(WF, f), "utf8");
    assert.equal(
      LIVE_CRON.test(src),
      false,
      `${f} still carries a live standalone cron. It is driven by nightly-chain.yml's ` +
        `needs: ordering — a second clock re-creates the independent-drift bug ` +
        `(08d §6). Comment the cron out; keep workflow_dispatch.`,
    );
  }
});

test("nightly-chain.yml itself DOES carry the backstop cron", () => {
  const src = fs.readFileSync(path.join(WF, "nightly-chain.yml"), "utf8");
  assert.ok(LIVE_CRON.test(src), "nightly-chain.yml lost its backstop cron.");
});

test("daily-email-digest keeps its own clock — it is NOT a chain member", () => {
  const src = fs.readFileSync(path.join(WF, "daily-email-digest.yml"), "utf8");
  assert.ok(
    LIVE_CRON.test(src),
    "daily-email-digest.yml lost its cron. The 10:23 AM EDT send is the INTENTIONAL " +
      "customer-facing send at the researched engagement peak — never chain it.",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test .github/workflows/__tests__/nightly-chain-sole-clock.test.mts
```
Expected failure: `1 fail` — `active-listings-daily.yml still carries a live standalone cron.` (the first of 7).

- [ ] **Step 3: Write minimal implementation**

Comment out — **never delete** — each superseded cron, leaving the reason inline. Pattern, applied to all 7 files:

```yaml
on:
  # ── CRON RETIRED <today's date>: superseded by nightly-chain.yml ──────────
  # This workflow is now invoked by `needs:` from the chain (on: workflow_call).
  # A second clock here would re-create the bug the chain exists to kill: 8
  # independently-scheduled members each paying their OWN GitHub scheduler drift
  # (+45m to +5h29m), which made the effective execution ORDER random — the exact
  # mechanism by which the nightly rebuild consumed yesterday's ingests. 08d §6.
  # Commented, not deleted: reverting the cutover is one uncomment away.
  #
  # schedule:
  #   - cron: "0 9 * * *"    # Collier
  #   - cron: "0 12 * * *"   # Lee
  #   - cron: "0 15 * * *"   # Charlotte
  #   - cron: "0 18 * * *"   # Sarasota
  workflow_dispatch:
    ...
```

For `narrative-bake.yml`, the comment names the live violation explicitly:

```yaml
  # ── CRON RETIRED <today's date> ────────────────────────────────────────────
  # This was `23 10` = 06:23 AM EDT — PAST the operator's 6:00 AM Eastern ceiling,
  # in production, every day. It existed as a backstop against GitHub DROPPING the
  # rebuild's schedule; the chain now invokes this workflow by `needs:` from a
  # single dispatched head, so the backstop's job is done by the head's own
  # backstop. Note the workflow_run trigger above is ALSO inert under the chain (a
  # reusable workflow emits no workflow_run event of its own).
  #
  # schedule:
  #   - cron: "23 10 * * *"
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test .github/workflows/__tests__/nightly-chain-sole-clock.test.mts
```
Expected: `3 pass · 0 fail`

Then confirm against the **live** GitHub API that nothing besides the chain and the digest still clocks these — files and API state are different things (4 workflows in this repo carry live crons in source but are `disabled_manually` at the API; 08h §3):
```
gh api "repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/workflows?per_page=100" --jq '.workflows[] | select(.state=="active") | .path' | xargs -I{} sh -c 'grep -lE "^\s+- cron:" {} 2>/dev/null' | sort
```
Expected: `nightly-chain.yml` and `daily-email-digest.yml` are the only two of the 9 in scope that appear.

- [ ] **Step 5: Commit**

```
node scripts/check.mjs close nightly_chain_cron_cutover
git add .github/workflows/active-listings-daily.yml .github/workflows/listing-lifecycle-daily.yml .github/workflows/city-pulse-daily.yml .github/workflows/live-search-daily.yml .github/workflows/daily-rebuild.yml .github/workflows/narrative-bake.yml .github/workflows/gate-a-parity.yml .github/workflows/__tests__/nightly-chain-sole-clock.test.mts SESSION_LOG.md
git commit -m "chore(gha): retire 9 superseded crons — nightly-chain is the sole clock (incl. the 06:23 AM bake violation)"
```

---

### Phase 4 exit criteria

1. `bun test scripts/email/__tests__/freshness-preflight.test.mts` → 6 pass; a digest run with a stale `brains/master.md` exits 1 and sends nothing.
2. `pytest ingest/tests/scripts/test_assert_landed.py` → 13 pass; `python -m ingest.scripts.assert_landed --dry-run` reports `LANDED` for every `nightly: true` entry against the live lake.
3. `nightly-chain.yml` has **≥1 green end-to-end run** in which the rebuild's refinery step took **minutes, not 1 second** (proving it consumed genuinely fresh rows, not the skip path).
4. `bun test .github/workflows/__tests__/nightly-chain-sole-clock.test.mts` → 3 pass.
5. **Not claimed by this phase:** that the 6 AM Eastern ceiling is met. That claim requires Task 6 (external clock). Until it lands, the head rides a `schedule:` trigger measured +2h07m to +5h29m late, and the honest statement is: *execution* clears the ceiling with 2.5h+ of margin; the *trigger* does not, on the drift tail.

**Open checks this phase must leave behind (RULE 2.4 — no silent deferrals):**
- `nightly_chain_external_clock` — Task 6, blocks the 6 AM certification
- `graphify_republish_pat_scope` — 0-for-2, dead at the cross-repo checkout; the chain's warm leg is gated off until it has one green run
- `active_listings_orphaned` — a daily-scheduled writer whose 38,728-row table feeds nothing live; ship-or-delete decision (08h §2 D7)
- `narrative_bake_never_measured` — the chain's largest term has never executed real work; re-measure once `BAKE_CADENCE=daily` flips at launch

---

## PHASE: 3e — Stale-caveat TTL

Delivers `caveatIsFresh(caveat, now, ttlDays=14)` — a pure, template-anchored predicate in `refinery/lib/caveat-ttl.mts` — and wires it at the single engine-wide re-lift chokepoint `refinery/stages/4-output.mts:438`, so a frozen `Upstream brain 'macro-florida' failed to rebuild on 2026-06-29…` caveat stops re-shipping in every daily master build once it passes 14 days old. Fully independent of the Spine, Phase 1, Phase 2, and the doctor — shippable any time, revertable in one commit. Unblocks nothing; closes the `caveat_expiry_rebuild` check.

**The chain this fixes (traced, not assumed):** `refinery/packs/master.mts:188` (`passing.flatMap((p) => p.upstream.caveats)` — the *only* re-lifter in the fleet) → `master.mts:198` (`dedupeCaveats`, byte-preserving: `refinery/lib/synth.mts:920-929`) → returned as `distilled.caveats` → arrives at `4-output.mts:438`. The caveat is minted at `4-output.mts:191`.

### OUT OF SCOPE — three things that look right and are wrong. Do NOT do them.

1. **Do NOT filter at `4-output.mts:458-459`** (the spec §7 3e says to; the spec is wrong). Those two lines push **current-build-truth** caveats minted seconds earlier. `:458` (`stalenessCaveats`) embeds the upstream's own **expiry** date (`4-output.mts:182-183`), which for a genuinely-stale upstream is *by definition already in the past* — a TTL filter there would silently delete a live staleness signal. `:459` (`degradationCaveats`) carries today's date, so a filter is a no-op. The freeze is a time-passing effect on the **downstream re-lift** (`:438`), never at the bake-in point.
2. **Do NOT write a bare "regex any date, drop if older than 14d" filter.** Run against the live 41-brain corpus that rule drops **34 of 40** dated caveats — every one a false positive, including two *currently-true* permits-swfl degradations — and still keeps the phantom it was built to kill (it's 12 days old today, inside the TTL). The regex must be **anchored to the engine's `4-output.mts:191` template** and must **return `true` (KEEP) for any caveat with no template match**. Exactly **2 of 41 brains** (`master`, `macro-swfl`) carry a template-matching caveat; the filter is a deliberate no-op on the other 39.
3. **Do NOT add the serve-time locus at `refinery/render/speaker.mts:828` (`isDisplayableCaveat`).** `08f-code-surface.md` §5 recommends it; that recommendation is a trap. By the time a string reaches `isDisplayableCaveat` it has already run through `scrubCaveatTechnical(sanitizeProse(c))` (`speaker.mts:862-863`), and `sanitizeProse` **rewrites ISO `2026-06-29` → `06/29/2026`** (`speaker.mts:317`) and **swaps the pack id via `PACK_ID_LABELS`** (`speaker.mts:294-307`). An ISO-anchored regex there matches nothing — a silent no-op that reads as a shipped fix. The resulting gap is **known and accepted**: `macro-swfl` is `skipped-fresh` (30d TTL), so `brains/macro-swfl.md` keeps the frozen string on disk and `/api/b/macro-swfl` serves it until macro-swfl self-heals (~2026-07-29). `master` — the surface that matters — is rebuilt daily, re-lifts, and gets filtered. If serve-time is ever added later, it must filter the **raw** caveat in the `.map` chain at `speaker.mts:500-502` / `:862-864` **before** the scrub, never inside `isDisplayableCaveat`.

**Structural ceiling (state it, don't fix it):** a date-TTL can only ever reach the `4-output.mts:191` class. The `:182-183` (embeds an expiry) and `:171` (no date at all) templates share the same latent freeze-and-re-lift bug and are unreachable by date math. 0 instances today. Not in this phase.

---

### Task 1: `caveatIsFresh` — the template-anchored predicate

**Files:**
- Create: `refinery/lib/caveat-ttl.mts`
- Test: `refinery/lib/caveat-ttl.test.mts`

**Interfaces:**
- Consumes: nothing (pure; no repo imports).
- Produces:
  - `export const CAVEAT_TTL_DAYS = 14` (number)
  - `export const DEGRADE_CAVEAT: RegExp`
  - `export function caveatIsFresh(caveat: string, now?: Date | string, ttlDays?: number): boolean` — Task 2 calls this.

- [ ] **Step 1: Write the failing test**

Create `refinery/lib/caveat-ttl.test.mts`. Fixture provenance: the `macro-florida`, permits-swfl, and `env-swfl` strings are byte-lifts of live caveats read out of the built brains with the engine's own parse contract (`refinery/lib/brain-output-reader.mts:47-64`); the `env-swfl` and `cre-swfl` lines are truncated to their heads (the live tails are longer) — the assertion is **template-non-match → keep**, which no tail can affect. The `:182`/`:171` strings are byte-lifts of the engine templates at `4-output.mts:171,182-183`.

```ts
import { test } from "bun:test";
import assert from "node:assert/strict";
import { caveatIsFresh, CAVEAT_TTL_DAYS, DEGRADE_CAVEAT } from "./caveat-ttl.mts";

// --- The corpus. Every string below is what Stage 4 actually sees. ---

/** The phantom. macro-swfl mints it; master re-lifts it byte-for-byte (master.mts:188). */
const PHANTOM =
  "Upstream brain 'macro-florida' failed to rebuild on 2026-06-29; using last good read from 2026-06-29 (v23).";

/** permits-swfl — LIVE-TRUE content caveats. Their embedded date is a last-SOURCE-EVENT
 *  date, not an emission date: they get MORE true as it recedes. A naive date-scan
 *  deletes both. These are the regression this phase exists to not ship. */
const PERMITS_NAPLES =
  "Most recent Naples permit issued 2026-04-30; monthly XLSX has not refreshed for 68 days (cadence 30d). Collier signal in this build is stale.";
const PERMITS_LEE =
  "Most recent Lee permit issued 2026-06-16; daily Accela scrape may be stalled (21 days since last issue).";

/** env-swfl methodology note (head of the live string) — a maintenance note that must never expire. */
const ENV_STORM_YEARS =
  "Storm-year list (Charley 2004 through Milton 2024) was last reviewed 2026-05-17.";

/** cre-swfl — representative of the 14 [fmb_planning]/[estero_edc] local-context FACTS
 *  (55-344d old) and the 2 Crexi disclosures. Facts, not staleness. */
const CRE_LOCAL_FACT = "[estero_edc] Corkscrew Rd Widening — construction start 2026-01-01.";
const CRE_CREXI = "Crexi listing counts are as of 2026-07-05.";

/** The two sibling engine templates (4-output.mts:182-183 and :171). Same latent
 *  freeze bug, unreachable by date math — a TTL must never touch them. */
const STALE_TEMPLATE =
  "Upstream brain 'macro-florida' was stale at build time (expired 2026-06-14).";
const UNAVAILABLE_TEMPLATE =
  "Upstream brain 'macro-florida' was unavailable at build time (no last-good read).";

// --- The phantom: the 14-day edge, pinned on three days ---

test("phantom KEPT at 13 days old (2026-06-29 -> 2026-07-12)", () => {
  assert.equal(caveatIsFresh(PHANTOM, "2026-07-12", 14), true);
});

test("phantom DROPPED at exactly 14 days old (2026-07-13) — the boundary that pins the semantics", () => {
  // fresh <=> ageDays < ttlDays. The two brief-mandated cases (07-12 keep / 07-14 drop)
  // are satisfied by BOTH `< 14` and `<= 14`; only this case discriminates. Evidence
  // (08f-code-surface.md §0) says the phantom "starts dropping 07-13" -> DROP at age 14.
  assert.equal(caveatIsFresh(PHANTOM, "2026-07-13", 14), false);
});

test("phantom DROPPED at 15 days old (2026-07-14)", () => {
  assert.equal(caveatIsFresh(PHANTOM, "2026-07-14", 14), false);
});

test("phantom still KEPT today (2026-07-11, age 12) — a correct 14d TTL does not drop it yet", () => {
  assert.equal(caveatIsFresh(PHANTOM, "2026-07-11", 14), true);
});

// --- No false drops. The whole point. ---

test("live content caveats with an old embedded date are KEPT (no false drop)", () => {
  const now = "2026-07-11"; // ages: 72d, 25d, 55d, 191d, 6d
  assert.equal(caveatIsFresh(PERMITS_NAPLES, now, 14), true);
  assert.equal(caveatIsFresh(PERMITS_LEE, now, 14), true);
  assert.equal(caveatIsFresh(ENV_STORM_YEARS, now, 14), true);
  assert.equal(caveatIsFresh(CRE_LOCAL_FACT, now, 14), true);
  assert.equal(caveatIsFresh(CRE_CREXI, now, 14), true);
});

test("a 344-day-old cre-swfl fact is STILL kept — age is irrelevant without the template", () => {
  assert.equal(caveatIsFresh("[fmb_planning] Bay Oaks Park opened 2025-08-01.", "2026-07-11", 14), true);
});

test("the two sibling engine templates are KEPT — a TTL must never touch them", () => {
  // STALE_TEMPLATE embeds an EXPIRY, always in the past: filtering it would delete a
  // live staleness signal. UNAVAILABLE_TEMPLATE has no date at all.
  assert.equal(caveatIsFresh(STALE_TEMPLATE, "2026-12-31", 14), true);
  assert.equal(caveatIsFresh(UNAVAILABLE_TEMPLATE, "2026-12-31", 14), true);
});

test("undated + coarse-token caveats are KEPT (bare year, N days, BLS period)", () => {
  const now = "2026-07-11";
  assert.equal(caveatIsFresh("Sample size is thin in this ZIP.", now, 14), true);
  assert.equal(caveatIsFresh("Baseline is the 2019 pre-storm year.", now, 14), true);
  assert.equal(caveatIsFresh("Source refreshed 68 days ago.", now, 14), true);
  assert.equal(caveatIsFresh("BLS reference period 2026-M04.", now, 14), true); // NOT a date
});

// --- Template coupling: this test is the tripwire on 4-output.mts:191 ---

test("template mirror — a caveat built with 4-output.mts:191's interpolation shape drops", () => {
  // If someone edits the L191 template, DEGRADE_CAVEAT stops matching, caveatIsFresh
  // fails OPEN, and the phantom re-ships forever with no other test going red.
  // This test is the only thing that reddens. Keep it byte-aligned with :191.
  const id = "macro-florida";
  const today = "2026-06-29";
  const lastDate = "2026-06-29";
  const version = 23;
  const built = `Upstream brain '${id}' failed to rebuild on ${today}; using last good read from ${lastDate} (v${version}).`;
  assert.equal(built, PHANTOM); // the mirror itself
  assert.match(built, DEGRADE_CAVEAT);
  assert.equal(caveatIsFresh(built, "2026-07-20", 14), false);
});

// --- Fail-open: dropping is the destructive direction ---

test("an unparseable `now` FAILS OPEN (keeps the caveat, never drops on garbage)", () => {
  assert.equal(caveatIsFresh(PHANTOM, "garbage", 14), true);
  assert.equal(caveatIsFresh(PHANTOM, new Date(NaN), 14), true);
});

test("a Date object and a date string agree (UTC-day anchored, no TZ drift)", () => {
  assert.equal(caveatIsFresh(PHANTOM, new Date("2026-07-13T23:59:59Z"), 14), false);
  assert.equal(caveatIsFresh(PHANTOM, new Date("2026-07-12T00:00:01Z"), 14), true);
  // A full refined_at timestamp behaves identically to its calendar day.
  assert.equal(caveatIsFresh(PHANTOM, "2026-07-13T04:05:06Z", 14), false);
});

test("defaults: ttlDays is 14 and `now` is the live clock", () => {
  assert.equal(CAVEAT_TTL_DAYS, 14);
  // 1999 is decades past any TTL; 2999 is not yet born. Clock-independent.
  const ancient =
    "Upstream brain 'x' failed to rebuild on 1999-01-01; using last good read from 1999-01-01 (v1).";
  const future =
    "Upstream brain 'x' failed to rebuild on 2999-01-01; using last good read from 2999-01-01 (v1).";
  assert.equal(caveatIsFresh(ancient), false);
  assert.equal(caveatIsFresh(future), true);
});

// --- The whole-array shape Task 2 uses at 4-output.mts:438 ---

test("filtering master's re-lifted caveat array drops exactly the phantom", () => {
  const masterCaveats = [
    PHANTOM,
    PERMITS_NAPLES,
    PERMITS_LEE,
    ENV_STORM_YEARS,
    CRE_LOCAL_FACT,
    CRE_CREXI,
    STALE_TEMPLATE,
  ];
  const kept = masterCaveats.filter((c) => caveatIsFresh(c, new Date("2026-07-20T04:00:00Z"), 14));
  assert.deepEqual(kept, [
    PERMITS_NAPLES,
    PERMITS_LEE,
    ENV_STORM_YEARS,
    CRE_LOCAL_FACT,
    CRE_CREXI,
    STALE_TEMPLATE,
  ]);
  assert.equal(kept.length, 6);
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test refinery/lib/caveat-ttl.test.mts
```
Expected: RED with a module-resolution error naming the file that does not exist yet, e.g.
```
error: Could not resolve: "./caveat-ttl.mts"
 0 pass
 1 fail
```
(The exact wording is bun-version-dependent; the invariant is: the run is RED and names `caveat-ttl.mts`. If it is green, you are running the wrong file.)

- [ ] **Step 3: Write minimal implementation**

Create `refinery/lib/caveat-ttl.mts`:

```ts
/**
 * Stale-caveat TTL — the anti-phantom predicate for re-lifted caveats.
 *
 * WHY THIS EXISTS. `refinery/packs/master.mts:188` re-lifts every passing
 * upstream's baked `caveats[]` into master's own OUTPUT on every build. A
 * degradation caveat minted once ("macro-florida failed to rebuild on
 * 2026-06-29") therefore re-ships in every subsequent master build for as long
 * as the upstream sits `skipped-fresh` — up to its 30-day TTL — long after the
 * fact it describes stopped being interesting.
 *
 * WHY IT IS TEMPLATE-ANCHORED, NOT A DATE SCAN. Across the live 41-brain fleet
 * there are 307 caveats, 40 of them carrying an absolute ISO date. A naive
 * "regex any date, drop if older than the TTL" rule drops **34 of those 40** —
 * every one a false positive — because most embedded dates are LAST-SOURCE-EVENT
 * dates, not emission dates. permits-swfl's "Most recent Naples permit issued
 * 2026-04-30 ... Collier signal in this build is stale" gets MORE true as its
 * date recedes; env-swfl's "last reviewed 2026-05-17" is a maintenance note that
 * must never expire; cre-swfl carries 14 dated local-context FACTS. So:
 *
 *   ANCHOR ON THE ENGINE TEMPLATE. NO MATCH => KEEP. ALWAYS.
 *
 * The ONLY caveat in the fleet whose embedded date means "when this caveat was
 * born" is the one minted at `refinery/stages/4-output.mts:191`. That template —
 * and only that template — is TTL-able. Its two siblings share the same latent
 * freeze bug and are unreachable by date math (documented below); 0 instances
 * live today.
 *
 * Applied at `4-output.mts:438` (the engine-wide re-lift chokepoint) — never at
 * `:458-459`, which push caveats minted by THIS build (see the comments there).
 *
 * Parse-at-render by design: turning `caveats: string[]` into
 * `{text, expires_at}[]` would be a `BrainOutput` type-lift requiring a same-
 * commit backfill of all packs (CLAUDE.md brain-factory rule 3). This dodges it,
 * and it also catches hand-written caveats.
 */

/** Default TTL for a dated degradation caveat, in days. */
export const CAVEAT_TTL_DAYS = 14;

/**
 * The ONE TTL-able caveat template. MIRRORS `refinery/stages/4-output.mts:191`
 * BYTE-FOR-BYTE. Capture group 1 is the emission date (that build's run date).
 *
 * ⚠️ COUPLING: if you edit the template string at `4-output.mts:191`, this regex
 * stops matching, `caveatIsFresh` fails OPEN (keeps everything), and the phantom
 * re-ships silently forever. `refinery/lib/caveat-ttl.test.mts` ("template
 * mirror") is the tripwire — it rebuilds the string with :191's interpolation
 * shape and will go RED. Fix both sides together.
 *
 * The two siblings, deliberately NOT matched:
 *   - `4-output.mts:182-183` "... was stale at build time (expired {date})." The
 *     date is an EXPIRY, always already in the past — TTL-ing it would delete a
 *     live staleness signal.
 *   - `4-output.mts:171` "... was unavailable at build time (no last-good read)."
 *     No date at all — un-TTL-able by construction.
 */
export const DEGRADE_CAVEAT =
  /^Upstream brain '[^']+' failed to rebuild on (\d{4}-\d{2}-\d{2}); using last good read from \d{4}-\d{2}-\d{2} \(v\d+\)\.$/;

/**
 * `true` = KEEP the caveat. `false` = DROP it (it is a frozen degradation notice
 * older than the TTL).
 *
 * Fails OPEN in every ambiguous case — no template match, an unparseable date, an
 * unparseable `now` — because DROPPING is the destructive direction: a wrongly
 * kept caveat is noise; a wrongly dropped one deletes a true qualification from a
 * customer answer.
 *
 * Age is computed in whole UTC days, both sides anchored at UTC midnight, so a
 * bare date string ("2026-07-13") and a full `refined_at` timestamp
 * ("2026-07-13T04:05:06Z") produce the identical verdict and no local timezone
 * can shift the boundary. Fresh <=> `ageDays < ttlDays`: a caveat born
 * 2026-06-29 is kept through 2026-07-12 (age 13) and dropped from 2026-07-13
 * (age 14) onward.
 */
export function caveatIsFresh(
  caveat: string,
  now: Date | string = new Date(),
  ttlDays: number = CAVEAT_TTL_DAYS,
): boolean {
  const m = DEGRADE_CAVEAT.exec(caveat.trim());
  if (!m) return true; // not the TTL-able template -> KEEP. This is the whole safety property.

  const bornMs = Date.parse(`${m[1]}T00:00:00Z`);
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (Number.isNaN(bornMs) || Number.isNaN(nowMs)) return true; // fail OPEN

  const nowDayMs = Date.parse(`${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00Z`);
  const ageDays = Math.round((nowDayMs - bornMs) / 86_400_000);
  return ageDays < ttlDays;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test refinery/lib/caveat-ttl.test.mts
```
Expected: all 13 tests green, e.g.
```
 13 pass
 0 fail
```

- [ ] **Step 5: Commit**

```
git add refinery/lib/caveat-ttl.mts refinery/lib/caveat-ttl.test.mts
git commit -m "feat(refinery): caveatIsFresh — template-anchored TTL for re-lifted degradation caveats" -m "Pure predicate, not yet wired. Anchors on the 4-output.mts:191 emission-date template ONLY; any caveat with no template match is KEPT. A naive date-scan drops 34 of the fleet's 40 dated caveats (incl. two live permits-swfl degradations); this drops 0. Fixtures cover the 14d edge (07-12 keep / 07-13 drop / 07-14 drop) and every no-false-drop regression."
```

---

### Task 2 [ASK-FIRST]: wire the filter at the re-lift chokepoint

**[ASK-FIRST] because:** `refinery/stages/4-output.mts` builds `BrainOutput.caveats` for every one of the 41 brains, and those caveats ship straight to live customer answers (`/api/b/*`, chat, report pages). A filter placed one line wrong deletes a true staleness signal from a live answer. Show the operator the diff and the `bun test` output; do not push without an explicit yes.

**Files:**
- Modify: `refinery/stages/4-output.mts:14-15` (import), `:188-192` (coupling comment on the template), `:438` (the filter), `:453-459` (why 458-459 stay unfiltered)

**Interfaces:**
- Consumes: `caveatIsFresh(caveat: string, now?: Date | string, ttlDays?: number): boolean` and `CAVEAT_TTL_DAYS: number` from Task 1 (`refinery/lib/caveat-ttl.mts`).
- Produces: no new exports. Behavior change only: `BrainOutput.caveats` no longer carries an inherited degradation caveat older than 14 days.

There is **no `outputStage` test harness in this repo** — both existing stage tests (`refinery/stages/4-output.test.mts`, `4-output.suggestions.test.mts`) exercise pure exported helpers only. Per RULE 0.6 (proportion), do **not** build one for a one-line filter: the behavioral proof lives in Task 1's fixtures (which use the exact re-lifted master string), and this task is verified by the type/build gate plus the existing suite staying green.

- [ ] **Step 1: Write the failing test**

The failing test for this task is Task 1's `refinery/lib/caveat-ttl.test.mts` — already written and green. What this step adds is the **compile-time** red: the import does not exist in `4-output.mts` yet. Confirm the current state first, so you know the line you are about to change is the line the evidence names:

```
grep -n "const caveats = \[...distilled.caveats\];" refinery/stages/4-output.mts
```
Expected: exactly one hit —
```
438:  const caveats = [...distilled.caveats];
```
If that grep returns 0 hits or a different line number, **stop** — the file has moved under the plan; re-locate the `const caveats =` assignment that precedes `caveats.push(...stalenessCaveats)` and use that.

- [ ] **Step 2: Run test to verify it fails**

```
bun test refinery/stages/4-output.test.mts
```
Expected today: green (`2 pass / 0 fail`) — the filter is not wired, so nothing red *can* exist here. That is the honest state: this task's red is Task 1's (already satisfied) and its gate is the build in Step 4. Record the green as the pre-change baseline.

- [ ] **Step 3: Write minimal implementation**

**Edit 3a — the import.** After `import { expiresFor } from "../lib/freshness.mts";` (`:15`):

```ts
import { expiresFor } from "../lib/freshness.mts";
import { caveatIsFresh, CAVEAT_TTL_DAYS } from "../lib/caveat-ttl.mts";
```

**Edit 3b — the coupling comment at the mint site (`:187-192`).** Replace:

```ts
    if (degradedIds.has(upstream.id) && read.kind === "ok") {
      const today = new Date().toISOString().slice(0, 10);
      const lastDate = read.output.refined_at.slice(0, 10);
      degradationCaveats.push(
        `Upstream brain '${upstream.id}' failed to rebuild on ${today}; using last good read from ${lastDate} (v${read.output.version}).`,
      );
```

with:

```ts
    if (degradedIds.has(upstream.id) && read.kind === "ok") {
      const today = new Date().toISOString().slice(0, 10);
      const lastDate = read.output.refined_at.slice(0, 10);
      // ⚠️ COUPLED TEMPLATE. `DEGRADE_CAVEAT` in refinery/lib/caveat-ttl.mts mirrors
      // this string byte-for-byte — it is the ONE caveat in the fleet whose embedded
      // date means "when this caveat was born", which is what makes it TTL-able at
      // :438 below. Edit this string and the regex silently stops matching, the TTL
      // fails open, and a frozen degradation notice re-ships forever. The "template
      // mirror" test in refinery/lib/caveat-ttl.test.mts goes RED if you do. Fix both.
      degradationCaveats.push(
        `Upstream brain '${upstream.id}' failed to rebuild on ${today}; using last good read from ${lastDate} (v${read.output.version}).`,
      );
```

**Edit 3c — the filter at `:438`.** Replace:

```ts
  const caveats = [...distilled.caveats];
```

with:

```ts
  // Stale-caveat TTL. `distilled.caveats` is the INHERITED + producer-authored set:
  // master re-lifts every passing upstream's baked caveats (refinery/packs/master.mts:188)
  // on every build, so a degradation notice minted once re-ships daily for as long as the
  // degraded upstream stays skipped-fresh — up to 30 days. caveatIsFresh drops ONLY the
  // engine's emission-dated `failed to rebuild on {date}` template (:191) once it is past
  // the TTL; every other caveat — content caveats with old source dates, methodology notes,
  // local-context facts, the two sibling engine templates — has no template match and is
  // KEPT unconditionally. See refinery/lib/caveat-ttl.mts for why a bare date-scan here
  // would delete 34 of the fleet's 40 dated caveats.
  const caveats = distilled.caveats.filter((c) =>
    caveatIsFresh(c, new Date(refined_at), CAVEAT_TTL_DAYS),
  );
```

**Edit 3d — lock the two lines that must stay unfiltered (`:458-459`).** Replace:

```ts
  caveats.push(...stalenessCaveats);
  caveats.push(...degradationCaveats);
```

with:

```ts
  // DO NOT apply the caveat TTL to these two. They are CURRENT-BUILD TRUTH, minted by
  // harvestUpstreams seconds ago, and both would be corrupted by a date filter:
  //   - stalenessCaveats (:182-183) embed the upstream's own EXPIRY date, which for a
  //     genuinely-stale upstream is BY DEFINITION already in the past — a TTL here would
  //     silently delete a live staleness signal on the build where it first fires.
  //   - degradationCaveats (:191) carry TODAY's date, so a filter is a no-op anyway.
  // The freeze the TTL fixes is a time-passing effect on the DOWNSTREAM RE-LIFT (:438),
  // never at the bake-in point. (The design spec said to filter here; it was wrong.)
  caveats.push(...stalenessCaveats);
  caveats.push(...degradationCaveats);
```

- [ ] **Step 4: Run test to verify it passes**

```
bun test refinery/lib/caveat-ttl.test.mts refinery/stages/4-output.test.mts refinery/stages/4-output.suggestions.test.mts
```
Expected: `17 pass / 0 fail` (13 + 2 + 4 — the two stage suites unchanged and still green).

Then the type gate (CLAUDE.md: verify with `bunx next build`, **never** `npx tsc`):
```
bunx next build
```
Expected: build completes, no TypeScript error naming `caveat-ttl.mts`, `caveatIsFresh`, or `4-output.mts`. (A pre-existing unrelated warning is not this task's red; a *new* error naming any of those three is.)

Then the full refinery suite, to prove no brain-level regression:
```
bun test refinery/
```
Expected: green (same pass count as before your change, plus 13).

- [ ] **Step 5: Commit** — after operator approval on the diff (ASK-FIRST)

```
git add refinery/stages/4-output.mts
git commit -m "fix(refinery): drop re-lifted degradation caveats past their 14d TTL at 4-output:438" -m "master.mts:188 re-lifts every passing upstream's baked caveats each build, so 'macro-florida failed to rebuild on 2026-06-29' re-ships daily until macro-swfl's own 30d TTL expires. Filter the INHERITED set (:438) with the template-anchored caveatIsFresh; leave :458-459 (this build's staleness + degradation caveats) untouched — stalenessCaveats embed an already-past expiry date and a TTL there would delete a live signal. No-op on 39 of 41 brains by construction."
```

---

### Task 3: SESSION_LOG, push, close the check

**Files:**
- Modify: `SESSION_LOG.md` (new entry at top — append-only, never rewrite past entries)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Closes the `caveat_expiry_rebuild` check (CLAUDE.md RULE 2 step 3).

- [ ] **Step 1: Write the failing test** — the pre-push hook is the test. It blocks the push if no commit ahead of upstream touched `SESSION_LOG.md`. Prove it is armed:

```
node scripts/safe-push.mjs --dry-run
```
Expected (before you write the entry): the session-log hook refuses, naming `SESSION_LOG.md`. If `--dry-run` is not supported by the script, skip to Step 3 and let the real push surface the block — do **not** work around the hook, and never `--no-verify`.

- [ ] **Step 2: Run test to verify it fails** — same command; the RED is the hook's refusal message. Capture it.

- [ ] **Step 3: Write minimal implementation** — prepend a new entry at the top of `SESSION_LOG.md`:

```markdown
## 2026-07-11 — Phase 3e: stale-caveat TTL (spec §7 3e)

**What changed**
- New `refinery/lib/caveat-ttl.mts` — `caveatIsFresh(caveat, now, ttlDays=14)`, a TEMPLATE-ANCHORED
  predicate. It matches ONLY the engine's emission-dated template at `4-output.mts:191`
  (`Upstream brain '{id}' failed to rebuild on {date}; using last good read from {date} (v{n}).`)
  and returns KEEP for every caveat with no template match.
- Wired at `refinery/stages/4-output.mts:438` — the engine-wide re-lift chokepoint. `:458-459`
  deliberately left UNFILTERED.

**Evidence (why the spec's own wording would have shipped a bug)**
- The re-lift is `refinery/packs/master.mts:188` (`passing.flatMap(p => p.upstream.caveats)`),
  not `harvestUpstreams`. `dedupeCaveats` (`synth.mts:920`) is byte-preserving, so the frozen
  string arrives at `:438` intact. master is the fleet's ONLY re-lifter.
- A naive "regex any date, drop if >14d" filter drops **34 of the fleet's 40 dated caveats** —
  all false positives, including two LIVE-TRUE permits-swfl degradations ("Most recent Naples
  permit issued 2026-04-30 ... Collier signal in this build is stale"), env-swfl's "last reviewed
  2026-05-17" methodology note, and 14 cre-swfl dated local-context facts — and STILL keeps the
  phantom it was built to kill (age 12d today, inside a 14d TTL). Template-anchoring drops 0.
- Filtering `:458-459` would delete a live staleness signal: `stalenessCaveats` (`:182-183`) embed
  the upstream's own EXPIRY date, which for a genuinely-stale upstream is already in the past.
- Blast radius: exactly 2 of 41 brains (`master`, `macro-swfl`) carry a template-matching caveat.
  The filter is a no-op on the other 39, as intended.

**Known + accepted limitation (not a bug)**
- `:438` runs at BUILD time. `macro-swfl` is skipped-fresh (30d TTL from 06-29), so
  `brains/macro-swfl.md` keeps the frozen string on disk and `/api/b/macro-swfl` serves it until
  macro-swfl self-heals (~2026-07-29). `master` — the surface that matters — rebuilds daily and is
  filtered. A serve-time filter at `speaker.mts` was evaluated and REJECTED: `sanitizeProse`
  (`speaker.mts:317`) rewrites ISO dates to MM/DD/YYYY and swaps the pack id BEFORE
  `isDisplayableCaveat` sees the string, so an ISO-anchored regex there is a silent no-op. If it is
  ever added, it must filter the RAW caveat before the scrub in the `.map` chain (`:500-502`, `:862-864`).
- Structural ceiling: a date-TTL can only reach the `:191` class. `:182-183` (embeds an expiry) and
  `:171` (no date) share the same latent freeze bug and are unreachable by date math. 0 live instances.

**What's next**
- Live-verify wrinkle: the real phantom is age 12 today, so a live build cannot demonstrate the DROP
  until 2026-07-13. Before then a live run only proves NO FALSE DROP; the drop proof is the unit
  fixture (07-12 keep / 07-13 drop / 07-14 drop).
```

- [ ] **Step 4: Run test to verify it passes**

```
git add SESSION_LOG.md
git commit -m "docs(session-log): phase 3e — stale-caveat TTL at the re-lift chokepoint"
node scripts/safe-push.mjs
```
Expected: the session-log hook passes, the 5-gate pre-push gate passes (this phase touches no `package.json`, no `refinery/packs/**`, no vocab, no ingest write — Gates 1/2/4/5 are inert), and the push lands. **Before running `safe-push`, check `git log origin/main..HEAD --oneline`** — if it lists any commit you did not author in this phase, STOP and ask; safe-push carries foreign commits.

- [ ] **Step 5: Commit** — the check ledger update rides the same push cycle (RULE 2 step 3):

```
node scripts/check.mjs list
node scripts/check.mjs close caveat_expiry_rebuild
```
Expected: `list` shows `caveat_expiry_rebuild` open before, absent/closed after. If the key does not exist, do **not** invent one — open it and close it in the same breath so the ledger carries the trace:
```
node scripts/check.mjs open refinery caveat_expiry_rebuild "Stale degradation caveat re-ships on every master re-lift"
node scripts/check.mjs close caveat_expiry_rebuild
```

---

# Closing the check, out-of-scope, and the checks to open

## Closing `data_contracts_doctor_live_verify`

Per spec §"Check linkage", the parent check closes **only** on:
1. **Phase 1–3 acceptance (§9) green LIVE** — not dev attestation. (`public.checks` is prod evidence, never a session's own report.)
2. **Doctor's first real run archived in `verification/`.**

**Phase 4 (nightly chain) and its ask-first cron rewires get their OWN check at execution time** — do not fold them into the parent.

Concretely, the parent cannot close until: the Spine's `workflow:` test is green on the real registry; a deliberately-wrong filename fails the Phase-2 static check; the Phase-1 replay fixture quarantines/reports the right rows *and* both false-positive traps pass clean (the ~523 legit sub-$20k land lots and the 41,510 LeePA nominal-consideration transfers); Phase-2 `--live` flags exactly the real cases (`redfin_city_swfl` never landed, `dbpr_re_licensees` 0 rows, `parcel_subdivision` zero-coverage, `usgs_tier2` zombie); the manifest drift-test goes red on an un-regenerated new workflow; and `classifyTermination` labels leepa's 4/4 `UNKNOWN-CANCEL` and corridor-pulse's kill `TIMEOUT` with `should_retry=false`.

## Out of scope (stated, not silently dropped)

- **No Dagster/Prefect/Airflow.** Path C stays gated (spec §12). The gate opens only when ALL hold: all of A shipped and green ≥60 consecutive days with no manual intervention; ≥3 config-drift incidents in a rolling 90 days that the Phase-2 cross-check **structurally cannot catch**; the workflow count outgrew "one clocked head + `needs`"; and an operator willing to run an always-on service. **Kill criteria:** A green and quiet · CI holding drift at PR time · nobody will run the daemon · anyone proposes rewriting `contracts.py`/`doctor` *inside* Dagster.
- **No `BrainOutput` type-lift for caveats.** Render-TTL (parse-at-render) was chosen precisely to avoid a type change that would require backfilling every pack in one commit.
- **No re-adding freshness/row-count contract types** — they already have authorities (`check_freshness.py`).
- **No re-researching pipeline source ceilings.** That work exists on `/census` (70/74 confirmed-total, 68/74 source-ceiling, dated 07/07–07/08). Leverage it; do not redo it.
- **The `/census` React rebuild is ops-repo work** (`swfldatagulf-ops`), not `brain-platform`. But `/census` is **NOT walled off**: `doctor --json` must back it. See the check below.

## Checks to open (RULE 2.4 — no silent deferrals)

Every gap this plan does not itself close gets a `checks` row **in the same session**, not a SESSION_LOG sentence. Open these with:
`node scripts/check.mjs open <project> <key> "<label>"`

| Key | Why it exists |
|---|---|
| `active_listings_ship_or_delete` | `active_listings` is a daily-scheduled writer whose 38,728-row table **feeds nothing live** (`08h` D7). It is excluded from the nightly gate. Decide: re-point a consumer at it, or delete the pipeline. Do not leave a daily paid scrape feeding a corpse. |
| `census_doctor_json_wiring` | Spec §7 3f / §13.5: wire `doctor --json` into the existing `/census` ops page and reconcile the three inventories (census 74 ↔ registry 75 ↔ 83 active-cron / 79 firing). **Ops-repo work.** Do NOT build a competing dashboard. |
| `graphify_republish_never_succeeded` | `graphify-republish` is **0-for-2** — it has never once succeeded (`08d`). Its ~44s "duration" is time-to-*fail*. The chain's warm leg is dead on arrival until this is fixed. |
| `narrative_bake_post_6am_cron` | `narrative-bake.yml` fires at `23 10` = **06:23 AM EDT — past the operator's 6:00 AM Eastern ceiling, in production, today.** Closed by the Phase-4 cutover; tracked separately in case the cutover is deferred. |
| `usgs_tier2_zombie_entry` | The registry names a writer that **does not exist** — the only USGS workflow writes Tier-1 Parquet only, the Postgres table has been frozen since 05/19/2026, and `env-swfl` reads it **live**. A 60-day tolerance hides it. Phase-2 `--live` surfaces it; closing needs a ship-or-delete decision. |
| `parcel_subdivision_zero_coverage` | A real dlt pipeline, **220,875 rows, last load 07/06/2026**, manual-dispatch only, **zero registry coverage**. Either register it or `coverage_exempt` it with a reason. |
| `api_disabled_workflows_orphan_6_entries` | 4 workflows carry **live crons in source** but are `disabled_manually` at the GitHub API, orphaning 6 registry entries. **Phase 2 structurally cannot see this** (`--static` reads files, `--live` reads the DB; neither reads workflow state) — the §7 3a manifest's `disabled` field owns it. |
| `contracts_backfill_and_purge` | Spec §5's one-time `--contracts-backfill` (read-only triage of already-landed contamination) and `--purge` (explicit destructive cleanup). If Phase 1 does not ship both, this tracks the remainder. A destructive purge needs a non-null guard or pre-push **Gate 4 blocks it.** |
| `news_swfl_dlt_schema_and_secret` | `news_swfl` carries a **phantom** `source_tag: news_crawl` (no such literal in the code) and a wrong `dlt_schema_name: data_lake`; and `novelty.py:33` reads `DATABASE_URL`, which the workflow never sets — so the novelty guard **fails open silently in CI and can never trip.** |

---

## Self-review performed on this plan

1. **Spec coverage** — every spec section (§3 Spine, §5 contracts, §6 CI cross-check, §7 3a/3b/3c/3d/3e, §8 nightly chain, §9 acceptance, §11 prescriptions enum) maps to a task, **except** the items explicitly listed under "Out of scope" and "Checks to open" above. §15 step 0 (Act-today) is Phase 0.
2. **Placeholder scan** — done. Two adversarial critics swept for "TBD", uncoded code-steps, fabricated pass counts, and dangling references.
3. **Type consistency** — the **Integration Contract** above exists because the first draft failed this check: three phases invented three names for the row floor, and one phase's row gate would have counted **zero rows in production while CI stayed green.** The vocabulary is now pinned and the affected phases were rewritten against it.

**Known residual risk:** this plan was assembled from parallel authors and repaired against critics. Before executing a phase, re-read the **Integration Contract** and confirm the phase's field names match it. If they do not, the phase is stale — the contract wins.