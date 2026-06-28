# 04 · save-photo
**Model:** Sonnet | **Group:** 0 | **deps:** none | **owner:** engine

## Goal
Receive a Photopea binary save and store it in `email-media`; return the public URL for the block.

## Research (build-time, RULE 0.4 — crawl `photopea.com/api` before coding)
- Photopea server save POSTs binary; first ~2000 bytes = JSON metadata, rest = image bytes (`Buffer.slice(2000)`). CONFIRM the exact framing against live docs before coding.

## Files
- NEW `app/api/email-lab/save-photo/route.ts` — POST binary → Supabase `email-media` → `{ url }`.

## Spec
- Reuse the upload pattern from `app/api/email-lab/media/route.ts` (service-role client, key `${user.id}/lab/${uuid}.png`, `getPublicUrl`).
- Parse the Photopea payload (slice off the JSON header) — verify against live docs first.
- Auth like `media/route.ts`. Size guard.

## Acceptance
- A Photopea save round-trips: binary in → public `email-media` URL out → renders in the email.
- `bunx next build` green.
