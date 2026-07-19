-- strap — Lee STRAP (FDOR form, = data_lake.lee_parcels.parcel_id) attached to the LeePA
-- appraiser roll via the ParcelsWFS FabricParcels Name<->FolioID crosswalk (564,339 pairs,
-- probed live 07/19/2026). Key-only column: unlocks the parcel-grain appraiser-vs-state
-- cross-check (KEEP BOTH ratified 07/18 — this stitches the two, deletes nothing).
-- Design: docs/superpowers/specs/2026-07-19-leepa-strap-crosswalk-design.md
-- Populated by: ingest/pipelines/leepa/resources.py (_fetch_strap_by_folio, annual run)
--               + scripts/backfill_leepa_strap.py (one-off backfill, idempotent).
-- Idempotent.

-- varchar (not text) to match dlt's destination type for "text" hints — keeps the
-- schema-baseline diff quiet when the annual dlt run manages the same column.
ALTER TABLE data_lake.leepa_parcels ADD COLUMN IF NOT EXISTS strap varchar;
NOTIFY pgrst, 'reload schema';
