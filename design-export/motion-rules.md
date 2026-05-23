# Motion Rules

The single most important rule file. Re-read before any animation decision.

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
- If the answer is "it sequences supporting evidence after the conclusion" → **keep it.**
- If the answer is "it shows the data being built from its source" → **keep it.**

This test kills 80% of decorative motion before it ships.

---

## Two contexts for this project

### 1. Web report pages — full send

This is a destination, not a chat bubble. Spend the budget. Full scroll-triggered
reveals, count-ups, SVG path draws, 3D when it earns its place.
**Impress without apology.**

Constraints:
- Performance still matters. **Lazy-load heavy libs.** Don't block first paint on Three.js or anything over ~150 KB compressed.
- The verdict must be readable inside 1 second on mid-tier hardware. Motion is the flourish, not the door.

**Returning-user rule:** detect via `localStorage` whether this session has seen the page before. After the first visit, scale animation durations to 60% and skip the hero spring on subsequent loads.

### 2. Landing page — full send (marketing)

This is a marketing surface — it should **stop people mid-scroll.** Character-level text reveal on hero, scroll-triggered sections, install command spring-in. Same performance constraints as web reports.

---

## The universal rule (overrides every mode above)

**Never let a visual slow down access to the answer. Animation reveals data — it doesn't gate it.**

Specifically:
- The data must be in the DOM and readable from the moment the page loads. Reveal animations adjust opacity/transform — they never insert content via JS after a delay.
- If a heavy lib (Three.js) hasn't loaded, the page must still render the verdict + key metrics in text form.
- Skip animations entirely when `prefers-reduced-motion: reduce` is set.
- If you're ever choosing between "show the number now" and "perform a reveal," show the number now.

---

## Amount of data → motion rule

- **One number / one verdict** → animate the piece. Spring reveal + number count-up.
- **3-6 metrics** → stagger the rows in (60-80ms between). Then still.
- **More than ~10 rows** → **fade-in the whole block once.** No per-row stagger.
- **A chart** → animate the chart elements, then still. One reveal per viewport entry.
- **A dump of citations / sources** → no animation. Render instantly.

Restated: **more data = less per-element motion.**

---

## Veto list (never animate these)

- Numbers in the audit/citation table — motion implies uncertainty
- Source citation links — must be instantly clickable
- Loading spinners — use skeletons that match the final layout, not generic spinners
- Hover affordances on dense tables — row tint only, no background animation
- Direction color shifts — set the color instantly; don't animate to it
- Any animation on any error state

## Personality vetoes (banned easings/feels)

- **No bounce.** We don't bounce.
- **No elastic.** We don't snap.
- **No "cute" back-overshoots.** Subtle back-ease (5-10% overshoot) is OK for a single hero element; never for tables or charts.
- **No looping decorative motion.** No pulsing dots, no spinning rings, no idle animation. The page is still after it lands.

---

## The animations toggle (non-negotiable)

A persistent `animations: on | off` preference stored in `localStorage`. When `off`, all durations and delays become `0`. Also respect `prefers-reduced-motion: reduce` unconditionally.

```js
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const userPref = localStorage.getItem("swfl.animations") ?? "on";
const ANIMATE = userPref === "on" && !prefersReducedMotion;

const duration = (ms) => (ANIMATE ? ms : 0);
const delay    = (ms) => (ANIMATE ? ms : 0);
```

---

## Default timings (anchor values — adjust within ±20%)

| Element                  | Duration           | Feel                                    |
| ------------------------ | ------------------ | --------------------------------------- |
| Hero verdict spring      | 700–900ms          | Spring: stiffness 90, damping 14        |
| Metric row stagger       | 60–80ms gap, 400ms each | fade + 4px rise                    |
| Number count-up          | 800ms              | ease-out quint                          |
| Chart path draw          | 800–1200ms         | ease-out quart                          |
| Bar chart bar grow       | 500ms, 40ms stagger| ease-out cubic                          |
| Section reveal on scroll | 500–700ms          | ease-out cubic                          |
| Hover affordance         | 120–180ms          | ease-out quad                           |
| Tab crossfade            | 250ms total        | crossfade                               |

---

## When in doubt

**Cut the animation.** A still, well-typed, well-spaced page that shows
the right number first is better than an animated one that buries the
verdict in motion.
