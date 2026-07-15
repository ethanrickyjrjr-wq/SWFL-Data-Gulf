# fred_g17 — coverage ledger

_Generated from `ingest/cadence_registry.yaml` (`fred_g17` entry). Edit the registry, not this
file — re-run the generator to refresh it. See
`docs/superpowers/specs/2026-07-15-per-unit-coverage-ledgers-design.md`._

## Key details

**What we pull:** G.17 industrial production / capacity utilization, **national series only**.
(source: our ingest)

**What the source also offers, unpulled:** FRED also publishes real Lee/Collier county-level
annual series with confirmed series IDs — house price index, county GDP, per-capita income, median
household income, poverty rate, building permits — **none pulled today**. Vendor ceiling note:
MSA-level GDP was discontinued by BEA/FRED in 2023; unemployment claims never publish finer than
statewide, so that specific gap is a real vendor ceiling, not a gap in our pull.

Source: [fred.stlouisfed.org](https://fred.stlouisfed.org/) (FRED, St. Louis Fed)

**Last researched: 07/08/2026 — this is a researched snapshot, not a live query.** The drift-gate
(§4 of the design spec) only proves this file still matches what's in `cadence_registry.yaml`; it
does NOT prove the registry's own summary is still accurate against the live FRED catalog. If FRED
has published new series since 07/08/2026, this file will not know until someone re-researches it
and updates the registry. Deriving "what we don't have" from FRED's live series catalog instead of
a researched prose summary is real future work, not done here — see the design spec's Open Risks.

## Enforced

_(none yet — `fred_g17` has no recipe/pack claim gate today; this section stays empty until the
ingest lane's Enforced/Unenforced pass, out of scope for this spec.)_

## Unenforced

_(none yet — same as above.)_
