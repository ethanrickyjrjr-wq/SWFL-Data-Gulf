# MLS 226028911 subtype discrepancy — resolved against county record

**Filed 08/12/2026.** Closes the open thread from
`docs/handoff/2026-08-12-listing-grade-sonnet-queue-results.md` §1 and
`_RESEARCH/data-and-ingest/2026-08-12-agent-site-crawl-real-geeks.md` §7: two agent-site IDX feeds
disagreed on property subtype for the same MLS listing (425 Wildwood LN, Bears Paw, Naples 34105) —
johnrwood.com said **Condominium**, swflregroup.com (Real Geeks) said **Residential**.

## What resolved it

Queried our own `data_lake.collier_parcels` (FDOR cadastral, the properties-collier-value root per
`docs/standards/data-roots.md`) for the exact site address:

```
phy_addr1='425 WILDWOOD LN', phy_city='NAPLES', phy_zipcd='34105'
parcel_id: 03240000906
dor_uc: 004          -- FDOR DOR Use Code 004 = Condominiums
legal_description: BEAR'S PAW CONDOMINIUM I
living_area_sqft: 1661
actual_year_built: 1981
```

**Verdict: Condominium is correct.** johnrwood.com's feed matches the county record; the Real Geeks
feed (swflregroup.com) is mislabeling this listing's subtype as "Residential." Whichever IDX feed
swflregroup.com pulls from should not be trusted as a subtype source of record without a wider sample
— this was one listing, not a platform-wide audit.

**Secondary discrepancy, not yet reconciled:** the MLS-sourced living area (2,230 sqft per the agent
sites) does not match the county record's `living_area_sqft` (1,661 sqft) for the same parcel. Not
investigated further here — flagging per RULE 4 (discrepancy reporting) so it doesn't get silently
carried into a comp.

## Why this matters beyond one listing

This is the concrete case for why subtype (condo vs. single-family) should resolve against
`collier_parcels`/`lee_parcels` `dor_uc`, not against whatever an agent site's IDX feed displays —
the two agent-site feeds disagreed with each other on the same listing, and the county record was the
tiebreaker. Any listing-grade build that reads subtype from a scraped agent site should cross-check
`dor_uc` before serving a condo/SFH distinction.
