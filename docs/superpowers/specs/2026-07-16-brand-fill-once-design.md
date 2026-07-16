# Fill-once brand profile: ledger + wizard + auto-populate + social login

> **Recommended model:** ⚡ Sonnet — 8 tasks, keywords: migration


**Date:** 2026-07-16. State verified against running code that day; vendor facts verified
via crawl4ai the same day (sources inline).

**Operator, verbatim:** *"make it easier for users to get branding and information filled in
once and only once … make sure brand profile is 'talking' to every different build and social
so they know where information is, what they have and what they need … auto populate
information route from personal websites, linked in, socials … an easy button if they log
into their socials from our site or use socials to log in … we can have that as an option
for sign up, too."* And on the wizard question: *"easy, straightforward, user knows process
from start and that it is saved and some things upgraded as we go, if they want."*

---

## Problem

The account profile (`user_brand_profiles`) is already wide — identity, bio, colors +
palette library, fonts, 8 social URLs, CAN-SPAM contact block, preferences — and already
copies onto every new project at birth (`lib/project/apply-brand.ts`, fixed 07/15 to carry
ALL fields). The build popup already collects missing must-haves and, on the standalone
lane, banks them to the account. But:

1. **No shared "have/need" model.** `Recipe.needs` is the only gap list, and only the
   popup reads it. The Brand panel, socials surface, and project lane each have their own
   blind spots. Nothing talks.
2. **The project lane doesn't ask or bank.** A project with empty branding silently signs
   with house defaults (caveat shipped 07/16 with seed capture-or-blank).
3. **Zero auto-populate.** Nothing pulls from a website, LinkedIn, or a connected social —
   even though the LinkedIn posting-connect already requests `openid profile email`.
4. **Login is email-code only** (`app/login/login-form.tsx`). Signup hands us nothing but
   an email address.

So a user is asked for the same fields in different places, or never asked at all and
ships an email signed by a placeholder.

## Goal

Branding and identity are filled **once and only once** — by import when we can, by typing
when we must — and every surface (build popups on both lanes, Brand panel, socials) reads
and writes ONE spine, so nothing already known is ever asked again. A brand-new user, a
name-and-email user, and a 90%-filled user all get the same behavior: we actively fill
what we can, ask just-in-time for what we can't, and always say it's saved.

---

## Research (crawl4ai, 07/16/2026)

- **NN/g, Mobile-App Onboarding (Kendrick 2020, nngroup.com):** skip onboarding whenever
  possible — EXCEPT when "you need user information to get started" and when the product
  is "highly tailored to the user's context." We are both (emails ship under the agent's
  name/license). Conditions: keep it brief, explain why you're asking, and anything not
  justifiable at launch is gathered later.
- **NN/g, Wizards (nngroup.com):** setup/configuration is the canonical wizard use case.
  Requirements: show the steps up front, allow exit midway with state saved + resume,
  reuse known values as defaults.
- **Supabase identity linking (supabase.com/docs/guides/auth/auth-identity-linking):**
  Supabase **automatically links** a new OAuth identity to an existing user with the same
  verified email. Unconfirmed identities are removed on link (pre-account-takeover guard).
  Manual `linkIdentity()` exists but is beta + config-gated — not needed for v1.
- **Supabase social login (supabase.com/docs/guides/auth/social-login):** provider tokens
  are returned at callback but NOT stored by Supabase — capture server-side if we ever
  need the provider's API afterward (the posting-connect lane already does this pattern).
- **LinkedIn OIDC (learn.microsoft.com "Sign In with LinkedIn using OpenID Connect"):**
  claims are `name`, `given_name`, `family_name`, `picture`, `email` (optional),
  `email_verified`, `locale`. **No headline, no vanity URL** — those need
  partner-restricted APIs. Supabase provider slug is **`linkedin_oidc`** (verified against
  supabase.com/docs/guides/auth/social-login/auth-linkedin; the old `linkedin` is dead).
- **Provider seed reality:** Google → name + photo + email. Facebook → name + photo.
  LinkedIn → name + photo + email. Apple → name only, FIRST sign-in only, often a private
  relay email. Title, brokerage, license, bio never come from login — only from the
  website import or the user.

Decisions taken with the operator 07/16: all four sub-builds in one phased spec; consent =
review card (one click accepts); write-back = bank upward when blank; providers = Google,
LinkedIn, Facebook, Apple; shape = tiny skippable wizard on the ledger spine; sign-in
identity basics (name/photo/email) fill blanks silently, everything else via review card.

---

## What we're building

### A. The Profile Ledger — one have/need root

New pure module `lib/brand/profile-ledger.ts`:

- **`PROFILE_FIELDS`** — the canonical registry of every account-profile field (the same
  keys `app/api/user/brand/route.ts` already allowlists: AGENT_FIELDS, COLOR_FIELDS,
  FONT_FIELDS, SOCIAL_FIELDS, CONTACT_FIELDS, PREFERENCE_FIELDS). Each entry: `key`,
  `label`, `tier`, `askCopy` (why we're asking — NN/g's "explain why"), and `printedBy`
  (which deliverable surfaces render it).
- **Tiers:**
  - `must` — `agent_name`, `brokerage`, `business_address`. The CAN-SPAM signature
    block. The ONLY fields a popup may demand.
  - `boost` — `photo_url`, `agent_title`, `license`, `contact_phone`, `contact_email`,
    `website_url`, `agent_bio`. Asked just-in-time only when a build prints them, each ask
    naming the deliverable that wants it.
  - `nice` — colors, fonts, social URLs, preferences. Never popped; Brand-panel checklist
    only.
- **`profileGaps(profile, needs?)`** — pure: given a merged profile blob (account ⊕
  project branding) and an optional needs list, returns the missing fields with their ask
  copy. Build popups pass the recipe's needs; the Brand panel passes nothing (full
  checklist); the socials page passes the social fields.
- `Recipe.needs` keys become references into this registry (`BrandNeed` stays the type;
  the labels/ask copy move here so there is ONE authority — no parallel list survives).

### B. Bank upward when blank

Server helper `bankBrandFields(supabase, userId, patch)`: for each field in the patch,
fill `user_brand_profiles` ONLY where the account value is currently null/empty. Never
overwrites. Wired into:

- the project-lane popup save and project Brand-panel save (net-new upward flow —
  closes the 07/16 caveat),
- the wizard steps (each step commits through it — safe because the wizard only ever
  shows blank fields),
- sign-in claim seeding (§E).

Review-card acceptance does NOT route through it: a ticked "use found" on an
already-filled field is an explicit, consented overwrite — it PATCHes the account
profile directly. Blank-only semantics are for implicit flows; the card is the one
place the user is looking at both values and choosing.

The standalone account-level PATCH (`/api/user/brand`) keeps its existing overwrite
semantics — that surface IS the account editor. Downward copy at project birth
(`applyUserBrandToProject`) is unchanged. Deliberate per-project divergence still works:
a project edit stays local whenever the account already holds a value.

### C. The brand-start wizard — a VIEW over the ledger

The wizard stores **no state of its own**. Every screen derives from `profileGaps`;
every answer commits immediately (through `bankBrandFields` / the brand PATCH). Exit
midway + resume later is therefore free — reopening it re-derives from what's still
blank. NN/g's save-state requirement is satisfied by construction.

- Appears once after first sign-in when the profile has no must-field; skippable at
  every step; steps listed up front; header carries the promise verbatim: **"Saved to
  your brand. You'll never type this twice."** Forever reachable from the Brand panel as
  "Import my info."
- **Step 1 — the easy button.** "Continue with LinkedIn" / "Continue with Google" (when
  not already the sign-in method) or ONE paste field accepting a website or LinkedIn URL.
  Escape: "I'll type it" / skip. If sign-in claims already cover step 1, it auto-skips.
- **Step 2 — confirm what we found.** The review card (§D). Blank fields pre-ticked;
  filled fields default "keep yours." One click accepts all. Nothing saves unseen.
- **Step 3 — the three that sign your emails.** Whatever must-fields survived import,
  plus optional headshot upload. Ask copy: "this is the signature and legal footer on
  every email you send."

### D. Auto-populate — one FoundFact shape, many sources

```ts
type FoundFact = {
  field: ProfileFieldKey;
  value: string;
  source: "website" | "linkedin" | "google" | "facebook" | "upload";
  sourceDetail: string; // URL
  evidence: string;     // verbatim snippet from the fetched page (website source)
};
```

- **Website import** — new server route `POST /api/user/brand/import { url }`: fetch the
  homepage (+ linked about/contact pages, small cap), AI-extract name, title, brokerage,
  license, phone, email, address, social URLs, headshot candidate, bio raw material.
  **Evidence gate (the no-invention rule, mechanical):** every extracted fact must carry a
  verbatim `evidence` snippet; a fact whose snippet does not appear in the fetched text is
  DISCARDED server-side before anyone sees it. Not on the page → not offered. Spend note:
  this is a new paid-API surface (one Claude extraction call per import) — heads-up to the
  operator before its first live run, per standing spend policy.
- **Sign-in claims** — name, photo, email from the chosen provider (§E). The three
  identity basics fill blank fields silently (the OAuth consent screen was the consent);
  they also appear in the wizard's review so the user sees where they came from.
- **Social connect (posting OAuth)** — the existing callback can emit FoundFacts
  (name/photo) into the same card. Later phase; same shape, zero new UI.
- **The review card** — ONE component, used by wizard step 2 AND the Brand panel Import
  button. Each fact renders with a source chip ("From your website", "From LinkedIn").
  Acceptance PATCHes the profile; bio raw material additionally lands in
  `agent_profile_facts` with `source: web_cited` + URL (the 07/13 provenance table,
  unchanged). Identity/contact fields don't get fact rows — they're the signature, not
  claims; the review card is the consent moment.

### E. Social login

- `app/login/login-form.tsx` gains provider buttons above the email-code form:
  Google, Facebook, LinkedIn (**`linkedin_oidc`**), Apple — via
  `supabase.auth.signInWithOAuth` with `redirectTo` = the existing `/auth/callback`
  threading `next` (verify the callback handles the OAuth code exchange during
  implementation; it exists for the OTP-link fallback today).
- Buttons render only when the provider is configured — reuse the
  `socialOauthConfigured` pattern (env-gated), so an unconfigured provider is simply
  absent, never broken.
- **Auto-link:** same verified email → same account (vendor-documented, §Research). No
  migration for existing email-code users.
- **Apple caveats (in-spec, honest):** relay email means a different address → a separate
  account; login page shows "use the same email you signed up with" hint. Requires the
  $99/yr Apple Developer account → ships configured-but-parked like Google Business
  Profile (connect, never block launch).
- **Rollout:** Google first, then LinkedIn + Facebook (developer apps already exist for
  the posting connect), Apple when the dev account happens.
- **Seeding:** on first OAuth sign-in, a server-side step maps claims → blank-only fills
  (`agent_name`, `photo_url`, `contact_email`) through `bankBrandFields`.

### F. Surfaces, all reading one spine

- **Build popups, BOTH lanes:** gaps = `profileGaps(merged(account, project), recipe.needs)`.
  The project lane finally asks-and-banks like the standalone lane. A field known anywhere
  is structurally incapable of being asked again.
- **Brand panel (project + account quick-access):** a completeness strip — have / missing /
  why it matters, each gap naming the deliverable that wants it ("Agent Launch wants your
  origin story" — this implements the 07/13 spec's Piece-3 ask list). Plus the Import
  button opening the review card.
- **Socials page:** social-field gaps from the same ledger; connecting an account doubles
  as a fill source.

### G. Errors

- Website unreadable / extraction empty → "couldn't read your site," fall through to
  typing. An import failure never blocks anything (a build is never refused).
- OAuth denied/failed → back to login with a plain message (existing error-page pattern).
- Extraction offers nothing it can't quote (evidence gate, §D).
- `bankBrandFields` is best-effort like `applyUserBrandToProject` — a bank failure never
  fails the save that triggered it.

### H. Testing

- `profileGaps`: tier logic, needs filtering, merged-profile precedence (project overrides
  account), empty-vs-filled edge cases.
- `bankBrandFields`: blank-only semantics — never overwrites, fills nulls/empties only.
- Evidence gate: poisoned fixture (extraction returns a fact whose snippet is NOT in the
  page) → fact dropped server-side.
- Review card: never writes an unticked field; keep-yours default on filled fields.
- Wizard: derives purely from gaps (a full profile renders no wizard; a half profile
  renders only the blank steps) — resume-by-construction.
- Login: provider buttons render only when configured.
- Live-verify: `brand_fill_once_live_verify` (opened 07/16).

---

## Phases — each ships alone

1. **P1 — the spine.** Ledger + `bankBrandFields` + both popup lanes on `profileGaps` +
   Brand-panel completeness strip.
2. **P2 — the fast lane.** Wizard + website import route (evidence gate) + review card.
3. **P3 — the front door.** Social login (Google → LinkedIn/Facebook → Apple parked) +
   claim seeding. Social-connect-as-fill-source rides here or later.

---

## Landmines

- **Two stores by design.** Account profile vs `projects.branding` — bank upward fills
  account blanks only; never sync filled values in either direction outside project
  birth. Full two-way sync was considered and REJECTED (kills legitimate per-project
  variants).
- **The AI skips brand blocks by design** (07/13 spec). Nothing in this build may default
  an instruction or placeholder into a brand block.
- **LinkedIn gives NO headline/title via OIDC.** Don't promise it in UI copy; title comes
  from the website import or the user.
- **Provider tokens aren't stored by Supabase.** If a future phase wants provider-API
  data post-login, capture the token at the callback (posting-connect already models
  this).
- **`user_brand_profiles` typing:** new columns (if any) need regenerated Supabase types —
  this build currently adds NO columns; the ledger is registry + reads over existing ones.
- **Import is a paid-API surface.** Operator heads-up before first live run; never in a
  scheduled/cron path.
