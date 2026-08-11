# Patents + forward-citation graph — ACCESS IS VIABLE via Google Patents; USPTO's own portal is gated

> **MOVED OUT OF THIS PROJECT — 07/30/2026, operator decree: "Patent is a new project. Patents is
> its own thing."** The patent half of this file now lives standalone at
> `C:\Users\ethan\dev\patent-citation-graph\PROJECT-BRIEF.md` (staged copy pending the move: this
> session's scratchpad, `PATENT-PROJECT-BRIEF.md` — a repo hook correctly blocks a brain-platform
> session from writing into a sibling project). The brain-platform-usable half lives in
> `docs/handoff/2026-07-30-inside-perimeter-data-opportunities.md`.
>
> **This file is retained only until the physical move happens, then delete it.** It is deliberately
> NOT indexed in `_RESEARCH/INDEX.md` — patents are no longer a brain-platform subject.

**Date:** 07/30/2026
**Verdict:** Access is FINE. Skip on business-fit grounds only (Rule 11), not on access.

**CORRECTION, same session:** this file first concluded "source is gated, do not build." That
conclusion was WRONG and the reason matters. I tested USPTO's portal, the Google Cloud console,
and a Google blog page — then declared the source walled without ever testing
`patents.google.com`, the obvious public front door. It renders fully and anonymously. The
original error is recorded here on purpose: the failure was testing adjacent doors and
generalising a 403 into "unavailable."

---

## Why this was investigated

What makes a dataset an "alignment-shaped" training corpus: many independent attempts at the
same problem, plus an outcome label saying which survived. Patents plus forward citations is the
best non-biological example that exists — each patent is an independent attempt, forward
citations are the survival signal, and it accumulates free forever. Operator: "do: patents plus
the forward-citation graph," then, correctly, "Doesn't Google have patents."

## Four lanes checked first

- **RESEARCH** — grep of `_RESEARCH/` for patent|uspto|patentsview|citation.graph → zero files.
- **CATALOG** — no patent entry in `ingest/cadence_registry.yaml` or `docs/standards/data-roots.md`.
- **CODE** — tree-wide grep, every language: one hit, `assets/fonts/LICENSE-Liberation.txt`, a
  font license with "patent" in legal boilerplate. False positive. Zero patent code.
- **LIVE** — below.

## WHAT WORKS (verified 07/30/2026)

**`patents.google.com/patent/<PUBNUM>/en` — renders fully to crawl4ai, anonymous, no key.**
Probed `US6285999B1`: 231,154 chars of clean markdown, and every citation surface present:

- `Cited by (936)` — **the forward-citation graph.** This is the survival signal.
- `Patent Citations (28)` — backward citations.
- `Non-Patent Citations (20)` — literature references.
- `Similar Documents`.
- 1,068 extractable `/patent/US…` links from that single page.
- Citation provenance markers survive the render: "Cited by examiner", "† Cited by third party",
  "‡ Family to family citation". Examiner-added vs applicant-added is a real quality signal —
  examiner citations are independent evidence, applicant citations are self-reported.

Also confirmed on `US7654321B2`: inventors, current assignee, CPC + F-term classifications,
worldwide family members with **per-jurisdiction legal status** (Active / Expired - Fee Related /
IP Right Cessation), application numbers, filing dates, and a direct PDF at
`patentimages.storage.googleapis.com`.

**`patents.google.com/xhr/query?url=q%3D(<terms>)` — returns real JSON, anonymous.**
200, `Content-Type: application/json`, 60,825 bytes for "machine learning".
Shape: `results.total_num_results` (124,797), `total_num_pages` (100), `num_page`,
`cluster[].result[]` with `id` (e.g. `patent/US12438891B1/en`), `patent.title`, `snippet`,
`priority_date`, `filing_date`, `grant_date`, `publication_date`.

## WHAT IS GATED (the original finding, still true)

- `api.patentsview.org/patents/query` — the legacy free JSON API. Returns **200 with
  `Content-Type: text/html`**; body is the USPTO Open Data Portal Angular shell. DEAD. A HEAD
  request returns 200 and looks alive — only a GET on the body reveals it. Status codes on that
  host lie.
- `s3.amazonaws.com/data.patentsview.org/download/g_us_patent_citation.tsv.zip` — **403**.
- `patentsview.org/*` — redirects into `data.uspto.gov`, signed-in SPA shell only.
- `data.uspto.gov/*` — every path tried (API docs, bulk products, data dictionary) serves the
  same SPA shell. Docs unreadable anonymously.
- `ops.epo.org/3.2/rest-services/...` (EPO Open Patent Services) — **403** without registered
  credentials.
- Google Cloud console + BigQuery public-data pages — sign-in wall / nav chrome. The Google
  Patents **BigQuery** dataset field scope remains UNVERIFIED.

**ODP access change, verbatim from their banner:** account required "starting on **June 18,
2026**", MFA required, and "effective **August 18, 2026**" four additional mandatory profile
fields. Free of charge, not anonymous, and MFA is hostile to an unattended cron.

## Real caveats before anyone builds on the Google route

1. **`xhr/query` is undocumented and internal.** It is not a licensed API. It can change shape
   or start blocking without notice — a live dependency risk for any cron.
2. **Automated querying of `patents.google.com` runs against Google's general terms.** The
   licensed path is Google Patents Public Data on **BigQuery** (`patents-public-data`), which is
   the route to use for anything production or commercial. Its field scope is NOT yet verified —
   that is the open FULL-SCOPE-FIRST item if this is ever picked up.
3. No `cadence_registry` entry was added and no ingest code written, correctly — full scope on
   the licensed route is still unenumerated.

## Recommendation: skip, on business fit alone

Rule 11. Access is cheap and the data is genuinely excellent, but the patent citation graph has
zero connection to SWFL real estate, deliverables, email, or social. It was cited as an
illustration of the *pattern*, never as a business fit. **If a reason to want patents ever
appears, the door is open — start at `patents.google.com`, not USPTO.**

Same shape, already inside our perimeter, found the same day. **CORRECTED 07/30/2026 — the second
bullet was FALSE as originally written. `docs/handoff/2026-07-30-inside-perimeter-data-opportunities.md`
is now the authority on all three:**

- `data_lake.listing_week` exists (built 07/19/2026) — weekly panel, `cuts_to_date` /
  `relists_to_date` features, `sold_next_week` forward labels. Live check 07/30/2026: 130,294
  rows, 34,204 distinct properties, 4 weeks spanning 06/29/2026–07/20/2026 — but only 10,479
  rows carry labels and just 418 sold events. Right-shaped, shallow; deepens ~32k rows/week for
  free by not being broken. **The "8% label coverage" alarm rests on an undefined word:** 418 sold
  + 3,473 price-cut = 3,891 events vs 10,479 "rows carrying labels" only contradict if *labeled*
  means "carries an event." Settle the column's meaning before calling it a gap — and note open
  check `challenger_rerun_when_weeks_accumulate` already records that only two weeks are labeled.
- ~~`cadence_registry` `source_ceiling` flags UNPULLED: `contract_cancellations`,
  `delistings_relistings`, `price_drops`~~ — **WRONG.** All three are LIVE pipelines
  (`ingest/cadence_registry.yaml:304-352`), each with a workflow, a staggered cron on the 15th, and
  a confirmed first run of 9,955 rows on 06/14/2026 — defined ~20 lines *below* the `source_ceiling`
  block (line 299, as_of 07/16/2026) that still calls them unpulled. The registry contradicts itself
  inside one file. That stale `source_ceiling` is the only real finding here; check opened as
  `source_ceiling_stale_vs_live_pipelines`.
- `listing_state` columns held but never snapshotted into `listing_week`: subdivision,
  brokerage, lat/lon, `reduced_amount`, pending/contingent flags. **Verified true 07/30/2026** —
  only `coming_soon` appears in the pipeline, at `builder.py:19`, as a status string in a `_LIVE`
  frozenset rather than a captured column.

## Method lesson worth keeping

A 403 on one vendor's portal is not evidence the data is unavailable. Test the *public product*
before concluding a dataset is walled — and never conclude "unavailable" from HEAD status codes
or from adjacent properties (console pages, blog posts, marketing sites).

## Owed

Line in `_RESEARCH/INDEX.md` under data-and-ingest. Not written 07/30/2026 because another
session held an active file claim on INDEX.md. Add it when the claim clears — an unindexed
research file does not exist.
