# 06 — Set PEXELS_API_KEY (media picker)

- **Status:** ⬜ Not started
- **Owner:** OPERATOR (secret; keyboard-only)
- **Source:** autopsy §7 (other prod-only actions)

## What

The media picker needs `PEXELS_API_KEY`. Absent → the picker can't fetch stock media.

## Steps

1. `gh secret set PEXELS_API_KEY -R ethanrickyjrjr-wq/SWFL-Data-Gulf` + Vercel env if the client
   reads it at runtime (probe which side consumes it first).

## Done when (live proof)

- The media picker returns real Pexels results in the running app (not an empty/errored state).

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
