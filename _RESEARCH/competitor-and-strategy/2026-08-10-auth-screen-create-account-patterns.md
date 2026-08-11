# Auth-screen "Create an account" patterns — live crawl 08/10/2026

Operator ask (08/10/2026): a Create-an-account button at the bottom of the login modal, but
"if you already have an account, you aren't creating an account" — crawl4ai what real
companies do. Crawled live the same day via the pinned crawl4ai CLI.

## Our current state (code, probed same session)

- Header "Log In" → client-side modal (`components/landing/LoginModal.tsx`), no URL — why
  Hermes's outside-in audit found no href and guessed (wrongly) external SSO.
- `app/login/login-form.tsx` line 71: `signInWithOtp({ shouldCreateUser: true })` — email +
  8-digit code ALREADY creates the account when none exists. Login and signup are one flow;
  only the copy ("Sign in") hides it.
- After verify: hard nav to `/project` always. No first-login detection, nothing routes a
  new user to Brand.
- Social login buttons built but dormant (`NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS` unset).
- Brand pre-fill: email lives on the Supabase user object — zero new capture needed.

## Live crawl results (crawl4ai, 08/10/2026)

- **Substack** (substack.com/sign-in — passwordless email code, SAME mechanics as ours):
  heading "Sign in to Substack", email field + Continue, secondary link "Sign in with
  password", footer: **"First time here? Create an account"** → signup surface. So even a
  fully passwordless product keeps a labelled create-account entry — the flow is shared,
  the FRAMING is split.
- **Dropbox** (dropbox.com/login): heading is literally **"Log in or sign up for free"** —
  one unified screen, email + Continue, provider buttons. The honest-unified pattern.
- **GitHub** (github.com/login — password auth): "Sign in to GitHub" + footer **"New to
  GitHub? Create an account"** → separate /signup. The classic two-surface split, driven by
  password auth needing different fields at signup.
- **Notion, Linear** (notion.so/login, linear.app/login): client-rendered, no SSR text to
  crawl. Known-pattern from their public product (unverified this session): unified
  "Continue with email".
- **Slack** (slack.com/signin): rendered nav only, form is JS; no copy captured.

## The two real patterns

1. **Unified-honest** (Dropbox): one screen titled "Log in or sign up". No second button.
2. **Shared-flow, split framing** (Substack — our closest analog): default screen says
   Sign in; a "First time here? Create an account" line at the bottom flips to
   create-account framing. Underneath it's the same email flow.

Both are legitimate; nobody with passwordless auth builds a genuinely separate signup
*mechanism* — they split the copy, not the flow, and put the profile capture AFTER the
account exists (Substack onboards name/handle post-verify).

## Implication for us

The Substack shape maps 1:1: keep the modal defaulting to Sign in, add the bottom
"First time here? Create an account" toggle that re-titles the same modal ("Create your
account — enter your email, we'll send you a code"), and route a verified NEW account to
Brand fill-out with email pre-filled — which is the already-spec'd brand-fill-once wizard
territory (`docs/superpowers/specs/2026-07-16-brand-fill-once-design.md`, P1 shipped
07/16, wizard phase unbuilt).
