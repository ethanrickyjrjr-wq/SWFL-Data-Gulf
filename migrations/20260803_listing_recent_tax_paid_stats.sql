-- Aggregate-at-source view over steadyapi_tax_history (family B) for the active-listings-swfl
-- pack — region + county grain, mirrors listing_recent_price_cuts_stats's GROUPING SETS shape.
-- Uses each property's MOST RECENT tax_year row only (a 9-year series would otherwise
-- overweight properties with longer history). Vendor-reported annual tax PAID — NOT a county
-- tax bill, NOT validated against one yet (see design spec's deferred quality contract).
CREATE OR REPLACE VIEW data_lake.listing_recent_tax_paid_stats AS
WITH latest_per_property AS (
  SELECT DISTINCT ON (property_id) property_id, county, tax_amount
  FROM data_lake.steadyapi_tax_history
  WHERE tax_amount IS NOT NULL
  ORDER BY property_id, tax_year DESC
)
SELECT
  county,
  count(*)                                                   AS properties_with_tax_history,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY tax_amount)    AS median_annual_tax,
  max(tax_amount)                                            AS max_annual_tax
FROM latest_per_property
GROUP BY GROUPING SETS ((county), ());

GRANT SELECT ON data_lake.listing_recent_tax_paid_stats TO service_role;
NOTIFY pgrst, 'reload schema';
