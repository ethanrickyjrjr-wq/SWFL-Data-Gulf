# Social Safe Zones — Meta FIRST-PARTY verification (2026-07-01)

**Target A** of the AI-deliverable-design-quality work. This note re-verifies the load-bearing external
numbers for Social safe zones by fetching **Meta's own docs live via crawl4ai this session**
(`C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`, `AsyncWebCrawler`), per RULE 0.4 — because the source
research doc (`2026-07-01-ai-deliverable-design-quality-research.md`, §3.2) took these numbers from
**billo.app**, a third-party blog citing Meta, NOT Meta directly. "The blog says X" is not verification.

## What Meta's OWN docs state (verbatim, fetched 2026-07-01)

**Source: `https://developers.facebook.com/docs/marketing-api/creative/reels-ads/`** (Meta developer docs,
resolved 301→200, 184 KB fetched):
> "**Build in safe zones so that your messages are clear:** Work within the safe zones so your text sticker
> overlays, calls to action or key messages aren't obscured by the Reels user interface. **Keep the bottom
> 35% of your 9:16 creative free of text, logos, and other key elements.**"
> "**Build in 9:16 video to make your video captivating:** … consider leading with video and resizing it to 9:16."

**Source: `https://www.facebook.com/business/ads-guide/image/instagram-feed`** (Meta ads guide, resolved
301→200):
> "Ratio: **4:5** · Resolution: **1440 x 1800 pixels**" (design recommendation for Instagram feed image ads).

## What Meta's reachable docs did NOT confirm

The precise **top 14%**, **sides 6%**, and **center-80%** numbers from the research doc do **not** appear in
any Meta first-party page I could reach this session:
- Meta's Reels page states only the **bottom 35%** rule + generic "safe zones".
- `facebook.com/business/ads-guide/update/instagram-stories` → **404**.
- `developers.facebook.com/docs/instagram-platform/sharing-to-stories/` (42 KB) → no percentage figures.

So **top-14% / sides-6% / center-80% remain billo.app-sourced only** (a reasonable community interpretation
of the Stories UI chrome, but not Meta-verbatim as of this fetch).

## SECOND crawl4ai pass (2026-07-01) — de-handcuff nuance + top-14% corroboration

Re-fetched to answer: (Q1) does the safe zone constrain ALL content or only key elements? (Q2) do pro
tools enforce or guide? (Q3) is top-14% corroborated beyond one blog?

**Q1 — only KEY ELEMENTS; background is full-bleed.** Meta first-party verbatim (reels-ads page): "Work
within the safe zones so your **text sticker overlays, calls to action or key messages** aren't obscured
by the Reels user interface. Keep the bottom 35% free of **text, logos, and other key elements.**" The
format is "**full-screen, immersive**" — the background image/video fills the whole 9:16 frame. **The safe
zone never constrains artwork; it keeps text/logo/CTA out of the UI-chrome bands.** This is the load-bearing
anti-handcuff fact: full-bleed background + key-elements-only exclusion = zero design lock-in.

**Q3 — top 14% now corroborated first-hand.** `https://sproutsocial.com/insights/social-media-image-sizes-guide/`
(status 200, updated 2024), verbatim: "Leave **14% (250 pixels)** at the top and **20% (340 pixels)** of the
bottom of your creative free of text and logos. This 'safe zone' ensures your key elements aren't covered by
the profile icon or call-to-action prompts." Also: IG Story "**Safe area (text and interactive elements):
1080×1610 pixels**", aspect "**4:5**". So **top-14%/250px is now two independent sources** (billo + Sprout),
and the **bottom is a placement-dependent RANGE: 20% (340px) plain Story vs 35% Reel** — make it a tunable
parameter, default to the conservative 35% for a cross-postable asset.

**Q2 — guide, not clamp.** All sources phrase it advisory ("pro tip," "ensures key elements aren't
covered"). Design implication: composer shows a **soft guide overlay**, never hard-clamps user placement;
rasterizer *lays out* key elements within the band but the build is never refused (RULE 0.7).

**Sides 6%** still billo-only and weakest-evidenced — keep small, tunable, lowest priority.

Net design rule (non-handcuffing): background full-bleed edge-to-edge; only text/logo/CTA/watermark kept
inside a band defined by **tunable** constants (top 14%/250px [2 sources], bottom 35% default / 20% Story
option [Meta+Sprout], sides 6% [billo, soft]); guide overlay not a clamp; never refuse a build.

## Verdict for the spec (evidence-tiered)

| Constraint | Tier | Treatment in spec |
|---|---|---|
| Bottom **35%** of 9:16 reserved (no text/logo/key element) | **Meta first-party, verbatim** | HARD constraint. Enforce in the rasterizer (`composeCardSvg`, `lib/social/render-social-image.ts:184-309`) + Konva composer guide. |
| **9:16** for video, **4:5** (1440×1800) for feed image | **Meta first-party, verbatim** | Shift default OFF square 1:1 (`useSocialComposer.ts:39`, `templates.ts` `formats[0]`, `serialize.ts:5`). |
| Top **14%** exclusion | billo.app secondary | Adopt as CONSERVATIVE margin, labeled non-Meta, tunable constant — not presented as Meta gospel. |
| Sides **6%** each | billo.app secondary | Same — conservative, tunable. |
| Center **80%** width for critical content | billo.app secondary | Same. |
| CTR deltas (~1% image / ~7% video for 4:5·9:16 vs square) | billo.app secondary | Motivation only; do not cite as Meta. |

## Current code state (already scoped this session, RULE 0.5)

- `SOCIAL_FORMATS` (`lib/social/formats.ts:7-26`) holds all four sizes; portrait already declared 4:5.
- **No safe-zone concept anywhere in code** — the server rasterizer uses a flat 7% pad on all four formats
  including story, top-anchored (`render-social-image.ts:197`). A 1080×1920 headline can land in the
  bottom-35% danger zone today. This is the one place current output is arguably *wrong*.
- Neither Haiku prompt (`author.ts:63-99`, `build-week.ts:94-133`) knows any pixel/layout rule.
- Square (1:1) is the de-facto default everywhere.

Fetched via crawl4ai only; no Firecrawl, no WebFetch, no memory.
