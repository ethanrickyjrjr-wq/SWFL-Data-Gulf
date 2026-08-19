# Calendly embed options + URL parameters — for brand-profile booking links

> **Recommended model:** ⚡ Sonnet — 7 files, keywords: schema

Fetched 08/19/2026 via crawl4ai. Sources (verbatim, live-crawled this session):

- https://developer.calendly.com/
- https://developer.calendly.com/getting-started
- https://developer.calendly.com/how-to-display-the-scheduling-page-for-users-of-your-app
- https://developer.calendly.com/view-event-type-and-user-calendar-availability-data
- https://developer.calendly.com/api-docs (SPA shell only — Stoplight-rendered, did not render via static crawl)
- https://developer.calendly.com/personal-access-tokens
- https://developer.calendly.com/scopes
- https://calendly.com/help/embed-options-overview (redirect target of the old `help.calendly.com/hc/en-us/articles/223147027` URL — the `?tab=general` / `?tab=advanced` query params on this URL did **not** change the crawled content; both returned the same body, so the tab split appears to be client-side JS the static crawl doesn't exercise)
- https://calendly.com/help/advanced-calendly-embed-for-developers
- https://calendly.com/help/how-to-embed-calendly-with-an-iframe
- https://calendly.com/help/how-to-pre-fill-invitee-information-in-an-embed
- https://calendly.com/help/how-to-pre-fill-invitee-information-in-your-calendly-link
- https://calendly.com/help/how-to-customize-your-embed
- https://calendly.com/help/how-to-control-your-embed-layout-and-sizing
- https://calendly.com/help/advanced-booking-form-features
- https://calendly.com/pricing
- https://calendly.com/scheduling/meeting-polls

Context: our real-estate-agent users paste whatever booking link they already own into their brand profile (often Calendly). We render it (a) as a button/embed on the Next.js `/project` pages and (b) as plain `<a href>` "pick a time" buttons in HTML email, where no JS or iframe is reliable.

---

## 1. Embed types

Calendly's help docs (current, post-rebrand-to-`calendly.com/help` URL structure — the old `developer.calendly.com` article links to the same content) name three embed styles:

1. **Inline embed** — widget renders directly in a page element.
   ```html
   <div class="calendly-inline-widget" data-url="https://calendly.com/YOUR_LINK" style="min-width:320px;height:700px;"></div>
   <script src="https://assets.calendly.com/assets/external/widget.js" type="text/javascript"></script>
   ```
   JS equivalent: `Calendly.initInlineWidget({ url: myLink, parentElement: document.getElementById('calendly-embed') })`.

2. **Pop-up text** — a plain link opens the scheduling page in a modal via `Calendly.initPopupWidget({url: myLink})`.

3. **Pop-up widget ("badge")** — a floating button. `Calendly.initBadgeWidget({ url: myLink, text: 'Schedule time with me', color: '#006bff', textColor: '#ffffff', branding: true })`. This one needs the extra `text`/`color`/`textColor` params to define the floating button's look — the docs call this out explicitly as unlike the other two.

All three require `widget.js` (`https://assets.calendly.com/assets/external/widget.js`), loaded either via `<script src>` or (for badge) also `widget.css`.

**Iframe-only embed works WITHOUT widget.js** — confirmed directly. From "How to embed Calendly with an iframe" (`calendly.com/help/how-to-embed-calendly-with-an-iframe`):
```html
<iframe src="https://calendly.com/YOUR_SCHEDULING_LINK" style="width: 100%; min-width: 320px; height: 700px;" frameborder="0"></iframe>
```
This is Calendly's own documented fallback for platforms that block scripts. Tradeoff, stated explicitly by the vendor: **iframe-only embeds cannot** pre-fill invitee name/email, track events via `postMessage`, auto-resize, or hide the profile photo / cookie banner. Use it only when JS truly isn't available (our Next.js `/project` page has JS, so prefer the JS embed there; but this iframe form is the right building block if we ever need a no-JS fallback).

For our **email** use case: neither `<iframe>` nor `<script>` is usable in HTML email (major clients strip both). The only viable email pattern is a **plain `<a href="https://calendly.com/...">`** link — which is exactly the "prefill via URL query string" mechanism in §2 below, no embed API involved at all.

---

## 2. URL prefill parameters (work on the plain link — usable in email `<a href>`, not just JS embeds)

Two distinct mechanisms, confirmed from two separate current Calendly docs:

### A. Plain-link query params (works in `<a href>`, no JS needed)
From "How to pre-fill invitee information in your Calendly link" (`calendly.com/help/how-to-pre-fill-invitee-information-in-your-calendly-link`), the vendor's own field/variable table, verbatim:

| Field | Variable | Example |
|---|---|---|
| Full name | `name` | `name=John%20Doe` |
| First name | `first_name` | `first_name=John` |
| Last name | `last_name` | `last_name=Doe` |
| Email | `email` | `email=john@example.com` |
| Location | `location` | `location=Main%20Office` |
| Custom answers | `a1`, `a2`, … `a10` | `a1=Resume%20review` |
| Checkbox/radio answers | `aX=#` (comma-separated option numbers) | `a3=2,3` |
| Guests | `guests` | `guests=jane@example.com,john@example.com` |

Notes from the same doc:
- Values are joined with `?` then `&` (standard query string), spaces as `%20`.
- Phone number: if the event's location is a phone call, use `location=1234567890`; if it's a custom question, use the matching `aX=`.
- **Cannot** pre-fill "Other" free-text options on radio/checkbox questions, and **cannot** pre-fill SMS reminder phone fields.
- Full example: `https://calendly.com/yourlink/consultation?name=John%20Doe&email=john@example.com&a1=Resume%20review`

### B. JS-embed-only `prefill` object (only fires through `Calendly.initInlineWidget`/etc, NOT usable in a plain `<a href>`)
From "How to pre-fill invitee information in an embed" (`calendly.com/help/how-to-pre-fill-invitee-information-in-an-embed`):
```js
Calendly.initInlineWidget({
  url: 'https://calendly.com/YOUR_USERNAME',
  parentElement: document.getElementById('calendly-embed-element'),
  prefill: {
    name: 'John Doe',
    email: 'john@example.com',
    customAnswers: { a1: 'Yes', a2: 'At the office' }
  }
});
```
Also supports `firstName`/`lastName` separately. Functionally the same field set as (A), just passed as a JS object instead of query string — useful for our `/project` page inline widget if we're grabbing the visitor's already-known name/email from our own session rather than round-tripping through the URL.

### Display / styling / consent params (from "How to customize your embed")
Added as query params directly on the Calendly link (or set via Calendly's own embed-code generator UI):

| Param | Effect |
|---|---|
| `hide_event_type_details=1` | hides photo, name, duration, location, description on an **event type** link |
| `hide_landing_page_details=1` | same, for a **landing/team page** link |
| `hide_gdpr_banner=1` | hides Calendly's cookie/GDPR banner — vendor explicitly warns: only do this if **your own site** already handles GDPR/CCPA consent disclosure |
| `background_color` | hex, no `#`, sets background behind the embed |
| `text_color` | hex, no `#` |
| `primary_color` | hex, no `#` — button/link color |
| `button_text` | replaces "Schedule" label (pop-up embed only; paid plans only — "If you're on a paid plan, you can update your embed's look and feel...") |

Example combined link: `https://calendly.com/<YOUR_LINK>?hide_event_type_details=1&hide_gdpr_banner=1`

`background_color`/`text_color`/`primary_color`/`button_text` are gated to **paid plans** per the doc's own wording — free-tier users pasting a Calendly link into our brand profile likely can't customize colors even if we build the UI for it. Worth flagging to Ricky if we build a "customize the button color" control — it may silently no-op on a free-tier agent's link.

---

## 3. CRITICAL: can a URL preselect a date or time?

**No documented mechanism found. This is the headline finding.**

The vendor's own canonical "Information you can pre-fill" table (§2A above) — which is Calendly's complete, current, first-party enumeration of every supported link query variable — lists exactly 8 variables: `name`, `first_name`, `last_name`, `email`, `location`, `a1`-`a10`, `guests`. **Date and time are not in that list.** No `date=`, `month=`, `time=`, or path-segment-date syntax (e.g. `/30min/2026-08-25T14:00:00`) appears anywhere across the embed-options, iframe, prefill-link, prefill-embed, customize-embed, layout, or advanced-booking-form-features docs crawled this session.

I could not empirically confirm the absence by hitting a live public event-type booking page and inspecting the actual picker URL shape (my one attempt at a real public link 404'd, and `calendly.com/calendly` returned no renderable content via the static crawl — the live date/time picker is a client-rendered React app that a non-interactive crawl can't drive through the click flow to observe the resulting URL). So: **UNVERIFIED whether an internal/undocumented date-select URL shape exists that just isn't documented** — I did not find one, but absence of a doc hit is not proof of absence of the feature.

What Calendly explicitly does offer instead, that gets close to the same job:
- **`POST /invitees`** (Scheduling API — `scheduled_events:write` scope) — this is a real, documented way to programmatically **book** an invitee onto a specific slot without the invitee ever touching the Calendly UI ("Build scheduling directly into your app without redirects, iframes, or Calendly-hosted UI"). Doc page is at `developer.calendly.com/api-docs/p3ghrxrwbl8kqe-create-event-invitee`, but it renders as a Stoplight single-page app — crawl4ai's static fetch returned only the page chrome, not the endpoint schema/params. **UNVERIFIED**: exact request body shape for this endpoint (would need a JS-rendering fetch of the Stoplight page, or `calendly.stoplight.io/docs/api-docs`, to get field names). This is a full "book it for them" API call, not a deep-link — wrong shape for our "user clicks a time in an email" use case, but the right shape if we ever build server-side booking.
- **`GET /event_type_available_times`** (`event_types:read` scope) — returns actual open slots for an event type in a date range (max 31 days). This is how you'd build "here are 3 real open times" into an email or chart — you'd fetch the times server-side, then render each as a **plain prefilled link** (name/email prefill only, no date/time in the URL) and trust the invitee to pick that slot on Calendly's page, OR use it purely for display and let `POST /invitees` book directly.

**Bottom line for us:** we cannot deep-link a specific date/time into Calendly's hosted booking page via a plain URL — no documented param exists. If we want "click this exact Tuesday 2pm slot" buttons in an email, the only vendor-supported way is: call `GET /event_type_available_times` server-side to get real slots, then either (a) link to the plain event-type URL (undated) and rely on the visitor picking that slot themselves once they land on Calendly, or (b) call `POST /invitees` server-side to book it directly (requires the agent to have granted us OAuth/PAT access to their Calendly account, and skips visitor confirmation — probably wrong for a "propose times" flow). Given our users just paste a link they own (no OAuth handshake with us), (a) is the only realistic path — meaning our "time buttons" in email can carry **prefilled name/email** but not a **pre-selected time slot**.

---

## 4. Free tier + API access to availability

- **Auth**: Calendly API v2 uses **personal access tokens** (for internal/private apps) or **OAuth 2.1** (for public apps you distribute to other Calendly users) — `developer.calendly.com/getting-started`, confirmed.
- **Tier gating, stated directly on the getting-started page**: *"Access to the Calendly API is determined by your subscription and user role in Calendly, while access to webhooks is reserved for members on paid premium subscriptions and above."* — i.e., **webhooks require a paid plan**; the wording implies the core REST API (personal access tokens, most GET endpoints) is broader than webhooks, but the doc does not give a table of which specific endpoints are Free-tier-gated vs paid-only. **UNVERIFIED** exact free-tier API endpoint list — would need to generate a real free-tier PAT and probe live, or find a pricing-page API row (the pricing page's feature-comparison table, fully crawled this session, does **not** list "API access" as a row at all).
- **Scopes relevant to availability** (`developer.calendly.com/scopes`, full scope catalog crawled):
  - `availability:read` → `GET /user_busy_times`, `GET /user_availability_schedules`, `GET /user_availability_schedules/{uuid}`, `GET /event_type_availability_schedules`
  - `event_types:read` → `GET /event_types`, `GET /event_types/{uuid}`, `GET /event_type_available_times`, `GET /event_type_memberships`
  - `scheduled_events:read` → `GET /scheduled_events`, `GET /scheduled_events/{uuid}`, `GET /scheduled_events/{uuid}/invitees`, etc.
  - New OAuth apps / new PATs get **zero access until scopes are explicitly requested and approved** (legacy tokens issued before scoped permissions existed keep full access).
- Practically: for our use case (agent pastes their own Calendly link; we never see their account), we would need each agent to generate and hand us **their own personal access token** for us to call `event_type_available_times` on their behalf — there's no way to read a stranger's availability from just their public booking URL via the API. The public booking page itself (what an `<a href>` or iframe shows) already surfaces availability visually without any API call — that's the free, no-auth path, and it's what we're already doing by just linking to their page.

---

## 5. Meeting polls / one-off meetings (the "propose times over email" feature)

Confirmed from `calendly.com/scheduling/meeting-polls` and the pricing page's feature-comparison table:

- Product name: **Meeting Polls**. Tagline: "Poll the group's availability and lock in a time. No endless back-and-forth or time zone math required." Flow per the marketing page: "Send a poll, gather availability, and book a time — all in one simple flow."
- Pricing table row is literally **"Meeting polls and one-off meetings"** — bundled as one feature line: *"Coordinate time with groups using polls or quickly spin up one-time meeting links."*
- **Tier availability**: this row sits directly under "Mobile app and browser extension" and directly above "Control your meeting availability" in the comparison table, both of which apply to **all plans including Free** (no `–` marks for Free on either neighboring row, unlike e.g. "Multi-person meeting types" a few rows down which is explicitly `–` on Free). So **Meeting Polls appears to be available on Calendly's Free plan.** This is inferred from the table's dash pattern rather than an explicit per-row Free/Standard/Teams breakdown printed in the crawled text (the raw HTML table's cell-to-plan alignment wasn't 100% legible in the flattened crawl output) — **flag as reasonably-confident-but-not-airtight**, worth a 30-second manual click-check on calendly.com/pricing if this becomes load-bearing for a build decision.
- This is a **product feature inside Calendly's own UI** (the agent creates a poll or one-off link from their Calendly dashboard and shares it), not an API or URL-param mechanism we could drive on their behalf. If an agent already uses Meeting Polls, the link they'd paste into our brand profile is just... a URL, same as any other Calendly link — no special handling needed on our end beyond treating it as an opaque booking link.

---

## Summary for the build decision

- **Website `/project` embed**: use the JS inline/popup/badge widget (needs `widget.js`); prefill via the `prefill:` object if we already know the visitor's name/email, otherwise skip prefill.
- **Email `<a href>` buttons**: plain link with query-string prefill only (`name=`, `email=`, `a1=`...) — no JS, no iframe, works everywhere. **Cannot** pre-select a date/time slot — no documented param for that. If we want "real open times" shown as clickable options in an email, we'd have to fetch `GET /event_type_available_times` server-side (requires the agent's own PAT/OAuth grant to us) and still just link to the undated booking page — the visitor picks the slot themselves once they land on Calendly.
- **No paid spend or OAuth integration needed** for the basic "paste your link, we render a button" feature — it's just URL templating.
- **Gaps still open**: (1) exact request/response shape of `POST /invitees` and `GET /event_type_available_times` (Stoplight SPA didn't render via static crawl — would need a JS-capable fetch or manual Stoplight browsing), (2) precise free-vs-paid API endpoint gating beyond the webhooks-are-paid-only statement, (3) empirical confirmation there's truly no hidden date-in-path URL shape (only checked docs, not a live click-through).
