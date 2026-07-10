-- Batch-bake handoff bookkeeping (spec: docs/superpowers/specs/
-- 2026-07-10-batch-narrative-bake-design.md §3). One row per submitted
-- Message Batch; `requests` maps custom_id -> {surface, key, inputsHash}.
-- A row with null collected_at is pending — next bake run's Phase 0 collects.
-- Idempotent — safe to re-run.

create table if not exists public.narrative_bake_batches (
  batch_id     text        primary key,
  requests     jsonb       not null,
  submitted_at timestamptz not null default now(),
  collected_at timestamptz
);

alter table public.narrative_bake_batches enable row level security;

-- Internal bookkeeping: service_role only, no public policies.
grant select, insert, update, delete on public.narrative_bake_batches to service_role;

notify pgrst, 'reload schema';
