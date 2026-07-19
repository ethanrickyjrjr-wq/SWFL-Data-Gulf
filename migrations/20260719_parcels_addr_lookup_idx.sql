-- migrations/20260719_parcels_addr_lookup_idx.sql
-- Address-lookup path for /r/should-i-sell SOH calculator: eq(phy_zipcd) + ilike(phy_addr1)
-- against 556k (Lee) / 291k (Collier) rows. Composite btree covers the eq + pattern anchor.
CREATE INDEX IF NOT EXISTS idx_lee_parcels_zip_addr
  ON data_lake.lee_parcels (phy_zipcd, phy_addr1);
CREATE INDEX IF NOT EXISTS idx_collier_parcels_zip_addr
  ON data_lake.collier_parcels (phy_zipcd, phy_addr1);
