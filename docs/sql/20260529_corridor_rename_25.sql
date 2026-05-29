-- Breaking change: 26 → 25 corridors.
-- Merges Airport-Pulling North/South and scrubs US-41 tokens from display names.
-- Run in prod Supabase; verify row counts before executing.
--
-- Pre-flight schema check (run first to confirm no slug column exists):
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'corridor_profiles'
--   ORDER BY ordinal_position;
-- Expected: id (uuid), corridor_name (text), + metrics columns. NO slug/corridor_id column.
-- The slug is derived at pipeline runtime from corridor_name — only corridor_name needs updating.

-- Verify targets before running (should return 7 rows):
-- SELECT corridor_name FROM public.corridor_profiles WHERE corridor_name IN (
--   'Naples Airport-Pulling (North)', 'Naples Airport-Pulling (South)',
--   'US-41 Tamiami Trail Naples', 'US-41 / Cleveland Ave Fort Myers',
--   'US-41 Bonita Springs', 'Colonial Blvd East (US-41 to I-75)',
--   'Veterans Pkwy / Colonial Blvd (Midpoint Bridge Corridor)'
-- );

-- Apply renames
UPDATE public.corridor_profiles SET corridor_name = 'Airport-Pulling Naples'
  WHERE corridor_name = 'Naples Airport-Pulling (North)';

UPDATE public.corridor_profiles SET corridor_name = 'Tamiami Naples'
  WHERE corridor_name = 'US-41 Tamiami Trail Naples';

UPDATE public.corridor_profiles SET corridor_name = 'Cleveland Ave Fort Myers'
  WHERE corridor_name = 'US-41 / Cleveland Ave Fort Myers';

UPDATE public.corridor_profiles SET corridor_name = 'Bonita Trail'
  WHERE corridor_name = 'US-41 Bonita Springs';

UPDATE public.corridor_profiles SET corridor_name = 'Colonial East'
  WHERE corridor_name = 'Colonial Blvd East (US-41 to I-75)';

UPDATE public.corridor_profiles SET corridor_name = 'Midpoint Bridge Corridor'
  WHERE corridor_name = 'Veterans Pkwy / Colonial Blvd (Midpoint Bridge Corridor)';

-- Check for FK children on Naples Airport-Pulling (South) before deleting:
--   SELECT table_name, column_name
--   FROM information_schema.key_column_usage
--   WHERE referenced_table_name = 'corridor_profiles';
-- If any FK references exist, reassign child rows first.
DELETE FROM public.corridor_profiles
  WHERE corridor_name = 'Naples Airport-Pulling (South)';

-- Verify final count = 25:
-- SELECT COUNT(*) FROM public.corridor_profiles;
