# HANDOFF — 15-minute docs fix: SteadyAPI Reddit quirks into the vendor note

## Mission

Fold three LIVE-VERIFIED SteadyAPI Reddit endpoint facts (discovered during the 07/05/2026 Reddit
research run, 39 real calls) into `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` before they're
forgotten. Docs-only; no code.

## The facts to record (source: this repo's SESSION_LOG entry "SPEC: agent-first homepage re-flip
(agent-first-homepage)", research bullet 2 — and they were observed live, not from memory)

1. `/v1/reddit/search`: the `filter` param REJECTS the value `posts` (422/error) even though it looks
   documented; and `subreddit:` query syntax breaks the endpoint.
2. The `subreddit` param must be a bare name and only BIASES site-wide relevance ranking — it does
   not hard-filter. Client-side filtering by subreddit is required for scoped mining.
3. `/v1/reddit/post` responds with `body.post` + `body.post_comments[]` with nested `replies` — a
   shape not currently in the vendor note.

## How

- Read the vendor note's existing Reddit section first and match its format (verbatim params +
  response shapes + build notes). Add a clearly dated "field-verified 07/05/2026" sub-note rather
  than rewriting the crawled reference — the note distinguishes crawled-doc facts from observed
  behavior.
- If you want to re-verify before writing (optional): key is env `PHOTOS_API` (Bearer + the
  browser-like Origin/Referer headers documented in the note); keep it to ≤3 calls; never print the
  key. Re-verification is allowed but NOT required — the observations were logged from live runs.

## Definition of done

- Vendor note updated + committed (docs-only commit; SESSION_LOG line). STOP before push for
  operator approval. No check to close — this is hygiene, not a build.
