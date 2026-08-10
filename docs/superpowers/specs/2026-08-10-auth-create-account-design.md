# Create-account framing + first-login Brand routing — one login root

> **Recommended model:** ⚡ Sonnet — small, 2 components + 1 pure function + tests

**Date:** 2026-08-10. State verified against running code this session; competitor patterns
crawled live via crawl4ai the same day (research:
`_RESEARCH/competitor-and-strategy/2026-08-10-auth-screen-create-account-patterns.md`).

**Operator, verbatim:** *"make a create an account button at the bottom of log in … or does
just putting in an email create an account? can first log in lead to Brand fill out with
email already filled in?"* — then, correcting the framing: *"but if you already have an
account, you aren't creating an account. crawl4ai what real companies do"* — and approving:
*"yeah, spec and fix up whatever we have there right now. should be a root so this updates
every page."*

---

## Problem

1. The header Log In button opens `LoginModal`, whose only copy is "Sign in." Email + code
   ALREADY creates the account (`signInWithOtp({ shouldCreateUser: true })`,
   `app/login/login-form.tsx`) — but a new visitor is never told, so the button reads as a
   wall on a product that advertises "free to build" (flagged by the outside Hermes audit).
2. After verify, everyone hard-navigates to `next` (default `/project`). No first-login
   detection exists; a brand-new account lands on an empty projects page instead of Brand
   fill-out, and the email they just typed is asked for again later (`contact_email` in the
   Brand editor starts blank).
3. The login card's heading/blurb is rendered separately by `app/login/page.tsx` and
   `components/landing/LoginModal.tsx` — two copies of the copy. A wording change edits two
   files today, N files tomorrow.

## Research basis (crawled 08/10/2026)

- Substack (passwordless email code — our exact mechanics): "Sign in to Substack" +
  footer "First time here? Create an account." Shared flow, split framing.
- Dropbox: one screen titled "Log in or sign up for free."
- GitHub: separate /signup exists only because password auth needs different fields.
- Conclusion: nobody with passwordless auth builds a second signup mechanism — they split
  the copy, not the flow, and capture profile info AFTER the account exists.

## Design

### D1 — One auth-card root: `AuthPanel`

New client component `components/auth/AuthPanel.tsx` owning the ENTIRE card: heading,
blurb, `LoginForm`, and the mode toggle. Both consumers re-render it:

- `app/login/page.tsx` renders `<AuthPanel next={redirectTo} />` (server page keeps the
  auth-redirect guard; the card itself is the client root).
- `components/landing/LoginModal.tsx` renders `<AuthPanel next="/project" onSignedIn=… />`
  inside the portal chrome (overlay + close button stay in the modal).

Copy lives in ONE map inside AuthPanel:

- `signin`: title "Sign in" · blurb "Enter your email. We'll send you a sign-in code." ·
  footer toggle: "First time here? **Create your account** — free, no credit card."
- `create`: title "Create your account" · blurb "Enter your email — we'll send you a code.
  Free, no credit card required." · footer toggle: "Already have an account? **Sign in**."

Explicit `title`/`blurb` props (the email-lab's "Save your brand" framing) override the map
and suppress the toggle — stay-in-place mode is a task, not an entrance.

The mechanics do not change: same `LoginForm`, same `signInWithOtp` with
`shouldCreateUser: true`, both modes. The toggle changes framing only.

### D2 — Post-verify routing: first login lands on Brand, email pre-filled

New pure function `lib/auth/post-login-route.ts`:

`postLoginDestination({ stayInPlace, profileStarted, next })` →
- `stayInPlace` (onSignedIn present) → `null` (caller handles; NEVER navigate)
- `profileStarted === false` → `/account/brand?welcome=1`
- otherwise (true OR unknown/fetch-failed) → safe `next` (existing `isSafeReturnPath` guard)

`LoginForm.verifyCode` on success (non-stay-in-place): `GET /api/user/brand`, compute
`profileStarted` = branding row has any non-empty value; on ANY fetch error treat as
`unknown` → fall through to `next`. Routing keys on PROFILE STATE, not on which door was
clicked — an existing user who wrongly clicks "Create account" signs in normally and goes
to `next`; a new user who wrongly clicks "Sign in" still gets the Brand welcome.

### D3 — Brand editor email pre-fill

`GET /api/user/brand` adds read-only `account_email` (the Supabase auth email) to its
payload. `AccountBrandEditor` seeds the `contact_email` input with it when the saved value
is blank. Seed is a DEFAULT in the input, not a silent write — nothing persists until the
user saves (no invented saved values). `?welcome=1` renders a one-line welcome strip
("Your account is ready — set up your brand so every build signs as you.") on the brand
page; absent param = today's page byte-for-byte.

### Out of scope (already spec'd elsewhere, not rebuilt here)

Social login activation (`NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS` — built, dormant), the full
brand wizard, and auto-populate from socials: `2026-07-16-brand-fill-once-design.md`.
Header stays as-is — "Build one free" remains the primary signup funnel (locked lab-first
decision); no third header button, no dropdown (Hermes's dropdown suggestion rejected —
Dropbox/Substack/GitHub all show auth CTAs as visible buttons).

## Failure modes → guards

1. **Stay-in-place regression** — routing fires inside the email lab and hard-navigates a
   half-built email away. Guard: `postLoginDestination` returns `null` whenever
   `stayInPlace`; unit test asserts it; `LoginForm` short-circuits on `onSignedIn` BEFORE
   any routing fetch (existing behavior preserved).
2. **Wrong-door mismatch** — existing user clicks Create, gets told "account created."
   Guard: routing + post-verify copy key on profile state, not the clicked mode; no
   "account created!" claim is ever rendered (verify screen copy stays mode-neutral).
3. **Brand fetch fails post-verify** — user stranded on the modal. Guard: any error →
   destination falls back to safe `next`; unit test for the unknown branch.
4. **Open redirect** — `next` abused. Guard: existing `isSafeReturnPath` stays the single
   gate; routing function returns `next` only through it (test: `//evil.com` → `/`).
5. **Copy drift across pages** — a future page hand-rolls its own login card. Guard: the
   copy map is not exported; rendering a login card requires `AuthPanel`. Grep-check in
   review: no other `LoginForm` imports outside AuthPanel.
6. **Welcome strip on every visit** — `?welcome=1` bookmarked/shared. Accepted: the strip
   is one line of copy, harmless on revisit; no state stored.
7. **Pre-fill becomes silent write** — seeded email saved without user intent. Guard: seed
   only populates the INPUT when saved value is blank; PATCH still sends only what the
   editor holds when the user clicks Save (no auto-save on load); test on the seed helper.
8. **Modal `next` loses gated destination** — modal hardcodes `/project` today; unchanged
   in this build (documented, not a regression).

## Testing

- `lib/auth/post-login-route.test.ts` (bun:test): stay-in-place → null; empty profile →
  brand welcome; started profile → next; unknown/error → next; unsafe next → "/".
- Seed helper test: blank saved value + account email → seeded; saved value present →
  untouched.
- `bunx next build` green (the repo's verification standard).
- Render-and-look: /login page and header modal both show both modes (screenshot pass).
