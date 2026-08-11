# Addendum — 4 more handed-in reports are the same source material restated

**Date:** 08/05/2026 (same day as the parent assessment)
**Input:** 4 more operator-supplied files ("Technical Framework for Deterministic and
Hallucination-Free Enterprise Generative Communication," "The 'Design Once, Generate Many'
Revolution," "2026 Newsletter Operations," "The Magic of Grounding"). All four are paraphrases of
the same underlying NotebookLM source as the report assessed in
`2026-08-05-rag-tag-vendor-landscape-report-assessment.md` — same vendors verbatim (Terno.ai/
SQLShield, CFO Studio, Tidalwave, Alhena AI, QuickChart formula, Bannerbear/Orshot, eesel AI,
Feedbin+Relevance AI), same RAG/TAG framing, in places identical sentences. **Not re-derived** —
the parent file's verdicts stand unchanged: TAG/deterministic binding, brand-bound chart+image
rendering, and the validator gate stack are all already built and already stronger than what's
described; RAG/Rasa.io/RSS-harvest remain correctly out of scope for our data shape and product
unit.

## What's actually new across these 4, checked against code (not re-answered from the parent file)

- **eesel AI's "94% voice match accuracy"** (repeated 3× across these files) — same tool already
  assessed 07/30/2026 (`2026-07-30-email-creation-on-user-data-competitor-scan.md`): a
  research/drafting teammate, no data-binding tools. The specific number doesn't change that
  verdict.
- **Creatomate** (timeline-keyframe programmatic video) — new name, not previously assessed. We
  already have a working, proven-live video pipeline for a harder case (Bluesky carousel:
  `listing-card-render.ts` + ffmpeg `xfade=slideleft`, `lib/social/CLAUDE.md` §0.1). No gap.
- **PostHog + Loops.so "behavioral trigger" stack** (event tracking → re-engagement email, e.g.
  "visited pricing page 3×") — checked live: `posthog-node` sits in `bun.lock` as a transitive
  dependency only; grep of `lib/`/`app/` for an actual import returns nothing. So this pattern is
  genuinely unbuilt. **Not filed as a gap** — it's a SaaS product-led-growth pattern (usage-event
  → re-engagement), and our product unit is an agent sending to their own client list about their
  own listings/market, not a self-serve app with usage events to react to. Same poor-fit
  conclusion as Rasa.io in the parent file, for the same reason.
- **Subject-line A/B variants ("SubjectLine.com/Claude," Adobe's 20–26% open-rate lift)** — already
  has real, detailed architecture on file: `docs/superpowers/plans/2026-07-09-subject-cta-ai-variants.md`
  (cohort-hash split test, two-proportion z-test gate, no-invention anchor check on variant text).
  Not a new finding — a known plan, status not re-verified here (out of scope for this pass).
- **SPF/DKIM/DMARC checklist item** — already built: `lib/email/deliverability/dmarc.ts` +
  `/settings/deliverability` panel + `deliverability-status` route. No gap.

## Verdict

No new checks opened. Nothing here survives contact with our own code as a genuine, unbuilt,
good-fit gap beyond the two already filed in the parent assessment (LinkedIn PDF carousel,
first-comment link mechanic). If more files from this same source arrive, they can be assumed
duplicate unless they name a vendor or mechanic not already listed above and in the parent file.
