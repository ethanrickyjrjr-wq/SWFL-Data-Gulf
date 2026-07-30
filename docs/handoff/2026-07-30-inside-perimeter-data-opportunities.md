# HANDOFF — data opportunities already inside our perimeter (brain-platform only)

**Date:** 07/30/2026. **Code shipped:** none.
**Supersedes** `2026-07-30-free-corpus-and-patent-source-handoff.md`, which mixed two unrelated
subjects and forwarded two false claims. Split per operator decree 07/30/2026.

**Patents are NOT in this file and are not a brain-platform concern.** That work is its own project:
`C:\Users\ethan\dev\patent-citation-graph\PROJECT-BRIEF.md`. Do not re-import it here.

---

## Read this first — why the prior handoff was wrong

Its "Cheapest real wins" section was **1-for-3**, and every wrong item was inherited text repeated
without opening the code or the registry. Verified 07/30/2026:

**FALSE — "five tested checks in `lib/why-not-selling/checks/` have zero importers."**
`lib/why-not-selling/load-report.ts:29-35` imports all seven checks by name (market-speed,
cumulative-time, price-cuts, price-position, anchor-gap, competition, cross-check).
`app/r/why-isnt-it-selling/page.tsx:10` imports `loadWinsReport`. `load-report.test.ts` exists.
The chain is live. `load-report.ts` landed **07/25/2026**, five days before the handoff claimed the
code was dark. And the origin paragraph
(`_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md` line 344) already
ended with "Already covered by an approved spec + open check `why_isnt_it_selling_live_verify` —
this is execution, not new research." It was never an unclaimed win, even on the day it was written.
The handoff copied the one-line INDEX summary instead of the paragraph it summarized.

**FALSE — "three UNPULLED files in a bucket we already authenticate against."**
`redfin_price_drops`, `redfin_contract_cancellations`, and `redfin_delistings_relistings` are all
live pipelines in `ingest/cadence_registry.yaml:304-352`, each with its own workflow, a staggered
cron on the 15th, and a confirmed first run of 9,955 rows on 06/14/2026. See the real finding below.

**TRUE — `listing_state` columns never snapshotted into `listing_week`.** This one survives; see
opportunity 2.

**Standing rule this sets:** a claim you did not personally verify does not get forwarded as an
actionable item. A doc is trustworthy on what it probed live and untrustworthy on everything it
relayed.

---

## THE REAL FINDING — the cadence registry contradicts itself in one file

`ingest/cadence_registry.yaml:299` — a `source_ceiling.summary` still reads, in part:
"Same bucket/prefix, unpulled: ... contract_cancellations + delistings_relistings monthly ZIP files;
price_drops ZIP file (own pipeline: redfin_price_drops)." as_of 07/16/2026.

But all three of those pipelines are defined **~20 lines below it in the same file**, with first runs
dated 06/14/2026 — a month *before* the `source_ceiling` block claims they are unpulled. The text
even names `redfin_price_drops` as an existing pipeline while listing it as unpulled.

**Why this matters beyond one stale line:** FULL-SCOPE-FIRST treats `source_ceiling` as the authority
on what a source exposes but we haven't taken. A `source_ceiling` that lies sends the next session
chasing data we already ingest — which is exactly what happened here. Nobody re-read it after the
06/14 pipelines landed.

Check opened: `source_ceiling_stale_vs_live_pipelines`.

---

## Opportunities that actually stand

### 1. `listing_week` label coverage — needs YOUR word before anything moves

Live read 07/30/2026: 130,294 rows · 34,204 distinct properties · 4 weeks spanning
06/29/2026–07/20/2026 · **10,479 rows carry labels** · 418 sold events · 3,473 price-cut events.
Relist depth 119,219 at zero / 11,075 at one or more. Cut depth 121,129 at zero / 9,165 at one or
more.

Right-shaped and shallow. Accrues ~32k rows/week for free by not being broken.

**Two things the prior handoff got ahead of itself on, stated honestly here:**

- **"8% labeled" rests on an undefined word.** 418 + 3,473 = 3,891 events, against 10,479 rows
  carrying labels. Those only contradict if *labeled* means "carries an event." If it means "label
  field non-null, including an explicit no-event," the arithmetic says something different and there
  may be no anomaly at all. **Settle what the column means before calling it a gap.**
- **A home for this may already exist.** Open check `challenger_rerun_when_weeks_accumulate` already
  states only two weeks are labeled (06/29–07/06) and gates the challenger rerun on reaching four
  labeled weeks. That is consistent with a shallow label count and may be the whole explanation.

Deliberately NOT opened as a new check — the prior session flagged it to the operator three times
already; a fourth unilateral action is noise. **If green-lit**, start at
`ingest/pipelines/listing_week/builder.py` and `db.py` on the label-fill path, and settle the column
semantics before touching code.

### 2. `listing_state` columns we hold and never snapshot

Verified 07/30/2026: the `listing_week` pipeline does not carry subdivision, brokerage, lat/lon,
`reduced_amount`, or the pending / contingent flags. The only hit for any of these in
`ingest/pipelines/listing_week/` is `coming_soon` at `builder.py:19` — and there it is a status
string inside a `_LIVE` frozenset, not a captured column.

These are features we already own, already pay to maintain, and drop on the floor every week the
panel builds. Cheapest genuine win in this file. Adding them is additive to the weekly snapshot so it
does not disturb existing rows — but it only fills forward, so historical weeks stay bare.

### 3. Not a lead — the why-not-selling checks

Left here only so the next session doesn't chase it again. Wired and live since 07/25/2026. Its
remaining work is tracked under `why_isnt_it_selling_live_verify`, not here.

---

## Method notes worth keeping

- **HEAD returns 200 and lies** on SPA-backed hosts. Always GET and check `Content-Type` before
  believing an endpoint lives.
- **A 403 on one vendor's portal is not evidence the data is unavailable.** Test the public product
  before concluding a source is walled.
- **The four-lane read gate false-positives on off-project questions.** It classifies on keyword
  shape and fired twice during a general-science conversation with zero SWFL entities. It reads the
  transcript, not your description, so the only way through is to genuinely run the lanes. An
  early-exit when no SWFL entity appears in the turn would help — **hook change, needs operator
  sign-off, not done.**
- **Don't model at ZIP grain.** Our own research calls N=58 theater; parcel grain (847k) is the
  honest lane. And don't re-litigate k-means — twice documented as no.

---

## How to start

Pick opportunity 2 — it needs no decision from anyone and uses columns we already hold. Opportunity 1
waits on the operator. The registry contradiction is already a check.
