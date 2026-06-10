# J5 — Operator manual triggers: crexi + lee_associates (OPERATOR, no Claude code)

> **Preamble:** This card is run by the **operator** in the GitHub UI + one cadence edit. No pack
> or pipeline code. Still: top-of-file `SESSION_LOG.md` entry on the push that lands the cadence
> edit; `node scripts/safe-push.mjs`.

**Phase:** any · **Depends on:** nothing · **Parallel:** independent, BUT the cadence edit shares
`ingest/cadence_registry.yaml` with **J3** — whoever pushes second must `safe-push` (rebase),
never force. Both entries are currently parked under `probe_mode: odd_window`.
**Model: ⚪ OPERATOR** — GitHub UI + one cadence-file edit; no Claude code.

## crexi_listings → `data_lake.active_listings_cre`
1. GitHub → Actions → **`ingest-crexi-listings`** → Run workflow, `dry_run: true`, no corridor filter.
2. Confirm the Firecrawl agent returns rows; then re-run `dry_run: false`.
3. Verify: `SELECT count(*), city FROM data_lake.active_listings_cre GROUP BY city;`
4. In `ingest/cadence_registry.yaml`, remove `probe_mode: odd_window` from the `crexi_listings`
   entry (it stays in the ODD block until its first green live run).

## lee_associates_swfl
1. GitHub → Actions → **`ingest-lee-associates-swfl`** → `year: 2026`, `quarter: 1`, `dry_run: true`.
2. Confirm ~20 rows matching known values (Office **6.05%** vac / **$27.74** NNN, etc.).
3. Re-run `dry_run: false`.
4. In `ingest/cadence_registry.yaml`, remove `probe_mode: odd_window` from `lee_associates_swfl`.

## Acceptance
- Both tables show live rows; both cadence entries no longer carry `probe_mode: odd_window`.
- The freshness probe stops flagging them as ODD-parked (ops dashboard reflects within ~5 min).

## Note — the consumer for these rows already exists
`active_listings_cre` and the Estero/FMB `local_cre_context` are already wired into `cre-swfl`
(committed `765d688`/`557edf0`-era; caveats at `cre-swfl.mts:1721`, listings stash `:583`). So
these are **data activations, not brain builds** — no pack work here.
