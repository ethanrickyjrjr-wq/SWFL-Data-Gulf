# Grid Email — 10 New AI-Fillable Templates
**Date:** 2026-06-29
**Status:** DONE — templates added to `lib/email/doc/default-docs.ts`

---

## What Was Done

Added 10 new `seedBlockGrid` templates to `SEED_DOCS`, alongside the existing 14 templates.
Nothing deleted. All block types are fully implemented and compile clean (0 TS errors).

---

## The 10 New Templates

| id | Name | Layout Highlights |
|---|---|---|
| `open-house` | Open House Invite | Full photo + date hero + description ∥ RSVP button |
| `price-reduced` | Price Reduced | Price hero ∥ before/after stats, property photo |
| `just-sold-grid` | Just Sold | Property photo ∥ sold hero, full-width stats |
| `neighborhood-report` | Neighborhood Report | KPIs + chart ∥ signal, commentary |
| `investment-brief` | Investment Brief | Property ∥ cap rate hero, investment KPIs + chart |
| `rate-watch` | Rate Watch | Rate hero ∥ affordability stats + chart + buyer tips |
| `monthly-digest` | Monthly Digest | KPIs + full-width chart + insight ∥ commentary |
| `year-in-review` | Year in Review | Annual stats + chart + 3-col highlights |
| `listing-digest` | Listing Digest | 4 listing cards in 2×2 grid |
| `stay-in-touch` | Stay in Touch | Agent hero banner + personal ∥ market snapshot |

These cover all 10 most common real estate email use cases:
property marketing (new listing, open house, price drop, just sold, listing digest),
market intelligence (neighborhood, monthly, year-end, investment),
and relationship (rate watch / buyer guide, stay in touch).

---

## 2D Grid Canvas Handoff — Current State

### What's Already Built (on `main`)

| Build | What | Commit |
|---|---|---|
| G1 | `GridCanvas.tsx` — react-grid-layout v2.2.3 drag/resize canvas | `efdc1c2b` |
| G2 | Per-block toolbar: drag handle, ✦ AI, ◧ photo, ⧉ dupe, ✕ delete | `c5d93f75` |
| G3 | `FilerobotModal.tsx` — in-browser photo editor | `8d7cf90b` |
| G4 | `EmailLabGridShell.tsx` — full shell wired to GridCanvas | wired |
| 01 | `doc/types.ts` — BlockLayout, listing, multi-column types | `633816ac` |
| 02 | `compile-grid.ts` — Block[] → react-email HTML compiler | `a85ebfa0` |
| 03 | `author-doc.ts` — AI author engine (no invented numbers) | `4f43c663` |
| 04 | `save-photo` API route — photo upload to Supabase | `bc4b6880` |
| 05 | `ListingBlock.tsx` + `MultiColumnBlock.tsx` — built | `3424f16b` |
| 06 | 3 original grid templates: luxury-market-report, new-listing, weekly-pulse | `fd06f3e0` |
| 07 | `email-assets.yml` — SVG→PNG GHA pipeline | `c5bc31c4` |

### Route

`/email-lab/grid` — standalone (no auth). Try it now.

### Packages

`react-grid-layout@2.2.3` and `react-resizable` are in `package.json`.
Run `bun install` if `node_modules/react-grid-layout` is missing.

---

## What's Not Done Yet (Future Sprints)

1. **Project-scoped grid** — `/project/[id]/email-lab/grid` (project brand + save/send) doesn't exist yet.
2. **Supabase template storage** — templates are in-code in `default-docs.ts`; moving to `email_grid_templates` table is future.
3. **crawl4ai full photo injection** — `og:image` pull is wired; full headless crawl for galleries is future.
4. **AI template auto-selection** — AI currently uses whatever template is open; routing to the best template by intent is future.
5. **Live verification of all 10 new templates** — manual check at `/email-lab/grid` needed.

---

## AI Fill — How It Works

Every template has placeholder text that signals intent to the AI:

```
kicker: "Rate Watch · July 2026"  →  AI knows this is a rate update
value: "6.75%"                     →  AI replaces with real rate
label: "30-Year Fixed · National Average"  →  AI fills from lake/web
stats: [{ value: "$2,590/mo", label: "Payment on $400K" }]  →  AI replaces
```

The author engine (`lib/email/author-doc.ts`) fills `kicker/value/label/prose/body/stats[]`
from the SWFL data lake. Numbers must be anchored to a real source; invented values are
stripped by the moat lint before they leave the server.

User edits via the inspector (right panel). Drag/resize any block. Hit send.
