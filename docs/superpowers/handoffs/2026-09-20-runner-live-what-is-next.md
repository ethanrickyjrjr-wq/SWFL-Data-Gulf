# Fedora runner is live — state and what is next (09/20/2026, session 2)

Supersedes sections 1–3 of `2026-09-20-backend-week-remainder.md` (section 4 there still stands).
Everything below is on main at `5b010afc` unless it says otherwise.

## State — done and proven

- **Runner:** `fedora-swfl-local`, labels `self-hosted, Linux, X64, swfl-local`, online. On the box:
  `~/actions-runner` (v2.337.0), `systemctl --user status gha-runner.service`, linger on, no sudo.
  Ingest venv `~/swfl-runner-venv` (py 3.12). A venv rebuild needs BOTH `crawl4ai-setup` and
  `python -m patchright install chromium` (runbook 2c) or crexi/collier die on a missing Chromium.
- **`SWFL_LOCAL_RUNNER_READY=true`** (set 06:06Z). `false` sends the three gated workflows back to
  `ubuntu-latest`. dbpr-sirs and crexi are hard-pinned to the runner and are bash now, not pwsh.
- **Proven through Actions:** runner-smoke 35493215223 · dbpr-sirs dry 35493240512 (1389 rows) ·
  crexi dry 35493241730 (29 listings) · collier records dry on Fedora 35494269223 (0 rows for a
  Saturday, exit 0) · storm-history / zhvi-tier1 / zori-tier1 dry runs print the temp-dir line.
- **Fork-PR approval:** `all_external_contributors` (public repo + a runner on a home box).
- **Fixed along the way:** `--dry-run` was a full production write in 4 pipelines · hurdat2 parser vs
  NHC's 09/12 typos · Redfin siblings raise on a renamed column · paid-run token ignored in unattended
  sessions (4 sites) · lint exits 0 · collier records weekend/holiday crash (was red every Sun + Mon) ·
  ingest suite 1662 passed / 0 failed.
- **The one to remember:** the ingest suite loaded PRODUCTION keys at pytest collection and made real
  SteadyAPI calls on every full local run. Guard now sets at `ingest/conftest.py` import. A "no key"
  test that is red only in the full run is a credential leak, not flake.

## Needs Ricky — one command, nothing else

The proof-of-red push hook misses genuine red runs (a JSON-escaped newline glues `n` onto `FAILED`).
Patch + failing test are ready; the harness will not let a session edit its own gate, grant or not:

```
git apply _ASSISTANT/2026-09-20-proof-of-red-jsonl-newline.patch
node --test .claude/hooks/check-proof-of-red-on-push.test.mjs
```

Check: `proof_of_red_hook_jsonl_newline`. Until applied, a pytest red run only registers if its output
is indented (`| sed 's/^/   /'`) or contains `AssertionError`.

Still his from the old handoff: remove the weekly-dep-scan identity from the `main` ruleset bypass list,
and append the never-push paragraph to that routine's prompt.

## Next session — in order

1. **Watch the first scheduled runs on Fedora:** collier records daily 11:37 UTC; crexi Sunday 11:00 UTC;
   dbpr-sirs on the 1st. If the box is off, jobs QUEUE (24h) rather than fail — check
   `gh api repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runners` first when one looks stuck.
2. **LeePA annual workflows were NOT dry-run on Fedora** (90-minute jobs; same venv mechanism collier
   proved). `leepa-parcels-annual` asks for Python 3.13 on cloud but gets the 3.12 venv on Fedora —
   dispatch `leepa-comparable-sales-annual.yml -f dry_run=true` once before its real date.
3. **Windows runner retirement** is moot — it was never re-registered; nothing to remove.
4. **Open checks from this work:** `apify_spend_switch_honors_token_unattended` (5th token site, product
   spend dial — needs his call) · `proof_of_red_hook_jsonl_newline` (above) ·
   `redfin_dom_yoy_unit_days_not_pct` (served-number rename, ask-first).
5. **Section 4 of the old handoff** (DOM unit fix, bls_qcew NULL columns, E1 Lee permits from ArcGIS) is
   untouched. His 09/20 grant ("No more approvals needed. You run the show.") was for this body of
   work; do not assume it carries — see the scratchpad entry.

## Pushing, for whoever is next

Commit and push are SEPARATE commands (the gates read the whole command before the commit runs).
Ingest-source pushes hit Gate 16; Actions runs workflow code from main, so dispatch follows the push:
`ALLOW_NO_DISPATCH=1 OPERATOR_APPROVED_PUSH=1 node scripts/safe-push.mjs`, then dispatch and log the run id.
The word "push" inside a `-m` message trips the publication hook — use `git commit -F <file>`.
