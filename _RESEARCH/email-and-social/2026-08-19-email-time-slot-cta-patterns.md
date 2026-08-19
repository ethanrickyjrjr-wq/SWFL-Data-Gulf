# Clickable meeting-time CTAs in email — how Calendly, Mixmax, HubSpot actually build them

**Fetched 08/19/2026 via crawl4ai.** Sources crawled directly (search pages used only to locate
URLs, never quoted as sources):

- `https://calendly.com/help/how-to-offer-time-slots-in-an-email` (Calendly Help Center, updated Jul 13, 2026)
- `https://calendly.com/help/how-to-add-calendly-to-an-email-or-email-template` (Calendly Help Center, updated Mar 20, 2026)
- `https://calendly.com/blog/insert-availability-email` (Calendly blog, Aug 16, 2025, by Brittany Rutherford)
- `https://success.mixmax.com/en/articles/8294685-using-share-availability` (Mixmax Help Center, Feb 20, 2026)
- `https://knowledge.hubspot.com/meetings-tool/send-proposed-meeting-times-in-an-email` (HubSpot Knowledge Base, updated Jan 29, 2026)
- `https://docs.savvycal.com/article/96-sharing-availability` (SavvyCal docs — sharing availability between users, not the email-CTA pattern; see note below)

Google Calendar's "propose new time" is a **calendar-invite-reply** feature (inside Gmail/Calendar
when responding to an existing invite), not an email-marketing/outbound CTA pattern — it never
surfaced a comparable doc in this pass and is out of scope for "clickable times inside a sent
email." Not claiming it doesn't exist — just not the same mechanism, and not crawled.

---

## 1. The single most load-bearing fact: none of this is a JS widget in the email

Calendly's own doc states it plainly (`how-to-add-calendly-to-an-email-or-email-template`):

> "Calendly's embed code relies on JavaScript and iframes — features blocked by most email
> platforms like Gmail, Outlook, Apple Mail, Mailchimp, HubSpot, and ActiveCampaign. Because of
> this: You can't embed your scheduler directly into an email. Most email services don't support
> Calendly's embed code in templates."

So "clickable meeting times in an email" is never actually an interactive calendar widget
rendering inside the email client. Every vendor solves it the same way: **generate the picks in a
tool UI, then paste (or auto-insert) the result as plain markup — a stack of `<a href>` links,
each pointing to a unique, pre-parameterized booking URL that does the real work on a web page.**
The "smart" part all happens before send (a compose-time tool computing free/busy) and after click
(a landing/confirm page). The email itself is dumb, portable HTML — exactly the shape our own
`lib/email/blocks/ButtonBlock.tsx` pattern already produces (bulletproof coded `<a>` buttons, not
images) per `_RESEARCH/email-and-social/2026-08-03-button-link-mechanics.md`.

## 2. Layout pattern — a short vertical stack of hand-picked slots, not a grid

**Calendly** ("Offer time slots"): sender opens the Scheduling page, picks an event type, clicks
**Offer time slots**, adjusts a date range and displayed time zone, hand-edits/removes individual
day-slots, then **Copy to clipboard** and pastes into the email body. The blog post's own
screenshot caption calls it "handpicked, clickable time slots" — a short list, not an auto-filled
grid. Four delivery surfaces, same underlying output: (1) copy-paste from the web app, (2) the
browser extension's "Offer time slots in email" (envelope icon), (3) the Gmail/Outlook add-in
inline in the compose window, (4) a paid-plan "Suggest times" flow inside Calendly's own email
composer.

**Mixmax** ("Share Availability"): sender hovers the Meetings menu → **Share availability**
(Gmail) or clicks it on the side panel (Outlook), or types the slash command `/cal`. A calendar
view opens; sender clicks (or click-drags across) open slots to build a **handful of time
options**, can resize each slot's duration, sets the *recipient's* time zone explicitly in that
same panel, then clicks **Insert Times**. Docs: "What you see in the compose window is exactly
what your recipient will see" — i.e., a rendered stack of time buttons is inserted directly into
the HTML draft, not a copy-paste of plain text.

**HubSpot** ("Insert proposed times"): from a CRM record's one-to-one email composer, **Meetings →
Insert proposed times** opens a calendar view where the sender clicks individual day/time cells to
build **multiple proposed time slots** (arrows page between weeks; "Hide weekends" checkbox
available). Clicking **Insert times** drops a "scheduling widget" into the draft. Explicitly **not
supported in plain-text emails** — requires HTML.

None of the three vendors documents an auto-generated "mini week-grid" of every open slot; all
three are explicitly **sender-curated, hand-picked slot lists** — the sender decides how many and
which times to offer, typically a handful (screenshots across all three show roughly 3–6 rows).
The fallback for "none of these work" is always the SAME link, not a second UI: Calendly and
HubSpot both let the sender attach their full scheduling-page link at the bottom of the message as
a catch-all (HubSpot: "include a link to your scheduling page at the bottom of the email as a
fallback" — an explicit checkbox in the same insert-proposed-times panel).

## 3. Click mechanics — one click books; conflicts land the recipient on a re-pick, not an error page

**Mixmax** documents the conflict path explicitly, with screenshots named in its table of
contents: "Your recipient only needs to click their preferred time to confirm the meeting." If
double-booking protection is on (Mixmax: "we prevent double booking by default") and the recipient
clicks a slot that's since been taken, **they see a pop-up asking them to choose another time** —
not a dead link, not a generic error. Required custom fields (if the sender added any) route the
recipient through one more form page before the meeting is actually booked; optional fields still
let the recipient book immediately and fill them in afterward on the confirmation page. Once
booked: **event auto-added to both calendars, both parties get a notification email**, and the
confirmation landing page is brandable (logo/colors) on a paid add-on.

**HubSpot**: "When the contact receives the email with the proposed times, they can select one of
the time slot options **and then confirm the meeting time**" — i.e., click → a confirm step →
booked, and the sender gets an email notification on selection. (A HubSpot Community thread this
research surfaced flags that a customer-facing "your meeting is confirmed" auto-notification was,
as of that thread, a requested-but-missing feature — noted here as an open community complaint,
not a documented vendor behavior, since it wasn't independently verified against HubSpot's own
docs.)

**Calendly**: clicking a pasted time slot books it directly against the sender's live
calendar-synced availability; "If none of the times you've embedded work for your recipient, they
can follow your Calendly link and find another time" — the fallback IS the fix for staleness, not
a special conflict page. Because the copy-pasted links are static once sent, Calendly's own
mitigation for staleness is routing distrust to the full scheduling page link rather than
promising the pasted slots stay live forever.

**None of the three vendors' docs surfaced a source-cited quantitative claim** (no percentage,
no A/B result, no "X% higher reply rate") — every marketing claim found was qualitative ("faster",
"easier", "handled"). A DuckDuckGo search for a named conversion-rate study on this pattern
returned zero results. Not reporting a number here rather than inventing one — this is a gap in
what's public, not a gap in the research pass.

## 4. Timezone handling — sender's local zone is source of truth; explicit conversion happens before send

**Mixmax** requires the sender to set a **Time zone** field in the same panel where slots are
picked, and explicitly names which zone gets converted for whom: "select the time zone of your
recipient... these times appear in your time zone and will automatically convert to your
recipient's time zone" once inserted. So the rendered email already shows recipient-local times —
the conversion is baked into the static HTML at insert-time, not computed live in the recipient's
client (which would require JS the email can't run).

**Calendly**: the "Offer time slots" panel has an explicit **"Displayed time zone"** control the
sender sets before copying — same baked-at-insert-time approach.

**HubSpot**: the doc doesn't call out an explicit timezone-selection step in the walkthrough text
crawled here (its screenshots weren't OCR'd by this pass) — flagged as unverified rather than
assumed; HubSpot's meetings tool is calendar-synced so it's reasonable to expect timezone
awareness, but the specific email-render behavior isn't confirmed by this crawl.

## 5. SavvyCal — different mechanism, not directly comparable

The SavvyCal doc that crawled cleanly (`sharing-availability`, docs.savvycal.com) covers
**person-to-person calendar-connection sharing** (adding a contact's free/busy into a scheduling
LINK's overlay) — not a "clickable time slots in an email body" CTA. SavvyCal's distinguishing
feature per third-party listings (altimateguide.com, gtmlabz.io — not vendor-primary, flagged as
such) is the **calendar-overlay booking page** (recipient sees their own calendar next to the
sender's availability when they land on the link), which is a booking-PAGE UX improvement, not an
in-email slot-button pattern. Not pursued further since it's off the requested topic (in-email
buttons specifically).

## 6. What this means for building OUR emails (no JS, provider-agnostic)

Given §1 (nobody runs a live widget inside the email — it's always pre-rendered `<a>` links) and
§2 (3–6 hand-picked slots, not an auto-grid), the pattern that fits a static Next.js/Resend-sent
HTML email with no client-side JS is:

- **3–5 stacked slot buttons**, each its own bulletproof coded `<a>` (per our existing
  `ButtonBlock.tsx` pattern), each `href` carrying a unique token/slot-id in the query string —
  e.g. `/book?slot=<id>&token=<t>`.
- **Times pre-converted to the recipient's timezone at send time** (server-side, since we have no
  JS at render time) and the timezone printed in the copy next to the times, matching how Mixmax
  and Calendly both bake conversion in before the email goes out — never leave it to the recipient
  to guess whose clock it is.
- **The slot link lands on a confirm page, not an instant silent book** — the page re-checks the
  slot against current availability server-side at click time (same moment-of-truth Mixmax's
  double-booking guard performs) and shows a friendly re-pick UI ("that time's since been taken —
  here are the closest open times") rather than a dead link or generic error, mirroring Mixmax's
  documented pop-up behavior.
- **Always include one fallback link below the stack** — "None of these work? See my full
  calendar" — pointing at a live availability page, exactly how both Calendly and HubSpot treat
  their scheduling-page link as the safety net for staleness and mismatch, rather than trying to
  keep every pasted slot perpetually fresh.

No number in this file is invented; every one is attributed to the vendor doc it came from, and
the two places evidence was thin (HubSpot's timezone-in-email behavior; any conversion-rate stat)
are marked unverified above rather than filled in.
