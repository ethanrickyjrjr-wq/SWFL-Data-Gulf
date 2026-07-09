-- Baked narrative sections for report surfaces (spec: docs/superpowers/specs/
-- 2026-07-09-zip-page-destination-design.md, Phase B). Surface-generic from day
-- one: ('zip','33920'), later ('corridor','…'), ('brain','…'), etc.
-- Idempotent — safe to re-run.

create table if not exists public.narratives (
  surface      text        not null,
  surface_key  text        not null,
  sections     jsonb       not null,
  inputs_hash  text        not null,
  sources      jsonb       not null default '[]'::jsonb,
  model        text        not null,
  baked_at     timestamptz not null default now(),
  primary key (surface, surface_key)
);

alter table public.narratives enable row level security;

drop policy if exists narratives_public_read on public.narratives;
create policy narratives_public_read on public.narratives
  for select using (true);

grant select on public.narratives to anon, authenticated;
grant select, insert, update, delete on public.narratives to service_role;

notify pgrst, 'reload schema';
