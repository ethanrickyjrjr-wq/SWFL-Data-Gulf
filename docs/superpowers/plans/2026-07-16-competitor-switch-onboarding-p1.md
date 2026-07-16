# Competitor Switch Onboarding — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 13 tasks, 31 files, keywords: migration, refactor, schema

**Goal:** Ship the Switch Pass (60 days of Starter, auto-activated on verified competitor migration), the forward-an-email migration lane, Mailchimp + Follow Up Boss connectors, and per-user build metering.

**Architecture:** All contact writes land in the canonical `public.contacts` store through ONE new extracted upsert core. Proof of migration (OAuth extraction or platform-origin email) calls one activation seam (`activateSwitchPass`), which grants a timed tier override read by one new effective-tier resolver that the send gate and lab-tier reads already consult. The forward lane is a routing branch on the existing Resend inbound webhook — not a new subsystem.

**Tech Stack:** Next.js App Router (nodejs runtime), Supabase (RLS + service role), Resend inbound, plain-fetch OAuth (mirrors `lib/email/google-oauth.ts` — no SDKs), bun:test.

**Spec:** `docs/superpowers/specs/2026-07-16-competitor-switch-onboarding-design.md`

## Global Constraints

- **RULE 0.4 at build time:** every task touching a vendor surface (Mailchimp OAuth, FUB API, Brandfetch, Resend inbound attachments) begins with a fresh crawl4ai pass of the named docs page. The spec/handoff values are hypotheses, not contracts. crawl4ai output stays local (never `git add` anything matching `*crawl4ai*`).
- **Canonical contact store is `public.contacts`** (uuid PK, `phone`, `tags`, `attribs`, `unsubscribed`) — settled in `docs/superpowers/specs/2026-07-05-unify-contact-stores-design.md`. Do NOT write `email_contacts` from any new code. Do NOT modify `lib/email/upsert-contacts.ts` (legacy lane, other build's scope).
- **Switch Pass constants:** tier granted = `"starter"`, duration = 60 days, minimum import = 25 contacts. `FREE_BUILDS_PER_DAY = 30` (quiet anti-abuse, never a visible quota).
- **No invented copy numbers:** UI copy citing competitor behavior must match the spec's sourced claims verbatim or omit the number.
- **Secrets:** `gh secret set` is step 1; wiring into env is step 2 (pre-push gate 3). Never ask for key values — they go in gh secrets/Vercel env by the operator.
- **SQL migrations:** idempotent, run directly (creds in `.dlt/secrets.toml`), verify with a follow-up query. Every new table: RLS + explicit `service_role` GRANT + `NOTIFY pgrst, 'reload schema'`.
- **Verify with `bunx next build`**, not `npx tsc`. Tests via `bun test <path>`.
- **Commits:** explicit paths only (`git add <paths>`), never `git add -A`. Commit per task. NO `git push` — operator approval required for every push.
- **In-app UI pages:** invoke the `one-room` skill before touching any signed-in page (Task 12).

---

### Task 1: Migration — `switch_passes` + `build_usage`

**Files:**
- Create: `migrations/20260716_switch_pass.sql`

**Interfaces:**
- Produces: tables `public.switch_passes(user_id, tier, source_lane, platform, contacts_imported, proof, starts_at, expires_at)` and `public.build_usage(user_id, day, build_count)` consumed by Tasks 2, 4, 8.

- [ ] **Step 1: Write the migration**

```sql
-- migrations/20260716_switch_pass.sql
-- Switch Pass (60-day Starter override on verified competitor migration) +
-- per-user daily build counter (quiet anti-abuse + future AI-allowance dial).
-- Spec: docs/superpowers/specs/2026-07-16-competitor-switch-onboarding-design.md
-- Idempotent. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS public.switch_passes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tier          text NOT NULL DEFAULT 'starter',
  -- The two proof lanes. A plain CSV upload can NOT create a pass (spec §2).
  source_lane   text NOT NULL CHECK (source_lane IN ('oauth_extraction', 'forwarded_email')),
  platform      text NOT NULL,             -- 'mailchimp' | 'followupboss' | detected platform slug
  contacts_imported integer NOT NULL,
  proof         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- message id / connector metadata
  starts_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One ACTIVE pass per user, ever (the offer is once).
CREATE UNIQUE INDEX IF NOT EXISTS switch_passes_one_per_user
  ON public.switch_passes (user_id);

ALTER TABLE public.switch_passes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS switch_passes_owner_read ON public.switch_passes;
CREATE POLICY switch_passes_owner_read ON public.switch_passes
  FOR SELECT USING (auth.uid() = user_id);
-- Writes go through service role only (activation is server-side proof, never client).
GRANT SELECT ON public.switch_passes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.switch_passes TO service_role;

CREATE TABLE IF NOT EXISTS public.build_usage (
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day         date NOT NULL,
  build_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.build_usage ENABLE ROW LEVEL SECURITY;
-- No client policies: metering is service-role-only, invisible to users.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_usage TO service_role;

CREATE OR REPLACE FUNCTION public.increment_build_count(p_user_id uuid, p_day date, p_n integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.build_usage (user_id, day, build_count)
  VALUES (p_user_id, p_day, p_n)
  ON CONFLICT (user_id, day) DO UPDATE SET build_count = public.build_usage.build_count + p_n;
$$;
-- PostgREST exposes functions to any role with EXECUTE; default is PUBLIC.
-- Metering is service-role-only (spec §6) — close the default-open grant.
REVOKE EXECUTE ON FUNCTION public.increment_build_count(uuid, date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_build_count(uuid, date, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_build_count(uuid, date, integer) TO service_role;

ALTER TABLE public.build_usage DROP CONSTRAINT IF EXISTS build_count_nonnegative;
ALTER TABLE public.build_usage ADD CONSTRAINT build_count_nonnegative CHECK (build_count >= 0);

NOTIFY pgrst, 'reload schema';
COMMIT;
```

- [ ] **Step 2: Run it directly and verify**

Run the migration via the repo's Bun.SQL migration lane (psql is not installed — see `reference_run-migrations-via-bun-sql`), then verify:
`SELECT count(*) FROM public.switch_passes; SELECT count(*) FROM public.build_usage;`
Expected: both return 0 rows (tables exist, empty).

- [ ] **Step 3: Regenerate DB types** so the typed client sees the new tables (same command previous migrations used — check `package.json` scripts for the `gen:types`-style script; the phantom-column protection depends on it).

- [ ] **Step 4: Commit**

```bash
git add migrations/20260716_switch_pass.sql database-generated.types.ts
git commit -m "feat(switch): switch_passes + build_usage tables (RLS, service-role writes, idempotent)"
```

---

### Task 2: Effective-tier resolver (ONE new authority)

**Files:**
- Create: `lib/billing/effective-tier.ts`
- Test: `lib/billing/effective-tier.test.ts`

**Interfaces:**
- Consumes: `switch_passes` (Task 1), `billing_subscriptions` (existing).
- Produces: `pickEffectiveTier(subTier: string | null, pass: { tier: string; expires_at: string } | null, now: Date): string` (pure) and `resolveEffectiveTier(db: SupabaseClient, userId: string): Promise<string>` — returns a tier STRING (`"free" | "starter" | "growth" | "pro"`) that existing consumers (`tierLimit`, `emailLabTierFor`) already accept unchanged.

- [ ] **Step 1: Write the failing tests (pure core)**

```ts
// lib/billing/effective-tier.test.ts
import { describe, expect, test } from "bun:test";
import { pickEffectiveTier } from "./effective-tier";

const NOW = new Date("2026-07-16T12:00:00Z");
const activePass = { tier: "starter", expires_at: "2026-09-01T00:00:00Z" };
const expiredPass = { tier: "starter", expires_at: "2026-07-01T00:00:00Z" };

describe("pickEffectiveTier", () => {
  test("no sub, no pass → free", () => expect(pickEffectiveTier(null, null, NOW)).toBe("free"));
  test("active pass upgrades free", () =>
    expect(pickEffectiveTier(null, activePass, NOW)).toBe("starter"));
  test("expired pass does nothing", () =>
    expect(pickEffectiveTier(null, expiredPass, NOW)).toBe("free"));
  test("real paid sub wins over pass (never downgrade a payer)", () =>
    expect(pickEffectiveTier("growth", activePass, NOW)).toBe("growth"));
  test("free-tier sub row + active pass → pass tier", () =>
    expect(pickEffectiveTier("free", activePass, NOW)).toBe("starter"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/billing/effective-tier.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/billing/effective-tier.ts
// THE effective-tier authority. billing_subscriptions is the Stripe truth;
// switch_passes is the timed Switch Pass override (spec 2026-07-16). A real
// paid subscription ALWAYS wins; the pass only lifts "free". Consumers keep
// receiving the same tier strings tierLimit/emailLabTierFor already handle.
import type { SupabaseClient } from "@supabase/supabase-js";

const PAID = new Set(["starter", "growth", "pro"]);

export function pickEffectiveTier(
  subTier: string | null,
  pass: { tier: string; expires_at: string } | null,
  now: Date,
): string {
  if (subTier && PAID.has(subTier)) return subTier;
  if (pass && new Date(pass.expires_at).getTime() > now.getTime()) return pass.tier;
  return subTier ?? "free";
}

/** Service-role read. FAIL OPEN to the subscription tier (mirrors usage.ts). */
export async function resolveEffectiveTier(db: SupabaseClient, userId: string): Promise<string> {
  let subTier: string | null = null;
  try {
    const { data } = await db
      .from("billing_subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();
    subTier = (data?.tier as string | null) ?? null;
  } catch {
    /* fail open to free below */
  }
  let pass: { tier: string; expires_at: string } | null = null;
  try {
    const { data } = await db
      .from("switch_passes")
      .select("tier, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    pass = (data as { tier: string; expires_at: string } | null) ?? null;
  } catch {
    /* pass lookup failure must never block */
  }
  return pickEffectiveTier(subTier, pass, new Date());
}
```

- [ ] **Step 4: Run tests** — `bun test lib/billing/effective-tier.test.ts` — Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/billing/effective-tier.ts lib/billing/effective-tier.test.ts
git commit -m "feat(switch): effective-tier resolver - paid sub wins, active pass lifts free"
```

---

### Task 3: Wire effective tier into the send gate and lab-tier reads

**Files:**
- Modify: `lib/email/usage.ts` (checkUsageLimit's tier read, ~lines 158–167)
- Modify: `app/api/contacts/route.ts` (`tierForUser`, lines 28–40)
- Modify: the tier reads in `app/api/segments/route.ts`, `app/api/segments/[id]/route.ts`, `app/api/segments/preview/route.ts` (each has a `billing_subscriptions` read — replace with the resolver; grep `billing_subscriptions` in each file to locate)
- Test: `lib/email/__tests__/usage.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveEffectiveTier(db, userId)` from Task 2.
- Produces: sends and lab capabilities honor an active Switch Pass with zero further changes.

- [ ] **Step 1: Write the failing test** — extend `usage.test.ts` with a case where `billing_subscriptions` returns null but `switch_passes` returns an active starter pass; expect `checkUsageLimit` → `{ tier: "starter", limit: 500 }`. Follow the file's existing mock pattern for the Supabase client (mock BOTH table reads).

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/__tests__/usage.test.ts` — Expected: the new case FAILS (tier comes back "free").

- [ ] **Step 3: Implement** — in `checkUsageLimit`, replace the inline `billing_subscriptions` read + `resolveTier(subRow)` with `const tier = await resolveEffectiveTier(db, userId);` (keep `resolveTier` exported — other callers may use it; do not delete). In `app/api/contacts/route.ts` `tierForUser`, replace the inline read with `emailLabTierFor(await resolveEffectiveTier(db, userId))`. Same substitution in the three segments routes.

- [ ] **Step 4: Run tests + build** — `bun test lib/email/__tests__/usage.test.ts lib/billing/effective-tier.test.ts` PASS, then `bunx next build` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/email/usage.ts app/api/contacts/route.ts app/api/segments/route.ts "app/api/segments/[id]/route.ts" app/api/segments/preview/route.ts lib/email/__tests__/usage.test.ts
git commit -m "feat(switch): send gate + lab tier reads consult effective tier (pass-aware)"
```

---

### Task 4: Pass activation seam

**Files:**
- Create: `lib/switch/activate.ts`
- Test: `lib/switch/activate.test.ts`

**Interfaces:**
- Consumes: `switch_passes` (Task 1).
- Produces: `MIN_SWITCH_IMPORT = 25`, `SWITCH_PASS_DAYS = 60`, `activateSwitchPass(db: SupabaseClient, userId: string, proof: { lane: "oauth_extraction" | "forwarded_email"; platform: string; contactsImported: number; detail?: Record<string, unknown> }): Promise<{ activated: boolean; reason?: "below_minimum" | "already_active" | "error" }>` — called by Tasks 6, 7, 10.

- [ ] **Step 1: Write the failing tests** — pure gate first: below-25 → `below_minimum`; ≥25 inserts a row with `expires_at` = now + 60 days; a second call → `already_active` (unique index conflict `23505` handled, not thrown). Mock the Supabase insert per the repo's established mock pattern (see `lib/email/__tests__/usage.test.ts`).

- [ ] **Step 2: Run to verify failure** — `bun test lib/switch/activate.test.ts` — FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/switch/activate.ts
// THE ONE place a Switch Pass is granted. Server-side only (service role):
// proof is a verified migration, never a client claim. Spec §1–2.
import type { SupabaseClient } from "@supabase/supabase-js";

export const MIN_SWITCH_IMPORT = 25;
export const SWITCH_PASS_DAYS = 60;

export interface SwitchProof {
  lane: "oauth_extraction" | "forwarded_email";
  platform: string;
  contactsImported: number;
  detail?: Record<string, unknown>;
}

export async function activateSwitchPass(
  db: SupabaseClient,
  userId: string,
  proof: SwitchProof,
): Promise<{ activated: boolean; reason?: "below_minimum" | "already_active" | "error" }> {
  if (proof.contactsImported < MIN_SWITCH_IMPORT) {
    return { activated: false, reason: "below_minimum" };
  }
  const expiresAt = new Date(Date.now() + SWITCH_PASS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await db.from("switch_passes").insert({
    user_id: userId,
    tier: "starter",
    source_lane: proof.lane,
    platform: proof.platform,
    contacts_imported: proof.contactsImported,
    proof: proof.detail ?? {},
    expires_at: expiresAt,
  });
  if (!error) return { activated: true };
  if (error.code === "23505") return { activated: false, reason: "already_active" };
  console.error(`[switch-pass] activation failed: ${error.message}`);
  return { activated: false, reason: "error" };
}
```

- [ ] **Step 4: Run tests** — `bun test lib/switch/activate.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/switch/activate.ts lib/switch/activate.test.ts
git commit -m "feat(switch): activateSwitchPass - proof-gated, 25-contact floor, one pass ever"
```

---

### Task 5: Canonical contact upsert core (extract on copy #3)

**Files:**
- Create: `lib/contacts/upsert.ts`
- Test: `lib/contacts/upsert.test.ts`
- Modify: `app/api/contacts/import/route.ts` (lines 67–78 — replace the inline batch loop)
- Modify: `lib/contacts/types.ts` (add optional `unsubscribed?: boolean` to `ContactRow`)

**Interfaces:**
- Consumes: `ContactRow` (`lib/contacts/types.ts`: `{ name, email, phone, tags, attribs }` + new optional `unsubscribed`).
- Produces: `upsertCanonicalContacts(supabase: SupabaseClient, userId: string, rows: ContactRow[]): Promise<{ added: number; error: string | null }>` writing `public.contacts` in 100-row batches with `onConflict: "user_id,email"` — the ONE write path new connectors use (Tasks 6, 7, 10). An import may set `unsubscribed: true` (honoring competitor opt-outs) but must NEVER set it back to false on an existing row (never resurrect an opt-out): rows with `unsubscribed !== true` omit the column entirely.

- [ ] **Step 1: Write the failing tests** — batching at 100, `user_id` stamped on every row, `unsubscribed: true` passed through, `unsubscribed: false/undefined` stripped from the payload (assert the upserted objects have no `unsubscribed` key), error propagation.

- [ ] **Step 2: Run to verify failure** — `bun test lib/contacts/upsert.test.ts` — FAIL.

- [ ] **Step 3: Implement** — lift the loop from `app/api/contacts/import/route.ts` verbatim into the new module, add the unsubscribed-strip rule, then retarget the route to call it (route keeps parsing + size caps; result shape `ImportResult` unchanged).

- [ ] **Step 4: Run tests + existing import route test if present** — `bun test lib/contacts/` — PASS. `bunx next build` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/contacts/upsert.ts lib/contacts/upsert.test.ts lib/contacts/types.ts app/api/contacts/import/route.ts
git commit -m "refactor(contacts): extract canonical upsert core; opt-outs import one-way"
```

---

### Task 6: Mailchimp OAuth connector

**Files:**
- Create: `lib/email/mailchimp-oauth.ts`
- Test: `lib/email/mailchimp-oauth.test.ts`
- Create: `app/api/email/contacts/mailchimp/start/route.ts`
- Create: `app/api/email/contacts/mailchimp/callback/route.ts`

**Interfaces:**
- Consumes: `upsertCanonicalContacts` (Task 5), `activateSwitchPass` (Task 4).
- Produces: `GET /api/email/contacts/mailchimp/start` → consent redirect; callback imports members → contacts, activates pass with `{ lane: "oauth_extraction", platform: "mailchimp" }`, redirects to `/contacts/upload?source=mailchimp&imported=N&pass=1|0`.

- [ ] **Step 1 (RULE 0.4): crawl4ai the live contract.** `crawl4ai https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/` and the Marketing API "list members" reference. Verify verbatim: authorize + token endpoint URLs, the metadata endpoint that yields the datacenter/`api_endpoint`, member fields (`email_address`, `status` enum values, `merge_fields.FNAME/LNAME`), pagination (`count`/`offset`, max page size). Output stays local. If any surface differs from this plan, follow the LIVE docs and note the delta in the commit message.

- [ ] **Step 2: Write the failing tests (pure mapping only)** — `mailchimpMembersToContactRows(members)`: maps `email_address`→email, FNAME+LNAME→name, `status !== "subscribed"` → `unsubscribed: true`, tags `["mailchimp"]`. Token/fetch functions are thin adapters tested by types, mirroring how `google-oauth.ts` is covered.

- [ ] **Step 3: Run to verify failure** — `bun test lib/email/mailchimp-oauth.test.ts` — FAIL.

- [ ] **Step 4: Implement `lib/email/mailchimp-oauth.ts`** mirroring `lib/email/google-oauth.ts` exactly (plain fetch, no SDK, CSRF state cookie, token used in-memory in the callback and NEVER persisted — one-shot import sidesteps storing Mailchimp's non-expiring token entirely). Env: `MAILCHIMP_OAUTH_CLIENT_ID`, `MAILCHIMP_OAUTH_CLIENT_SECRET` + `mailchimpOauthConfigured()` graceful degrade. Implement `/start` and `/callback` routes cloning the Google routes' shape (`app/api/email/contacts/google/{start,callback}/route.ts`), with the callback ending in `upsertCanonicalContacts` + `activateSwitchPass` (service-role client for the pass write).

- [ ] **Step 5: Run tests + build** — `bun test lib/email/mailchimp-oauth.test.ts` PASS; `bunx next build` clean.

- [ ] **Step 6: Secrets** — operator registers the Mailchimp OAuth app; keys land via `gh secret set MAILCHIMP_OAUTH_CLIENT_ID` / `..._SECRET` + Vercel env (step 1), THEN wire any workflow env if a workflow needs them (step 2, pre-push gate 3). Routes already degrade gracefully when unset.

- [ ] **Step 7: Commit**

```bash
git add lib/email/mailchimp-oauth.ts lib/email/mailchimp-oauth.test.ts app/api/email/contacts/mailchimp
git commit -m "feat(switch): Mailchimp OAuth connector - one-shot import, no token storage, pass activation"
```

---

### Task 7: Follow Up Boss connector

**Files:**
- Create: `lib/switch/fub-map.ts`
- Test: `lib/switch/fub-map.test.ts`
- Create: `app/api/email/contacts/fub/route.ts`

**Interfaces:**
- Consumes: `upsertCanonicalContacts` (Task 5), `activateSwitchPass` (Task 4).
- Produces: `POST /api/email/contacts/fub` body `{ apiKey: string }` (key used for the fetch, NEVER stored) → pages FUB people, imports, activates pass `{ lane: "oauth_extraction", platform: "followupboss" }`, returns `{ imported, skipped, pass }`.

- [ ] **Step 1 (RULE 0.4): crawl4ai `https://docs.followupboss.com/` API reference** — verify: base URL, Basic-auth header shape (key as username), the people-list endpoint + pagination params + response envelope, email field shape (people carry an `emails[]` array — confirm), and any unsubscribe/emailsDisabled flag. Follow live docs over this plan.

- [ ] **Step 2: Write the failing tests** — `fubPeopleToContactRows(people)`: primary email picked from the emails array, name join, tags `["followupboss"]`, missing-email people skipped and counted.

- [ ] **Step 3: Run to verify failure** — `bun test lib/switch/fub-map.test.ts` — FAIL.

- [ ] **Step 4: Implement** mapping + route (authed user required; 401 otherwise; paged fetch loop with a hard page cap so a huge CRM can't hang the request — cap at 40 pages/4k people for v1 and report partial with `truncated: true`).

- [ ] **Step 5: Run tests + build** — `bun test lib/switch/fub-map.test.ts` PASS; `bunx next build` clean.

- [ ] **Step 6: Commit**

```bash
git add lib/switch/fub-map.ts lib/switch/fub-map.test.ts app/api/email/contacts/fub
git commit -m "feat(switch): Follow Up Boss connector - paste-key import, pass activation"
```

---

### Task 8: Build metering + quiet free-tier guard

**Files:**
- Create: `lib/email/build-usage.ts`
- Test: `lib/email/build-usage.test.ts`
- Modify: the API route(s) that call `buildContentDoc` (locate: `grep -r "buildContentDoc" app/` — wire the check before the build and the record after; also the update-doc route from the 07/16 hub build)

**Interfaces:**
- Consumes: `build_usage` + `increment_build_count` RPC (Task 1), `resolveEffectiveTier` (Task 2).
- Produces: `FREE_BUILDS_PER_DAY = 30`, `recordBuild(userId)` (never throws), `checkBuildAllowance(userId): Promise<{ allowed: boolean }>` — allowed is ALWAYS true for any paid/pass tier; free tier false only past 30 builds in a UTC day. FAIL OPEN on any DB error (metering must never break a build — same doctrine as `lib/email/usage.ts`).

- [ ] **Step 1: Write the failing tests** — free under limit → allowed; free at 30 → `{ allowed: false }`; starter/pass tier at 500 → allowed; DB error → allowed (fail open). Mirror `usage.test.ts` mock style.

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/build-usage.test.ts` — FAIL.

- [ ] **Step 3: Implement** — clone the `recordEmailSent`/`checkUsageLimit` structure from `lib/email/usage.ts` (upsert-then-RPC-increment; UTC day key via `new Date().toISOString().slice(0, 10)`). Wire into the build route(s): on `allowed: false` return 429 with copy `"You've hit today's free build limit — it resets tomorrow."` (quiet daily guard, not a monthly quota; no upsell screen).

- [ ] **Step 4: Run tests + build** — `bun test lib/email/build-usage.test.ts` PASS; `bunx next build` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/email/build-usage.ts lib/email/build-usage.test.ts <the modified build route files>
git commit -m "feat(switch): per-user build metering + quiet free-tier daily guard (fail-open)"
```

---

### Task 9: Forward-lane classifier (pure)

**Files:**
- Create: `lib/switch/forward-inbound.ts`
- Test: `lib/switch/forward-inbound.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (consumed by Task 10):
  - `SWITCH_ADDRESS_LOCAL = "switch"` and `isSwitchInbound(event: { data?: { to?: string[] | string } }): boolean` — true when any recipient's local part is `switch` (domain-agnostic so the reply domain can vary).
  - `classifyForward(body: { text: string; html: string | null; headers: Record<string, string | undefined>; attachments: { filename: string; contentType: string }[] }): { kind: "contact_export" | "campaign" | "unknown" }` — `contact_export` when any attachment is CSV/XLSX by extension or content-type; else `campaign` when HTML present; else `unknown`.
  - `detectPlatform(headers, html): string | null` — marker table (VERIFY the markers against real samples at build; start from: Mailchimp `list-unsubscribe`/links containing `mailchimp.com` or `mcsv.net`; Constant Contact `constantcontact.com`/`rs6.net`; Follow Up Boss `followupboss.com`) → slug or null.
  - `extractFooterAbout(html): string | null` — the last text block matching /about\s+(me|[A-Z][a-z]+)/i or the final `<td>/<p>` paragraph over 120 chars; null when nothing qualifies (NO invention — absent means absent).
  - `senderDomain(from: string): string | null`.

- [ ] **Step 1 (RULE 0.4): crawl4ai the Resend inbound docs** (`https://resend.com/docs` → inbound/receiving pages) — verify: does `emails.receiving.get(emailId)` return attachments (filenames + content, base64?) or must attachments be fetched separately? The webhook `email.received` payload shape for `to`. This determines Task 10's fetch step — follow live docs.

- [ ] **Step 2: Write the failing tests** — fixture payloads (hand-built minimal HTML/headers per platform) for each function above; include: a Gmail-forwarded Mailchimp campaign (markers survive forwarding in links even when headers are rewritten — test link-based detection), a CSV attachment named `subscribed_members_export.csv`, an empty/unknown email.

- [ ] **Step 3: Run to verify failure** — `bun test lib/switch/forward-inbound.test.ts` — FAIL.

- [ ] **Step 4: Implement** all five pure functions.

- [ ] **Step 5: Run tests** — PASS. **Step 6: Commit**

```bash
git add lib/switch/forward-inbound.ts lib/switch/forward-inbound.test.ts
git commit -m "feat(switch): forward-lane classifier - switch@ detect, export-vs-campaign, platform markers"
```

---

### Task 10: Competitor-export column mapping + forward-lane webhook branch

**Files:**
- Create: `lib/switch/export-columns.ts`
- Test: `lib/switch/export-columns.test.ts`
- Modify: `app/api/webhooks/resend/route.ts` (add the switch branch immediately after signature verification + JSON parse, BEFORE the ma-engagement block — keyed on `isSwitchInbound`, early return)

**Interfaces:**
- Consumes: Task 9 classifier, Task 5 upsert, Task 4 activation, `parseContactsCsv` (`lib/email/parse-contacts-csv.ts` — recognizes only `email`/`name`/`tags` headers; everything else becomes attribs).
- Produces:
  - `normalizeCompetitorCsv(csvText: string): string` — rewrites the HEADER ROW only: `"Email Address"|"E-mail"|"Email"` (case-insensitive) → `email`; `"First Name"+"Last Name"` → merged into a `name` column (splice values), `"Full Name"|"Name"` → `name`; passes everything else through (lands in attribs). Unsubscribe columns (`"UNSUB_TIME"`, `"Status"` with value `unsubscribed`/`cleaned`, `"Opted Out"`) → emitted as a `switch_unsubscribed` attrib the caller converts to `unsubscribed: true`.
  - Webhook branch behavior: resolve the account by matching the inbound `from` address to an auth user (`db.auth.admin` lookup by email); NO match → send a short plain-text reply via the existing `getMarketingResend()` client ("We couldn't match this email to a SWFL Data Gulf account — send it from your sign-up address") and ack 200. Match + `contact_export` → normalize → parse → upsert → `activateSwitchPass({ lane: "forwarded_email", platform: detectPlatform(...) ?? "unknown", contactsImported, detail: { messageId } })` → confirmation reply with counts + pass status. Match + `campaign` → insert ONE `agent_profile_facts` row (`key: "forwarded_campaign_about"`, `value` = `extractFooterAbout` output, `source: "agent_upload"`, `source_detail` = message id — ONLY when extractFooterAbout returned non-null; a null extract writes NOTHING) + stash `{ senderDomain, platform, html }` for Tasks 11–12 in a new `switch_forwards` insert (add this small table to the Task 1 migration file in the same PR if not yet applied live, else a sibling migration `20260716_switch_forwards.sql`: id, user_id, message_id, platform, sender_domain, html text, created_at, RLS service-only) → ack. All failure paths log + 200 (never 500 a webhook — house rule in this route).

- [ ] **Step 1: Write the failing tests** for `normalizeCompetitorCsv` — real-shaped header rows: Mailchimp (`Email Address,First Name,Last Name,MEMBER_RATING,OPTIN_TIME`), Constant Contact (`Email address,First name,Last name,Email status`), generic. Verify at build time against a real export sample of each (crawl4ai the export-format help pages: Mailchimp "export contacts" doc, Constant Contact export doc) — adjust header spellings to the LIVE docs.

- [ ] **Step 2: Run to verify failure** — `bun test lib/switch/export-columns.test.ts` — FAIL.

- [ ] **Step 3: Implement** `normalizeCompetitorCsv` (pure string→string, header-row surgery only).

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Implement the webhook branch** per the produces-contract above. Keep ALL logic in `lib/switch/` pure functions; the route branch is adapter-only (match the file's existing style: try/catch per branch, `console.error` with `[resend-webhook]` prefix, ack 200).

- [ ] **Step 6: Build + full email tests** — `bunx next build` clean; `bun test lib/switch lib/email/__tests__/usage.test.ts` PASS.

- [ ] **Step 7: Operator step (document in commit message):** create the `switch@` inbound address/route in the Resend dashboard pointing at the existing webhook endpoint (same signing secret). Until then the branch is dead code behind `isSwitchInbound` — safe to ship.

- [ ] **Step 8: Commit**

```bash
git add lib/switch/export-columns.ts lib/switch/export-columns.test.ts app/api/webhooks/resend/route.ts migrations/20260716_switch_forwards.sql
git commit -m "feat(switch): forward lane - export normalize, account match, facts write, pass activation"
```

---

### Task 11: Brand kit from sender domain

**Files:**
- Create: `lib/brand/brandfetch.ts` (extract the fetch + mapping from `scripts/outreach/pilot-lib.mts`, which already holds the verified request shape + fixture `scripts/outreach/__fixtures__/brandfetch-sample.json`)
- Test: `lib/brand/brandfetch.test.ts` (drive with that existing fixture)
- Modify: the Task 10 campaign path to call it after the facts write

**Interfaces:**
- Consumes: `switch_forwards.sender_domain` (Task 10), env `BRANDFETCH_API_KEY` (exists for the outreach pilot — confirm name in `scripts/outreach/pilot-lib.mts` at execution and reuse it verbatim).
- Produces: `fetchBrandKit(domain: string): Promise<{ logoUrl: string | null; colors: string[]; fonts: string[] } | null>` (null on any failure — brand fill is best-effort, never blocks the lane) and `fillEmptyBrandFields(db, userId, kit): Promise<void>` — writes ONLY `user_brand_profiles` fields that are currently NULL/empty (never clobber what an agent typed; the write shape mirrors `app/api/user/brand/route.ts`).

- [ ] **Step 1 (RULE 0.4): crawl4ai `https://docs.brandfetch.com/`** Brand API reference — confirm endpoint, auth header, and response fields against the pilot's assumptions.

- [ ] **Step 2: Failing tests** — fixture → kit mapping; empty-fields-only rule (existing `logo_url` present → not overwritten; missing → filled).

- [ ] **Step 3: Run to verify failure**, **Step 4: Implement** (keep `scripts/outreach/pilot-lib.mts` delegating to the new lib module so there is ONE Brandfetch root — modify the script's import, don't fork the logic).

- [ ] **Step 5: Tests + build PASS. Step 6: Commit**

```bash
git add lib/brand/brandfetch.ts lib/brand/brandfetch.test.ts scripts/outreach/pilot-lib.mts app/api/webhooks/resend/route.ts
git commit -m "feat(switch): brand kit from sender domain - one Brandfetch root, empty-fields-only fill"
```

---

### Task 12: The wow moment — rebuild their campaign + onboarding surface

**Files:**
- Create: `lib/switch/rebuild-campaign.ts`
- Test: `lib/switch/rebuild-campaign.test.ts` (prompt-derivation pure part)
- Modify: Task 10's campaign path (queue the rebuild after brand fill)
- Modify: `app/contacts/upload/UploadForm.tsx` + its page — add the "Switching from another platform?" section (Mailchimp button → `/api/email/contacts/mailchimp/start`; FUB key form → `POST /api/email/contacts/fub`; the switch@ instructions with the 2-click export walkthrough per platform; active-pass banner reading the user's `switch_passes` row)

**Interfaces:**
- Consumes: `buildContentDoc({ prompt, rawDoc, scope?, mode?, chartType? }): Promise<BuildResult>` (`lib/email/build-doc.ts:646`), `switch_forwards.html` (Task 10), the user's brand (applied by the existing build path).
- Produces: `deriveRebuildPrompt(campaignText: string, platform: string | null): string` (pure — strips HTML to text, truncates to 1500 chars, wraps in the rebuild instruction: "Rebuild this email the agent sent from their old platform as a fresh version with current market data. Keep their topic and intent; replace every stale figure with live data: …") and `rebuildForwardedCampaign(db, userId, forwardId): Promise<{ deliverableId: string | null }>` — builds off the `trend-snapshot` seed template (per the SLOT RULE, `lib/email/doc/default-docs.ts`), saves as a normal draft deliverable through the same persistence path the lab's build flow uses (locate at execution via the update-doc route from the 07/16 hub build), then emails the agent a link: "Your [platform] campaign, rebuilt with today's data — open to edit before it goes anywhere." EDIT-BEFORE-SEND: the rebuild NEVER sends; it lands as a draft.

- [ ] **Step 1: Invoke the `one-room` skill** before touching `/contacts/upload` UI (in-app page — reuse existing chrome verbatim).

- [ ] **Step 2: Failing tests** for `deriveRebuildPrompt` — HTML stripped, truncation boundary, platform mentioned when known, no invented figures in the instruction text.

- [ ] **Step 3: Run to verify failure**, **Step 4: Implement** prompt derivation + `rebuildForwardedCampaign` + webhook wiring + the UploadForm section.

- [ ] **Step 5: Tests + build** — `bun test lib/switch/` PASS; `bunx next build` clean.

- [ ] **Step 6: Commit**

```bash
git add lib/switch/rebuild-campaign.ts lib/switch/rebuild-campaign.test.ts app/contacts/upload app/api/webhooks/resend/route.ts
git commit -m "feat(switch): wow rebuild - forwarded campaign rebuilt as draft + switch section on upload page"
```

---

### Task 13: Live verify + ledger

- [ ] **Step 1:** Invoke the `verify` skill — production build on a clean port; walk: upload page shows the switch section → FUB import with a real key (operator provides at run time) or Mailchimp sandbox → pass row appears → `/api/contacts` returns `tier: "paid"` capabilities → send gate reports 500-limit. Forward lane: send a real Mailchimp-style email + a CSV export to switch@ (after the operator wires the Resend inbound address) and watch the webhook logs.
- [ ] **Step 2:** `node scripts/check.mjs close competitor_switch_onboarding_live_verify --evidence "<what was seen live>"` — ONLY on live proof (public.checks is prod evidence, not dev attestation).
- [ ] **Step 3:** SESSION_LOG entry + commit. NO push without operator approval.

---

## Self-review notes (run at execution too)

- Spec coverage: offer/activation (T1–T4), proof lanes (T4/T6/T7/T10), forward lane (T9–T11), wow rebuild (T12), connectors (T6–T7), instrumentation (T1/T8), extensibility (activation seam is lane-agnostic). Compliance: opt-out one-way import (T5). Parked items already have checks (opened 07/16) — nothing in this plan touches them.
- The Google connector still writes legacy `email_contacts` via `lib/email/upsert-contacts.ts` — pre-existing, tracked by the 07/05 unification's own check; NOT this plan's scope. New lanes write `public.contacts` only.
- `Date.now()` in `activateSwitchPass` is fine (app code, not a Workflow script).
