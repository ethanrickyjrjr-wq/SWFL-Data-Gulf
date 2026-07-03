# Email Lab examples-first Make This recipe flow

**Date:** 2026-07-03
**Status:** DESIGN — approved by operator escalation (see Rulings), built same session
**Check:** `email_lab_make_this_live_verify`
**Surface:** `EmailLabGridShell` ONLY (the cockpit's default canvas = the one email lab; anonymous `/email-lab/grid` inherits it as the same component)

## Problem

Operator escalation (07/03/2026, verbatim spirit): "Email Lab is a mess — we want to lead
with what they can DO." Concretely:

1. **Brand leads the rail and opens expanded** — takes a ton of room before the user sees
   anything they can do (`showBrand = useState(true)`, `EmailLabGridShell.tsx:256`).
2. **Examples are passive** — the showcase overlay's only action is "See the real thing ↗"
   (`ShowcaseOverlay.tsx:148-158`), which opens a static HTML capture of the email the user
   is ALREADY looking at, in another tab. It gives them nothing to DO with what they like.
3. **The gap:** we wrote the recipes, we built the examples — but a user who says "I like
   that, how do I get it?" has no button. The distance from *want* to *built* is the whole
   conversion problem.

## Rulings locked this session (operator, 07/03/2026)

- **Examples LEAD:** directly under the Build box, OPEN on first visit. Supersedes the
  same-day-morning "closed by default" ruling — that ruling was made when examples were
  passive show-and-tell; now they act.
- **Brand defaults CLOSED** and drops below the action sections. (Operator believed this
  was already changed; code said otherwise — drift now fixed.)
- **"See the real thing" dies** as a rendered link. The `liveHref` data stays in the
  registry (capture scripts + asset tests use it); the overlay just stops rendering it.
- **Grid builder is the crown jewel — never a deletion candidate.** The standalone lab
  PAGES retire per cockpit spec D4 (`2026-07-02-project-cockpit-design.md`); the shells
  live on as cockpit canvases. Therefore: **zero investment in `EmailLabShell`'s dying
  standalone page** — no examples, no reorder there. Memory pinned:
  `feedback_never-kill-email-lab-grid.md`.
- **No sign-in wall on making things** (standing rule: builds are free, send is the paywall).

## Research (RULE 0.4, crawl4ai 07/03/2026)

- NN/g "Prompt Suggestions" (Moran & Neusesser, 04/25/2025, nngroup.com): clickable
  **use-case prompt suggestions** are the established pattern for "show what the tool can
  do AND how to ask for it" — they reduce cognitive load, reduce interaction cost, and
  lead users to tasks they "considered impossible." The Make This button is exactly this,
  anchored to a full demonstration (their Manus example pairs suggestions with replays —
  our showcases are the replay).
- NN/g "Designing Empty States in Complex Applications" (Kaplan, 09/19/2021, nngroup.com):
  empty/first-run surfaces must provide **direct pathways to key tasks**, never dead ends.
  A link that reopens what you're already looking at is the textbook dead end.

## What we're building

### The flow (user's seat)

1. Lab opens: AI Build box on top, **Examples right under it, expanded**. Brand sits low,
   collapsed.
2. Click an example → the existing step-through overlay. Every buildable step now has one
   primary button: **"Make this →"** (accent-colored). The dead link is gone.
3. Click Make this → overlay closes, the recipe prompt lands in the Build box with its one
   blank — `[[your listing address]]` / `[[your city or ZIP]]` — **pre-selected** so typing
   replaces it. A teal hint under the box says exactly that.
4. Build the email → pre-flight:
   - Blank still unfilled → no build; the blank re-selects with an amber nudge. (No
     garbage builds from placeholder text.)
   - Brand gaps (the fields this example leans on: name / headshot / brokerage / business
     address) → one inline yes/no: **"Add my info"** (opens the Brand panel) or
     **"Build anyway"** (builds with generic placeholders).
5. The author engine builds the cookie-cutter version with real data + their brand → they
   customize on the grid like any other doc. Undo works.

### Data: recipes in the showcase registry

- `lib/showcase/recipe.ts` (new, pure): `BrandNeed` union (`agent_name | photo_url |
  brokerage | business_address` — keys verified against `BrandingBlock.tsx`),
  `ShowcaseRecipe { prompt, needs }`, `findPlaceholder(prompt)` (the `[[...]]` span),
  `brandGaps(needs, branding)`, `NEED_LABELS`. Unit-tested (`recipe.test.ts`).
- `lib/showcase/registry.ts`: `ShowcaseSlide` gains optional `recipe?: ShowcaseRecipe`.
  Recipes authored for every buildable email slide — listing-to-close all 5 steps
  (coming-soon / new-listing / comps / under-contract / sold), launch-blitz agent-intro,
  market-pulse ask + pulse email (same recipe: it IS the one-line ask). Social-surface
  slides (launch-blitz social pack, market-pulse social cut) and the proof-it-updates
  slide are exempt this pass — the social tool's wiring is a follow-up.
- Recipe prompts name real data the author engine actually fetches (live listings, county
  inventory, ZIP home-value trend) and carry exactly ONE `[[blank]]`.
- `registry.test.ts` extended: every email-surface slide has a recipe or sits on the
  explicit exempt list; every recipe has exactly one blank and non-empty `needs` drawn
  from the `BrandNeed` union.

### Components

- `ShowcaseOverlay.tsx`: optional `onUseRecipe` prop. With handler + slide has recipe →
  render "Make this →" + one-line microcopy. The `liveHref` anchor render is deleted
  (all callers: the lab accordion, `AskAiDock`, `BriefcasePanel` — the last two pass no
  handler and simply lose the dead link).
- `ExamplesAccordion.tsx`: `defaultOpen?: boolean` + `onUseRecipe?` threaded to the
  overlay (closing it before injecting). Doc comment updated to record the new ruling.
- `EmailLabGridShell.tsx`:
  - Rail order (email mode): **Build box → Examples (open) → Now editing → Start from a
    layout → Add a block → Brand (closed) → Photos → Media.**
  - `showBrand` defaults `false`.
  - `handleUseRecipe`: set prompt, remember the pending recipe, focus the textarea (new
    ref), select the `[[blank]]` span, show the teal hint.
  - `buildFromPanel()` wraps the Build button + ⌘↵: placeholder guard → brand-gap
    interstitial → `runAuthor`. `pickSeed` clears any pending recipe.
  - Gap interstitial: inline block under the Build buttons, listing the missing pieces in
    plain words, [Add my info] / [Build anyway].

### Explicitly out of scope

- `EmailLabShell` standalone page (dying per D4) — untouched, including its Brand-open
  default.
- Executing the 06-29 unified-panel spec (its own phased build).
- Whole-campaign one-click ("all 5 emails") — parked listing-lifecycle territory.
- Social-tool recipe wiring (`ProjectSocialClient`) — follow-up; slides exempt-listed.
- Any route changes. Nothing about `/email-lab*` routing moves in this build.

## Error handling

- Author engine miss (`applied:false`) / network throw → existing `aiMessage` paths,
  unchanged.
- Recipe with no blank (none today) → `findPlaceholder` returns null, injection just
  focuses the box; build-guard skips.
- Brand fetch failure → gaps computed off whatever `branding` holds (worst case: the
  yes/no shows once and "Build anyway" proceeds) — never blocks the build path.

## Testing

- `bun test lib/showcase` — recipe helpers (placeholder span math, gap logic, label
  coverage) + registry recipe coverage/validity + existing asset/system-noun guards.
- `bunx next build` (the Vercel-parity completion bar).
- Live-verify (operator-run, `email_lab_make_this_live_verify`): open project Email tab →
  Examples expanded under Build box → Make this on "Market Comps" → type a real address
  over the selected blank → Build → gap prompt if brand empty → cookie-cutter lands.
