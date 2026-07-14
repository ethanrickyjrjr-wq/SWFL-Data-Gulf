# Social design elevation — Round 2 (Claude Design look-book)

**Status:** approved — **Section A SUPERSEDED 07/14/2026 by the design root (see below).**
Sections B, C, and the new templates stand as written.

---

## AMENDMENT 07/14/2026 — the root landed first, and it moves three things

Before building Round 2, we audited the code this spec sits on and found social had the same
disease email had: **the house palette existed in four hand-typed copies, and one of them was
wrong.** The canvas accent defaulted to `#0ea5b7` — *a teal that is not our teal*. Every unbranded
post we ever rendered shipped in the wrong brand color. Root cause: `app/globals.css` was the brand
root, but a canvas has no cascade and resvg cannot parse CSS, so every render path re-typed the hex
by hand. There was nothing to import.

There is now: **`lib/brand/tokens.ts`** (the CSS palette, importable, drift-tested against the real
`globals.css`) and **`lib/social/design/system.ts`** (type + theme + contrast, resolved by role).
Round 2 builds on those. Three corrections follow.

**1. Section A's tokens mostly already existed — and the theming approach is replaced.**
`PANEL` (`#1c3340`) is `--gulf-slate-hi`. `ACCENT_DIM` (`#2a8c85`) is `--gulf-teal-dim`. The sand
surface (`#f0ede6`) is `--text-primary`. Design read our palette correctly; the spec just didn't know
it was already there. Only `PANEL_LIGHT` was genuinely new (now `--gulf-sand-panel`).

More importantly: **the spec's "simple per-field ternaries" in every template is the bypass pattern
this whole effort exists to kill.** Across 7 templates × N fields, a template can still pick a wrong
color, and nothing catches it. Replaced by role-resolved color — a template calls
`ink(role, theme, on)` / `accent(role, theme, on)` / `decor(theme)` and **cannot** get an unreadable
value back. No ternaries, no hex, no theme branch per field.

**2. `ACCENT_DIM` is only half-right, and the half that's wrong would have shipped.**
The spec calls `#2a8c85` "the tested default" for "numbers/chart-stroke color on the light theme."
Measured (WebAIM, reproduced exactly by our own `contrastRatio`):

- `#2a8c85` on sand `#f0ede6` = **3.46:1** → clears WCAG AA **large text (3:1)**, **fails normal
  text (4.5:1)**. So it is legal for a metric *number* and **illegal for a label or caption.**
- `#3dc9c0` on sand = **1.74:1** → fails even the large-text floor. **Decorative only** — a CTA fill
  or a chart stroke, never a word.
- The spec's "CTA fill always stays full accent regardless of theme" is **verified**: teal fill with
  `--text-on-accent` ink reads **9.15:1 on either canvas.**

`CONTRAST_FLOOR` binds the floor to the role, so nobody has to remember which case they're in.

**3. A bug the spec didn't know about — `min(W,H)` is costing landscape 42% of its type.**
Templates size type off `base = Math.min(W, H)`. Landscape (1200×630) is the only format where
height < width, so it alone sizes off 630 while square/portrait/story size off 1080. A `0.028` label
renders **30px on square and 18px on landscape** — roughly 7pt after a phone downscales the feed
image. Type now scales off **width** (these surfaces all fit-to-width; height never affects apparent
size). Landscape's real 630px height constraint is solved by dropping a role or shortening copy, with
the bounds test as the gate — not by shrinking type below the legibility floor.

**Consequence for Round 2's build:** the 5 existing templates still carry their own `base *
multiplier` scales. They are migrated to `type(role, format)` as Round 2 rebuilds them (it is
touching all 5 anyway for theme + chart). A raw hex under `lib/social/design/**` is now an ESLint
error. Conventions: `lib/social/CLAUDE.md`.

---

**Status:** approved, ready for planning
**Source:** `Socials Look-Book - Round 2.dc.html` (final; identical to the copy inside
`Socials design elevation brief.zip`), commissioned via the outbound brief in
`docs/handoff/2026-07-11-socials-design-elevation-brief.md` +
`docs/handoff/2026-07-11-socials-round2-direction.md`. Round 1 file kept for reference/diff
only — Round 2 supersedes it (it self-corrected the doubled-watermark and MLS-citation
mistakes Round 1 shipped in its own mockups).

## Scope

Round 2's look-book covers 8 templates. This spec covers 7 of them — **carousel-shell is
explicitly parked** (see "Out of scope").

In scope:
1. Bug-fix + theme guardrails applied to all 5 existing templates (`stat-hero`, `three-stat`,
   `headline-cta`, `listing-feature`, `tip-stack`)
2. Chart-as-hero elevation of `stat-hero` and `three-stat` (bake in a real chart by default)
3. Two new templates: `market-pulse`, `comparison`
4. Light/sand theme, selectable per post

## Current code (verified in-session, not from memory)

- `lib/social/design/types.ts` — `ChartElement` already exists (`spec: unknown`, `src?: string`,
  empty `src` = "still rendering"). No template uses it today.
- `lib/social/design/templates.ts` — `SocialTemplate.build(tokens, format)` is a pure sync
  function returning `SocialDesign.elements[]`. `TemplateTokens` today: primary, accent, text,
  logoUrl, fontDisplay, fontBody, surface, surfaceDark.
- `lib/social/design/chart-attach.ts` — `buildSocialChartAttach` (prompt → real chart PNG,
  coherence-gated) and `resolveSocialHero` (finds the canvas's headline stat) already exist,
  built for the manual "Add Chart" endpoint. Nothing wires them into template `build()` yet.
- `lib/social/design/author.ts` — `authorSocialPost` orchestrates: `template.build()` →
  `applyDesignPatch` (AI, text-only, cannot move/resize/add elements) → `attachListingPhoto`
  (code-set, post-build, real listing data only). This is the pattern chart-attach and
  code-set price/address follow.
- `lib/email/brand/branding-to-tokens.ts` — `brandingToTokens` maps a project's raw branding
  blob to UPPER tokens (shared by email and social). `SURFACE`/`SURFACE_DARK` already exist as
  sibling raw tokens (both present in `TemplateTokens` at once — caller picks which applies).
  This is the precedent the new theme tokens follow.
- `lib/social/render-social-image.ts` — the OTHER, unrelated social render path (brain-data
  cards, not the Konva canvas). Its watermark logic is already correct:
  `${WATERMARK_BRAND} • as of ${asOfDisplay}${sourcePart}`, where `sourcePart` is omitted
  unless a real external source applies. The canvas-template path has **no** citation element
  at all today, so Round 1's "doubled watermark" bug doesn't exist in our code — it was a
  mistake in Design's own mockup, self-corrected in Round 2. The fix here is additive (give
  the canvas templates a citation element), reusing this existing string logic rather than a
  second copy of it.

## A — Theme tokens

Add three sibling brand tokens, same shape as `SURFACE`/`SURFACE_DARK`:

- `PANEL` (dark theme's panel color, default `#1c3340`)
- `PANEL_LIGHT` (light theme's panel color, default `#e7e2d7`)
- `ACCENT_DIM` (numbers/chart-stroke color on the light theme — full teal `#3DC9C0` fails
  contrast on `#f0ede6` sand; `#2a8c85` is the tested default. CTA fill always stays full
  accent regardless of theme — only text/numbers/lines dim.)

`brandingToTokens` gains `set("panel_color", "PANEL")`, `set("panel_light_color", "PANEL_LIGHT")`,
`set("accent_dim_color", "ACCENT_DIM")`, defaulting when unset — mirrors the existing
`SURFACE`/`SURFACE_DARK` lines exactly. `tokensFromBranding` picks these up the same way.

`build(tokens, format, opts)` gains `opts.theme: "dark" | "light"`. Each template does simple
per-field ternaries where it currently hardcodes dark values, e.g.:
`background: opts.theme === "dark" ? tk.surfaceDark : tk.surface`,
`panelFill: opts.theme === "dark" ? tk.panel : tk.panelLight`,
`numberFill: opts.theme === "dark" ? tk.accent : tk.accentDim`.
No new resolution layer — same pattern as picking `surface` vs `surfaceDark` today, extended
to three more slots.

**Theme trigger:** a user-facing toggle in the social composer (next to the existing
format/template pickers), not AI-inferred. Default dark (matches current/house behavior).

## B — Chart wiring & availability sequencing

`build()` stays fully sync/pure — it never calls the network or the model.

**Offerability gate.** Extend today's `offerableTemplates({ hasListing })` with `hasSeries`
(does this scope have a monthly value trend in the lake — checked the same way `hasListing`
is checked today, before templating starts). `stat-hero`, `three-stat`, `market-pulse`, and
`comparison` are only offered when `hasSeries` is true (for `comparison`, both sides need
`hasSeries`). In practice this rarely excludes anything (ZHVI monthly coverage is broad across
SWFL). Because of this gate, **none of these four templates ever needs a "no chart" structural
layout** — matching exactly what the look-book drew: every stat-hero/three-stat example,
populated or empty, always has the chart; only the *stat* varies.

**Placement.** `build()` places the chart element at its designed position with `src: ""` —
the existing "still rendering" convention `ChartElement` already documents. No behavior change
to the sync contract.

**Attach step.** New `attachSocialChart(design, scope, metric)`, mirrors `attachListingPhoto`
exactly: derive the query code-side — `"monthly {metric} trend for {scope}"`, the *same* metric
the headline stat already reports, so chart/stat coherence holds by construction rather than
being checked after the fact — call the existing `buildSocialChartAttach` (using
`resolveSocialHero(design)` for the coherence hero), patch `{spec, src}` into the chart element
by id. Runs in `authorSocialPost` right after `applyDesignPatch`, same place `attachListingPhoto`
runs today.

**Two kinds of availability, resolved at different times:**
- **Scope-known** (hasSeries, hasListing, hasPrice, a second comparison scope) — known before
  the AI call. Drives `offerableTemplates` and is passed into the *first* `build()` call as
  `opts`.
- **Content-known** (tip-stack's tip count — the AI may write 1 tip or 4) — only known after
  the AI patch comes back. The menu-building call to `build()` uses the max slot count (4) so
  the model sees all available slots. After the patch arrives, count how many item slots
  actually got non-empty text, then re-call `build()` with that real count to get the
  look-book's reflowed geometry (lead tip fills the band when count is low), and reapply just
  those items' text to the new positions.

## C — The 4 named bugs

Two are AI-copy constraints (no geometry change):
- **ZIP-as-stat** — add a rule to `three-stat`'s menu entry in `authorSocialSystem`: "three
  metrics from ONE real series — never a ZIP code as a metric value."
- **Unsourced tip-stats** — add a rule to `tip-stack`'s menu entry: "tips are guidance, not
  statistics — reword any unsourced-sounding claim as advice" (with the look-book's own
  before/after example folded into the prompt).

Two are structural, both additive since the canvas path has no citation element today:
- **Missing/doubled watermark** — add a citation element to every elevated template. Extract
  the watermark string-formatting logic already correct in `render-social-image.ts`
  (`WATERMARK_BRAND` constant + conditional `sourcePart`, never citing the brand as its own
  source) into one shared function both render paths call — one authority, not a second copy.
- **Invented listing / MLS citation** — `listing-feature`'s address and price become **code-set
  from the real `featured` listing**, the same way `attachListingPhoto` already code-sets the
  photo, instead of an AI-authored text patch for those two fields. Removes the invention risk
  structurally. Citation always reads "SWFL Data Gulf," never "MLS" or a vendor name.

`listing-feature` price-absent state (status chip "Coming soon", CTA "Get notified", body
"Price on request") is scope-known (same listing-feed check that already produces
`featured`/`hasListing`) — flows through the Type-1 availability path from Section B, no AI or
post-patch reflow involved.

## New templates

**market-pulse** — architecturally a `stat-hero` variant: bigger, dominant full-bleed chart
(~0.33×H), same `hasSeries` gate, no new data shape or wiring beyond Section B.

**comparison** — genuinely new: needs two real scopes with real figures each.
- The AI may name the second scope from the user's prompt (e.g. "compare Fort Myers and
  Naples"), but the **code** resolves it through the same real scope/lake lookup used for side
  one. If the named place has no real data (fails the `hasSeries` check), the template
  collapses to `stat-hero` for side one only — matching the look-book's own "one side absent →
  collapses to stat-hero" rule. Never a guessed or invented second-side figure.

## Out of scope (this pass)

- **carousel-shell** — the look-book itself flags this as needing genuinely new capability
  (ordered multi-frame export — N images sharing one design system) that nothing in the render
  pipeline does today. Parking as an explicit follow-up, not silently dropped.

## Testing

Existing templates carry bounds tests (a layout's total stack height must fit within `H` at
the format's minimum dimension) — every elevated/new template needs the same, across all
offered formats and both themes. `chart-attach.test.ts` and `author.test.ts` need coverage for
the new availability flags (`hasSeries`, `hasPrice`, theme) and the tip-stack two-pass rebuild.
A live-verify pass (composer → each of the 7 templates × both themes × populated/empty states →
real render) belongs in `checks` per RULE 2, not as a plan checkbox.
