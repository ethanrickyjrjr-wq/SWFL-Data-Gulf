# lib/assistant/ — answer engine conventions (loads when you edit here)

This is the LIVE answer engine. The single most important fact:

- **User-facing framing lives in `refinery/lib/rules-of-engagement.mts`, NOT CLAUDE.md.** That lean block
  rides in every payload's `_meta.rules` (8 importers). To change what an answer believes (cite, grain,
  as-of date, no-jargon), edit THAT — and keep it ≤300 tokens, byte-mirrored across the 4 files guarded
  by `rules-of-engagement.test.mts`.
- **CHAT DOES NOT CHART (07/09/2026).** The auto-chart lane is deleted. The producer ran to completion
  *before* `streamAnswer`, so the model had no chart tool and could never honor the offer the prompt told
  it to make — the "offer to build one" loop could not terminate. All three chat system prompts now say
  NEVER mention or offer a chart. Do not re-wire it without an explicit operator go-ahead.
  `buildChartForQuestion` / `composeChartFromRequest` still live and still matter: they power the
  AI-authored **email** chart (`lib/email/build-doc.ts` `buildPromptChart`), and `comp.chart` (the
  user-directed property-comp visual) is a separate lane that still rides the chat prelude. Model never
  writes a number; `lintChartBlock` is the belt-and-suspenders. Web search is wired via
  `external_points` → `fillExternalPoint` → `web_search_20250305`.
- **Routing is `lib/highlighter/reach.ts`.** `TOPIC_TO_SLUG` feeds chat grounding, `report-path.ts`, the
  chart producer, and `compose-chart`'s data menu. It had 6 rules for 42 brains and no rule for housing,
  heat, listings, or momentum — so the core questions of a real-estate product routed to nothing and every
  chart fell to the same median-price bar. When you add a brain, add its rule. Residential rules sit above
  `cre-swfl`; nothing above it may claim `cap rate` / `vacancy` / `absorption`.
- **Speaker hygiene:** no `§`, no internal pack IDs, no tier codes, no `master`/brain-id leakage. Two
  layers, sharing `PACK_ID_LABELS` in `refinery/render/speaker.mts` so they can never disagree:
  `scrubBrainSlugs` runs on the grounding text *before* the prompt (`grounding.ts` `renderBlock` — the
  model cannot speak a name it never saw) and again on the streamed output (`stream.ts`, tail-buffered
  because a slug straddles SSE chunks). `display-leak.test.mts` is build-time only and structurally cannot
  catch a slug the model emits at runtime. Dates are MM/DD/YYYY (never the raw `SWFL-…-YYYYMMDD` token).
- **Never frame the product as "ZIP-level"** — the moat is four-lane at ANY grain (`zip-level-framing-lint`).
- **Tier:** 1 = small-talk / single fact · 2 = default analytical (table ≤6 rows) · 3 = full audit on
  explicit request only. Read rates as written; never recompute a rate from raw counts.
- **Answers are plain text** — no blockquotes, no tables (they break copy-paste).
