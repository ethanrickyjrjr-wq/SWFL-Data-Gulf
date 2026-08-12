# Lee County Clerk (LandMarkWeb) — full document-type catalog + grading value

**Date:** 08/12/2026 · **Source:** live export from `or.leeclerk.org/LandMarkWeb` (operator-run,
`_ExportResults_2026_08_11 23_58_11.xlsx`, unfiltered doc-type search, 2,000 rows = the export
tool's row cap, spanning 07/13–07/14/2026 only — 2 days). Definitions grounded in standard Florida
recording law (statute cited per type); this is public-record terminology, not a vendor API
contract, so no crawl4ai round-trip was run per type — one check against `leeclerk.org`'s own site
confirmed the fee/recording-services structure but no per-type glossary page exists there.

## New technical finding (separate from the catalog, logged here so it isn't lost)

The site's own **Export button produces a clean, named-column XLSX** (`Status, Consideration,
Grantor, Grantee, Record Date, Doc Type, Book Type, Book, Page, Clerk File Number, DocLinks, Legal,
Lot, Block, Unit, Subdivision, Building, Section, Township, Range, Comment`) — no positional
`"0".."26"` decoding, no `nobreak_`/`hidden_`/`legalfield_` prefix stripping needed. This is a
materially cleaner delivery path than the XHR-capture mechanism `ingest/pipelines/
lee_deed_official_records/README.md` currently documents (steps 1–6, "How to pull the next day").
**Caveat: the export caps at 2,000 rows per pull** (confirmed — 2 days of ALL doc types hit exactly
2,000), so a real pipeline needs either narrow date-range chunking or a doc-type filter to stay under
the cap per pull. Still requires the same real-browser session (Akamai blocks unattended access
regardless of which UI button produces the output) — this changes the CLEAN-UP step, not the
delivery-mechanism blocker. Check opened: `lee_deed_export_button_vs_xhr_capture`.

## Full catalog — every doc type observed live, 07/13–07/14/2026 (32 types, 2,000 rows)

Grouped by real-estate-intelligence value, highest first. **HAVE** = already in
`lee_deed_official_records` schema (DEED only, per `cadence_registry.yaml`). Everything else is
**WANT** or **LOW** — available in the same feed, not currently pulled.

### Tier 1 — the transaction itself
- **DEED** (HAVE) — transfers title, grantor → grantee (F.S. 695). `Consideration` = sale price when
  arm's-length; `$10.00` or similar nominal values mark quitclaim/family/trust transfers (already the
  non-arm's-length floor used elsewhere in the repo). This is the whole reason the pipeline exists.

### Tier 2 — the foreclosure timeline (highest-value WANT, in chronological order of when each fires)
- **LIS PENDENS** (WANT, top priority) — "notice of pending litigation" affecting title (F.S. 48.23).
  Filed the MOMENT a foreclosure suit is filed — the earliest public foreclosure signal available,
  months ahead of judgment or sale. 51 rows in the 2-day sample.
- **JUDGMENT** / **FOREIGN JUDGMENT** (WANT) — court money judgment recorded as a lien (F.S. 55.10;
  F.S. 55.501 for out-of-state judgments domesticated in Florida). Debt-collection distress signal,
  can force a sale. 169 + 4 rows.
- **LIEN** / **CONTEST OF LIEN** (WANT) — mechanic's/contractor's lien (F.S. 713, Construction Lien
  Law), HOA lien, or code-enforcement lien; a contest shortens the claimant's window to sue (F.S.
  713.22). Unpaid-contractor / HOA-conflict distress signal. 33 + 2 rows.
- **CERTIFICATE OF TITLE** (WANT, top priority) — issued when a foreclosure sale is confirmed. The
  single strongest "foreclosure completed" instrument in the entire record set — pairs with LIS
  PENDENS as start/end of the timeline. Only 1 row in this 2-day sample (rare relative to filings,
  which is itself informative about the current foreclosure pipeline's stage distribution).
- **BOND** (LOW-MEDIUM) — surety bond substituted to discharge a lien claim (F.S. 713.24). Rare;
  same family as LIEN.

### Tier 3 — life-event / inheritance (probate-lead-gen is its own industry for a reason)
- **PROBATE** (WANT) — estate administration opened after an owner's death (F.S. 733). Heirs are
  statistically likely sellers of inherited property. 71 rows — meaningfully more common than DEED's
  nearest distress-adjacent competitor.
- **DEATH CERTIFICATE** / **AFFIDAVIT W/ DEATH CERTIFICATE** (WANT) — recorded death certificate,
  often paired with PROBATE or filed alone for summary administration (F.S. 735, smaller estates
  skip full probate). Direct corroboration of the PROBATE signal. 22 + 10 rows.

### Tier 4 — financing / equity position
- **MORTGAGE** / **MORTGAGE WITHOUT INTANGIBLE TAX** / **MORTGAGE WITHOUT TAX** (WANT) — new lien
  recorded against a parcel. Paired same-day with a DEED = purchase-money financing (bought,
  financed). Standalone with no paired deed = refinance or cash-out — a liquidity-event / distress-
  adjacent signal on its own. 175 + 9 + 8 rows.
- **SATISFACTION** (WANT) — lender confirms a mortgage paid off. Near a DEED = seller cleared their
  loan at closing; standalone = paid off free-and-clear (equity-position signal). 180 rows — the
  single largest non-DEED category observed.
- **MODIFICATION** (MEDIUM) — amends an existing instrument, most commonly a mortgage workout —
  soft-distress-resolved signal (avoided foreclosure via renegotiation). 16 rows.
- **ASSIGNMENT** (LOW-MEDIUM) — transfers a mortgage/lien to a new holder (loan sold to a servicer or
  MBS trust). Chain-of-title tracking, not itself a life-event signal. 53 rows.
- **RELEASE** / **PARTIAL RELEASE** (LOW-MEDIUM) — releases an obligation or lien, or releases one lot
  from a blanket mortgage (subdivision developers). 20 + 2 rows.

### Tier 5 — improvement / construction pipeline (SWFL-specific value given ongoing Ian rebuild)
- **NOTICE OF COMMENCEMENT** (WANT) — filed before construction/major renovation starts (F.S.
  713.13). Signals an owner renovating, building new, or rebuilding post-storm — this fires BEFORE a
  permit necessarily shows up in the permits pipeline, and could cross-check/lead it. 354 rows — the
  second-most-common doc type in the sample, right behind DEED.

### Tier 6 — household / identity context (soft signal, mostly identity-matching value)
- **MARRIAGE FL RESIDENCE WITHOUT COUNSELING** / **MARRIAGE FL/NON-FL WITH COUNSELING** / **MARRIAGE
  NON-FL RESIDENCE** (LOW-MEDIUM) — marriage license filings; "with counseling" gets Florida's 3-day
  waiting-period waiver and reduced fee (F.S. 741.0305). Household-formation signal, sometimes
  precedes a joint home purchase; also useful for matching a name change across grantor/grantee
  records over time. 29 + 7 + 4 rows.
- **POWER OF ATTORNEY** (LOW-MEDIUM) — recorded ahead of a sale when an owner (elderly, out-of-state,
  incapacitated) can't sign personally. Mild signal of an upcoming transaction or an absentee/aging
  owner. 4 rows.

### Tier 7 — property-attribute context (not transactional, useful for parcel completeness over time)
- **EASEMENT** (LOW) — right-of-way/utility access grant; affects buildable area, not a life event.
  3 rows.
- **RESTRICTIONS** (LOW) — deed restrictions / HOA declaration recorded against a parcel or
  subdivision. 1 row.
- **UNIFORM COMMERCIAL CODE** (LOW for residential) — UCC-1 financing statement, secures personal
  property/business assets; relevant mainly for manufactured/mobile homes, not standard SFH/condo.
  19 rows.

### Tier 8 — generic or administrative — track for completeness/dedup, not standalone signal
- **AFFIDAVIT** (147 rows), **ORDER** (93), **COURT PAPER** (56), **TERMINATION** (42), **AGREEMENT**
  (16), **NOTICE** (11), **CERTIFICATE OF COMPLIANCE** (1) — all too generic on their own to classify
  without reading the underlying case/document; the case-number prefix embedded in these rows'
  Grantor/Grantee-adjacent fields (`CA` = civil action, `GA` = guardianship, `DR` = family/divorce,
  `CC` = county civil, `SC` = small claims) is itself an unparsed sub-signal worth a future pass.
- **RE-RECORDED DEEDS** (2 rows) — a DEED re-recorded to fix an error in the original. **Not a new
  transaction** — this is a dedup guardrail to build into any DEED-volume ingest, not a new signal:
  without filtering it, a re-recorded deed double-counts a sale.

## Recommendation, ranked

If backfill/automation capacity only allows adding a few doc types beyond DEED before the fetch
mechanism itself is solved (still `parked` per `cadence_registry.yaml`), the ranked add-list is:
**LIS PENDENS, CERTIFICATE OF TITLE, JUDGMENT, LIEN → PROBATE, DEATH CERTIFICATE → MORTGAGE,
SATISFACTION → NOTICE OF COMMENCEMENT.** That set covers the full foreclosure timeline
(earliest-to-completed), the inheritance/life-event lane, the financing/equity lane, and the
SWFL-specific rebuild-activity lane — the four highest-value gaps named in
`_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md` §3.

## Related
- `_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md` — named this same
  gap first ("doc types beyond DEED... are available but not currently pulled"), independently
  arrived at the same top-priority set (Certificate of Title = completed foreclosure, Lien =
  distress, Mortgage = new financing event).
- `ingest/pipelines/lee_deed_official_records/README.md` — the pipeline this catalog extends;
  Akamai-blocked fetch mechanism, `parked: true` in `cadence_registry.yaml`.
- Check opened: `lee_deed_doc_types_beyond_deed_wire` (add the Tier 2–5 doc types once fetch cadence
  is real) and `lee_deed_export_button_vs_xhr_capture` (test the export button as the delivery
  mechanism, chunked under its 2,000-row cap, against the documented XHR-interceptor approach).
