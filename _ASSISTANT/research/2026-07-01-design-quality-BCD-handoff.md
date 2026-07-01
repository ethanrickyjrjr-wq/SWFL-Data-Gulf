# Handoff — Design-Quality Tasks B / C / D (2026-07-01)

Companion to `2026-07-01-ai-deliverable-design-quality-research.md` (the source research) and
`2026-07-01-social-safezone-meta-firstparty-verification.md` (Task **A**, already fresh-verified this
session). Task A was chosen as the first spec target; **B, C, D are handed off here to be finished the SAME
WAY.**

## The "same way" procedure (do this for each of B, C, D — in order)

1. **crawl4ai FRESH, first-party, in-session (RULE 0.4).** The source research doc's external facts were
   fetched by a *prior* session and, in at least one case (Task A safe zones), came from a **secondary blog
   rather than the vendor**. Do NOT trust the doc's citations — re-fetch the *authoritative* source live via
   `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe` (`AsyncWebCrawler`). "new for AI" = get the CURRENT
   spec, since these drift. Candidate authoritative URLs are listed per task below.
2. **Write a verification note** (`_ASSISTANT/research/2026-07-01-<task>-verification.md`) tiering each fact
   as *first-party verbatim* vs *secondary*, exactly like the Task A note. Numbers baked into code as hard
   constants must be first-party or explicitly labeled conservative-secondary.
3. **Reconcile against code ground-truth** — already scoped this session (RULE 0.5); anchors below. Do not
   re-scope from scratch; verify the anchors still hold, then build on them.
4. **Brainstorm approaches** (`superpowers:brainstorming`), pick one with the operator.
5. **Spec** → `docs/superpowers/specs/2026-07-01-<task>-design.md`; **plan** → `superpowers:writing-plans`.
6. Register the build first: `node scripts/new-build.mjs <slug> "<label>"` (RULE 3.5).

**Headline reframe that applies to ALL of B/C/D** (established this session, carry it forward): the source
doc's self-described "most actionable finding" (§1.3 — remove LLM footguns / expose closed tokens so the AI
can't emit off-grid/off-palette values) is **already true by architecture** here. The Email Lab AI and
Social AI *cannot* emit color/font/position — strip-mode schemas drop those keys; brand is overlaid after.
So none of B/C/D is about "constrain the prompt"; each is about **deterministic engine/gate work the AI
never touches.** The doc's "linter" idea survives only as the concrete gates in B (contrast) — not as a new
email-block design linter (which would validate dev output the model can't reach).

---

## Task B — WCAG contrast + palette-type selection  (priority: HIGH — greenfield, deterministic)

**What it is:** a contrast-ratio utility + sequential/qualitative/diverging palette selection, wired as a
hard gate across the chat + email chart surfaces. This is the real form of the doc's "linter."

**Code ground-truth (RULE 0.5, verified this session):**
- **No WCAG contrast-ratio math exists anywhere in the repo.** Grep for `wcag|contrast|luminance|
  relativeLuminance` → only two spots: `readableText(bg)` luma-threshold heuristic
  (`lib/email/templates/charts/chart-renderer.ts:97-102`, heat-row cells only) and the `dash`
  second-channel comment in `lib/charts/series.ts:5-7`. No 4.5:1 check, no palette validator, no
  accessible-palette generator. **Greenfield.**
- **No palette-type logic** (sequential/qualitative/diverging). Only a single 2-stop `blendHex` in the
  heat-row renderer.
- Colors today are per-surface hardcoded tokens: `lib/charts/series.ts` presets (`#3DC9C0`/`#5bc97a`/
  `#d4b370`, each with a `dash`), `HBarChart.tsx:175-181` tier colors, email builders take a single
  `accent` param (`lib/email/chart-image.ts:29`, `lib/charts/svg/ranked-delta.ts:39`),
  `SWFL_CHART_DEFAULTS` (`chart-defaults.ts:7`), brand `toChartTheme` (`lib/deliverable/brand-theme.ts:40`,
  "Phase 6 unfilled").
- One `ChartSpec` contract, two renderers (registry/recharts for chat; SVG→resvg PNG for email). A gate on
  the shared spec covers both surfaces.

**crawl4ai FRESH targets (first-party W3C — the doc used WebAIM as a proxy because W3C was Cloudflare-gated;
try the UndetectedAdapter):**
- `https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html` — SC 1.4.3 (4.5:1; 3:1 large text).
- `https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html` — SC 1.4.11 (3:1 non-text, the one
  that governs chart elements).
- `https://www.w3.org/TR/WCAG22/` — normative criterion text + the relative-luminance formula.
- `https://colorbrewer2.org/` — 508-safe sequential/qualitative/diverging palettes to seed from.
- `https://xdgov.github.io/data-design-standards/components/colors` — the 3-palette-type rule (re-fetch).

**Blast radius:** low. Adding a gate that auto-corrects or forces a palette swap could change how *existing*
charts render if current colors fail 3:1 — audit the locked presets against the new checker before shipping.

---

## Task C — chart-type-by-data-shape in the chat path  (priority: MED-HIGH — mostly REUSE)

**What it is:** wire the *existing* data-shape→chart-type ladder into the chat answer path and widen the
compose-chart LLM enum past `{bar, table}`.

**Code ground-truth (RULE 0.5, verified this session):**
- **The ladder ALREADY EXISTS** — `pickFramesForData` (`components/charts/registry/pick-frames.ts:74`), a
  priority ladder: time-series→`zhvi-area`, relationship(≥2 numeric)→`corridor-scatter`, composition(≥2
  pct ~1.0)→`composition`, single-vs-target→`z-gauge`, ranked-categories→`bar-table`. It feeds the
  **deliverable binder** (`lib/deliverable/bind-frame.ts:198`) but the **chat path does not call it.**
- Chat path (`lib/assistant/chart-for-question.ts` `buildChartForQuestion`) is hardcoded: ranked-delta
  route → keyword-intent router (4 fixture scopes) → generic `bar-table`. No shape matching.
- The user-directed LLM tool is capped: `compose-chart.ts:240` `chart_type` enum = `["bar","table"]` only.
- `DataShape` taxonomy at `chart-spec.ts:37`; 12 frames in `CHART_REGISTRY` (`registry.ts:35`), some
  `fixtureOnly`. Reshape guards already exist (`lib/email/reshape-chart-type.ts` `chartTypeFits`,
  `isTimeSeries`) — reuse them so we never slice a time series into categorical bars.
- **The work is wiring + widening, not new decision logic.** Respect FOCUS rule 4: never tell a user we
  can't chart something — always fall back to bar/table.

**crawl4ai FRESH targets** (lower drift risk — these are stable viz principles, but re-fetch for verbatim
decision rules, "new for AI" on LLM chart-type selection):
- `https://www.atlassian.com/data/charts/essential-chart-types-for-data-visualization` — the doc's source
  (re-fetch verbatim).
- A second authoritative decision guide for cross-check (e.g. Datawrapper's chart-type academy or the
  Financial Times Visual Vocabulary) — pick one, fetch live, reconcile any disagreement per RULE 4.

**Blast radius:** medium. Wiring the ladder into chat changes which chart type users see for existing
question patterns — verify against the current keyword-intent scopes so we don't regress the 4 tuned
fixtures.

---

## Task D — 8pt spacing + shared type scale + PDF convergence  (priority: LOW-MED — cosmetic refactor)

**What it is:** retune the spacing token to 8pt, build a shared type-scale token layer used by all three
render engines, and converge the divergent PDF engine.

**Code ground-truth (RULE 0.5, verified this session):**
- Spacing is the ONLY tokenized axis the AI touches: `paddingY` enum (`schema.ts:50`,
  `["none","sm","md","lg"]`) → hardcoded map `0/12/24/36px` vertical, **28px fixed horizontal**
  (`lib/email/blocks/styles.ts:30-35`). **12/24/36 are multiples of 12, NOT an 8pt grid.**
- **No font-size / weight / line-height prop exists in any block schema.** Type scale is hardcoded
  per-component per-engine (e.g. PDF hero 34, stats 22, body 13 — `email-doc-pdf.tsx:104,141,220`). Not
  authorable, not tokenized.
- **Three engines, two style implementations:** `EmailDocEmail` + `compileGrid` share `BlockRenderer` /
  `styles.ts` (identical tokens); `EmailDocPdf` (`lib/pdf/email-doc-pdf.tsx`) is a separate `@react-pdf`
  reimplementation that **ignores `paddingY`** (fixed 16/24), **collapses the 6 font families to 2**
  built-ins (`pdfFont()` → Times-Roman/Helvetica), and hardcodes its own scale + palette.

**crawl4ai FRESH targets** (re-fetch first-party for verbatim tokens):
- `https://m3.material.io/styles/typography/type-scale-tokens` — Major Second 1.125, base 14sp (first-party).
- `https://cieden.com/book/sub-atomic/spacing/spacing-best-practices` — 8pt grid + internal≤external.

**Blast radius: HIGH — flag loudly before touching.** Retuning `paddingY` 12/24/36 → 8pt (16/24/32) and/or
introducing a shared type scale **re-renders EVERY saved email** — existing user-built deliverables change
appearance. This is a behavior change with migration cost, not a free token tweak. Getting the PDF to honor
`paddingY` + full font set likewise changes existing PDF output. Decide migration strategy (version the
token map? grandfather old docs?) in the spec, not after.

---

## Cross-task ordering recommendation

A (in progress) → **B** (greenfield, high leverage, self-verifiable offline, no blast radius) → **C**
(reuse-heavy, medium value) → **D** (cosmetic, high blast radius — do last, or defer). Each is an
independent spec+plan; do not fold them into one monolithic plan.
