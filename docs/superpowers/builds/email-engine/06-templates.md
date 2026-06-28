# 06 · templates
**Model:** Sonnet | **Group:** 2 | **deps:** 01, 05 | **owner:** engine

## Goal
Three premium, **pre-positioned** templates the engine fills: Luxury Market Report, New Listing, Weekly Market Pulse. Docs WITH `layout` (grid), using existing + new (listing, multi-column) blocks.

## Files
- EDIT `lib/email/doc/default-docs.ts` — add 3 `SEED_DOCS` carrying `layout` (+ optional Supabase-backed library later).

## Spec (visual targets = the operator's references: Mad City, Realtor Canva, Katie Miller "Just Listed", Valley Realty "Welcome")
- **Luxury Market Report:** hero photo (12w) · headline (8w) + median-price stat (4w) · 12-month chart (12w) · two-col listing grid.
- **New Listing:** hero photo · address+price hero · 3 stats (bed/bath/sqft) · AI paragraph · CTA.
- **Weekly Pulse:** header graphic · 3 stat blocks · two charts side-by-side (multi-column) · ZIP comparison.

## Acceptance
- Pick each template → renders a beautiful positioned layout; the engine fills it with real data.
- `bunx next build` green.
