# 00 — Audit & Catch-up (Wave 0, solo)

> Build file for the Daily Freshness System. **Read `README.md` §0 (verification ledger) first.** This file runs **before** everything else: it turns the vague "is our data stale?" worry into a real, evidenced stale-list, catches up the genuinely-behind crons, and root-causes the two chronic flappers so we don't build a freshness system on top of a lying-green baseline.

**Model:** Opus · **Repo:** brain-platform · **Wave:** 0 (solo, no deps) · **Depends:** —

**Goal:** Produce a current-state freshness table for all 48 pipelines, catch up the behind ones, and root-cause the 2 flappers — so the new freshness layer starts from a known-true baseline and the board's first paint is honest.

**Why this is first:** The trigger for this whole project was `/charts` reading "as of April 2026." §0 confirmed that's Zillow ZHVI vendor lag (prior-month publish, 35-day TTL), not a broken cron — but we only *know* that for ZHVI. Before promising "fresh everywhere," establish which pipelines are vendor-lagged-but-fine vs. actually-behind vs. broken.

---

## Files

- **Run/read:** `ingest/scripts/check_freshness.py` (824 lines; classifies FRESH/STALE/MISSING by age vs `cadence_days × tolerance_multiplier`, plus `odd_window` WAITING/OVERDUE and LOW_VOLUME; writes a Markdown summary to `$GITHUB_STEP_SUMMARY`, else stdout under `--dry-run`; **always exits 0** — observability, non-gating).
- **Read:** `ingest/cadence_registry.yaml` (the 48-pipeline spine), `docs/cron-rebuild-failures.md` (incident ledger — FRED 429, missing-table crashes, lockfile drift, missing env), the latest `freshness-probe-daily.yml` Actions run summary.
- **Write (artifact, not committed code):** `docs/superpowers/plans/2026-06-15-daily-freshness-system/_audit-state.md` — the current-state table (commit this as the evidence trail).

---

## Steps

- [ ] **Step 1: Capture the live freshness classification.**

```bash
# Local dry-run prints the same Markdown the daily probe writes to the Actions summary.
python -m ingest.scripts.check_freshness --dry-run > /tmp/freshness.md 2>&1 || true
# check_freshness ALWAYS exits 0; the `|| true` is belt-and-suspenders. Read it:
sed -n '1,200p' /tmp/freshness.md
```
Expected: a per-pipeline table with status FRESH / STALE / MISSING / WAITING / LOW_VOLUME, last-load timestamp, and the cadence threshold each was judged against. If the local DB connection fails (creds in `.dlt/secrets.toml`), fall back to reading the latest **Actions → "Pipeline freshness probe (daily)"** run's Job Summary instead.

- [ ] **Step 2: Classify every STALE/MISSING into one of three buckets.** For each non-FRESH row, decide and record the bucket in `_audit-state.md`:
  - **vendor-lagged-but-fine** — the source genuinely hasn't published a newer file (e.g. ZHVI prior-month, BLS OEWS annual "Next release ~Apr 2027", FRED monthly). Cite the publisher cadence from `cadence_registry.yaml`'s `cadence_days` + the §0 ZHVI precedent. **No action — this is correct behavior.**
  - **actually-behind** — the vendor HAS a newer file but our cron hasn't run/landed it. → catch up in Step 3.
  - **broken-cron** — the workflow is erroring (not just stale). → triage in Step 4.

```bash
# Cross-check a suspected "behind" pipeline against its workflow's recent runs:
gh run list --workflow=<name>.yml --limit 5
# Green runs + stale data => vendor-lagged. Red/failed runs => broken-cron.
```

- [ ] **Step 3: Catch up the genuinely-behind crons.** Every scheduled workflow has `workflow_dispatch` (verified 59/59 in §0), so a manual run is always available:

```bash
gh workflow run <name>.yml            # e.g. gh workflow run redfin-monthly.yml
# For one with inputs (most carry dry_run):
gh workflow run <name>.yml -f dry_run=false
gh run watch                          # confirm it lands rows
```
Expected: the workflow completes green and `check_freshness` re-run shows the row flip to FRESH. **Do NOT** `--force` the daily-rebuild GHA (S3 leaves fail — see memory `gha-rebuild-mechanics`); if egress drops, build locally instead.

- [ ] **Step 4: Triage the two chronic flappers — root-cause, do not trust-green.** The kickoff flags `daily-rebuild` (10×) and `freshness-probe-daily` (4×) as auto-resolving-but-untriaged.

```bash
gh run list --workflow=daily-rebuild.yml --limit 15 --json conclusion,createdAt,displayTitle
gh run list --workflow=freshness-probe-daily.yml --limit 10 --json conclusion,createdAt,displayTitle
# For each failure, open the failing step log:
gh run view <run-id> --log-failed
```
Match each failure signature against `docs/cron-rebuild-failures.md`'s "Recurring Patterns": **FRED 429** (rate limit — transient, exit 2), **missing-table crash** (a brain reads a not-yet-created table), **lockfile drift** (`bun install --frozen-lockfile` fails in <1s), **missing env** (a secret not in the workflow's `env:` block), or a **flaky test** (non-deterministic — independent of the diff; measure the rate, don't blame the commit). Record the root cause per flapper in `_audit-state.md`. Recall: `daily-rebuild` runs `bun refinery/cli.mts $PACK $FORCE_FLAG --resilient` behind a `rebuild_due.py` gate, and deterministic failures now fail **loud** (exit 1) per the silent-master-freeze kill — so a green-but-stale master is itself a triage signal.

- [ ] **Step 5: Seed the board's initial coverage state.** Produce the row set file 06 will render: every pipeline + its bucket from Step 2 + whether it's a `daily_truth` candidate. Write it into `_audit-state.md` as a table the ops board can mirror (cadence · grain · status · root-cause-if-flapping).

- [ ] **Step 6: Commit the evidence trail.**

```bash
git add docs/superpowers/plans/2026-06-15-daily-freshness-system/_audit-state.md
git add SESSION_LOG.md   # top-of-file entry: "audit: freshness baseline — N behind caught up, 2 flappers root-caused"
node scripts/safe-push.mjs
```

---

## Definition of Done

- `_audit-state.md` holds a current-state table for all 48 pipelines, each tagged vendor-lagged-but-fine / actually-behind / broken-cron.
- Every **actually-behind** pipeline has been caught up (`gh workflow run`) and re-verified FRESH.
- Both flappers have a **named root cause** recorded (FRED 429 / missing-table / lockfile / missing-env / flaky), not a "it went green again."
- Board coverage is seeded (the row set for file 06).
- **Board row:** `00-audit` is GREEN on `/data-inventory` — baseline established, no unexplained STALE.
