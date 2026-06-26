# PROBLEMS — SCOPED AGAINST CODE (verdict map)

> Companion to `CLAUDE IS STUPID AS FUCK PROBLEMS.md`. That doc is the hypothesis.
> This doc is the code-proven verdict on every item, with the single root to fix each in ONE place.
> Method: 12 read-only agents, ~1.1M tokens, 236 tool calls. Every claim quoted `file:line`.
> Vendor contracts re-confirmed live via crawl4ai 06/26/2026. NOTHING was edited to produce this.

---

## VERDICT TALLY

- CONFIRMED (problem real, plan fix sound): A1, A2, A6, A7, A5, A8, A9, A10, C14, C15, D20, D17, D18, D19, H36-chart, G28, H32, H33, H34, H35, F27, E23, E24, E26, G29, G30, B12-keep
- PARTIAL (real, but plan misnames the surface or premise is stale): A3, C13, C16, B11, D22, E25, H36-guards
- REFUTED (the plan's premise is wrong against current code): B11 "leave the field alone" string, H36 "social images fixed", AI-ACCESS "single context root exists", "graphs not in deliverables"
- ALREADY DONE (do not re-do — pure duplication): A4, A3 brand-color half, four-lane prompt (1c92328d), graphs in slot-model deliverables
- EXPANDED (problem exists in MORE places than the plan named): F27 (1→3 prod sites), currency $NNNk (1→6 sites), model ids (1→~12 sites), backwards-ISO date (1→2 user-facing surfaces), corridor-count dumps (whole new class)

---

## DO NOT RE-DO (already in canon / already true — re-adding = drift)

- A4 graphify discovery order — already `CLAUDE.md` RULE 0.5:38 + line 227. Putting it in CONTRACT.md makes 2 sources that drift.
- A3 brand-color clause — already `.claude/CONTRACT.md` Rule 3:20 + `docs/contracts/RULE-0.8-...md` + `MAKE-CONTRACT-FOLLOW.md`. Only the *capability-assertion* half ("before saying no-X-exists, query the lake") is genuinely new — and it belongs in Rule 3 (verifiable value), NOT Rule 4 as the plan says.
- B11 premise — the string "if the data isn't above, leave the field alone" is GONE. `route.ts:84-89` already carries the four-lane cascade (commit 1c92328d). Real remaining gap = the *structural* `fillExternalPoint` pass, not the prompt.
- Graphs in deliverables — already render for slot-model report deliverables via `ChartBlockView` + `FrameRenderer` (`app/p/[id]/page.tsx:173-186`). The gap is ONLY the email-lab block-canvas builder (G28).
- AI data access — email-lab, conversation-path, report-path, MCP all already ground on the FULL master dossier with explicit "never refuse" prompts.

---

## THE CONTRACT IS NOT WIRED (kills half of section A before it starts)

- `.claude/CONTRACT.md:5` claims it is printed every session by `.claude/hooks/print-contract.mjs` — that file DOES NOT EXIST. So every A-section text edit changes a file no session reads.
- The 5-rule body is DUPLICATED: canonical at `.claude/CONTRACT.md:9-29`, second copy hard-embedded as a JS string in `docs/contracts/MAKE-CONTRACT-FOLLOW.md:23-35`. Edit one, the other drifts. A real single-root fix makes `print-contract.mjs` read `.claude/CONTRACT.md` at runtime instead of embedding.
- `docs/contracts/RULE-0.8-...md` says "paste into CLAUDE.md after RULE 0.7" — never installed (project CLAUDE.md jumps 0.7 → 1).

---

## SINGLE-ROOT WINS (one change fixes everywhere — the operator's whole ask)

### F27 — the 9-hour brand bug. Plan named 1 site. There are 3 production sites.
- `app/api/deliverables/[id]/blast/route.ts:140` — `renderGroundedReport(model, { skin: "email" })` no brand (the named one)
- `app/p/[id]/print/route.ts:59` — PDF print path, no brand (PLAN MISSED)
- `app/p/[id]/page.tsx:449` — public web preview, no brand (PLAN MISSED)
- ONE ROOT: change `brand?:` → `brand:` at `lib/email/grounded-report.ts:60`. The compiler then reds all 3 prod sites + ~11 test sites + 1 scratch file in one sweep. Must fix all in one commit or the build breaks.
- Caveat: `resolveUserBrand` returns `BrandTheme` (no `companyName`), so COMPANY_NAME token won't populate that way; and blast pulls LIVE brand while print/preview read the FROZEN `deliverable.branding` — pick ONE source or the three diverge.

### H32 — false parse rejections. Genuinely one file.
- `z.strictObject` appears in EXACTLY ONE source file: `lib/email/doc/schema.ts:210` (StatPatch) + `:215` (BlockContentPatch). Flip both to `z.object`. Final `EmailDocSchema.safeParse` (`route.ts:166`) already strips unknown keys, so the "no restyle" invariant holds. Clean.

### Currency $NNNk — plan named 1 site. There are 6. A correct root already exists.
- Bug sites: `chart-image.ts:50`, `hero-tokens.mts:32`, `DigestEmail.tsx:28`, `build-digest.mts:103/107/111`.
- ROOT ALREADY EXISTS: `lib/charts/format.ts` (`formatAxisTick`, `formatChartValue`) branches at `>=1_000_000` and is server-importable. Route all 6 through it. The plan's proposed `usdFmt` (`toFixed(2)M`, lowercase `k`) would create a 4th incompatible style — do NOT use it. (Plan snippet also has a typo: `v \ 1_000_000`.)

### Backwards-ISO dates — plan said chart-image.ts is the ONLY surface. REFUTED — there are 2.
- `lib/email/chart-image.ts:62-63` — month label `YYYY-MM` burned into the email chart PNG (the named one, D18).
- `lib/social/render-social-image.ts:410/416` ← `lib/social/render-model.ts:41` (`toISOString().slice(0,10)`) — social PNG watermark renders "as of 2026-06-26". Plan listed social images as FIXED; only the freshness-token line was fixed, not the watermark.
- NO MM/YYYY helper exists. `formatDisplayDate`/`asOfFromIso` need a day; `formatAsOf` emits "Apr 2026". Add a month-grain `YYYY-MM → MM/YYYY` helper to `lib/project/as-of.ts` so it joins the one root.
- ~15 more user-facing surfaces inline `toLocaleDateString`/`Intl` ("Jun 2026") — NOT backwards (not rule-5 violations) but they bypass the root. Consistency cleanup, not a date-format bug.
- NO CI guard covers chart-image.ts or the social PNG — the two most likely to re-leak. D18 alone ships with no regression net.

### Model IDs — plan named 1 site. There are ~12.
- `route.ts:14` is one. Others: `schedule-command/route.ts:43`, `action/route.ts:33`, `extract-pdf/route.ts:22`, `infer-project-type.ts:80` (DATED `claude-haiku-4-5-20251001` — the odd one), `data-readiness.ts:117`, `gap-fill.ts:29`, `heal-cron-failure.mjs:182`, `prove-fact-injection.mts:27`, plus `anthropic.mts` (the only partial sink).
- ONE ROOT: a resolver (extend `refinery/agents/anthropic.mts` `TRIAGE_MODEL`/`SYNTHESIS_MODEL`) every caller imports. H35's email-lab-only fix leaves the other 11 drifting.

### Send-block hook (A6) — the plan's keyword list would NOT stop the actual send.
- Claude sends by RUNNING scripts: `bun scripts/email/build-digest.mts`, `node scratch-send-oneoff.mts`, `bun scripts/email/send-test.mts`, `...outreach-campaign.mts`, `...run-schedules.mts`, `...run-activation.mts`. None contain "resend"/"emails.send"/"blast". The deny pattern MUST match script PATHS, not SDK substrings.
- More send surfaces the plan never named: `app/api/email/broadcast/route.ts:105` (`broadcasts.create({send:true})`), `app/api/waitlist/route.ts:61`, `app/api/webhooks/resend/route.ts:198/252`.
- Architectural limit: a PreToolUse hook only stops CLAUDE's tool calls. It can NOT gate the deployed `/api/*` routes that send on external HTTP. The hook stops Claude; it does not stop the platform.

---

## THE CORRIDOR DECREE ("NO LISTING HOW MANY CORRIDORS") — its own root problem

- The scrub (`refinery/render/speaker.mts` `deCorridor`) only swaps the WORD: "25 of 27 corridors" → "25 of 27 **areas**". It KEEPS the count. The operator banned the COUNT. Proven by `speaker.test.mts:377` asserting the output still says "12 of 25 areas".
- TWO consumer surfaces, not one. (1) Deterministic `/r` page + MCP card — scrubbed. (2) LIVE LLM CHAT (`conversation-path.ts`/`report-path.ts` via `lib/highlighter/grounding.ts`) — injects RAW corridor counts into the model prompt and NEVER scrubs the streamed output. The chat surface is where "corridor counts all over the place" actually reach the user.
- They CONTRADICT. `speaker.mts:28` bans "corridor"; `grounding.ts:156` INSTRUCTS the model to say "across our corridors", and `grounding.test.ts:270` test-LOCKS "27 corridors" into the context. CI currently ENFORCES the violation.
- Source mint: `refinery/packs/cre-swfl.mts` (lines 642, 682, 1424, 1590, 182...) bakes "N of M corridors" into labels/facts/citations. `brains/cre-swfl.md` carries it everywhere. "Phase 3 rewrites the cre-swfl emitter at source" was flagged in `jargon-scrub.test.mts` and NEVER done.
- Static marketing copy also hardcodes it: `app/api/landing-data/route.ts:29/67/70` ("25 tracked corridors", "17 corridors") and `components/landing/Charts.tsx:144` ("32 live flags across 17 corridors · Source: SWFL Corridor Pulse 2026-06-05" — count dump AND a raw ISO date).
- A count-stripper precedent EXISTS but is siloed: `app/r/cre-swfl/cre-metrics.ts:149` `shortenSummaryLabel` already drops the "(27 of 27 corridors)" tail — for one surface only.
- ONE ROOT, two parts: (1) source — stop minting "(N of M corridors)" in `cre-swfl.mts` (move coverage count to a non-display field); (2) render net — add a count-stripper rule to `sanitizeProse`, AND run `sanitizeProse`/`scrubCaveatTechnical` over `grounding.ts` so the chat model never SEES the count, plus a post-stream scrub. Reverse `grounding.ts:156` + invert `grounding.test.ts:270`.

---

## PLAN LANDMINES (copying the plan verbatim breaks the build)

- G28: plan says call `uploadChartPng()` — NO SUCH FUNCTION. Real: `hostEmailPng(pngKey, png)` (`chart-image.ts:93`) / `buildTrendChartUrl` (`:104`).
- C13: plan says "update the email builder prompt to use median_listing_price" — `lib/email/market-context.ts:133-140` ALREADY emits `median_list_price` labeled "Median list price" and never reads `daily_truth`. Wrong surface. The NULL is consumed only by the freshness pack, which already filters NULLs. Real daily median SALE price has no free source; county-grain sale price already wired via `redfin_<county>_market.median_sale_price`.
- C16: "replace ZHVI in the email chart builder" — there IS no email chart wired. `chart-image.ts buildTrendChartUrl` has ZERO callers; `run-schedules.mts` threads a `chart?` param that is never set. Blocked on C14's non-existent history table.
- C15 vs spec contradiction: `docs/superpowers/specs/2026-06-25-snicklefritz-...md:29` says pick-template REPLACES `pickSeedId` (enum of SEED ids); plan C15 says NEW file over the 8 TEMPLATE slugs, `pickSeedId` stays. Reconcile before building. Also: the project/ai-material flow hard-codes deliverable template "block-canvas" and never picks one of the 8 email slugs — so `pickTemplateByModel` only takes effect if the runner renders via the TemplateSlug lane directly.
- E26: `normalizeFixtureBrand` as specced SILENTLY DROPS `fontFamily`/`textColor`/`backdropColor` — `BrandTheme` is only `{primary,accent,logoUrl}`. The broker's font/text/backdrop never reach the email.
- E24/E25: `snicklefritz_sends` table has NO migration scoped — the idempotency guard is a no-op until it exists; re-runs double-send. No `scheduledAt` usage exists anywhere in the repo today.
- E23: the runner POSTs to a Next route → needs a running server at the base URL. Env var name mismatch: plan says `NEXT_PUBLIC_URL`, blast route reads `NEXT_PUBLIC_SITE_URL`.
- D22: `compass.png` does NOT exist. Real committed logos: `century21-selling-paradise.png` + `powers-realty-group.png`. The G29 logo-200 gate must target those two.
- No shared transactional single-send helper exists; every site inlines `new Resend(...).emails.send`.

---

## VENDOR FACTS (crawl4ai live, 06/26/2026)

1. Hooks — CONFIRMED. PreToolUse deny shape verbatim: `hookSpecificOutput: { hookEventName:"PreToolUse", permissionDecision:"deny", permissionDecisionReason:"..." }`. Top-level `decision`/`reason` is DEPRECATED for PreToolUse. SessionStart = context/print only, "No blocking or decision control." Source: docs.claude.com/en/docs/claude-code/hooks.
2. Resend — CONFIRMED. `scheduledAt` (camelCase, NL or ISO-8601). Two recipients = `emails.send({ to: [a,b] })`, `to` max 50, no audience. Source: resend.com/docs/api-reference/emails/send-email.
3. web_search — `web_search_20250305` STILL valid (keep it for basic search + per-claim `cited_text`). DRIFT: latest is now `web_search_20260318` (the plan's B12 only knew up to 20260209). Source: docs.claude.com/.../web-search-tool.
4. Model IDs — CONFIRMED. API ID/alias: `claude-opus-4-8`, `claude-sonnet-4-6`; haiku alias `claude-haiku-4-5`, dated ID `claude-haiku-4-5-20251001` (both valid). `infer-project-type.ts:80`'s dated form is fine, just inconsistent. Source: docs.claude.com/.../models/overview.
5. Professional data-site tone (Redfin Data Center) — headline = plain noun + what-you-get verb, no hype; as-of/cadence stated tersely per metric ("Updated weekly and monthly"); zero internal jargon, zero internal counts; sectioned scannable cards, methodology linked off to the side. That is the target voice.

---

## FIX-WAVE ORDER (single-root first, lowest risk → highest leverage)

1. F27 brand (one root, `grounded-report.ts:60`, atomic compiler sweep) — highest leverage, the 9-hour bug, 3 sites.
2. H32 strictObject (one file, clean) — unblocks the email-lab "try rephrasing" failures.
3. Currency root — route 6 sites through `lib/charts/format.ts`.
4. Date root — add month-grain MM/YYYY helper to `as-of.ts`; fix chart-image.ts:62 + social watermark; add a guard.
5. Model resolver — extend `anthropic.mts`, migrate ~12 sites.
6. Corridor decree — source mint (`cre-swfl.mts`) + scrub both surfaces (`sanitizeProse` count-strip + `grounding.ts` scrub) + flip the CI test.
7. Enforcement hooks — `print-contract.mjs` (reads CONTRACT.md at runtime) + `block-unauthorized-sends.mjs` matching script PATHS.
8. SNICKLEFRITZ build chain (E23/E24/E25/E26/G28/G29/G30/C15) — only after 1–7, and only with the landmines above corrected.
