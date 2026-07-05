# Grid lab phone layout — Build/Preview tabs

**Date:** 2026-07-05
**Check:** `grid_lab_phone_live_verify` (operator-run, prod, on a real phone)
**Approved:** operator, 07/05/2026 ("Spec it all out and let's get it done correctly").
**Related:** `2026-07-05-agent-first-homepage-design.md` (the hero now funnels phone traffic into the lab), `2026-07-05-mobile-pill-address-leak-design.md` (this morning's phone fixes), locked ruling `feedback_never-kill-email-lab-grid` (EmailLabGridShell is the ONE lab surface — this build reshapes it responsively, never forks it).

## Problem

`components/email-lab/EmailLabGridShell.tsx:931` renders `grid h-dvh grid-cols-[1fr_380px]` unconditionally — a desktop split-pane with zero responsive variants. On a ~390px phone the AI panel takes its fixed 380px, the canvas gets a ~10px sliver, panel rows clip off-screen, and the top bar collides (operator's 07/05/2026 3:55 PM prod screenshot). Until today nothing sent phones here; the agent-first hero now sends every mobile visitor here as the PRIMARY conversion path.

## Research findings — what builders need to know (crawl4ai, 07/05/2026, all fetched live)

These govern every decision below and future phone work on this surface:

1. **A phone layout is its own design, never a shrunken desktop.** Google web.dev Learn Design, "User interface patterns": "A design viewed on a small screen shouldn't look like a shrunk-down version of a large-screen layout… You might need to apply very different CSS to the same HTML codebase." NN/g "Mobile First Is NOT Mobile Only" (Budiu & Pernice — task study across 6 sites): porting a UI unchanged between platforms measurably degrades the destination platform (navigation use fell to 54% on ported desktop UIs vs 77% on the native-fit platform). Consequence: desktop split-pane stays exactly as-is; phone gets its own layout.
2. **Single column is the DEFAULT; multi-pane is applied above a breakpoint.** web.dev "Macro layouts": mark up one sensible column flow, then `@media (min-width:…)` adds the grid. Tailwind's responsive system (tailwindcss.com/docs/responsive-design) is mobile-first: unprefixed = all sizes, `lg:` etc. layer up. The shell currently does the inverse — that inversion IS the bug class. Consequence: root becomes phone-first with `lg:` restoring the split.
3. **Two panes that can't coexist → ONE visible panel, switched by labeled tabs.** NN/g "Tabs, Used Right" (Sunwall, 08/02/2024): tabs = selectively view a single panel; short labels; unmistakable selected indicator. web.dev "UI patterns": never hide primary functions behind unlabeled icons ("mystery meat navigation — users won't know what's in there until they bite into it"); progressive disclosure is a last resort. Consequence: a visible, text-labeled two-tab bar, not a hamburger, not an icon-only FAB.
4. **Touch is a different input, not a smaller screen.** web.dev "Interaction": detect with `pointer: coarse`, don't infer from width; enlarge targets for coarse pointers; Fitts's law — larger targets help every input. Industry floor is ~44–48px hit areas. Consequence: 48px-tall tab buttons; don't shrink desktop controls "to fit".
5. **Safe areas:** web.dev "Screen configurations": bottom-anchored controls pad with `env(safe-area-inset-bottom)` (non-zero only under `viewport-fit=cover`; harmless 0 otherwise). Our `app/layout.tsx` viewport deliberately does NOT set `viewport-fit=cover` (pinch-zoom + ResetZoomOnRouteChange contract) — keep it; add the env() padding defensively so the bar is ready if cover ever lands.
6. **Overflowing control rows → horizontal scroll-snap with a partially visible last item, not wrapping walls or hiding.** web.dev "UI patterns" (carousel/overflow pattern): `overflow-x: auto` + `scroll-snap-type: inline mandatory`, and "crucially, an item doesn't take up the full width — if it did, there would be no indication that more content is available."
7. **Don't reach for media queries when intrinsic layout works.** web.dev "Macro layouts": `repeat(auto-fill, minmax(…))` grids and flex-wrap self-adapt without breakpoints. Use for card grids inside the panel; the pane-vs-tabs decision genuinely needs the breakpoint.

## What we're building

### Layout (the one root change)

- Root (`EmailLabGridShell.tsx:931`): `flex h-dvh flex-col overflow-hidden … lg:grid lg:grid-cols-[1fr_380px]`. Breakpoint is **`lg` (1024px), not `md` (768px)**: at 768px the canvas next to the 380px panel would get ~390px — the shrunk-down anti-pattern (finding 1); tablet portrait reads better as the tabbed layout. Desktop ≥1024px is byte-identical to today.
- `<main>` (canvas pane) and `<aside>` (AI assistant pane): below `lg`, exactly ONE is visible, driven by phone-tab state; at `lg`+ both render as today (`hidden`/`flex` swapped via `lg:` variants — CSS-only visibility, no unmounting, so state in either pane survives tab flips).
- **Bottom tab bar** (`lg:hidden`, `shrink-0`, after the panes): two text-labeled buttons — **Build** (✦) and **Preview** — 48px tall, full-width halves, selected state = teal fill matching the existing mode-toggle idiom, `aria-selected` + `role="tab"`, `pb-[env(safe-area-inset-bottom)]` on the bar (finding 3, 4, 5).

### Phone-tab state (small pure module so the contract is pinned by tests)

- `lib/email/lab/phone-tabs.ts`: `type PhoneTab = "build" | "preview"`; `initialPhoneTab(opts: { hasRecipe: boolean }): PhoneTab` → `"build"` when a recipe rides in (hero/pill "Make this" arrival — the visitor's job is to fire the build), else `"preview"` (map ZIP click and `/email-lab?zip=` promise "opens prebuilt" — show the email).
- Shell holds `const [phoneTab, setPhoneTab] = useState(() => initialPhoneTab({ hasRecipe: initialRecipe != null }))`.
- **Auto-flip on build success:** in `runAuthor`, at the existing success branch (after `commit(normalized)` / `setAiStatus(…)`), call `setPhoneTab("preview")` — the phone user SEES what got built, the tab bar is right there to return. On failure/miss (`applied === false` or catch) stay on Build so the error message is visible. Desktop unaffected (state drives nothing at `lg`+).

### Pane furniture on phone

- Top bar: keep `headerSlot`, mode toggle, undo/redo, Download PDF / Copy HTML — but the bar gets `overflow-x-auto` with `shrink-0` children below `lg` (finding 6) so nothing clips or wraps. The "Auto-reflow on / click to edit" hint span is already `hidden lg:inline-flex` — unchanged.
- Block-width picker row (the "Selected block width" strip): `hidden lg:flex` — it exists for precision mouse editing; on phone it ate a third of the screen in the operator's screenshot. Block tap-select and per-block AI stay available.
- Assistant panel content is untouched — at full phone width its rows (campaign cards, Build box, chart-type chips, "Build the email" + "Fill the blank") fit; the clipping in the screenshot was the fixed-380px column, not the rows. If the chart-type chip row ever exceeds width, it wraps today and may adopt the scroll-snap overflow pattern later (finding 6) — not required now.
- Canvas on phone is view + tap-select + per-block AI. Corner-drag resize with a coarse pointer is explicitly OUT of scope for this build (finding 4: don't shrink a mouse interaction and call it touch support) — if analytics ever show phone editing demand, that's its own design.
- **Known V1 trade-off (verified in the 390px render):** the email canvas is email-standard ~600px wide, so phone Preview pans horizontally (pinch-zoom stays enabled per the layout viewport contract). Readable and usable; a fit-to-width scale transform is a candidate follow-up, not part of this build.

## Verification note for future builders (learned the hard way, 07/05/2026)

A long-running `next dev` server serves **stale Tailwind v4 CSS**: utility classes added after it started (even standard ones like `lg:flex`) silently produce NO styles while the JS hot-reloads fine — the page renders the base branch at every width and looks like "responsive variants are broken." Verify responsive work against `bunx next build` + `bunx next start -p <port>`, never against a dev server another session started. A same-origin iframe at the target width is a reliable phone-viewport probe when the browser window can't be resized.

### Reach

One shell = every consumer fixed at once: `/email-lab/grid` (anonymous + `?recipe=`/`?zip=`/`?addr=`), `/email-lab?zip=`, and the project cockpit's email tab. No consumer-side changes needed; `EmailLabGridClient` and the cockpit pass props already.

## Out of scope

- No fork of the shell, no standalone "mobile lab" page (locked ruling).
- No touch drag/resize on the canvas; no phone social-composer redesign (SocialComposer renders in the Preview pane as-is; if unusable it gets its own pass).
- No `viewport-fit=cover` flip in `app/layout.tsx`.
- No phone audit of other surfaces (project workspace, /r reports) — follow-up, noted in `docs/superpowers/plans/2026-07-05-mobile-pill-follow-up.md`.

## Success criteria

- `bun test lib/email/lab/phone-tabs.test.ts` green (initial-tab rule + exported types); full `bunx next build` green.
- Desktop ≥1024px: rendered output functionally identical to today (split-pane, all controls where they were).
- Phone (<1024px): exactly one pane visible; labeled Build/Preview bar with 48px targets; hero arrival (recipe) lands on Build with the prompt pre-filled; map/`?zip=` arrival lands on Preview showing the seed email; firing "Build the email" flips to Preview on success, stays on Build with the message on a miss; top bar scrolls horizontally instead of clipping; width-picker row absent.
- Operator re-runs the 16447 Rainbow Meadows Court flow on a real phone end-to-end (hero → Build tab pre-filled → Build the email → Preview shows the authored email with the ZIP 33908 figures + comps) and closes `grid_lab_phone_live_verify`.
