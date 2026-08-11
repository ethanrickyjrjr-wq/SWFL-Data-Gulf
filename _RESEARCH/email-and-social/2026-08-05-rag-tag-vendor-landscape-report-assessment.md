# Vendor-landscape report ("RAG/TAG grounding, QuickChart, Bannerbear-class, WaveGen syndication") — assessed against our own code

**Date:** 08/05/2026
**Input:** operator-supplied research report, "Automated Design, Verification, and Multi-Platform
Syndication of Dynamic, Data-Grounded Email Campaigns" (generic vendor survey — RAG vs TAG
grounding, QuickChart, Bannerbear/Placid/Orshot/DynaPictures/Contentdrips/Pictify, Rasa.io,
Activepieces/Make.com orchestration, WaveGen.ai social syndication).
**Method:** RULE 0.4/0.5 — read our own `_RESEARCH/` first, then probed the actual code
(`lib/email/`, `lib/social/`, `lib/deliverable/`, `lib/charts/`) before judging any claim in the
report. No crawl4ai needed — every claim in the report was checkable against vendor names we
already have prior live research on, or against our own architecture directly.
**This is an assessment, not a build.** Nothing in the codebase changed. Two checks opened for the
genuine gaps found (see bottom).

---

## Executive verdict

**The report is mostly a description of a worse version of what we already built**, using
different vocabulary (RAG/TAG, QuickChart, Bannerbear). It independently arrives at the same
architecture we already committed to — deterministic data binding, LLM for narration only,
validator gates before send — which is useful as outside confirmation, not as new instruction.
Two genuinely new, narrow, actionable items surfaced; everything else is either already built
better in-house or a poor fit for our one-agent-to-one-client model (vs. the report's
associations/newsletter-at-scale framing).

---

## Point-by-point

### 1. RAG vs. TAG grounding — we are already TAG, and knew it

The report's core distinction (vector-similarity RAG for unstructured docs vs. exact-query TAG for
numeric/transactional data, feeding a "dedicated model for calculation, LLM for narration only")
is **literally Brain Factory rule #2**: "Deterministic math, narrative prose." Already confirmed
independently in `_RESEARCH/email-and-social/2026-07-30-email-creation-on-user-data-competitor-scan.md`
§4b: Gamma (the market leader in AI-composed documents) **prompts** its charts — "non-deterministic
… may vary across runs, even with identical inputs," no chart-type binding — while we **bind**
(`bindFrameSpec` / `pick-frames.ts`, `lib/deliverable/bind-frame.ts`). That file's own verdict:
"Gamma prompts charts, we bind them." This report's Terno.ai/CFO Studio examples are the same
pattern under different vendor names. **No action — this confirms the architecture, doesn't add
to it.**

We do not run a RAG layer over unstructured docs (wikis, whitepapers) because we don't have that
kind of source material to ground on — our grounding source is the structured SWFL lake
(`/api/b/master`), which is a TAG problem end to end. Adding a vector DB here would be solving a
problem we don't have. **Correctly not built.**

### 2. QuickChart (URL-encoded Chart.js → static image for email)

We already do the underlying job — render a chart to a static image so it survives email clients
that strip scripts — but **more rigorously**: `lib/charts/spec-to-image.ts` / `lib/email/spec-to-png.ts`
/ `lib/email/chart-image.ts` render brand-token-bound, WCAG-contrast-checked SVG→PNG server-side, off
the same typed `ChartSpec` registry the in-app charts use (`components/charts/registry/`). QuickChart
is a third party seeing our data pass through their URL/service; ours never leaves our own render
path. **Verdict: do not adopt — would be a regression** (external dependency, provenance and
contrast guarantees lost, no gain since we already solved the underlying problem).

### 3. Bannerbear / Placid / Orshot / DynaPictures / Contentdrips / Pictify (templated branded graphics)

Same shape as #2: `lib/social/render-social-image.ts` + `lib/charts/social-card.ts` already do
template-to-branded-image rendering (resvg), and it's the *harder* version of what these vendors
sell — brand-token bound (`lib/brand/tokens.ts`, no raw hex allowed, ESLint-enforced), WCAG-verified
per role/theme/format (`system.test.ts`), with a proven-live Bluesky carousel mechanic
(`lib/social/CLAUDE.md` §0.1) none of these vendors' generic template engines would give us for
free. Orshot's "Smart Stacking" (auto-resizing responsive templates) is a legitimately interesting
idea for our own template layer, but re-platforming onto a vendor now would mean losing the
brand/contrast binding we already built and verified — not worth it. **Verdict: no adoption; noted
as a UI-idea (auto-resize templates) for our own system, not a vendor switch.**

### 4. Terno.ai SQLShield (AST-level SQL validation on LLM-generated queries)

Doesn't apply to us the way it applies to them: **we never let an LLM generate SQL against the
lake.** Every lake read goes through typed functions (`loadMarketFigures`, `fetchLakeParts`,
`/api/b/master`) that the AI calls as tools with fixed shapes — there is no NL→SQL surface to
validate in the first place. This is a stronger position than Terno's (we removed the injection
class instead of validating around it). **No action — confirms current design.**

### 5. Alhena AI / Tidalwave deterministic compliance checkers

Matches our validator gate stack directly: `spec-validator`, `facts-only-lint`,
`inference-bait-lint`, `smoothing-lint`, `narrative-lint` (`lib/deliverable/narrative-lint.ts`) all
run as hard gates before a document ships, same shape as Tidalwave's "deterministic compliance
checker [that] ensures the model never provides unauthorized advice." **No action.**

### 6. Rasa.io (per-subscriber unique-content newsletter curation from a pool)

Poor fit for us. Rasa.io solves "one association, thousands of subscribers, no two get the same
email" by picking from a shared content pool per reader's click history. Our unit is one agent
sending to their own client list about their own listings/market — there's no shared content pool
to personalize *from*, and per-subscriber content-mixing isn't the product. **Correctly out of
scope — do not build.**

### 7. Activepieces/Make.com two-loop orchestration (hourly harvest → weekly generate)

This pattern exists to aggregate *external* RSS/blog content into a newsletter. We don't aggregate
external content — our content **is** the lake (our own first-party data), so there's no harvest
loop to build. The cadence/cron half of the pattern we already have (`ingest/cadence_registry.yaml`,
GHA cron wrappers). **No action.**

### 8. WaveGen.ai — newsletter copy → multi-platform social syndication (carousels, vertical video, first-comment auto-link)

**This is the one real hit.** WaveGen's product is exactly the seam `lib/social/CLAUDE.md` already
names as a known, unwired gap:

> "Two systems, still unwired... `lib/social/` (the complete publish/schedule engine)... vs.
> `lib/email/social-calendar/` (the lab's 'Generate Week,' which composes posts as `EmailDoc`). The
> seam is `SocialModel` vs `EmailDoc`. They are not connected."

WaveGen turning a newsletter into LinkedIn carousels/Instagram slides/vertical video, with an
auto-posted first comment carrying the subscription link, is a live market validation that this
exact seam (compiled deliverable → syndicated social assets) is a real, sellable product shape —
not just an internal nice-to-have. Two concrete, previously-unbuilt pieces from it, neither
currently tracked as a check:

- **LinkedIn native PDF/document carousel.** Our own 08/04 social-copy research
  (`2026-08-04-social-copy-and-graphics.md`) already flagged this as underused-and-good-fit
  ("LinkedIn's single highest-engagement format... only 4.88% of profiles use it regularly");
  WaveGen independently building a whole product around it is a second, external signal. We have
  the Bluesky video-carousel mechanic (`listing-card-render.ts` + ffmpeg) but nothing that emits a
  LinkedIn document-carousel PDF.
- **Auto first-comment carrying the link.** WaveGen's "Audience Redirection" — post the visual
  asset clean, then auto-comment the link — sidesteps the link-in-body penalty our own research
  already measured as real and severe on X (Buffer, 18.8M posts, ~0% engagement with a link in
  body) and disputed-but-real on LinkedIn. We currently have no first-comment mechanism anywhere in
  `lib/social/`.

Both are genuinely new findings from this report, not restatements. **Two checks opened below** —
scoped narrow (one format, one mechanic), not "build WaveGen."

---

## What NOT to do with this report

- Don't stand up a vendor chart/image service (QuickChart, Bannerbear-class) — we already have the
  harder, brand-bound version in-house and switching would be a regression.
- Don't build a RAG/vector layer — we have no unstructured source material that needs one.
- Don't build Rasa.io-style per-subscriber content mixing — wrong unit of personalization for our
  product.
- Don't stand up an RSS-harvest loop — we don't aggregate external content, we ARE the data source.

## What to actually adapt

1. **LinkedIn native document/PDF carousel** — new content format, real engagement data behind it
   twice over now. Check: `social_linkedin_pdf_carousel_format`.
2. **Auto first-comment link mechanic** for any platform where link-in-body has a measured or
   suspected penalty (X confirmed, LinkedIn disputed). Check: `social_first_comment_link_mechanic`.

Both are additive to the existing `lib/social/` publish engine — neither requires adopting any
vendor from the report or touching `lib/email/social-calendar/`'s EmailDoc path directly; the
underlying EmailDoc↔SocialModel wiring gap they'd eventually want is already named in
`lib/social/CLAUDE.md` and is a separate, larger decision for the operator, not decided here.
