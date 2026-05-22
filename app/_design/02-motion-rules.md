# 02 — Motion Rules

The single most important rule file. Re-read before any animation
decision.

## The aesthetic in one sentence

**Surfacing from deep water.** Something is rising into view, settling
into place, becoming legible. Slow enough to feel intentional, fast enough
to feel responsive. Spring physics with damping that **settles** — not
springs that bounce, not elastic that overshoots dramatically.

## The "earn its place" test

Before adding any animation, answer in one sentence:
**"What insight does this animation reveal?"**

- If the answer is "it makes the page feel alive" → **delete it.**
- If the answer is "it draws the eye to the verdict" → **keep it.**
- If the answer is "it sequences supporting evidence after the conclusion"
  → **keep it.**
- If the answer is "it shows the data being built from its source" → **keep it.**

This test kills 80% of decorative motion before it ships.

## Three contexts, three modes

The mode is chosen by **surface first**, then by **what the user is doing**
within that surface. The "universal rule" below overrides every mode.

### 1. MCP widget / in-chat — read the room

The widget renders inside an AI chat bubble. There's no destination here;
the user is mid-conversation. Pick the sub-mode from the user's intent:

- **Professional / looking up data** (default) — subtle, fast, near-zero
  motion. Verdict appears, metrics appear, source links appear. **Data
  first, always.** Total motion ideally under 300ms, never over 400ms.
- **Asked for something cool / exploratory / explicitly "impress me"** —
  more animation allowed, but still **never slow.** Under 600ms total
  motion budget. The verdict can spring, the metrics can stagger faintly.
  **Never block the data.**

How the widget knows which mode: the host (Claude.ai, Cursor, etc.) can
pass a mode hint via prop or via the tool-call args (e.g.
`{ mode: "subtle" | "impress" }`). Default to subtle when unspecified.

### 2. Web report pages (`/r/{report_id}`) — full send

This is a destination, not a chat bubble. Spend the budget. Full
Anime.js v4 sequences, scroll-triggered reveals, count-ups, SVG path
draws, motion paths on maps, gauges, 3D when it earns its place.
**Impress without apology.**

Constraints:

- Performance still matters. **Lazy-load heavy libs.** Don't block
  first paint on Mapbox, Three.js, or anything over ~150 KB compressed.
- The verdict must still be readable inside 1 second on mid-tier
  hardware. Motion is the flourish, not the door (see universal rule).
- Audit-tier surfaces inside the report (Tier 3) still get minimal
  motion per Surface C of `03-surface-recipes.md`. Full send applies to
  the default Tier 2 view, not to the citation-verification flow.

**Returning-user rule:** detect via `localStorage` whether this session
has seen the page before. After the first visit, scale animation
durations to 60% and skip the hero spring on subsequent loads. The user
came back for the data, not the show.

### 3. `/connect` landing page — full send (marketing)

Same philosophy as web reports. This is a marketing surface — it should
**stop people mid-scroll.** All Surface E patterns from
`03-surface-recipes.md` apply: character-level text reveal, install
command spring, scroll-triggered waitlist, copy-button feedback.

Same performance constraints as web reports: lazy-load heavy libs,
don't block first paint.

## The universal rule (overrides every mode above)

**Never let a visual slow down access to the answer. Animation reveals
data — it doesn't gate it.** If someone needs the number, they get the
number. The motion is the flourish, not the door.

Specifically:

- The data must be in the DOM and readable from the moment the page
  loads. Reveal animations adjust opacity/transform — they never insert
  content via JS after a delay.
- If a heavy lib (Mapbox, Three.js) hasn't loaded, the page must still
  render the verdict + key metrics in text form. The map / 3D layer
  loads in over the top.
- Skip animations entirely when `prefers-reduced-motion: reduce` is set
  or the user has toggled animations off.
- If you're ever choosing between "show the number now" and "perform a
  reveal," show the number now.

## Little data vs lots of data — the decision rule

The amount of data on screen determines whether to animate each piece or
the whole block:

- **One number / one verdict** → animate the piece. Spring reveal +
  number count-up. This is your "wow" moment.
- **3-6 metrics in a table** → stagger the rows in (60-80ms between).
  Then still.
- **More than ~10 rows / dense audit table** → **fade-in the whole
  block once.** No per-row staggering — it becomes noise at scale.
- **A chart** → animate the chart elements (path draw, bar grow), then
  still. One reveal per viewport entry.
- **A map** → animate the camera or the path/route. Never animate every
  marker.
- **A dump of citations / sources** → no animation. Render instantly.
  This is reference material, not narrative.

Restated: **more data = less per-element motion.** The hero verdict
gets the spring. The audit table gets one fade. Everything in between
is staggered restraint.

## Veto list (never animate these)

- **Numbers in the audit table.** They are checked against sources.
  Motion implies uncertainty.
- **Source citation links.** They must be instantly clickable.
- **The freshness token.** Quote it; don't perform it.
- **Loading spinners.** If you need one, the page failed. Use skeletons
  that match the final layout, not generic spinners.
- **Hover affordances on dense tables.** Row highlight is fine; do not
  also animate the background.
- **Direction color shifts.** Bullish/bearish/mixed is a state, not a
  transition. Set the color; don't animate to it.

## Personality vetoes (banned easings/feels)

- **No bounce.** `easeOutBounce` is banned. We don't bounce.
- **No elastic.** `easeOutElastic` is banned. We don't snap.
- **No "back" overshoots that feel cute.** `easeOutBack` with high
  overshoot is banned. A subtle back-ease at 5-10% overshoot is OK for
  a single hero element; never for tables or charts.
- **No looping decorative motion.** No pulsing dots, no spinning rings,
  no idle animation. The page is still after it lands.

## The toggle (non-negotiable)

A persistent `animations: on | off` preference, stored in `localStorage`.
When `off`:

- All animation durations become `0`.
- All `delay`s become `0`.
- All scroll-triggered reveals fire immediately (or are no-ops because
  elements are visible by default).
- The toggle itself is in user settings (gear icon or top-right corner of
  the report page).
- Default = `on` for first visit. Some users want the show. Others are
  working.

Pattern (anime.js v4):

```js
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const userPref = localStorage.getItem("swfl.animations") ?? "on";
const ANIMATE = userPref === "on" && !prefersReducedMotion;

const duration = (ms) => (ANIMATE ? ms : 0);
const delay = (ms) => (ANIMATE ? ms : 0);
```

Also respect `prefers-reduced-motion: reduce` system setting unconditionally
— it overrides the user toggle to `off`.

## Default timings (anchor values, adjust within ±20%)

- **Hero verdict spring:** 700-900ms, `createSpring({ stiffness: 90, damping: 14 })`
- **Metric row stagger:** 60-80ms between rows, each row 400ms total
- **Chart path draw:** 800-1200ms, `eases.outQuart`
- **Number count-up:** 800ms, `eases.outQuint`, with `utils.round(2)`
- **Section reveal on scroll:** 500-700ms, `eases.outCubic`
- **Hover affordance:** 120-180ms, `eases.outQuad`
- **MCP widget direction word:** 500-600ms spring, then still

These are not absolute — they're the gravity well. Drift on purpose if a
specific element earns it.

## When in doubt

**Cut the animation.** A still, well-typed, well-spaced report page that
shows the right number first is better than an animated one that buries
the verdict in motion.
