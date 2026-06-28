# G3 · Photopea modal  (OPERATOR)
**Model:** Sonnet | **Group:** 2 | **deps:** 04 | **owner:** OPERATOR

## Goal
Iframe Photopea editor; on save, POST to `/api/email-lab/save-photo` (build 04) → URL into `block.props`.

## Config (photopea.com/api)
- `src = "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config))`
- `config.files = [photoUrl]`, `config.server.url = <save-photo route>`, `config.server.formats = ["png","jpg:0.9"]`
- Pre-crop to the block's px dimensions via `config.script` (resizeCanvas).

## Files
- NEW `components/email-lab/PhotopeaModal.tsx`

## Acceptance
- Edit a photo → save → block's photo updates with the new `email-media` URL.
