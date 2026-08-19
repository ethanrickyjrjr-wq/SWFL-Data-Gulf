# lib/listings — listing/comp/sold-event lanes (Class-B conventions)

Real-estate domain rules that keep biting (memory: project_real-estate-domain-rules):

1. **Sold price = deed record, never list price.** Day-grain closes come from
   `/property-tax-history` via `fetchSoldEvent`; `/nearby-home-values` carries NO sale
   date at all. Which root feeds which number: `docs/standards/data-roots.md` (read its
   top section before wiring any consumer).
2. **Comps are size-banded, same-type.** Condos ≠ SFH. Rates are read as written, never
   recomputed from raw counts.
3. **ZIP is situs address / lat-lon, never mailing ZIP** (3-gate rule, root CLAUDE.md).
4. **SteadyAPI is a flat 50k/month subscription** — a duplicate call costs quota, not
   dollars; Apify is per-record. Never import one vendor's economics onto the other.
   Raw `/property-tax-history` bodies land in `data_lake.steadyapi_property_history_raw`
   (18,319+ held) — read before re-buying.
5. This dir is under **active parallel edit** (sold-event-store, steadyapi lanes) —
   check SESSION_LOG.md and repolith claims before assuming shape.
