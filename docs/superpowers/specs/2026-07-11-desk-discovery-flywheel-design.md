# Desk discovery + backlink flywheel (Spec B: GEO / Dataset / widget / llms.txt / robots)

**Date:** 2026-07-11 · **Check:** `desk_discovery_flywheel_live_verify`
**Companion:** Spec A — `2026-07-11-swfl-data-desk-design.md` (the /desk terminal + filing bridge).
**Why separate:** this is cross-cutting — it makes our public cited-data pages findable and
citable by AI + earns backlinks, and it applies to `/r/*` report pages too, not just /desk. It is
NOT a precondition for shipping /desk (the desk delivers its product value with none of this),
so it lives on its own track.

## Problem

We publish unique, daily-updating, explicitly-cited SWFL data — the single highest-value content
type for AI citation and the proven backlink-magnet pattern (Redfin Data Center / Zillow Research).
Almost no local-RE competitor does GEO or Dataset markup — genuine first-mover edge. But three
things blunt it: (1) our own `app/robots.ts` blocks the answer-engine crawlers that would surface
us; (2) numbers that hydrate client-side are invisible to those crawlers; (3) we don't format
figures as standalone extractable answers or emit rich Dataset schema. This spec fixes 2–3 and
frames 1 as an operator decision.

## The robots.txt decision (operator call — NOT auto-implemented here)

`app/robots.ts` deliberately blocks `PerplexityBot`, `OAI-SearchBot`, `Claude-SearchBot` (answer-
engine index bots) AND `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot` (training bots). This is a
locked, intentional anti-harvest moat. Consequences, verified:

- **Google AI Overviews still reaches us** (Googlebot allowed except `/api/`; blocking
  `Google-Extended` only opts out of Gemini training/grounding, not AI Overviews).
- **Human URL-paste still cites us** (`ChatGPT-User`/`Claude-User`/`Perplexity-User` not blocked).
- But Perplexity / ChatGPT Search will **never surface /desk or /r/* on their own** while their
  index bots are blocked.

**Recommendation (reach without breaking the moat):** for public showpiece paths only (`/desk`,
`/r/*`), allowlist the **index/search** bots (`OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`)
while keeping the **training** bots (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`) blocked
everywhere. That makes the public data citable in answer engines without feeding training corpora
or exposing synthesized brain reports. This is a moat-vs-reach business call — present it, get an
explicit operator yes/no, and only then touch `robots.ts`. Do not fold a robots edit into any build.

## What we build (independent of the robots decision)

1. **Server-render the numbers (correctness + citability).** Every figure + as-of on /desk and
   /r/* must be in server-rendered HTML, not painted after a client fetch. AI crawlers are weak JS
   executors — they cite the HTML they're served. (/desk is already specced as a server component;
   audit /r/* the same way.)
2. **Quotable, extractable one-liners.** Per the Princeton GEO study (KDD 2024), the tactics that
   lift AI citation 30–41% map to: Cite Sources, Statistics Addition, Quotation Addition,
   authoritative/fluent voice. Format: heading = the question, first sentence = the direct answer
   with the number and as-of. E.g. "The median list price in Lee County is $295,945 as of
   07/10/2026, per SWFL Data Gulf." Add a small "the takeaway" line per key module.
3. **Extend Dataset JSON-LD (reuse `lib/jsonld.ts`).** We already emit `@type: Dataset` +
   `dateModified` + `variableMeasured`. Add `temporalCoverage`, `spatialCoverage` (Lee/Collier
   geo), `creator` (Organization), `license`, `isAccessibleForFree: true`. Emit on /desk and /r/*.
   This also makes the pages eligible for **Google Dataset Search** — a discovery channel no local
   competitor uses. Keep the brand description identical everywhere (entity clarity for LLMs).
4. **Freshness signals.** `dateModified` in JSON-LD, visible as-of in text, current sitemap
   `lastmod`. A daily-updating page is a structural recency edge over static competitor pages.
5. **Embeddable, attributed widget (the backlink flywheel).** A small "SWFL median price / weekly
   pulse" embed that renders "Source: SWFL Data Gulf" with a link back. Every embed is a backlink →
   feeds the domain/entity authority AI systems trust → more citations → more discovery. This is
   the Redfin/Zillow loop and the single highest-leverage growth mechanism on the page.
6. **llms.txt (ship it, rank it LAST).** High-quality, differentiated summary listing /desk + key
   /r/* pages. Evidence: +18% Perplexity / +12% ChatGPT-browse citations over 90 days, but summary
   quality dominates and content improvements delivered ~2.4× the lift — so it's the garnish, not
   the meal. ~30–60 min; do it after 1–5.

## Conversion levers (tie discovery to the free-build → paid-send funnel)

- "Turn this into a branded report" on desk/report modules (shared with Spec A's CTA).
- Value-matched email capture: "get the Lee County weekly delivered" → drops into the build/send
  funnel (not a generic popup).
- Deep-link CTAs from /desk to /r/* money pages so the hub distributes authority.
- Watermarked free artifact → paid send (locked model: builds free, send is the paywall).

## Sequence

robots decision (operator) → SSR audit of /desk + /r/* → Dataset schema extension → quotable
takeaways → embeddable attributed widget → llms.txt. Payoff is slow-compounding (discovery +
backlinks + brand trust over months), not a signup spike — treat these pages as top-of-funnel.

## Evidence provenance note

Most GEO percentages come from vendors selling GEO services (directional, flagged [VENDOR] in the
research log); the one primary anchor is the Princeton GEO paper (Aggarwal et al., KDD 2024, held
secondhand via explainer). The Redfin/Zillow backlink precedent and the Google Dataset spec are
solid. Treat the numbers as directional, the mechanisms as sound.

## Verification (closes `desk_discovery_flywheel_live_verify`)

Per shipped piece: numbers present in server-rendered HTML (view-source, not post-hydration);
Dataset JSON-LD validates (Google Rich Results / Schema.org validator) with temporal+spatial
coverage; the embed renders attribution + backlink on a third-party page; llms.txt served at root;
if the robots carve-out is approved, confirm the search bots are allowed and training bots still
blocked for the public paths. Track first AI citations / referral backlinks as the real outcome
signal (months-scale).
