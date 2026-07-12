# 08 — RESEARCH PACK INDEX: read this before building the data-contracts + doctor spec

**Date:** 07/11/2026 · **Spec this serves:** `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` · **Check:** `data_contracts_doctor_live_verify`

This pack closes spec **§13 "Open for Fable 5 tonight"**. It was produced by a 27-agent read-only research fan-out (25 opus + 2 sonnet, ~6.5M tokens) that read the live files, queried the live DB (SELECT-only), pulled real `gh run` history, and fetched live vendor docs. Three strands were independently re-verified by a second agent that never saw the first's answer.

> **THE SPEC IS A HYPOTHESIS, NOT AN AUTHORITY.** The research found **six places where the spec is wrong**. They are listed below. Where this pack and the spec disagree, **this pack wins** — it was checked against reality; the spec was written from the diagnosis. Do not implement a spec section without reading its correction here first.

---

## The six spec corrections (each would have shipped a bug)

### 1. ❌ The `land_drags_median` tripwire is a TAUTOLOGY — it cannot ever fire (§5)
The proposed contract recomputes a "correct" homes-only median and fires when the shipped median collapses below `0.5 ×` it. But the recompute's WHERE clause is a **byte-for-byte copy of the view's own WHERE clause** — it compares the implementation against itself. Live: **49 of 52 rows have ratio exactly 1.0000**; `median < 0.5 × median` is **arithmetically unsatisfiable**.

Worse — `property_type` is **not vendor-supplied**, it is *derived*, and `PROPERTY_TYPE_MAP.get(raw, "other")` silently defaults any unmapped value (a bug that **has already happened once**, `test_extract_api.py:64-65`). Under that drift, the original ~10× $35k bug **returns in full while the tripwire reports GREEN** (33972 → true ratio 0.102, reported 1.000).

**FIX:** replace the oracle with a **label-independent** one — `(beds IS NOT NULL OR sqft IS NOT NULL)` instead of `property_type <> 'land'` — and join on **`(county, zip)`**, not `USING (zip_code)` (which also fixes a live cross-county false-positive vector). Verified: 0 rows today, **fires at 0.102/0.117 on 33972/33974 under the relabel the current contract sleeps through.** → **`08h` §1**

### 2. ❌ The `range` price floor would DELETE REAL LISTINGS (§5)
Both independent verifiers agreed: as scoped with `policy: quarantine`, it hard-drops **real manufactured-home *sales*** in North Fort Myers lease-lot parks ($8,900–$14,900; lot-number addresses, 1–2 beds, 400–900 sqft, `$X,900` ladder) — the *same* population the spec protects when tagged `other`, just inconsistently tagged `single_family` by the feed. It also *passes* real rentals priced above the floor.
**FIX:** demote to `report`/`review` at the merge locus, or shrink the must-drop set to the ~13 round-`$5,000` physically-impossible rows below the ZIP's own bare-land floor. **A price floor is a signal, not a licence to drop rows.** → **`08b`, `08h` §1**

### 3. ❌ The caveat-TTL filter is aimed at the wrong lines (§7 3e)
Spec says filter at `:438` **and** `:458-459`. **`:458-459` must stay UNFILTERED** — they push *current-build-truth* caveats; filtering there would silently kill a live staleness signal. And a bare "regex any date, drop if >14d" would **false-drop currently-true content caveats** (e.g. permits-swfl's live *"Collier signal is stale"*).
**FIX:** single edit at **`4-output.mts:438` only**, with a **template-anchored** regex (`/failed to rebuild on (\d{4}-\d{2}-\d{2})/`), returning `true` (keep) for any caveat with no template match. Exactly **2 of 41 brains** match. → **`08f`**

### 4. ❌ `source_tag` is the wrong Spine field — nothing reads it (§3)
`check_freshness.py` scopes on **`source_name`** (`:238`, `:382`). **`source_tag` is read by NOTHING** in `ingest/scripts/` or `ingest/lib/`. The registry's only `source_tag:` field (`news_swfl` → `news_crawl`) is a **phantom** with no matching literal in the code. This is precisely the class that cost two weeks of false-RED.
**FIX:** the Phase-2 cross-check must verify **which column the target table actually has**, not merely that a literal matches. → **`08h` §2 (N3)**

### 5. ❌ The three-inventory numbers are stale (§7 3f)
Spec says `74 ↔ ~78 ↔ 77`. Reality at HEAD: **`74 ↔ 75 ↔ 83 active-cron (79 actually firing)`**. And there is a class **neither Phase-2 mode can see**: **4 workflows carry live crons in source but are `disabled_manually` at the GitHub API**, orphaning **6 registry entries**. `--static` reads files; `--live` reads the DB; neither reads workflow *state*.
**FIX:** assign that class to the **§7 3a manifest** (`disabled` field), NOT Phase 2. → **`08e`, `08h` §3**

### 6. ❌ `doctor`/`assert_landed` cannot be built as specced (§7 3c, §8)
Four blocking drifts: (a) **`nightly:` and `min_rows:` do not exist** in the registry — zero hits across 1756 lines (Spine-pending, so `assert_landed` is downstream of the Spine, not independently shippable); (b) `min_rows` **duplicates** the existing `expected_rows_min`; (c) the existing staleness math uses **local time**, the gate needs **UTC**; (d) **`city_pulse` cannot be volume-gated as modeled** — it is `lane: tier-1` with no `freshness_table`, and `check_volume_entry` returns `None` for tier-1. → **`08f`**

---

## Two more landmines (not spec errors, but they will bite)

- **The lake MCP proxy misreports views as tables.** Its `information_schema.tables` says `listing_active_stats` is a `BASE TABLE`. Only the real `pg_catalog.pg_class.relkind = 'v'` identifies it correctly. **Any view-vs-table branch in doctor/Locus-B must use the pg catalog, not the proxy.** → `08f`
- **`active_listings` is ORPHANED.** It is a daily-scheduled writer whose 38,728-row table **feeds nothing live** — the registry names a consumer that actually reads `listing_lifecycle`'s output instead. **The nightly row gate must target `listing_state`, not `active_listings_residential`**, or it guards a corpse while the real table silently empties. Needs a ship-or-delete decision. → `08h` §2 (D7)

---

## Your 6 AM constraint: CONFIRMED, with a violation you're shipping today

**Operator rule (07/11/2026): everything starts after 11 PM–12 AM Eastern and finishes before 6:00 AM Eastern.**

Measured from **real run history** (not estimates), from the `04:05 UTC` head (= 00:05 EDT / 23:05 EST — inside the window year-round):

| | finish (UTC) | finish (Eastern) | margin to 6 AM |
|---|---|---|---|
| Typical | 04:42 | **00:42 EDT** | **5h 18m** |
| Worst case | 05:19 | **01:19 EDT** | **4h 41m** |

**PASS with ~4.8× headroom.** The chain would have to run 5h55m to touch the ceiling; measured worst case is ~74 min. Survives doubling every term.

**But `narrative-bake.yml` currently fires at `23 10` = 06:23 AM EDT — already past 6 AM, today.** The cutover list is therefore **broader than the two crons the spec named**: also comment out `narrative-bake`, `gate-a-parity`, and `graphify-republish` standalone crons. Full list in **`08d`**.
*Also: `graphify-republish` has **never once succeeded** (0/2 runs) — a real reliability bug, immaterial to timing.*

**Timing says the cron deletion is safe. Sequencing says do it ONLY after `nightly-chain.yml` exists and has ≥1 green end-to-end run** — otherwise you strand the pipeline with zero scheduled ingest. Different claims; keep them labeled. **Ask-first per RULE 1.**

---

## The pack

| Doc | What's in it |
|---|---|
| **`08a-spine-identity.md`** | All **74** registry entries resolved: `workflow:` · `consuming_pack:` · `source_tag:` · lane · nightly/min_rows · secrets-read-vs-wired · `uses:` pins · timeouts. Plus **every identity drift, both sides named** — these are the Phase-2 expected-RED fixtures. Includes a working **prototype run** of the Phase-2 static check over the table. |
| **`08b-contract-thresholds.md`** | **THE LOAD-BEARING DOC.** Drop-in `content_contracts:` YAML for `range` / `enum` / `sql_expectation`, the defining queries + row-sets for the replay fixtures (§9a), quarantine-vs-abort policy with real contamination shares — **and an adversarial verdict on each.** Read the verdicts before implementing. |
| **`08c-blast-radius.md`** | 57 references to the contaminated tables; **19 live consumers across 12 files** — desk loaders, email market-context + zip-events, landing map, insiders desk-stats, charts page, project-feed watch/nudges, public `/r/source`. The list the Locus-B tripwire must not blind-side. |
| **`08d-nightly-chain-timing.md`** | Real `gh run` durations → critical path → the 6 AM verdict above, plus the **full cron-cleanup list** (incl. the 06:23 AM bake violation). |
| **`08e-reconciliation.md`** | registry ↔ workflows ↔ coverage, both directions. What Phase-2 `--live` must assert. |
| **`08f-code-surface.md`** | Exact insertion points: the **3 Locus-A gate sites** (file:line, with the batch variable named), `ContentContractError` placement in `guards.py`, the **caveat-TTL boundary**, and the **doctor/assert_landed import surface** (function signatures + the 3 cred domains). |
| **`08g-vendor-gha-facts.md`** | Live-verified: `actions/checkout` **v7 is latest** (v6 valid but one behind — so **never bake a version literal**, resolve against live tags); `workflow_call` + `secrets: inherit` + `needs` confirmed (with the **non-transitivity** caveat); `workflow_run.workflows:` has **no glob support** — codegen the list. |
| **`08h-independent-cross-checks.md`** | **Second-opinion agents.** Contains correction #1 (the tautology) in full, the contaminated-writer Spine records, and the independent inventory recount. |

---

## What this pack does NOT do

- It does **not** re-research pipeline source ceilings — that exists on `/census` (70/74, 68/74, cited 07/07–07/08). Spec §14 forbids redoing it; this pack **reconciles** to it instead.
- It does **not** build anything. Every agent was read-only; no repo file was edited, no pipeline was triggered, no DB write was issued.
- Phase-2 half-2 of the static-check prototype did not return (one transient agent failure). Its half-1 twin did; the drift table in `08a` is complete regardless (it comes from the Spine agents, not the prototype).

**Next artifact:** the per-task TDD build plan (spec §13.1), which sequences Spine → Phase 1 → Phase 2 → Phase 3a/3b → 3c → Phase 4 → 3e as failing-test-first steps.
