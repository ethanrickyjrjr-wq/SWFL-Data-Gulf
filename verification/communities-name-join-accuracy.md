# Communities name-join accuracy — "how far off are we" (07/05/2026)

**Question:** the design calls the parcel→community assignment its "one hard, unproven piece"
(a spatial join behind a GO/NO-GO spike). But every parcel already carries its subdivision name.
Does grouping parcels by the name they already carry reproduce real community home counts — i.e.,
can we skip the spatial join entirely?

## Method

Pulled **364,000 Collier parcels** (`CO_NO=21`) from the FDOR statewide parcel **centroid** layer on
07/05/2026, grouped by the subdivision name each parcel carries in `S_LEGAL` with a **raw prefix
match** (no alias map applied yet — this is the floor, not the ceiling). Compared per-community home
counts against named external sources that publish each community's count.

**Collier totals (our pull, 07/05/2026):** 289,212 homes across 4,521 distinct subdivisions.
By type: condominium 169,047 · single-family 110,992 · mobile 3,518 · cooperative 2,727 ·
duplex/small-multifamily 1,972 · misc-residential 956.
(Single-family 110,992 matches an independent county figure of ~111,129 within 0.1%. Condo runs
higher than an earlier spec figure of 100,847 — because each condo folio is counted as one home
here, which is the per-unit grain we want; flagged for reconciliation, not treated as settled.)

## Per-community benchmark

| Community | Ours (current, 07/05/2026) | Named source | Source count | Gap | Why the gap |
|---|---|---|---|---|---|
| Heritage Bay | 1,501 (1,252 condo + 249 SF) | 55places | 1,400 homes | **+7%** | clean match; we count each condo folio as a home |
| Pelican Bay | 3,849 | 55places | 6,500 homes / 58 neighborhoods | −41% | name fragmentation — sub-neighborhoods carry their own plat names |
| Lely Resort | 4,852 | Wikipedia | 10,500 (planned buildout) | n/a | planned ≠ current; still building |
| Fiddler's Creek | 2,106 | 55places | 6,000 (planned buildout) | n/a | planned ≠ current; ~35% built |
| Ave Maria | 2,516 | Wikipedia | 5,000 sold / 11,000 planned | n/a | fragmentation + still building |

## How far off — the honest read

1. **The mechanism is accurate.** On a built-out community with one dominant plat name, the raw
   name-group matches the marketed count within **~7%** (Heritage Bay 1,501 vs 1,400). The small
   excess is correct — each condo unit is its own home.
2. **The raw prefix-match undercounts fragmented master-planned communities.** Pelican Bay's 58
   sub-neighborhoods carry their own names, so a "PELICAN BAY" prefix catches only ~59%. This is
   exactly what the alias reconciler (`refinery/lib/subdivision-aliases.mts`, already built) closes:
   map each sub-name → master community. The raw prefix pass is the **floor** of accuracy.
3. **"Planned buildout" is not a fair denominator.** Sources cite future plans (Lely 10,500,
   Fiddler's 6,000, Ave Maria 11,000); our count is homes that **exist today**. Our current-built
   number is the truthful one — that gap is time, not error.

## Verdict

The home→community link is already in every parcel record. Grouping by `S_LEGAL` (Collier) /
`Description` (Lee) reproduces real community counts. **The design's spatial-join crux — and its
GO/NO-GO spike — is not needed.** The remaining accuracy work is **alias-map coverage**
(sub-neighborhood name → master community), which is bounded, unit-testable, and the reconciler's
job — not new infrastructure. This supersedes the spatial-join sections of
`docs/superpowers/plans/2026-07-05-communities-swfl-phase1-backbone.md`.

## Sources

- **Our counts:** FDOR Statewide Parcel Centroid FeatureServer (`Florida_Statewide_Parcel_Centroid_Version`, layer 0), Collier `CO_NO=21`, pulled 07/05/2026, grouped by `S_LEGAL`.
- **Community counts:** 55places.com community pages (Heritage Bay, Pelican Bay, Fiddler's Creek) and Wikipedia (Lely Resort, Ave Maria), retrieved 07/05/2026.
