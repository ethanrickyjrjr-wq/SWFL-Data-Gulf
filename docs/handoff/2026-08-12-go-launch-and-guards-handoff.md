# /go — launch guards handoff (everything except payment)

**Status: DESIGNED, NOT BUILT**, except where marked VERIFIED LIVE. Companion to
`2026-08-12-go-paywall-payment-handoff.md` (Stripe/pricing piece — read that one for the money
side). This doc covers: what `/go` is, the live risk, the throttle, the spend cap, and the email
gate.

## What `/go` is (confirmed this session, don't re-derive)

`/go` (`app/go/page.tsx`, `components/go/OneClickHero.tsx`, `GoTopBar.tsx`, `brand.ts`) is a
chrome-free, standalone "type an address, pick an email type, land in the lab prefilled" launcher,
built 08/10/2026. It is explicitly a **no-lake, Apify-cost-bearing funnel** — every completed
build can spend real vendor money, unlike the rest of the product (`docs/superpowers/plans/
2026-08-10-go-one-click-apify-handoff.md`, `docs/standards/go-playbook.md` PART 3: "/go is
explicitly a no-lake product"). It is live in the tree on `main`, reachable only by direct URL (no
nav links), and **slated for a standalone repo/domain/Supabase carve-out later** (planned, not
executed — don't build anything here that assumes it stays in this repo forever, but don't block
on the carve-out either, it isn't scheduled).

`docs/standards/go-playbook.md` PART 7 has this exact question listed as open and unruled before
this session: "Does /go also send, or hand off to sign-in? What does a signed-out visitor lose —
save, send, or nothing?" This session's operator decisions (email before build; `go_unlimited`
unlocks send) answer it — write that back into PART 7 when this actually ships.

## VERIFIED LIVE — the urgent one

**`OPERATOR_APPROVED_PAID_RUN` is set in Vercel Production right now** (`npx vercel env ls
production`, created 2 days ago — i.e. right when `/go` shipped). The Apify paid lane
(`lib/listings/apify-spend-guard.ts`) is armed. Every `/go` build today can spend real money —
up to ~$3 worst case per the process ceiling (`PROCESS_RESULT_BUDGET = 300` results ×
`$0.01`), ~$0.04–0.05 typical per the "Ohio test" cited in the Apify handoff plan — **with zero
per-visitor limit and zero cross-process ceiling.** This is the same failure shape that already
cost $14.08 across 21 actor runs in one session on 08/05/2026 (operator: *"3.95 to build one
fucking house email?!"*), now sitting on public-facing traffic. This is the first thing to guard,
not the last.

## The one thing already correctly architected — use it, don't route around it

`lib/listings/apify-spend-guard.ts`'s `requestSpend()` is, by the file's own design comment, "the
ONE place in this tree where money actually leaves the process... guarding the bottom means no
caller can opt out — present or future, deliberate or by accident." **Any new global spend cap
belongs inside or immediately beside this function**, not in a specific build route — that's what
makes it automatically cover every current and future Apify caller instead of needing to trace and
gate each one individually. (`fetchApifyComps` in `apify-comps.ts` is called from
`lib/listings/apify-baths.ts`; `lib/listings/paid-record-lane.ts`'s `fillFromPaidRecord` is a pure
read of already-cached rows and NEVER spends money — don't gate that file, there's nothing to
gate.)

## Design, piece by piece (operator-approved shape, numbers are his)

1. **Rate throttle** — new, e.g. `lib/listings/go-throttle.ts`. Keyed by `sdg_cid` cookie +
   `ip_hash` (both already columns on `usage_events`) — NOT `user_id`, because this has to catch
   abuse before/around the email gate too. Operator's numbers verbatim: **max 1 build attempt per
   ~2 minutes, max 5/day.** Checked at `/go`'s entry point, before the email gate or anything else
   fires.
2. **Global monthly Apify spend cap** — extends `requestSpend()` (see above) with a persisted
   cross-process counter (new small table or a KV-style row; the existing `ledger` in that file is
   explicitly process-scoped and resets every invocation, so it cannot see this). Env-tunable
   ceiling (e.g. `GO_MONTHLY_APIFY_CAP_USD`). **On exceed: degrade gracefully** — build completes
   with open slots where paid data would have gone, same as the existing switch-off behavior,
   never a hard error shown to the visitor (operator confirmed this, but also said the throttle
   above is what should really prevent ever hitting it: *"shouldn't have to worry about that if
   the correct guards are up"*).
3. **Email-before-build gate** — `OneClickHero.tsx`'s `build()` function checks auth state before
   calling `heroDestination`/`window.location.assign`. Signed out → open the existing OTP
   `AuthPanel` (same root used by `app/login` and `LoginModal`, `signInWithOtp({
   shouldCreateUser: true })`) inline instead of navigating. Build only fires after verification.
   This is a REAL account, not a bare email-capture field — that's WHY the payment handoff pivots
   to the subscription-tier gate instead of a guest-cookie flow.

## Open gaps — real, not yet closed

1. **`/go` has never been driven end-to-end in a real browser.** Open check
   `address_first_signedin_live_drive` ("1d untouched" as of this session). SESSION_LOG 08/11
   claims it's "wired end to end" but only unit/build-level proof exists. **Any gate built on top
   of this needs to be re-verified once the underlying flow itself is confirmed working** — don't
   assume a gate "works" just because it compiles; the thing underneath it hasn't been proven to
   render a real email yet.
2. **The exact POST route the email-lab grid's auto-build hits for a `/go`-originated build was
   not fully traced this session.** `lib/lab-entry/arrival.ts`'s `holdArrivalForPopup` confirms a
   signed-out arrival never holds for brand gaps (08/11 decree — "no popups on the one-click
   flow"), but which route actually fires the build POST, and whether it's the same
   `app/api/projects/[id]/build/route.ts` the rest of the lab shares, is unconfirmed. This matters
   for two reasons: (a) the free-build counter in the payment handoff needs to count ONLY `/go`
   builds, not the whole lab's free-forever builds, and (b) confirms whether the email gate in
   piece 3 above needs to also block a client-side path that skips `OneClickHero.tsx` entirely
   (e.g. a direct `?recipe=&addr=` URL hit). **Trace this before wiring the build-count gate** —
   it's the single fact that determines whether the gate design above is even attaching to the
   right code.
3. No code has been written for any of the three pieces above. No tests. No failure-modes section
   formally written (started during brainstorming, not finished — the interrupted design covered:
   spend-cap-fails-open-vs-closed [resolved: degrade gracefully], throttle-defeated-by-incognito
   [not resolved — cookie rotation still lets a new `sdg_cid` mint per incognito window; `ip_hash`
   is the only real defense there and rate limits by IP can hit shared-NAT false positives, not
   discussed with operator]).

## Next step

Register via `node scripts/new-build.mjs go-launch-guards "/go rate throttle + spend cap + email
gate"`. **Start with gap #2 above** (trace the real build route) — everything else in this doc
depends on getting that right, and the advisor consulted mid-session flagged this exact trap:
gating the wrong route means `/go` traffic sails past the gate untouched while it looks solved.
