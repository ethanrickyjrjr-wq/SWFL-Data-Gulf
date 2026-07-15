# HANDOFF — MarketBeat PDF ingest pipeline audit

**Written 07/15/2026.** Scope: `ingest/pipelines/marketbeat_pdf/` (`extractor.py`, `loader.py`,
`downloader.py`, `pipeline.py`), `.github/workflows/marketbeat-pdf-ingest.yml`,
`.github/scripts/download-{colliers,cw}.py`. Triggered by fixing one bug in the workflow's
GH-issue-body filename template; this is the fuller pass — "what else is wrong here."

---

## 0. Already fixed this session

Commit `6d28d7d9` (local, **NOT pushed** — needs operator go-ahead): the manual-drop GitHub issue
body in `marketbeat-pdf-ingest.yml:110-111` used plain `"..."` strings instead of backtick template
literals, so `${quarter.replace(...)}` never interpolated (it printed literally into the issue body),
AND the replace logic squished `"2025-Q4"` into `"20254"` instead of the real filename convention.
Fixed to real template literals with `quarter.replace(/^(\d{4})-Q(\d)$/, "$2$1")`, verified against
`extractor.py`'s own `quarter_from_filename` parser (`Q{n}{YYYY}`, e.g. `Q42025`) by extracting the
JS into a standalone script and running it.

---

## 1. Findings, ranked

### 1.1 [Needs verification — possibly the biggest gap] C&W publishes separate Office and Retail MarketBeat reports; this pipeline only ever ingests Industrial

Confirmed live (crawl4ai, `cushmanwakefield.com/en/united-states/insights/us-marketbeats`,
07/15/2026): C&W's MarketBeat line is split into fully separate report PDFs per sector — "Industrial
MarketBeat," "Office MarketBeat," "Retail MarketBeat" (branded "Shopping Center MarketBeat"), plus
Multifamily, Hospitality, Life Sciences.

`extractor.py`'s docstring, the filename regex (`^(MarketBeat|Colliers)_Industrial_Q\d\d{4}_.*\.pdf$`,
`pipeline.py:36-38`), and `_parse_cw_text` (hardcodes `"sector": "industrial"` unconditionally,
`extractor.py:187`) are ALL locked to the Industrial report only. There is no code path — parser,
filename pattern, or download script — that would ever touch an Office or Retail C&W PDF.

This directly contradicts an existing tracked claim: open check `vendor_extraction_ceiling_audit_followup`
(sourced from `_ASSISTANT/2026-07-08-vendor-extraction-ceiling-audit.md` item 4) and
`ingest/cadence_registry.yaml:1507`'s `source_ceiling` note both assert retail/industrial/office are
already flowing through "the same PDF pipeline" and only Medical Office is missing. That claim does
not match the code as it stands. Next step: confirm against the actual C&W site whether Fort
Myers/Naples gets its own Office/Retail MarketBeat report (not every metro gets every sector report),
then correct the registry note and that check's premise either way — right now the tracked check is
pointed at a narrower sub-problem (Medical Office) than what the code shows.

### 1.2 Zero automated tests for the whole pipeline

No test file anywhere references `marketbeat_pdf` (grepped `ingest/tests/` and the whole repo — no
hits). `_parse_cw_text` and `_parse_colliers_text` are hand-rolled positional/token parsers keyed to
exact header sentinels and hardcoded submarket-name allowlists — exactly the kind of code that
silently breaks on the next PDF layout tweak, with nothing in CI to catch it. A broken parser only
surfaces in production, per-quarter, after a live run pulls zero or garbage rows.

Suggest: fixture-based tests using real (or trimmed) extracted page text for each parser, pinned to
the current known-good row counts (109 C&W rows / 132 Colliers rows per the registry's own
`expected_rows_min` comments).

### 1.3 Silent submarket drops, no floor check

`_parse_cw_text` (`extractor.py:159-162`) skips any token not in the hardcoded `_CW_SUBMARKETS` set —
no warning, no count. The comment claims it's "maintained in sync with
`refinery/lib/marketbeat-submarket-aliases.mts`," but nothing enforces that sync (grepped for a test
crossing the Python set against the TS file — none exists). If C&W renames or splits a submarket, that
row silently disappears from `data_lake.marketbeat_swfl` with zero signal.

`extract_pdf` (`extractor.py:419-424`) only raises when it gets ZERO rows total — a PDF that yields 6
of ~15 expected submarkets (a partial-page text glitch) loads fine and looks like a complete, healthy
run.

Suggest: assert extracted submarket count against the known expected set, or at minimum log a WARN
listing which known submarkets were NOT found in a given page's text.

### 1.4 `already_loaded()` swallows every exception, including real DB failures

`loader.py:143-152`: bare `except Exception: return False`. A broken DB connection, bad credentials,
or network blip reads identically to "not loaded yet" — the pipeline proceeds to extract (burning the
Anthropic vision-fallback budget on scanned pages) before the SAME connection failure surfaces, later
and more confusingly, inside `upsert_rows()`. Not silent forever (upsert still fails loud) but wastes
spend and obscures the real cause in the run log.

Suggest: narrow to the specific psycopg connection/operational-error classes, and log the swallowed
exception even when returning False.

### 1.5 `workflow_dispatch` input `from_downloads` is dead / misleadingly described

`.github/workflows/marketbeat-pdf-ingest.yml:14-17` declares a `from_downloads` boolean input
described as "Process PDFs from the drop folder committed to the repo" — but the "Process drop folder
PDFs" step (line 79-86) never reads `inputs.from_downloads` at all; it always runs the pipeline with
no flags. Separately, the CLI flag it would map to (`--from-downloads` in `pipeline.py`) actually
scans `~/Downloads` on whatever machine runs it (a local-dev-only concept), not the repo's committed
drop folder — the description and the flag's real behavior don't even match each other, on top of the
input being unwired. Low severity (harmless no-op today), but worth wiring correctly or deleting the
input so a future operator toggling it in the Actions UI doesn't think it did something.

### 1.6 Auto-download success check never verifies the bytes are actually a PDF

`downloader.py:_curl_download` (line 45-65) treats "HTTP 200 and >50KB" as download success — it never
checks the `%PDF` magic header. A gate/consent page that happens to be HTML and bloated past 50KB
would pass this check and get handed to `fitz.open()` downstream, failing as a confusing PyMuPDF error
instead of a clear "didn't actually get a PDF" message. Cheap fix: check the first few bytes for
`%PDF-`.

### 1.7 Colliers auto-download may already be the exception, not the rule

`downloader.py`'s own docstring says newer Colliers quarters are increasingly form-gated behind
`cloud.usa.colliers.com` and can't be auto-downloaded at all — confirmed by
`ingest/cadence_registry.yaml:1526`: "Q4 2024 form-gated ... GHA creates GH issue when blocked." Worth
a live dry run (`gh workflow run marketbeat-pdf-ingest.yml -f quarter=<current quarter> -f
dry_run=true`) to check whether Colliers auto-download still works AT ALL for the current quarter, or
whether the ODD manual-drop GH issue (the one just fixed) fires every single quarter now — in which
case the "try auto-download" step is mostly theater, and the real fix is either addressing the gate or
just accepting manual-drop as the steady state (which is what got fixed this session).

---

## 2. Shared-table context (not a marketbeat_pdf bug)

`data_lake.marketbeat_swfl` is also written by the separate `lee_associates_swfl` pipeline (different
broker, different extractor). A previously tracked bug there — `lee_associates_cap_rate_discarded` —
was fixed 07/11/2026 (`cap_rate` column added, `docs/sql/20260711_marketbeat_swfl_cap_rate.sql`). Not
actionable here, just worth knowing the table has two independent writers before touching its schema.

## 3. What's NOT broken (checked and ruled out)

- The 4-column `UNIQUE(source_name, sector, submarket, quarter)` constraint the loader's `ON CONFLICT`
  targets does exist live (`docs/sql/20260605_marketbeat_swfl_mhs_extension.sql`) — the loader's
  comment about a "generated id column" is imprecise (`id` is a plain TEXT PK Python builds, not a SQL
  `GENERATED` column) but functionally harmless.
- Vision-fallback model id `claude-haiku-4-5-20251001` (`extractor.py:332`) is the current, correct
  Haiku 4.5 model id.
- Filename convention is now consistent end-to-end: `downloader.py`, `pipeline.py`'s regex,
  `extractor.py`'s parser, and the just-fixed GH issue body all agree on `Q{n}{YYYY}` (e.g. `Q42025`).

## 4. Suggested order of attack

1. Push the already-committed template fix (`6d28d7d9`) — needs operator go-ahead.
2. Resolve 1.1 (verify real C&W report scope; correct or close the stale check/registry note either
   way) — highest potential value, cheapest to check.
3. Add fixture tests (1.2) before touching the parsers further — nothing else here is safe to refactor
   blind without a baseline.
4. 1.3 / 1.4 / 1.5 / 1.6 are small, independent, low-risk fixes — any order.
5. 1.7 is a quick live dry-run to see if the auto-download fallback path is still doing anything.

Tracked as check `marketbeat_pdf_pipeline_audit` (project `ingest`).
