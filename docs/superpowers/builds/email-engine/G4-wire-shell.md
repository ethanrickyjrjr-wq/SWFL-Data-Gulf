# G4 · wire shell  (OPERATOR)
**Model:** Sonnet | **Group:** 2 | **deps:** G1, 03 | **owner:** OPERATOR

## Goal
Put `GridCanvas` into `EmailLabShell`; "Build with AI" calls the author engine (build 03); render preview. **PRESERVE `applyBrand` + save/send/schedule wiring** (strict superset of the free tier).

## Files
- EDIT `components/email-lab/EmailLabShell.tsx`

## Spec
- "Build with AI" → POST `currentDoc` + prompt to `/api/email-lab/ai` `mode:"author"` → replace doc with the response.
- Drag/resize/edit → mutate doc locally → call `/api/email-lab/render` for preview.
- Brand still flows `branding → brandingToTokens → applyBrand`; AI never writes brand.
- Save/Send/Schedule/Track/PDF wiring untouched.

## Acceptance
- Type a sentence → engine builds a positioned doc → grid renders it → drag/resize works → save/send/schedule still work.
- A no-`layout` (free-tier) doc still opens in the stacked canvas unchanged.
