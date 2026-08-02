# HANDOFF — coverage contracts for ALL pipelines, lakes, crons (extend, never re-track)

**Operator decree 08/02/2026, verbatim:** "write a handoff to do this for all pipelines, lakes,
crons — make sure we don't already have this because i've tried to keep track of everything 10
fucking times — we have a fucking ops page full of this shit in the other repo, yet no one checks
and just fucks me over and over."

**"This" = the SteadyAPI coverage-contract discipline** (playbook addendum B, check
`steadyapi_source_ceiling_coverage_contracts`): per source, a PINNED machine-readable inventory of
what the source offers, the set we persist, an untouched-ledger with reasons, and a scheduled
zero-paid-calls differ whose verdicts (ACCEPT / VENDOR_ADDED / VENDOR_REMOVED / PERSIST_DRIFT,
ERROR_* separate) report into the existing freshness rollup — with a positive control that MUST
trip, because a differ that can't fail is not a gate.

---

## §0 WHAT ALREADY EXISTS — READ THESE BEFORE WRITING ANYTHING (the whole point)

The operator has tracked this "10 times." He is right. The inventory layer EXISTS; what's missing
is the ENFORCEMENT layer. Building any new inventory/tracker/audit doc is the failure repeating.
Verified live 08/02/2026, this session:

1. **`ingest/cadence_registry.yaml`** — 80 pipeline entries + 31 scheduled jobs. **78 of 80 carry
   `source_scope`, 74 carry `source_ceiling`** (grep-counted 08/02). This IS the per-pipeline
   coverage catalog, law since FULL-SCOPE-FIRST (locked 07/14/2026, CLAUDE.md).
2. **The ops page** (`swfldatagulf-ops.vercel.app`, root fetched HTTP 200 08/02) renders every
   `source_scope` block automatically — the "ops page full of this shit." No ops-repo change needed.
3. **`_ASSISTANT/2026-07-08-vendor-extraction-ceiling-audit.md`** — the full catalog-vs-pulled
   audit across ~16 vendor families, ranked cheap wins. Its action check
   `vendor_extraction_ceiling_audit_followup` is OPEN and 22 days untouched — proof that a prose
   audit without a machine gate goes unread. Do not re-run this audit; EXECUTE against it.
4. **`ingest/quality/`** — `quality_registry.yaml` (16 entries) + `contracts.py` +
   `schema_baselines/`: the value-agreement contract machinery (leepa↔fdor families 30743f01,
   3dd2f170). It checks VALUES of data we kept. Coverage contracts are its sibling: "we capture
   what the source offers." Same registry, same rollup — a new family, not a new system.
5. **`ingest/lib/raw_landing.py`** + `migrations/20260802_steadyapi_raw_landings.sql` (commit
   `b50092bf`) — the generic raw-body landing writer, already wired into listing_lifecycle,
   market_aggregates, rentals. The bytes the differ reads already land for every scheduled paid
   SteadyAPI surface.
6. **The checks ledger** — open, overlapping obligations this handoff ABSORBS rather than
   duplicates: `steadyapi_source_ceiling_coverage_contracts` (the mechanism spec, due 08/16) ·
   `steadyapi_raw_land_all_paid_surfaces` (field census per remaining endpoint) ·
   `vendor_extraction_ceiling_audit_followup` (07/08 cheap wins) · `marketbeat_pdf_pipeline_audit`.
7. **`docs/standards/repo-inventory-audit.md`** — the living source→table inventory; update it as
   sections land, never fork it.
8. **Freshness rollup** — `ingest/scripts/check_freshness.py` + the freshness-probe-daily cron:
   the ONE reporting surface contracts already use. Coverage verdicts report HERE, nowhere new.

**LAW FOR THE EXECUTOR: every step below EXTENDS one of these eight. If you find yourself creating
a new markdown status board, a new registry file, or a second reporting surface, stop — you are
tracker number 11.**

## §1 THE DELTA — what does NOT exist (why "no one checks" keeps happening)

- The registry's `source_scope`/`source_ceiling` blocks are PROSE. Nothing machine-reads them, so
  nothing fails when reality drifts from them. 7 audits re-found the same 64-fields-persisted-3 gap
  because the knowledge lived in sentences, not in a fixture a cron can diff.
- No pinned field-path inventory exists for ANY source except /property-tax-history
  (`_RESEARCH/data-and-ingest/2026-08-02-property-tax-history-full-scope.md`, 64 paths).
- ~2 pipeline entries lack `source_scope`, ~6 lack `source_ceiling` — derive the exact list at
  execution time (counts go stale; the command is the truth): walk the YAML, print entries
  missing either block.
- No pre-push gate requires a new pipeline to declare scope/ceiling. FULL-SCOPE-FIRST is a rule a
  session can skip; rules that aren't hooks get skipped (documented, repeatedly).

## §2 EXECUTION (one PR per step; RULE 3.5 brainstorm + failure modes + TDD each)

**Step A — close the registry gaps.** List entries missing `source_scope`/`source_ceiling`
(command above); fill each from vendor docs/probe per FULL-SCOPE-FIRST (crawl4ai, cited
source_url + as_of). Zero code.

**Step B — the coverage-contract checker (the mechanism; THE step).** One Python job,
`ingest/quality/` — a new contract family beside the value contracts:
- Pins live in `ingest/quality/coverage_pins/<source>.json`: `{"paths": [...], "persisted": [...],
  "untouched": {"path": "one-line reason", ...}, "pin_version": 1, "as_of": "MM/DD/YYYY"}`.
- First pin: convert the 64-path property-tax-history census (v1 exists, gitignored — the pin
  fixture is the shippable form).
- Differ: unions JSON field paths across recent raw-landed bodies (arrays collapse to `[]`, the
  census method), diffs vs pin. Where no raw table exists, the differ runs against the persisted
  columns vs the pin only (PERSIST_DRIFT class still works; VENDOR_* classes need bodies).
- Verdicts append-only: ACCEPT · VENDOR_ADDED · VENDOR_REMOVED · PERSIST_DRIFT; ERROR_* separate —
  an empty raw table or unreadable body is an ERROR, never a coverage verdict.
- **Positive control non-negotiable:** self-test injects one extra field into a stored fixture body
  and MUST report VENDOR_ADDED, or the checker itself exits red.
- Reports into the freshness-probe-daily rollup beside the agreement families. ZERO paid calls.
- Registered in `quality_registry.yaml`; cron wrapper + `--dry-run` in the same PR
  (pipeline-freshness law). Signal warning: public.checks signal types cannot express a set-diff —
  the related checks close on the checker's own self-test output, never a db_row_exists.

**Step C — raw-landing triage for everything else (rule-11-proportioned).** Classify all 80
pipeline entries into: PAID or rate-limited (SteadyAPI — DONE via `raw_landing.py`) ·
SCRAPE-FRAGILE or ephemeral (Accela permits, FMB dashboard, MarketBeat PDFs — raw-land next; the
source can vanish) · FREE-REFETCHABLE (Census, FRED, Zillow CSVs, NOAA — do NOT raw-land; the
vendor archive IS the raw store; a copy is hyperscaler cosplay at our volume). Record the
classification as ONE line in each entry's existing registry block — not a new file.

**Step D — the gate (the actual "no one checks" fix).** Extend
`.claude/hooks/check-prepush-gate.mjs` with a registry lint: a push adding a pipeline entry
without `source_scope` + `source_ceiling` + the Step-C classification line is BLOCKED (same
family as Gate 4/5; RULE 3 C2 — extend the existing seam, never a new mandatory gate system).
Humans stopped checking ten trackers; the hook checks the one that renders on the ops page.

**Step E — crons.** No new tracking needed: the `jobs:` section + Gate 10 (schedule catalog)
already enforce cron membership. The only cron work here is Step B's own wrapper.

## §3 FAILURE MODES → GUARDS (named before build)

| Failure | Guard |
|---|---|
| Differ that can't fail | positive control in self-test, checker red without it |
| Checker burns paid calls | reads only landed bodies / our own columns; zero-network law, test-enforced |
| 11th tracker emerges | §0 law + Step D lint lives in the EXISTING hook + pins live in the EXISTING quality dir |
| Stale counts baked into docs | §1 derives gap lists by command at execution time, never quotes this handoff's numbers |
| Free-source raw-landing bloat | Step C three-way classification; FREE-REFETCHABLE explicitly excluded (rule 11) |
| Prose pin drifts from fixture | pin_version + as_of inside the JSON; census doc references the fixture, not vice versa |
| Lying check signal | no signal on coverage checks; close = self-test output (check-signal skill trap catalog) |

## §4 CHECKS WIRING (RULE 0.8 — absorb, don't multiply)

- `steadyapi_source_ceiling_coverage_contracts` — Step B closes it (its spec IS Step B for the
  first pin; extension to /search, /rentals-search, /nearby-home-values is inside its scope).
- `vendor_extraction_ceiling_audit_followup` — Steps A+C execute against it; close with evidence
  per item or fold remaining items into per-source registry lines.
- `steadyapi_raw_land_all_paid_surfaces` — already largely landed by `b50092bf`; verify each
  endpoint's census claim, then close with evidence.
- NEW umbrella check `coverage_contracts_platform_wide` (opened 08/02/2026, this session) — points
  here; closes when Steps A–E are individually evidenced.

## §5 RULES THAT BIND

Four-lane read BEFORE executing any step (this handoff is RESEARCH lane, not a substitute for the
other three) · RULE 3.5 brainstorm + TDD per step · one verification pass then act (RULE 0.6) ·
counts spoken only after re-derivation (RULE 0.8/12) · SESSION_LOG + explicit-path safe-push ·
provenance names the real vendor ("realtor.com", never "SteadyAPI") on user-facing surfaces.
