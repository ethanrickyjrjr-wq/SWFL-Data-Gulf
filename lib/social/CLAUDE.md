# lib/social/ — social conventions (loads when you edit here)

# §0 — BEFORE YOU BUILD OR POST ANYTHING SOCIAL. READ THIS WHOLE SECTION.

**Locked 08/04/2026 by operator decree, verbatim: *"MAKE SURE IT IS IN THE PLAYBOOK AT THE
BEGINNING OF SOCIAL BUILDS!!!! WE DON'T WANT TO LOSE THE RECIPE."*** It is here because it was
learned by shipping the wrong thing to the live feed.

## 0.1 — THE CAROUSEL RECIPE (Bluesky). Do not re-derive this.

**BLUESKY HAS NO SWIPEABLE MULTI-IMAGE CAROUSEL.** The lexicon has exactly three visual embeds —
`images`, `video`, `external` — and a post carries **ONE** of them.

| You want | Use | What actually renders |
|---|---|---|
| a carousel (auto-advancing) | `app.bsky.embed.video` + **`presentation: "gif"`** | full-width card, autoplays, loops, no player chrome |
| 2–4 photos | `app.bsky.embed.images` | a static **MOSAIC GRID** — and it **CROPS** your cards |
| a link preview | `app.bsky.embed.external` | a link card — and tapping it **leaves the app** |

**The working recipe, proven live 08/03/2026** (`scripts/social/post-listing-carousel.ts --video`):

1. Render N square cards (`lib/social/listing-card-render.ts`).
2. `ffmpeg` → ONE looping mp4: `xfade=transition=slideleft`, 2.5s slides, 0.5s crossfades.
   `slideleft` is what reads as a swipe. Measured: 4 slides → 8.53s, 835,774 bytes, h264 1080×1080.
3. `postToBluesky({ caption, video: { …, presentation: "gif" } })`.
4. The link rides in the post **TEXT** as a `detectLinkFacets` facet — NEVER as an external embed,
   or tapping the card navigates away instead of playing.

**Vendor numbers, fetched verbatim — never assert these from memory:**
- `app.bsky.embed.video`: `accept: ["video/mp4"]`, `maxSize: 100000000` (100 MB),
  `presentation.knownValues: ["default", "gif"]`.
- `app.bsky.embed.images`: **4 images max**; docs.bsky.app says an individual image is limited to
  **1,000,000 bytes**, while the lexicon says `maxSize: 2000000`. **The two vendor surfaces
  disagree.** Target <950,000 and you are safe under either.
- `com.atproto.repo.uploadBlob` accepts `Content-Type: video/mp4` **directly** (probed live,
  200 + normal blob). The separate video-service upload + job-polling flow is NOT required.
- The returned `blob` is embedded **VERBATIM**. Reshape it and the post silently renders empty.

## 0.2 — A JSON READ-BACK CANNOT VERIFY A RENDERING. LOOK AT THE POST.

**The incident this rule is made of (08/03/2026):** shipped a 4-image post, read it back from the
appview, saw `app.bsky.embed.images` / `images: 4` / `external: none`, and reported *"verified live:
4-image carousel."* It was a **2×2 grid**. The operator had to open the app and look. The read-back
was correct about every field it returned — it simply **has no field that answers "is this a
carousel."** Right answer, wrong instrument, and the claim shipped anyway.

**So, before you call any social post done:**
1. Read the record back (proves the embed shape, no external embed, facet count). Necessary.
2. **OPEN THE POST IN A BROWSER AND LOOK AT IT.** Sufficient. `claude-in-chrome` does this.
3. State ONLY what each instrument proved, and **name what you did NOT verify.** Logged-out web
   shows a play button instead of autoplaying — you cannot confirm autoplay from a signed-out
   screenshot, so say so instead of implying it.

This is rule 12's *evidence class* failure shape. It is also why the grid's second defect went
unseen: the 2×2 tiles cropped the cards — `$385,000` clipped by the tile edge, Bluesky's own ALT
badge sitting on the address. **A card composed for one surface does not survive another.**

## 0.3 — INHERITED PLANS ARE HYPOTHESES

The handoff that drove this build asserted *"the carousel behaves like a carousel."* It was wrong,
and it was wrong in the repo, in writing, from a prior session. Committed plans can still be
hallucinated (`feedback_inherited-plan-skepticism`). A vendor-surface claim in a plan gets verified
in-session or it does not get built on.

## 0.4 — WRITING THE POST. Read before typing a caption or picking a size.

**Locked 08/04/2026 by operator decree, verbatim: *"WRITE A HANDOFF TO SONNET TO FIND HOW TO
ACTUALLY WRITE ON SOCIAL MEDIA AND HOW TO MAKE BETTER LOOKING POSTS AND CLICK GENERATING
GRAPHICS."*** Full evidence + every source URL: `_RESEARCH/email-and-social/2026-08-04-social-copy-and-graphics.md`
(3-agent crawl4ai/WebSearch fan-out). Same shape as `docs/standards/emails.md` §0 — numbers, not
prose. **Scope: Bluesky (proven live), X, LinkedIn, Instagram, Facebook** — not TikTok, we can't
execute a TikTok strategy (RULE 11).

### Copy
- **LENGTH is platform-specific and NOT uniformly "shorter is better."** Bluesky caps at 300
  graphemes / 3,000 UTF-8 bytes (official lexicon) — links are NOT auto-shortened, budget for the
  URL. LinkedIn is the one platform that rewards length: **1,301–2,500 chars = a 27% engagement
  lift** over under-400-char posts (AuthoredUp, 372,126 posts, Sept 2025–Feb 2026). Instagram's
  length sweet spot is UNRESOLVED — the one dataset found is stale (2023) and a newer number is
  untraceable. Do not invent a target for Instagram; use judgment, not a fabricated number.
- **LINKS: never in the X post body.** Buffer, 18.8M X posts through 08/2025: link posts from
  regular accounts land at **~0% engagement** vs. ~0.40% for text. **Put the link in a reply.**
  LinkedIn: officially denied as a penalty (LinkedIn's own Sr. Director of Product) but independent
  data reports 18.8–60% reach reduction with a link in-body — write the post to stand alone without
  the link regardless of which side is right. Instagram/Facebook: no vendor statement either way —
  link-in-bio/first-comment is standard practice, not proven.
- **HASHTAGS: real reach, not just aesthetics.** Instagram's Adam Mosseri, on record: hashtags are
  "not a way to get more reach" — search/categorization only. Instagram cut per-post hashtags 30→5
  and killed hashtag-follow 12/2024. On Bluesky a hashtag is a pure cost (eats the 300-grapheme
  budget) with zero proven discovery benefit. No comparable statement exists for X or LinkedIn —
  don't assert a number there.
- **AI-TELL RISK IS PLATFORM-SPECIFIC.** Pangram scanned 1,002,627 posts (04/2026–07/2026):
  **LinkedIn — 40%+ of long-form posts flagged fully AI-generated**, the single worst platform. X —
  23.9%. **The guard is tightest on LinkedIn copy, not uniform across platforms.** The fix is the
  same fix as the no-invention rule (RULE 0.7): specificity — a real address, a real percentage, a
  real day-count — beats generic adjective-stacked prose. Avoid: delve, leverage, synergy, optimize,
  streamline, empower, unlock, seamless, game-changer, unprecedented, "in today's fast-paced world."
- **Real-estate lead-source numbers conflict — report the primary one.** NAR (primary PDF,
  09/18/2025): 39% of Realtors name social their #1 lead source. Zillow (primary PDF, 12/30/2025):
  only 7% of buyers actually discover their agent via social. The 47%/71%-style figures repeated on
  real-estate-marketing blogs trace to no named study — don't cite them.

### Graphics
- **Canvas sizes: no change needed.** Square 1080×1080 / portrait 1080×1350 confirmed exact vs.
  Meta's live ads-guide page. Landscape 1200×630 is fine — the suspected X 1600×900 mismatch is
  FALSE; X's own spec is 1200×628 / 1920×1080 for 16:9. LinkedIn's current spec is 1200×628 (was
  627 — 1px, cosmetic, low priority). Story 1080×1920 confirmed.
- **Safe zones: no drift, no change needed.** Story top 14% / bottom 35% (danger boundary) / sides
  6%; feed formats flat 7% — re-verified, matches `safe-zones.ts` exactly (triangulated across 3
  independent 2026 sources; Meta's own primary page is JS-gated against automated fetch).
- **The 32px minimum-legible-text floor stays `[INFERENCE]`.** No platform, accessibility body, or
  named UX research org (checked Meta, LinkedIn, X, WCAG, NN/g) publishes a minimum in-image text
  size anywhere. This is a confirmed absence — do not backfill it with a guessed number.
- **Scrim/overlay: no vendor opacity spec exists.** Use WCAG contrast instead — 3:1 for large text
  (≥18pt normal / ≥14pt bold), 4.5:1 for body — computed against the actual image, not a fixed %.
- **Text-on-photo density:** Meta's hard 20%-text rejection rule was formally retired 09/2020. A
  softer ranking-signal version is reported in secondary sources but not independently re-confirmed
  this session. No word-count/glanceability threshold exists anywhere — don't invent one.
- **Carousel/slideshow pacing: our 2.5s slide / 0.5s crossfade has zero evidence behind it.**
  Baymard Institute's carousel usability research: **5–7s per slide, up to 10s for text-heavy** —
  roughly double what we ship today. Worth revisiting; the mechanics (§0.1) stay proven and correct
  either way, this is a pacing-only finding.
- **Composition:** NN/g's F-pattern eye-tracking finding — users sweep top-heavy. Put the one
  load-bearing fact (price/address/headline) in the top band, not centered-low.

### What drives clicks (not just likes)
- **Engagement rate and outbound clicks are DIFFERENT metrics — most available data measures the
  wrong one.** Meta's own terminology: "outbound clicks" (leaves the platform — our actual goal) vs.
  "link clicks" (includes on-platform destinations). Buffer's 52M-post 2026 benchmark measures
  engagement, not outbound clicks — treat "link posts underperform" as evidence of reach
  suppression, not proof of what maximizes clicks once someone's looking.
- **We are almost certainly under the follower threshold where format strategy flips.** Metricool +
  HypeAuditor (700M posts, Jan–Jun 2025): under ~50K followers, Reels drive more reach than
  carousels; above it, carousels win both reach and engagement. We're well under 50K.
  **LinkedIn is the exception and the opportunity: native document/PDF carousels are LinkedIn's
  single highest-engagement format (7% vs. 6% video) and only 4.88% of profiles use it regularly** —
  directly matches our market-card content, underused format, good fit.
- **We may be optimizing carousels for the wrong signal.** Instagram's algorithm rewards
  Swipe-Through Rate and Saves, not outbound clicks — those are not the same target as driving
  traffic to swfldatagulf.com. Worth naming when reviewing carousel performance.
- **Two real conflicts, deliberately left unresolved — do not silently pick a side:** (1) LinkedIn's
  official no-link-penalty statement vs. independent reach-drop data; (2) Meta's "less text wins"
  guidance vs. an unsourced "text overlay = more clicks" claim circulating on marketing blogs.
- **No study exists — real-estate-specific or general — isolating price/address/question baked into
  the image as a click driver.** The closest real evidence (a 27,616-experiment headline-concreteness
  field study, *Scientific Reports* 2025) found a curvilinear effect: vague/curiosity hooks help only
  when surrounding content is already vague, and hurt when it's already concrete. Don't assume a
  question-in-the-graphic always helps.
- **Apify scouted for future automation, nothing run/billed:** `apify/instagram-scraper` and
  `apify/instagram-hashtag-analytics-scraper` for niche/competitor performance;
  `trudax/reddit-scraper-lite` for r/realtors-style monitoring (reddit.com itself is blocked to our
  own WebFetch/WebSearch — this is the workaround if that research needs repeating).

---

## THE ONE ROOT RULE — read this before you type a color or a font size

Social had the same disease email had, and for the same reason. Measured 07/14/2026:

- **The house palette lived in FOUR copies** — `design/templates.ts`, `design/serialize.ts`,
  `design/chart-attach.ts`, and `components/email-lab/social/useSocialComposer.ts` — each with its
  own hand-typed defaults. One of them was wrong: the canvas accent was `#0ea5b7`, **a teal that is
  not our teal**. Nobody chose it. Someone typed a teal from memory, three files copied it, and every
  unbranded post we ever rendered shipped in the wrong brand color.
- **TWO unrelated type scales.** The canvas templates sized off `min(W,H)` with eleven magic
  multipliers; `render-social-image.ts` sized off `width` with six different ones.

None of that was laziness — **it was a missing file.** `app/globals.css` was the brand root and said
so ("must use these tokens, NOT the raw hex"), but a canvas has no cascade and resvg cannot parse
CSS. There was nothing to import. So everyone re-typed.

**The two roots, and what each owns:**

| You need | Import | Never |
|---|---|---|
| a brand color | `BRAND.*` — `lib/brand/tokens.ts` | a hex literal |
| a color for TEXT | `ink(role, theme, on)` / `accent(role, theme, on)` — `design/system.ts` | `BRAND.teal` directly on text |
| a decorative fill (CTA bg, rule, chart stroke) | `decor(theme)` | a hex literal |
| a canvas / panel surface | `THEMES[theme].canvas` / `.panel` | a hex literal |
| a font size | `type(role, format)` | a multiplier of `W`, `H`, or `base` |

`lib/brand/tokens.ts` is the **TypeScript mirror of `app/globals.css`**, locked to it by
`tokens.test.ts` (it parses the real CSS and fails on drift). Adding a color? **globals.css FIRST**,
then `tokens.ts`, then watch the test go green.

**A raw hex STRING LITERAL under `lib/social/design/**` or `components/email-lab/social/**` is an
ESLint error.** No allowlist, and none is expected — in this lane a hand-typed hex is never correct.

Scope, honestly: the rule matches `"#rrggbb"` literals, which is what reaches the canvas. It does
**not** catch a Tailwind arbitrary value (`bg-[#0a141a]` inside a `className`) — that string doesn't
start with `#`. Composer *chrome* still has a few of those. They never touch rendered post output, so
they're out of scope for now, not secretly covered.

## Type: five roles, one ladder — and NEVER `min(W,H)`

`type(role, format)` returns **fontSize AND lineHeight AND fontWeight together.** There is no
accessor that lets you pick a size and forget the leading — that omission is what clipped every stat
in email (a text node with no lineHeight silently inherits an absolute 24px box).

Roles, ratio 1.5 from a 32px floor: `display` 162 · `headline` 108 · `title` 72 · `body` 48 ·
`label` 32. Need something smaller? **Step down the ladder with `compact(role)` — do not invent a
multiplier.** `label` is the floor and the floor is enforced.

**Type scales off WIDTH, not `min(W,H)` — and is never scaled UP.** Every one of these surfaces
displays an image *fit to width*, so height never touches how big the text looks. `min(W,H)` was a
vertical-overflow hack wearing a legibility decision's clothes, and it cost landscape (1200×630 — the
only format where height < width) **~42% of its type size**: a label that rendered 30px on a square
rendered 18px on landscape, roughly 7pt once a phone downscales the feed image. **Landscape now gets
exactly the same px as a square.** (Pure width-scaling would give it a 1.11× uplift — technically
right, since it displays wider. It also doubles the overflow below. Not worth ~10% of apparent size.)

**Landscape's real constraint is its 630px height, and now you can CHECK it.** Its content box is
**462px** — the tightest we have by a mile (story's is 1651). A headline+body+CTA stack comes to
517px: it **does not fit**, and that is a fact about a 630px canvas, not a flaw in the ladder.

    fits([{ role: "headline", lines: 2 }, { role: "body", lines: 2 }], "landscape")  // false

**Compact or drop an element. NEVER shrink the type** — buying vertical room by shrinking type is
precisely what `min(W,H)` was doing, on every format at once, to solve a problem only landscape had.

## Color is decided by ROLE, not by theme — so the light theme needs no ternaries

WCAG applies to text baked into an image (Android's a11y docs say so explicitly). The floors:
**4.5:1 normal text · 3:1 large text.** `CONTRAST_FLOOR` binds a floor to each role, and `legibleInk`
demotes anything that misses. **Unreadable is unreachable.**

This is why the light/sand theme is not a per-field ternary in every template. One number, two
verdicts, decided by role:

- `#2a8c85` (dimmed teal) on sand is **3.46:1** → **legal as a metric number** (clears 3:1),
  **illegal as a label** (misses 4.5:1). `accent()` returns it for `display`/`headline`/`title` and
  automatically demotes it for `body`/`label`.
- `#3dc9c0` (full teal) on sand is **1.74:1** → **decorative only.** It may be a CTA fill or a chart
  stroke. It may never be a word. `ink()`/`accent()` will not return it on a light canvas.
- A teal CTA reads **9.15:1 in both themes**, which is why the CTA fill never dims.

Don't take those numbers on faith and don't re-derive them from memory — `system.test.ts` computes
every one across every role × format × theme × surface. Re-tune a brand color and it tells you which
rule broke.

## Two systems, still unwired — know which one you're in

1. **`lib/social/`** — the complete publish/schedule engine (OAuth, `social_schedules`, 5 channel
   adapters, cron). `render-social-image.ts` rasterizes brain-data cards via resvg.
2. **`lib/email/social-calendar/`** — the lab's "Generate Week," which composes posts as `EmailDoc`.

The seam is `SocialModel` vs `EmailDoc`. They are not connected. Publishable (5 platforms) ≠
displayable (8) — gate a platform picker off the `Platform` union in `channels/index.ts`, **not**
`lib/email/social/platforms.ts`.

## Still-open forks (checks, not folklore)

- **The grey ramp landed (07/14/2026):** `BRAND.shellMist/shellLine/shellFill/shellMuted/shellInk`
  (`lib/brand/tokens.ts`, mirrored in `app/globals.css`). `lib/charts/social-card.ts` and
  `lib/social/chart-svg.ts` (the bar-track fill) read it now. `render-social-image.ts`'s `#9CA3AF`
  is deliberately UNTOUCHED — it's rendered as caption/watermark TEXT on a theme-controlled canvas
  (default dark, but a brand can set it light), and the ramp's roles were measured against white
  only. Swapping the literal without re-deriving contrast per-theme would be a silent appearance
  risk, not a dedupe — that work belongs to the item below, not this one.
- `render-social-image.ts` still runs its own type scale AND its own untested color contrast.
  → check `social_render_engine_off_system` (operator look first — it's an appearance change).
- `lib/email/blocks/*` still holds ~30 raw hexes (mostly the same pre-ramp greys, now nameable).
  → check `email_blocks_colour_unfenced`.

## The rule that generalizes

**Extract on copy #2.** A second copy of a fallback is a second brand. If you are about to hand-type
a value that already exists somewhere else in this repo, you are not saving time — you are choosing
which of the two will be wrong later.
