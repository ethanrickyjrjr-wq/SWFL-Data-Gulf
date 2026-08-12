# Lee ⇆ Collier recorded-records parity — what's asymmetric, what to fix, where it travels

**Date:** 08/12/2026 · **For:** whoever picks up county-parity or deed/records-data routing next.
**Context:** Lee (`lee_deed_official_records` / `lee-deed-records-swfl`) and Collier
(`collier_official_records` / `collier-official-records-swfl`) are now two live, separately-built
county recorded-document pipelines. They were built five weeks apart by different sessions solving
different immediate problems, so they drifted — this is the parity audit + the routing answer.

---

## Part A — the actual asymmetry, table by table (measured, not assumed)

**Ingest scope — closer than it looks.** Both tables are UNFILTERED at the ingest layer: Lee holds
all 32 doc types (28,186 rows, 07/13–08/11/2026, confirmed in `data-roots.md` and the workflow
comment), Collier holds all 37 (fully automated, cron live 08/12/2026). Neither ingest restricts to
DEED-only. **This was the thing I said wrong earlier today and had to correct — the gap is not here.**

**Brain scope — this is the real gap, and it runs the OPPOSITE direction of what "Lee is older,
Lee is ahead" would suggest.**
- `lee-deed-records-swfl` (`refinery/packs/lee-deed-records-swfl.mts`): every query hard-filters
  `.eq("doc_type", "DEED")`. It has never once emitted an all-doc-type count. The other 31 doc types
  sit loaded in the table and the brain never touches them.
- `collier-official-records-swfl` (`refinery/packs/collier-official-records-swfl.mts`): reports an
  all-types total (`collier_records_total`, `collier_records_30d`) AND breaks out two named types
  (`collier_deed_30d`, `collier_notice_of_commencement_30d`).
- Neither brain breaks out the OTHER county's headline type: Lee has no Notice-of-Commencement
  metric, Collier has no cash-vs-financed metric (see below — that one may not even be buildable).

**Price data — a real, permanent asymmetry, not a build gap.** Lee's source carries a
`consideration` field (dollar amount) — that's what let the cash-vs-financed-purchase build ship
today (`docs/superpowers/specs/2026-08-12-deed-cash-financed-split-design.md`,
`deed_no_recorded_financing_share_lee`). **Collier's Document Search UI has NO consideration/
sale-price column at all** — confirmed live 08/12/2026, all 9 output columns enumerated
(`_RESEARCH/data-and-ingest/2026-08-12-collier-clerk-liveness-probe.md`). A Collier cash-vs-financed
metric is not a "haven't built it yet" — it is currently **not buildable from this source.** Don't
promise it; if a consideration field turns up later (an export button, a different search mode), that
changes this line, but as of today it does not exist.

**Automation — Collier is ahead here.** Lee's FETCH is manual (Akamai blocks every unattended method
tried — crawl4ai, CDP Chromium, curl, curl_cffi w/ Chrome TLS, all four failed 07/19–07/20/2026).
Collier's FETCH+LOAD is fully automated, cron live daily 11:37 UTC, zero bot wall found across 7+
automated searches this session. Lee's history only grows when a human drops a raw file; Collier's
grows every day on its own.

**Doc-type labeling — Collier is ahead here too.** Collier's own UI spells out all 37 codes
(`NC : Notice of Commencement`, etc. — read directly off the live multiselect). Lee's codes are
short and undecoded in the source UI; only DEED is currently a real, spelled-out consumer-facing
concept.

**Join key coverage — both broken, differently measured.** Lee: `parcel_strap` populated on 44% of
all rows / ~94% of DEED rows specifically, but the format doesn't match `lee_parcels.state_parcel_id`
— **0 rows on a direct join, confirmed 08/12/2026** (`data-roots.md` T10,
`docs/handoff/2026-08-12-lee-deed-data-investigation-queue.md` task 1). Collier: `Parcel IDs` column
confirmed to exist and confirmed it CAN be blank (one sample row), but the fill-rate across a real
sample is **unmeasured** — nobody has run the equivalent audit yet.

---

## Part B — getting them on the same page (concrete, ordered)

1. **Fix Lee's brain to stop hard-filtering DEED-only.** Add `lee_records_total` /
   `lee_records_30d` (all 32 doc types) to `lee-deed-records-swfl` the same way Collier's brain
   already does — this is the cheapest, highest-value parity fix, pure arithmetic on data already
   loaded, no new ingest. Mirror `collier_official_records_30d`'s shape exactly.
2. **Add a Notice-of-Commencement metric to Lee** (`lee_notice_of_commencement_30d`, mirroring
   Collier's) — Lee's own doc-type catalog already flags this as available, unpulled, and
   high-value (`_RESEARCH/data-and-ingest/2026-08-12-lee-deed-doc-type-catalog.md`, Tier 5: "354
   rows — the second-most-common doc type in the sample, right behind DEED").
3. **Do NOT try to add a cash-vs-financed metric to Collier.** The source doesn't carry the field.
   Naming this explicitly so nobody re-discovers the gap by trying to build it.
4. **Measure Collier's `Parcel IDs` fill-rate** (a real sample, not the one row already seen) before
   any Collier build that would depend on a parcel join — same caution Lee's investigation queue
   already applies to `parcel_strap`.
5. **Decide on a shared naming convention** once both emit all-types totals — right now
   `lee_records_total` doesn't exist and `collier_records_total` does; once built, keep the
   `<county>_records_total` / `<county>_records_30d` shape identical across both so a future
   consumer (a combined SWFL recorded-activity view, say) can read them without a translation layer.

None of this requires new ingest work — every fix above is arithmetic on tables already fully
loaded. That's the actual state of "same page": the DATA is already even: the BRAINS are not.

---

## Part C — where this travels (the actual routing answer)

**The honest current answer: neither brain is wired anywhere yet.** Grepped `master.mts` and every
live consumer surface (`app/api/mcp`, `app/api/b`, `lib/assistant`) — the only hit is `master.mts`
line 385, a comment: *"lee-deed-records-swfl is moot while its table is empty."* **That comment is
now factually wrong** — the table has held 28,186 rows since this morning — but nobody has gone back
to flip it. Collier's brain isn't mentioned in master at all (it didn't exist before today).

**What wiring in actually costs, mechanically:** both brains already have `skipSynthesisAgent: true`
and `skipTriageAgent: true` — deterministic, no LLM synthesis step, so adding either as a plain
`{ id: "...", edge_type: "input" }` in `master.mts` (same shape as `tier-divergence-swfl` /
`home-values-swfl` just above that stale comment) is non-critical by construction: a stale run adds
a caveat to master's dossier, never blocks it. This is a small, mechanical PR, not a redesign.

**What that buys once wired:** either brain's facts become reachable through the standard tier=2
fetch path (`/api/b/master?view=speak&tier=2`) that every chat answer already uses — "how much
building activity is happening in Collier right now" becomes an answerable question with a cited,
dated fact instead of nothing. This is the SAME mechanism every other leaf brain already uses to
reach a user; there is no separate "deed data" pipe to build.

**Where this SHOULD travel next, per what's already been researched and is already live:**
- **`_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md`** already named
  the real destination for this data family: a distress/opportunity signal lane built on LIS PENDENS
  (foreclosure filed), JUDGMENT, PROBATE, and NOTICE OF COMMENCEMENT — explicitly scoped as a
  MARKET-STATISTIC lane (no identity resolution, no owner targeting — that's the Fork-A lane and its
  DOJ v. Meta disparate-impact exposure, out of scope here). Today's build put the raw material for
  that in place for BOTH counties; the distress-signal layer itself is not built.
- **`why-isnt-it-selling` (`/r/why-isnt-it-selling`, live 07/25/2026)** is the one already-shipped,
  already-live consumer surface whose whole purpose is explaining why a specific listing isn't
  moving — a live NOC filing near a stale listing, or a LIS PENDENS on the parcel, is exactly the
  kind of fact that surface exists to surface. Not wired today; named here because it is the closest
  real destination, not a hypothetical one.
- **The area-email / area-report commentary bake** (in flight right now per `_ASSISTANT/TODAY.md`)
  reads pre-computed facts off the SAME kind of brain-fact root these two produce — once
  `lee_records_total`-style metrics exist, they are eligible for that surface with no new plumbing,
  the same way any other brain's `key_metrics` are today.

## Open question for the operator

Master-wiring is cheap and safe (step above) — do it as soon as Part B's step 1 (Lee all-types
metric) ships, so master routes to a Lee brain that actually says something beyond DEED. Collier can
wire in immediately; it already reports an all-types number. Say the word and this is a same-session
follow-up, not a new project.
