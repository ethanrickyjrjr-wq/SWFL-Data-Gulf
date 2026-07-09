# 2026-07-09 — Email fence cluster: what's actually left

Verified against the checks ledger + the live code (not the prior session's summary alone). All
items below are captured/durable on `main` — spec docs, decisions, check registration — but **no
code fix has landed for any of them.**

## Open checks, priority order

1. **`email_contrast_ink_fence`** — `ButtonBlock.tsx:18`, `HeaderBlock.tsx:39/51`,
   `AgentHeroBlock.tsx:66/80/115` still hardcode `color: "#ffffff"` / raw `globalStyle.accentColor`
   on brand fills. `legibleAccent()` already exists in `lib/email/blocks/on-dark.ts` but isn't
   wired at any of the three call sites. Proof (07/09): white-on-teal 2.04:1, white-on-pale-gold
   1.41:1 vs WCAG AA 4.5:1 floor.
2. **`email_accent_ink_palette_gate`** — deeper accent-on-primary / accent-on-white contrast bug
   found while verifying the fence-polish handoff. Spec (D1-D4 ratified):
   `docs/superpowers/specs/2026-07-09-email-accent-ink-palette-gate-design.md`. Sequenced after #1
   — same three files, Tier A render guards + Tier B save-time warn strip via `lib/brand`.
3. **`email_palette_demo_figures`** — `DEFAULT_BLOCK_PROPS` still ships demo figures (hero $485K,
   stats, listing 4521 Surfside Blvd, metric-card) — reintroduces the Track-A fake-figure class.
4. **`email_sources_accordion_autofill`** — Lab AI-fill never materializes the sources accordion;
   auto-fill from used MarketFigures at assembly.
5. **`email_cadence_enrichment`** — monthly+ templates thinner than weekly-pulse (year-in-review
   2nd chart, monthly-digest depth, magazine-issue image slots, market-spotlight chart slot,
   just-sold photo slot, luxury-market-report serif display, optional 16:9 banner ratio).
6. **`seed_previews_recapture_after_enrichment`** — re-run `capture-seed-previews.mts` once #5
   lands (current captures are pre-enrichment).
7. **`template_preview_gallery_live_verify`** — operator live-verify of the 27-template preview
   gallery (built 07/09, independent of the fence work above).

## Suggested pick-up order

\#1 → #2 (sequenced on #1, same 3 files) → #3 → #4 → #5 → #6 (depends on #5) → #7 (operator-run,
can happen any time).
