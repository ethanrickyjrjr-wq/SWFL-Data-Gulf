# Lane 18 — example.test placeholder photo in public/dev-emails/*.html

Diagnosis-only pass. Read-only. No git, no DB, no browser.

## Symptom
All 7 files in `public/dev-emails/` ship `<img src="https://example.test/photo.webp">`
as the hero photo. `/dev-emails` page copy claims the photo is "the real hero photo,
re-resolved and now mirrored into our own storage" — false as rendered.

## What I checked

1. `scripts/dev-render-listing-emails.mts` (the generator) — read end to end.
   - Line 58: `let FACTS = SHORE_DR_FACTS;` — DEFAULT is the committed fixture.
   - Lines 57, 59-66: the ONLY path that produces a real photo is the `--live`
     flag. `--live` calls `resolveSubject(address, "")` which re-resolves against the
     vendor AND mirrors the hero photo into our storage. Without `--live`, the fixture
     is used verbatim.
   - Header (lines 11-17, 53-56): explicitly documents that the default/no-key run
     uses the fixture and "the photo renders as an empty box." The no-spend default
     path is the intended CI-safe path.

2. `lib/deliverable/recipes/__fixtures__/shore-dr.ts` — the fixture.
   - **Line 27: `photos: ["https://example.test/photo.webp"], // NOT REAL — see note above.`**
   - Lines 7-10: the fixture's own header states this is an INTENTIONAL placeholder:
     the live Lab build's hero URL was never persisted, so the test placeholder stands
     and "the photo renders as an empty box. That absence is the honest state — do not
     substitute another house's picture to fill it."

3. `lib/deliverable/recipes/shared.ts` — confirmed the `--live` path is real.
   - Line 147 `resolveSubject`; lines 181-183 mirror `facts.photos[0]` via
     `mirrorHeroPhoto` (import line 21). So `--live` genuinely resolves + mirrors.

4. `public/dev-emails/new-listing.html` — verified the rendered output contains
   `example.test/photo.webp` in BOTH the `<link rel="preload">` and the hero `<img>`.
   All 7 files contain the placeholder (grep -l matched all 7).

5. Git state — the task calls these "committed," but they are NOT tracked:
   - `git ls-files public/dev-emails/` → empty.
   - `git check-ignore public/dev-emails/new-listing.html` → exit 0 (gitignored).
   They are LOCAL scratch renders (script header line 19: "gitignored — a scratch
   surface"). They exist on disk and `/dev-emails` renders them from disk.

6. `app/dev-emails/page.tsx` — the false claim.
   - Line 133: "One address lookup, to recover the hero photo".
   - **Line 178: "and the real hero photo, re-resolved and now mirrored into our own storage."**
   The page asserts the `--live` OUTCOME; the on-disk files are the DEFAULT (no-`--live`)
   outcome. Mismatch.

## What I ruled out
- NOT a stub/mock "left in" that a resolver should have overwritten. There is no dead
  mock swap. The `example.test/photo.webp` value is a deliberate, documented fixture
  constant, and the default render mode is DESIGNED to use it.
- NOT a resolveSubject bug: the `--live` path (shared.ts:181-183) does resolve+mirror
  correctly; it was simply never used to produce the shipped scratch files (or was run
  and MISSed, line 65, falling back to the fixture — but the honest-fallback log would
  have printed, and the more parsimonious read is that `--live` was never passed).

## Root cause (exact)
Two-part, both required for the visible symptom:
1. `lib/deliverable/recipes/__fixtures__/shore-dr.ts:27` hardcodes the placeholder
   `photos: ["https://example.test/photo.webp"]` (intentional, documented).
2. `scripts/dev-render-listing-emails.mts:58` defaults `FACTS = SHORE_DR_FACTS`; the
   real-photo path is gated behind the `--live` flag (lines 57, 59-66). The on-disk
   `public/dev-emails/*.html` were generated in DEFAULT mode (no `--live`), so the
   placeholder flowed straight into every hero `<img>`.

The DEFECT is the honesty gap: `app/dev-emails/page.tsx:178` (and :133) claim the
rendered photo is real and mirrored, contradicting both the on-disk render and the
fixture's own honest note (shore-dr.ts:8-10).

## Fix (concrete, two independent options; option B is the honesty fix and needs no spend)
- A) Regenerate WITH the flag: `bun scripts/dev-render-listing-emails.mts --live` so
  resolveSubject re-resolves + mirrors 326 Shore Dr's real hero photo before the render.
  Caveat: this is a live vendor call with a storage side-effect (out of scope for the
  diagnosis-only pass; the header's no-key default is intentionally the CI-safe path).
  It only fixes the photo if resolveSubjectListing still HITs for that address.
- B) Make the page tell the truth for the committed/default render: edit
  `app/dev-emails/page.tsx:178` and `:133` to stop asserting "real hero photo,
  re-resolved and now mirrored" — state instead that the hero renders as an empty/
  placeholder box unless the capture was run with `--live` (matching the fixture's own
  note). Zero spend, zero side-effect, aligns the surface with reality.

Recommended: B (align the claim), and separately offer A as the operator's choice since
it costs a real vendor call. Fixes land in a later step after human review.
