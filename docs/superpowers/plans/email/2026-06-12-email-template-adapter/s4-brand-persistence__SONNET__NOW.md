# Section 4 — Brand Persistence
**Builder: Sonnet**
**Gate: None — build now, no shell dependency**
**Output: DB migration + `lib/email/templates/resolve-brand.ts`**

---

## Why this exists

Brand only lives at the project level today (`projects.branding` JSONB). No user-level store means:
- New projects start blank — user re-enters colors every time
- No mechanism to carry brand from a marketing email signup into the new account
- The AI has no ambient brand context for "make me a flyer" style requests

---

## Brand resolution hierarchy

```
Most specific
  ↓  project.branding              (current project — checked first)
  ↓  user_brand_profiles row       (account default — NEW)
  ↓  null                          (new user, no brand yet — prompt, never SWFL defaults)

SWFL defaults = internal/unauthenticated use only. Never for a logged-in user.
```

---

## Sequential build order

**4A and 4B run in parallel. 4C cannot start until both are done. 4D needs 4C. 4E needs 4D.**

```
[4A] DB migration  ──┐
(parallel)           ├──→  [4C] project auto-fill  →  [4D] signup capture  →  [4E] AI context
[4B] resolve-brand ──┘
```

---

## Task 4A — DB Migration (Sonnet)
**Runs in parallel with 4B**

Write to: `supabase/migrations/YYYYMMDDHHMMSS_brand_persistence.sql`

```sql
-- user_brand_profiles: one row per user, account-level brand default
CREATE TABLE IF NOT EXISTS public.user_brand_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_color         text,
  accent_color          text,
  logo_url              text,
  company_name          text,
  website_url           text,
  sender_name           text,
  sender_address        text,
  sender_domain_verified boolean NOT NULL DEFAULT false,
  source                text NOT NULL DEFAULT 'manual',
  -- 'manual' | 'project_derived' | 'email_signup' | 'brandfetch'
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_brand_profiles_user_id_key UNIQUE (user_id)
);
ALTER TABLE public.user_brand_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brand" ON public.user_brand_profiles
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE ON public.user_brand_profiles TO authenticated;

-- prospect_brand on email_subscribers: carries brand from outbound prospecting email
ALTER TABLE public.email_subscribers
  ADD COLUMN IF NOT EXISTS prospect_brand jsonb;
-- shape: { primary_color, accent_color, logo_url }
-- populated at send time when we send a prospect a branded marketing email
-- read at signup to pre-fill user_brand_profiles
```

Run idempotently. Verify row counts after: `SELECT COUNT(*) FROM public.user_brand_profiles;`

---

## Task 4B — resolve-brand.ts (Sonnet)
**Runs in parallel with 4A**

File: `lib/email/templates/resolve-brand.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractBrandTheme } from '@/lib/deliverable/brand-theme';
import type { BrandTheme } from '@/lib/deliverable/brand-theme';

export async function resolveUserBrand(
  supabase: SupabaseClient,
  userId: string,
  projectId?: string,
): Promise<BrandTheme | null> {
  // 1. Project-level — most specific active context
  if (projectId) {
    const { data: project } = await supabase
      .from('projects')
      .select('branding')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();
    const brand = extractBrandTheme(project?.branding ?? null);
    if (brand) return brand;
  }

  // 2. User-level account default
  const { data: profile } = await supabase
    .from('user_brand_profiles')
    .select('primary_color, accent_color, logo_url')
    .eq('user_id', userId)
    .single();

  if (profile?.primary_color || profile?.accent_color || profile?.logo_url) {
    return {
      primary: profile.primary_color ?? null,
      accent:  profile.accent_color  ?? null,
      logoUrl: profile.logo_url      ?? null,
    };
  }

  // 3. No brand on file — caller must prompt user to set one
  // NEVER fall back to SWFL_THEME for an authenticated user
  return null;
}
```

---

## Task 4C — Project Auto-Populate (Sonnet)
**Needs 4A + 4B both done**

Location: wherever `INSERT INTO projects` happens in the project creation API.

After insert, copy user brand to the new project if the project has no brand yet:

```typescript
const userBrand = await resolveUserBrand(supabase, userId);
if (userBrand && !newProject.branding) {
  await supabase.from('projects').update({
    branding: {
      primary_color: userBrand.primary,
      accent_color:  userBrand.accent,
      logo_url:      userBrand.logoUrl,
    }
  }).eq('id', newProject.id);
}
```

---

## Task 4D — Signup Brand Capture (Sonnet)
**Needs 4C done**

In the signup completion handler (Supabase auth webhook or post-signup API route):

```typescript
const { data: subscriber } = await supabase
  .from('email_subscribers')
  .select('prospect_brand')
  .eq('email', newUser.email)
  .single();

if (subscriber?.prospect_brand) {
  await supabase.from('user_brand_profiles').upsert({
    user_id:       newUser.id,
    primary_color: subscriber.prospect_brand.primary_color ?? null,
    accent_color:  subscriber.prospect_brand.accent_color  ?? null,
    logo_url:      subscriber.prospect_brand.logo_url      ?? null,
    source:        'email_signup',
  }, { onConflict: 'user_id' });
}
```

Also: when we send a branded prospecting email, write the brand to `email_subscribers.prospect_brand` before sending.

---

## Task 4E — AI Context Wiring (Sonnet)
**Needs 4A + 4B + 4C + 4D all done**

The briefcase session context payload (wherever project + user data is assembled for the AI) must include the resolved brand.

```typescript
const brand = await resolveUserBrand(supabase, userId, projectId);
// Include in AI context as structured data — not prose
// e.g. { brand: { primary: '#0F2035', accent: '#1BB8C9', logoUrl: null } }
```

When brand is null (new user, no email match): AI asks once → user answers → immediately upsert `user_brand_profiles` with `source = 'manual'` → never asks again.

---

## Verification

```bash
# 4A: migration applied
psql $DB_URL -c "SELECT COUNT(*) FROM public.user_brand_profiles;"
psql $DB_URL -c "\d public.email_subscribers" | grep prospect_brand

# 4B: resolveUserBrand returns null for new user, project brand for known project,
#     user profile brand when project.branding is null

# 4C: create a new project for a user with a brand_profile → branding auto-fills

# 4D: signup with an email that has a prospect_brand entry → user_brand_profiles row created

# 4E: open briefcase session → AI correctly uses saved brand without prompting
```
