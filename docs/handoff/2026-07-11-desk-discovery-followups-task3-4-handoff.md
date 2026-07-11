# Handoff — Desk Discovery Flywheel follow-ups: Task 3 (robots) + Task 4 (live-verify)

> **Recommended model:** ⚡ Sonnet — keywords: schema

**Date:** 2026-07-11
**Spec (authoritative, read first):** `docs/superpowers/plans/2026-07-11-desk-discovery-followups-plan.md` — Tasks 3 & 4 are fully written there (exact diffs, exact curl commands). This handoff does not re-derive them, it hands off the two things that block starting: an operator decision, and a live deploy.

## What's done (Tasks 1 & 2 — implemented, verified, not yet committed)

- **`desk_takeaway_national_scope_guard` + `desk_takeaway_polish`** — closed. `DeskDatum` gained explicit `national?`/`plural?` flags (`lib/desk/types.ts`), set at each KPI push site in `lib/desk/loaders.ts` (replacing the `/mortgage/i` label regex). `makeTakeaway` now picks "is"/"are" off `plural`. The two previously-computed-but-never-rendered takeaways (`gauges.priceReduced.takeaway`, each hero city's `.latest.takeaway`) are now rendered in `app/desk/page.tsx`.
- **`r_star_report_takeaway`** — closed. `makeTakeaway` extracted to `lib/geo-takeaway.ts` (shared authority — `/desk` re-exports it via `lib/desk/mappers.ts`, `/r/[slug]` imports it directly). Report pages now render one number-first takeaway sentence under the conclusion, sourced from the first "real" `display.metrics` entry (reusing the existing cre-swfl rollup filter).
- **Verified locally** (`bunx next build` green, `bun test` 28/28 pass, `curl` against `bunx next start`):
  - `/desk`: `"Active listings in Southwest Florida are 20,822 as of 07/11/2026, per SWFL Data Gulf."` (grammar fixed) and `"Share of active listings with a price cut in Southwest Florida is 15.7%…"` (previously orphaned gauge takeaway, now live).
  - `/r/master`: `"Arts, Entertainment & Recreation (NAICS 71) — best SWFL SBA survival rate is 100.00% as of 07/07/2026, per SBA 7(a)/504 loan outcomes."`
  - `/r/cre-swfl`: `"Median SWFL CRE cap rate is 6.70% as of 07/07/2026, per SWFL Data Gulf [config]."`

**Not yet pushed** — pending your review of the diff and an explicit go before it ships (per your standing "never push without confirmation" rule).

## Bug found during verification, not caused by this work

The `/r/cre-swfl` takeaway above surfaced a pre-existing leak: `shortSourceLabel` (`refinery/render/speaker.mts:690-696`) can emit the literal string `"[config]"` as a customer-facing citation — confirmed 23x on that one page (`"SWFL Data Gulf [config]"`). Root cause: `scrubCaveatTechnical`'s snake_case-redaction rule (line 422) replaces internal identifiers with the literal token `[config]`; `isDisplayableCaveat` (line 819) drops any *caveat* that still contains it post-scrub, but `shortSourceLabel` has no equivalent gate — it ships whatever comes out, even if that's the bare word `[config]`. Pre-existing (same count with or without this build's takeaway line); opened as check `source_label_config_leak` (project `cre-swfl`) rather than left as a session-log note, per the no-silent-deferrals rule. Not fixed here — out of scope for this plan.

## Task 3 — Robots carve-out: needs YOUR yes/no before any code

Nothing to plan; the diff is already written (`docs/superpowers/plans/2026-07-11-desk-discovery-followups-plan.md`, Task 3, which is verbatim the original flywheel plan's Task 6, re-verified against the current `app/robots.ts` today — still accurate).

**The decision:** today `app/robots.ts` blocks `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` (answer-engine INDEX bots) everywhere, alongside the training bots. Proposed carve-out: allow those 3 INDEX bots on `/desk` + `/r/` only, keep everything else (training bots, and those 3 bots on every other path) blocked. Trade: Perplexity/ChatGPT Search could start surfacing your public data pages; Google AI Overviews and human URL-paste already reach you either way regardless of this decision. Robots.txt is advisory — real enforcement is the WAF, not this file.

Say yes/no whenever — it's a 15-line diff + one build/curl check once decided, nothing is blocked by delay.

## Task 4 — Live-verify: needs a deploy first

Can't run until Tasks 1–3 (whichever of them ship) are live on `https://www.swfldatagulf.com` — it's `curl` against the deployed domain, not local. Runbook is fully written in the spec (Task 4: Google Rich Results Test + Schema.org validator on `/desk` and `/r/master`, SSR-HTML number/takeaway checks, embed-widget frame-header check, sitemap/llms.txt checks, robots check if Task 3 shipped) ending in `node scripts/check.mjs close desk_discovery_flywheel_live_verify`.

Trigger it the next time you deploy — no new planning needed, just run the commands.
