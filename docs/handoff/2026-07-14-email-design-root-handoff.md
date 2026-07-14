# Handoff — The email design root: Phase 1+2 landed, Phase 3 is next

**Date:** 07/14/2026 · **Branch:** main · **Status:** Phase 1+2 SHIPPED and green. Phase 3 NOT started.
**Read this before touching anything under `lib/email/`.**

---

## The one-paragraph version

The design system was researched for days, written down correctly, committed — and **read by zero code**,
because it lived in markdown and markdown cannot be imported. So every session hand-typed pixels. That is
now fixed at the root: `lib/email/blocks/scale.ts` is the executable form of `app/_design/05-color-and-type.md`,
all 18 block components route through it, and `scale.test.ts` turns a hand-typed pixel into a red test.
**The layout half is still broken** — `assembleAuthoredDoc` (the fence pass) has exactly one caller, and
the 7 listing builders still emit flat `w:12` stacks. That is Phase 3.

---

## What you must not re-litigate

**1. The numbers are not up for debate.** Every value in `scale.ts` is lifted from
`app/_design/05-color-and-type.md` with the doc line cited beside it. If you think a size is wrong, the
argument is with the doc, and it is changed in the doc first. **Do not hand-type a pixel.** `scale.test.ts`
will fail you, which is the point.

**2. Keep every design as a choice.** Operator ruling (also `showcase_designs_buildable_as_options`):
*"KEEP EVERYTHING WE HAVE AS A CHOICE — additive, more options, not different ones."* Colours, block order
and per-template look stay template-owned. We unified **rhythm**, not appearance. Do not collapse the
templates onto one look.

**3. The compact strip is a DENSITY, not a second scale.** It shifts one step DOWN the existing ladder
(36→28, 28→16, 16→14). It had no step in the doc, which is exactly why it was previously invented as
17/20/13/9px. Never invent a step.

---

## What landed (Phase 1+2)

### `lib/email/blocks/scale.ts` — the root

- `TYPE` (7 steps) · `WEIGHT` · `LEADING` · `TRACK` · `NUMERIC` (tabular figures) · `SPACE` (typed union
  — an off-grid literal is a **compile error**, not a code review).
- **`text(role)` returns fontSize + lineHeight + fontWeight TOGETHER.** This is the load-bearing decision.
  A size cannot be chosen without its leading, so the bug below is *unreachable from the API*, not merely
  patched.
- `lines(role, n)` — derives a reserved height from the type (never hand-typed).
- `statRole(emphasis, density)` — the importance dial, monotonic by construction.

### The bug that was making everything look "uneven"

`@react-email`'s `<Text>` silently injects **`lineHeight: 24px` (absolute)** on any node that doesn't set
one. **~30 nodes didn't.** So the 32px stat value rendered in a 24px box (ratio **0.75** — that is the
clipping the operator screenshotted) while the 9px strip label rendered at ratio **2.67**. Nothing shared
a rhythm because ~30 elements were all pinned to the same absolute box regardless of their size. It was
never the grid.

### The importance dial was running BACKWARDS

`emphasis: "primary" | "muted"` existed on `StatItem` and was **inverted**: in the grid variant `primary`
rendered at **30px** while a plain cell rendered at **32px** — the important number was *smaller* than the
boring one, and only won on colour. Worse, the **stacked** render path passed no emphasis argument at all,
dropping the dial entirely.

**This is why pixels had to land before layout, and the ordering is not a preference.** The stacked path
fires exactly when a stats block sits in a narrow multi-column column — which is *precisely what the fence
system exists to produce*. Landing `finalizeDoc()` first would have silently killed the dial the moment it
started working, and it would have looked like the refactor broke it.

### Two things only found by LOOKING

1. Making `$209` bigger **immediately staggered the label row** (`$/SQ FT` sat lower than `BEDS`).
   Emphasis without a shared baseline just relocates the mess. The value row now reserves one line box at
   the row's tallest step, so labels share a baseline whatever the emphasis.
2. `hero-clipping.test.ts` pinned `min-height:34px` — a magic number encoding "two lines of an 11px
   kicker" — which broke the instant the kicker became a real step. Now derived via `lines()`.

Both were invisible to 2,600 passing tests. **Render the emails and look at them. `/dev-emails` exists for
exactly this.**

---

## Phase 3 — the layout root (NOT started). This is your job.

Checks: `email_design_system_one_exit_seam` · `one_catalog_seeds_get_recipe_keys` ·
`showcase_designs_buildable_as_options`. Source: `_AUDIT_AND_ROADMAP/2026-07-13-POSTMORTEM-built-under-the-design-system.md` §4.

**The finding:** `assembleAuthoredDoc` — the ONE function that applies the fences (`clampAccentBudget` →
`sortEntriesByZone` → `snapRowSpans`) — has **exactly one production caller**: `build-doc.ts:1410`, the AI
author path. **Eighteen other code paths hand-position their own docs.** The 7 listing builders emit
**100% `w:12`** — the flat stack of cards the layout research was bought to eliminate.

**Do not reinvent it. `assembleAuthoredDoc`'s tail IS the seam:** `deriveLayout(capBlocks(entries))`. And
its internal `Entry` type (`author-doc.ts:416-422`) — `{type, span, newRow, props, isStatic}` — **is already
the plan block.** Promote it and export it.

- `finalizeDoc(plan) → EmailDoc`. Builders return a **plan**, never a positioned doc. Capability removal,
  same move as the claim gate.
- **`lifecycle-chrome.ts` is already 95% a plan** — only `at()`/`push()` position. Delete `at()`; retype
  `middle`/`tail` from `EmailBlock[]` to the plan type (they are typed as positioned blocks *purely to
  smuggle a height* — `coming-soon.ts:504` writes `{x:0,y:0,w:12,h:3}` for no other reason).
- **Decide ONE height policy.** `deriveLayout` emits `h:1` always; `lifecycle-chrome` emits real 1–6.
- **The enforcement lever is free and already exists:** `row-grouping.ts:46` sends any unpositioned block
  to `y = 1_000_000` — it sinks below the footer in the paid renderer. A builder that skips `finalizeDoc`
  produces a visibly broken email. **Bypass isn't forbidden; it's useless.** That is what makes the
  capability removal safe.
- **Guard:** `lib/email/design-system-reachability.test.ts` — assert every recipe's doc is fence-conformant
  AND *actually went through the seam*. A flat `w:12` stack passes conformance trivially; the "went through
  the seam" half is the part that bites.

**Note: the 27 templates are NOT the layout problem.** They already carry ~14 real multi-column rows in
blessed spans (`{8,4}`, `{6,6}`, `{7,5}`). The builders are the problem.

**Also fix while you're in `StatsBlock`:** nothing. It's done. But `AUTHOR_TOOL`'s stats schema
(`author-doc.ts:305-320`) still has **no `emphasis` property**, so the AI author can never mark a number as
important. `emphasis` is recipe-only vocabulary today. Decide that deliberately.

---

## How to verify anything here

```
bun test lib/email lib/charts lib/deliverable components/email-lab   # 2,669 green
bunx tsc --noEmit                                                    # clean
bun test lib/email/blocks/scale.test.ts                              # the guard, 6/6
```

**And then LOOK.** `/dev-emails` (dev-only, unlinked, gitignored renders) shows all 41 — the 7 listing
emails as actually built from real 326 Shore Dr data, the 14 recipes, the 27 templates — rendered LIVE
from the code, never from the committed `.webp` screenshots.

Re-render the 7: `bun --env-file=<env-with-NO-anthropic-key> scripts/dev-render-listing-emails.mts --live`
(one address lookup, zero model calls — every narrator falls through to a deterministic note).

**Recapture the showcase tiles after ANY visual change:** `bun scripts/capture-seed-previews.mts`. They are
committed screenshots and `seed-previews.test.ts` only guards their EXISTENCE, not their freshness. A stale
tile is what produced the luxury-ring incident — the operator saw a broken email that had been fixed three
days earlier.

---

## The lesson, stated once

Two systems were researched, written down, and correct. Neither was executable — one was markdown, the
other described itself as *"advisory… the model MAY deviate."* **A rule that is not code is a suggestion,
and a suggestion is what every future session will ignore on the day it matters.** The fix was never more
research. It was making what already existed impossible to bypass.
