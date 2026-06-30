# Live Anthropic API Usage Logging → /spend

**Date:** 2026-06-30
**Check:** `api_usage_logging_live_verify`
**Repos:** brain-platform (instrumentation) · swfldatagulf-ops (display)

---

## Problem

Anthropic has no usage API. The /spend ops page shows static estimates computed from codebase token analysis. We need real numbers — every actual dollar spent on every API call, visible live on the spend page.

---

## Scope

Log every Anthropic `messages.create` and `messages.stream` call across the entire codebase — refinery pipeline, assistant, email lab, projects, deliverables. Display today's actual cost and last-30-day totals on `/spend` in swfldatagulf-ops, replacing the static "ACTUAL vs TARGET" estimate with live data.

All 20+ call sites route through `getAnthropic()` in `refinery/agents/anthropic.mts`.

---

## Architecture

### 1. Proxy wrapper at `getAnthropic()`

`refinery/agents/anthropic.mts` exports `getAnthropic(callType?: CallType)`. We return a `Proxy` around the Anthropic SDK client that intercepts `messages.create` and `messages.stream`.

After each call resolves: extract `response.usage`, compute `cost_usd` from hardcoded rates, fire `logApiUsage()` non-blocking. Zero changes to any existing call site. New call sites added in the future are logged automatically.

`callType` parameter is optional, defaults to `"other"` — backward compatible. Six highest-value call sites get tagged explicitly:

- `refinery/agents/synthesis-agent.mts` → `"synthesis"`
- `refinery/agents/triage-agent.mts` → `"triage"`
- `lib/assistant/stream.ts` → `"assistant_stream"`
- `lib/assistant/compose-chart.ts` → `"assistant_chart"`
- `lib/email/build-doc.ts` → `"email_build"`
- `lib/deliverable/build.ts` → `"deliverable_build"`

All other existing callers remain `"other"` — still logged, just not labelled precisely.

```ts
export type CallType =
  | "synthesis"
  | "triage"
  | "assistant_stream"
  | "assistant_chart"
  | "email_build"
  | "deliverable_build"
  | "other";
```

### 2. Token cost rates

Hardcoded in `logApiUsage()`, same values as `ops/lib/spend.ts`:

```
Sonnet 4.6:  $3.00/MTok in · $15.00/MTok out
Haiku 4.5:   $1.00/MTok in ·  $5.00/MTok out
Cache read:  10% of base input rate
Cache write: 25% premium on input rate
```

Model is read from the actual response object — never assumed from context.

### 3. Supabase table: `public.api_usage_log`

```sql
create table if not exists public.api_usage_log (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  model                 text not null,
  call_type             text not null default 'other',
  pack_id               text,
  input_tokens          int  not null default 0,
  output_tokens         int  not null default 0,
  cache_read_tokens     int  not null default 0,
  cache_creation_tokens int  not null default 0,
  cost_usd              numeric(10,6) not null,
  env                   text not null default 'production'
);

create index if not exists api_usage_log_created_at_idx
  on public.api_usage_log (created_at desc);
create index if not exists api_usage_log_call_type_idx
  on public.api_usage_log (call_type, created_at desc);

alter table public.api_usage_log enable row level security;
create policy "service role full access" on public.api_usage_log
  using (true) with check (true);
```

Append-only. No deletes, no updates. `pack_id` is nullable — set only for synthesis and triage calls.

### 4. `logApiUsage()` function

Lives in `refinery/agents/anthropic.mts`. Uses the Supabase service-role client (env vars already present in Vercel prod, `.env.local`, and GHA secrets). Errors are caught and printed to `console.error` — never propagated. If Supabase is unreachable, the API call succeeds unaffected.

Guard: when `agentsAreMocked()` is true, skip logging entirely. Test environments never write to prod Supabase.

### 5. Display: `lib/spend.ts` in swfldatagulf-ops

New `fetchApiUsage()` queries `public.api_usage_log`:

```ts
interface LiveApiUsage {
  todayCostUsd: number;
  last30CostUsd: number;
  last30ByType: Record<string, number>; // callType → total cost
  last30ByDay: { date: string; cost: number }[];
  rowCount: number;
  oldestEntry: string | null;
}
```

`SpendResult` gains `liveApiUsage: LiveApiUsage | null` — null when table is empty or query fails. Page renders static estimates as fallback until real data accumulates.

### 6. /spend page changes

When `liveApiUsage` is present, the API costs panel gains a live row at the top:
- Today's actual cost in large type (live-confirmed)
- Last-30-day total and daily average
- Per-call-type cost bar (synthesis vs assistant vs email vs other)
- Static estimates remain visible as "pre-logging baseline" until 30 days of real data exist

---

## Data flow

```
API call fires anywhere in codebase
  → getAnthropic(callType?) returns Proxy
  → caller: messages.create() or messages.stream()
  → Proxy intercepts, passes through to real Anthropic SDK
  → real response returned to caller (unmodified)
  → Proxy: extract response.usage
  → logApiUsage() fires non-blocking (.catch(console.error))
      → insert row: public.api_usage_log

/spend page load (ISR revalidate=3600)
  → buildSpendReport()
      → fetchApiUsage() → Supabase query (today + 30-day window)
      → static catalog (unchanged)
  → liveApiUsage present → live panel shown
  → liveApiUsage null → static estimates shown (fallback)
```

---

## Error handling

- `logApiUsage()` failure: caught, `console.error`, never propagates. API call unaffected.
- `fetchApiUsage()` failure: returns null. Page falls back to static estimates silently.
- `agentsAreMocked()` true: skip all logging. No test writes to prod.
- `SKIP_USAGE_LOG=1` env var: opt-out for local dev if needed.

---

## Files changed

**brain-platform:**
- `refinery/agents/anthropic.mts` — `CallType` type, `logApiUsage()`, Proxy wrapper, `getAnthropic(callType?)`
- `refinery/agents/synthesis-agent.mts` — `callType: "synthesis"`, pass `packId`
- `refinery/agents/triage-agent.mts` — `callType: "triage"`, pass `packId`
- `lib/assistant/stream.ts` — `callType: "assistant_stream"`
- `lib/assistant/compose-chart.ts` — `callType: "assistant_chart"`
- `lib/email/build-doc.ts` — `callType: "email_build"`
- `lib/deliverable/build.ts` — `callType: "deliverable_build"`
- `migrations/YYYYMMDD_api_usage_log.sql`

**swfldatagulf-ops:**
- `lib/spend.ts` — `fetchApiUsage()`, extend `SpendResult` with `liveApiUsage`
- `app/spend/page.tsx` — live panel in API costs section

---

## Success criteria (`api_usage_logging_live_verify`)

1. Every synthesis call in GHA cron writes a row to `api_usage_log`
2. `/spend` shows today's actual cost within 1 hour of first real call
3. Log write never delays or errors a real API call (fire-and-forget confirmed)
4. `agentsAreMocked()` path skips logging (no test pollution)
5. Page gracefully falls back to static estimates when table is empty
