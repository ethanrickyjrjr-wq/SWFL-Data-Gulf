# BATHS BACKFILL — CENTERING FIX SHIPPED, NEEDS A BIGGER RUN. FACTS + ONE COMMAND, NOT A PLAN DOC.

**Date:** 08/05/2026 · **Status: fix committed + pushed (`e8ebfa49`, live on origin/main). Only a
15-call canary has run. The real per-call rate is unmeasured — that's the job here.**

**Root:** `data_lake.listing_state.baths` — LANE 2 in `docs/standards/data-roots.md` ("the free
bath count," 🟢, nightly `enrich_baths_batched` lat/lon-clustered batch). This is the one-shot
backfill for that same root. Do not create a second root or a second script.

**Read the file before running anything — the docstring is the record of what's proven and what
isn't:** `ingest/pipelines/listing_lifecycle/backfill_baths.py`.

---

## 0 — WHAT WAS WRONG, WHAT CHANGED (don't re-derive)

The prior shape centered `/nearby-home-values` calls on GRID CELLS. Measured live: only ~9 of the
100 properties any call returns were ever our own NULL-baths rows; yield decayed 5.9 → 0.6
baths/call over 2,600 calls because it kept re-walking cells it had already exhausted, and the
`radius` param is a proven-dead knob (0.25mi/0.5mi/1mi/2mi returned identical results).

Fixed: center each call on a REMAINING TARGET's own lat/lon instead. This does **not** guarantee
that target comes back in its own response — measured live, a canary target's own property_id was
absent 0/100 times it was checked directly. The real mechanism is narrower and was corrected in
the docstring: a call centered on a live target never re-walks ground that's already exhausted,
unlike a grid cell that might now be empty. Yield is still density-dependent and bursty.

Also fixed same session: `load_null_baths_targets()` had no `ORDER BY`, so a low self-hit rate
(~7% on the canary) would have gotten a bounded `--limit` run stuck re-probing the same
non-resolving front of the list forever. Added `ORDER BY random()` (subquery-wrapped — Postgres
rejects it directly on `SELECT DISTINCT`), verified live to reshuffle across calls.

## 1 — THE CANARY, EXACT NUMBERS (n=15, too small to trust as a rate)

Dry-run before: 12,451 targets. Live run, `--limit 15 --max-calls 20`: **11 filled**. DB recount
after confirmed it, not just the script's own print: 12,451 → 12,440. 10 of the 15 calls
individually filled nothing; all 11 fills landed from a single dense-pocket call. That skew is
exactly why n=15 isn't a rate yet — it's one data point that a lucky call can dominate.

## 2 — THE JOB: RUN A REAL SAMPLE, REPORT THE RATE

```
export PHOTOS_API=$(grep '^PHOTOS_API=' .env.local | cut -d'=' -f2-)
ingest/.venv/Scripts/python.exe -m ingest.pipelines.listing_lifecycle.backfill_baths --limit 200 --max-calls 220
```

~200 calls at 1 req/s ≈ 3-4 minutes, ~0.4% of the 50k/mo SteadyAPI quota. Report baths-filled ÷
calls-made as the real rate, not the canary's 11/15 (0.73, inflated by one call).

**Stop conditions, same standard the operator already gave once — don't relitigate it:**
- If the sample yields a real, non-trivial rate (even much lower than 0.73/call) — good, that's a
  working method; scale up in further chunks (`--limit 2000`, matching `backfill_listed_date.py`'s
  chunk size) rather than one giant run.
- If a genuinely larger sample (~200 calls) still returns close to nothing (call it <0.05/call,
  i.e. fewer than ~10 fills in 200 calls) — STOP. Don't keep spending quota chasing it. Call
  `/advisor` with the measured numbers before trying anything else; do not invent a sixth theory
  from memory.

## 3 — TWO THINGS STILL OPEN, NAMED SO THEY DON'T GET RE-DISCOVERED COLD

1. **Density dependence is unexplained.** We know per-call yield is bursty (one call can net 11)
   but don't know WHY some targets sit in dense pockets and others don't, or whether the random
   ordering evens this out over many runs or just redistributes the same problem. If the ~200-call
   sample is still this bursty, that's worth a real look before scaling further.
2. **Genuinely-unfillable rows.** Some fraction of the 12,440 may have NO baths value anywhere in
   SteadyAPI's own data for that exact property (not a query-shape problem, a vendor-ceiling one).
   Those will re-probe forever under the current design (same accepted tradeoff
   `backfill_listed_date.py` makes for its `no_list_date` rows). Not urgent — no action needed
   unless the measured rate looks suspiciously flat across chunks, which would be the signal that
   we're mostly re-hitting the unfillable set instead of making progress.

## 4 — SESSION HYGIENE NOTE, UNRELATED TO BATHS

This session's `git push` (via `scripts/safe-push.mjs`) popped an old stash that turned out to
belong to a DIFFERENT live parallel session (`a5c415a4...`), dumping its uncommitted
`lib/deliverable/*` + `docs/standards/email-build-playbook.md` edits into the working tree as
unstaged changes. Left untouched deliberately — not part of this backfill's scope, and not safe to
guess at reconciling from here. If you're picking this handoff up and `git status` still shows
those files dirty, that's not baths-related drift; coordinate with whichever session owns them
before touching them.
