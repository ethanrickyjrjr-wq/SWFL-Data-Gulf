# Quick-Start Campaign Buttons — Projects · Email Lab · Social

> **Recommended model:** ⚡ Sonnet

> Design/spec only. **Research + placement + recipe notes.** Do NOT build deliverables here — Claude Design owns the visual polish at implementation.
> Status: SPEC (not yet a registered build). Register at kickoff with `node scripts/new-build.mjs campaign-quick-start "Quick-start campaign buttons"`.

## Context

Today a user can build one-off emails/deliverables, but starting a *campaign* (a multi-touch, multi-week sequence) means assembling it by hand. We want **one-click "get started" buttons** in three surfaces — **Projects**, **Email Lab**, and **Social** — that drop the user into a pre-shaped **campaign recipe**. The user adds only the pertinent info *for that project* (address, city/ZIP, audience, schedule); we handle the rest.

Three named buttons ship first:
1. **New Listing Campaign** (email, listing → close lifecycle)
2. **New Listing Socials Campaign** (social posts across platforms for a listing)
3. **Newsletter Campaign** (recurring newsletter)

Each campaign's **example** shows a plain-language explanation of *how it runs*, with **color-coded highlights** marking which parts the AI refreshes **daily / weekly / monthly**, so the user sees we know what we're doing and can decide what to override — ending with a **worked example** (as the "listing to close" example does today). Per operator direction, the color-coded explainer lives on **our examples** now; the per-user post-send "live" view is deferred.

---

## External research (crawl4ai, 07/04/2026)

Sources crawled (real-estate marketing playbooks): theclose.com, luxurypresence.com, coffeecontracts.com, yoursocialpros.com. Campaign taxonomy that maps cleanly to recipes:

**Drip / email campaign archetypes**
- **Welcome / new-lead sequence** — intro brand, value upfront, set cadence expectations, CTA.
- **Nurture** — split by stage: new lead · active buyer · cold/re-engage.
- **Buyer drip (8 touches)** — intro → homebuying process → new listings → pre-approval → market update → seasonal check-in → common mistakes → incentive.
- **Seller drip (7 touches)** — intro → home value → prep for sale → market update → why an agent → process expectations → CTA.
- **Promotional** — new-listing alert · open-house invite · special offer · client-appreciation.
- **Seasonal** — holidays, "house-iversary," seasonal buyer advice.
- **Referral**, **Re-engagement**, **Automated action plans** (event-triggered).

**Listing → close lifecycle** (already our model): just-listed → price/status updates → under-contract → just-sold → testimonial/referral.

**Newsletter** — cadence norm is **monthly** (some biweekly). ~20 content blocks observed: latest listings, local-business spotlight, market wrap-up, local events, just-sold highlights, seasonal buyer advice, myth-busting, testimonials, home-style trends, jargon defined, inspection red flags, fun facts. Recipe = a repeating skeleton where a few blocks refresh each issue.

**New-listing socials** — "Just Listed / Just Sold" sequence. Angles: happy new homeowners, expired→sold, first-time-buyer journey, before/after case study, "visualize the process." Multi-platform. Cadence: teaser → just-listed → feature/open-house → price/status → under-contract → just-sold → testimonial.

**Open-house campaign** — strong cross-channel recipe with a natural timeline: before (2 days) → day-of → after (2 days). Email + social + text touches. Good 4th recipe.

**Cadence / AI-refresh vocabulary** (drives the daily/weekly/monthly color legend):
- **Daily** — live market figures, active listing count/price, days-on-market, weather-driven hooks.
- **Weekly** — market wrap-up numbers, new comparable sales, open-house schedule, featured listing rotation.
- **Monthly** — newsletter theme, seasonal block, testimonial/spotlight rotation, big-picture trend.
- Best-practice guardrails to surface: segment audience, personalize beyond first name, set + hold a cadence, A/B subject lines, watch open/click/reply, CAN-SPAM (already enforced).

Recipe candidates ranked: **(1) New Listing, (2) New Listing Socials, (3) Newsletter** [the three] → then **Open House**, **Buyer Nurture**, **Seller / Home-Value**, **Past-Client / Sphere (seasonal + house-iversary)**, **Re-engagement**. Later recipes reuse the same shell.

---

## Internal inventory (from code probe)

### Email Lab (crown jewel) — the recipe mechanism ALREADY EXISTS

- **Grid shell:** `components/email-lab/EmailLabGridShell.tsx` (~1580 lines). Two-pane: `GridCanvas` center + AI-assistant `<aside>` right. Owns the live `EmailDoc`, brand bridge, seeds, save/send/schedule/PDF. Mounted in 3 thin wrappers: `app/email-lab/grid/` (anon), `app/project/[id]/email-lab/` (the real cockpit, shows Send/Schedule), and the free `EmailLabShell` for anon.
- **Recipes are already a first-class type.** `lib/showcase/recipe.ts` → `ShowcaseRecipe = { prompt, needs: BrandNeed[], target?: "email"|"social" }`. The `prompt` carries one `[[blank]]` the UI pre-selects; `needs` trigger an "add my info" gap prompt. Registry `lib/showcase/registry.ts` (`SHOWCASES[]`) **already contains recipes matching all three buttons**: a new-listing announcement recipe, a monthly market-pulse (newsletter) recipe, and `target:"social"` launch-blitz recipes.
- **Consumption path is fully built:** `handleUseRecipe(recipe)` (`EmailLabGridShell.tsx:438`) seeds the Build box + sets `pendingRecipe` → `buildFromPanel()` (gap-guard via `brandGaps()`) → `proceedBuild()` → `runAuthor()` (POST `/api/email-lab/ai`, `build:true`). **A quick-start button = one existing `ShowcaseRecipe` handed to the existing `handleUseRecipe`. No new plumbing.**
- **Seeds** (static layout starts, separate from recipes): `lib/email/doc/default-docs.ts` `SEED_DOCS[]` incl. grid seeds `new-listing`, `open-house`, `just-sold-grid`, `monthly-digest`, `weekly-pulse`.
- **Tier gating:** `lib/email/lab/capabilities.ts` (author engine is paid-only) — define button visibility through the tier dial, don't hardcode.
- **Newsletter data:** house digest is a separate script pipeline — `scripts/email/build-digest.mts` (live metric deltas via `fetch-digest-data.mts`, renders `DigestEmail.tsx`), cron `.github/workflows/daily-email-digest.yml`. Recurring lab newsletters reuse the same `fetchDigestData`/`buildSubjectLine` via the scheduler.
- **A Newsletter recipe collects only:** scope (city/ZIP/farm) + brand fields (agent_name, brokerage, business_address — CAN-SPAM postal required), then routes user into **Schedule**. AI fills numbers/chart/prose from live lake data.

### Send spine — "how the campaign runs after SEND" (already built, two lanes)

Doc must be saved first (`onSave` → `/api/projects/[id]/materials` → `deliverable_id`). Then:
- **Lane A — immediate blast:** `openSend()` → `ContactPickerModal` → POST `/api/deliverables/[id]/blast` with `contact_ids`. → **New Listing Campaign** kickoff.
- **Lane B — recurring schedule (the cron spine):** `openSchedule()` → `ScheduleSendModal` → `SendWeeklyHandle` (audience → cadence/hour → confirm) → `/api/email/schedule-command` writes an `email_schedules` row (`template_id="block-canvas"`, `deliverable_id`). Worker `scripts/email/run-schedules.mts` (GHA cron ~15 min) claims due rows via RPC `claim_due_email_schedules`, **re-renders the saved doc with fresh lake data + fresh AI commentary + fresh chart each occurrence** (`buildEmailDocOccurrence` → `buildContentDoc` → `renderEmailDocHtml`), broadcasts via `/api/email/broadcast` (Resend, CAN-SPAM unsubscribe token), records `email_sends`, re-arms `next_run_at`. → **Newsletter Campaign** uses this. **This self-refresh IS the daily/weekly/monthly behavior the explainer describes.**
- Send-spine files (`run-schedules.mts`, `broadcast/route.ts`, `daily-email-digest.yml`) are **parallel-session-locked** — buttons are additive UI + data entries; no edits to them needed.

### Social — two systems, one seam; publish leg is INERT

- **System B = Generate-Week (`lib/email/social-calendar/build-week.ts`) is the LIVE content generator** and the right engine for a listing socials campaign. `buildWeek(scope, weekOf, opts?)` → `WeeklyCalendar` of Mon–Fri `SocialDraft`s (caption + hashtags + `EmailDoc` card + per-platform variants, tone/goal-shaped). **Already loads listing context + rotates a featured listing with a satellite aerial per weekday card** (`build-week.ts:286-303`). API `POST /api/email-lab/social-calendar` (no auth, free). UI `components/email-lab/SocialCalendarPanel.tsx` ("Generate Week").
- **System A = publish engine (`lib/social/`)** is production-grade plumbing but the **publish step is switched OFF** — dry-run default (`publish.ts:59-96`), OAuth creds absent, cron paused. The **schedule-WRITE path works today** (`app/api/social/schedule` → `buildSocialScheduleInsert`/`freezePost` → `social_schedules`). Publishable set = 5 platforms (x, facebook, instagram, linkedin, google_business); the 8 in `lib/email/social/platforms.ts` are display-only.
- **The two meet at `ScheduleSocialModal`** (`components/email-lab/ScheduleSocialModal.tsx`): a System-B `SocialDraft` → POST `/api/social/schedule` (System A write). Social cockpit is `app/project/[id]/social/` (`ProjectSocialClient.tsx`).
- **What a listing socials recipe still needs:** a listing-launch `DayTheme[]` arc (Just Listed → Features → Open House → Neighborhood → Price/CTA) instead of generic themes; force ONE subject listing on every card (not ranked rotation); optional month span (today only Mon–Fri week).
- **HONESTY NOTE:** posts *schedule* but do not publish until go-live — say "queued/scheduled," not "posted," until `SOCIAL_PUBLISH_ENABLED` flips.

### Projects hub + the "example" surface (Showcase)

- **Projects control center** `app/project/page.tsx:147-153` header holds `<NewListingButton />` + `<NewProjectButton />` (thin clients: `POST /api/projects` → `router.push(projectHome(id))`). Empty state `:215-218`. A `Project` = Supabase `projects` row `{ id, title, kind, subject_address?, items[] }`; `kind:"listing"` is address-anchored (`app/project/NewListingButton.tsx`).
- **The "listing-to-close" the operator remembers = the Showcase system** (`lib/showcase/registry.ts` + `components/showcase/ShowcaseOverlay.tsx`). `SHOWCASES[]` already has THREE campaigns mapping onto the three buttons:
  - `listing-to-close` — 5 email slides (Coming Soon → New Listing → Comps → Under Contract → Sold), each with `whatsHappening` + `howAiHandled` + a `recipe`. **New Listing Campaign example, already built.**
  - `market-pulse` — "Set It Once" monthly brief that rebuilds itself; has a "Proof It Updates" slide. **Newsletter Campaign example.**
  - `launch-blitz` — listing + 4 social formats (`target:"social"` recipe). **New Listing Socials example.**
- **`Showcase`/`ShowcaseSlide` shape** (`registry.ts:12-45`): per-campaign single `accent` color; each slide `{ image, title, whatsHappening, howAiHandled, recipe?, receipt?, liveHref? }`. `liveHref` = a committed live-HTML artifact under `public/` (kept for capture, no longer linked out). **No per-cadence color legend exists** — that's the net-new piece.
- **Cadence root already exists:** `lib/email/schedule-cadence.ts` — `type Cadence = "daily"|"weekly"|"monthly"` + `describeCadence()`. The 3-color legend keys off this type.
- **Overlay mounts (reuse targets):** `EmailLabGridShell.tsx:1192` (`ExamplesAccordion surface="email"`), `ProjectSocialClient.tsx:347` (`surface="social"`), `app/showcase/page.tsx`.

### Socials publishing — exactly what has to be turned on

The whole publish path is BUILT (user OAuth connect flow, encrypted token store, channel adapters for X/Meta/LinkedIn/GBP, batch publisher). Switched off in four keyboard-only places — task `_AUDIT_AND_ROADMAP/Operation July/05-social-go-live.md` (Owner: OPERATOR):

1. **Create platform developer apps + set OAuth credential pairs** (env names from `lib/social/connect/oauth-config.ts:176-182`):
   - X → `X_CLIENT_ID` / `X_CLIENT_SECRET` (PKCE; `tweet.write`, `offline.access`, `media.write`)
   - Meta (Facebook **and** Instagram share one app) → `META_APP_ID` / `META_APP_SECRET` (`pages_manage_posts`, `instagram_content_publish`, …; needs Meta App Review)
   - LinkedIn → `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` (`w_member_social`)
   - Google Business → `GBP_CLIENT_ID` / `GBP_CLIENT_SECRET` — **PARKED** (Google allowlist, 0 QPM; connect but never block). Real launch platforms = X, Facebook, Instagram, LinkedIn.
   - Each provider must allow-list the redirect URI `https://www.swfldatagulf.com/api/social/connect/<platform>/callback`.
2. **Set `SDG_CRYPTO_KEY`** — AES-256-GCM key encrypting stored tokens in `social_accounts`.
3. **Flip publishing on** — `node scripts/social.mjs go-live` sets `SOCIAL_PUBLISH_ENABLED`, turning off the `dryRun` short-circuit in `publishBatches` (`lib/social/publish.ts:59-96`).
4. **Un-pause the social cron** — uncomment the `scripts/social/run-schedules.mts` GHA wrapper.

After that: a user clicks **Connect** (existing `/api/social/connect/[platform]/start` flow), authorizes us, and the scheduler builds + pushes real posts. Until then the button + `buildWeek` + schedule-write all work; posts sit queued (dry-run). **The button ships now; it needs go-live only to actually post.**

---

## Design

**Everything rides existing seams.** The only net-new piece is the color-coded cadence legend on the examples. No edits to the parallel-session-locked send-spine files.

### A. Extend the Showcase registry — do NOT stand up a parallel one

`SHOWCASES` (`lib/showcase/registry.ts`) already carries `id`, `surfaces`, `accent`, and the `recipe` per slide — a second registry would duplicate and drift. Instead:
- **Add two optional fields to `Showcase`:** `campaign?: { label; blurb; status: "live"|"coming"; seedRecipe?: ShowcaseRecipe }` and the `cadenceRefresh?` from §C. The three existing showcases become the three live campaigns by filling `campaign` (seedRecipe = the announcement recipe for `listing-to-close`, the market-pulse recipe for `market-pulse`, the `target:"social"` recipe for `launch-blitz`).
- **A thin `lib/campaigns.ts` selector only** (no parallel registry): `liveCampaigns(surface)` filters `SHOWCASES` by `campaign.status==="live"` + surface; `COMING_TILES` is a tiny local array of label+blurb-only entries with **no showcase yet** (the only data not derivable from `SHOWCASES`). Cadence colors live in their own small root `lib/campaigns/cadence-colors.ts`.
- **"Coming" tiles** (greyed, no wiring): **open-house**, **buyer-nurture**, **seller / home-value**, **past-client seasonal (house-iversary)**, **re-engagement**. Promoting one = add a `Showcase` with `campaign.status:"live"` + `seedRecipe` (and build its slide assets once via `scripts/capture-showcase.mjs`).

Newsletter routes the user into **Schedule** (Lane B) after build; New Listing Socials generates via `buildWeek`; New Listing uses the announcement recipe (+ shows the 5-step arc as its example).

### B. Quick-start button behavior (reuse the recipe pathway)

A shared `<CampaignQuickStart surface=… projectId?=… />` renders the live campaigns for that surface as buttons + the "coming" tiles as disabled chips. On click:
- **Email campaigns** → `recipeDestination(seedRecipe, {projectId})` (`lib/showcase/recipe.ts:70`) when navigating from the hub, or `handleUseRecipe(seedRecipe)` (`EmailLabGridShell.tsx:438`) when already in the lab. Existing brand-gap guard + `[[blank]]` pre-select fire automatically.
- **Social campaign** → create/link a `kind:"listing"` project (mirror `NewListingButton.tsx`) → deep-link `/project/[id]/social?campaign=new-listing-socials`; `ProjectSocialClient` reads the param → auto-`generateWeek()` with the listing scope. (Needs the `buildWeek` opt in §D.)
- After build, existing SEND is unchanged: New Listing → **Send to contacts** (Lane A) and/or **Schedule**; Newsletter → **Schedule** (Lane B self-refreshing cron); Socials → **Schedule this post** (writes `social_schedules`; publishes once go-live flips).

### C. The color-coded cadence explainer (net-new, on the examples) — highlight REAL regions

The ask is visual annotation **on the artifact**, not a bullet list beside it: "highlight in different colors each area that AI will change daily / weekly / monthly." We hold the asset to do this literally today — every showcase slide carries a committed **live-HTML artifact** (`ShowcaseSlide.liveHref`, e.g. `/showcase/listing-to-close/live/02-new-listing.html`, under `public/`). Approach (operator confirms depth at approval):

- **One new color root** `lib/campaigns/cadence-colors.ts` → `CADENCE_COLORS: Record<Cadence, {bg,fg,label}>` (daily / weekly / monthly = three distinct theme-aware hues). Keyed to the existing `Cadence` type so it can't drift.
- **Annotate the live-HTML regions.** Tag the refreshing regions in each `liveHref` artifact (`data-cadence="daily|weekly|monthly"` on the price/count span, the market block, the theme/testimonial block) and tint them in the matching cadence color when shown — the number that changes daily glows one color, the weekly market block another, the monthly theme a third. This is the "get Claude Design involved" lane (tint style, hover label, legend).
- **`ShowcaseOverlay` gets a 3-color legend** (daily/weekly/monthly) so the tints are decoded — the worked example "at bottom of explanation." `listing-to-close` + `market-pulse` supply the concrete artifacts.
- **`cadenceRefresh?` on `Showcase`** is the fallback caption layer (plain-language list per cadence) for slides whose `liveHref` isn't region-tagged yet, so every example still shows the legend.
- **Recommended path = annotate the real artifact** (literal highlighting); caption-only is the lighter fallback.
- **Deferred (operator: "live showing later"):** the SAME highlighting on each user's own rendered deliverable post-send. Model (`data-cadence` + `CADENCE_COLORS`) is built now, so the live view later is a rendering reuse, not a re-model.

### D. Social listing-launch arc (small `buildWeek` extension)

`lib/email/social-calendar/build-week.ts` gains an opt (e.g. `opts.campaign: { listingId, themeArc }`): a listing-launch `DayTheme[]` (Just Listed → Features/Photos → Open House → Neighborhood → Price/CTA → Just Sold) and forces the ONE subject listing onto every card instead of ranked rotation. Generation stays free/no-auth via `POST /api/email-lab/social-calendar`; scheduling stays the existing `ScheduleSocialModal` → `/api/social/schedule`.

## Button placement map

A **"Start a campaign"** section (new, small) in each of the three surfaces:

1. **Projects control center** — `app/project/page.tsx`: a `<CampaignQuickStart surface="all" />` row directly under the header buttons (`:147-153`), and a prominent copy in the **empty state** (`:215-218`). Primary home (all three buttons + coming tiles).
2. **Email Lab** — `components/email-lab/EmailLabGridShell.tsx`: `<CampaignQuickStart surface="email" projectId=… />` at the top of the "Build with AI" section (between the label at `:1099` and the textarea) — shows New Listing + Newsletter. Gate through `lib/email/lab/capabilities.ts`, don't hardcode.
3. **Social cockpit** — `app/project/[id]/social/ProjectSocialClient.tsx`: `<CampaignQuickStart surface="social" projectId=… />` in/above the "Social calendar" section (`:285-306`) — shows New Listing Socials.

Secondary/optional: `ProjectsRail` "+ New" and the free `EmailLabShell` (route "coming" tiles there, keep author-gated). Reuse `recipeDestination()` and `projectHome()` for all navigation — never re-derive routes.

## Recipe authoring notes (make new campaigns cheap)

Goal: adding a campaign later = **one data object, zero new components.**
- A campaign is a `campaign` field on a `Showcase` referencing an existing `ShowcaseRecipe`. Promoting a "coming" tile = fill `seedRecipe` + build the showcase's slide assets once (`scripts/capture-showcase.mjs`).
- Reuse, don't rebuild: `ShowcaseRecipe` (prompt + `[[blank]]` + `needs`), `recipeDestination`, `handleUseRecipe`, `brandGaps`, `SEED_DOCS` layouts, `buildWeek`, `ScheduleSendModal`/`ScheduleSocialModal`, `describeCadence`.
- The cadence explainer is **data-driven**: adding highlights = fill `cadenceRefresh` (+ `data-cadence` tags in the `liveHref`); colors come from the one `CADENCE_COLORS` root.
- One root each (mirrors the codebase's "ONE root" discipline): `lib/campaigns.ts` (selector over `SHOWCASES`), `lib/campaigns/cadence-colors.ts` (colors). Add `registry.test.ts`-style guards: every live campaign resolves to a real recipe + showcase; every showcase asset exists; `cadence-colors` covers all three `Cadence` values.
- Brand fields (`agent_name`, `brokerage`, `business_address` — CAN-SPAM postal required) come from the brand profile; the existing gap prompt collects what's missing. The user only ever supplies the `[[blank]]` (address / city / ZIP) + brand + schedule.

## What this spec deliberately does NOT build

- No deliverable HTML/templates (research + plan only).
- No send-spine edits (locked files; buttons are additive).
- No social go-live (separate operator task 05 — checklist above); button ships in queue/dry-run-honest mode.
- No per-user live "how it runs" view (deferred; data model built to make it a later rendering change).
- No listing-lifecycle auto-sequencing (Phase 1.5 `listing_transitions` spine not built; New Listing MVP seeds the announcement email + shows the 5-step arc as the example, rather than auto-scheduling all five).

## Verification (at implementation time)

- **Unit:** `registry.test.ts` — every live campaign → real recipe + showcase; `cadence-colors` covers all three `Cadence` values; `buildWeek` listing-arc opt produces one subject listing per card.
- **Type/build:** `bunx next build` (local `tsc` ≠ Vercel). Capabilities test proves author-gated buttons don't leak to free tier.
- **Manual E2E (drive it, per /verify):** Projects hub → click each of the 3 buttons → New Listing seeds the announcement recipe in Email Lab with `[[address]]` pre-selected; Newsletter seeds market-pulse and lands in Schedule; New Listing Socials creates a listing project and auto-generates the launch week. Open each Showcase example and confirm the 3-color daily/weekly/monthly legend + tints render.
- **Register the build** at kickoff: `node scripts/new-build.mjs campaign-quick-start "Quick-start campaign buttons"` (RULE 3.5) — opens the `_live_verify` check.

## Open dependencies / follow-ups

- Social **actually posts** only after task `05-social-go-live.md` (operator keyboard work: X/Meta/LinkedIn OAuth app pairs + `SDG_CRYPTO_KEY` + flip `SOCIAL_PUBLISH_ENABLED` + un-pause cron). GBP stays parked.
- Full auto-sequenced New Listing lifecycle waits on the Phase 1.5 `listing_transitions` "This Week" queue.
- Live per-user color-coded preview is the deferred "live showing later."

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 3 | `lib/campaigns/cadence-colors.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
