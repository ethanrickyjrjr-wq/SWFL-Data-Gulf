# Rebuild a leaf brain when its ingest lands fresher than its last build

**Date:** 2026-07-18
**Check:** `leaf_ingest_freshness_live_verify`
**Status:** spec — awaiting implementation

## Problem

Master already re-synthesizes the moment any upstream brain moves: `masterIsStaleVsUpstreams`
(`refinery/lib/resilient-build.mts:184`) compares master's `refined_at` to every upstream brain's
`refined_at`, and `refinery/cli.mts:373-388` uses it to override a `skipped-fresh` decision.

Leaf brains have no equivalent. The only gate a leaf hits is `brainStatus()`
(`refinery/lib/dag.mts:130`), which reports fresh/stale off the leaf's **own** TTL (plus the
`packCodeChanged` override). A leaf whose Tier-1 data landed this morning but whose TTL has not
expired is reported `fresh` and gets `skipped-fresh` in the CLI's skip branches
(`refinery/cli.mts:286` and `:304`).

Consequence chain (the live defect): `seller-stress-swfl` served the "Mar 2026" period while its
Redfin sources landed on 07/15. The nightly rebuild ran, but skipped the leaf as TTL-fresh, so its
`refined_at` never advanced — which also meant the master trigger never saw it move, so master kept
consuming the stale leaf too. The only thing that fixed it was a **manual** paid re-dispatch. This
happens repeatedly (the tripwire showed five decreed manual re-dispatches in a single day), each one
a hand-triggered paid rebuild the nightly should have done itself.

The chain-level gate is NOT the gap. `ingest/scripts/rebuild_due.py` already reads every source's
last-ingest timestamp (reusing `check_freshness.py`) and fires the cascade when any source is newer
than the oldest brain. The gap is one level down: that per-source knowledge dies at the workflow
boundary and never reaches the per-leaf skip decision inside `cli.mts`.

## Goal

On the nightly rebuild, a leaf brain rebuilds when any of its own ingest sources landed data **after
the leaf's last build** — instead of being skipped as TTL-fresh. Only the leaves whose data actually
moved rebuild; never the full 32-brain `--force` cascade. No new Supabase egress, no new bulk-row
reads, no surprise spend.

## Non-goals

- Not touching ingest (already incremental/merge where the source allows; full-snapshot only where
  the vendor publishes snapshots).
- Not making synthesis "incremental" — a brain is a re-derived conclusion (a median/direction/
  narrative over its window), not an append-only table. There is no delta to add to a median.
- Not the aggregate-at-source / row-haul egress audit — that is a **separate** concern tracked under
  its own check (see "Adjacent, out of scope" below).

## What we're building

Three additive pieces. No pack-type change, no registry-schema change, no brain backfill.

### 1. Signal source — the freshness map (zero added egress)

`rebuild_due.py` already opens a Postgres connection at rebuild preflight (`daily-rebuild.yml:73-86`,
`DESTINATION__POSTGRES__CREDENTIALS`) and computes each source's landing time via
`check_freshness.check_tier1_entry` / `check_tier2_entry`. Extend it — **additively** — to also emit a
small local JSON map the CLI can read in the same job:

```
brains/_ingest-freshness.json
{
  "seller-stress-swfl": "2026-07-15T04:22:07Z",
  "licenses-swfl":      "2026-07-08T02:10:44Z",
  ...
}
```

- **Key** = the cadence entry's `consuming_pack` (already populated in
  `ingest/cadence_registry.yaml`, e.g. `:306`). A pack with three source pipelines (seller-stress has
  price_drops + contract_cancellations + delistings_relistings, each carrying
  `consuming_pack: seller-stress-swfl`) collapses to the **max** landing time across those entries —
  the leaf is behind if *any* one source moved.
- **Value** = the **full ISO timestamp** of the latest landing, NOT the date-truncated `last_run` the
  probe uses today. This is the one correctness fix that matters (see §4). Surface the raw
  `updated_at` / `inserted_at` timestamp additively alongside the existing date field so the probe's
  own behavior is unchanged.
- `consuming_pack` may be a scalar or a list; entries without it are simply absent from the map (that
  pack keeps today's TTL-only behavior — safe, and naturally opt-in).
- **Egress:** none added. This is the exact query `rebuild_due.py` already runs; we persist its
  result to a local file instead of discarding it. The one SQL root stays in the Python probe — the
  TS side never queries the lake for freshness.
- **Git hygiene:** the map is a transient run artifact. Write it to `brains/_ingest-freshness.json`
  and add that exact path to `.gitignore` so the rebuild's `git add brains/` step (`:171`) never
  stages it, and `rebuild_due.py`'s `brains/*.md` glob never sees it.

### 2. The pure trigger

Mirror `masterIsStaleVsUpstreams` in `refinery/lib/resilient-build.mts`:

```ts
/** True iff any of this leaf's ingest sources landed data STRICTLY AFTER the leaf's
 *  last synthesis. Mirrors masterIsStaleVsUpstreams for the leaf↔ingest edge.
 *  Equal timestamps are NOT stale; an unparseable landing time is ignored
 *  (NaN comparison is false) so junk never forces a spurious rebuild. */
export function leafIsStaleVsIngest(
  leafRefinedAt: string,
  sourceLandedAts: readonly string[],
): boolean {
  const refinedMs = Date.parse(leafRefinedAt);
  return sourceLandedAts.some((ts) => Date.parse(ts) > refinedMs);
}
```

Unit-tested directly in `resilient-build.test.mts`: fresh, stale, equal-timestamp, NaN/garbage,
empty-array cases.

### 3. CLI wiring

In `refinery/cli.mts`, load `brains/_ingest-freshness.json` once at run start (missing/unreadable →
empty map). In each leaf skip branch (`:286` upstream-fresh, `:304` target-fresh), before emitting
`skipped-fresh`:

```ts
const landed = ingestFreshness[id];               // full ISO timestamp, or undefined
if (status.kind === "fresh" && !force
    && !(landed && leafIsStaleVsIngest(status.refined_at, [landed]))) {
  // skip as before
} else if (landed && leafIsStaleVsIngest(status.refined_at, [landed])) {
  console.log(`[cli] ${id}: TTL-fresh but ingest landed ${landed} after last build — rebuilding (ingest-aware trigger).`);
  // fall through to buildOne
}
```

This adds a **third** staleness reason alongside TTL-expiry and `packCodeChanged` — the same shape
`dag.mts:159-160` already established for "code changed beats the TTL." When the map is absent or a
leaf isn't in it, behavior is identical to today (the trigger is a pure no-op).

## The clearing invariant (the anti-storm rule — read this)

- Compare the source landing time to the leaf's **`refined_at` (build time)** — **never** to the data
  *period* it serves. `seller-stress` pins "Mar 2026"; comparing landing against the period would
  re-fire every single night forever. That is the automated version of the exact thrash we're trying
  to kill.
- A successful rebuild MUST advance `refined_at` past the landing time (it stamps `now`), so the
  trigger **clears** on the next run. This is what makes it fire once per landing, not nightly.
- Strict `>` on millisecond timestamps. Same-run and same-instant are not stale.

## Spend

- Only leaves whose source actually moved rebuild — never the banned 32-brain `--force` cascade.
- The triggered rebuild runs inside the existing nightly, behind the existing `$1`/run + daily-ceiling
  preflight (`INGEST_DAILY_CEILING_USD`, `ingest/CLAUDE.md`). A bad `updated_at` cannot loop because
  the clearing invariant (above) makes each landing fire exactly once; the ceiling is the backstop.
- Net effect is **less** spend: it deletes the manual re-dispatch tax (each a hand-triggered paid
  Sonnet run) by making the nightly do the rebuild it should already have done.

## Egress

- The trigger reads one local JSON (zero egress).
- The map is produced by a query `rebuild_due.py` already runs (zero added egress).
- It also *aligns* a leaf's source read to when the data actually changes: `seller-stress` today
  re-reads its Redfin parquet on every TTL cycle regardless of whether Redfin published; the trigger
  ties the read to actual landings (~monthly). Fewer reads, not more.

## Adjacent, out of scope (its own check)

`seller-stress-swfl` reads its source with a full parquet scan and aggregates in TypeScript
(`refinery/sources/stress-price-drops-source.mts:34` — `SELECT ... FROM drops_view ORDER BY ...`,
all periods) rather than aggregating at source. That is a real read-shape optimization, but it is a
small pre-aggregated columnar file in our own lake storage, not the Postgres row-haul that drives the
Supabase bill. The genuine egress target is the set of brains doing `selectAllPaged` against
`data_lake.*` Postgres tables. Track as a separate egress-audit check; do not fold into this trigger.

## Files touched

- `ingest/scripts/rebuild_due.py` — emit `brains/_ingest-freshness.json` (full timestamps, keyed by
  `consuming_pack`). Additive; the exit-code gate behavior is unchanged.
- `ingest/scripts/check_freshness.py` — surface the raw landing timestamp additively (the emitter
  needs the non-truncated value). Probe output unchanged.
- `refinery/lib/resilient-build.mts` — add `leafIsStaleVsIngest`.
- `refinery/lib/resilient-build.test.mts` — unit tests for the pure fn.
- `refinery/cli.mts` — load the map; wire the trigger into the two leaf skip branches.
- `.gitignore` — add `brains/_ingest-freshness.json`.
- Python test alongside `rebuild_due` / `check_freshness` tests — assert the emitter writes full
  timestamps keyed by `consuming_pack`, and that a pack with multiple sources collapses to the max.

No change to `refinery/types/pack.mts`, `ingest/cadence_registry.yaml` schema, or any brain `.md`.

## Rollout

Ship the mechanism whole. It activates automatically for every pack the registry already maps via
`consuming_pack` (seller-stress-swfl among them) — no per-pack opt-in step, because the mapping data
already exists. Verify live on `seller-stress-swfl` first: confirm it rebuilds when a source landing
post-dates its `refined_at`, and that `refined_at` advances so the trigger clears on the next run.

## Testing / verification

1. Unit: `leafIsStaleVsIngest` (all cases) — `bun test refinery/lib/resilient-build.test.mts`.
2. Unit: emitter writes full-timestamp map keyed by `consuming_pack`, multi-source → max.
3. Dry-run: `python ingest/scripts/rebuild_due.py --explain` still exits 0 and now also writes the map.
4. Live verify (closes the check): dispatch a rebuild with `seller-stress-swfl`'s source landing newer
   than its `refined_at`; confirm the CLI logs the ingest-aware trigger, the leaf rebuilds, and the
   served period advances. Verify served bytes, not just the diff (a code fix is not live until the
   brain rebuilds).
