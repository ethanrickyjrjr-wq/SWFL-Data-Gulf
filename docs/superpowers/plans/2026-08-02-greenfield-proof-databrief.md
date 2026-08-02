# Implementation plan — `databrief` greenfield proof

Spec: `docs/superpowers/specs/2026-08-02-greenfield-proof-playbook-design.md` (LOCKED sources:
BLS · Treasury FiscalData · NOAA CO-OPS · OpenFEMA Disaster Declarations; FRED optional 5th).
Repo: `C:\Users\ethan\dev\databrief` — local git, no remote/push without operator say-so.

## Definition of done (the whole proof, provable)

`python -m databrief.run` (or `make brief`) executes: 4 API pulls → `lake.duckdb` → 2 brain JSONs
→ rendered `out/brief.html` + screenshot — and `pytest` + the e2e test pass, where the e2e test
asserts a known sourced figure AND its citation appear in the rendered HTML. Every numeral in the
HTML traces to a brain fact (no-invention lint). Show the HTML, the lint output, and the test line.

## Steps (each = failing test named for its failure mode, then green)

1. **Scaffold + day-0 guards** (playbook §5 install order, trimmed to fit a 1-person proof repo):
   git init · `PLAYBOOK.md` copied verbatim from new-project-playbook · `SESSION_LOG.md` +
   pre-push hook (exit 2) · `LEDGER.md` obligations file + sweeper script · `DATA-ROOTS.md` stub ·
   `.gitignore` (lake, .env, out/) from commit zero · meta-guard test (hooks on disk registered or
   PARKED) · uv-managed Python 3.12 venv, `pyproject.toml` (dlt[duckdb], duckdb, pytest), separate
   `email/` node workspace (react-email, @react-email/render, tsx, vitest).
2. **Pipelines (4)** — one module each under `databrief/pipelines/`, all dlt → DuckDB:
   `bls.py` (POST api.bls.gov/publicAPI/v1/timeseries/data/, 2-3 series, no key) ·
   `treasury.py` (fiscaldata.treasury.gov debt-to-penny + avg interest rates) ·
   `noaa.py` (CO-OPS predictions + water level, one station) ·
   `fema.py` (OpenFEMA v2 DisasterDeclarationsSummaries, recent window).
   Each declares `PULLED` fields + `CEILING` (full field list, URL, as-of) as module constants —
   the registry is GENERATED from these by `tools/gen_registry.py` (computed, never typed).
   Guards per pipeline: row-count floor before merge, schema contract on unexpected columns,
   fixture test from a captured real response.
3. **Brains (2)** — `brains/economy.py` (BLS + Treasury + FRED-if-keyed), `brains/conditions.py`
   (NOAA + FEMA). Pure SQL/Python over the lake → `out/brains/*.json`, every figure
   `{value, source_url, as_of, method}` + freshness token = MAX(loaded_at). No LLM in v1 —
   prose lines are template-composed from facts. No master tier.
4. **Email** — `email/recipes/weekly-brief.tsx`: one coded react-email grid, typed props =
   the two brain JSONs, every slot a typed binding, citation line under every figure.
   `email/render.ts` → `out/brief.html`. Screenshot via the existing chrome tooling.
5. **Cross-cutting guards** — `tools/lint_no_invention.py` (every numeral in rendered HTML ∈ brain
   facts ∪ whitelist; exit nonzero on miss) · registry consumer test (pipeline without a consumer
   fails) · freshness detector reads the lake, not job status · e2e test (fixture → HTML).
6. **Run it for real** — live pulls, real brief.html, screenshot, paste evidence into databrief's
   SESSION_LOG + this repo's SESSION_LOG. Count: 6 steps, report n of 6.

## Explicitly out of v1

Sending (Resend), cron, hosting, FRED unless the key drops in trivially, any SWFL framing, any
LLM prose. Each lands in databrief's LEDGER.md as an explicit deferral, not silently.
