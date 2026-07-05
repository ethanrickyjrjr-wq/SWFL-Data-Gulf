import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { env, requireEnv } from "../config/env.mts";

/** Triage = cheap classification. Haiku 4.5. */
export const TRIAGE_MODEL = "claude-haiku-4-5";
/** Synthesis = turning data into refined prose facts. Sonnet 4.6. */
export const SYNTHESIS_MODEL = "claude-sonnet-4-6";

/**
 * When no ANTHROPIC_API_KEY is set, the agents run in deterministic mock mode
 * so the full pipeline (Stages 1-4) is testable offline with zero credentials.
 * A real key → real agents.
 */
export function agentsAreMocked(): boolean {
  return !env.anthropicApiKey;
}

export type CallType =
  | "synthesis"
  | "triage"
  | "assistant_stream"
  | "assistant_chart"
  | "email_build"
  | "deliverable_build"
  | "other";

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** $/MTok. Source: platform.claude.com/docs/en/about-claude/pricing,
 *  verified via crawl4ai 07/01/2026 — mirrors swfldatagulf-ops/lib/spend.ts. */
const RATES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3.0, out: 15.0 },
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
  // Reachable via EMAIL_MODEL_OPUS (lib/email/model-router.ts, "max"/"opus" mode
  // -> email_build call type). Missing this silently priced every Opus call at $0.
  "claude-opus-4-8": { in: 5.0, out: 25.0 },
};
const CACHE_READ_FRACTION = 0.1; // 10% of base input rate
const CACHE_WRITE_PREMIUM = 1.25; // 25% premium on input rate

/**
 * Models before the Claude 4.6 generation (e.g. "claude-haiku-4-5") are
 * convenience aliases that the API resolves to a dated snapshot for serving
 * (verified live via crawl4ai 07/01/2026 against platform.claude.com/docs/en/
 * about-claude/models/model-ids-and-versions). The response `.model` field
 * reports that resolved snapshot (e.g. "claude-haiku-4-5-20251001"), not the
 * alias sent in the request — strip a trailing date so the rate lookup still
 * hits. 4.6-generation-and-later IDs (e.g. "claude-sonnet-4-6") are already
 * pinned snapshots, not aliases, so they're unaffected by this and match
 * RATES directly.
 */
function baseModelId(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

/**
 * Pure cost calculator. An unrecognized model returns 0 rather than guessing
 * a rate — the row still logs (model + token counts preserved) for manual
 * reconciliation instead of inventing a number.
 */
export function computeCostUsd(model: string, usage: UsageLike): number {
  const rate = RATES[model] ?? RATES[baseModelId(model)];
  if (!rate) return 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    (usage.input_tokens / 1_000_000) * rate.in +
    (usage.output_tokens / 1_000_000) * rate.out +
    (cacheRead / 1_000_000) * rate.in * CACHE_READ_FRACTION +
    (cacheWrite / 1_000_000) * rate.in * CACHE_WRITE_PREMIUM
  );
}

export interface LogApiUsageOpts {
  model: string;
  callType: CallType;
  packId?: string | null;
  usage: UsageLike;
  /** Test injection points; production calls omit these and fall through to env.*. */
  supabaseUrl?: string;
  supabaseKey?: string;
}

/**
 * Insert one row into public.api_usage_log. Never throws — a logging failure
 * must not affect the real API call it's reporting on. Skips entirely when
 * mocked, when SKIP_USAGE_LOG=1, or when Supabase env isn't configured.
 */
export async function logApiUsage(opts: LogApiUsageOpts): Promise<void> {
  if (agentsAreMocked()) return;
  if (process.env.SKIP_USAGE_LOG === "1") return;
  const url = opts.supabaseUrl ?? env.supabaseUrl;
  const key = opts.supabaseKey ?? env.supabaseKey;
  if (!url || !key) return;

  try {
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await sb.from("api_usage_log").insert({
      model: opts.model,
      call_type: opts.callType,
      pack_id: opts.packId ?? null,
      input_tokens: opts.usage.input_tokens,
      output_tokens: opts.usage.output_tokens,
      cache_read_tokens: opts.usage.cache_read_input_tokens ?? 0,
      cache_creation_tokens: opts.usage.cache_creation_input_tokens ?? 0,
      cost_usd: computeCostUsd(opts.model, opts.usage),
      env:
        process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
          ? "production"
          : "development",
    });
    if (error) console.error("[api-usage-log] insert failed:", error.message);
  } catch (e) {
    console.error("[api-usage-log] insert threw:", e instanceof Error ? e.message : e);
  }
}

// ── Spend guard (operator directive 07/05/2026) ─────────────────────────────
// HARD daily/monthly caps on LOGGED spend, enforced at this ONE seam before
// every real API call. Caps are env-tunable; breach throws SpendCapError (the
// caller sees a loud, named failure — never a silent drain). The spend window
// is read from public.api_usage_log (the same table every call above logs to)
// and cached in-process for 60s so the gate adds at most one aggregate query
// per minute. Fail-open BY DESIGN when the spend query itself fails (a
// Supabase outage must not kill production builds) — but loudly.
// Known softness (documented, accepted): logging happens after each call, so
// a parallel burst can overshoot the cap by the burst's own cost.

const DEFAULT_DAILY_CAP_USD = 25;
const DEFAULT_MONTHLY_CAP_USD = 250;
const SPEND_CHECK_TTL_MS = 60_000;

export class SpendCapError extends Error {
  constructor(window: "daily" | "monthly", spentUsd: number, capUsd: number) {
    super(
      `[spend-guard] ${window} Anthropic spend cap hit: $${spentUsd.toFixed(2)} logged >= $${capUsd.toFixed(2)} cap. ` +
        `Raise ANTHROPIC_${window === "daily" ? "DAILY" : "MONTHLY"}_SPEND_CAP_USD or set ANTHROPIC_SPEND_CAP_OFF=1 (emergencies only).`,
    );
    this.name = "SpendCapError";
  }
}

export interface SpendCaps {
  dailyUsd: number;
  monthlyUsd: number;
  off: boolean;
}

/** Caps from env — defaults are deliberate: far above a normal day, far below a
 *  runaway. A non-numeric env value falls back to the default (never silently 0,
 *  which would block everything). */
export function spendCaps(e: NodeJS.ProcessEnv = process.env): SpendCaps {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    dailyUsd: num(e.ANTHROPIC_DAILY_SPEND_CAP_USD, DEFAULT_DAILY_CAP_USD),
    monthlyUsd: num(e.ANTHROPIC_MONTHLY_SPEND_CAP_USD, DEFAULT_MONTHLY_CAP_USD),
    off: e.ANTHROPIC_SPEND_CAP_OFF === "1",
  };
}

export interface SpendWindow {
  dayUsd: number;
  monthUsd: number;
}

/** Pure gate — throws SpendCapError on breach; a null window (spend query
 *  failed) passes fail-open (the caller logs the failure loudly). */
export function assertUnderCaps(w: SpendWindow | null, caps: SpendCaps): void {
  if (caps.off || !w) return;
  if (w.dayUsd >= caps.dailyUsd) throw new SpendCapError("daily", w.dayUsd, caps.dailyUsd);
  if (w.monthUsd >= caps.monthlyUsd)
    throw new SpendCapError("monthly", w.monthUsd, caps.monthlyUsd);
}

/** Sum logged spend since UTC month start (one aggregate query), split into
 *  day/month windows. Null on ANY failure — fail-open, caller logs. */
export async function fetchSpendWindow(opts?: {
  supabaseUrl?: string;
  supabaseKey?: string;
}): Promise<SpendWindow | null> {
  const url = opts?.supabaseUrl ?? env.supabaseUrl;
  const key = opts?.supabaseKey ?? env.supabaseKey;
  if (!url || !key) return null;
  try {
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
    // Sum server-side via public.sum_api_spend (docs/sql/20260705_sum_api_spend.sql)
    // — PostgREST aggregates are DISABLED on this project ("Use of aggregate
    // functions is not allowed", probed live 07/05/2026), and fetching a month of
    // raw rows would hit the db-max-rows 1000 cap. The narrow RPC avoids both.
    const [month, day] = await Promise.all([
      sb.rpc("sum_api_spend", { since: monthStart }),
      sb.rpc("sum_api_spend", { since: dayStart }),
    ]);
    if (month.error || day.error) {
      console.error(
        "[spend-guard] sum_api_spend failed — failing OPEN:",
        month.error?.message ?? day.error?.message,
      );
      return null;
    }
    return { dayUsd: Number(day.data ?? 0), monthUsd: Number(month.data ?? 0) };
  } catch (e) {
    console.error(
      "[spend-guard] spend query threw — failing OPEN:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

let spendGateCache: { at: number; window: SpendWindow | null } | null = null;

/** The gate `wrapMessages` runs before each real call. Cached 60s. Streams use
 *  the last-known window synchronously (stream() must return immediately) and
 *  trigger a refresh; creates await the fresh check. */
async function checkSpendGuardAsync(): Promise<void> {
  const caps = spendCaps();
  if (caps.off || agentsAreMocked()) return;
  const now = Date.now();
  if (!spendGateCache || now - spendGateCache.at > SPEND_CHECK_TTL_MS) {
    spendGateCache = { at: now, window: await fetchSpendWindow() };
  }
  assertUnderCaps(spendGateCache.window, caps);
}

function checkSpendGuardSync(): void {
  const caps = spendCaps();
  if (caps.off || agentsAreMocked()) return;
  const now = Date.now();
  if (!spendGateCache || now - spendGateCache.at > SPEND_CHECK_TTL_MS) {
    // Kick a refresh; gate this call on the last-known window (below).
    void checkSpendGuardAsync().catch(() => {});
  }
  assertUnderCaps(spendGateCache?.window ?? null, caps);
}

/** Test hook — reset the in-process gate cache. */
export function __resetSpendGateCacheForTests(): void {
  spendGateCache = null;
}

let cached: Anthropic | null = null;

function getRawClient(): Anthropic {
  if (cached) return cached;
  requireEnv(["anthropicApiKey"]);
  cached = new Anthropic({ apiKey: env.anthropicApiKey });
  return cached;
}

/**
 * Wraps only `.messages.create` / `.messages.stream` — the only two methods
 * any call site in this codebase invokes on the client (verified via grep
 * for `client\.(beta|models|batches)\.` — zero hits). A `Proxy` `get` trap,
 * not a plain-object spread: `raw.messages`'s own-enumerable keys are only
 * `_client`/`batches` (verified directly against the installed SDK) —
 * `create`/`stream` live on the `Messages` class prototype, so
 * `{...raw.messages}` silently drops them. `Reflect.get(target, prop,
 * target)` (passing `target`, not the proxy, as the receiver) forwards every
 * other property through correctly, including prototype getters, without
 * risking a private-class-field `this`-binding surprise (those would throw
 * if invoked with `this` = the proxy instead of the real instance).
 */
function wrapMessages(raw: Anthropic, callType: CallType): Anthropic["messages"] {
  const realCreate = raw.messages.create.bind(raw.messages);
  const realStream = raw.messages.stream.bind(raw.messages);

  const wrappedCreate = (async (...args: Parameters<typeof realCreate>) => {
    await checkSpendGuardAsync(); // throws SpendCapError on breach — never a silent drain
    const response = await realCreate(...args);
    // Non-streaming Message has `.usage` directly; a `stream:true` Message
    // stream response does not — skip those (call sites use .stream() for
    // streaming today; this guard just keeps the wrapper honest either way).
    if (response && typeof response === "object" && "usage" in response) {
      void logApiUsage({
        model: (response as Anthropic.Message).model,
        callType,
        usage: (response as Anthropic.Message).usage,
      }).catch((e) => console.error("[api-usage-log] create hook failed:", e));
    }
    return response;
  }) as typeof realCreate;

  const wrappedStream = ((...args: Parameters<typeof realStream>) => {
    checkSpendGuardSync(); // last-known window (stream() must return sync) + async refresh
    const stream = realStream(...args);
    stream
      .finalMessage()
      .then((msg) => logApiUsage({ model: msg.model, callType, usage: msg.usage }))
      .catch((e) => console.error("[api-usage-log] stream hook failed:", e));
    return stream;
  }) as typeof realStream;

  return new Proxy(raw.messages, {
    get(target, prop, _receiver) {
      if (prop === "create") return wrappedCreate;
      if (prop === "stream") return wrappedStream;
      return Reflect.get(target, prop, target);
    },
  });
}

const wrappedByCallType = new Map<CallType, Anthropic>();

/** Shared Anthropic client. Only call when NOT in mock mode. Every real call
 *  is logged to public.api_usage_log; pass callType to label it (defaults to
 *  "other", fully backward compatible with existing zero-arg call sites).
 *  A `Proxy` `get` trap intercepts only `.messages`, forwarding every other
 *  top-level property (models/beta/apiKey/...) straight through to `raw`. */
export function getAnthropic(callType: CallType = "other"): Anthropic {
  const existing = wrappedByCallType.get(callType);
  if (existing) return existing;
  const raw = getRawClient();
  const wrappedMessages = wrapMessages(raw, callType);
  const wrapped = new Proxy(raw, {
    get(target, prop, _receiver) {
      if (prop === "messages") return wrappedMessages;
      return Reflect.get(target, prop, target);
    },
  }) as Anthropic;
  wrappedByCallType.set(callType, wrapped);
  return wrapped;
}
