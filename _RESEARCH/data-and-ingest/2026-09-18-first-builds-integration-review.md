# First Terra/Sol builds: integration review and next assignments

Reviewed September 18, 2026. Scope: Terra T1/T2 acquisition and Sol S1 comparison, against the [execution plan](../../docs/superpowers/plans/2026-09-18-data-first-intelligence-rebuild.md). This is a local review and repair, not a production activation.

## Verdict

The RSW+BPS historical slice works locally after substantive repairs. The original two projects did not interoperate: invoking Sol's CLI on Terra's actual manifest failed with `manifest.source_coverage: must be an array`. Isolated unit tests had not caught that boundary. The completed joint check uses actual retained releases, produces deterministic JSON/Markdown, and makes incomplete county history visible.

Three judgments stay separate. Trustworthy historical comparison: qualified for this slice. Concrete user value: it exposes divergent aviation and construction movement that a single regional score would conceal. Predictive improvement: untested. Unattended operation: untested.

Main checkout was `6a05928c`. Sol's initial commits were `dbe3bd30` and `cdff5727` on `wt/sol-evidence-builds`; Terra's implementation was uncommitted on `wt/terra-free-data-builds`. Review repairs remain in those worktrees. Nothing was merged, committed, pushed, deployed, scheduled, or written to the database by this review.

## Repairs and evidence

- Terra added `ingest/scripts/build_swfl_history_manifest.py` and the shared archive-root manifest writer. Source manifests and immutable raw/export files remain intact; the combined transport manifest supplies the reader's strict fields and contained paths.
- Sol accepts the exporter timestamp spelling and run identity while retaining hash, byte-size, source attribution, identity and containment validation. Revision selection compares chronological instants instead of timestamp text; its documented policy now matches its implementation. BPS aggregation rejects inconsistent component definitions.
- Terra corrected `*_valuation_usd_reported` from `count` to `dollars`, regenerating the export from retained bytes. The passenger/unit comparison values were unaffected.
- Both sides now preserve county coverage. All 199 Census release files exist, but Collier has only 115 county-months; January 2015–December 2021 is absent. The report distinguishes file coverage from geographic completeness and identifies the 48 displayed year-over-year months affected by that gap.
- Terra fixed the combined-manifest crash for a nonempty BPS failure dictionary; missing-source errors remain explicit.

Parent reran both targeted suites after repair:

```powershell
# From C:/Users/ethan/dev/wt-terra-free-data-builds
& C:/Users/ethan/dev/brain-platform/ingest/.venv/Scripts/python.exe -m pytest ingest/tests/lib/test_research_capture.py ingest/tests/pipelines/rsw_airport_monthly ingest/tests/scripts/test_census_bps_capture.py -q
# 23 passed in 0.23s

# From C:/Users/ethan/dev/bp-sol-evidence-builds
bun test refinery/intelligence/observation-contract.test.mts refinery/intelligence/compare-periods.test.mts refinery/tools/build-swfl-history-comparison.test.mts
# 20 pass, 0 fail
```

Terra's live RSW dry run, using the project ingest venv, fetched and parsed all five current official PDFs: 2,595 observations, 519 contiguous months per metric, May 1983–July 2026. Capture-local returns before RSW's upsert; the BPS research command has only local capture paths. No DB/cloud write was performed.

Sol's production modules bundle successfully. Full `npm run refinery:typecheck` is still red: unrelated existing failures reproduce on main, and the new tests inherit the repository-wide missing `bun:test` typings issue. The changed production modules report no new type error. This is a targeted acceptance pass, not a claim that the entire repository is green.

The document index was regenerated. `doc-reachability.mjs --check` reports 245 orphaned documents against its 220 baseline and fails; the new review is linked from this plan, research index and scratchpad. No broad documentation cleanup or baseline weakening was performed. `git diff --check` passes in the main and both working trees.

## Actual reproducible packet

Archive root: `C:/Users/ethan/SWFL-research-captures`.

Final combined manifest: `swfl-history-comparison-manifest-v1-f17de0dcf1ccbac1fc22f41bee3aaafe05ab84598cf3b60d4b4d63fdbd32c2a0.json`. It references 204 retained raw files and the two observation exports.

```powershell
# From C:/Users/ethan/dev/bp-sol-evidence-builds
bun refinery/tools/build-swfl-history-comparison.mts --manifest C:/Users/ethan/SWFL-research-captures/swfl-history-comparison-manifest-v1-f17de0dcf1ccbac1fc22f41bee3aaafe05ab84598cf3b60d4b4d63fdbd32c2a0.json --from 2019-01 --through 2026-07 --out C:/Users/ethan/SWFL-research-captures/reports/integration-review-final
# Series comparisons: 273
# Period assessments: 91
# Analytical SHA-256: 383ffad48a57ed897e87e3e617992fe1880580cfe6f523c629cde08aa81a3a71
```

`comparison.json` file SHA-256 is `85e24e6abecdb76675fafcb33377cb0cc41b253bccd78b361c07835d1bb2e3d1`; independent parent and Sol reruns matched byte for byte. The dated interpretation is `reports/integration-review-final/review-note.md`, outside the analytical payload.

July 2026 versus July 2025: RSW 680,168 versus 720,973 passenger movements (-5.66%); Lee 1,138 versus 924 residential units authorized (+23.16%); Collier 305 versus 299 (+2.01%). Parent independently reconciled Census archive and recent raw rows to the export components. These measurements describe different populations and do not establish causation or forecast value.

The known latest RSW release is July 2026; a fresh crawl of the [LCPA reports page](https://www.flylcpa.com/about-lcpa/reports-and-statistics/) at 23:10 UTC still linked the July PDFs. [Passenger source](https://www.flylcpa.com/app/uploads/2026/08/Total-Passengers-July-2026.pdf), [Census July county source](https://www2.census.gov/econ/bps/County/co2607c.txt).

## Tools and skills: enough for the next bounded stage

Verified locally, not inferred from an installation list alone:

- Pinned Crawl4AI Python: 3.12.13, Crawl4AI 0.9.0. Real browser crawls succeeded for LCPA and FDOT. The repo already supplies `Crawl4aiSession` and ordinary page helpers; bulk files use HTTP. No replacement scraping service is needed.
- Project ingest venv: pytest 9.1.1, pandas 3.0.3, DuckDB 1.5.4, PyArrow 25.0.0, pdfplumber 0.11.10, SciPy 1.18.0, scikit-learn 1.9.0. Use this venv for acquisition/analysis; the separate crawl venv lacks several analysis packages.
- Bun 1.3.14, Node 24.19.0, Git and authenticated GitHub CLI work. Terra/Sol model delegation worked in this session. Available review, diagnosis, TDD and analytical-methodology skills cover the planned work; no new skill installation is justified by an observed gap.
- `ssh fedora` works. The SSD is mounted as ext4 at `/srv/swfl`, writable, with 973,329,108,992 bytes available on inspection; `srv-swfl.mount` is active. Its archive still contains only the storage test receipt. The actual research capture is presently on Windows, so this is not yet a verified second copy or an unattended collector.
- Existing Fedora timers and Hermes's installed `no_agent` script-job implementation provide scheduler options. No new scheduler is needed. Select one owner for this slice, avoid duplicating the existing RSW GHA owner, and review a concrete cutover before activation.
- Ollama lists local models. No inference/provider routing or throughput was certified; deterministic collection and scoring need no LLM. The hosted Graphify tools were not exposed in this session; the local CLI worked but its graph did not include these new worktree files, so review used the owning code. This does not block this slice.

## Bounded FDOT result

Crawl4AI fetched the [official traffic page](https://www.fdot.gov/statistics/trafficinfo/default.shtm) and followed its [daily-volume archive](https://ftp.fdot.gov/file/d/FTP/FDOT/co/planning/transtat/traffic/TRAFFIC_IMPACTS/). The archive advertised public Guest download access without a password. An actual Guest sign-in attempt returned `For user 'Guest', your CAPTCHA check failed. Please try again.` No attempt was made to bypass that challenge.

One alternate official route, [Florida Traffic Online](https://tdaappsprod.dot.state.fl.us/fto/), loaded a 2025 annual/AADT interface. It did not establish downloadable local daily observations. No Lee/Collier counter IDs, coordinates and daily history were qualified. This is an access/qualification blocker for the local traffic experiment, not evidence that FDOT has no such data. Saved crawl evidence is under `tmp/2026-09-18-integration-review/` in the main workspace. Do not substitute annual AADT for a monthly or daily outcome.

## Next assignments

1. **Integrator:** land the reviewed Terra and Sol changes together, preserving the current planning edits; run the joint command on the integrated checkout and retain this report. Review the narrow RSW Python 3.12 workflow change before shipping. No paid nightly-chain repair is a prerequisite.
2. **Sol, S2:** freeze one future RSW passenger-month target, its seasonal-naive baseline, release/grading policy and immutable forecast record. October 2026 is future only if the origin is frozen before October 1. First prove scoring through explicitly simulated historical replay; add at most two predeclared feature families and compare equal eligible windows. Historical exact-vintage availability is unknown, so any lag-assumed replay must remain exploratory. No claim of predictive gain until a held-out comparison supports it; no claim of forward accuracy before the outcome arrives.
3. **Terra, T3 preparation:** create a recoverable second copy, verify mount identity before capture, test missing-source and restart/idempotent recovery, define due-versus-missing releases and a total archive budget, and prepare one scheduler owner. Existing file-size limits and a 20 GiB free-space floor are present; the proposed aggregate 10 GiB experiment cap is not yet implemented. Activation, reboot/reconnect rehearsal and a genuinely new release remain unproved.
4. **Local project dossier:** retain as the destination; resume only with documented project dates/location and qualified local outcomes. FDOT Guest challenge or an official alternative needs resolution first. County authorizations cannot establish Walmart openings, visits, sales or redistribution.

No new paid services, model calls, plugins, forecasting platform, public MCP change, or data-lake migration is needed for these next assignments.
