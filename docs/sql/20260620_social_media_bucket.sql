-- 20260620_social_media_bucket.sql
--
-- Create the PUBLIC `social-media` Storage bucket (build-04 go-live Fix A).
-- Holds the rendered social-card PNGs the cron worker uploads before posting.
--
-- PUBLIC is required, not optional: Meta + Instagram fetch the image server-side
-- from a public URL (IG content-publishing REQUIRES a publicly reachable image_url),
-- and X v2 media upload fetches the bytes from the URL too. The card is already
-- brand-watermarked + no-fabrication-gated by the renderer, so it is safe to expose.
--
-- The cron worker uploads with the service-role client (bypasses Storage RLS), and
-- reads are public via getPublicUrl — so no extra storage.objects policies are needed.
--
-- Idempotent: safe to re-run. Run directly (creds .dlt/secrets.toml) — CLAUDE.md RULE 1.

insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do update set public = true;
