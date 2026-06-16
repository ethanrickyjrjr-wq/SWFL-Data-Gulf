# Data-driven `email-report.html` — repeat-block design

**Date:** 2026-06-16
**Status:** Design — approved; spec-review fixes folded in (BLOCKING-1/2/3 + CLARIFY)
**Owner:** session (Opus)

## Problem

The email overhaul (`9f976f4`, "full visual overhaul — 6 templates + style gallery")
rebuilt `templates/html/email/email-report.html` into a **static visual mockup**:
fully-designed dark layout with **hardcoded sample data** (`$412K`, a 5-row ZIP price
comparison, `3.8 mo` / `842` / `96.2%`, a Q3-Outlook paragraph, a fake trend sparkline)
and **no data-injection slot**.

But that template is the live transactional template: the registry maps
`report → email/email-report`, and `reportToEmailHtml` (`lib/email/activation/render.ts`)
renders it for the real per-ZIP activation email. The overhaul changed the template and
`token-defaults.ts` but did **not** touch `render.ts`, and ran only
`bun test lib/email/templates` (not `lib/email/activation`). Result:

- `reportToEmailHtml` builds its data into a `body` string and injects it via the
  `[ BODY TEXT ]` slot (`render-template.ts:34`). The new template has **no such slot**,
  so the grounded data — headline figures, key metrics, dossier reads, delta block,
  freshness token, CTA — is **silently dropped**. The live email would send the
  hardcoded mockup (identical fabricated numbers to every recipient, no token, no real CTA).
- This violates the no-fabrication / provenance rules and is caught by 4 failing tests in
  `lib/email/activation/render.test.ts` (`reportToEmailHtml`): freshness token, real delta
  block, no-change "Re-verified", CTA href.
- A 5th, **separate** failure (`lib/email/__tests__/components.test.ts` → `renderCallout >
  highlight uses the primary border`) is a stale color constant, not template-related
  (see §6).

These were masked in CI behind the `import.meta.dir` typecheck red until that was fixed
(`841776e`). Vercel is green (it doesn't run `bun test`); GitHub CI is red only on these 5.

## Goal

Make `email-report.html` **data-driven again while keeping the new dark design**, so the
real activation email renders grounded per-ZIP facts. Keep the design *in the HTML* (not
ported into TypeScript) so it stays editable. Turn the 5 failing tests green and add guards
that prevent a future "showcase" edit from silently breaking real sends.

## Non-goals (parked)

The mockup contains sections with **no real data source in a single-ZIP report**, and the
rules forbid fabricating them. These are explicitly out of scope and parked behind a `check`:

- **ZIP price-comparison bar chart** — needs multi-ZIP price assembly the report doesn't carry.
- **Q3 Outlook** speculation — tier-1 reporters state facts; only master speculates.
- **6-month trend sparkline** — needs a real per-ZIP time series the report doesn't carry.

A `check` (`email_report_multizip_revival`) tracks reviving the bar chart + sparkline once
genuine multi-ZIP comparison + trend data exists.

## Design — Route A: repeat-block

The chosen route keeps the design markup in `email-report.html` and teaches the renderer to
clone a marked row-block once per real data item.

### 1. Renderer — `lib/templates/render-html-template.ts`

Add **one optional param**: `repeats?: Record<string, TemplateTokens[]>`.

Before the existing global `{{token}}` pass, expand HTML-comment-delimited blocks:

```html
<!-- repeat:metrics -->
  <td …>{{M_VALUE}}<br>{{M_LABEL}}</td>
<!-- /repeat:metrics -->
```

Expansion rule, per block keyed `KEY`:

- Match `<!-- repeat:KEY -->(inner)<!-- /repeat:KEY -->` (non-greedy, dot-matches-newline).
- For each item in `repeats[KEY]` (default `[]`): clone `inner`, fill **that item's** tokens.
  Tokens **not** present on the item are left as `{{token}}` so the normal global pass fills
  them (a row may use globals like `{{FONT_FAMILY}}`, `{{BAR_TRACK}}`).
- Join the clones; replace the whole block (delimiters included) with the joined result.
- An empty/absent `repeats[KEY]` → the block renders to nothing (also serves as a clean
  "hide this section when there's no data").

Then run the existing global pass unchanged (unknown `{{tokens}}` → `""`, per current
contract). Single-level repeats only — **no nested repeats** (YAGNI; see Delta below).

**Backward-compatibility invariant:** when `repeats` is `undefined`, output is byte-for-byte
identical to today. The repeat regex matches only `<!-- repeat:… -->`, which no existing
template contains, so even a stray `repeats` arg is inert against the other 5 templates.

### 2. Email wrapper — `lib/email/templates/render-template.ts`

`renderEmailTemplate(slug, tokens?, data?)` threads two things through:

- `data.repeats` → passed to `renderHtmlTemplate`.
- A new `data.delta` → injected into a `[ DELTA ]` slot (same mechanism as the existing
  `[ CHART ]` / `[ BODY TEXT ]` slot replacement).

`[ BODY TEXT ]` / `[ CHART ]` stay for `shell-single` / `shell-two-col`. The post-render
`{{UPPER}}` assertion is unchanged.

### 3. Template — `templates/html/email/email-report.html`

Keep masthead + footer (token-driven: `{{LOGO_URL}}`, `{{COMPANY_NAME}}`, `{{ACCENT}}`,
`{{CONTACT_EMAIL}}`, `{{CONTACT_PHONE}}`, `{{DISCLAIMER}}`, `{{WEBSITE_URL}}`) **as-is**.
Replace the hardcoded middle with, top to bottom:

1. **Headline** — `{{PLACE}}` / `{{COUNTY}}` / ZIP `{{ZIP}}` (always present). The hero
   number is a **`<!-- repeat:hero -->` 0-or-1 block** = `{{HERO_VALUE}}` + `{{HERO_LABEL}}`
   from the **first** `report.metrics` item; when `report.metrics` is empty the block
   renders to nothing (no empty styled number). No fabricated YoY/blurb — real prose lives
   in the reads below.
2. **`[ DELTA ]`** slot — conditional "what changed" / "re-verified" block (built in `render.ts`).
3. **Key figures** — `<!-- repeat:metrics -->` card block; one card per `report.metrics`
   item, showing **`{{M_VALUE}}` (display) + `{{M_LABEL}}` only**. No per-card delta line —
   a base metric carries no change figure, so a "+8.4%" delta would be fabricated; movement
   is shown only in the delta block (§2), which has real `from`/`to` data.
4. **The reads** — `<!-- repeat:reads -->` prose block; one per `report.lines` item.
5. **Freshness token** line `{{FRESHNESS_TOKEN}}` · **CTA** button `href="{{CTA_URL}}"`.

Remove the parked sections (bars, outlook, sparkline) — keep their *styling vocabulary*
(card tint, accent numbers) reused by the cards above so the look is preserved.

### 4. `render.ts` — `lib/email/activation/render.ts`

Gets simpler. Instead of one monolithic light-themed `body`, `reportToEmailHtml`:

- Computes `tokens`: brand tokens (unchanged) + `PLACE`, `COUNTY`, `ZIP`,
  `FRESHNESS_TOKEN`, `CTA_URL`.
- Computes `repeats.hero` (`[{HERO_VALUE, HERO_LABEL}]` from `report.metrics[0]`, or `[]`
  when empty), `repeats.metrics` (from `report.metrics`, **value + label only**), and
  `repeats.reads` (from `report.lines`, markdown→email-safe HTML via `lineToHtml`). Reuse
  the existing `MAX_METRIC_ROWS` / `MAX_LINES` caps (`render.ts:20-21`) — do **not**
  redeclare them. No direction→color here; GOOD/BAD/NEUTRAL stays in the delta block only.
- Builds **only** the conditional `delta` block (the one piece with if/else + nesting),
  **dark-restyled** to sit on the dark shell (replace `#f6f8f7`/`#333` with an
  accent-tinted surface + light text), injected via `[ DELTA ]`.
- Ends with `ensureUnsubscribeToken(html)` — **unchanged**.

### 5. Unsubscribe invariant (email-only)

The unsubscribe link (`{{{RESEND_UNSUBSCRIBE_URL}}}`) is appended at the **bottom** by
`ensureUnsubscribeToken()` in the **email render path only** (`reportToEmailHtml`). It is
**not** baked into the template, so the style-gallery preview — which renders templates
directly, never via `reportToEmailHtml` — never shows it. This "unsubscribe only on real
emails" behavior is preserved and asserted by the existing test
(`emits the literal unsubscribe token`).

### 6. `renderCallout` color (5th test) — separate, small, navy-agnostic

`renderCallout("highlight")` borders with `COMPONENT_DEFAULTS.primary = SWFL_THEME.primary`
(live value `#0f1d24`). The test (`components.test.ts:13`) hardcodes
`const SWFL_PRIMARY = "#0F2035"` — stale, and the sole cause of this failure.

**Fix by single-source reference, not a new literal:** import `SWFL_THEME` into the test and
set `const SWFL_PRIMARY = SWFL_THEME.primary` (matches what `callout-box` actually emits and
honors the `_shared.ts` "never re-hardcode these hex values" rule). Re-hardcoding `#0f1d24`
would just rot again.

**This de-blocks the navy decision.** A by-reference test passes for *whatever*
`SWFL_THEME.primary` holds, so this work does **not** wait on a brand-navy ruling and
changes **no color value**. The value question (`#0f1d24` vs `#0F2035`) is a separate brand
decision, out of scope here, tracked as `check: email_brand_navy_canonical`.

**Not touched:** `_shared.ts:12` carries a stale `// #0F2035` *comment*, but it is
non-load-bearing (the code reads `SWFL_THEME.primary`). Left as-is per review — cosmetic only.

## Testing

- The 5 current failures go green: freshness token, delta-changes, re-verified, CTA, and
  callout (the last via the by-reference test fix in §6 — navy-agnostic).
- **New — repeat mechanism** (`render-html-template` unit): N items → N rows; 0 items →
  empty (covers the empty-metrics hero guard); per-row tokens filled, globals still filled
  by the outer pass; `repeats` absent → output unchanged (snapshot of an existing template).
- **New — no-fabrication guard** (`render.test.ts`) — **tripwire**: asserts a rendered
  report contains none of the distinctive mockup-only *prose* literals (`Median Price by
  ZIP`, `33971 · Lehigh`, `Q3 Outlook`, `Cautious optimism heading into summer`). It catches
  a re-paste of *these* sections, not arbitrary new hardcoded data (accepted limitation).
  Bare numbers like `$412K` are avoided — a real median could match them.
- Pre-push / CI: `bun test` runs **recursively** (already covers `lib/email/activation` — no
  new CI wiring needed); Gate 5 `catalog.test` is unaffected. Full `bun test lib/email` must pass.

## Risks

- **Renderer regex on existing templates** — mitigated: `repeats` is opt-in and the
  delimiter matches nothing in current templates; add the "output unchanged" snapshot test.
- **Delta block stays in code** — accepted tradeoff: it is conditional + nested, where
  if/else belongs in TS. Only this one component lives in `render.ts`; if more conditional
  sections appear later, revisit nested-repeat support then (not now).
- **Design drift between preview and email** — the preview renders the same template with
  sample tokens, so the look stays in sync; only the unsubscribe + grounded data differ
  (by design).

## Out of scope / follow-up checks

- `email_report_multizip_revival` — revive bar chart + sparkline with real multi-ZIP /
  time-series data.
- `email_brand_navy_canonical` — operator ruling: is `#0f1d24` (live) the canonical brand
  navy, or should `SWFL_THEME.primary` revert to `#0F2035`? Does **not** block this work
  (the §6 test fix is by-reference / navy-agnostic); only affects the brand value itself.
