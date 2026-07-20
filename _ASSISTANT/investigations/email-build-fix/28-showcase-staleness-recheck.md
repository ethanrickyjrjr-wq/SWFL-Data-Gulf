# Lane 28 — /showcase staleness recheck

## Task
Re-verify 07/13/2026 incident: /showcase gallery tiles render committed static
.webp screenshots instead of live renders, no freshness enforcement. Is this
still true today (07/20), and have underlying templates drifted since last capture?

## Files on /showcase (app/showcase/page.tsx)
1. `<CampaignExamples />` — components/showcase/CampaignExamples.tsx
2. `<SeedGallery />` — components/showcase/SeedGallery.tsx
3. `<ShowcaseGrid />` — app/showcase/ShowcaseGrid.tsx

## Finding 1 — ShowcaseGrid.tsx is LIVE, not stale
Read app/showcase/ShowcaseGrid.tsx in full (lines 1-100+). It iterates
`TEMPLATE_MANIFEST.filter(t => t.family === "viz")` and on "Preview →" opens
an iframe pointed at `GET /api/templates/render?slug=...` — a live render
endpoint, no committed image at all. This section of /showcase is NOT part
of the staleness bug. Ruled out.

## Finding 2 — SeedGallery.tsx IS still the static-capture architecture
components/showcase/SeedGallery.tsx renders `<img src={preview.image}>` for
both the grid card and the full-size overlay. `preview.image` comes from
`lib/email/doc/seed-previews.ts`, sourced from committed files under
`public/showcase/seed-previews/*.webp` (27 files, one per SEED_DOCS template,
count matches: 27 SEED_DOCS entries == 27 webp files, no orphans).

Capture script: `scripts/capture-seed-previews.mts`.
- Last commit touching the script: f4222cea "seed-preview variety pass" (Thu Jul 9).
- Last commit touching the webp assets themselves: Tue Jul 14 11:45:10 -0400
  (recapture ran again 07/14, 5 days after the script last changed).
- No commit since 07/14 touches the capture script or re-runs it
  (`git log --since=2026-07-14 -- scripts/capture-seed-previews.mts` = empty).

So as of today (07/20) the captures are 6 days old. Checked every commit that
touched the things a capture depicts, since 07/14:

- `lib/email/doc/default-docs.ts` (the SEED_DOCS source of truth):
  - fe457801 (07/16) "every template declares its subject" — adds a `subject`
    field to each template. This is metadata (email subject line), never
    rendered into the visual body a screenshot would show. Not a drift.
- `lib/email/doc/schema.ts`: touched by 6a5b462d and 0b42eb5a (below).
- `lib/email/render-email-doc.ts`, `EmailDocRenderer.tsx`, `compile-grid.ts`:
  only touched by 268c78e2 (digest-generator island deletion, 07/16) —
  unrelated to SEED_DOCS rendering path.
- 6a5b462d (07/19) "weekly-read: Gmail-safe sources line, dedupe, heat rank" —
  changes `SourcesBlock.tsx` rendering (visual!) and `zip-events/*` (heat
  leaderboard). BUT: grepped `lib/email/doc/default-docs.ts` for `"sources"` —
  the only default is `sources: { sources: [] }` (line 145, empty array,
  renders nothing) and no SEED_DOCS template overrides it with real citations.
  `weekly-read` itself is NOT a SEED_DOCS entry — it's a separate build path
  (`scripts/email/weekly-read-run.mts`), not part of the /showcase seed
  gallery at all. Ruled out as affecting SeedGallery images.
- 0b42eb5a (07/19) "corridor as-of labeled as verify date" — adds
  `asOfLabel` caption text to corridor concoction charts. Grepped
  `default-docs.ts` for "corridor" — zero matches. No SEED_DOCS template uses
  the corridor concoction. Ruled out.

**Conclusion for SeedGallery: the 27 captures are still visually accurate to
current SEED_DOCS output** — got lucky, not by design. There is still ZERO
freshness enforcement (no test compares capture timestamp against template
source mtime/hash, no CI gate, no expiry). The architecture is exactly as
risky as 07/13 found it; it simply hasn't drifted YET in this particular
6-day window. Next SEED_DOCS visual edit (a color, a spacing fix, a new
block) ships silently un-recaptured with no gate to catch it.

## Finding 3 — CampaignExamples.tsx is the SAME architecture, WORSE staleness
Not explicitly named in the 07/13 incident description, but it's under
`components/showcase/*` (in scope) and is the exact same committed-static-
capture pattern:

- `components/showcase/CampaignExamples.tsx` renders `SHOWCASES` from
  `lib/showcase/registry.ts`, each step pointing at
  `image: "/showcase/<id>/step-N.webp"` (committed static files under
  `public/showcase/<id>/`).
- Capture script: `scripts/capture-showcase.mjs` (different script from the
  seed-preview one — a second, parallel staleness surface).
- Git dates on the underlying asset directories:
  - `public/showcase/listing-to-close/` — last touched Jul 5 (email-hero-mirror)
  - `public/showcase/launch-blitz/` — last touched Jul 2 (portrait upgrade)
  - `public/showcase/agent-launch/` — last touched Jul 6 (SocialBoard rework)
  - `public/showcase/market-pulse/` — last touched Jul 2 (capture script commit)
- These are 14-18 days stale as of 07/20, i.e. OLDER than the seed-preview
  captures, and cover a much larger span of intervening template/block
  changes (footer, agent-card, block schema, etc.) — much higher a priori
  odds of visible drift than SeedGallery, though a pixel-level diff wasn't run
  (out of scope for this diagnosis-only pass — no browser, no live render).
  Notably: `default-docs.ts` carries a comment (lines 109-117) documenting
  that the `agent-card.bio` Lorem-instruction bug ("A short bio that builds
  trust with your readers" literally rendering into a SENT email) was "verified
  live on 07/13" and only fixed by defaulting `bio: ""`. The CampaignExamples
  captures (Jul 2 - Jul 6) predate that fix's verification date, so if any of
  those 4 campaign recipes render an agent-card block with an unfilled bio,
  the committed screenshot may show that exact bad Lorem sentence as if it
  were real product output.

## Overall answer
Yes, /showcase is still architecturally the same "commit a screenshot, never
re-check it" pattern the 07/13 incident found — confirmed present TODAY across
BOTH image galleries (SeedGallery + CampaignExamples), not just one. One
section (ShowcaseGrid, the "Visual Templates" viz cards) is genuinely live and
not part of the bug. SeedGallery's actual current images happen to still match
today's template output (checked line-by-line against every SEED_DOCS-relevant
commit since capture) — not because a gate caught anything, but by chance.
CampaignExamples is older, wider in blast radius, unverified pixel-for-pixel,
and has a specific plausible reason (the agent-card bio Lorem bug) to already
be showing wrong content.

Root cause: no freshness gate exists tying `public/showcase/**/*.webp` to the
state of the things they depict — no CI test, no mtime/hash comparison, no
recapture-on-change hook, for EITHER capture script
(`scripts/capture-seed-previews.mts` or `scripts/capture-showcase.mjs`).
