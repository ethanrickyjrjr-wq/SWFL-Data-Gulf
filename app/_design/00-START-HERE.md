# 00 — Start Here

You are designing the **SWFL Data Lake** — a real-time analyst-grade data
product for Southwest Florida. This folder is your toolkit: rules of
engagement, surface recipes, and **24 working Anime.js v4 example apps** plus
the v4 API reference docs.

## Read in this exact order before generating anything

1. **`01-product-brief.md`** — what we're building, who it's for, the
   "surfacing from deep water" aesthetic. Canonical context.
2. **`02-motion-rules.md`** — when to be impressive, when to be professional,
   what to never animate, the "earn its place" test. **This is the most
   important rule file. Re-read it before any animation decision.**
3. **`03-surface-recipes.md`** — animation budget per product surface
   (Report Tier 1/2/3, MCP inline widget, /connect landing). Treat as
   constraints, not suggestions.
4. **`04-context-decision-tree.md`** — given a piece of content (single
   metric / table / chart / map / audit dump), which motion pattern to
   use. Quick lookup for every component.
5. **`05-color-and-type.md`** — gulf palette + type direction in concrete
   tokens.

## Then, when you need to implement

- **`animejs-v4-examples/`** — 24 standalone working v4 apps. **These are
  your primary code reference, not the docs.** Each is a tiny
  `index.html` + `index.js` showing real v4 import syntax and a real
  pattern. The rule docs above cross-reference these by folder name.
- **`animejs-docs/`** — API reference for parameter signatures, callbacks,
  edge cases. Reach for these when an example uses an API and you need
  the precise shape.

## Critical version note

Anime.js **v4** is a different library from v3. v3 syntax will not run.
Always import from the v4 module surface:

```js
import {
  animate,
  createTimer,
  createTimeline,
  createAnimatable,
  createDraggable,
  createSpring,
  createScope,
  svg, // includes svg.createDrawable, svg.createMotionPath, svg.morphTo
  text, // includes text.createScrambler, text.split
  stagger,
  utils,
  onScroll,
  eases,
} from "animejs";
```

The `animejs-v4-examples/` folder is the ground truth for which APIs are
real. If you're tempted to write v3-style `anime({ ... })`, **stop and open
an example folder** — confirm the v4 syntax before generating.

## Hard constraints (from the brief)

- All animations must be **toggleable** via an `animations: on/off`
  preference. When off, instant render, no motion. See
  `02-motion-rules.md` for the toggle pattern.
- **No bounce, no elastic.** Spring physics with damping that settles
  cleanly. The aesthetic is "surfacing from water," not "rubber band."
- Every animation must earn its place. If you can't articulate the
  insight an animation reveals, delete it.
