# Add-to-calendar links and "propose times" without a booking provider

Date: 08/19/2026. Lane: the fallback design for agents who have **no booking link at all** —
not Calendly, not Cal.com, nothing. The email itself has to offer times via `mailto:`/reply or
add-to-calendar links, zero external provider, zero OAuth, zero account.

**Prior research read first (RULE 0.4/0.5 — this file builds on these, does not re-derive them):**
- `_RESEARCH/email-and-social/2026-08-12-open-house-invitation-craft.md` §7–§8 — already
  established the operator-decided CTA shape is CALENDAR (not QR, not a static map), that QR
  belongs on the post-click landing page only, and crawled the **Google/Outlook/Yahoo template
  URL formats** from `add-event-to-calendar-docs` (459-star reference repo). It also flagged two
  explicit gaps left open: (1) the `.ics` / RFC 5545 `VEVENT` field spec was never crawled, and
  (2) only the Outlook deeplink base URL was read, not its parameter names. **This file closes
  both gaps.**
- `_RESEARCH/INDEX.md` line 678 + the 08/12 file's §7b — the address-in-phone answer is the
  `LOCATION` field carried by whichever mechanism wins; that finding is unchanged and this file's
  new mechanics (mailto, .ics field spec, Outlook params) all still funnel into that same field.
- `_RESEARCH/competitor-and-strategy/2026-08-19-cal-diy-scheduling-widget-evaluation.md` — the
  ADJACENT lane, same day. That file's ladder is: agent has a real booking link → render it; agent
  has none → point them at a **free hosted cal.com account** (still an external provider, just
  free). **This file is the rung below that one** — the true zero-provider fallback for an agent
  who won't even set up a free cal.com account, or for the moment before they have. `booking_url`
  does not exist yet as a registry field (grep confirmed zero hits across `lib/brand`,
  `lib/email/social`, `components/`, `app/project`), and grep also confirms **nothing add-to-
  calendar/`.ics`/deeplink-shaped exists anywhere in `lib/` or `app/` today** — this is genuinely
  unbuilt, not rediscovering something wired.

**Also verified this pass, not previously checked:** our actual send path.
`lib/email/outreach/send.ts` and `lib/email/weekly-read/send.ts` both call
`client.batch.send(batch)` (Resend's batch endpoint) for bulk sends. Resend's own docs state
**attachments cannot be sent through the batch endpoint at all** (§6 below) — this is a hard
constraint on the .ics-attachment option for any email that goes out through those two senders,
independent of which client-rendering approach is "better."

---

## 1. Google Calendar — full verbatim template URL, `render` vs `eventedit`

Fetched 08/19/2026 via crawl4ai from
`raw.githubusercontent.com/InteractionDesignFoundation/add-event-to-calendar-docs/main/services/google.md`
(same repo as the 08/12 pass; this crawl pulled the fields that pass left un-quoted).

**Base URL — use `render`, not `eventedit` directly:**
`https://calendar.google.com/calendar/render?action=TEMPLATE&text=<title>&dates=<start>/<end>&details=<desc>&location=<address>&ctz=<timezone>`

`render` is a thin redirector that forwards to `/calendar/u/0/r/eventedit` with the full query
string intact — **prefer `render`** over calling `eventedit` directly because it's the form
Google itself hands out, and on Android the `eventedit` path is reported to open the Calendar app
without starting event creation at all (upstream issue #56 in that repo).

**Confirmed parameters (each carries `verified` or `from code` per the doc's own confidence
markers — recovered by reading the Calendar web client's deep-link parser, `Sbh`, then replaying
each param against the live editor):**

| param | required | format | notes |
|---|---|---|---|
| `action` | yes (render URL only) | `TEMPLATE` | not required on `eventedit` |
| `text` | yes | text | event title |
| `dates` | yes | `YYYYMMDDTHHmmSSZ/YYYYMMDDTHHmmSSZ` | both halves must end `Z` to be read as UTC; omit `Z` on both to use the visitor's own timezone instead; `20201231/20210101` for all-day (end date is exclusive — add one day); literal `dates=now` opens the editor at the next half/full hour |
| `ctz` | no | IANA tz name, e.g. `America/New_York` | custom timezone for both start+end unless overridden |
| `stz` / `etz` | no | IANA tz name | start/end timezone individually; take priority over `ctz`; lets an event start in one zone and end in another |
| `details` | no | text, basic HTML survives | URL-encode `<b>`/`<a href>` if used |
| `location` | no | text | free-text only — **not resolved against Google Maps**, just displayed and later made tappable by the OS once saved |
| `location_name` + `location_address_*` / `location_geo_*` / `location_place_id` / `location_url` | no | text/float/Maps IDs | builds a **structured** location object instead of a plain string; only read when `location_name` is present; most of these sub-fields are `from code` confidence (not confirmed live) except `location_address_formatted_address` |

**For our build:** the plain `location=<full property address>` param is all that's needed —
structured `location_name`/`location_place_id` is real but adds Maps-API-identifier plumbing for
a benefit (a richer Maps card inside Google's own event editor) that isn't worth building against
an unconfirmed-confidence param set.

---

## 2. Outlook Live / Office 365 — full verbatim deeplink, confirmed 08/19/2026

Fetched 08/19/2026 via crawl4ai from the same repo's `services/outlook-web.md`. The 08/12 file
only had the two base URLs; this closes that file's named gap #2. **Unlike Google, Outlook's web
app does not parse the deep link client-side** — none of the parameter names appear in the OWA
JS bundle and the query string disappears once the compose form renders, so this doc's own
confidence markers come from **replaying params against the live form and observing the result**,
not from reading a parser. Last verified against `outlook.live.com` 2026-08-19; Office 365 host
not re-tested that day.

**Base URLs:**
- Outlook Live: `https://outlook.live.com/calendar/deeplink/compose`
- Office 365: `https://outlook.office.com/calendar/deeplink/compose`
- (An account index may be inserted before `deeplink`, e.g. `/calendar/0/deeplink/compose` —
  behaves identically.)

**Full example:**
`https://outlook.live.com/calendar/deeplink/compose?path=/calendar/action/compose&rru=addevent&startdt=2023-08-09T19:30:00Z&enddt=2023-08-09T22:30:00Z&subject=Birthday&body=With%20clowns%20and%20stuff&location=North%20Pole`

**Verified parameters:**

| param | required | format | confidence | notes |
|---|---|---|---|---|
| `path` | yes | `path=/calendar/action/compose` | verified | fixed internal app path |
| `rru` | yes | `rru=addevent` | verified | action name |
| `startdt` | yes | `YYYY-MM-DDTHH:mm:SSZ` or `YYYY-MM-DD` | verified | omit trailing `Z` to use the visitor's local timezone; `YYYY-MM-DD` for all-day |
| `enddt` | yes | same as `startdt` | verified | |
| `subject` | yes | text | verified | also becomes the browser tab title |
| `allday` | no | `true`/`false` | verified | wins over the time part of start/end dt |
| `body` | no | text or HTML | verified | HTML renders — `<b>`/`<a href>` both work |
| `location` | no | text | verified | free-text only, **not resolved against Bing Maps** — same "displayed, not geocoded" behavior as Google's plain `location` |
| `online` | no | any truthy value | verified | turns on the "Teams meeting" toggle (renamed from "Skype meeting") |
| `to` / `cc` | no | comma-separated emails | verified | required/optional attendees |
| `freebusy` | no | enum: `free`/`tentative`/`busy`/`oof`/`workingelsewhere`/`nodata` | verified | `oof` renders "Out of office" |
| `reqresponse` / `allowfw` / `hideattn` | no | `true`/`false` | **not observable** | hidden behind a "Response options" menu the doc's author couldn't confirm |

**URL length ceiling, measured 2026-08-19 against `outlook.live.com` by bisection:** requests up
to **~31,000 characters** return 200; past that the host answers a bare IIS "Bad Request" before
the request reaches the calendar app at all. That ceiling counts request line + headers
(including any signed-in session cookie, which eats into the budget). The doc's own caution
still applies for us: **browsers, proxies, and other email clients impose much lower limits, so
keep the whole link under a couple thousand characters** regardless of what Outlook itself would
tolerate.

**Net:** Outlook's `location` param behaves exactly like Google's — a free-text string, not
geocoded — so the LOCATION-field finding from the 08/12 file (§7b: the field is what makes the
address tappable into the phone's maps app once the event is *saved*, not something either vendor
resolves at link-build time) holds for both providers without modification.

---

## 3. Yahoo / AOL — unchanged from the 08/12 pass, restated for completeness

Not re-crawled this pass (08/12 file already has it verbatim and nothing here contradicts it):
`https://calendar.yahoo.com/?v=60&TITLE=<title>&ST=<start>&ET=<end>&DESC=<desc>&in_loc=<address>`
(`v=60` required, no official docs). AOL uses the same `in_loc=`/`desc=`/`st=`/`et=`/`title=`
shape per the Litmus example in §5 below. Neither is a build priority — Google + Outlook covers
the two dominant calendar ecosystems; Yahoo/AOL are long-tail.

---

## 4. `.ics` / RFC 5545 `VEVENT` — the field spec neither prior pass crawled

Fetched 08/19/2026 via crawl4ai from `icalendar.org/iCalendar-RFC-5545/3-6-1-event-component.html`
(the RFC 5545 text itself, converted to HTML, cross-referenced against the working IETF spec).
This closes the 08/12 file's named gap #1.

**`VEVENT` component grammar — what's REQUIRED vs OPTIONAL:**
- **REQUIRED, at most once:** `DTSTAMP`, `UID`.
- **REQUIRED unless the object carries a `METHOD` property (see §5); at most once otherwise:**
  `DTSTART`.
- **OPTIONAL, at most once:** `CLASS`, `CREATED`, `DESCRIPTION`, `GEO`, `LAST-MODIFIED`,
  **`LOCATION`**, `ORGANIZER`, `PRIORITY`, `SEQ`, `STATUS`, `SUMMARY`, `TRANSP`, `URL`, `RECURID`.
- **OPTIONAL, should not repeat:** `RRULE`.
- **Either/or, never both:** `DTEND` or `DURATION`.
- **OPTIONAL, may repeat:** `ATTACH`, `ATTENDEE`, `CATEGORIES`, `COMMENT`, `CONTACT`, `EXDATE`,
  `RSTATUS`, `RELATED`, `RESOURCES`, `RDATE`, plus `X-`/IANA extension properties.

**Minimal working example (from the spec itself):**
```
BEGIN:VEVENT
UID:19970901T130000Z-123401@example.com
DTSTAMP:19970901T130000Z
DTSTART:19970903T163000Z
DTEND:19970903T190000Z
SUMMARY:Annual Employee Review
CLASS:PRIVATE
CATEGORIES:BUSINESS,HUMAN RESOURCES
END:VEVENT
```
`LOCATION:<address>` sits as one more optional single-value line in that same block — same
carrier field as Google's `location=` and Outlook's `location=`, confirming again that all three
mechanisms (Google link, Outlook link, raw `.ics`) converge on identically-named, identically-
behaved address fields. No new mechanism needed to answer "map / add address to phone" beyond
what the 08/12 file already settled — this is the `.ics`-native form of the same field.

---

## 5. `METHOD:PUBLISH` vs `METHOD:REQUEST` — RFC 5545 punts to RFC 5546 (iTIP), and it matters in practice

Fetched 08/19/2026 via crawl4ai, `icalendar.org/iCalendar-RFC-5545/3-7-2-method.html`. **RFC 5545
itself defines no METHOD values at all** — verbatim: *"No methods are defined by this
specification. This is the subject of other specifications, such as the iCalendar Transport-
independent Interoperability Protocol (iTIP)"* (RFC 5546, referenced as `[2446bis]` in the spec
text). If `METHOD` is present in a MIME `text/calendar` part, it **must** match the Content-Type
`method=` parameter — the two are required to agree. If `METHOD` is absent entirely, the object is
"merely...a snapshot of some calendar information," carrying no scheduling semantic — i.e. a plain
informational calendar object, which is the `PUBLISH`-shaped case in practice even though the word
`PUBLISH` isn't in 5545 itself.

**Practical consequence, found via a live troubleshooting thread (not vendor marketing) — Microsoft
Tech Community, `techcommunity.microsoft.com/discussions/outlookgeneral/...`, thread opened
2024-05-03, crawled 08/19/2026:** a developer building programmatic event-invite emails reports,
verbatim: *"I have managed to get it to work for METHOD:REQUEST but METHOD:PUBLISH is just not
working the way I expect it... [wanting] a nice overview over the event above the actual email in
outlook.com."* The thread's answer (surfaced via DuckDuckGo's own result snippet, corroborating
the OP's own finding): *"The behavior you're seeing, where METHOD:REQUEST works but METHOD:PUBLISH
does not, seems to be consistent with others' experiences... if you want the ICS files to display
a nice overview of the event above the actual email in Outlook.com, it would be advisable to use
METHOD:REQUEST."*

**What this means for our build:** `METHOD:REQUEST` is the iTIP scheduling-invite method (it
implies an attendee who can accept/decline/tentative — technically a two-way RSVP protocol, with
`ORGANIZER`/`ATTENDEE` fields carrying real semantic weight), while a `METHOD`-less or
`PUBLISH`-style `.ics` is a one-way "here's an event, save it if you want" object. **Using
`METHOD:REQUEST` to get Outlook.com's nicer rendering means opting into the RSVP protocol's
semantics** (accept/decline responses can round-trip back to the `ORGANIZER` address) even when
the actual intent is "here's an open house, add it if you're coming" — not a real two-party
scheduling negotiation. This is a genuine trade-off, not a free rendering upgrade: it's a real
protocol commitment for a UI benefit in one client.

---

## 6. `.ics` file vs hosted add-to-calendar link — which is safer for OUR deliverability (Resend)

Two lines of evidence, one vendor-neutral and one specific to our own stack.

**Vendor-neutral (Litmus, an ESP-tooling authority, not a calendar vendor — fetched 08/19/2026,
`litmus.com/blog/how-to-create-an-add-to-calendar-link-for-your-emails`):** their own summary
table, "Add to Calendar" method by calendar —

| Calendar | ICS file | Calendar link |
|---|---|---|
| Outlook.com | yes | yes |
| Outlook (desktop) | yes | **no** |
| Gmail / Office 365 | yes | yes |

**"All calendars are capable of using an ICS file... But it requires people to first download the
ICS file and then upload it to their calendar."** Their explicit recommendation: **use the `.ics`
file as the universal fallback (works everywhere, including desktop Outlook, which has no link
equivalent), and additionally offer one-click calendar LINKS per-provider for the clients that
support them** — because a raw `.ics` "requires more steps, and you might lose some folks along
the way," while a personalized link is "just one click away." Their own worked HTML example
attaches the `.ics` behind a plain `<a href="https://.../event.ics">` **hosted URL**, not a MIME
attachment — the button downloads a file from a server, it doesn't carry the file inside the
email's own MIME structure.

**Resend-specific, verified 08/19/2026 (`resend.com/docs/dashboard/emails/attachments`,
`resend.com/docs/knowledge-base/what-attachment-types-are-not-supported`):**
- Resend supports attachments generally (`path`-based remote-file attach or local-file attach),
  40MB email cap including Base64-encoded attachment weight, and `.ics` is **not** on Resend's
  blocked-extension list (that list is executables/scripts — `.exe`, `.js`, `.jse`, `.crt`, etc.,
  not calendar files) — so a `.ics` MIME attachment is technically permitted by Resend's API in
  isolation.
- **But: "We currently do not support sending attachments when using our batch endpoint."** Grep
  of this repo (`lib/email/outreach/send.ts`, `lib/email/weekly-read/send.ts`) confirms both of
  our actual bulk-send paths call `client.batch.send(batch)`. **A raw `.ics` MIME attachment is
  therefore not an option at all for any email sent through those two senders** — not a
  rendering-quality trade-off, a hard API rejection. This wasn't checked in either prior pass and
  is new information this session.

**Net for our build:** the choice isn't really "attachment vs link" once Resend's own batch-send
constraint is in the picture — it's decided. **The only Resend-compatible shape for our bulk
sends is a hosted `.ics` URL (a link to a file our own server generates and serves, same as
Litmus's own worked example) plus per-provider one-click calendar links (Google `render`, Outlook
`deeplink/compose`) for the providers that support them.** A raw attached `.ics` stays available
only for any future single-send (non-batch) path, if one gets built — not for the bulk sends that
exist today.

---

## 7. `mailto:` "reply with a time" — the RFC, and what breaks in practice

**RFC 6068, the `mailto:` URI scheme spec itself** (fetched 08/19/2026, `rfc-editor.org/rfc/rfc6068`
— supersedes RFC 2368, this is the current standard, not memory): the canonical syntax is
`mailto:<addr>?subject=<...>&body=<...>&cc=<...>&bcc=<...>`, joined the same way query params are,
but **the encoding rule is NOT `application/x-www-form-urlencoded`** — it's plain percent-encoding
per RFC 3986. Verbatim from the spec: *"use `%20` for space in the message body. Also note that
line breaks in the body of a message MUST be encoded with `%0D%0A`."* A `+` in a mailto body is a
**literal plus sign**, not a space — the classic bug of reusing a form-encoding helper for a
mailto body. Worked examples straight from the RFC:
- `mailto:infobot@example.com?body=send%20current-issue`
- `mailto:infobot@example.com?body=send%20current-issue%0D%0Asend%20index` (two lines)
- `mailto:joe@example.com?cc=bob@example.com&body=hello` — **correct**, one `?` then `&` between
  fields; a second `?` (`...?cc=bob@example.com?body=hello`) is explicitly flagged **WRONG** in
  the spec's own example.

**Practical client-support caveats, fetched 08/19/2026 from `itechguides.com` (a current — dated
2026-08-18 on the source page — mailto troubleshooting guide, cross-checked against MDN's own
URI-scheme reference which the article cites):**
- **A `mailto:` link does not choose the provider.** The browser/OS delegates to whatever mail
  handler is *registered* — Gmail's webmail, a desktop client, or nothing. Verbatim: *"A website
  should not promise that every mailto link opens a particular provider."*
- **No handler registered → the click silently does nothing, or throws an app error** — there is
  no visible failure state for the sender to detect or catch. This is the single most important
  caveat for a "propose times" fallback: some fraction of recipients (webmail-only users with no
  registered handler, or a locked-down corporate policy overriding the handler) will click and see
  nothing happen at all.
- **No official length limit; a practical one exists.** No RFC-stated cap, but real-world reports
  (Stack Overflow, corroborated by the itechguides piece) converge on "a few hundred characters is
  safe, low thousands starts to be risky" depending on browser/client — **keep a proposed-times
  mailto body short** (a handful of slot lines, not a full paragraph per slot).
- **Reserved characters need encoding even inside a body/subject value**, not just as URI
  delimiters: `&`, `?`, `=`, `#`, `%`, `+`, quotes, accented characters, emoji all need percent-
  encoding or they corrupt the parse.

**Worked pattern for "reply with a time," using the RFC's own rules:**
```
mailto:agent@example.com?subject=Re%3A%20123%20Main%20St%20%E2%80%94%20showing%20time&body=Hi%2C%20I%27d%20like%20to%20see%20it%20at%3A%0D%0A%0D%0A%E2%98%90%20Sat%206%2F14%2C%201%3A00pm%0D%0A%E2%98%90%20Sat%206%2F14%2C%203%3A00pm%0D%0A%E2%98%90%20Sun%206%2F15%2C%201%3A00pm
```
(subject: `Re: 123 Main St — showing time`; body: three checkbox-style slot lines separated by
`%0D%0A`). Each slot is its own `mailto:` link with a distinct pre-filled body if the design wants
one-tap-per-slot instead of one link with all slots listed — trades one extra rendered button per
slot for removing the "which box did they mean" ambiguity a human has to resolve on reply.

---

## 8. Composing all of this with the prior LOCATION-field finding and the booking_url ladder

The 08/12 file's core answer — **the calendar event's `LOCATION` field is the entire answer to
both "map" and "add address to phone"** — is unchanged and now confirmed identically-shaped across
all three mechanisms this file adds detail to: Google's `location=`, Outlook's `location=`, and
`.ics`'s native `LOCATION:` line are the same free-text, non-geocoded field, made tappable by the
OS's own calendar app only after the event is saved. Nothing in this pass changes that.

**The three-rung fallback ladder now fully specified, cheapest/most-available rung last:**
1. **Agent has a real booking link** (Calendly, Cal.com, etc.) → render it directly (the
   `booking_url` field proposed in the 08/19 cal.diy research, not yet built).
2. **Agent has none, but is willing to get one** → point them at a free hosted cal.com individual
   account (same file, same rung) — still an external provider, just free and not self-hosted by
   us.
3. **Agent has none and won't set one up, or the moment before rung 1/2 exists** — **this file's
   rung**: the email itself carries (a) one-click add-to-calendar links for Google and Outlook
   using the verbatim template URLs in §1–§2, both with the real property address in `location=`;
   (b) a hosted `.ics` URL as the universal fallback per §6 (Litmus's own pattern, and the only
   Resend-compatible shape for our `batch.send`-based sends); and (c) a `mailto:`/reply CTA per §7
   as the lowest-tech, zero-calendar-app-required option — someone with no calendar app at all,
   or a locked-down mail handler, can still reply with a checked box.

**Recommended build, concrete:** a small server-side link builder (`lib/deliverable` or
`lib/email`, no new top-level dir per Gate 19) that takes `{title, startISO, endISO, tz, location,
description}` and returns `{googleUrl, outlookUrl, icsUrl}` — `googleUrl`/`outlookUrl` are pure
string templates per §1–§2 (no network call, no vendor SDK), `icsUrl` points at a route that
generates a `METHOD:PUBLISH`-shaped (not `REQUEST` — see §5's protocol-commitment trade-off; an
open-house invite is not a two-party scheduling negotiation) `.ics` file server-side and serves it
from our own domain, matching Litmus's hosted-link pattern and satisfying Resend's batch-send
attachment ban. The `mailto:` reply CTA needs no builder beyond string templating per §7's
percent-encoding rule — it's the cheapest piece and the true zero-dependency floor when even the
`.ics` route or a calendar app aren't in play for the recipient.

---

## Sources

**crawl4ai, 08/19/2026:**
1. raw.githubusercontent.com/InteractionDesignFoundation/add-event-to-calendar-docs/main/services/google.md
2. raw.githubusercontent.com/InteractionDesignFoundation/add-event-to-calendar-docs/main/services/outlook-web.md
3. raw.githubusercontent.com/InteractionDesignFoundation/add-event-to-calendar-docs/main/README.md
4. icalendar.org/iCalendar-RFC-5545/3-6-1-event-component.html (RFC 5545 VEVENT)
5. icalendar.org/iCalendar-RFC-5545/3-7-2-method.html (RFC 5545 METHOD property)
6. techcommunity.microsoft.com/discussions/outlookgeneral/how-to-programatically-attach-ics-files-to-an-email-so-they-are-displaying-a-nic/4130195 (surfaced via DuckDuckGo discovery, crawled directly)
7. litmus.com/blog/how-to-create-an-add-to-calendar-link-for-your-emails
8. rfc-editor.org/rfc/rfc6068 (mailto: URI scheme, IETF)
9. itechguides.com/mailto-links-how-to-create-encode-test-and-troubleshoot-them/
10. resend.com/docs/dashboard/emails/attachments
11. resend.com/docs/knowledge-base/what-attachment-types-are-not-supported
- DuckDuckGo HTML result pages used for URL discovery only (crawl4ai has no native search
  subcommand), not cited as evidence sources themselves.
- `postmarkapp.com/support/article/800-...` and `sendgrid.com/en-us/blog/embedding-ics-files-in-html-email`
  attempted, both 404/redirected — not usable, excluded.

**Prior research read, not re-crawled:**
- `_RESEARCH/email-and-social/2026-08-12-open-house-invitation-craft.md` (§7–§8)
- `_RESEARCH/competitor-and-strategy/2026-08-19-cal-diy-scheduling-widget-evaluation.md`

**Code checked, not research:** `lib/email/outreach/send.ts`, `lib/email/weekly-read/send.ts`
(both confirmed on `client.batch.send`); grep across `lib/`, `app/` for
`add-to-calendar`/`.ics`/`calendar.google.com`/`outlook`+`deeplink` — zero hits, confirms unbuilt.
