-- Waitlist for the SWFL Data Gulf landing page.
-- Paste into Supabase SQL editor before /api/waitlist goes live.

create table if not exists public.waitlist (
  id          bigserial primary key,
  email       text not null unique,
  source      text,
  created_at  timestamptz not null default now()
);

-- service_role can insert from the API route
grant insert, select on public.waitlist to service_role;

-- No public access; reads happen via service_role only.
alter table public.waitlist enable row level security;
