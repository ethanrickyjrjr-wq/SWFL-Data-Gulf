# Issue 001 on-site gated read (teaser + email unlock)

**Date:** 2026-07-26
**Check:** `insiders_issue001_gated_read_live_verify`
**Decided with operator (07/26/2026):** hard server-side gate · entry via /insiders ledger row · free read = Tape + first two Lead paragraphs · one committed artifact split at request time.

## Problem

Issue 001 is composed and fact-checked (`runs/insiders-runs/2026-07-26-rebuild/issue-2026-07.html`,
126 figures, 23 sources) but `runs/` is gitignored — the issue cannot ship to the website from
where it lives. The live `/insiders` page promises an archive ("Every issue, on the record") and
its ledger row for 001 is dead text. There is no way for a site visitor to read any of the issue,
and no conversion path from the issue's own quality to the subscriber list.

## Goal

Publish Issue 001 on the public site as a gated read: the `/insiders` ledger row becomes a
thumbnail + link to `/insiders/001`, which serves the masthead, the full Tape, and the Lead's
first two paragraphs free, then stops mid-story behind an email capture. Submitting an email
subscribes the reader (existing endpoint, consent recorded) and unlocks the full issue in place.
The full issue HTML is never sent to an anonymous browser — not bypassable by view-source,
disabled JS, or dev tools.

## What we're building

### 1. Committed artifact — `content/insiders/issue-2026-07.html`

Byte-identical copy of the fact-checked press artifact. ONE allowed edit class: `<head>`-only
additions (OG tags, canonical `/insiders/001`, favicon). Body bytes untouched — the canonical
page never changes after press. Also `content/insiders/issue-001-thumb.png`: compressed crop of
the existing masthead screenshot (target < 100 KB).

`content/` is a new committed directory (verify no gitignore pattern catches it; `runs/` stays
ignored).

### 2. Teaser splitter — `lib/insiders/teaser-split.ts` (pure, TDD'd)

`splitTeaser(fullHtml: string): string | null`

- Structure contract (matches the pressed artifact): first `<section class="tape">` = The Tape;
  the immediately following `<section>` = The Lead. Cut after the Lead's second `</p>`.
- Output: everything up to the cut, then a gate block (gradient fade + capture card + inline
  vanilla JS form → `POST /api/insiders/subscribe` with `source: "issue-001-gate"`, on ok
  `location.reload()`; error message on failure; `<noscript>` note pointing at /insiders), then
  properly closed tags per the artifact's real nesting.
- Returns `null` whenever the structure isn't found — never a guessed cut (fail closed).

### 3. Reader cookie — `lib/insiders/reader-cookie.ts` (pure, TDD'd)

HMAC-SHA256 over the normalized email, keyed by new env `INSIDERS_READER_SECRET`.
Cookie `ins_reader=<email-b64url>.<hmac-b64url>`, httpOnly, Secure, SameSite=Lax,
Max-Age 1 year, Path=/. `verify()` returns false on: missing secret, malformed value, bad
signature. Missing secret NEVER opens the gate.

### 4. Gated route — `app/insiders/001/route.ts` (GET route handler)

- `runtime = "nodejs"`; responses carry `Cache-Control: private, no-store` and
  `Content-Type: text/html; charset=utf-8`.
- Valid `ins_reader` cookie → stream the full committed artifact.
- Otherwise → `splitTeaser(artifact)`; if `null`, serve last-resort teaser (masthead region +
  capture card only) — degraded, never leaking.
- Artifact read via `fs.readFile`; `next.config` gets `outputFileTracingIncludes` for
  `content/insiders/**` so the file exists inside the Vercel lambda.
- The artifact never goes in `public/` (that would be an ungated URL).

## Gate UX

Teaser ends mid-Lead under a bottom gradient fade into a capture card styled in the issue's own
press palette: "Keep reading — free. The rest of Issue 001 unlocks with your email." Fine print
matches the existing capture (free · monthly · unsubscribe anytime). After unlock, reload anchors
to the cut point (`#continue` anchor emitted by the splitter; anchor id also present in the
committed copy's Lead section so the full serve can land there — decide exact mechanism at
implementation, zero-risk either way). Crawlers get exactly the anonymous teaser: Google indexes
what anonymous humans see, nothing more.

### Small edits

- `app/api/insiders/subscribe/route.ts`: on SUCCESSFUL upsert only, set the signed cookie on the
  response. Subscribing anywhere on the site (hero, footer, gate) unlocks reading.
- `app/insiders/page.tsx` ledger row → `<Link href="/insiders/001">` with the thumbnail and
  "Read the opening — free"; status copy "in production" → published once live.
- `app/sitemap.ts`: add `/insiders/001`.

## Failure modes → guards (RULE 3.5)

| # | Failure | Guard |
|---|---------|-------|
| 1 | Full issue leaks to anonymous readers | Server-side branch only; artifact not in `public/`; leak-sentinel test: teaser output (from the REAL committed artifact) must contain a known Tape string and must NOT contain sentinel strings from the Watch + falsifier + Receipts sections |
| 2 | CDN caches one variant and serves it to everyone | `Cache-Control: private, no-store` on every route response; test asserts header on both branches |
| 3 | Cookie forged via dev tools | HMAC signature; tests reject unsigned, tampered, and wrong-secret values |
| 4 | `INSIDERS_READER_SECRET` missing in prod | `verify()` false on missing secret — gate fails CLOSED; test |
| 5 | Artifact missing from Vercel lambda (fs + tracing) | `outputFileTracingIncludes`; live check `insiders_issue001_gated_read_live_verify` signal: GET `/insiders/001` → 200 + known Tape string |
| 6 | Re-press changes structure, splitter cuts wrong | Splitter returns `null` on unmatched structure → last-resort teaser; leak-sentinel test runs against the committed artifact in CI, breaks before ship |
| 7 | Cookie set although subscribe upsert failed | Cookie only on the success path |
| 8 | Env drift: secret set locally, absent on Vercel | Ship step includes setting the Vercel env before deploy; the /verify drive includes a live subscribe→unlock pass that fails visibly if the secret is absent |

Green tests do not cover: the artifact's factual content (already gated at press time by the
issue's own fact-check), and email deliverability (out of scope — no send in this build).

## Testing

TDD (failing test first, named for its failure mode): `lib/insiders/teaser-split.test.ts`
(cut point, gate injection, fail-closed null, leak sentinels vs the real committed artifact),
`lib/insiders/reader-cookie.test.ts` (sign/verify round-trip, tamper, missing secret),
subscribe-cookie behavior. Then `bunx next build` green, then the /verify drive: screenshot
anonymous teaser, subscribe through the gate, screenshot unlocked read. Close the live check
with prod evidence only (checks = prod evidence, not dev attestation).

## Explicitly out of scope

- Emailing Issue 001 to subscribers (open check `insiders_issue001_distribution` — separate).
- An issues index route (`/insiders/archive`) — one issue exists; the ledger row is the index.
- Any generalized multi-issue machinery beyond the 001 route reading a named file. YAGNI until
  Issue 002 presses.

## Launch-order note

The live page promises subscribers get issues before the public archive. The gate is
self-consistent (reading requires subscribing), but if the operator wants existing subscribers
to receive the email first, ship this page after or with the send — operator decides at ship
time; the build is identical either way.
