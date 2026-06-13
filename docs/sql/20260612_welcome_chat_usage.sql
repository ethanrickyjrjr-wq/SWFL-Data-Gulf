-- Insert-only telemetry for the un-grounded welcome chat (Phase 2). No enforcement;
-- Phase 3 reads this to tune the 20-turn / abuse gate against real data.
CREATE TABLE IF NOT EXISTS public.welcome_chat_usage (
  id          bigint generated always as identity primary key,
  cid         text,
  ip          text,
  turn_count  integer,
  created_at  timestamptz not null default now()
);
GRANT INSERT, SELECT ON public.welcome_chat_usage TO service_role;
NOTIFY pgrst, 'reload schema';
