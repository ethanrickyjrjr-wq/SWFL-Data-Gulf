# Grid-fence system — card/widget reference addons

**Date:** 2026-07-08
**Feeds:** `2026-07-08-email-grid-fence-system-design.md` (Fences 1–5)

## What this is

Ricky flagged 4 GitHub repos (screenshotted, not the matching Figma files) as
closer to the target aesthetic than a from-scratch design pass: dark
near-black surfaces, bordered cards with no drop shadow, real "statement of
earnings" stat cards with sparklines, balance tickers, weather, music player,
and social-feed/comment-thread cards. All four are by the same author,
**frankuxui**, cloned shallow into scratchpad (never committed — no LICENSE
file in any of them, so treat as visual/structural reference only, rebuild
the markup in our own components rather than copy-pasting source):

| Repo | URL | Stack | What's useful here |
|---|---|---|---|
| `widgets-components-v2.1` | github.com/frankuxui/widgets-components-v2.1 | Astro + Tailwind (v3-style, literal `gray-950` etc.) | Largest catalog — finance, social, multimedia, weather categories. Source of the card anatomy below. |
| `widgets-components-tailwind-v4` | github.com/frankuxui/widgets-components-tailwind-v4 | Astro + Tailwind v4 | Newer/larger widget set, same anatomy, Tailwind v4 theme tokens. |
| `social-cards-components-tailwind-v4` | github.com/frankuxui/social-cards-components-tailwind-v4 | Astro + Tailwind v4 | Masonry social feed: comment threads, nested "shared a post" cards, reaction rows. Uses semantic tokens (`bg-background`/`border-border`/`text-foreground`) instead of literal colors. |
| `cards-components` | github.com/frankuxui/cards-components | React (Vite), older Tailwind | Light/dark card variety, no live demo, simplest/oldest of the four. |

## The shared card shell (confirmed by reading source, not screenshots)

Every card across all four repos is the same shell, just with different
inner content:

```
border rounded-xl p-3|p-4 mb-3 text-sm
bg-white dark:bg-gray-950
dark:border-gray-900
shadow-sm          <- present in source; see note below
```

**Correction to the brief:** the actual source markup does carry `shadow-sm`
on nearly every card — "no drop shadows" is the retint decision Ricky wants
to make *from* this reference, not a property already true of it. Our own
site already scores Elevation 90/100 (main fence spec's live audit) using
flat/bordered cards with no shadow, so the fence work should keep our
no-shadow rule and drop `shadow-sm` when adapting any pattern below —
everything else in the shell (border, `rounded-xl`, dark near-black
`bg-gray-950`/`border-gray-900`) carries over directly.

The two Tailwind-v4 repos use semantic tokens (`bg-background`,
`border-border`, `text-foreground`) rather than literal `gray-950` — closer
to how our own token system should reference brand colors, but irrelevant
to email output either way since `compile-grid.ts` needs literal
hex/rgb at send time regardless of source token scheme.

## Pattern catalog — mapped to existing/proposed block `kind`s

Using the fence spec's vocabulary (`hero`/`signal`/`agent-hero`/`stats`/
`text`/`multi-column`/`list`/`image`/`listing`/`button`/`agent-card`/
`footer`, zones OPEN/BODY/CLOSE, `band:"accent"`):

| Pattern (source repo) | Anatomy | Maps to | Notes |
|---|---|---|---|
| Balance ticker (`finance.md:11`) — icon badge + label + inline sparkline SVG + amount | `flex items-center justify-between`, 40×40 rounded icon circle, trailing sparkline `<svg>` + bold amount | `stats` (BODY) | Sparkline is inline SVG `<path>` — survives email clients (no JS, no CSS animation used in the static path draw). Good candidate for a `stats` variant with an inline trend line. |
| "Statement of earnings" card (`finance.md:37,60`) — avatar, name, big figure, full-width sparkline | 2-up `grid-cols-2` row, avatar 40×40 rounded-full, bold `text-base` name, `font-bold text-sm` amount, `w-full` sparkline below | `stats` two-up (BODY, `[6,6]` span) | This is the closest existing repo pattern to "statement of earnings" Ricky named — maps directly onto Fence 1's `[6,6]` parity pair. |
| Credit-available pill (`finance.md:29`) | Single-row `header` with label + pill badge amount (`bg-amber-100`/`dark:bg-amber-100/20`) | `stats` single-value (BODY or CLOSE lead-in) | Pill-badge amount is a reusable atom — maps to `band:"accent"` if the pill color is the brand accent; counts against Fence 5's 2-row cap if so. |
| Bar-chart summary card (`finance.md:84`) — header + bordered bar-chart grid (month bars, gradient fill) | `border-x`/`border-r` divider grid, `h-36` fixed height columns, `bg-gradient-to-t` bar fill | `stats`/`multi-column` (BODY, span 12) | Bars are plain divs with fixed heights, not SVG — portable to email as nested tables (already how `compile-grid.ts` renders columns), but gradient fill needs a solid-color fallback for Outlook. |
| Social post card (`social.md:11`) — title + status pill + body text + avatar stack + like/comment counts | `header` (title + status badge) → `section` (heading + body) → `section` (avatar `-space-x` stack + icon+count row) | `text` or `list` item (BODY) | Avatar stack (`-space-x-1.5`, `ring-2 ring-white dark:ring-gray-950`) is a clean reusable atom for any "who's involved" pattern (comps, agent-card). |
| Comment/rating card (`social.md:59`) | `header` (name + timestamp, star rating) → body paragraph | `text` (BODY) | Star-rating SVG row — reusable for review/testimonial blocks if that ever becomes a block kind. |
| Nested "shared a post" card (`social-cards…tailwind-v4/cards.astro:34`) | Outer card (actor + action line) wrapping an inner bordered card (avatar + verified badge + timestamp + body + photo) | Not a direct block-kind match — nested-card composition | Masonry/feed-style nesting won't survive email-table compilation as literal nesting, but the *inner* bordered sub-card (avatar+verified-badge+timestamp header) is a solid `agent-card` or `listing` atom on its own. |
| Reaction row (`cards.astro:27-30`) — reaction icon + count, inline | `inline-flex items-center gap-2`, small icon + `font-semibold` count | Sub-atom of `text`/`list` | Simplest atom in the whole set — icon+count pair, trivially portable to a table cell. |
| Weather card (`weather.md:36`) — header + centered temp/icon/summary | `header` (title + menu button) → centered `flex-col` block: big temp, icon, 2-line summary | `stats`/`signal` (BODY) | Centered single-stat layout; icon is an external `<img>` (svgrepo URL) not inline SVG — would need to become an asset we host, not hotlink, for email deliverability. |
| Music player row (`multimedia.md:47`) — numbered avatar circle + track/artist + play button + progress bar | `flex items-center gap-4`, numbered circle, 2-line text block, circular play button, `absolute bottom-0` progress bar | `list` item (BODY) | Progress bar as `absolute`-positioned div won't compile through `compile-grid.ts`'s ghost-table approach — would need a static (non-interactive) rendering, e.g. a fixed-width inner div showing % complete, no live playback implied. |
| Album/movie card (`multimedia.md:11,29`) — image thumb (col-span-4/5) + text column (col-span-8/7) | `grid grid-cols-12` split, `object-cover` image, rating badge, meta line | `image` + `text` two-up (BODY, `[4,8]`-style split — NOT currently a blessed pair) | Closest existing repo pattern to a listing/comp card. If this split proves useful, it's a candidate for a 6th blessed pair (`[4,8]` or `[5,7]`) — flagged, not added to Fence 1's list without going back through the same golden-ratio research standard the other pairs used. |

## What doesn't survive from any of these repos

- Masonry/`columns-*` layout (all four repos use it as their demo-page
  layout) — `compile-grid.ts` is nested-table based, not CSS columns; every
  pattern above is evaluated as a **single card in a single grid cell**, not
  as part of a masonry wall.
- `hover:` states, `transition-all`, JS theme toggles (`cards-components`'s
  `useState`/`addEventListener` dark-mode button) — no interactivity survives
  email compilation.
- Hotlinked external images (`randomuser.me`, `svgrepo.com`, `pexels.com`) —
  fine for the repos' own demo pages, not for us; anything adopted needs to
  become a real asset or an `ImageBlock` reference, per Fence 3's existing
  photo-ratio rule.
- Backdrop blur / gradient-fill decorative accents (`blur-2xl` glow behind
  the earnings-card avatar, `bg-gradient-to-tr` financial hero card) — low
  Outlook/Gmail support; if kept, needs a solid-color fallback the same way
  the bar-chart gradient does above.

## Open follow-up

The album/movie image+text split (`[4,8]`ish) is the one pattern here that
doesn't fit an existing Fence-1 blessed pair. Not resolved in this doc —
flagged for whoever picks up Fence 1 implementation to decide whether it
earns a 6th pair or gets built as a variant of the existing `[6,6]`/`[8,4]`
set.
