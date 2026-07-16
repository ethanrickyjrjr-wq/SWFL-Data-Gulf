-- migrations/20260716_checks_class_column.sql
-- Class axis for the checks ledger — separates what a check IS so the
-- session-start headline can say "open defects: N" instead of one
-- undifferentiated count that mixes bugs with finished-work verifications,
-- banked ideas, and operator to-dos.
-- Spec: docs/superpowers/specs/2026-07-16-checks-class-triage-design.md
-- Check: checks_class_triage_live_verify
--
--   defect — something is wrong in the live product, data, or pipeline
--   verify — work is BUILT and green; awaiting an operator live-verify
--   idea   — banked candidate/proposal; no commitment yet
--   task   — real work to do that isn't a defect (marketing, wiring, decisions)
--
-- NULL = untriaged (pre-existing rows until the classification pass lands).
--
-- Idempotent; run via:
--   bun scripts/run-migration.ts migrations/20260716_checks_class_column.sql

alter table public.checks
  add column if not exists class text;

alter table public.checks
  drop constraint if exists checks_class_valid;

alter table public.checks
  add constraint checks_class_valid
  check (class is null or class in ('defect', 'verify', 'idea', 'task'));
