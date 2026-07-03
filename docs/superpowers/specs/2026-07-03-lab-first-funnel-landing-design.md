# Lab-first funnel landing: zip CTA -> seeded email lab + send-to-self OTP capture

**Date:** 2026-07-03
**Status:** DRAFT — awaiting operator review. Operator ruled the direction live ("land in the lab set up like the webpage layout… then send to themselves so we get email"), then went AFK during brainstorm questions; the forks below were taken on the recommended option and are flagged.
**Check:** `lab_first_funnel_landing_live_verify` (opened via new-build 07/03/2026).
**Sibling spec:** `2026-07-03-homepage-rebuild-design.md` — this build IS that spec's Phase 2 (fork 1b machinery) plus the operator's send-to-self capture, and it RESOLVES that spec's flagged cross-lane seam (see below).
**Research basis:** crawl4ai pulls 07/03/2026 — userpilot.com/blog/product-led-growth-examples (PLG 2.0: value on first touch BEFORE account creation, ~60s aha benchmark, "remove the work, not just the friction", activation = first successful output), amplitude.com/blog/time-to-value-drives-user-retention (early value → retention). Raw markdown in session scratchpad (`crawl4ai-labfirst/`), never committed. Supabase OTP surface NOT re-crawled: the exact calls (`signInWithOtp` code-mode + `verifyOtp type:"email"`) are proven live in-repo at `app/login/login-form.tsx` — in-repo working code beats docs memory.

---

## Problem

The zip-report page's "Open your project →" CTA (promoted to the organic path 07/02) POSTs `/api/prospect/open-project`, which mints an **empty** claim token and lands the visitor on `/claim` — a sign-in wall whose copy was written for the Claude-handoff flow. A homepage visitor two clicks in reads: "Naples 34120 — Sign in to bring over 0 items you assembled with your AI." Operator hit this live 07/03 ("what the fuck is this"). The gate demands sign-in before showing any value — the exact inverse of the PLG 2.0 finding (value on first touch, before account creation).

## Goal (operator's words, 07/03)

"Land in the lab set up like the webpage layout that they can play with and then send to themselves in an email — so we get email and user gets to the lab to see what it can really do."

Concretely: anonymous visitor clicks the zip-report (or homepage map) CTA → the email lab opens **already holding a finished, branded-lookalike email built from that ZIP's live figures** → they poke it, restyle it, ask the AI to change it → the primary action is **"Send this to yourself"** → inline email + OTP code → the send lands in their inbox, we hold a verified email + a real account + a project containing a doc they shaped. Activation event = capture event = first successful output, one gesture.

## Forks taken while operator AFK (review these first)

1. **Capture mechanic = inline email + OTP code in the lab** (recommended). Reuses the exact two client calls from `app/login/login-form.tsx` (`signInWithOtp` with `shouldCreateUser: true` + `verifyOtp {type:"email"}`) restyled in a modal — verified email, real user, no redirect off the canvas, no new auth machinery, no anonymous-send abuse surface. Rejected: bare email field with a claim link (unverified, no account, an anonymous endpoint that mails AI-authored content anywhere = abuse surface); Send → `/login?next=` bounce (leaves the canvas at the emotional peak).
2. **The zip-report CTA becomes a plain link** to `/email-lab?zip=<zip>` (+ `ref` passthrough). No claim token is minted at arrival — the token's whole job (surviving a login redirect) is obsolete when auth happens inline at send time. `/api/prospect/open-project` stays live for `/welcome` funnel arrivals (they carry scraped brand, which the claim token handles well); it just loses its zip-report caller.

## Cross-lane seam — RESOLVED

`2026-07-03-homepage-rebuild-design.md` "Out of scope" flags: Lane C's zip-report CTA rides the `OpenProjectCta`/claim bridge while Lane B's map door seeds a deterministic doc via `lib/email/zip-seed.ts` — "same intent, two mechanisms, pin at plan time." **Pinned by this spec:** the lab-first mechanism wins everywhere anonymous. The claim bridge stops being an organic front door and remains only for `/welcome` email arrivals (brand-carrying) and the Claude MCP handoff (item-carrying) — the two flows it was actually designed for.

## What we're building

### 1. Entry points → `/email-lab?zip=`

- `app/r/zip-report/[zip]/page.tsx` build-bridge banner: replace `<OpenProjectCta zip={zip} />` with a styled `<Link href={`/email-lab?zip=${zip}${ref ? `&ref=${ref}` : ""}`}>`. Banner copy keeps its promise and the next screen now honors it. `components/prospect/OpenProjectCta.tsx` keeps its `/welcome` caller — do not delete.
- Homepage rail primary door already targets `/email-lab?zip=` (Phase 1, in flight in a parallel session — param currently accepted and ignored). This build makes the param real; no homepage file edits needed here. Coordinate at plan time if Phase 1 hasn't landed.
- `ref` (outreach attribution, `REF_RE`-validated) rides the query string and is recorded at project creation (step 4) instead of via the claim token.

### 2. The seeded doc — `lib/email/zip-seed.ts` (fork 1b's composer, built here)

- `buildZipSeedDoc(zip): Promise<EmailDoc | null>` — deterministic, code-composed (no LLM): place name header, headline figures (home value, listings/DOM, flood) from the SAME live loaders the ZIP page uses (zip-summary root, `zhvi_zip_latest`, `active_listings_residential_zip_stats`, NFIP agg), short deterministic prose, sources listed, as-of date MM/DD/YYYY stated once. Reference rendering: the 07/03 mock artifact (real 33914 pulls).
- Out-of-scope/unknown ZIP → `null` → caller falls back to today's `SEED_DOCS[0]` default (empty-tolerant, no error page, no invented place — the moat gate).
- Cacheable per ZIP per day; drive-by clicks and bots cost ~$0. AI enters only when the visitor edits — that's the taste moment.

### 3. Lab accepts the seed

- `app/email-lab/page.tsx`: read `searchParams.zip` (5-digit validated). Anonymous → pass to `EmailLabClient`, which awaits `buildZipSeedDoc` server-side (page is already `dynamic = "force-dynamic"`; seed built in the server component, passed as prop — the client never fetches).
- Signed-in: `labDestination()` and `AutoCreateProject` carry `?zip=` through their redirects (they drop query params today); the project Email tab seeds the same doc as a new draft with the project's brand. (Fork 1b's signed-in path, unchanged from the sibling spec.)

### 4. Send-to-self capture — the new piece

- `components/email-lab/SendToSelfModal.tsx`: two steps mirroring `login-form.tsx` exactly — email → `signInWithOtp({ email, options: { shouldCreateUser: true } })`; code (6–10 digits, never hardcode 6) → `verifyOtp({ email, token, type: "email" })`. No `emailRedirectTo` needed — nothing redirects.
- Anonymous `EmailLabShell` header grows a primary CTA **"Send this to yourself"** (present only when `onSave` is absent, i.e. the anonymous shell; signed-in surfaces keep their existing Send/Schedule).
- On verify success (session cookie now set):
  `POST /api/lab/claim-and-send` `{ doc, zip?, ref? }` (authed route, RLS session):
  1. Create project (name via `deriveProjectName(zip)` when present, else doc title), persist the doc as its deliverable — reusing the same persistence path the project Email tab's save uses.
  2. Record `ref` attribution the same way `/api/claim`'s winner block does (best-effort, never blocks).
  3. Fire ONE send to `user.email` only — through the existing deliverable send machinery (same renderer the blast route uses), free-tier watermark applied, CAN-SPAM footer from the standard shell. Recipient is hard-pinned server-side to the session user's email — the client never supplies an address.
  4. Return `{ projectId }`; modal closes into a signed-in state: "Sent — check your inbox," with the lab now their workspace (client hard-navigates to the project email surface, doc intact, same convention as `ClaimOnLogin`'s reload-to-reread-session).
- Send failure after account creation: project is already saved; surface "saved to your project — send failed, retry from there." The doc is never lost; the capture already succeeded.
- Abuse posture: the only email ever sent goes to the address that just proved OTP possession. Supabase's OTP rate limits gate the modal; the send endpoint requires an authed session. No new anonymous send surface exists.

### 5. `/claim` copy branch (rides along — the band-aid ships regardless)

- `app/claim/page.tsx`: `peek.itemCount === 0` → seeded-project copy, both states: logged-out "Sign in to open your {title} project — seeded and ready to style and send." / logged-in "Opening your {title} project…". Non-zero counts keep today's copy. `/welcome` arrivals stop seeing "0 items you assembled with your AI."

## Not building (YAGNI)

- No change to `/welcome`, the outreach engine, or the MCP handoff flow.
- No brand scraping on the organic path (zip-report visitors carry no brand; the project starts unbranded — Brand panel is part of the playground).
- No anonymous persistence (localStorage drafts, resume links). Leave = doc gone, same as today.
- No weekly-read enrollment bundled into send-to-self (one gesture, one promise; the weekly-read subscribe box stays separate on the zip-report page).
- `weekly_read_signups` stays dead (sibling spec, fork-2 obsolete).

## Error handling

- Lake loader failure during seed build → `null` → default doc (never a blank/500 lab).
- OTP send/verify errors → inline message, same copy patterns as login-form; "use a different email" resets.
- `claim-and-send` is idempotent-safe on double-click: disable-on-pending, and project creation happens once per POST (no retry loop that could double-create; a retry after failure creates a fresh project — acceptable, they own both).
- Invalid `ref` silently dropped (mirror `open-project`'s posture).

## Testing

- `bun test`: `zip-seed.test.ts` (known ZIP → doc with figures/sources/as-of once; unknown/out-of-scope → null; loader failure → null), `claim-and-send` route test (mocked auth + db: creates project, pins recipient to session email, ref recorded, send failure still returns saved project), `/claim` zero-item copy branch.
- `bunx next build` (never bare `npx tsc`) before commit.
- `lab_first_funnel_landing_live_verify` is **operator-run** post-deploy: zip-report CTA → lab opens with that ZIP's live figures and zero LLM spend logged → edit works → Send to yourself → code → email lands (watermarked, CAN-SPAM footer) → lab is now the signed-in project with the doc intact → `/claim` via a `/welcome` link shows the new zero-item copy.

## Out of scope

Conversational takeover arc in the lab (deferred since 06/19 spec), `/z/[zip]` 307 retirement + hero-search retarget (sibling spec Phase 2 item — plan-time coordinate), Stripe/paywall mechanics (send-to-self is free-tier), weekly-read engine (Lane D, live), any homepage file edits (Phase 1 session owns them).

## Push discipline

Touches the live claim path's front door and auth-adjacent surfaces → RULE 1 diff review before push. Build + test locally, show the diff, operator pushes.
