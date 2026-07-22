# HANDOFF — burn down the checks ledger

**Written 07/22/2026.** For a fresh session. Everything below was measured live, not estimated.
Re-measure before acting; these numbers move.

## Read this first: the ledger is not broken, it is unfinished

Measured 07/22/2026 against `public.checks`:

- **649 open.** 13 overdue. 71 older than 30 days. **Zero older than 60 days.** Oldest open:
  05/31/2026. This is not a rotting backlog — it is a young one that has never been reconciled.
- **All 649 are `resolution='manual'`.**
- **641 of 649 carry no `signal`.** Only 8 have one.

That last number is the whole problem. `scripts/lib/check-signals.mjs` already implements
auto-verification — `SIGNAL_TYPES` are `http_ok`, `http_body`, `db_row_exists`, `db_fresh`,
`table_fresh`, `workflow_success` — and `scripts/check.mjs` runs them. Eight checks use it. The
other 641 can only be closed by a human deciding they are done, so the ledger grows monotonically
by construction.

**Do not start by closing things. Start by making things closeable.**

## Where the 649 sit

By class and project, largest first: `verify` brain-platform 85 · `task` brain-platform 80 ·
`defect` brain-platform 75 · `defect` site-audit-0718 74 · **untriaged** brain-platform 66 ·
`idea` brain-platform 39 · `task` ingest 21 · `task` email 14 · `task` marketing 12 ·
`task` site-audit-0718 10 · `task` cre-swfl 8 (7 of them stale >30d) · `defect` ingest 8 · then a
long tail under 6 each.

## The four moves, in order

**1. Backfill signals on the 85 `verify` checks. Biggest single win.**
These are the `<slug>_live_verify` checks that `scripts/new-build.mjs` opens for every registered
build. They are definitionally machine-verifiable — "is this live?" The 8 that already work all use
the same shape:

    {"type":"http_body","url":"https://www.swfldatagulf.com/api/b/<brain>?view=speak&tier=2","contains":"<phrase only the live output has>"}

For each `verify` check, find the surface it verifies, pick a string that appears ONLY when the
thing actually shipped, and PATCH it onto `checks.signal`. Then `node scripts/check.mjs list`
resolves them without a human. Expect a large fraction to close on the first run — several are
almost certainly already satisfied and nobody looked.

Pick the `contains` string carefully. A phrase that also appears in a fallback or an error body
makes a check that passes while the feature is broken, which is worse than a manual check.

**2. Triage the 66 `(untriaged)`.** No `class`, so they are invisible to any class-based sweep and
they inflate every count. Assign `defect` / `verify` / `task` / `idea`. Mechanical and fast; do it
before anything that groups by class.

**3. Decide what `idea` is doing in an obligations ledger — 39 rows.**
RULE 2 says open obligations live in `checks`. An idea is not an obligation. Either move them to
`_AUDIT_AND_ROADMAP/build-queue.md` and close them with a `drop_reason`, or accept they are
permanent noise in the session banner. **This is Ricky's call, not yours — ask, do not sweep.**

**4. The 74 `site-audit-0718` defects are one batch, not 74 decisions.**
Zero are stale; they landed together from a single site audit. Read a sample of 10, work out how
many are still true against current `main`, and propose ONE disposition for the batch. Auditing
them one at a time is how this ledger got here.

## Hard rules while you do this

- **Never mass-close.** A closed check claims work is done. Closing 74 rows you did not verify
  converts a visible backlog into an invisible lie — strictly worse than 649 open.
- **`public.checks` is prod evidence, not dev attestation.** Verify against served bytes, not the
  diff. A code fix is not live until the thing that serves it rebuilds.
- **Every close needs a note** naming what proved it — a URL, a query, a run:
  `node scripts/check.mjs close <key> "<note>"`.
- **A check you cannot verify gets a signal or a `--due`, not a close.**
- Ask Ricky before any bulk disposition. He has been explicit that core-vs-parked is his call.

## Related: 72 new checks landed today, deliberately

`scripts/ceilings-to-checks.mjs` (written 07/22/2026) walks every `source_scope.source_ceiling` in
`ingest/cadence_registry.yaml` and opens one check per pipeline holding data we censused but never
pulled. **72 existed and none had ever been surfaced.** So the open count went UP today, on
purpose — 72 pieces of known-but-invisible data becoming visible, including LeePA layer 23
("Comparable Sales" — beds, baths, year built, geometry, 108,881 rows) and FDOT, where our own
registry says the vendor runs 1,586 public layers and we use one.

Those 72 are `class='task'`, key prefix `ceiling_`. They are NOT the same debt as the other 649 and
burn down separately — by pulling the data, or by Ricky explicitly declining a pull. Re-run the
script any time; it is idempotent and never auto-closes.

## Why this backlog exists at all

Same root cause as the ceilings: we build the recording half of a mechanism and never the acting
half. `checks` records obligations perfectly and has almost no way to discharge one automatically.
The fix is signals, not discipline. Anything closed by hand today comes back as a new manual check
tomorrow unless that class of check gets a machine verifier.
