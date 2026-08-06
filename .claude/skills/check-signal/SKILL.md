---
name: check-signal
description: Use before attaching a `--signal` to any check in public.checks, or when deciding whether a check CAN be auto-verified. The trap catalog for signals that pass while the feature is broken. Read this any time you write a signal — a false pass never self-heals.
---

# Writing a check signal that cannot lie

## The asymmetry that makes this dangerous

`scripts/reverify-signals.mjs` reopens a closed check only when its signal **FAILS**.
So a signal that is too loose — one that wrongly closes a check — returns `ok:true`
**forever**. Nothing re-checks it. Nothing catches it.

**A false pass never self-heals. A false fail is merely annoying.**
When in doubt, write the stricter signal or write none at all.

A check you cannot verify gets a `--due`, not a close.

## The five types, and what they cannot express

`http_ok {url}` · `http_body {url,contains}` · **`http_body_absent {url,absent,requires}`** ·
`db_row_exists {table,filter}` · `db_fresh {table,column,max_age_days}`

(`workflow_success` is recognized-but-unimplemented — `scripts/lib/check-signals.mjs`
returns `ok:false` unconditionally, so attaching it makes a check permanently un-closeable.
**Never attach it.** A cron/pipeline check gets a `--due` or a `db_fresh` on what the run
writes, never `workflow_success`.)

**`http_body_absent` is the leak detector, and it is the most under-used type.** It is the
only one that can assert a string is GONE from served output — the whole "raw internal token
/ banned phrase / internal build-state wording leaked into the payload" family, which is
otherwise structurally un-signalable. `requires` is mandatory and is the reason it is safe:
absence is the dangerous direction, so the signal demands a proof-of-life phrase that only
the real working surface emits. Without it, a 500, a soft-404 served at 200, an empty body,
or a redirect stub all "do not contain" the leaked string and would report the leak fixed
forever. (Corrected 08/06/2026 — this section previously listed four types and said absence
was inexpressible. The code at `scripts/lib/check-signals.mjs:145` had implemented it; a
session read the doc instead of the code and nearly skipped the largest signalable family.
`SIGNAL_TYPES` in that file is the authority, not this list.)

They **cannot** express, and no cleverness will make them:

- **Column-to-column comparison** (`listed_date != first_seen`). Every PostgREST filter
  compares a column to a literal. Materialize it as a generated column or a view instead.
- **"Count is zero" in the database** — `db_row_exists` only proves presence, and there is
  no `db_row_absent`. (Absence is expressible over HTTP, not over PostgREST.)
- **Before/after state** ("`refined_at` advanced past a source landing time"). All five
  types are single-shot point-in-time reads.
- **Rendering or internal consistency** ("the stated direction matches the plotted line").
  The actual failure — caption says rising, line is flat — leaves both strings present and
  a `contains` green.

If the check needs one of these, the honest answer is NOT_CLOSEABLE with the reason.

## The trap catalog — every one of these was caught live, before it shipped

**Static text proves nothing about behavior.** `homepage_one_bar` is named "one WORKING
bar, no theater". The proposed `contains: "Pick what comes out:"` is static JSX — a hero
with a dead submit handler renders that string perfectly. Assert on something only a
working code path can emit.

**Soft-404s return HTTP 200.** `/z/*` and `/r/should-i-sell/*` render "Outside our
coverage" at 200. Any `http_ok` on those route families is worthless. Use `http_body`,
and **negative-test it** against a known-bad input (`/z/00000` → 0 hits).

**Inverted freshness.** `incremental_ingest` — a `db_fresh` reads *greenest at the moment
the bug is worst*: a poisoned cursor stamps the newest row today while stranding the entire
backlog. Freshness of the newest row is not coverage of the set.

**The already-satisfied trap.** `hendry_first_sweep_land` — 1,127 rows already matched the
proposed filter, and a sibling check had already closed on the identical one. Any row-count
signal passes the instant it is attached, verifying a condition that was true *before the
check was written*. Its real remaining work (retiring 298 superseded rows) was provably
undone. **Always ask: was this already true yesterday?**

**Flagship-unbuilt.** `insiders_edition` — "Issue 001 · in production" is hardcoded at
`app/insiders/page.tsx`. The page's live desk data made a signal look easy and would have
closed an unshipped deliverable.

**The check's own detail overclaims.** `briefcase_examples`' detail says "smoke passed
07/22/2026", but `scripts/smoke-prod.mts` asserts only HTTP 200 on 2 of 4 URLs and verifies
nothing about cited content or freshness. **A stamped detail is a claim, not evidence.**

**The fallback that satisfies the threshold.** When picking a `db_row_exists` filter, close
the path where a *fallback* value would itself pass. `homes_only_sold_median_live_verify`
needed `county_fallback=is.false` — without it the county median ($355,298) satisfied the
`median_sale=gt.300000` threshold, and the signal would pass while the homes-only filter
was regressed.

## The checklist — run all six before attaching

1. **Polarity.** Name the exact regression this catches. If the feature broke tomorrow,
   *how* would this signal go red? If you can't answer, it isn't a signal.
2. **Already-true?** Would it pass right now, before any work? Then it verifies nothing.
3. **Negative test.** Run it against a known-bad input and confirm **0 hits**.
4. **Fallback path.** Could an error body, a soft-404, a mock, or a county-level fallback
   satisfy it? Close that path in the filter.
5. **Behavior, not text.** Could this pass with a dead handler or unbuilt feature behind it?
6. **Served bytes.** Are you asserting against production, not a local diff? A code fix is
   not live until the thing serving it rebuilds.

## Shape

```bash
node scripts/check.mjs update <key> --signal '{"type":"http_body","url":"https://www.swfldatagulf.com/api/b/<brain>?view=speak&tier=2","contains":"<phrase only live output has>"}'
```

Absence form — `requires` is not optional and is not decoration:

```bash
node scripts/check.mjs update <key> --signal '{"type":"http_body_absent","url":"https://www.swfldatagulf.com/r/<page>","absent":"<the banned string>","requires":"<phrase only the real working page emits>"}'
```

Then `node scripts/check-sweep.mjs --dry-run` to confirm it evaluates before you trust it.
A signal that never evaluates reports as `signal-broken (unevaluated)`, not as a pass.
