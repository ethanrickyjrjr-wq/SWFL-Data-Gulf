# HTML-email button-row constraints — time-slot picker buttons

**Fetched 08/19/2026 via crawl4ai.** Companion to `2026-08-03-button-link-mechanics.md` (single
CTA link mechanics, already answered). This file is scoped to the NEW question: laying out
**2-4 side-by-side buttons that stack on mobile**, for a time-slot picker (e.g. "Tue 2pm / Tue
4pm / Wed 10am / Pick a different time") in emails sent via Resend to Gmail, Outlook (classic
desktop + macOS + webmail + mobile), Apple Mail, and generic mobile clients.

Sources crawled:
- `https://www.caniemail.com/features/css-display/`
- `https://www.caniemail.com/features/css-border-radius/`
- `https://www.caniemail.com/features/css-display-flex/`
- `https://www.caniemail.com/features/css-at-media/`
- `https://www.caniemail.com/features/css-at-media-prefers-color-scheme/`
- `https://www.caniemail.com/features/css-color-scheme/`
- `https://www.caniemail.com/clients/outlook/` (the per-client Supported/Partial/Not-supported
  breakdown — the most load-bearing page of this crawl)
- `https://www.litmus.com/blog/a-guide-to-bulletproof-buttons-in-email-design` (04/03/2025,
  full article incl. dark-mode section — full text saved, article's own disclaimer: "2+ years
  old, may not be updated")
- `https://buttons.cm/` (Campaign Monitor's VML button generator, legacy reference)
- `https://www.emailonacid.com/blog/article/email-development/bulletproof-buttons-for-office-365-and-everything-else/`
  (dated 01/13/2015 — historical table-cell precedent only, cited as such)
- `https://www.goodemailcode.com/email-code/link-button` (Mark Robbins, last updated
  04/20/2023 — the CURRENT non-VML conditional-padding recipe, no VML at all)
- `https://www.hteumeuleu.com/2021/fixing-gmail-dark-mode-css-blend-modes/` (Gmail dark-mode
  color-inversion mechanics)

**Blocked / could not verify:** `w3.org` (WCAG 2.2 target-size pages — Cloudflare bot-check,
no JS execution available to crawl4ai) and its MDN mirror (404). The 24×24 / 44×44 CSS-px WCAG
2.5.8/2.5.5 numbers are widely repeated industry knowledge but are **NOT verified live this
session** — treat as provisional, not as a cited number, until a live WCAG source is crawled.

---

## 0. What we already have in the codebase

`lib/email/blocks/ButtonBlock.tsx` renders **one** centered CTA via `@react-email/components`'
`<Button>` (which compiles to a real `<a>` with `display:inline-block`), styled with:
```
backgroundColor: bg, color: legibleInk("#ffffff", bg, 4.5), padding: pad(16,32),
borderRadius: "8px", ...text("body", {weight: WEIGHT.emphasis}), textDecoration:"none",
display:"inline-block"
```
This is already a coded (non-image) button in the 42-72px height band our own
`2026-08-03-button-link-mechanics.md` cites from Litmus. **There is no existing multi-button-row
component** — no side-by-side layout, no mobile-stack behavior, no MSO conditional padding hack.
A time-slot picker needs a NEW block; it should reuse `pad()`, `text()`, `legibleInk()` from
`lib/email/blocks/scale.ts` / `on-dark.ts` for consistency, and follow the shape in §5 below,
not `react-email`'s bare `<Button>` (which doesn't add the MSO padding fix or handle a row).

---

## 1. Current bulletproof-button recipe — is VML still needed in 2026?

**Short answer: yes, but only for classic desktop Outlook Windows and the Windows Mail app —
and only for rounded corners.** Everywhere else (Outlook macOS, Outlook.com webmail, Outlook
iOS/Android, Gmail, Apple Mail) a plain styled `<a>` with `border-radius` and
`display:inline-block` renders correctly with no VML at all.

Verified from `caniemail.com/clients/outlook/`'s per-client Supported/Partial/Not-supported
lists (six Outlook variants are tracked separately):

| Outlook variant | `border-radius` | `display:flex` / `:grid` | `padding` on `<a>` |
|---|---|---|---|
| **Windows (classic desktop, Word engine, 2003-2019)** | **Not supported** — needs VML `RoundRect` | **Not supported** | **Partially supported** |
| **Windows Mail (the win10/11 Mail app)** | **Not supported** — needs VML | **Not supported** | Partially supported |
| macOS (16.x+) | Supported | Supported | Supported |
| Outlook.com (webmail) | Supported | Supported | Supported |
| Outlook iOS | Supported | Supported | Supported |
| Outlook Android | Supported | Supported | Supported |

The `border-radius` feature page's own note: *"Round corners can be used in VML with the
`RoundRect` element. See buttons.cm and VML documentation"* — attached to every classic-Windows
version 2003 through 2019 and to Windows Mail 2020-01. `display:flex`/`display:grid` are flatly
absent from classic Windows Outlook and Windows Mail's "Supported" list.

**Caveat on "new Outlook for Windows":** caniemail does not yet track the 2024 WebView2-based
"New Outlook for Windows" rebrand as a distinct client — as of this crawl (08/19/2026) its
client list is still just Windows / Windows Mail / macOS / Outlook.com / iOS / Android. It is
reasonable to expect New Outlook (Chromium/WebView2) behaves like Outlook.com webmail (full
border-radius/flex support) since it shares that rendering stack, but **this is not verified
against a live source** — Microsoft's rollout has been gradual and enterprise users are still
commonly pinned to classic desktop Outlook. Build for classic Outlook Windows as the floor.

**Litmus's own read (04/03/2025 article, self-flagged as "2+ years old"):** *"Outlook is moving
away from the older desktop clients that use VML, and we suggest you do, too."* Litmus's
conditional-padding recipe (their own pick, credited to Mark Robbins) uses **zero VML** — it
accepts square corners in classic Outlook as the tradeoff. Their support table (also from that
article, Outlook 2007-2016 / Office365 desktop): conditional, padding, border, and
padding+border methods all render `✔*` — functional, clickable, full-width tap target — with
`*` = *"rounded corners do not render."* Only the pure VML method keeps rounded corners in
Outlook classic.

**Recipe: current non-VML conditional-padding button (Mark Robbins / Good Email Code, last
updated 04/20/2023 — this is the modern default, not the old letter-spacing hack it replaced
in early 2023 after Outlook broke `letter-spacing` support):**
```html
<a href="https://parcel.io" style="background-color:#005959; text-decoration: none; padding: .5em 2em; color: #FCFDFF; display:inline-block; border-radius:.4em; mso-padding-alt:0; text-underline-color:#005959"><!--[if mso]><i style="mso-font-width:200%;mso-text-raise:100%" hidden>&emsp;</i><span style="mso-text-raise:50%;"><![endif]-->My link text<!--[if mso]></span><i style="mso-font-width:200%;" hidden>&emsp;&#8203;</i><![endif]-->
</a>
```
Mechanics: `mso-padding-alt:0` zeroes Outlook's horizontal padding (which it half-respects and
distorts), then MSO-only `<i>`/`<span>` elements rebuild left/right padding as EM-space
(`mso-font-width` = percentage of 1em) and top/bottom padding as `mso-text-raise`. Everyone
else just reads the plain `padding` on the `<a>`. `text-underline-color` covers a Windows Mail
bug where `text-decoration:none` is ignored — the underline is colored to match the background
instead of removed. **Squared corners in classic Outlook are the accepted tradeoff of this
recipe.** If a specific send genuinely needs rounded corners in classic Outlook, add the VML
`<v:roundrect>` wrapper (Litmus recipe below) — but that reintroduces the two-URL/double-button
maintenance burden Litmus itself lists as VML's main con, and Litmus flags VML as adding
accessibility complications on top.

**VML recipe (only if rounded corners in classic Outlook are a hard requirement):**
```html
<div><!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="http://" style="height:50px;v-text-anchor:middle; mso-wrap-style: none; mso-position-horizontal: center; mso-position-vertical: top;" arcsize="10%" stroke="f" fillcolor="#1F7F4C">
<w:anchorlock/>
<center>
<![endif]-->
<a href="http://litmus.com" style="background-color:#1F7F4C;border-radius:5px;color:#ffffff;display:inline-block;font-size:18px;font-family:Helvetica,Arial,sans-serif;font-weight:bold;text-align:center;text-decoration:none;-webkit-text-size-adjust:none;padding:14px 24px;">I am a button &rarr;</a>
<!--[if mso]>
</center>
</v:roundrect>
<![endif]--></div>
```
Dark-mode addendum for the VML recipe: Office 365 desktop inverts the `<a>` background in dark
mode but does **not** invert the VML `fillcolor`, producing a mismatched two-tone button. Fix
(Litmus, credited to Wilbert Heinen): use an `rgba()` background on the `<a>` — Outlook doesn't
support `rgba()` at all, so it silently falls back to the VML `fillcolor`, keeping both halves
in sync.

**Recommendation for this build:** skip VML. Time-slot buttons are small, numerous (2-4 in a
row), and disposable (the picker becomes stale once a slot is booked) — the two-URL VML
maintenance cost and accessibility complication aren't worth it for square corners in one
legacy client. Use the conditional-padding recipe from Good Email Code, matching our own
`ButtonBlock.tsx`'s `borderRadius: "8px"` convention (accepted as square-only in classic
Outlook, same as today's single-CTA button already renders there).

---

## 2. Laying 2-4 buttons side-by-side that stack on mobile, without flexbox

Two supporting facts from caniemail change the usual framing here:

- **`display:inline-block` is fine in Outlook Windows classic** — it sits in the "Partially
  supported" bucket only because of `display:none` inheritance bugs (doesn't propagate into
  inner tables, doesn't apply to `<img>`); plain `inline-block` on an `<a>` is unaffected and is
  exactly what every bulletproof-button recipe above already relies on.
- **`@media` at-rules themselves are NOT categorically blocked in Outlook Windows classic** —
  caniemail shows `@media` parsing back to Outlook 2003, with only nested-media-query support
  missing. The real reason Outlook desktop doesn't respond to a mobile breakpoint isn't that it
  ignores `@media` — it's that Outlook desktop's viewport is never touch/narrow, so a
  `max-width` breakpoint never fires there, and the CSS properties inside the query
  (flex/grid especially) wouldn't render even if it did.

So the robust, flexbox-free pattern is: **let `inline-block` buttons wrap themselves.**
`inline-block` elements wrap onto a new line exactly like inline text does the moment they
don't fit the container width — this is free CSS-1-level behavior with no `@media` query
required at all. Put 2-4 `<a style="display:inline-block">` buttons inside one `<td>`,
`text-align:center` (or `left`), with a small right-margin/gap between each. On a 600px desktop
canvas they sit in a row; on a ~320-375px mobile viewport they wrap to their own line(s)
automatically. Outlook desktop, never narrow, always shows them in a row — with square corners
per §1.

Wrap the whole thing in a single `<table role="presentation" width="100%">` (one `<td>`) so
Outlook has a table to anchor to and so `align="center"` on the cell gives a fallback centering
mechanism in clients that mis-handle `text-align` on `<td>`. Do **not** build one `<td>` per
button — that's the 2015-era Email-on-Acid pattern (`emailonacid.com`, dated 01/13/2015,
historical only) built for a single fixed-width button, not a wrapping row, and it defeats the
free-wrap behavior above by giving each button a rigid table cell that won't reflow.

If a true forced-stack (one button per line regardless of width, e.g. because labels are long
"Tue Aug 25, 2:00 PM") is wanted instead of a wrap-when-tight layout, add a `@media (max-width:
480px)` rule targeting the button anchors with `!important` `display:block; width:auto;
margin:0 0 8px 0;` — this fires in every client that supports `@media` + `display:block`
override (Gmail, Apple Mail, modern mobile webmail) and is simply inert in Outlook desktop
(never narrow, so never matches) without needing an MSO conditional to suppress it.

---

## 3. Dark-mode pitfalls for colored buttons

- **Gmail (iOS especially) performs heuristic color inversion, not a controlled theme.**
  Per `hteumeuleu.com`'s Gmail dark-mode article: Gmail swaps light-on-dark to dark-on-light
  (and vice versa) based on its own read of "already dark" content — a branded button with a
  saturated background color and white label text can get its text color flipped to black,
  landing on a still-colored background and becoming unreadable. There is **no clean escape
  hatch**; the documented fix is a `mix-blend-mode: difference` + `mix-blend-mode: screen`
  nested-div trick that exploits how Gmail transforms the colors, not a property Gmail
  respects directly. For a 4-button time-slot row this is real risk — test in actual Gmail iOS
  dark mode, don't rely on `prefers-color-scheme` overrides alone (see next point).
- **`@media (prefers-color-scheme)` does NOT reach classic Outlook Windows or Windows Mail at
  all** (caniemail: no version listed under either client on that feature's per-client table).
  Outlook macOS 16.70+/16.80, Outlook.com, iOS, and Android DO respond to it, but layer their
  own mechanism on top: Microsoft injects `data-ogsc` / `data-ogac` / `data-ogsb` / `data-ogab`
  custom attributes onto elements when the email is viewed in dark mode — a *separate* selector
  surface from the `[data-ogsc]` attribute some guides associate only with Apple/Gmail. Any
  dark-mode override aimed at Outlook web/mobile must target these attributes, not just the
  media query.
- **`color-scheme` (the CSS property/meta-tag form, distinct from the media query) has weak
  reach** — caniemail's estimated support is **16.28%** total. It works only on the
  `html`/root element in Apple Mail (footnoted), and Outlook classic Windows/Windows Mail show
  no support entry at all. Don't rely on `<meta name="color-scheme">` as a primary dark-mode
  control for button colors; it's a minor lever at best.
- **Practical mitigation already available in our stack:** `lib/email/blocks/on-dark.ts`'s
  `legibleInk(fg, bg, ratio)` — already used in `ButtonBlock.tsx` — picks an ink color that
  holds contrast against whatever background is passed in. It does not solve Gmail's inversion
  (that happens client-side, after our HTML is fixed), but it's the right tool for ANY new
  button-row component's text-color logic, same as the existing single-CTA block.

---

## 4. Minimum tap-target sizing

**Verified, in-repo, already cited (`2026-08-03-button-link-mechanics.md`, Litmus source):**
button height **42-72px** (~11-19mm) is the mobile-clickable band Litmus recommends; smaller is
hard to hit, larger stops reading as a button. Litmus also flags that bunched links/buttons
with no surrounding whitespace produce mis-taps, worst on mobile — directly relevant to a
2-4-button row: **the inter-button gap matters as much as each button's own size.** Use a real
gap (margin or a spacer cell), not just reliance on padding-driven button width, so adjacent
slot buttons don't read as one continuous tappable strip.

**NOT verified this session:** the commonly-cited WCAG 2.5.8 (AA, 24×24 CSS px) / 2.5.5 (AAA,
44×44 CSS px) target-size success criteria — `w3.org` blocked crawl4ai behind a Cloudflare
bot-check and the MDN mirror 404'd. Litmus's 42-72px band already clears both of those
commonly-cited numbers, so building to the Litmus figure is safe regardless, but do not cite a
specific WCAG pixel number in-product copy or code comments until it's crawled live.

---

## 5. Recommended minimal HTML shape — 2-4 time-slot buttons + fallback link

One `<table>` wrapper, `inline-block` buttons that free-wrap, conditional-padding per button
(no VML), a fallback plain-text link row beneath for clients/situations where the buttons don't
render as expected (images-off has no bearing here since these are coded buttons, but a text
fallback still covers copy/paste and screen-reader link-menu users who want the raw slot list).

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding: 24px 16px;">

      <!-- one <a> per time slot, 2-4 total -->
      <a href="https://example.com/book?slot=1"
         style="display:inline-block; margin: 0 8px 8px 0; background-color:#1F7F4C;
                color:#ffffff; font-family:Helvetica,Arial,sans-serif; font-size:16px;
                font-weight:bold; text-decoration:none; text-underline-color:#1F7F4C;
                padding:16px 24px; border-radius:8px; mso-padding-alt:0;">
        <!--[if mso]><i style="mso-font-width:150%;mso-text-raise:100%" hidden>&emsp;</i><span style="mso-text-raise:50%;"><![endif]-->
        Tue 2:00 PM
        <!--[if mso]></span><i style="mso-font-width:150%;" hidden>&emsp;&#8203;</i><![endif]-->
      </a>

      <a href="https://example.com/book?slot=2"
         style="display:inline-block; margin: 0 8px 8px 0; background-color:#1F7F4C;
                color:#ffffff; font-family:Helvetica,Arial,sans-serif; font-size:16px;
                font-weight:bold; text-decoration:none; text-underline-color:#1F7F4C;
                padding:16px 24px; border-radius:8px; mso-padding-alt:0;">
        <!--[if mso]><i style="mso-font-width:150%;mso-text-raise:100%" hidden>&emsp;</i><span style="mso-text-raise:50%;"><![endif]-->
        Tue 4:00 PM
        <!--[if mso]></span><i style="mso-font-width:150%;" hidden>&emsp;&#8203;</i><![endif]-->
      </a>

      <!-- ...repeat for up to 4 slots... -->

    </td>
  </tr>
  <tr>
    <td align="center" style="padding: 0 16px 24px; font-family:Helvetica,Arial,sans-serif;
                               font-size:13px; color:#666666;">
      Or reply to this email to request another time.
      <!-- plain-text fallback link, never an image, never the only way to act -->
    </td>
  </tr>
</table>
```

Notes on this shape:
- `mso-font-width` set to `150%` here (vs `200%` in the Good Email Code source example) because
  time-slot labels are short ("Tue 2:00 PM") and don't need 2em of side padding — tune per
  label width, same principle as our own `labelGutterFor` measured-not-pinned philosophy
  (`lib/brand/text-metrics.ts`) rather than copying a fixed constant.
  **Do not char-count-fit these labels** — measure them, per the project's own banned-idiom
  rule in `lib/email/CLAUDE.md`.
  - `border-radius:8px` matches the existing `ButtonBlock.tsx` convention; renders square in
  classic Outlook Windows/Windows Mail only, per §1 — accepted tradeoff, no VML.
  - `margin: 0 8px 8px 0` gives both the horizontal gap between buttons and the vertical gap
  when they wrap to a second line on mobile — covers the Litmus "bunched buttons cause
  mis-taps" warning from §4 without any `@media` query.
  - Swap `background-color` for a per-brand token / `legibleInk()`-derived ink color when this
  becomes a real component, not the hardcoded `#1F7F4C` shown here (that's the Litmus/Good
  Email Code example color, kept only so the snippet is copy-pasteable and diffable against the
  cited sources).
