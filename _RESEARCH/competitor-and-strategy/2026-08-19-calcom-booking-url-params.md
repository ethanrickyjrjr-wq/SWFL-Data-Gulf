# Cal.com booking-page URL parameters — plain `<a href>` deep links for email (no JS)

Fetched 08/19/2026 via crawl4ai. Sources (all live, verbatim URLs):
- https://cal.com/help/bookings/prefill-fields
- https://cal.com/help/embedding/prefill-booking-form-embed
- https://cal.com/help/embedding/adding-slots
- https://cal.com/help/embedding/embed-auto-forward-query-params
- https://cal.com/docs/llms.txt (doc index)
- Source code, `calcom/cal.com` repo on GitHub (note: `api.github.com` content responses resolve this
  repo's canonical name to **`calcom/cal.diy`** — same repo id, i.e. the org renamed the repo; this
  matches the prior finding in `2026-08-19-calcom-selfhost-requirements.md`). Files read directly via
  `raw.githubusercontent.com/calcom/cal.com/main/...` (branch `main` still resolves):
  - `packages/features/bookings/Booker/store.ts`
  - `packages/features/bookings/Booker/utils/query-param.ts`
  - `packages/features/bookings/Booker/utils/isSlotEquivalent.ts`
  - `packages/features/bookings/Booker/hooks/useAvailableTimeSlots.ts`
  - `packages/features/bookings/Booker/hooks/useBookerLayout.ts`
  - `packages/features/bookings/Booker/utils/layout.ts`
  - `packages/features/bookings/Booker/BookerStoreProvider.tsx`
  - `apps/web/lib/getThemeProviderProps.ts`
  - `apps/web/app/(booking-page-wrapper)/[user]/[type]/page.tsx`

**Method note:** the live cal.com booking pages themselves (`cal.com/<user>/<slug>?...`) render as an
empty shell under crawl4ai's static/markdown extraction — they're a fully client-hydrated Next.js
booker app with effectively no meaningful text in the pre-hydration HTML crawl4ai captures. Two test
URLs (a guessed team event slug, and a team's public profile) both came back empty. **This is not
evidence the params fail** — it's a limitation of static crawling against a client-rendered SPA.
Confidence below rests on the actual source that reads these params at runtime (`store.ts` et al.),
which is stronger evidence than prose docs per RULE 0.4 ("the file that owns the behavior"). No
Playwright/browser-driven live click-test was run — mark that specific gap UNVERIFIED.

---

## 1. Date / time-slot preselection — CONFIRMED, verbatim param names

Straight from `packages/features/bookings/Booker/store.ts` (the Zustand store the booker page hydrates
from on load):

```
selectedDate: getQueryParam("date") || null,                 // line 459
month: getQueryParam("month") || ...,                        // line 522-527
selectedTimeslot: getQueryParam("slot") || null,              // line 679
```

- **`date`** — format `YYYY-MM-DD`. Sets the selected calendar day.
- **`month`** — format `YYYY-MM`. Sets which month the calendar grid opens on (derived from `date` if
  `month` is absent and `date` is valid).
- **`slot`** — an **ISO-8601 datetime string**, comment in the store: "Selected timeslot user has
  chosen. This is a date string containing both the date + time." Confirmed by
  `useAvailableTimeSlots.ts`, which parses the API's slot times with `dayjs(time)` — the API returns
  full ISO datetimes (UTC, `Z`-suffixed), e.g. `2026-08-25T18:00:00.000Z`, keyed by day.
  `isSlotEquivalent.ts` confirms the matching rule: exact string match first, else it compares only the
  first 16 characters (`YYYY-MM-DDTHH:MM`, seconds/ms ignored). **Practical implication: the `slot`
  value in your email link must land on an ISO minute that the live `/v2/slots` API actually returns
  for that event type/duration/timezone that day** — an arbitrary time not on the host's real
  availability grid won't get treated as a valid selection.
- Setting `slot` alone does **not** guarantee the calendar visually opens to that day — pass `date`
  (and/or `month`) alongside `slot` so the UI lands on the right screen with the slot pre-highlighted.

**Recommended email deep-link shape** (compute the UTC ISO slot from the proposed local time, agent's
timezone-aware):
```
https://cal.com/<agent-username>/<event-slug>?date=2026-08-25&month=2026-08&slot=2026-08-25T18%3A00%3A00.000Z
```
(URL-encode the colons in `slot` — `%3A` — since raw `:` inside a query value is technically legal but
some email clients/link-scanners mangle unencoded characters; encode defensively.)

## 2. Prefill: name / email / notes / guests / custom booking questions — CONFIRMED

From `https://cal.com/help/bookings/prefill-fields` (dedicated help article, screenshots of a real
booking form driving the param names):

> "You can pre-fill all the fields/questions on the booking form by using their corresponding
> **identifiers** that you can see under Advanced -> Booking Questions... Simply add these in the URL."

Verbatim example from the doc:
```
https://cal.com/johndoe/book?type=12345&duration=30&email=johndoe%40example.com&notes=Test+Notes
```
and a fuller one:
```
name=John Doe&email=johndoe@example.com&notes=Test Notes&Text=TEXT&number=123&select=Option 1&Multiselect=Option 1&Multiselect=Option 2&guests=b&phone=+91&agreed=true
```

- **`name`** — attendee name.
- **`email`** — attendee email.
- **`notes`** — the "additional notes" field.
- **`guests`** — repeat the param for multiple guests (`guests=a&guests=b`); confirmed under "Fields
  with multiple values."
- **Any custom booking question** — pass its **identifier** (the slug you set under
  Event Type → Advanced → Booking Questions, e.g. a question shown as "Agree with your rules" with
  identifier `agreed`) as the query param name. Multi-value questions (Multiselect) also repeat.
- **`location`** — value must be URL-encoded JSON, e.g.
  `location={"value":"attendeeInPerson","optionValue":"Delhi"}`, or for phone-as-location
  `location={"value":"phone","optionValue":"%2B919999999999"}` (note `%2B` = encoded `+`). Table of
  video-app identifiers for `location={"value":"integrations:{APP}","optionValue":""}` confirmed
  (`zoom`, `daily` for Cal Video, `office365_video`, `facetime_video`, etc.) — full table is in the doc.
- **`attendeePhoneNumber`** — separate param, used specifically when "Phone number" is toggled on as
  its own booking question (distinct from phone-as-location above).
- **`metadata[myKey]`** — arbitrary metadata passed through to the booking's `metadata` column and the
  webhook payload; not shown to the attendee.

All of the above are documented for the **plain, non-embedded booking URL** — the doc's own example is
a bare `https://cal.com/johndoe/book?...` link, i.e. exactly the plain `<a href>` shape needed for HTML
email. (The embed-specific `Cal("inline", {config:{...}})` JS API on the sibling page
`prefill-booking-form-embed` is the *embed* mechanism — not needed here since we're not embedding.)

## 3. Duration override for multi-duration event types — CONFIRMED

- **`duration`** — integer minutes. Confirmed both in the help-doc example URL (`duration=30`) and in
  `store.ts`: `if (durationConfig?.includes(Number(getQueryParam("duration")))) { set({ selectedDuration: Number(getQueryParam("duration")) }) }`. The value is validated against the event type's configured
  duration options (`durationConfig`) — pass a duration the event type doesn't offer and it's silently
  dropped (`removeQueryParam("duration")` fires instead).

## 4. Theme / layout params — CONFIRMED

- **`theme`** — `apps/web/lib/getThemeProviderProps.ts`:
  `const themeParsed = z.enum(["light", "dark", "system", "auto"]).safeParse(themeQueryParam)`.
  Applies on **booking pages directly** (not just inside an embed iframe) — `themeSupport` is set to
  `ThemeSupport.Booking` whenever `isBookingPage` is true, independent of embed mode. An invalid value
  forces `light`.
- **`layout`** — `useBookerLayout.ts`: `const layout = getQueryParam("layout") as BookerLayouts` is read
  directly on the public booking page and applied if it's in the event/profile's `enabledLayouts` list.
  Valid values, confirmed in `utils/layout.ts`: **`month_view`**, **`week_view`**, **`column_view`**.
  An event type owner can restrict which layouts are enabled — passing a disabled one is ignored.
- **`hideEventTypeDetails`** — bonus param spotted in the same hook (`getQueryParam("hideEventTypeDetails")`), not asked for but noted since it's directly adjacent and load-bearing for a clean
  embedded/linked layout (e.g. for a minimal popup-style destination).

## 5. Self-hosted instances — HIGH CONFIDENCE, not directly live-tested

All of the above lives in `packages/features/bookings/Booker/*` and `apps/web/app/(booking-page-wrapper)/*` — the **same** Next.js monorepo (`calcom/cal.com`, canonically renamed
`calcom/cal.diy` per the repo-rename finding in `2026-08-19-calcom-selfhost-requirements.md`) that both
the hosted `cal.com` SaaS and any self-hosted Docker deployment run. There is no separate "hosted-only"
booker codebase — self-hosting deploys this exact repo. So the param names, formats, and matching logic
are the same code path regardless of host. **What was NOT tested**: an actual running self-hosted
instance clicked through with these params. Mark this UNVERIFIED-BY-LIVE-INSTANCE even though the
source-identity argument is strong.

## What does NOT exist / was not found

- No separate "prefill by ISO date+time in one param" convenience — `date`, `month`, and `slot` are
  three independent params you set together; there's no single combined param.
- No documented `duration` fallback behavior beyond silent-drop-if-invalid — no error surfaced to the
  page, no separate "closest duration" param.
- Did not find (and did not need, per this task's scope) any params controlling color/branding beyond
  `theme` — cal.com's deeper CSS-variable theming (`cssVarsPerTheme`, per the sibling
  `2026-08-19-calcom-embed-options.md` finding) is an **embed-JS-config** feature, not a plain URL
  param, so it's out of reach for a JS-less HTML email link.
