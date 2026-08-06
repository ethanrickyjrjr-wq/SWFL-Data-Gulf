# ⛔ TYPOGRAPHY IS DECIDED. DO NOT PICK A FONT, A SIZE, OR A CLIPPING RULE.

**The two roots, both COMMITTED and readable — `docs/design-reference/` was UN-GITIGNORED
08/06/2026 for exactly this reason:**

- `app/_design/05-color-and-type.md` — **Display: Inter Display** (or General Sans / Söhne).
  **Body: Inter**, weight 400 body / 500 emphasis. **Mono: JetBrains Mono** (or IBM Plex
  Mono), weight 500. **Numbers: `font-variant-numeric: tabular-nums`, always** — its own
  words: *"so columns of numbers align."*
- `docs/design-reference/colors_and_type.css` — the executable token file. `--font-display`
  and `--font-body` = Inter, `--font-mono` = JetBrains Mono, plus the scale (hero clamp
  3–5rem / h1 2.75 / h2 1.75 / metric 2.25 / body 1 / small+label 0.875 / caption 0.75rem),
  line-heights 1.08 display · 1.55 body · 1.4 caption, tracking −0.02em display · +0.06em
  label, and the 8px tokens 4/8/12/16/24/32/48/64/96. Stated direction: *"sharp
  financial-adjacent display type, tabular figures, borders not shadows."* Take the
  direction, re-implement in our stack — its README says do not ship it as-is.

**Executable form for email:** `lib/email/blocks/scale.ts` (`text(role)` — seven roles, size +
weight + leading TOGETHER) and `lib/brand/fonts.ts` (the six brand families, every engine).
A raw `fontSize`/`fontWeight`/`lineHeight`/`fontFamily` fails `blocks/type-conformance.test.ts`.

## THREE RULES THAT WERE WRITTEN DOWN AND OBEYED NOWHERE — all three fixed 08/06/2026

1. **NUMBERS CARRY TABULAR FIGURES.** Use `TABULAR` from `lib/charts/format.ts` on every SVG
   text node that renders a number. Not one of the 15 SVG chart builders did, so a stat row
   showed aligned figures while the chart directly beneath it showed proportional ones — same
   email, same numbers. Labels stay proportional; only NUMBERS align.
2. **NEVER FIT TEXT BY CHARACTER COUNT.** Use `fitText` / `labelGutterFor` / `measureText`
   from `lib/brand/text-metrics.ts`, which read real advance widths out of the bundled TTFs.
   A character budget is blind on two axes at once — measured off our own faces 08/06/2026:
   the same 22 characters span **1.14x across our six faces** and **3.08x inside Montserrat
   alone** (87.4px of "1" versus 268.9px of "W" at 11px). It was never right for any font:
   under the old 26-character budget `"Whiskey Creek 33919 — SOLD"` passed untouched and
   painted **20.7px over the bars in Liberation Sans** — the incumbent Arial-metric face,
   before any brand font was wired. The `s.length > N ? s.slice(0, N-1) + "…" : s` idiom is
   BANNED in any rendered surface.
3. **A GUTTER IS MEASURED, NOT PINNED.** `labelGutterFor(labels, {...})` sizes the label
   column to the real labels in the face that will actually rasterize, clamped at both ends.
   The pinned `padL = 150/156` was wrong in both directions at once: ZIP labels wasted a
   quarter of a 600px canvas, and street addresses were cut against a gutter nobody measured.

**The face must reach the BUILDER, not just the rasterizer.** `fontFamily` threads recipe →
`chartSpecToEmailImage` → `chartSpecToEmailSvg` → every builder → `svgToPng`. Handing it only
to `svgToPng` rasterizes the right typeface into a layout fitted for a different one — which
is exactly how a label that "passed" its budget still overflowed.

---

# lib/email/ — email & deliverable conventions (loads when you edit here)

> **⛔ STEP ZERO — THE RULES ARE GITIGNORED. GREP RETURNS NOTHING; THAT IS NOT ABSENCE.**
> Operator decree 08/04/2026: *"Get the actual rules from the gitignored into the first steps
> of email build. This is the foundation of everything. Every fucking email starts reading
> these rules and has to abide by them when used."* Open these BY PATH before any design,
> type, spacing, copy, or CTA decision — a repo-wide search cannot see them:
>
> - `_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md`
>   — §1.1 internal ≤ external spacing (the evenness rule, ⚠ NOT implemented — no external
>   term exists in the compiled email); §1.2 avoid small differences between scale steps;
>   §1.3 closed enums not freeform props + a linter pass (✅ shipped as
>   `blocks/type-conformance.test.ts`); §2.1 chart type by data shape; §2.2 WCAG 1.4.3 (4.5:1
>   text, 3:1 large) and 1.4.11 (3:1 non-text) with the grayscale self-test.
> - `_RESEARCH/deliverable-and-design/2026-07-01-taskB-wcag-contrast-verification.md` — the
>   contrast half of the foundation.
> - `_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md` — the
>   measured copy numbers behind §0.1 (50–125 words; the FLOOR bites harder).
> - `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md`
>   — the 5-part skeleton, subject-line taxonomy, market-report order, and Part D render
>   constraints (Outlook has zero flex/grid; Gmail clips at ~102KB).
> - `_RESEARCH/email-and-social/2026-08-03-button-link-mechanics.md` — button height 42–72px,
>   never an image-based button, and why `usesWebsiteDefault: false` is a deliverability rule.
>
> **Why this block exists:** on 08/04/2026 a session answered a font/size/spacing question
> from `app/_design/` and the code alone, never opened `_RESEARCH/`, and reported the type
> scale as "compiler-enforced" when nothing enforced font size at all. The research had
> already prescribed the exact missing guard — on 07/01/2026, three days of crawling, unread
> for a month. **Research in markdown governs nothing; it governs when it becomes a code root
> plus a red test.** That is the same lesson §4 of the email map already records.

> **CODING A RECIPE, SEED, TEMPLATE, OR BLOCK? → `docs/standards/emails.md` §0 "BEFORE YOU CODE
> A RECIPE" FIRST.** The rules card: body **50–125 words** (and a 25-word email is as weak as a
> 2000-word one — the floor bites harder than the ceiling), ask 1–3 questions, 3rd-grade reading
> level, never neutral; per-TYPE numbers (triggered > newsletter, welcome 83.63% open, drip CTR
> halves after msg 2, newsletter cadence peaks at 1/week); subject **3–4 words when you want a
> reply, 30–40 chars when you want an open**; the 5-part skeleton, one CTA, the seven type roles +
> 8px spacing grid + 600px canvas, the Outlook/dark-mode/102KB render constraints, logo rules,
> CAN-SPAM, and the market-report content order — ONE place, each number pointed at the code root
> that owns it. It exists because the research was in gitignored `_RESEARCH/` and governed nothing.

> **READ FIRST → `docs/standards/emails.md` — the ONE email map.** The build pipeline end-to-end,
> the three render engines, the send lanes, the failure catalog (every way emails have actually
> broken), vendor reality, and the kill list. This file is the in-context digest; the map is the
> full picture. Any email postmortem or decree updates the map in the SAME session.

> **ALSO READ FIRST, UPDATE LAST → `docs/standards/repo-inventory-audit.md`** — every LLM call
> site in the build pipeline (#llm-call-sites-email: `build-doc.ts` ×4, `showing-prep-assemble.ts`,
> social-calendar builders) and precompute candidates that touch this area (#precompute-candidates:
> `buildDeliverableNarrative()` re-running its LLM call on every `/refresh` even when the underlying
> brain data hasn't changed). Add/remove a call site or a cache here? Update the matching section
> in the SAME commit — that file exists so this audit never has to be re-run cold.

- **ONE LANE (08/02/2026):** every `authorDoc` build lands on a coded-grid recipe. Keyless/organic
  asks → the `default-grid` recipe (blank skeleton, sourced fill via `fillSkeletonFromSources`,
  open slots for the rest). The free author is DELETED — never re-add a model-composed layout
  path. `author-recipes.ts` is DELETED — voice lives in `voice-presets.ts` (explicit pick only,
  no keyword detection; stale `preferred_recipe` ids degrade to "plain"). Keyless builds may
  return ≤2 suggestion chips (`suggest-recipe.ts`) — navigation-only door links, never routing.
- **Social platforms have ONE root:** `lib/email/social/platforms.ts` (8 platforms). The footer, the
  social-icons block, the icons, `applyBrand`, the brand form, and the PDF all read it — change it there,
  not in copies. Custom icons = keyless favicon → globe fallback. **No paid logo vendor** (Logo.dev was
  killed — don't re-propose).
- **Contact segmentation has ONE root:** `lib/email/segments/` (`filter.ts` pure engine +
  `resolve.ts` DB wrapper), persisted in `contact_segments`. This is the ONE-OFF BLAST
  lane (`ContactPickerModal` / `POST /api/deliverables/[id]/blast`) — NOT `email_audiences`
  (the tag → Resend-segment-id cache for the recurring DIGEST broadcast lane,
  `lib/email/audience-sync.ts`). Different table, different send path; don't merge them.
  Attribute/engagement conditions are `"paid-only"` in `lib/email/lab/capabilities.ts`,
  enforced server-side in every `/api/segments*` route, not just in the picker UI.
- **A derived cell earns a footnote ONLY when the reader can't check it** (operator decree
  07/20/2026, on reading one in a real inbox). `specFootnote` used to print "*Computed from list
  price ÷ listed square footage." under every lifecycle spec strip — a developer narrating a
  formula when BOTH OPERANDS sit two cells away in that same strip. It now returns `undefined`.
  KEEP a note where the derivation is non-obvious or misreadable: price-reduced's "previous price =
  ask + the reduction on record" (uncheckable from the page) and just-sold's "$/Sq Ft is the SALE
  price ÷ sq ft" (distinguishes it from the list-price version). Never restate arithmetic the
  reader can do in their head — it reads as a spreadsheet export, not as an agent.
- **The campaign simulator is how you prove a lifecycle change end-to-end:**
  `bun scripts/email/campaign-sim.mts` (dry run, no send) drives ALL 7 listing recipes through the
  real `authorDoc` on one real listing, with simulated price-cut/sold events injected BELOW
  authorDoc at the data boundary (process-local `mock.module`, zero prod files changed). `--send`
  sends on a schedule — 20 min default, don't compress it. ONE SENDER PER RUN: it holds a PID lock
  and re-reads state before every send, because three concurrent processes once sent the operator
  "Under Contract" three times (map §7). **Verify a send against the INBOX, never against the
  program's own record of having sent it.**
- **Outlook reality:** SVG icons render as text in Outlook — use the established fallback, don't ship raw SVG.
- **Charts in deliverables** go through `buildChartForQuestion` (`lib/email/build-doc.ts`). Every plotted
  number is REAL (held brain / live-web-cited / upload-verified / user-stated) — the model selects points,
  never writes a number. If a shape isn't built, offer bar/table — never "can't chart it". **Every
  chart-bearing deliverable: the chart's magnitude must cohere with its headline** (same unit → headline
  within ~3× of the chart's plotted range), enforced by `assertHeroChartCoherence`
  (`lib/deliverable/chart-coherence.ts`) at author-time (a red CI test over every `SEED_DOCS` template,
  `preview-fill.test.ts`) and at runtime (soft: drop the chart, never block the send). An element type
  ships with its coherence rule — the pattern extends to pictures, commentary, and examples
  (`promised_deliverable_element_coherence_audit`).
- **CAN-SPAM = 4 real requirements:** a working opt-out, accurate headers, no misleading subject, AND a
  valid physical postal address (business address, PO box, or mailbox service) in every commercial email
  (corrected 07/02/2026 per Shopify's FTC-sourced guide). The footer's `address` field is its home —
  populated from the brand profile's `business_address`; the lab nudges (non-blocking) when it's empty.
  Don't re-add a compliance lecture.
- **Starter templates — THE SLOT RULE.** Authoring a template in `lib/email/doc/default-docs.ts`
  (`SEED_DOCS`)? **If a field's right answer depends on real data, leave it empty (`""`) and put the
  instruction in the label. If it's structure, style, brand, or a button that says "Schedule a
  Showing," fill it in.** This is mechanical, not stylistic: `docSkeleton` (`build-doc.ts:317`) skips
  empty fields when building the AI's view of the template, so an empty value is an OPEN SLOT the AI
  fills — while a filled value is shown to the AI as "the current answer" and may simply be kept. The
  label is always sent, so **a label is an instruction to whoever fills the slot, not a caption.**
  Open: every figure, photo, commentary sentence, and link. Filled: layout, palette, brand, `stats`
  labels like "Beds". Copy the `trend-snapshot` template. Charts need no authoring — reserve an
  `image` block and `upsertChartBlock` replaces it in place. Full playbook:
  `docs/superpowers/specs/2026-07-08-seed-slot-playbook-handoff.md`.
- **CSV/formula-injection policy (pinned 07/10/2026):** contacts are stored RAW — import never
  mangles a value (a leading `-` in a name or an `@handle` is legitimate data). The escape happens
  at the EXIT: any code that GENERATES a CSV builds every cell via `escapeCsvCell`/`toCsvLine` from
  `lib/email/csv-escape.ts` (quotes each cell, doubles `"`, `'`-prefixes formula triggers
  `= + - @` tab/CR/LF + full-width variants — per OWASP CSV Injection). No exporter exists today;
  that module is the one root when one ships. Never sanitize on import — wrong layer.
- **Layout:** use `h-full` / `dvh`, never `h-screen`.
- **Send is the paywall, builds are free** — watermark only; no build gate, no Stripe on creation.
- **Email Lab tier DIAL has ONE root:** `lib/email/lab/capabilities.ts`. Every feature + every font
  declares ONE target — `"free-only"` / `"both"` / `"paid-only"` — in `FEATURE_ROUTING` /
  `FONT_ROUTING`. The free/paid capability sets are DERIVED from those (not hand-maintained), and
  `capabilities.test.ts` enforces each thing lands exactly where it was routed (paid-only never
  leaks to free, paid never silently downgraded). Want a thing in paid? Route it `"paid-only"`.
  Everywhere? `"both"`. Free only? `"free-only"`. Never hardcode a tier difference in a shell or a
  shared component — read `capabilitiesFor(tier)` / `fontsFor(tier)`. (`FontFamily` is a keyed
  `Record`, so adding a font FORCES you to route it.)
