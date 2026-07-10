# lib/email/ — email & deliverable conventions (loads when you edit here)

- **Social platforms have ONE root:** `lib/email/social/platforms.ts` (8 platforms). The footer, the
  social-icons block, the icons, `applyBrand`, the brand form, and the PDF all read it — change it there,
  not in copies. Custom icons = keyless favicon → globe fallback. **No paid logo vendor** (Logo.dev was
  killed — don't re-propose).
- **Outlook reality:** SVG icons render as text in Outlook — use the established fallback, don't ship raw SVG.
- **Charts in deliverables** go through `buildChartForQuestion` (`lib/email/build-doc.ts`). Every plotted
  number is REAL (held brain / live-web-cited / upload-verified / user-stated) — the model selects points,
  never writes a number. If a shape isn't built, offer bar/table — never "can't chart it".
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
