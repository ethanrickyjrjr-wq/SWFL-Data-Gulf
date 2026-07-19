# DELIVERABLES — the map (start here)

> Want to find or change something in the email / PDF / deliverable system? It's listed here.
> One line per surface: what it is → the file → its single root. Status as of 06/26/2026.

## The two render systems (this is the scatter to know about)

There are TWO ways a deliverable gets rendered. Knowing which one you're in saves hours.

**System 1 — Block-canvas `EmailDoc`** (the Email Lab builder's output; the future)
- Build (AI): `app/api/email-lab/ai/route.ts` — prompt → patches an `EmailDoc`.
- Doc shape + schema: `lib/email/doc/schema.ts` (+ `types.ts`, `default-docs.ts`).
- → HTML: `lib/email/blocks/EmailDocRenderer.tsx` via `app/api/email-lab/render/route.ts`.
- → PDF: `lib/pdf/` (`renderEmailDocToBuffer`) via `app/api/deliverables/[id]/pdf/route.ts`. **The one PDF root.**
- Chart for it: `lib/email/chart-image.ts` (`trendChartSvg` → `svgToPng` → `hostEmailPng`).

**System 2 — Grounded-report templates** (the scheduler / blast path; the legacy)
- Render (email + pdf skins): `lib/deliverable/grounded-report.ts` (`renderGroundedReport`) — relocated out of `lib/email` 07/19.
- Templates: `lib/email/templates/template-registry.ts` (8 slugs) + `render-template.ts`.
- Used by: `app/p/[id]/page.tsx`, `app/p/[id]/print/route.ts`, and the activation wrapper `lib/email/activation/render.ts` (the blast route and scheduler are EmailDoc-only since the 07/19 rip).

**The disconnect (the heartbreak):** the scheduler (`run-schedules.mts`) only knows System 2 templates. It has ZERO reference to an `EmailDoc`. So an email built in the Lab (System 1) **cannot be scheduled or sent.** Connecting them is blueprint node N6.

## Web report deliverables (slot model — already works)
- Page: `app/p/[id]/page.tsx` → `components/charts/ChartBlockView.tsx` (saved chart) + `components/charts/registry/FrameRenderer.tsx` (live-bound chart).
- Build/freeze: `lib/deliverable/build.ts` (narrative over frozen filed items), `lib/deliverable/templates.ts`.

## The single roots (change once, everywhere)
- Currency formatting: `lib/charts/format.ts` (`formatAxisTick` / `formatChartValue`, millions branch).
- Date display: `lib/format-date.ts` (`formatDisplayDate`, `formatAxisDateLabel`) + `lib/project/as-of.ts` (`asOfFromToken`/`asOfFromIso`). MM/DD/YYYY.
- Brand: `lib/email/templates/resolve-brand.ts` (`resolveUserBrand`) + `lib/deliverable/brand-theme.ts` (`BrandTheme`, `extractBrandTheme`).
- AI context (4 of 5 surfaces): `lib/fetch-brain.ts` (`fetchBrain` + `buildDossier`). Email Lab is the outlier (HTTP `/api/b/master`) — node N1.
- Consumer voice scrub: `refinery/render/speaker.mts` (`sanitizeProse`) — deterministic surface only; the chat path (`lib/highlighter/grounding.ts`) is NOT scrubbed.
- Send: Resend transactional `emails.send` (no shared wrapper) + `lib/email/outreach/send.ts` (`sendBatches`, batch).

## Send surfaces (every place email actually leaves)
`app/api/deliverables/[id]/blast/route.ts`, `app/api/email/broadcast/route.ts`, `app/api/waitlist/route.ts`, `app/api/webhooks/resend/route.ts`, `scripts/email/{build-digest,send-test,outreach-campaign,outreach-drip-run,run-schedules,run-activation}.mts`, `scratch-send-oneoff.mts`.

## Companion docs
- Quality bar (what great looks like): `docs/email-marketing/QUALITY-BAR-data-deliverables.md`.
- Wiring map (the fix nodes N1–N10): `DELIVERABLE-ENGINE-BLUEPRINT.md`.
- Code-proven problem verdicts: `PROBLEMS-SCOPED-AGAINST-CODE.md`.
- PDF capabilities: `docs/superpowers/specs/2026-06-24-pdf-capabilities-map.md`, `lib/pdf/README.md`.
