# Lee deed ⇄ parcel join — SOLVED. It was never broken; it was tested against the wrong column.

**Date:** 08/12/2026 · **Closes:** `docs/handoff/2026-08-12-lee-deed-data-investigation-queue.md`
TASK 1, which specified this exact file as its output.
**Status:** measured live against `data_lake`, this session. Nothing wired yet — finding only.

---

## The claim that was wrong

`docs/standards/data-roots.md` states, in two places (line 86 and T10 at line 118), that the Lee
deed→parcel join is **BROKEN — "0 rows on a direct join, live 08/12/2026."**

That measurement was real, and it was taken against `lee_parcels.state_parcel_id`:

```
lee_deed_official_records.parcel_strap   0-44-27-02-00012.0130
lee_parcels.state_parcel_id              C46-000-502-7399-4      -> 0 rows. Correct.
```

**But `lee_parcels.parcel_id` — a different column in the same table — is the deed's own STRAP with
its separators removed:**

```
lee_parcels.parcel_id                    364323C2025430120       (17 chars)
lee_deed_official_records.parcel_strap   22-46-25-E4-10000.1700  (17 chars once stripped)
```

Both are the Lee STRAP: `SS TT RR BB BBBBB LLLL` = 2+2+2+2+5+4 = **17 characters**.

## The normalization (one expression, no new table, no new ingest)

Strip `-` and `.`, and left-pad the leading section field to 2 digits (some rows carry a 1-digit
section, e.g. `0-44-27-...`, which is why a naive `replace()` alone lands on 16 and misses):

```sql
lpad(split_part(parcel_strap,'-',1), 2, '0')
  || replace(replace(substr(parcel_strap, strpos(parcel_strap,'-')+1), '-',''), '.','')
```

Length check across all rows carrying a strap: **11,386 normalize to exactly 17.** The remainder are
malformed at the source (632 land on 4, 114 on 5, 102 on 19, 64 on 15, 40 on 16) and are legitimately
unjoinable — not a normalization failure.

## Measured match rates (live, 08/12/2026)

**Deeds → `lee_parcels` → street address:**

```
4,999  DEED rows carrying a parcel_strap
4,535  matched a lee_parcels.parcel_id          (91%)
4,535  of those carry a phy_addr1               (100% of matches)
```

**Deeds → `leepa_parcels.strap` (the Property Appraiser table, a second independent route):**

```
4,999  DEED rows carrying a parcel_strap
4,563  matched leepa_parcels.strap              (91%)
```

Both Lee parcel tables connect. `lee_parcels` carries the street address (`phy_addr1`);
`leepa_parcels` carries assessed/just/market value, use code, and last-sale fields.

**It is not deed-only — address reach by document type:**

```
DEED                          4,999 with strap -> 4,535 with address
MORTGAGE                      2,005            -> 1,846
NOTICE OF COMMENCEMENT        1,542            -> 1,278
PROBATE                         714            ->   120
TERMINATION                     495            ->   445
AFFIDAVIT                       486            ->   440
LIEN                            352            ->   313
RELEASE                         254            ->   197
UNIFORM COMMERCIAL CODE         228            ->   188
MORTGAGE WITHOUT INTANGIBLE TAX 215            ->   202
```

## What this unlocks — and why it is the biggest thing on this table

Real joined rows, recorded 08/11/2026:

```
2026-08-11   $350,000   2806 SE 17TH AVE
2026-08-11   $255,000   208 NE 9TH AVE
2026-08-11    $75,000   1318 SW 36TH ST
2026-08-11    $25,500   1111 FLORENCE ST E
```

**Sale price + exact recording day + street address.** `data-roots.md` T10's standing complaint is
that every sale date we serve is MONTH grain and lags ~7 weeks (`leepa_parcels.last_sale_date` has
exactly one distinct day-of-month across 387,609 rows — the 1st). This join is day-grain and current
to the last manual capture.

It also makes the non-deed doc types addressable for the first time: a Notice of Commencement or a
Lis Pendens at a specific address is exactly the raw material
`_RESEARCH/data-and-ingest/2026-07-22-predictive-analytics-and-lead-mining.md` scoped as the
distress/opportunity lane (market-statistic framing only — no identity resolution, no owner
targeting).

## Caveats — state these wherever the join is used

1. **Coverage is a chain of two rates, not one.** `parcel_strap` is populated on 12,399 of 28,186
   rows overall (44%), and DEED is the best-covered type at 4,999/5,353 (93%). Types like
   DEATH CERTIFICATE (0/439) and JUDGMENT (19/2,366) will never reach an address this way.
   The honest headline for deeds is **4,535 of 5,353 = 85% of all Lee deeds reach a street address**,
   not 91% (91% is of the strap-carrying subset).
2. **Two deeds can share one address** (observed above — 1111 Florence St E appears twice on the
   same day at the same price). Do not treat a joined row as a distinct sale without deduping.
3. **`consideration_usd` is non-null on 100% of all rows including non-transactional types** — the
   `> $100` arm's-length floor is only meaningful on DEED. Do not apply it after joining a
   DEATH CERTIFICATE to an address.
4. ~~Not verified: whether `parcel_id` is unique.~~ **RESOLVED — it is unique.**
   `lee_parcels`: 556,083 rows / 556,083 distinct `parcel_id`. No fan-out; the counts above are real,
   not upper bounds. (`leepa_parcels`: 548,798 rows / 547,972 distinct `strap` — **826 duplicate
   straps there**, so dedupe if joining via LeePA rather than FDOR.)
5. **Lee's history only advances on a manual capture** (Akamai blocks unattended fetch). Span today
   is 07/13–08/11/2026.

## Collier — the same question, a different shape

Collier's own parcel IDs match `collier_parcels.parcel_id` directly, no normalization needed:
**948 document-parcel pairs → 871 matched → 823 with a street address (87%).** But Collier only
carries a parcel ID on DEED rows (871 of 2,230 = 39%) and on essentially nothing else
(NC 0/2,756, MTGE 0/1,046, SATIS 0/1,000, JUDG 0/674).

Collier's broader route is `legal_description`, filled on **8,471 of 12,441 rows (68%)** and
subdivision-name-shaped ("SILVER LAKES PHASE 2E BLOCK 7 LOT 6"). The Naples Area Board of REALTORS
subdivision code list (30pp, fetched 08/12/2026,
`https://documents.nabor.com/reference/Collier_Subdivision_Code_List_2015-05.pdf`) maps every
Collier subdivision name to a 6-digit code. **UNVERIFIED: whether `collier_parcels` carries that
same code.** If it does, this is a direct bridge; if not, it is still a name-normalization aid.
Check before promising it.

## BONUS — this also closes the LeePA↔FDOR crosswalk the 07/18 audit declared missing

`_RESEARCH/audits/2026-07-18-data-consolidation/P1-parcel-consolidation.md` states (line 63):
*"FDOR keys on `parcel_id` (STRAP)… LeePA's numeric FOLIO ID is a different key system. Not a
column-equivalent — a join would need a crosswalk. **This is the LeePA↔FDOR join gap.**"* And line
54: parcel-level reconciliation *"needs a `folioid↔parcel_id` crosswalk that does not exist yet."*

**It does exist — `leepa_parcels.strap` IS `lee_parcels.parcel_id`.** Measured live 08/12/2026:

```
548,798  leepa_parcels rows
542,445  matched to lee_parcels.parcel_id on strap   (98.8%)
```

Sample joined rows (LeePA folio + value, FDOR address, same parcel):

```
folioid 10515474  strap 364326020000D0050  16974 OAKSTEAD DR   $269,856  SINGLE FAMILY RESIDENTIAL
folioid 10515569  strap 364326020000E0080  17037 SUNNY LAKE CT $333,660  SINGLE FAMILY RESIDENTIAL
folioid 10335417  strap 364426L1060390050  55 IRENE AVE S      $277,043  SINGLE FAMILY RESIDENTIAL
```

The audit was right that `folioid` has no FDOR equivalent — but it did not need one. Both tables
already carry the STRAP, under different column names (`strap` vs `parcel_id`). Anything that was
blocked on "no crosswalk" (LeePA `soh_cap` reconciliation, LeePA sale history joined to FDOR
address/attributes) is unblocked at 98.8%.

## Why this sat undiscovered for a day

TASK 1 of the investigation queue, written the same morning, said in its own words to check
`state_parcel_id`, `parcel_id`, **and any other candidate column**, and to "also check `leepa` and
`collier_parcels` in case Lee's own STRAP matches a different table." The right answer was named in
the task and the task was filed instead of run — while `data-roots.md` went on telling every reader
the join was broken. Same failure shape as the Collier dry-run-reported-as-live incident the same
day: the work was scoped correctly, not executed, and a wrong conclusion was written down as fact.

## Owed follow-ups (none done here)

- Correct `data-roots.md` line 86 and T10 — both currently assert a broken join.
- Verify `lee_parcels.parcel_id` uniqueness (caveat 4) before any consumer reads this.
- Check `collier_parcels` for a NABOR subdivision code column.
- Wire it: a view is the natural home, mirroring `docs/sql/20260812_lee_deed_purchase_financing_v.sql`.
  Nothing reads this today.
