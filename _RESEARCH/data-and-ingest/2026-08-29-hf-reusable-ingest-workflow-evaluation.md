# HF "one root: reusable ingest workflow" proposal — evaluated 08/29/2026

Source handed in: `~/Downloads/swfl-reusable-ingest.md` (Hugging Face chat output, not vendor docs).
Vendor doc crawled (crawl4ai, 08/29/2026):
https://docs.github.com/en/actions/how-tos/sharing-automations/reuse-workflows

## Verdict: the ROOT already exists and is 6-of-64 wired. Do not build a second one.

Measured 08/29/2026 on main (`.github/workflows/`, 111 files):
- 64 workflows run `pip install -r ingest/requirements.txt` inline.
- 6 use `.github/actions/setup-ingest-python` (built 07/25/2026 for exactly this: cached venv,
  6 named failure modes in its header). 58 callers never repointed — "built, not wired."
- 8 already use `workflow_call` (nightly-chain and its children).
- 87 carry the `ENGINE_ENABLED` gate; heartbeats use `secrets.HEALTHCHECKS_PING_KEY` (4 sites).

## Verbatim errors in the HF draft (would ship broken)
1. `secrets: inherit` placed inside the callee's `on.workflow_call` block. Vendor doc: `inherit`
   is the CALLER's `jobs.<id>.secrets` value; the callee's `on.workflow_call.secrets` is a map
   of named secrets. File does not parse as written.
2. Default `python-version: "3.12"` — every ingest workflow pins 3.13, and the composite action's
   cache key hashes the RESOLVED version, so 3.12 would miss the venv cache every run.
3. Env injection `DATABASE_URL` — our pipelines read `DESTINATION__POSTGRES__CREDENTIALS` (dlt),
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. None injected → every migrated pipeline dies on creds.
4. Module root: HF runs `python -m pipelines.bls_laus.pipeline` from `workdir: ingest`; ours is
   `python -m ingest.pipelines.bls_laus.pipeline` from repo root. Different import root.
5. Heartbeat secret `HEALTHCHECKS_UUID` — ours is `HEALTHCHECKS_PING_KEY`.
6. Drops `bls-laus-monthly`'s `dry_run` dispatch input.
7. Unquoted `ARGS+=($EXTRA_ARGS)` word-splits.
HF's cron "0 14 25 * *" also rewrites ours ("0 13 25 * *") while claiming to preserve it.

## Structural read
- Postmortem `docs/standards/new-project-playbook.md` §4.7: consolidating 12 crons behind one
  `workflow_call` parent froze data 3 days when the parent was disabled at the API. A reusable
  root is a DIFFERENT shape — the cron stays in each caller, runs list under the caller — so the
  run-history blind spot does not recur. Blast radius that DOES: one bad edit to the root breaks
  ~60 pipelines in one push. Detector: `freshness-probe-daily.yml` (output timestamps), which
  §4.7 already mandates.
- The setup step is already one root (the composite action). What a reusable workflow would add
  on top: the checkout/gate/heartbeat/timeout boilerplate. That is ~10 lines per file; the 50s
  pip install the composite action removes is the part with a measured cost.

## Recommendation
Wire the existing composite action into the 58 unwired callers (mechanical: replace
setup-python + pip-install with `uses: ./.github/actions/setup-ingest-python`). Revisit a
reusable root only if the boilerplate itself starts drifting (e.g. the ENGINE_ENABLED gate
gets edited in one file and not the others) — that is the failure a root prevents, and it has
not happened yet. NORTH STAR #5 (adopt nothing new until 09/18/2026) is not violated by either;
neither is a new tool.
