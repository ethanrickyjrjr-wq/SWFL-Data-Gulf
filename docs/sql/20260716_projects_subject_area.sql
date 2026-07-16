-- docs/sql/20260716_projects_subject_area.sql
-- Capture-or-blank (spec 2026-07-16): the remembered market area for area-subject
-- template builds, sibling of subject_address. Idempotent.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS subject_area text;
