# Public /guides hub — Figma-style best-practices pages

**Date:** 2026-07-09
**Check:** `guides_hub_live_verify`
**Operator decisions ratified in-session:** public hub · flagship trio · homepage cross-link
strip only · typed registry + one template · real artifacts as figures · nav entry in Explore.

## Problem

We show what we can build (27 filled previews on /showcase, live charts, the grid lab), but
nothing on the site says **why** we build that way or teaches a visitor to get the most out of
it. Operator framing (07/09): "we show what we can build, but how do they know that is what we
are selling?" Three strands named:

1. Why we build the way we build (the sourcing/computed-not-guessed methodology).
2. Why we send emails the way we send (grid, layout rules, scheduling discipline).
3. How to take advantage of features that aren't laid out anywhere (hidden capabilities).

Adjacent problems named but NOT this build: a full homepage visuals pass, and better
explaining inside outbound email campaigns themselves. Both get their own passes later; this
build adds exactly one homepage section (§6).

## Research (RULE 0.4, crawl4ai 07/09/2026 — figma.com/best-practices, 3 pages)

Figma's best-practices hub is the model (https://www.figma.com — source homepage citation):

- **Two-tier hub:** deep-dive "Best Practice Guides" + bite-size "Tips and tricks", each a
  card grid of title + 1–2 sentence description + image, with "See all" links.
- **Repeatable article anatomy:** full anchor TOC up front → pain-point hook intro
  ("Registration-flow-v1-final10.jpg, anyone?") → "here's what you can expect" bullets →
  sections where each approach is framed as *"best for [situation]"* with a concrete
  real-company example and trade-offs — decision guidance, never a feature dump.
- **Hidden features taught inline:** "Pro-tip" asides and Easter eggs sprinkled through the
  article (the exact mechanic for our strand 3).
- **Every section exits into the product:** community files / templates to "try it now".
- **The rhetorical move:** Figma sells the tool by teaching the craft. Explaining why a
  constraint exists reframes it as expertise, not limitation. That is exactly our
  computed-not-guessed / layout-rules story.

Supporting research already in-repo (not re-crawled): stripo/RGE/NN-g gallery findings
(2026-07-09 template-preview-gallery spec) and the fence-system research base
(2026-07-08-email-grid-fence-system-design.md — "AI design output reverts to generic
defaults unless mechanically prevented", arXiv 2605.15124).

## Goal

A public, SEO-visible `/guides` hub that converts by teaching: three flagship pieces that
answer the three strands, built from real product artifacts, every piece deep-linking back
into /showcase and the lab. One homepage strip points at it.

## What we're building

### 1. Content model — typed registry, one template

- `lib/guides/types.ts` — `GuideDef`: `slug`, `title`, `kind: "guide" | "tips"`,
  `description` (card copy), `hook` (intro), `expect: string[]`, `sections: GuideSection[]`.
  `GuideSection`: `id` (anchor), `heading`, `bestFor?` (italic tagline), `body` (paragraphs),
  `proTips?`, `figure?` (`ArtifactFigure`: src under `public/`, alt, caption, asOf
  MM/DD/YYYY, provenance line), `tryIt?` (`{ label, href }`).
- `lib/guides/registry.ts` — ordered `GUIDES: GuideDef[]`.
- Content files: `lib/guides/sourced-numbers.ts`, `lib/guides/email-design.ts`,
  `lib/guides/builder-tips.ts`.

### 2. Routes

- `app/guides/page.tsx` — hub. One-line hero, then two card bands like Figma's: "Guides"
  (deep dives) and "Tips & hidden features". Static; three cards in v1.
- `app/guides/[slug]/page.tsx` — `generateStaticParams` from the registry, `notFound()` on
  unknown slug, `generateMetadata` per guide (title/description/OG image from the guide's
  lead artifact figure).
- `app/sitemap.ts` — add `/guides` + each slug.

### 3. Components (`components/guides/`)

`GuideCard`, `GuideToc` (anchor list, sticky aside on desktop), `BestFor`, `ProTip`,
`ArtifactFigure` (real product output + provenance caption + as-of date), `TryIt` (banded
CTA deep-linking into /showcase or the lab), article shell composing them, related-guides
footer. Layout uses `h-full`/`dvh` per house standard; visual language follows the existing
marketing surfaces (PageShell/landing patterns), flat bordered cards, no new design system.

### 4. Copy rules (hard, same discipline as the product)

- Plain English only. No internal nouns — never "fence", "pack", "brain", "master", "lane"
  in user-facing copy ("layout rules the AI can't break", "the four places a number can
  come from").
- No figure appears without a real source; reuse already-sourced artifacts (preview-fill
  values, committed chart SVGs) wherever a number is shown. As-of dates MM/DD/YYYY.
- No competitor trash-talk; the "AI emails all look the same" hook cites the research
  finding, not a competitor.
- Plain-prose sections; tips are short cards. No blockquote/table walls.

### 5. The flagship trio (content outlines)

**Guide 1 — "Where every number comes from"** (`sourced-numbers`, kind: guide)
Hook: one invented number in a client email costs the relationship. Sections: the four
places a number can come from, in order (our data → your upload → a named public source →
a figure you hand us); math is computed in code, the AI only writes prose; a gap fills from
the next source — never refused, never invented; citations + as-of dates ride with every
send. TryIt: build in the lab, open the sources list.

**Guide 2 — "Why our emails look the way they do"** (`email-design`, kind: guide)
Hook: AI-built emails famously converge on the same generic look — ours structurally can't.
Sections: the 12-column grid + blessed proportions (constraint is where polish comes from);
headline number first (reader-first structure); color discipline + contrast floors; photo
ratios (MLS-standard 3:2/4:3, headshots 4:5); send mechanics — scheduling, tracked links,
one-click unsubscribe. TryIt: open a template from /showcase.

**Guide 3 — "N things the builder does that you might miss"** (`builder-tips`, kind: tips)
The published title's count is whatever survives verification (10 candidates below), EACH
verified in code during implementation — anything unconfirmed is cut, not softened: image blocks carry a link with tracked clicks (`kind`/`linkUrl` on image
blocks); charts from your own figures or uploads; send-to-self preview
(`SendToSelfModal`); scheduled sends + social calendar (`ScheduleSendModal`,
`SocialCalendarPanel`); set brand once, applied everywhere (brand bridge); the same doc
exports to PDF (`/api/deliverables/[id]/pdf`); phone preview; 27 templates as starting
points (/showcase seed gallery); undo/redo history; in-lab photo editing
(Filerobot/Photopea). Each tip: 2–3 sentences + artifact or mini-capture + deep link.

### 6. Homepage strip

`components/landing/GuidesStrip.tsx` — "Why agents trust what we build": three cards
reusing the guide card art, linking to the three pieces. Inserted in `app/page.tsx` after
`DeliverableShowcase`. The ONLY homepage change in this build.

### 7. Nav + footer

`components/nav/nav-config.ts`: add `{ label: "Guides", href: "/guides" }` to the
**Explore** dropdown children (marquee top-level slots stay reserved per the config's own
doc); update `nav-config.test.ts` in the SAME commit (pinned shape test). Add a Guides link
to `SiteFooter`.

### 8. Testing / verification

- `lib/guides/registry.test.ts` (bun:test): slugs unique; every section `id` unique within
  its guide and every TOC anchor resolves; every `ArtifactFigure.src` exists under
  `public/`; every `tryIt.href` is in a known-routes allowlist; every `asOf` matches
  MM/DD/YYYY.
- `nav-config.test.ts` updated with the new Explore child.
- Build verification: `bunx next build` (house rule — not `npx tsc`).
- Live verify (operator-run): `guides_hub_live_verify` — /guides renders with all three
  pieces, artifact figures load, nav + footer + homepage strip link through.

## Out of scope (named so they don't creep)

- Fence/gate implementation — already specced and in flight
  (2026-07-08-email-grid-fence-system-design.md, accent-ink gate ratified 07/09). This hub
  *documents* the philosophy in plain English; it implements none of it.
- Full homepage visuals pass (Lane B spec stays authoritative; only the strip lands here).
- "Better explaining inside email campaigns" — follow-up lane; candidate: weekly-read /
  drip emails linking to these guides once they exist.
- More guides beyond the trio (charts deep-dive, brand setup, campaign strategy) — the
  registry makes each a data-only addition later.

## Build order (for the implementation plan)

1. Types + registry + the three content files (copy drafted from this spec's outlines).
2. Components + article template + hub page.
3. Nav/footer/sitemap wiring + tests.
4. Homepage GuidesStrip.
5. `bunx next build` + operator live-verify.
