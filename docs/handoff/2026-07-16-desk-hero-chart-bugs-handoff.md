# Desk Hero chart bugs — handoff to Fable 5 (07/16/2026)

## What the operator said, verbatim

First message, with 4 screenshots attached (`Screenshot 2026-07-15 220950.png`, `221000.png`,
`221023.png`, `221427.png` — Cape Coral/Fort Myers Home Price Trend chart on `/desk`, at the
10yr / 5yr / 2yr / 1yr `FIT OVER` windows):

> CHART ALL FUCKED UP STILL. ZOOMS IN OR OUT OR LINE DOESN'T SHOW UP, BALL NOT ON LINE ALWAYS.
> NUMBER NEVER CHANGES IF WHEN YOU CLICK ON PILL FOR ANY OF THEM. IT'S ALWAYS TOTAL.
> FIX IT AND WRTE HANDOFF FOR FABLE 5 FOR WHAT YOU CAN'T FIGURE OUT

Mid-session, after ~40 minutes of me chasing three dead-end theories in the vendor animation
code:

> what ar you doing???????? [attached `Screenshot 2026-07-16 103825.png` — the SAME wave bug,
> live, on the 5yr window, worse than what I'd been testing]
>
> write a fucking handoff to fable 5

Then:

> i want everything i said and everything you did already in it

This doc is that handoff. It contains the full verbatim report above, the full path I took
(including the parts that were wrong), what I actually fixed and verified, and what is still
broken and unexplained.

## Where this lives

Component: `app/desk/_components/DeskHero.tsx` — the "Home Price Trend" chart on `/desk`.
Renders through a forked, in-repo copy of a vendor chart library at
`components/charts/vendor/bklit/*` (NOT a node_modules package — it's checked into the repo,
so it's fair game to edit). The specific chain for the zoomed ("FIT OVER" window picked) view is
`DeskHero.tsx` → `LineChart` (`line-chart.tsx`) → `TimeSeriesChartCore` (`time-series-chart-shell.tsx`)
→ `Line` (`line.tsx`).

## Root cause #1 — CONFIRMED AND FIXED: wrong curve interpolation (`curveNatural` → `curveMonotoneX`)

This is the "line doesn't show up" / the big V-shaped and dome-shaped scallops in the 1yr/2yr
screenshots — the most visually alarming bug.

**What I verified, in order:**

1. Loaded `/desk` in a live Chrome tab against a local `bun run dev` server and reproduced the
   exact scallop pattern from the screenshots on the first try (2yr window, Cape Coral).
2. Pulled the real `renderData` feeding the chart straight out of the React fiber tree (walked
   up from the `<path>` DOM node via `__reactFiber$...`, found the `ChartProvider` context
   node, read `.memoizedProps.value.renderData`). **The data itself is completely correct**: 24
   clean, chronologically-ordered monthly points, real values ($385k → $380k → $385k → $375k →
   $395k → ... → $350k → $365.5k → $369.9k), no duplicates, no corruption, no NaNs.
3. Computed the *expected* screen (x, y) for every one of those 24 points using the chart's own
   `xScale`/`yScale` (also pulled from the fiber context) and diffed against the actual rendered
   `<path>`'s `d` attribute. **The knot points matched exactly** — the curve passes through
   every real data point correctly.
4. So the corruption is strictly *between* points. `line.tsx` was rendering with visx's
   `curveNatural` (a cubic spline) as the **default** `curve` prop, and `curveNatural` is
   documented (by visx/d3) to overshoot the local min/max between two points when the sequence
   direction flips sharply — exactly what monthly closed-sale medians do (small sample size,
   real month-to-month zigzags). Fewer points (the 1yr/2yr windows) means bigger relative gaps
   between knots, so the overshoot is huge and visually reads as "the line disappeared" or "a
   wave that isn't the data." The 10yr window has far more, denser points, so the same bug is
   there but the overshoot per segment is tiny and just reads as normal noise — which is why
   that view "looked fine" in some of my tests and is probably why it wasn't as obviously broken
   in the operator's screenshots either, relative to the 1yr/2yr ones.
5. **Smoking gun that this was always a bug, not a deliberate choice:** the sibling `Area`
   component in the same vendor folder (`components/charts/vendor/bklit/area.tsx:136`) already
   defaults to `curveMonotoneX` — the overshoot-safe interpolation. `Line` was simply the
   inconsistent one. The rest of the codebase's other chart (`MetroAreaChart` /
   `components/charts/ZHVIAreaChart.tsx`, recharts-based) also already uses `type="monotone"`
   everywhere. `curveNatural` on `Line` was an orphaned default that didn't match its own
   neighbor.

**The fix** (`components/charts/vendor/bklit/line.tsx`):

```diff
-import { curveNatural } from "@visx/curve";
+import { curveMonotoneX } from "@visx/curve";
...
-  curve = curveNatural,
+  curve = curveMonotoneX,
```

**Verification after the fix:** re-pulled the real data + scale from the fiber tree again,
walked the *actual rendered path* with `path.getPointAtLength()` at the midpoint of all 23
segments between the 24 real Cape Coral 2yr points, and compared each midpoint's y against the
segment's own two endpoint y-values. **Zero segments overshoot their own local bounds** (was
previously overshooting by well over 100px on multiple segments — e.g. dipping to y≈225 between
two points both sitting around y≈145–150). This is a hard measurement, not a screenshot
eyeball — the fix is real and confirmed.

This is a **shared vendor-fork default**, not a DeskHero-local prop. Blast radius: every
consumer of `<Line>` from this fork (grep found `DeskHero.tsx`, `line-chart.tsx`,
`composed-chart.tsx`, `email-svg.tsx`). I did not audit every other chart that uses it — worth a
quick visual pass by Fable 5, but `curveMonotoneX` is strictly the safer choice for real,
non-smooth-by-construction data and matches the project's existing convention everywhere else,
so I don't expect it to make anything else worse.

## Root cause #2 — CONFIRMED AND FIXED, but unrelated to the chart itself: SSR/CSR hydration mismatch on every single `/desk` load

Found by accident while trying to time-box when the chart corruption appeared. Console showed
this on **every one of ~10 fresh page loads I tested, 100% reproducible**:

```
Error: Hydration failed because the server rendered HTML didn't match the client...
  ChartStatFlow (components/charts/vendor/bklit/chart-stat-flow.tsx:101)
  ...
+ <number-flow-react ... data={{...valueAsString:"$369,900",value:369900}}>
- $369,900
```

Root cause: `useNumberFlowElementReady()` initialized its `ready` state with
`typeof customElements !== "undefined" && Boolean(customElements.get("number-flow-react"))`.
On the server this is always `false` (no DOM). On the client, `@number-flow/react`'s custom
element can already be registered (a module-load side effect) by the time this hook's
initializer runs — so the client's *first* render (which must byte-for-byte match the server's
HTML for hydration to succeed) sometimes disagrees with the server, and React throws away and
rebuilds the whole page segment client-side.

**I initially believed this was the root cause of the chart corruption too** (a full-page
client remount mid-interaction would explain lost pill selections, stale state, garbled
animation refs — a very tidy unifying theory). **I tested that belief directly and it's wrong**:
fixed this hydration bug in isolation, reproduced the wave bug again on a guaranteed-fresh page
load with zero hydration errors in the console, and the wave was still there, unchanged. The two
bugs are independent. I'm leaving the hydration fix in because it's real, correct, and
100%-reproducible-fixed (zero hydration errors across every fresh load after the fix, vs. every
single load before it) — but it did not do what I originally hoped.

**The fix** (`components/charts/vendor/bklit/chart-stat-flow.tsx`):

```diff
-  const [ready, setReady] = useState(
-    () => typeof customElements !== "undefined" && Boolean(customElements.get("number-flow-react")),
-  );
+  const [ready, setReady] = useState(false);

   useEffect(() => {
-    if (ready) {
-      return;
-    }
+    if (typeof customElements !== "undefined" && customElements.get("number-flow-react")) {
+      setReady(true);
+      return;
+    }
     let cancelled = false;
     customElements.whenDefined("number-flow-react").then(() => {
       if (!cancelled) setReady(true);
     });
     return () => { cancelled = true; };
-  }, [ready]);
+  }, []);
```

Always starts `false` on both server and client (matching SSR exactly), and only checks the
real registry state inside the effect, which runs after hydration commits — so it's a normal
post-hydration state update, never a mismatch.

## Dead ends I chased first — recorded so nobody re-walks them

I want these in here because the operator asked for "everything I did," not just the win.

1. **Theory: an animation-morph effect gets interrupted by unrelated re-renders and freezes
   mid-interpolation.** `use-animated-series-path.ts`'s effect has `xScale`/`yScale`/
   `renderData`/`targetPoints` as direct dependencies, and its cleanup calls `control.stop()`
   on every re-run; if the effect re-runs before the animation naturally completes, the
   `onComplete` handler that would clear `animatedPoints` never fires, and I reasoned a stale
   partial interpolation could render forever. I traced this in real depth (down to whether
   hover-driven `tooltipData` state changes propagate a fresh `children`/`lines`/`xScale`
   reference up through the tree) and could not actually confirm the trigger. **I tested the
   theory directly**: set `animate={false}` on DeskHero's zoomed `<Line>` (bypasses this whole
   code path). The wave bug **did not go away** — in fact it appeared with zero interaction,
   just from waiting 2 seconds after a clean click. Theory rejected by direct experiment.
2. **Theory: the Y-domain tween (`useAnimatedYDomains`) hadn't settled yet, so the "clean"
   moment right after a click was really a compressed/near-zero-variance mid-tween state.**
   Read `use-animated-y-domains.ts` closely — on a normal mount or a target-domain change while
   `chartPhase === "ready"` (the only case that applies here, since `tweenYDomainOnXDomainChange`
   defaults `false` and DeskHero never passes it), the domain **snaps** instantly, it doesn't
   tween. Theory doesn't fit the code as written; abandoned before spending an experiment on it.
3. **Theory: the hydration-mismatch remount (root cause #2 above) is THE cause of the chart
   corruption, not just an adjacent bug.** This was my strongest, most unifying theory and I
   was fairly confident in it. Directly falsified by experiment (see root cause #2 write-up
   above) — fixed it in isolation, bug persisted.

The actual root cause (curveNatural overshoot, root cause #1) was hiding in plain sight the
whole time — my own first instinct on seeing the screenshots — but I talked myself out of it
early on a plausible-sounding but ultimately wrong reason (that a spline passes through its own
knots, so a hover dot landing off the line must mean the drawn path isn't the real data — true
in general, but I never actually confirmed the hover dot was landing at a real knot rather than
between two of them, and I never got back to directly testing the ball-off-line claim after the
curve fix — see open item below). Lesson for next time: test the cheap, obvious hypothesis
empirically before reasoning it away.

## What is CONFIRMED FIXED (verified in a live browser against local `bun run dev`, not just read)

- The scallop/wave/V-shaped overshoot pattern in the 1yr/2yr (and by the same mechanism, any
  other) FIT OVER windows. Measured zero overshoot post-fix, was measurably overshooting
  pre-fix.
- The hydration-mismatch-on-every-load bug (separate issue, also real, also fixed and verified).

## What is STILL OPEN — for Fable 5

**1. First click on a FIT OVER window pill after a fresh page load doesn't zoom the chart.**
Reproduced repeatedly, even on a guaranteed-fresh, cache-busted, hydration-clean page load: the
pill's own style updates to "selected" immediately, but the chart stays on the unzoomed `Trend`
view. Clicking `Trend` and then the target pill again (a second, genuine state transition) does
zoom correctly. I did not root-cause this — ran out of runway. Starting point: `DeskHero.tsx`'s
`win`/`setWin` state and the `picked`/`zoomDomain` memos (~line 120–191). My best guess, unverified: possibly
something about the very first click landing during React's initial commit/effect-flush window
gets its state update coalesced or dropped, but I have no evidence for this beyond the repro
being consistent. Worth checking with React DevTools' Profiler or by logging `win` inside
the `onClick` vs. what `picked` resolves to on the next render.

**2. "BALL NOT ON LINE ALWAYS" (the hover/tooltip dot not sitting on the drawn line — see
`Screenshot 2026-07-15 221000.png`).** I did not re-test this specifically after the curve fix.
It's plausible the curveNatural overshoot WAS the entire cause of this too (the dot is likely
positioned via a bisector-nearest-data-point lookup while the line itself was drawn wildly off
from the true value between points) — but I have not confirmed it. **This should be the first
thing Fable 5 checks** — hover the chart at a few points across a couple of FIT OVER windows and
look for dot/line divergence. Note there was also a separate, real fix landed 46 hours before
this session by another agent: commit `b4d9d0b8` "fix(charts): tooltip dot ignored
discreteInteraction, lagged behind noisy series" — touches this exact file
(`app/desk/_components/DeskHero.tsx`) and this exact symptom class. Read that commit first;
it's possible this complaint is *already* fixed and the operator's screenshots simply predate
it, or it's a second bug in the same area.

**3. "NUMBER NEVER CHANGES IF WHEN YOU CLICK ON PILL FOR ANY OF THEM. IT'S ALWAYS TOTAL."**
I could not identify a control on this page literally labeled "Total," and in my own testing the
CITY pills (Cape Coral/Fort Myers/Naples) correctly changed the headline number
($369,900 → $339,000). My best-guess reading, **unconfirmed — do not act on this without
checking with the operator or watching them click through it live**: the operator means the big
headline `$` number (`active.latest.value` in `DeskHero.tsx`, e.g. "$369,900") staying **fixed**
no matter which `FIT OVER` window pill (Trend/Full/10yr/5yr/2yr/1yr/Without-the-run-up) is
selected. That IS the current code's intent per its own comments (`DeskHero.tsx` ~line 104-110):
the headline is always "the latest reading," and only the `[INFERENCE]` claim text below it
(the $/month pace, e.g. "$1,951 a month" vs "$1,201 a month") is supposed to change per window.
Mechanically that claim text DOES change correctly across windows in my testing. So either:
(a) this is a UX-expectations mismatch, not a bug — the operator expects the number to reflect
the selected window and it currently doesn't by design, or (b) the operator means a completely
different pill/number I haven't found, possibly outside `/desk` entirely. **Don't guess further
on this one — screen-share or ask which literal control they mean before touching the code.**

**4. The operator's `Screenshot 2026-07-16 103825.png`** (sent mid-session, after I'd already
landed both fixes above but the operator's own browser was still showing the bug) shows the
scallop pattern on the **5yr** window, with much larger amplitude than anything I reproduced
(spikes to $450k against a ~$300–400k real range). I had not yet re-tested the 5yr window
specifically before the fix landed, and I don't know whether that screenshot was taken against
a stale/cached build, a different session, or genuinely after my fix was live. **First thing to
do: pull `/desk`, click 2yr → 5yr, and confirm the curve fix actually holds there too** — my own
verification was only run against the 2yr window's 24 points; 5yr will have ~60 points and I
have not separately measured overshoot on that window.

## How to verify from scratch

```
bun run dev
# open /desk in a browser
# click "Trend" then "2 yr" (or 5 yr / 1 yr / 10 yr) under FIT OVER
```

To measure overshoot directly instead of eyeballing it, in the browser console on `/desk`:
```js
const path = document.querySelector('path[stroke^="url(#line-gradient"]');
// walk path[Object.getOwnPropertyNames(path).find(k=>k.includes('eactFiber'))] up to the
// ChartProvider fiber, read .memoizedProps.value.{renderData,xScale,yScale,xAccessor},
// then for each pair of consecutive points sample path.getPointAtLength() at the midpoint x
// (binary search over path.getTotalLength()) and check it stays within [min(y1,y2), max(y1,y2)].
```
(Full script is in this session's tool-call history if needed — ask to have it re-pasted rather
than rewriting from scratch.)

## Files changed this session

- `components/charts/vendor/bklit/line.tsx` — curve default fix (root cause #1)
- `components/charts/vendor/bklit/chart-stat-flow.tsx` — hydration fix (root cause #2)
- Both are **uncommitted** in the working tree as of this handoff. Not pushed. Operator should
  review and decide whether to commit — these are shared vendor-fork files (blast radius beyond
  just DeskHero), which per this repo's CLAUDE.md RULE 1 is not an autonomous-push case.

## Dev server

I started `bun run dev` in the background for this session (logged to
`/tmp/desk-dev-server.log` inside the Bash tool's environment, not a repo path). It may still be
running; Fable 5 should check for a stray process on port 3000 before starting a new one.
