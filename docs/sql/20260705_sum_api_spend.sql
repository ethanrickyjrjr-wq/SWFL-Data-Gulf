-- Spend-guard aggregate (07/05/2026): PostgREST aggregates are disabled on this
-- project, so the guard sums logged spend through ONE narrow SQL function
-- instead of enabling aggregates globally. Idempotent.
create or replace function public.sum_api_spend(since timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)::numeric from public.api_usage_log where created_at >= since;
$$;

revoke all on function public.sum_api_spend(timestamptz) from public;
grant execute on function public.sum_api_spend(timestamptz) to service_role;

notify pgrst, 'reload schema';
