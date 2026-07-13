-- 20260713_corridor_absorption_uncite.sql
--
-- CORRECTS AN OVER-CLAIM MADE BY 20260713_corridor_submarket_grain.sql (same day).
--
-- That migration stamped the Cushman & Wakefield MarketBeat URL onto
-- absorption_sqft_source_url for every corridor whose (rent, vacancy) matched a
-- C&W submarket row. That inference was wrong. Absorption is NOT stamped at
-- submarket grain the way rent and vacancy are — it VARIES inside a submarket:
--   Naples      → 1,500 / 6,200 / null
--   Cape Coral  → 3,500 / 4,500 / 6,200
-- and those values do not appear anywhere in the C&W submarket table (whose
-- Naples row reads -453 for the quarter and 15,058 YTD). Citing that report for
-- them asserts a provenance the report does not support.
--
-- (Lehigh Acres 6,397 DOES match C&W's current-quarter figure exactly — but one
-- coincidental match is not a basis for citing the rest, and we do not guess.)
--
-- So: put absorption back to uncited. It keeps its value; it loses the citation
-- it never earned. Until someone establishes where these numbers came from, the
-- def must not render absorption as a figure.
--
-- Cap rate is NOT reverted: 6.7% is stated verbatim in that report as the
-- Southwest Florida average, which is exactly why 22 corridors carry it.

UPDATE public.corridor_profiles
SET absorption_sqft_source_url = NULL
WHERE absorption_sqft_source_url =
      'https://assets.cushmanwakefield.com/-/media/cw/marketbeat-pdfs/2025/q4/us-reports/retail/fortmyersnaples_americas_marketbeat_retail_q42025.pdf';
