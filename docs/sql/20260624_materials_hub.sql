-- 20260624_materials_hub.sql
--
-- Materials Hub v2: block-canvas emails are stored as `deliverables` rows
-- (template='block-canvas', populated `doc`) so they inherit the existing version
-- lineage, soft-delete, and library surface. Two new columns + one public bucket.
--
-- Idempotent: safe to re-run. Run directly (creds .dlt/secrets.toml) — CLAUDE.md RULE 1.

-- 1. Block-canvas columns. A block-canvas row populates `doc`; every other template
--    leaves it null (global invariant). `data_as_of` is set on each create/refresh and
--    drives the amber "needs update" affordance once it ages past 30 days.
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS doc JSONB;
ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS data_as_of TIMESTAMPTZ;

-- 2. Public bucket for durable email image URLs. Mirrors 20260620_social_media_bucket.sql
--    verbatim (bucket id swapped): the service-role client writes (bypassing Storage RLS)
--    and reads are public via getPublicUrl, so NO extra storage.objects policy is needed.
--    `do update set public = true` is the proven idempotent pattern — it re-asserts public
--    on a re-run rather than silently leaving a pre-existing private bucket unchanged.
insert into storage.buckets (id, name, public)
values ('email-media', 'email-media', true)
on conflict (id) do update set public = true;
