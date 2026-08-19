# Booking-link provider landscape — beyond Calendly and Cal.com

Fetched 08/19/2026 via crawl4ai. All content below is pulled from each vendor's own docs/help
center (source URLs cited per section) unless explicitly marked UNVERIFIED. This is the companion
survey to `2026-08-19-calendly-embed-and-params.md` and `2026-08-19-calcom-embed-options.md` —
those two already cover Calendly and Cal.com in depth and are not re-litigated here.

**Why this exists:** the brand-profile registry will hold ONE provider-agnostic `booking_url`
field. This doc answers, per provider a US real-estate agent might already have from a prior tool
purchase: can we recognize the domain, can we embed it, can we deep-link a specific date/time, can
we prefill name/email — and is there a free tier at all.

Sources crawled (primary):
- `support.google.com/calendar/answer/10733297` — Share your appointment schedule
- `support.google.com/calendar/answer/10729749` — Create an appointment schedule
- `help.acuityscheduling.com/hc/en-us/sections/47803246400525-Publish-and-share-your-scheduler`
- `help.acuityscheduling.com/hc/en-us/articles/31919067234445-Parameters-for-dynamic-links`
- `help.acuityscheduling.com/hc/en-us/articles/16676921819917-Share-your-scheduling-page-with-clients`
- `help.acuityscheduling.com/hc/en-us/articles/47575509977997-Change-your-scheduling-page-link`
- `developers.acuityscheduling.com/docs/embedding`
- `www.acuityscheduling.com/pricing`
- `tidycal.com/pricing`
- `help.tidycal.com/article/141-embeding-tidycal-on-your-site`
- `webinarignition.com/appointment-interacting-with-the-audience-tidycal-cta/` (third-party,
  cross-referencing the vendor's own embed-attribute docs)
- `docs.savvycal.com/article/14-personalizing-links` — Prefilling data on scheduling links
- `docs.savvycal.com/article/6-embedding-links-on-your-website`
- `savvycal.com/pricing`
- `www.zoho.com/bookings/features/customizable-booking-pages.html`
- `www.zoho.com/bookings/plan-comparison.html`
- `squareup.com/help/us/en/article/5355-set-up-online-booking-with-square-appointments`
- `squareup.com/help/us/en/article/6943-use-a-free-subdomain-as-the-address-for-your-site`
- `learn.microsoft.com/en-us/microsoft-365/bookings/share-shared-bookings-page`
- `support.microsoft.com/en-us/office/customize-your-booking-page`
- `utk.teamdynamix.com/TDClient/2277/OIT-Portal/KB/PrintArticle?ID=157386` (university IT KB,
  cross-referencing the "outlook.office.com/bookings/homepage" entry point)
- `reddit.com/r/Office365/comments/18m6ie9/` (independent user report confirming the published
  `outlook.office365.com/owa/calendar/...` domain pattern — Microsoft's own docs never print a
  full example URL)

Two pages (`help.zoho.com/portal/...` community/KB articles) returned empty content from
crawl4ai — likely JS-rendered SPA shells that don't serve readable HTML to a headless fetch.
Marked UNVERIFIED below where this gap matters.

---

## Google Calendar appointment schedules (`calendar.app.google` / `calendar.google.com`)

- **Domain shape:** booking pages live under `calendar.app.google/...` (the short share link) or
  `calendar.google.com/calendar/appointments/...`. Google's own docs describe "Copy link" from
  the Booking pages panel rather than printing a canonical URL template — domain-prefix
  detection on `calendar.app.google` or `calendar.google.com` is the safe recognizer.
- **Embeddable:** YES, two ways, both native to Google Calendar's own UI (Sharing options →
  Website embed): a **button-with-popup** (small JS snippet) or an **inline iframe** booking
  page. No third-party JS library — Google issues the `<iframe>`/button snippet directly. Listed
  first-class support for Squarespace, Wix, Shopify, WordPress.org (button + page), and
  WordPress.com/Weebly/Google Sites (page only, no button).
- **URL params (prefill / date-time deep link):** NONE documented. Google's help center covers
  scheduling-window and availability settings but no query-string API for prefilling client
  fields or preselecting a slot. Treat as UNVERIFIED-negative — searched both the "Create" and
  "Share" articles, no parameter table exists anywhere in the appointment-schedule doc tree.
- **Free tier:** Personal Google accounts get appointment schedules; most Workspace plans include
  it too (some premium features gated — see `answer/16287038`). Effectively free for any agent
  who already has a Google account, i.e. nearly all of them.

## Acuity Scheduling (Squarespace)

- **Domain shape:** default `app.acuityscheduling.com/schedule.php?owner=[AccountID]`; branded
  form after customization: `https://[YourBusinessName].as.me`. Cannot point a domain you own
  directly at it (must embed on a site you own instead).
- **Embeddable:** YES — iframe snippet from the account's Website Integration panel; also usable
  inside a native iOS/Android WKWebView/WebView per the developer docs.
- **URL params — the strongest of the group:**
  `firstName`, `lastName`, `email`, `phone`, `calendarID` (preselect calendar), `appointmentType`
  (single type or `category:CategoryName`), `appointmentType[]` (repeat for multiple types),
  `certificate` (coupon/package code), `quantity`, `location`, `field:<id>=` / `field:<id>[]=`
  (custom intake-form answers, including internal-only fields), and — the standout — **`datetime`**,
  an ISO-8601 timestamp (`2025-08-30T14:00-05:00`) that pre-selects an exact bookable slot. This
  is the only provider in this set with a documented, first-party exact-time deep link.
- **Free tier:** NONE — 7-day free trial only, paid plans start at $16/mo (annual) per
  `acuityscheduling.com/pricing`.

## TidyCal

- **Domain shape:** `tidycal.com/<username>` (all types) or `tidycal.com/<username>/<booking-type-slug>`
  (one type).
- **Embeddable:** YES, via `embed.js`: `<div class="tidycal-embed" data-path="username[/slug]">`
  + `<script src="https://tidycal.com/js/embed.js" async>`. Vendor-documented `data-` attributes:
  `data-showavatar`, `data-name` (prefill), `data-email` (prefill). Also supports an "Embed in
  email" interactive time-slot picker (non-recurring types only) and an email-signature link.
  Embedding is available on **every** plan tier including Free.
- **URL params on the plain (non-embedded) link:** vendor docs only document prefill via the
  embed `data-` attributes. A third-party integration write-up
  (`webinarignition.com/appointment-interacting-with-the-audience-tidycal-cta/`) demonstrates the
  same `name=` / `email=` query-string pair working directly on the bare `tidycal.com/user/slug`
  URL (`?name=Max%20Mustermann&email=max%40example.com`) — consistent with, but not itself
  confirmed by, TidyCal's own help center, so treat plain-link prefill as **provisionally
  confirmed, not vendor-authoritative**. A live TidyCal roadmap item
  ("Ability to pre-populate custom fields with URL strings") confirms name/email prefill already
  works but **custom fields do not** — that gap is an open feature request, not shipped.
  No date/time deep-link parameter found anywhere (UNVERIFIED-negative).
- **Free tier:** YES, genuinely free forever — unlimited bookings, unlimited booking types, paid
  bookings, recurring/package bookings, your own booking page, embedding. Confirmed at
  `tidycal.com/pricing`.

## SavvyCal

- **Domain shape:** `savvycal.com/<username>/<slug>` (or index page `savvycal.com/<username>`).
  Custom domains available on the Premium plan.
- **Embeddable:** YES, richest embed surface of the group — 4 modes, all via one JS loader
  (`embed.savvycal.com/v1/embed.js` + `SavvyCal('init')`): (1) popup on hyperlink click via
  `data-savvycal-embed`, (2) a floating pop-up widget button, (3) programmatic popup via JS,
  (4) an inline rendered booking interface. `data-theme` (`light`/`dark`/`os`),
  `data-view` (`week`/`month`), avatar/banner visibility toggles all supported.
- **URL params — second-strongest of the group:** `email`, `display_name`, `phone` (prefill),
  **`from`** (earliest date shown on the calendar, e.g. `2020-01-20` — a date-level, not
  exact-time, deep link), `time_zone` (override auto-detect), and `questions[N]=` for custom
  question prefill (pipe-separated for multi-select checkbox questions). Same parameter set is
  exposed as `data-*` embed attributes for the JS modes. No exact HH:MM slot-selection param like
  Acuity's `datetime` was found — `from` gets you to the right day, the visitor still picks the
  time.
- **Free tier:** NONE found — pricing page offers only paid Basic ($10/user/mo) and Premium
  ($17/user/mo) tiers with a trial/money-back guarantee, no perpetual free plan listed at
  `savvycal.com/pricing`.

## Zoho Bookings

- **Domain shape:** `bookings.zoho.com/<workspace-or-slug>` (four link types exist per Zoho's own
  marketing page: event booking link, staff booking link, workspace booking link, business
  booking link — each a slightly different path shape); a custom domain is available as a
  branding feature.
- **Embeddable:** YES — iframe snippet generated per-service/per-workspace/per-resource from an
  "Embed as Widget" panel (`www.zoho.com/bookings/features/customizable-booking-pages.html`
  confirms "paste the iframe code in the desired location of your webpage").
- **URL params (prefill / date-time deep link):** **UNVERIFIED.** The vendor's own help-center
  pages under `help.zoho.com/portal/...` (embed-as-widget, booking-page-url) returned empty
  content to crawl4ai — likely a JS-only SPA shell not served to headless fetch — so the
  parameter surface could not be read directly. Corroborating signal: a live Zoho community
  thread titled "Prefill Zoho Bookings form fields when using 'Email Booking URL' button in Zoho
  CRM" shows a user actively asking how to do this via the CRM integration path rather than
  citing a documented query-string parameter, which is soft evidence that no simple public
  URL-param prefill exists (unlike Acuity/SavvyCal/TidyCal, where the docs state it plainly).
  Treat prefill and date/time deep-linking as unsupported until re-verified against a
  JS-rendering fetch of `help.zoho.com`.
- **Free tier:** YES, confirmed at `www.zoho.com/bookings/plan-comparison.html` — genuine FREE
  plan (free for one user), scoped to 1 event type and 1 workspace, unlimited customer records.
  Paid Basic/Premium tiers unlock more event types/workspaces/calendar syncs.

## Square Appointments

- **Domain shape:** free subdomain `<business>.square.site` (confirmed at
  `squareup.com/help/article/6943`); a custom domain can also be connected.
- **Embeddable:** YES — three integration surfaces from the Online Booking → Channels panel:
  (1) a "Book Appointment" button, (2) a full iframe embed of the booking flow, (3) "Advanced
  Widgets" scoped to specific staff/services, all copy-paste HTML from the Square Dashboard.
- **URL params (prefill / date-time deep link):** NONE documented in the vendor's own setup
  guide. The article covers button/iframe/advanced-widget creation in detail with no
  query-string parameter table. UNVERIFIED-negative.
- **Free tier:** YES — the online booking site and embed/button/widget features are explicitly
  available to "Square Appointments Free, Plus, and Premium subscribers" per
  `squareup.com/help/us/en/article/5355`, i.e. no paid plan is required for the booking link
  itself.

## Microsoft Bookings

- **Domain shape:** admin entry point is `outlook.office.com/bookings/homepage`. The
  customer-facing published page is a separate long-form URL under
  `outlook.office365.com/owa/calendar/...` — confirmed independently by a real user's Reddit
  post referencing "our outlook.office365.com/owa/calendar Bookings page" when asking about
  redirects; Microsoft's own docs describe "Copy Link" without ever printing the full URL
  template, so the exact slug grammar (business-name@tenant vs. a booking ID) is UNVERIFIED —
  domain-prefix detection on `outlook.office.com` or `outlook.office365.com` is the safe
  recognizer, not a full-path regex.
- **Embeddable:** YES — Microsoft's own docs state Bookings "allows you to copy the link and the
  iframe in just one click" for embedding in a website
  (`learn.microsoft.com/en-us/microsoft-365/bookings/share-shared-bookings-page`). A community
  Q&A ("Is there a way to embed MS Bookings on my website?") shows this isn't discoverable/
  well-known in the UI even though it's documented — soft signal that the embed feature exists
  but is buried.
- **URL params (prefill / date-time deep link):** NONE found in vendor docs. UNVERIFIED-negative.
- **Free tier:** NO standalone free tier — Bookings ships bundled inside Microsoft 365 Business
  Standard (and Education A3/A5; available-but-off by default on Enterprise E3/E5) per
  `support.microsoft.com/en-us/office/customize-your-booking-page`. Relevant framing for "already
  own": an agent who already pays for M365 Business Standard for Outlook/email already has this,
  same logic as Google Calendar — but there is no free-standing signup path the way TidyCal,
  Zoho Free, or Square Free offer.

---

## Fidelity tiers — ranked recommendation

**T1 (deep-link an exact date/time, not just a landing page):**
- **Acuity Scheduling** — only provider with a first-party `datetime=ISO8601` param. No free
  tier, so this only fires for agents already paying for Acuity.

**T1.5 (deep-link to the right day, visitor picks the time — a partial T1):**
- **SavvyCal** — `from=YYYY-MM-DD` gets the calendar to the right date plus full name/email/phone
  prefill. No free tier either, same caveat as Acuity.

**T2 (embed on our page, full prefill, no exact-time deep link):**
- **TidyCal** — free tier, JS-embed prefill of name/email is vendor-documented; plain-link
  query-string prefill is corroborated by third-party use but not vendor-confirmed. Best
  free-tier fidelity in the set.
- **Google Calendar appointment schedules** — embeddable (iframe or button-popup, no separate JS
  library needed), effectively free for any Google user, but zero prefill/deep-link params.
- **Zoho Bookings** — iframe embed confirmed, free tier confirmed, but prefill/deep-link surface
  UNVERIFIED (help-center pages didn't render) — re-check before building against it.
- **Square Appointments** — iframe/button/widget embed confirmed, free tier confirmed for the
  booking flow itself, no prefill/deep-link params found.
- **Microsoft Bookings** — iframe embed vendor-confirmed, but gated behind an M365 Business
  Standard subscription (not a standalone free signup), no prefill/deep-link params found.

**T3 (plain link button only — safest universal fallback):**
- Every provider above supports this trivially (that's the whole point of a provider-agnostic
  `booking_url`). For any provider not in this list at all (or one whose domain we don't
  recognize), T3 is the correct default: render a plain "Book a time" button pointing at whatever
  URL the agent pasted in, no attempt at prefill or embed.

**Practical read for the `booking_url` field:** domain-sniff against
`calendar.app.google` / `calendar.google.com`, `acuityscheduling.com` / `.as.me`,
`tidycal.com`, `savvycal.com`, `bookings.zoho.com`, `square.site`, and
`outlook.office.com` / `outlook.office365.com` (in addition to the already-researched
`calendly.com` and `cal.com`). Only Acuity and SavvyCal are worth building deep-link query-string
construction for today; everyone else should render as a plain button (T3) until embed/prefill
support is independently re-verified, especially Zoho Bookings where the docs simply didn't
render for this pass.
