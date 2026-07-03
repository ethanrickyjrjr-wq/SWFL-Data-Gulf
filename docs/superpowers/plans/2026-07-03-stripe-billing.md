# Stripe Checkout + Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 11 tasks, 19 files, keywords: migration, schema, architecture

**Goal:** Users pay for Starter/Growth/Pro send tiers via Stripe hosted Checkout; the webhook flips their tier in a new `billing_subscriptions` table; the send quota enforces it; the customer portal handles cancel/upgrade.

**Architecture:** Adapter + pure-core, mirroring `app/api/webhooks/resend/route.ts`: three thin routes (checkout, portal, webhook) over a unit-tested pure core (`lib/billing/stripe-sync.ts`). One price root (`lib/billing/tiers.ts`) that /billing and the future homepage both import. `billing_subscriptions` becomes the tier source of truth; `email_usage` stays a pure send counter.

**Tech Stack:** Next.js App Router (nodejs runtime), `stripe` npm SDK, Supabase (typed service-role + cookie clients), bun:test with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-03-stripe-billing-design.md` (APPROVED). Parent: `2026-07-02-commercial-spine-design.md` D1.

## Global Constraints

- Prices (final, from spec): Starter $29/mo · $290/yr · 500 sends; Growth $79/mo · $790/yr · 2,000 sends; Pro $149/mo · $1,490/yr · 10,000 sends. Free = 50 sends, no card. Annual badge copy: "2 months free".
- Lookup keys verbatim: `swfl_starter_monthly`, `swfl_starter_annual`, `swfl_growth_monthly`, `swfl_growth_annual`, `swfl_pro_monthly`, `swfl_pro_annual`.
- Keep-through-dunning: `past_due` keeps the paid tier; only `customer.subscription.deleted` reverts to free.
- `checkUsageLimit` keeps NEVER-THROW + FAIL-OPEN semantics.
- Webhook always returns 200 for handled/ignored events; 401 bad signature; 500 unset secret.
- No `git push` in this plan — commit locally; operator pushes (append SESSION_LOG before push).
- `bun install` for the `stripe` package must commit `bun.lock` in the same commit (pre-push gate 1).
- Verify with `bunx next build`, never bare `npx tsc`.
- SQL migration idempotent, run via Bun.SQL with `.dlt/secrets.toml` creds, verify after.
- If a Stripe SDK type disagrees with this plan (field locations move between API versions — e.g. `current_period_end` may live on the subscription item rather than the subscription), TRUST THE SDK TYPES and adapt the adapter, keeping the pure-core interface unchanged.

---

### Task 1: Migration — `billing_subscriptions` table + regenerate DB types

**Files:**
- Create: `migrations/20260703_billing_subscriptions.sql`
- Create: `scratch-run-migration.mts` (temporary runner, deleted in this task)
- Regenerate: `database-generated.types.ts` (via `bun run gen:types`)

**Interfaces:**
- Produces: table `public.billing_subscriptions` (user_id uuid PK, stripe_customer_id text unique not null, stripe_subscription_id text null, tier text default 'free', status text default 'none', current_period_end timestamptz null, created_at/updated_at timestamptz). Typed client knows it after regen.

- [ ] **Step 1: Write the migration**

```sql
-- Idempotent: billing_subscriptions — Stripe tier source of truth (Lane A).
-- checkUsageLimit reads tier here; email_usage stays a pure send counter.
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  user_id                uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  stripe_customer_id     text UNIQUE NOT NULL,
  stripe_subscription_id text,
  tier                   text NOT NULL DEFAULT 'free',
  status                 text NOT NULL DEFAULT 'none',
  current_period_end     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_customer_idx
  ON public.billing_subscriptions (stripe_customer_id);

-- RLS on, no row policies: service_role is the only reader/writer
-- (matches 20260701_api_usage_log.sql).
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.billing_subscriptions TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Run it via Bun.SQL** (psql is not installed)

```ts
// scratch-run-migration.mts — temporary, delete after run
import { SQL } from "bun";
import { readFileSync } from "node:fs";
const toml = readFileSync(".dlt/secrets.toml", "utf8");
const get = (k: string) => toml.match(new RegExp(`${k}\\s*=\\s*"([^"]+)"`))?.[1];
const sql = new SQL(
  `postgresql://${get("username")}:${encodeURIComponent(get("password") ?? "")}@${get("host")}:${get("port") ?? "5432"}/${get("database")}?sslmode=require`,
);
await sql.unsafe(readFileSync("migrations/20260703_billing_subscriptions.sql", "utf8"));
const [{ count }] = await sql`SELECT count(*)::int AS count FROM public.billing_subscriptions`;
console.log(`billing_subscriptions exists, rows: ${count}`);
await sql.end();
```

Run: `bun scratch-run-migration.mts`
Expected: `billing_subscriptions exists, rows: 0`
Then: `rm scratch-run-migration.mts`

- [ ] **Step 3: Regenerate DB types**

Run: `bun run gen:types`
Expected: output includes `billing_subscriptions` in the table count; `git diff database-generated.types.ts` shows the new table's Row/Insert/Update types.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260703_billing_subscriptions.sql database-generated.types.ts
git commit -m "feat(billing): billing_subscriptions table — Stripe tier source of truth"
```

---

### Task 2: Price root — `lib/billing/tiers.ts` + mirror test

**Files:**
- Create: `lib/billing/tiers.ts`
- Test: `lib/billing/tiers.test.ts`

**Interfaces:**
- Consumes: `tierLimit(tier: string): number` from `lib/email/usage.ts` (existing).
- Produces: `type PaidTierSlug = "starter" | "growth" | "pro"`; `interface BillingTier { slug: PaidTierSlug; name: string; sendsPerMonth: number; priceMonthlyUsd: number; priceAnnualUsd: number; lookupKeyMonthly: string; lookupKeyAnnual: string }`; `const BILLING_TIERS: readonly BillingTier[]`; `const FREE_SENDS_PER_MONTH = 50`; `const ALL_LOOKUP_KEYS: readonly string[]`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/billing/tiers.test.ts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { BILLING_TIERS, FREE_SENDS_PER_MONTH, ALL_LOOKUP_KEYS } from "./tiers.ts";
import { tierLimit } from "../email/usage.ts";

describe("BILLING_TIERS", () => {
  test("mirrors TIER_LIMITS in lib/email/usage.ts exactly", () => {
    for (const t of BILLING_TIERS) {
      assert.equal(t.sendsPerMonth, tierLimit(t.slug), `sends mismatch for ${t.slug}`);
    }
    assert.equal(FREE_SENDS_PER_MONTH, tierLimit("free"));
  });

  test("spec prices: 29/79/149 monthly, 290/790/1490 annual (2 months free)", () => {
    const bySlug = Object.fromEntries(BILLING_TIERS.map((t) => [t.slug, t]));
    assert.equal(bySlug.starter.priceMonthlyUsd, 29);
    assert.equal(bySlug.starter.priceAnnualUsd, 290);
    assert.equal(bySlug.growth.priceMonthlyUsd, 79);
    assert.equal(bySlug.growth.priceAnnualUsd, 790);
    assert.equal(bySlug.pro.priceMonthlyUsd, 149);
    assert.equal(bySlug.pro.priceAnnualUsd, 1490);
    // annual = 10 months of monthly, for every tier — the "2 months free" invariant
    for (const t of BILLING_TIERS) assert.equal(t.priceAnnualUsd, t.priceMonthlyUsd * 10);
  });

  test("lookup keys are unique and follow swfl_<tier>_<interval>", () => {
    assert.equal(new Set(ALL_LOOKUP_KEYS).size, 6);
    for (const t of BILLING_TIERS) {
      assert.equal(t.lookupKeyMonthly, `swfl_${t.slug}_monthly`);
      assert.equal(t.lookupKeyAnnual, `swfl_${t.slug}_annual`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/billing/tiers.test.ts`
Expected: FAIL — cannot resolve `./tiers.ts`

- [ ] **Step 3: Implement**

```ts
// lib/billing/tiers.ts
/**
 * THE one price root (commercial spine D1, approved 07/02/2026).
 * /billing renders from this; the homepage pricing strip imports the SAME
 * file. No price literal may appear anywhere else. sendsPerMonth mirrors
 * TIER_LIMITS in lib/email/usage.ts — tiers.test.ts enforces the mirror.
 */
export type PaidTierSlug = "starter" | "growth" | "pro";

export interface BillingTier {
  slug: PaidTierSlug;
  name: string;
  sendsPerMonth: number;
  priceMonthlyUsd: number;
  priceAnnualUsd: number;
  lookupKeyMonthly: string;
  lookupKeyAnnual: string;
}

export const FREE_SENDS_PER_MONTH = 50;

export const BILLING_TIERS: readonly BillingTier[] = [
  {
    slug: "starter",
    name: "Starter",
    sendsPerMonth: 500,
    priceMonthlyUsd: 29,
    priceAnnualUsd: 290,
    lookupKeyMonthly: "swfl_starter_monthly",
    lookupKeyAnnual: "swfl_starter_annual",
  },
  {
    slug: "growth",
    name: "Growth",
    sendsPerMonth: 2000,
    priceMonthlyUsd: 79,
    priceAnnualUsd: 790,
    lookupKeyMonthly: "swfl_growth_monthly",
    lookupKeyAnnual: "swfl_growth_annual",
  },
  {
    slug: "pro",
    name: "Pro",
    sendsPerMonth: 10000,
    priceMonthlyUsd: 149,
    priceAnnualUsd: 1490,
    lookupKeyMonthly: "swfl_pro_monthly",
    lookupKeyAnnual: "swfl_pro_annual",
  },
] as const;

export const ALL_LOOKUP_KEYS: readonly string[] = BILLING_TIERS.flatMap((t) => [
  t.lookupKeyMonthly,
  t.lookupKeyAnnual,
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/billing/tiers.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/billing/tiers.ts lib/billing/tiers.test.ts
git commit -m "feat(billing): tiers.ts price root — one source for /billing and homepage"
```

---

### Task 3: Pure core — `lib/billing/stripe-sync.ts`

**Files:**
- Create: `lib/billing/stripe-sync.ts`
- Test: `lib/billing/stripe-sync.test.ts`

**Interfaces:**
- Consumes: `ALL_LOOKUP_KEYS`, `PaidTierSlug` from `./tiers.ts`.
- Produces (Task 5 webhook adapter relies on these exact signatures):
  - `type TierSlug = "free" | "starter" | "growth" | "pro"`
  - `interface NormalizedStripeEvent { type: string; customerId: string | null; subscriptionId?: string | null; clientReferenceId?: string | null; lookupKey?: string | null; status?: string | null; currentPeriodEndIso?: string | null }`
  - `interface SubscriptionMutation { user_id?: string; stripe_customer_id: string; stripe_subscription_id?: string | null; tier?: TierSlug; status?: string; current_period_end?: string | null; updated_at: string }`
  - `tierFromLookupKey(key: string | null | undefined): TierSlug | null`
  - `subscriptionMutationFromEvent(e: NormalizedStripeEvent, nowIso: string): SubscriptionMutation | null`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/billing/stripe-sync.test.ts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import {
  tierFromLookupKey,
  subscriptionMutationFromEvent,
  type NormalizedStripeEvent,
} from "./stripe-sync.ts";

const NOW = "2026-07-03T12:00:00.000Z";

function ev(partial: Partial<NormalizedStripeEvent>): NormalizedStripeEvent {
  return { type: "unknown", customerId: "cus_1", ...partial };
}

describe("tierFromLookupKey", () => {
  test("maps every registered lookup key", () => {
    assert.equal(tierFromLookupKey("swfl_starter_monthly"), "starter");
    assert.equal(tierFromLookupKey("swfl_starter_annual"), "starter");
    assert.equal(tierFromLookupKey("swfl_growth_monthly"), "growth");
    assert.equal(tierFromLookupKey("swfl_pro_annual"), "pro");
  });
  test("unknown key → null, never a guess", () => {
    assert.equal(tierFromLookupKey("swfl_mega_monthly"), null);
    assert.equal(tierFromLookupKey(null), null);
    assert.equal(tierFromLookupKey(undefined), null);
  });
});

describe("subscriptionMutationFromEvent", () => {
  test("checkout.session.completed → full row with user_id", () => {
    const m = subscriptionMutationFromEvent(
      ev({
        type: "checkout.session.completed",
        clientReferenceId: "user-1",
        subscriptionId: "sub_1",
        lookupKey: "swfl_growth_monthly",
        status: "active",
        currentPeriodEndIso: "2026-08-03T12:00:00.000Z",
      }),
      NOW,
    );
    assert.deepEqual(m, {
      user_id: "user-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      tier: "growth",
      status: "active",
      current_period_end: "2026-08-03T12:00:00.000Z",
      updated_at: NOW,
    });
  });

  test("checkout without client_reference_id → null (never invent a row)", () => {
    const m = subscriptionMutationFromEvent(
      ev({ type: "checkout.session.completed", lookupKey: "swfl_pro_monthly" }),
      NOW,
    );
    assert.equal(m, null);
  });

  test("subscription.updated past_due KEEPS the paid tier (dunning policy)", () => {
    const m = subscriptionMutationFromEvent(
      ev({
        type: "customer.subscription.updated",
        subscriptionId: "sub_1",
        lookupKey: "swfl_starter_monthly",
        status: "past_due",
      }),
      NOW,
    );
    assert.equal(m?.tier, "starter");
    assert.equal(m?.status, "past_due");
  });

  test("subscription.deleted → tier free, status canceled", () => {
    const m = subscriptionMutationFromEvent(
      ev({ type: "customer.subscription.deleted", subscriptionId: "sub_1" }),
      NOW,
    );
    assert.equal(m?.tier, "free");
    assert.equal(m?.status, "canceled");
    assert.equal(m?.stripe_subscription_id, null);
  });

  test("invoice.paid / invoice.payment_failed → status+period only, NO tier field", () => {
    const paid = subscriptionMutationFromEvent(
      ev({ type: "invoice.paid", status: "active", currentPeriodEndIso: "2026-08-01T00:00:00.000Z" }),
      NOW,
    );
    assert.equal(paid?.tier, undefined);
    assert.equal(paid?.status, "active");
    const failed = subscriptionMutationFromEvent(
      ev({ type: "invoice.payment_failed", status: "past_due" }),
      NOW,
    );
    assert.equal(failed?.tier, undefined);
    assert.equal(failed?.status, "past_due");
  });

  test("unhandled event type → null", () => {
    assert.equal(subscriptionMutationFromEvent(ev({ type: "charge.refunded" }), NOW), null);
  });

  test("missing customerId → null", () => {
    assert.equal(
      subscriptionMutationFromEvent(ev({ type: "invoice.paid", customerId: null }), NOW),
      null,
    );
  });

  test("updated with UNKNOWN lookup key → null (never guess a tier)", () => {
    const m = subscriptionMutationFromEvent(
      ev({ type: "customer.subscription.updated", lookupKey: "swfl_mystery", status: "active" }),
      NOW,
    );
    assert.equal(m, null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/billing/stripe-sync.test.ts`
Expected: FAIL — cannot resolve `./stripe-sync.ts`

- [ ] **Step 3: Implement**

```ts
// lib/billing/stripe-sync.ts
/**
 * Pure core for Stripe webhook → billing_subscriptions sync. NO I/O.
 * The webhook route (app/api/stripe/webhook) normalizes the Stripe event
 * (doing any retrieves it needs) and hands a NormalizedStripeEvent here;
 * this module encodes ALL policy:
 *   - keep-through-dunning: past_due keeps the paid tier
 *   - only subscription.deleted reverts to free
 *   - invoice events touch status/period only, never tier
 *   - unknown lookup keys and unresolvable users → null, never a guess
 */
import { BILLING_TIERS } from "./tiers.ts";

export type TierSlug = "free" | "starter" | "growth" | "pro";

export interface NormalizedStripeEvent {
  type: string;
  customerId: string | null;
  subscriptionId?: string | null;
  clientReferenceId?: string | null;
  lookupKey?: string | null;
  status?: string | null;
  currentPeriodEndIso?: string | null;
}

export interface SubscriptionMutation {
  user_id?: string;
  stripe_customer_id: string;
  stripe_subscription_id?: string | null;
  tier?: TierSlug;
  status?: string;
  current_period_end?: string | null;
  updated_at: string;
}

const KEY_TO_TIER: Record<string, TierSlug> = Object.fromEntries(
  BILLING_TIERS.flatMap((t) => [
    [t.lookupKeyMonthly, t.slug],
    [t.lookupKeyAnnual, t.slug],
  ]),
);

export function tierFromLookupKey(key: string | null | undefined): TierSlug | null {
  if (!key) return null;
  return KEY_TO_TIER[key] ?? null;
}

export function subscriptionMutationFromEvent(
  e: NormalizedStripeEvent,
  nowIso: string,
): SubscriptionMutation | null {
  if (!e.customerId) return null;
  const base = { stripe_customer_id: e.customerId, updated_at: nowIso };

  switch (e.type) {
    case "checkout.session.completed": {
      if (!e.clientReferenceId) return null; // never invent a user
      const tier = tierFromLookupKey(e.lookupKey);
      if (!tier) return null;
      return {
        ...base,
        user_id: e.clientReferenceId,
        stripe_subscription_id: e.subscriptionId ?? null,
        tier,
        status: e.status ?? "active",
        current_period_end: e.currentPeriodEndIso ?? null,
      };
    }
    case "customer.subscription.updated": {
      const tier = tierFromLookupKey(e.lookupKey);
      if (!tier) return null; // unknown price — refuse to guess
      return {
        ...base,
        stripe_subscription_id: e.subscriptionId ?? null,
        tier, // past_due keeps this tier: keep-through-dunning
        status: e.status ?? "active",
        current_period_end: e.currentPeriodEndIso ?? null,
      };
    }
    case "customer.subscription.deleted":
      return { ...base, stripe_subscription_id: null, tier: "free", status: "canceled" };
    case "invoice.paid":
    case "invoice.payment_failed":
      return {
        ...base,
        status: e.status ?? (e.type === "invoice.paid" ? "active" : "past_due"),
        current_period_end: e.currentPeriodEndIso ?? null,
      };
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/billing/stripe-sync.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/billing/stripe-sync.ts lib/billing/stripe-sync.test.ts
git commit -m "feat(billing): stripe-sync pure core — event→mutation policy, keep-through-dunning"
```

---

### Task 4: Stripe SDK + client singleton

**Files:**
- Modify: `package.json` (+ `bun.lock` — same commit, pre-push gate 1)
- Create: `lib/billing/stripe-client.ts`

**Interfaces:**
- Produces: `getStripe(): Stripe` — throws `Error("STRIPE_SECRET_KEY unset")` when unconfigured (routes catch and 500). Tasks 5–7 and the setup script consume it.

- [ ] **Step 1: Install the SDK**

Run: `bun add stripe`
Expected: `package.json` gains `"stripe"`, `bun.lock` updated.

- [ ] **Step 2: Implement the singleton**

```ts
// lib/billing/stripe-client.ts
/**
 * ONE Stripe client. Server-only. Hosted Checkout + portal means no
 * publishable key and no Stripe.js anywhere in the app.
 * No apiVersion pin: the SDK's bundled version is the one its types match.
 */
import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY unset");
  client ??= new Stripe(key);
  return client;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | Select-String "stripe-client"` (quick scope check) — full gate is `bunx next build` in Task 9.
Expected: no output (no errors in the new file).

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock lib/billing/stripe-client.ts
git commit -m "feat(billing): stripe SDK + server-only client singleton"
```

---

### Task 5: Webhook route — `app/api/stripe/webhook/route.ts`

**Files:**
- Create: `app/api/stripe/webhook/route.ts`
- Create: `lib/billing/normalize-event.ts`
- Test: `lib/billing/normalize-event.test.ts`

**Interfaces:**
- Consumes: `getStripe()` (Task 4); `subscriptionMutationFromEvent`, `NormalizedStripeEvent` (Task 3); `createServiceRoleClient` from `@/utils/supabase/service-role`.
- Produces: `normalizeEvent(event: Stripe.Event, fetchSubscription: (id: string) => Promise<SubscriptionFacts | null>): Promise<NormalizedStripeEvent>` where `interface SubscriptionFacts { lookupKey: string | null; status: string; currentPeriodEndIso: string | null; customerId: string | null }`.

- [ ] **Step 1: Write the failing normalize tests**

```ts
// lib/billing/normalize-event.test.ts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { normalizeEvent, type SubscriptionFacts } from "./normalize-event.ts";

const FACTS: SubscriptionFacts = {
  lookupKey: "swfl_growth_monthly",
  status: "active",
  currentPeriodEndIso: "2026-08-03T00:00:00.000Z",
  customerId: "cus_1",
};
const fetchFacts = async () => FACTS;
const fetchNever = async () => {
  throw new Error("should not fetch");
};

// Minimal Stripe.Event shapes — only the fields normalizeEvent reads.
function stripeEvent(type: string, object: Record<string, unknown>) {
  return { type, data: { object } } as unknown as Parameters<typeof normalizeEvent>[0];
}

describe("normalizeEvent", () => {
  test("checkout.session.completed fetches subscription facts for the lookup key", async () => {
    const n = await normalizeEvent(
      stripeEvent("checkout.session.completed", {
        customer: "cus_1",
        subscription: "sub_1",
        client_reference_id: "user-1",
      }),
      fetchFacts,
    );
    assert.equal(n.type, "checkout.session.completed");
    assert.equal(n.customerId, "cus_1");
    assert.equal(n.subscriptionId, "sub_1");
    assert.equal(n.clientReferenceId, "user-1");
    assert.equal(n.lookupKey, "swfl_growth_monthly");
    assert.equal(n.status, "active");
  });

  test("customer.subscription.updated reads facts from the event object itself", async () => {
    const n = await normalizeEvent(
      stripeEvent("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_1",
        status: "past_due",
        items: { data: [{ price: { lookup_key: "swfl_starter_monthly" } }] },
      }),
      fetchNever,
    );
    assert.equal(n.lookupKey, "swfl_starter_monthly");
    assert.equal(n.status, "past_due");
    assert.equal(n.subscriptionId, "sub_1");
  });

  test("customer.subscription.deleted needs no fetch", async () => {
    const n = await normalizeEvent(
      stripeEvent("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" }),
      fetchNever,
    );
    assert.equal(n.type, "customer.subscription.deleted");
    assert.equal(n.customerId, "cus_1");
  });

  test("invoice.paid fetches subscription facts when a subscription id is present", async () => {
    const n = await normalizeEvent(
      stripeEvent("invoice.paid", {
        customer: "cus_1",
        parent: { subscription_details: { subscription: "sub_1" } },
      }),
      fetchFacts,
    );
    assert.equal(n.status, "active");
    assert.equal(n.currentPeriodEndIso, "2026-08-03T00:00:00.000Z");
  });

  test("unhandled type passes through with customer only", async () => {
    const n = await normalizeEvent(stripeEvent("charge.refunded", { customer: "cus_9" }), fetchNever);
    assert.equal(n.type, "charge.refunded");
    assert.equal(n.customerId, "cus_9");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/billing/normalize-event.test.ts`
Expected: FAIL — cannot resolve `./normalize-event.ts`

- [ ] **Step 3: Implement normalize-event**

```ts
// lib/billing/normalize-event.ts
/**
 * Stripe.Event → NormalizedStripeEvent. The ONLY file that knows where
 * Stripe hides fields per event type (they move across API versions —
 * trust the SDK types when they disagree with comments here).
 * fetchSubscription is injected so tests never touch the network.
 */
import type Stripe from "stripe";
import type { NormalizedStripeEvent } from "./stripe-sync.ts";

export interface SubscriptionFacts {
  lookupKey: string | null;
  status: string;
  currentPeriodEndIso: string | null;
  customerId: string | null;
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "id" in v) return String((v as { id: unknown }).id);
  return null;
}

/** Pull lookup key / status / period end off a subscription-shaped object. */
function factsFromSubscriptionObject(sub: Record<string, unknown>): SubscriptionFacts {
  const items = (sub.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  const first = items[0] ?? {};
  const price = first.price as { lookup_key?: string | null } | undefined;
  // current_period_end lives on the item in newer API versions, on the
  // subscription in older ones — accept either.
  const periodEnd =
    (first.current_period_end as number | undefined) ??
    (sub.current_period_end as number | undefined) ??
    null;
  return {
    lookupKey: price?.lookup_key ?? null,
    status: typeof sub.status === "string" ? sub.status : "active",
    currentPeriodEndIso: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    customerId: str(sub.customer),
  };
}

export async function normalizeEvent(
  event: Stripe.Event,
  fetchSubscription: (id: string) => Promise<SubscriptionFacts | null>,
): Promise<NormalizedStripeEvent> {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const base: NormalizedStripeEvent = { type: event.type, customerId: str(obj.customer) };

  switch (event.type) {
    case "checkout.session.completed": {
      const subscriptionId = str(obj.subscription);
      const facts = subscriptionId ? await fetchSubscription(subscriptionId) : null;
      return {
        ...base,
        subscriptionId,
        clientReferenceId:
          typeof obj.client_reference_id === "string" ? obj.client_reference_id : null,
        lookupKey: facts?.lookupKey ?? null,
        status: facts?.status ?? "active",
        currentPeriodEndIso: facts?.currentPeriodEndIso ?? null,
      };
    }
    case "customer.subscription.updated": {
      const facts = factsFromSubscriptionObject(obj);
      return {
        ...base,
        subscriptionId: typeof obj.id === "string" ? obj.id : null,
        lookupKey: facts.lookupKey,
        status: facts.status,
        currentPeriodEndIso: facts.currentPeriodEndIso,
      };
    }
    case "customer.subscription.deleted":
      return { ...base, subscriptionId: typeof obj.id === "string" ? obj.id : null };
    case "invoice.paid":
    case "invoice.payment_failed": {
      // Invoice → subscription id location varies by API version; check the
      // modern parent path first, then the legacy top-level field.
      const parent = obj.parent as
        | { subscription_details?: { subscription?: unknown } }
        | undefined;
      const subscriptionId = str(parent?.subscription_details?.subscription) ?? str(obj.subscription);
      const facts = subscriptionId ? await fetchSubscription(subscriptionId) : null;
      return {
        ...base,
        subscriptionId,
        status: facts?.status ?? (event.type === "invoice.paid" ? "active" : "past_due"),
        currentPeriodEndIso: facts?.currentPeriodEndIso ?? null,
      };
    }
    default:
      return base;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/billing/normalize-event.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Implement the route (adapter — no unit test; policy is covered by Tasks 3+5 tests, flow by the e2e)**

```ts
// app/api/stripe/webhook/route.ts
/**
 * Stripe webhook — the ONLY writer of billing_subscriptions tier state.
 * Same refuse-to-process pattern as app/api/webhooks/resend/route.ts:
 * unset secret → 500, bad signature → 401. Handled/ignored events → 200
 * always, so Stripe never retry-storms. Idempotent: upsert keyed on user
 * (checkout) or update keyed on customer id (everything else).
 */
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getStripe } from "@/lib/billing/stripe-client";
import { normalizeEvent, type SubscriptionFacts } from "@/lib/billing/normalize-event";
import { subscriptionMutationFromEvent } from "@/lib/billing/stripe-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET unset — refusing to process.");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      raw,
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  const fetchSubscription = async (id: string): Promise<SubscriptionFacts | null> => {
    try {
      const sub = await getStripe().subscriptions.retrieve(id);
      const item = sub.items.data[0];
      const periodEnd =
        (item as unknown as { current_period_end?: number }).current_period_end ??
        (sub as unknown as { current_period_end?: number }).current_period_end ??
        null;
      return {
        lookupKey: item?.price.lookup_key ?? null,
        status: sub.status,
        currentPeriodEndIso: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      };
    } catch (err) {
      console.error("[stripe-webhook] subscription retrieve failed:", err);
      return null;
    }
  };

  const normalized = await normalizeEvent(event, fetchSubscription);
  const mutation = subscriptionMutationFromEvent(normalized, new Date().toISOString());
  if (!mutation) return NextResponse.json({ received: true, ignored: true });

  const db = createServiceRoleClient();
  if (mutation.user_id) {
    // checkout: we know the user — upsert the full row.
    const { error } = await db
      .from("billing_subscriptions")
      .upsert(mutation, { onConflict: "user_id" });
    if (error) console.error("[stripe-webhook] upsert failed:", error.message);
  } else {
    // subscription/invoice events: keyed by customer id. A miss means we
    // never saw the checkout — log and ack (never invent a row).
    const { stripe_customer_id, ...fields } = mutation;
    const { error, count } = await db
      .from("billing_subscriptions")
      .update(fields, { count: "exact" })
      .eq("stripe_customer_id", stripe_customer_id);
    if (error) console.error("[stripe-webhook] update failed:", error.message);
    else if (count === 0)
      console.error(`[stripe-webhook] no row for customer ${stripe_customer_id} (${event.type})`);
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 6: Full billing suite + commit**

Run: `bun test lib/billing/`
Expected: PASS (tiers 3, stripe-sync 9, normalize-event 5)

```bash
git add lib/billing/normalize-event.ts lib/billing/normalize-event.test.ts app/api/stripe/webhook/route.ts
git commit -m "feat(billing): stripe webhook — signature-verified, idempotent tier sync"
```

---

### Task 6: Checkout route — `app/api/stripe/checkout/route.ts`

**Files:**
- Create: `app/api/stripe/checkout/route.ts`

**Interfaces:**
- Consumes: `getStripe()` (Task 4); `BILLING_TIERS` (Task 2); cookie-auth pattern from `app/api/projects/[id]/route.ts`; `createServiceRoleClient`.
- Produces: `POST {tier: "starter"|"growth"|"pro", interval: "monthly"|"annual"} → {url: string}` — the /billing page (Task 8) calls this.

- [ ] **Step 1: Implement**

```ts
// app/api/stripe/checkout/route.ts
/**
 * POST {tier, interval} → Stripe hosted Checkout URL (mode=subscription).
 * Cookie-authed user required. Customer created once, reused forever
 * (billing_subscriptions.stripe_customer_id). Price resolved by lookup key
 * so no Stripe price IDs live in code.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getStripe } from "@/lib/billing/stripe-client";
import { BILLING_TIERS } from "@/lib/billing/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
}

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    tier?: string;
    interval?: string;
  } | null;
  const tier = BILLING_TIERS.find((t) => t.slug === body?.tier);
  const interval = body?.interval === "annual" ? "annual" : body?.interval === "monthly" ? "monthly" : null;
  if (!tier || !interval) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const lookupKey = interval === "annual" ? tier.lookupKeyAnnual : tier.lookupKeyMonthly;

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const db = createServiceRoleClient();
  const { data: row } = await db
    .from("billing_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = row?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    // Seed the row now so webhook updates keyed on customer id always land.
    await db.from("billing_subscriptions").upsert(
      {
        user_id: user.id,
        stripe_customer_id: customerId,
        tier: "free",
        status: "none",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const price = prices.data[0];
  if (!price) {
    console.error(`[stripe-checkout] no price for lookup key ${lookupKey} — run setup-products`);
    return NextResponse.json({ error: "price_missing" }, { status: 500 });
  }

  const origin = siteOrigin(req);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${origin}/billing?status=success`,
    cancel_url: `${origin}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Compile check + commit**

Run: `bun test lib/billing/` (still green) — route compiles under Task 9's `bunx next build`.

```bash
git add app/api/stripe/checkout/route.ts
git commit -m "feat(billing): checkout route — hosted session by lookup key, customer reuse"
```

---

### Task 7: Portal route — `app/api/stripe/portal/route.ts`

**Files:**
- Create: `app/api/stripe/portal/route.ts`

**Interfaces:**
- Consumes: same as Task 6.
- Produces: `POST (no body) → {url: string}` — /billing "Manage subscription" calls this.

- [ ] **Step 1: Implement**

```ts
// app/api/stripe/portal/route.ts
/**
 * POST → short-lived Stripe customer-portal URL for the authed user.
 * All plan management (upgrade/downgrade/cancel/payment method) happens
 * in the portal — we build no plan-management UI (spec non-goal).
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getStripe } from "@/lib/billing/stripe-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = createServiceRoleClient();
  const { data: row } = await db
    .from("billing_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row?.stripe_customer_id) {
    return NextResponse.json({ error: "no_customer" }, { status: 404 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${origin}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/stripe/portal/route.ts
git commit -m "feat(billing): customer-portal route"
```

---

### Task 8: Quota tier resolution — `lib/email/usage.ts`

**Files:**
- Modify: `lib/email/usage.ts` (checkUsageLimit only — recordEmailSent untouched)
- Test: extend `lib/email/__tests__/usage.test.ts` is pure-only; the DB-path change is asserted by reading the new code path via a seam test in `lib/billing/stripe-sync.test.ts`? No — keep it simple: `checkUsageLimit` stays DB-coupled and fail-open; add a pure helper `resolveTier` with its own tests.

**Interfaces:**
- Consumes: `billing_subscriptions` (Task 1).
- Produces: `resolveTier(row: { tier: string | null } | null): string` exported from `lib/email/usage.ts`; `checkUsageLimit` signature and semantics unchanged for all callers.

- [ ] **Step 1: Write the failing test** (append to `lib/email/__tests__/usage.test.ts`)

```ts
// append to the imports:
import { resolveTier } from "../usage.ts";

// append at file end:
describe("resolveTier (billing_subscriptions → tier)", () => {
  test("no subscription row → free", () => {
    assert.equal(resolveTier(null), "free");
  });
  test("row with null tier → free", () => {
    assert.equal(resolveTier({ tier: null }), "free");
  });
  test("paid row → its tier verbatim (incl. past_due rows — keep-through-dunning)", () => {
    assert.equal(resolveTier({ tier: "growth" }), "growth");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/__tests__/usage.test.ts`
Expected: FAIL — `resolveTier` is not exported

- [ ] **Step 3: Implement.** In `lib/email/usage.ts`, add the export and rewire `checkUsageLimit`:

```ts
/**
 * billing_subscriptions row → effective tier. The webhook already encodes
 * keep-through-dunning (past_due keeps its tier; deletion writes 'free'),
 * so this is a straight read with a free fallback.
 */
export function resolveTier(row: { tier: string | null } | null): string {
  return row?.tier ?? "free";
}
```

Inside `checkUsageLimit`, replace the tier read. The current body selects `sent_count, tier` from `email_usage` and derives `tier` from that row. Change to two reads (both inside the existing try/catch, fail-open preserved):

```ts
    const db = createServiceRoleClient();
    const period = billingPeriod(new Date());

    // Tier now lives in billing_subscriptions (Stripe webhook is the writer);
    // email_usage.tier is legacy and no longer read (KNOWN-DEBT: drop later).
    const { data: subRow, error: subError } = await db
      .from("billing_subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();
    if (subError) return failOpen;
    const tier = resolveTier(subRow);

    const { data, error } = await db
      .from("email_usage")
      .select("sent_count")
      .eq("user_id", userId)
      .eq("billing_period", period)
      .maybeSingle();
    if (error) return failOpen;

    const sent = data?.sent_count ?? 0;
    const limit = tierLimit(tier);
    return { allowed: sent < limit, tier, sent, limit };
```

- [ ] **Step 4: Run the full email test suite** (scheduler + usage tests exercise checkUsageLimit consumers)

Run: `bun test lib/email/`
Expected: PASS — if `scheduler.test.ts` mocks `checkUsageLimit` itself, nothing changes; if any test stubs the `email_usage` select shape, update the stub to the two-read shape.

- [ ] **Step 5: Commit**

```bash
git add lib/email/usage.ts lib/email/__tests__/usage.test.ts
git commit -m "feat(billing): checkUsageLimit reads tier from billing_subscriptions (fail-open kept)"
```

---

### Task 9: `/billing` page — live tiers, usage meter, checkout + portal buttons

**Files:**
- Modify: `app/billing/page.tsx` (full rewrite — currently a static TIERS array)
- Create: `app/billing/TierCards.tsx` (client island)

**Interfaces:**
- Consumes: `BILLING_TIERS`, `FREE_SENDS_PER_MONTH` (Task 2); `checkUsageLimit` (Task 8); checkout + portal routes (Tasks 6–7); cookie auth (`createClient(await cookies())`).

- [ ] **Step 1: Implement the client island**

```tsx
// app/billing/TierCards.tsx
"use client";

import { useState } from "react";
import { BILLING_TIERS, FREE_SENDS_PER_MONTH } from "@/lib/billing/tiers";

type Interval = "monthly" | "annual";

async function go(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  if (res.ok && data?.url) window.location.assign(data.url);
  else alert("Could not open billing — try again in a moment.");
}

export function TierCards({
  currentTier,
  hasCustomer,
}: {
  currentTier: string;
  hasCustomer: boolean;
}) {
  const [interval, setInterval] = useState<Interval>("annual");

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          className={`rounded-full px-4 py-1.5 border ${interval === "monthly" ? "border-neutral-800 font-medium" : "border-neutral-200 text-neutral-500"}`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval("annual")}
          className={`rounded-full px-4 py-1.5 border ${interval === "annual" ? "border-neutral-800 font-medium" : "border-neutral-200 text-neutral-500"}`}
        >
          Annual <span className="ml-1 text-xs text-emerald-600">2 months free</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-5 py-4">
          <div>
            <p className="font-medium">Free</p>
            <p className="text-sm text-neutral-500">{FREE_SENDS_PER_MONTH} sends / month</p>
          </div>
          <span className="text-sm text-neutral-500">
            {currentTier === "free" ? "Current plan" : "$0"}
          </span>
        </div>

        {BILLING_TIERS.map((t) => {
          const price = interval === "annual" ? t.priceAnnualUsd : t.priceMonthlyUsd;
          const suffix = interval === "annual" ? "/yr" : "/mo";
          const isCurrent = currentTier === t.slug;
          return (
            <div
              key={t.slug}
              className="flex items-center justify-between rounded-lg border border-neutral-200 px-5 py-4"
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-neutral-500">
                  {t.sendsPerMonth.toLocaleString()} sends / month
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  ${price.toLocaleString()}
                  {suffix}
                </span>
                {isCurrent ? (
                  <span className="text-sm text-neutral-500">Current plan</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void go("/api/stripe/checkout", { tier: t.slug, interval })}
                    className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasCustomer && (
        <button
          type="button"
          onClick={() => void go("/api/stripe/portal")}
          className="mt-6 text-sm underline text-neutral-600"
        >
          Manage subscription
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the page (server component)**

```tsx
// app/billing/page.tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { checkUsageLimit } from "@/lib/email/usage";
import { TierCards } from "./TierCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — SWFL Data Gulf",
  description: "Send tiers for SWFL Data Gulf. Builds are free — you pay to send at scale.",
};

export default async function BillingPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let usage: Awaited<ReturnType<typeof checkUsageLimit>> | null = null;
  let hasCustomer = false;
  if (user) {
    usage = await checkUsageLimit(user.id);
    const db = createServiceRoleClient();
    const { data } = await db
      .from("billing_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    hasCustomer = Boolean(data?.stripe_customer_id);
  }

  return (
    <main className="min-h-dvh flex flex-col">
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold mb-2">Pricing</h1>
        <p className="text-sm text-neutral-500 mb-8">
          Building is free. You pay to send at scale — no contract, cancel anytime.
        </p>

        {usage && (
          <div className="mb-8 rounded-lg border border-neutral-200 px-5 py-4">
            <p className="text-sm font-medium">
              Current plan: <span className="capitalize">{usage.tier}</span>
            </p>
            <p className="text-sm text-neutral-500">
              {usage.sent.toLocaleString()} of {usage.limit.toLocaleString()} sends used this
              month
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-neutral-100">
              <div
                className="h-full bg-neutral-800"
                style={{ width: `${Math.min(100, (usage.sent / usage.limit) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <TierCards currentTier={usage?.tier ?? "free"} hasCustomer={hasCustomer} />

        <div className="mt-12 rounded-lg bg-neutral-50 border border-neutral-200 px-5 py-4 text-sm text-neutral-600 space-y-1">
          <p className="font-medium text-neutral-800">Enterprise</p>
          <p>
            Higher limits, teams, or something custom — email{" "}
            <a href="mailto:hello@swfldatagulf.com" className="underline text-neutral-800">
              hello@swfldatagulf.com
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Full verification gate**

Run: `bun test lib/billing/ lib/email/` then `bunx next build`
Expected: all tests PASS; build succeeds (this is the house verification bar — never bare `npx tsc`).

- [ ] **Step 4: Commit**

```bash
git add app/billing/page.tsx app/billing/TierCards.tsx
git commit -m "feat(billing): live /billing — usage meter, tier cards, checkout + portal"
```

---

### Task 10: Setup script — `scripts/stripe/setup-products.mts`

**Files:**
- Create: `scripts/stripe/setup-products.mts`

**Interfaces:**
- Consumes: `BILLING_TIERS` (Task 2), `stripe` SDK. Reads `STRIPE_SECRET_KEY` from env (Bun auto-loads `.env.local`).

- [ ] **Step 1: Implement**

```ts
// scripts/stripe/setup-products.mts
/**
 * Idempotent: creates the 3 products × 2 prices with the lookup keys from
 * lib/billing/tiers.ts, in whatever mode STRIPE_SECRET_KEY belongs to
 * (run against test keys first). Re-runs find-by-lookup-key and skip.
 * Usage: bun scripts/stripe/setup-products.mts [--dry-run]
 */
import Stripe from "stripe";
import { BILLING_TIERS } from "../../lib/billing/tiers.ts";

const dryRun = process.argv.includes("--dry-run");
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY unset (put the test key in .env.local).");
  process.exit(1);
}
const stripe = new Stripe(key);
const mode = key.startsWith("sk_live") ? "LIVE" : "test";
console.log(`Mode: ${mode}${dryRun ? " (dry-run)" : ""}`);

const allKeys = BILLING_TIERS.flatMap((t) => [t.lookupKeyMonthly, t.lookupKeyAnnual]);
const existing = await stripe.prices.list({ lookup_keys: allKeys, limit: 100 });
const have = new Set(existing.data.map((p) => p.lookup_key));

for (const tier of BILLING_TIERS) {
  const wanted = [
    { lookupKey: tier.lookupKeyMonthly, usd: tier.priceMonthlyUsd, interval: "month" as const },
    { lookupKey: tier.lookupKeyAnnual, usd: tier.priceAnnualUsd, interval: "year" as const },
  ].filter((w) => !have.has(w.lookupKey));

  if (wanted.length === 0) {
    console.log(`= ${tier.name}: both prices exist, skipping`);
    continue;
  }
  if (dryRun) {
    for (const w of wanted) console.log(`+ would create ${w.lookupKey} — $${w.usd}/${w.interval}`);
    continue;
  }

  // Reuse the product if a surviving price already points at one.
  const sibling = existing.data.find(
    (p) => p.lookup_key === tier.lookupKeyMonthly || p.lookup_key === tier.lookupKeyAnnual,
  );
  const productId =
    typeof sibling?.product === "string"
      ? sibling.product
      : (
          await stripe.products.create({
            name: `SWFL Data Gulf — ${tier.name}`,
            metadata: { tier: tier.slug, sends_per_month: String(tier.sendsPerMonth) },
          })
        ).id;

  for (const w of wanted) {
    const price = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: w.usd * 100,
      recurring: { interval: w.interval },
      lookup_key: w.lookupKey,
      transfer_lookup_key: true,
    });
    console.log(`+ created ${w.lookupKey} → ${price.id} ($${w.usd}/${w.interval})`);
  }
}
console.log("Done.");
```

- [ ] **Step 2: Dry-run smoke** (only if the operator has already placed a TEST key in `.env.local`; otherwise skip — the script errors cleanly without a key)

Run: `bun scripts/stripe/setup-products.mts --dry-run`
Expected with test key: `Mode: test (dry-run)` + `+ would create swfl_starter_monthly — $29/month` (×6). Without key: clean exit-1 message.

- [ ] **Step 3: Commit**

```bash
git add scripts/stripe/setup-products.mts
git commit -m "feat(billing): idempotent stripe product/price setup script (--dry-run)"
```

---

### Task 11: Wrap-up — SESSION_LOG, operator handoff (NO push)

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)

- [ ] **Step 1: Append SESSION_LOG entry** (top of file, matching house format): what shipped (Tasks 1–10 summary), check `stripe_billing_live_verify` OPEN, and the operator runbook below.

- [ ] **Step 2: Run the full gate one last time**

Run: `bun test lib/billing/ lib/email/ && bunx next build`
Expected: green.

- [ ] **Step 3: Commit SESSION_LOG; STOP — do not push.** Show `git log --oneline origin/main..HEAD` and hand the operator this runbook:

1. Create the Stripe account; grab TEST keys.
2. `.env.local`: `STRIPE_SECRET_KEY=sk_test_...` → run `bun scripts/stripe/setup-products.mts` (then `--dry-run` shows all skips).
3. `stripe listen --forward-to localhost:3000/api/stripe/webhook` → put the printed `whsec_...` in `.env.local` as `STRIPE_WEBHOOK_SECRET`.
4. Test-mode e2e: log in → /billing → Upgrade (card 4242 4242 4242 4242) → tier flips → portal cancel → webhook reverts on deletion.
5. `gh secret set STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (step 1), Vercel env (step 2), live keys at launch + register the webhook endpoint (live) with events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed.
6. Before first paid customer: Resend Free → Pro (go-live gate from the spec).
7. Approve push; close `stripe_billing_live_verify` only on live evidence.
