# Grid Lab Socials — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the paid (`/email-lab/grid`) social surface actually usable — let a user generate, schedule, track, and tailor real-data social posts that flow into the publish engine that already runs.

**Architecture:** Wire the lab panel to the **already-complete** `lib/social` engine (compose · 5 channel adapters · OAuth token store · `social_schedules` cadence · cron worker `scripts/social/run-schedules.mts` · live `social-scheduler.yml`, all DRY-gated by `SOCIAL_PUBLISH_ENABLED`). Nothing about the backend is a new build. The gap is the **product surface**: there is no path that writes a `social_schedules` row from the lab, no status model, and the AI captions/visuals don't yet tailor per platform.

**Tech Stack:** Next.js App Router (route handlers), TypeScript, Supabase (`social_schedules` / `social_posts`), `@resvg/resvg-js` (PNG raster, already wired in `lib/social/render-social-image.ts`), Anthropic for caption synthesis (existing `build-week.ts`).

**Registered build:** check `grid_lab_socials_live_verify` (open). Spec: `docs/superpowers/specs/2026-06-30-grid-lab-socials-design.md`. Source handoff (verified): `docs/superpowers/handoffs/2026-06-29-grid-lab-socials.md`.

---

## Global Constraints

Every task implicitly includes these — copied verbatim from project rules + the handoff's verified REVIEW section.

- **Paid-only, via the dial.** Socials is `FEATURE_ROUTING.socialCalendar = "paid-only"`. Read `capabilitiesFor(tier).socialCalendar` — never hardcode the tier check. `lib/email/lab/capabilities.test.ts` enforces it; do not relax that test.
- **Publishable (5) ≠ displayable (8).** Any schedule/publish target picker offers **only** the 5 `Platform` union members (`x | facebook | instagram | linkedin | google_business` — `lib/social/types.ts`). The 8 in `lib/email/social/platforms.ts` are display/branding only; `tiktok | youtube | pinterest | threads` have **no adapters** and must never be a fireable target.
- **No-invention moat.** Every number in a caption or on a card names a real source (our lake → user upload → named web → user figure). A missing stat omits the block — never `$0`/`N/A`/`—`. `renderSocialImage` already enforces this; captions go through `build-week.ts`'s four-lane prompt.
- **DRY invariant.** Scheduling writes a recipe + `frozen_post` ONLY. It never calls `postToChannel` and never fires a live post. Publishing is the cron's job, gated by `SOCIAL_PUBLISH_ENABLED`.
- **One root for platforms.** Read `lib/social/types.ts` `Platform` (publish) and `lib/email/social/platforms.ts` (display). Never copy a platform list.
- **Clean output.** As-of dates render MM/DD/YYYY, stated once. No internal IDs/jargon on anything user-facing.
- **Don't build a new scheduler.** Reuse `lib/email/schedule-cadence.ts` (`computeNextRunAt`, `formatScheduleSendTime`, `CadenceSpec`), `lib/deliverable/parse-scope.ts` (`parseDeliverableScope`), `lib/claim/claim-store.ts` (`claimOnce`), `lib/social/idempotency.ts`, and `lib/social/cadence-reuse.ts`.

---

## ⛔ DECISION GATE (C1) — operator's call, blocks Tasks 5 & 6 only

> **RESOLVED 2026-06-30 → NEITHER (a) NOR (b). A canvas-native composer.** After brainstorming + an in-session crawl4ai pass, both branches were rejected: Satori/`@vercel/og` is flexbox-only (can't ingest `compile-grid` HTML, adds a 4th render engine), and headless chromium is heavy infra while the email grid HTML is the wrong shape for a fixed-size image anyway. A social post IS a fixed-size image, so it composes on a Canva-style canvas (Konva/Fabric) where preview == export via `toDataURL` — no chromium, no Satori; the pros (Polotno/Predis) build on this. **Tasks 5 & 6 are superseded by** `docs/superpowers/specs/2026-06-30-social-canvas-composer-design.md` (build check `social_canvas_composer_live_verify`). The historical fork below is kept for context.

**The composition seam is a genuine fork, not a freebie.** A social card is composed two incompatible ways in the tree today:

- **Engine** composes a `SocialModel` — ONE headline + ONE stat + optional chart → one SVG → PNG, at 4 platform sizes (`lib/social/render-social-image.ts`). This is a **bespoke single-template** composer; it cannot rasterize an arbitrary EmailDoc grid.
- **Lab** composes an `EmailDoc` — a block list. `loadSocialCard` in `EmailLabGridShell` just stacks EmailDoc blocks full-width — a shim across the two models.

"Native grid composition" (handoff #3) and "image export" (handoff #4) are the **same** decision:

- **(a) SocialModel-on-grid** — constrain social cards to the headline/stat/chart template. Then `renderSocialImage(format)` gives per-platform PNGs **for free** (cheap, ships fast). BUT "compose freely on the grid" is limited to that one template.
- **(b) EmailDoc→PNG** — a card is a rich EmailDoc grid, rasterized per platform size. True grid composition — the real "create in the grid" the operator asked for — BUT **that rasterizer does not exist** (`compile-grid` emits HTML; resvg can't render HTML; needs a net-new Satori / `@vercel/og` / headless path).

**Recommendation:** ship Tasks 1–4 first (all seam-independent, all high-value), then decide (a) vs (b) deliberately. My lean: start (a) to get per-platform PNGs shipping on the existing rasterizer, treat (b) as a fast-follow if users hit the template ceiling. **This is Ricky's call** — do not start Task 5 or 6 until it's made.

---

## Task Index & Build Order

| # | Task | File | Seam-gated? | Touches shared shell? |
|---|------|------|-------------|------------------------|
| 1 | Wire "Schedule this post" → persist `social_schedules` + freeze | `task-1-schedule-wiring.md` | no | 🔴 yes |
| 2 | Lab status model (Draft → In review → Approved → Scheduled → Live) | `task-2-status-model.md` | no | 🔴 yes |
| 3 | Per-platform caption variants + audience/network/tone/goal knobs | `task-3-per-platform-captions.md` | no | no |
| 4 | Confirm (don't rebuild) caption provenance | `task-4-caption-provenance-audit.md` | no | no |
| 5 | Native grid composition of social cards | `task-5-composition-seam.md` | **YES (C1)** | 🔴 yes |
| 6 | Platform-correct image export wiring | `task-6-image-export-wiring.md` | **YES (C1)** | 🔴 yes |

**Recommended order:** 1 → 2 → 3 → 4 (shipped). C1 **resolved 2026-06-30 → canvas composer**; Tasks 5 & 6 are superseded by `docs/superpowers/specs/2026-06-30-social-canvas-composer-design.md`.

### Parallel Safety (hand-authored — cross-task)

> Tasks sharing a badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2, Task 5, Task 6 | `components/email-lab/EmailLabGridShell.tsx`, `components/email-lab/SocialCalendarPanel.tsx` |

- **Tasks 3 and 4 carry no badge** — they touch `lib/email/social-calendar/*` and tests only, so they parallelize freely against the 🔴 chain.
- Within 🔴, run strictly in order (1 → 2 → 5 → 6); each rebases on the prior.

---

## What's already built (do NOT rebuild)

Verified by opening the files this session (RULE 0.5):

- `lib/social/render-social-image.ts` — branded, watermarked PNG at 4 sizes (`square` 1080×1080, `portrait` 1080×1350, `landscape` 1200×630, `story` 1080×1920) via resvg. No-invention enforced. **Item #4 is wiring, not a build.**
- `app/api/social/render/[format]/route.ts` — render endpoint already exists.
- `lib/social/channels/index.ts` — `never`-guarded switch over the 5 publishable platforms; 5 live adapters (`x/meta/linkedin/gbp`).
- `lib/social/{publish,targets,recipients,compose,build-content,lifecycle,engagement,idempotency,cadence-reuse}.ts` + `oauth-tokens.ts` + `connect/oauth-config.ts` — full publish/schedule/engagement engine.
- `scripts/social/run-schedules.mts` + `.github/workflows/social-scheduler.yml` — live cron worker, DRY-gated.
- `lib/email/social-calendar/build-week.ts` — four-lane sourced Generate-Week; `webSources` ride back on `WeeklyCalendar`. **Item #5 is a confirmation audit, not a rebuild.**

**The one real gap:** the U2 "confirm → INSERT `social_schedules`" flow (`SOCIAL BUILD/U2-ask-ai-schedule-and-compose.md`) is a **spec, not shipped code** — nothing in the product surface writes the rows the cron reads. Task 1 closes that gap from the lab.

---

## Self-Review (against the handoff)

- Handoff #1 (schedule) → Task 1. #7 (status/calendar) → Task 2. #2/#6 (per-platform + create knobs) → Task 3. #5 (provenance) → Task 4. #3 (native composition) → Task 5. #4 (image export) → Task 6. **All seven covered.**
- The seam (handoff REVIEW C1) is surfaced as the decision gate, not buried in a task.
