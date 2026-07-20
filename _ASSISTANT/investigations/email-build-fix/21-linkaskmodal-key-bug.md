# Lane 21 — LinkAskModal duplicate React key

## What I read
- `components/email-lab/LinkAskModal.tsx:66-75` — `suggestions.map(s => <button key={s.url}>...)`.
  Suggestions prop is `LinkSuggestion[]` (`{ label, url }`), no dedupe anywhere in this file.
- `components/email-lab/EmailLabGridShell.tsx:2532-2549` — the only call site. Builds the
  `suggestions` array inline from THREE independent sources, each optionally contributing one
  entry:
  1. `subjectListingUrl(doc)` -> "The listing page"
  2. `brandWebsiteUrl(doc)` -> "Your website"
  3. footer block's `email` -> "Reply by email" (`mailto:${email}`)

## Root cause
- `lib/email/link-audit.ts:41-51` `subjectListingUrl(doc)`: returns the **listing block's
  `linkUrl`**, or failing that, a photo block's `linkUrl`.
- `lib/email/inject-photo.ts:67-74` `brandWebsiteUrl(doc)`: returns the **footer's
  `websiteUrl`**.
- These read different fields, but nothing stops them holding the identical string at runtime.
  Concretely: `applyLinkFallbacks` (same file, link-audit.ts, rung "website") is the fallback
  ladder that writes `ctx.brandWebsiteUrl` INTO a block's `linkUrl` whenever no real listing/hero
  URL exists yet (this runs at send-time / occurrence-freeze per `emaildoc-occurrence.ts` and
  `frozen-occurrence.ts`, and conceptually any time a listing card gets its link auto-filled from
  the brand site before this modal is asked to run again). Once a listing card's `linkUrl` equals
  the footer's `websiteUrl`, `subjectListingUrl(doc)` and `brandWebsiteUrl(doc)` return the SAME
  string, so the `suggestions` array gets two entries with different `label`s ("The listing page"
  / "Your website") but an identical `url`. React's `key={s.url}` collides -> the exact "two
  children with the same key" console error.
- Simpler path to the same collision: an agent whose listing card link and the brand website are
  the same URL by construction (e.g. no MLS/listing landing page yet, both point at the agent's
  own site) — no special fallback timing required, just two of the three suggestion sources
  resolving to one URL.
- Note the on-page copy IS distinguishable (label differs), only the React `key` is wrong — this
  is a keying bug, not a data bug. Confirmed by inspection; did not run the app (browser
  automation forbidden per safety protocol).

## Fix (minimal, ready to apply)
Two changes, do both (belt & suspenders — dedupe is also better UX, no visually-identical
"Your website" / "The listing page" chips that do the same thing):

1. Dedupe `suggestions` by `url` before mapping (keep first occurrence — listing page wins over
   website since it's listed first), in `LinkAskModal.tsx` right before the `.map`:

```tsx
{suggestions.length > 0 ? (
  <div className="mt-1.5 flex flex-wrap gap-1.5">
    {dedupeByUrl(suggestions).map((s) => (
      <button
        key={s.url}
        ...
```

   with a small helper (top of file, near `keyOf`):

```tsx
const dedupeByUrl = (list: LinkSuggestion[]) => {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
};
```

2. Make the key collision-proof regardless (defense in depth, covers any future suggestion
   source that isn't dedup'd upstream): key by row + url instead of url alone, since suggestions
   are rendered once per `asks` row (`keyOf(a)` is already in scope) —

```tsx
key={`${keyOf(a)}:${s.url}`}
```

   This alone would silence the React warning but two chips with the same destination and
   different labels would still both render — so still do (1) for correctness of the UI, not
   just to satisfy React.

Preferred: apply (1) (dedupe), which also makes the `key={s.url}` in the existing code safe by
construction — no need to also change the key expression once dedup guarantees uniqueness within
one row's suggestion list. Recommend NOT bothering with (2) if (1) ships, to keep the diff
minimal.

## Ruled out
- Not a `keyOf(a)` (row-key) collision — that key already includes `blockId` + `columnIndex`,
  distinct per ask row, no report of ask-row duplication.
- Not a state/typing bug in `values` — unrelated to this finding.
