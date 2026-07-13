-- 20260713_corridor_submarket_grain.sql
--
-- WHY: corridor_profiles.asking_rent_psf / vacancy_rate_pct / cap_rate_pct /
-- absorption_sqft are NOT corridor measurements. They are Cushman & Wakefield
-- MarketBeat SUBMARKET figures (SWFL Retail, Q4 2025) stamped onto every
-- corridor inside the submarket. Proof: the (rent, vacancy) pair on 23 of 27
-- verified corridors is an exact, unique match to a row of that report's
-- submarket table. Naples 1.8%/$60.84, Estero 7.7%/$34.24, Lehigh Acres
-- 0.2%/$35.08, Cape Coral 2.5%/$23.09, and so on.
--
-- Consequence we shipped: the grid lab crowned "Waterside Shops — $60.84" as the
-- top corridor when three Naples corridors carry that identical submarket figure,
-- and charted three identical bars as if they were a ranking.
--
-- This migration records the grain instead of guessing it. Additive + idempotent:
-- it adds columns and fills provenance. It does not modify any existing figure.
--
-- Source (single authority for every value written here):
--   Cushman & Wakefield, MarketBeat — Southwest Florida Retail, Q4 2025
--   https://assets.cushmanwakefield.com/-/media/cw/marketbeat-pdfs/2025/q4/us-reports/retail/fortmyersnaples_americas_marketbeat_retail_q42025.pdf

ALTER TABLE public.corridor_profiles
  ADD COLUMN IF NOT EXISTS submarket text,
  ADD COLUMN IF NOT EXISTS submarket_source_url text,
  ADD COLUMN IF NOT EXISTS submarket_as_of date;

COMMENT ON COLUMN public.corridor_profiles.submarket IS
  'The published submarket this corridor sits inside. asking_rent_psf, vacancy_rate_pct, cap_rate_pct and absorption_sqft are held at THIS grain, not at corridor grain — they are shared by every corridor in the submarket. NULL = the corridor''s figures match no published submarket row and therefore have no named source; they must not be rendered as figures.';

-- Backfill from the C&W submarket table. The (rent, vacancy) pair is unique per
-- submarket in that report — North Naples $30.91/3.3% vs Golden Gate $30.91/12.2%
-- differ on vacancy — so this is an exact join to a published row, not a
-- coincidence match on a lone value.
WITH cw(submarket, rent, vac) AS (
  VALUES ('Bonita Springs', 27.51, 2.3),
         ('Cape Coral', 23.09, 2.5),
         ('Estero', 34.24, 7.7),
         ('City of Fort Myers', 16.04, 2.9),
         ('South Fort Myers/San Carlos', 23.27, 3.2),
         ('North Fort Myers', 14.24, 4.5),
         ('Lehigh Acres', 35.08, 0.2),
         ('The Islands', 26.13, 2.9),
         ('East Naples', 26.79, 3.3),
         ('North Naples', 30.91, 3.3),
         ('Naples', 60.84, 1.8),
         ('Marco Island', 35.61, 1.2),
         ('Lely', 19.85, 1.2),
         ('Outlying Collier County', 14.00, 3.3),
         ('Golden Gate', 30.91, 12.2)
)
UPDATE public.corridor_profiles c
SET submarket = cw.submarket,
    submarket_source_url = 'https://assets.cushmanwakefield.com/-/media/cw/marketbeat-pdfs/2025/q4/us-reports/retail/fortmyersnaples_americas_marketbeat_retail_q42025.pdf',
    submarket_as_of = DATE '2025-12-31'
FROM (SELECT * FROM cw) cw
WHERE c.asking_rent_psf = cw.rent
  AND c.vacancy_rate_pct = cw.vac
  AND c.deleted_at IS NULL;

-- Provenance repair: 23 of 27 corridors carried these figures with a NULL source
-- URL. The source is the C&W report above. Fill ONLY where NULL — never clobber a
-- citation someone deliberately set.
UPDATE public.corridor_profiles
SET asking_rent_psf_source_url = submarket_source_url
WHERE submarket IS NOT NULL AND asking_rent_psf_source_url IS NULL AND deleted_at IS NULL;

UPDATE public.corridor_profiles
SET vacancy_rate_source_url = submarket_source_url
WHERE submarket IS NOT NULL AND vacancy_rate_source_url IS NULL AND deleted_at IS NULL;

UPDATE public.corridor_profiles
SET absorption_sqft_source_url = submarket_source_url
WHERE submarket IS NOT NULL AND absorption_sqft_source_url IS NULL AND deleted_at IS NULL;

-- Cap rate is coarser still: the report states one 6.7% average for the whole of
-- Southwest Florida, which is why 22 corridors carry an identical 6.7. Same source.
UPDATE public.corridor_profiles
SET cap_rate_source_url = submarket_source_url
WHERE submarket IS NOT NULL AND cap_rate_source_url IS NULL AND deleted_at IS NULL;
