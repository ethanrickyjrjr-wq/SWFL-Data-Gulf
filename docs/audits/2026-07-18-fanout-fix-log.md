# Site Audit Fix Pass — Fan-out Log (07/18/2026)

Follow-up to `docs/audits/2026-07-18-site-audit.md`. 10 parallel Sonnet lanes, grouped so no two
lanes ever touched the same file, each re-verified its assigned findings against current code
(not the audit's own line numbers — the tree had moved) before fixing anything. A finding that no
longer reproduced, or whose correct fix was a judgment call, was left untouched and reported back
instead of guessed at. No lane ran a build, test, lint, or commit — that happened once, here,
after every lane finished.

**Status: committed locally, NOT pushed.** Ready for the Opus review pass.

## Numbers

- 89 findings total in the original audit.
- 5 already fixed and pushed before this pass (verified against current code, not just
  SESSION_LOG — see "Already fixed" below).
- 11 carved out before the fan-out even started — billing, MCP surface, and cross-brain data
  reconciliation calls that need your sign-off, never handed to a lane.
- 73 findings fanned out. **43 fixed** (42 clean + 1 fixed-but-flagged for a security read).
  **30 flagged** — reproduced, but the correct fix was a genuine judgment call, so nothing was
  changed.

## Verification performed on the aggregate diff (42 files across two commits)

- `bunx next build` — clean, no type/compile errors.
- First pass: `bun test` on every existing test file covering a touched module (18 files, 126
  tests) — 2 failures, both pre-existing tests pinned to the *old, buggy* output that the fixes
  correctly changed (raw `env-swfl` brain slug leaking into a stream instead of being scrubbed;
  year-less `"Jun 10"` as-of date instead of `06/10/2026`). Updated both assertions, re-ran —
  126/126 pass.
- **Second pass — the full suite, not just the touched-module selection** (7877 tests / 768
  files): surfaced 3 more failures the filename-matched selection couldn't catch, because they're
  in shared/golden-fixture test files not named after any file the fan-out touched:
  - `lib/email/render-golden.test.ts` (9 of 10 frozen golden `.html` fixtures) — the MM/DD/YYYY
    date fix (#44) and the `$` prefix on currency deltas (#89) are real, correct output changes in
    `grounded-report.ts`'s shared render path. Regenerated the goldens against current output;
    diffed old vs. new to confirm **only** those two changes landed anywhere, nothing else drifted.
  - `components/back-on-market/back-on-market-read.test.tsx` — was pinned to the raw
    `03/01/2026` date that finding #64 replaced with a month label; updated to expect
    `"March 2026"`.
  - `lib/email/__tests__/recurring-report.test.ts` — same #44 date-format fix; updated
    `"Jun 16"` → `"06/16/2026"`.
  - `lib/deliverable/campaign-coherence.test.ts` intermittently failed (2 of its 10 tests) in the
    full-suite run but passed clean in isolation both **before and after** this fix pass (verified
    in an isolated git worktree at the pre-fix commit) — pre-existing flake under load, unrelated.
  Full suite after these 3 fixes: **7877 tests, 0 fail** (the one known flake aside).
- `bun refinery/tools/check-vocab-coverage.mts --all` — clean (two packs were touched:
  `housing-swfl.mts`, `catalog.mts`).
- This is a compile + test-suite gate, not a claim that all 43 fixes are behaviorally perfect in
  every untested path — the API-route/security-sensitive ones (#38, #41, #49, #57, #62, #72, #75)
  were additionally spot-checked by reading the actual diffs (not lane self-reports): #38's
  per-platform `freezePost` call was confirmed pure (no id/side-effect risk from calling it N
  times); #72's new 422 was confirmed to render a handled (if generically-worded) error in
  `ContactPickerModal`, not an unhandled crash. See the Opus pass for the rest.

---

## Already fixed & pushed (5) — verified against current code, not the log

| # | Finding | File | Verified |
|---|---|---|---|
| 1 | "6-county region" overclaim in briefcase email | `lib/email/grounded-report.ts:213` | Reads "Lee and Collier counties" |
| 11 | Raw freshness token in communities JSON-LD | `app/r/communities-swfl/[community]/page.tsx:91` | Wrapped in `asOfFromToken` |
| 19 | Raw token in scoped digest email body | `lib/email/scoped-content.ts:239` | Wrapped in `asOfFromToken` |
| 21 | Raw token in `/api/z` per-ZIP block | `lib/zip-dossier.ts:378` | Wrapped in `asOfFromToken` |
| 74 | Banned "Grain" label on method page | `app/r/method/[metric]/page.tsx:58` | Reads "Coverage / denominator" |

---

## Fixed in this pass (43)

| # | Finding | File | What changed |
|---|---|---|---|
| 7 | False "Grounded in SWFL lake data" badge on a data-gap answer | `app/ask/AskPage.tsx` | Badge now gated on `answered === true`, not just non-empty text |
| 9 | `ReportFooter` dead `freshnessToken` prop | `app/r/_components/report-shell.tsx` | Now renders `As of <date>`; real impact traced to `/r/search`, which had no other as-of display |
| 12 | Banned "ZIP-level" framing in housing-swfl scope string | `refinery/packs/housing-swfl.mts`, `refinery/packs/catalog.mts` | Removed "ZIP-level " from both source files (not the generated `brains/*.md`) |
| 14 | groundingNote could cite chart points truncated out of the chart | `lib/assistant/compose-chart.ts` | Upload/external/user attach functions now return the post-slice `kept` set; groundingNote/options build from that, not the pre-slice list |
| 15 | `answered` flag went stale before web-fallback ran | `lib/assistant/report-path.ts` | Recomputed after `webFallbackForAnswer`, now also true when web sources filled the gap |
| 16 | Report-dock stream skipped the layer-2 slug scrub | `lib/assistant/report-path.ts` | Wrapped in `scrubSlugStream`, matching the conversation path |
| 18 | `coverage_caveats` collected but never rendered | `lib/email/grounded-report.ts` | Appended as `_Coverage:_` lines in "The Reads" block; no-op for the normal Lee/Collier case |
| 20 | Fabricated concrete real-estate token defaults | `lib/email/templates/token-defaults.ts` | PROPERTY/EVENT/PRICE fields now default to "—", matching the hero-token precedent already in the same file |
| 25 | Light-mode text/borders unreadable on the always-dark background | `app/for-agents/page.tsx` | Converted every light-default/dark-override pairing to its dark-safe value, whole file |
| 26 | Pulse page used undefined Tailwind tokens | `app/pulse/page.tsx` | Swapped `text-muted-foreground`/`border-border` for the real registered tokens (`text-text-secondary`, `border-gulf-haze`) |
| 27 | Anchor nested inside a button (invalid HTML) | `app/r/cre-swfl/CREMetricsExplorer.tsx` | Moved the sr-only link to a sibling of the button |
| 28 | FindItButton state bled across ZIP navigation | `app/r/zip-report/[zip]/page.tsx` | Key now includes ZIP: `` `${zip}-${g.metric_key}` `` |
| 29 | Blank inspector panel for "sources" blocks | `components/email-lab/BlockInspector.tsx` | Added a read-only sources-list branch |
| 31 | Send/model failure during auto-reply lost the block reason | `lib/email/process-inbound.ts`, `lib/email/agent-alert.ts` | New `"send_failed"` reason threaded through to a distinct alert message |
| 32 | Refresh route and `applyRefresh` built cache keys differently | `lib/project/refresh-on-access.ts` | Now computes the same `scope_value ?? fallbackZip` fallback on both sides |
| 38 | Every scheduled platform got the same generic caption | `app/api/social/schedule/route.ts` | Freeze moved inside the per-platform map; uses `post.variants[platform]` when present |
| 39 | Patch-validation failure shipped raw authoring instructions | `lib/email/social-calendar/build-week.ts` | Returns `null` immediately on a failed patch parse instead of falling back to the unfilled seed card |
| 40 | `[ BODY TEXT ]` / `[ CHART ]` could ship literally | `lib/email/templates/render-template.ts` | Both slots now unconditionally replaced (`?? ""`), matching the existing DELTA pattern |
| 41 | Internal brain_id + file path leaked in a 500 response | `app/api/z/[zip]/route.ts` | Logs the real error server-side, returns a generic message to the caller |
| 42 | As-of fallback could render an unformatted raw date | `app/r/communities-swfl/[community]/page.tsx` + neighborhood page | Meta now omitted entirely when `asOfFromIso` can't parse, per the audit's own suggested fix |
| 43 | Single-digit figures were permanently "unverifiable" | `lib/assistant/gap-fill.ts` | Bounded number-token match instead of a blanket `<2 digits` rejection; all 4 existing test assertions still pass |
| 44 | As-of date rendered "Jun 10" with no year | `lib/email/grounded-report.ts` | `tokenDate()` now emits MM/DD/YYYY directly |
| 46 | Malformed freshness token leaked raw into the response | `lib/fetch-brain.ts` | Line omitted entirely when `asOfFromToken` can't parse, matching the established convention in `speaker.mts` |
| 49 | Misleading "check your address" message when comps existed but were unpriced | `app/r/should-i-sell/[zip]/page.tsx` | Widened the render condition so unpriced-but-found comps route to the existing manual-entry UI |
| 50 | Basemap fetch had no error state | `components/charts/ZipChoropleth.tsx` | Added `.catch`, renders the existing shared `ChartError` component on failure |
| 52 | Media rename/delete were optimistic with no rollback | `components/email-lab/MediaPanel.tsx` | Checks `res.ok`, reverts state + shows an inline error on failure |
| 55 | Accent swatch bar stretched past its row | `components/project/MaterialRow.tsx` | Added `relative` to the compact row |
| 56 | Missing "agent-launch" showcase intro paragraph | `components/showcase/CampaignExamples.tsx` | Added the missing `SECTION_INTRO` entry |
| 57 | SSRF: redirect target never re-validated | `lib/email/og-image.ts` | **Fixed but flagged** — switched to `redirect:"manual"` with a bounded 5-hop loop re-validating each hop against `isSafePublicUrl`. Residual gap noted: hostname-string validation, not resolved-IP, so DNS-rebinding is out of scope. **Wants an explicit security read before it ships.** |
| 62 | Client-supplied `data_as_of` let staleness be spoofed | `app/api/projects/[id]/materials/route.ts` | Removed the client fallback; always server-stamped now, matching the sibling PATCH handler |
| 64 | Raw day-precision date on a rolling-monthly figure | `components/back-on-market/BackOnMarketRead.tsx` | Now uses `monthYearLabel`, matching the 07/17 operator ruling already applied to the sibling should-i-sell surface |
| 69 | Add-contact modal had no dialog semantics | `app/contacts/page.tsx` | `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape-to-close |
| 71 | Duplicated `DIRECTION_CONFIG` palette | `app/r/cre-swfl/CREMetricsExplorer.tsx` | Now imports the shared `directionClassName`/`DirectionBadge` from `metrics-table.tsx` instead of a local copy |
| 72 | Empty deliverable silently sent as a placeholder email | `app/api/deliverables/[id]/blast/route.ts` | Returns `422 empty_deliverable` instead of sending a contentless email |
| 73 | A brain's first-ever signal couldn't register as "new activity" | `lib/email/activation/delta.ts` | Added the missing "appeared" branch, mirroring `diffMetrics` |
| 75 | Unhandled `req.json()` throw | `app/api/email-lab/render/route.ts` | Added the same `.catch(() => null)` + 400 guard used by sibling routes |
| 77 | Ellipsis shown even on non-truncated captions | `app/pulse/page.tsx`, `lib/social-pulse/digest.ts` | New `captionTruncated` flag computed alongside the preview; ellipsis now conditional |
| 78 | ~Half the zip-report stylesheet was dead | `app/r/zip-report/[zip]/zip-report.css` | Removed the two confirmed-dead rule blocks; live classes untouched |
| 79 | HBarChart flashed a hardcoded `$0.00` before hydration | `components/charts/HBarChart.tsx` | Initial text now routes through the same `fmt` formatter as the rest of the component |
| 84 | Usage bar had no ARIA progressbar semantics | `app/billing/page.tsx` | Added `role="progressbar"` + valuenow/min/max (clamped to max) |
| 85 | Icon-only dismiss button had no accessible name | `app/contacts/page.tsx` | `aria-label="Dismiss"` |
| 86 | Contacts table clipped instead of scrolling | `app/contacts/page.tsx` | `overflow-hidden` → `overflow-x-auto` |
| 89 | Delta table dropped the `$` prefix on currency metrics | `lib/email/grounded-report.ts` | Added a `CURRENCY_METRIC_KEYS` set gating a `$` prefix for the one currency delta cell that exists today |

**Plus 2 stale test assertions fixed to lock in the corrected behavior** (found by the verification
pass, not by a lane): `lib/email/grounded-report-briefcase.test.ts` (expected the pre-fix `"Jun 10"`)
and `lib/assistant/report-path.event-stream.test.ts` (expected the pre-fix raw `[env-swfl]` slug
instead of its scrubbed label).

---

## Flagged — reproduced, but the fix is a judgment call (30)

Nothing was changed for any of these. Each `checks` entry is still open under `site-audit-0718`;
recommended direction below is a starting point, not a decision already made.

| # | Finding | Why it wasn't auto-fixed |
|---|---|---|
| 4 | Embed widget fabricates freshness/confidence on fetch failure | Needs a decision on what an embeddable public widget shows instead — blank, "unavailable," or a stale caveat |
| 5 | `/map` always shows mock flood dollars | Fix is a real feature build (locate/build a live flood-AAL loader), not a scoped edit |
| 6 | claim-and-send hardcodes a fake CAN-SPAM address | Two legitimate directions (require the user's real business address vs. use the platform's own registered address) — compliance call |
| 8 | `/demo` shows fabricated data with almost no disclosure | Needs a decision on noindex + how visible the "sample data" banner should be |
| 10 | RawFallback dumps the whole brain file on parse failure | Needs a decision on the parse-failure UX (generic message vs. attempted section-stripping) |
| 17 | Stale-figure force-refresh never reaches live chat/report | Real fix requires restructuring how grounding is exposed across 3 files — architecture work |
| 23 | confirm-value insert 500s every time (phantom columns) | Verified live via Supabase schema query — genuinely needs a migration-vs-strip-fields decision |
| 30 | 6 of 9 homepage components are dead code | Delete vs. keep-for-later is a content decision, not a bug |
| 34 | `source_url` never rendered as a visible citation | Codebase already has a `SourceLink` component unused here — placement/scope decision |
| 35 | Corridor chart always claims a full "365d" baseline | Real fix threads `backfill_days` through a multi-file pipeline; cheap interim wording fix also identified |
| 36 | MLS settings page uses light theme in the dark app shell | Whole-file re-skin, not a one-line swap — flagged to load the `one-room` skill first |
| 37 | Step-count pill fails contrast on the agent-launch accent | Systemic fix (luminance-aware text color) spans 2 files, 4+ call sites |
| 45 | Auto-reply discards its own freshness token | No existing per-token staleness helper — needs a cadence/wording decision |
| 51 | `AddBlockPanel` is dead, clashing light-mode code | Audit itself offers 2 exclusive resolutions (delete vs. mount it) |
| 53 | `openSchedule()` reuses a stale exported PNG | Trade-off between a deliberate cache and full correctness — operator call |
| 54 | `WeeklyReadCapture` is dead, but so is the waitlist it claims to replace | **Important:** a locked, test-enforced 07/12 redesign explicitly asserts the homepage has neither — mounting this would break that test |
| 58 | Thread-cap loop guard resets per-broadcast | Real fix is in a DB query in a different file (outside this finding's cited scope) plus a cap-semantics decision |
| 59 | Dead "unfilled token" safety check | Architecture call: delete the dead assert, or reverse `renderHtmlTemplate`'s intentional clean-output design |
| 60 | Digest topics computed but never shown on `/pulse` | New UI section — placement/copy decision |
| 61 | Landing-data route hardcodes permanently-stale freshness labels | Wire to real live brains vs. strip the false claims — architecture call |
| 63 | `sampleThin` flag computed but never disclosed | Needs reader-facing caveat copy with no existing pattern to mirror |
| 66 | `MenuPoint` has no grain tag, so region and ZIP data merge indistinguishably | Audit itself offers 2 different product directions; needs a per-brain grain audit first |
| 70 | `/desk` renders two `<main>` landmarks + duplicate chrome | Bundles 2 separate calls (drop global nav vs. drop desk's own header) on a component shared by many pages |
| 80, 88 | Dead landing components have stale/hardcoded-hex freshness+color claims | Same dead-code disposition question as #30; one color has no token equivalent at all yet |
| 81 | 4 email components (metric-card, callout, stat-row, map-placeholder) are unit-tested but never called | Wire in vs. delete — architecture call |
| 82 | Flood-gradient bounds match the mock fixture exactly | **Confirmed with live data** (read `brains/env-swfl.md`): real AAL distribution is min=0/max=$32,609.96 (ZIP 33957) — the 600/30074 bounds are NOT derived from it. But a naive min/max rescale would crush the (heavily right-skewed) real distribution — needs a percentile/log-scale decision |
| 87 | Composer hardcodes hex instead of design tokens | No existing token matches the exact shades used; needs new tokens named + applied consistently across 2 files |

---

## Carved out before the fan-out — never touched, needs your call (11)

These weren't given to any lane. Billing and the MCP surface are explicit "ask first" per
`CLAUDE.md` RULE 1; the 8 Track-B items are cross-brain math/architecture/ingest-scope calls, not
file bugs.

**Billing (customer-money-adjacent):**
- **#3** — `app/api/stripe/checkout/route.ts:47` swallows the `error` from a Supabase read and
  falls into the "no customer yet" branch, which unconditionally upserts `tier:"free"` — can
  silently downgrade an existing paying subscriber on a transient DB blip. Confirmed still present.
- **#33** — `app/api/stripe/webhook/route.ts:52-60` treats a transient `subscriptions.retrieve`
  failure identically to "genuinely unknown price," acks Stripe with 200 either way, so Stripe
  never retries a real checkout upgrade. Confirmed still present.

**MCP surface (RULE 1 explicit ask-first):**
- **#48** — `app/api/mcp/route.ts:105-115` only attaches CORS headers to `GET`/`OPTIONS`, not the
  real `POST`/`DELETE` JSON-RPC response — a cross-origin browser MCP client passes preflight then
  can't read the actual response. Confirmed still present.

**Cross-brain data reconciliation / ingest scope (RULE 1 "brain pack math" + "ingest writes to
data_lake"):**
- **#2** — Nonsense DOM-YoY (−2796.2%) in the served housing block. **Pinpointed:**
  `refinery/packs/housing-swfl.mts` (~line 372 key_metric, ~line 529 detail_table) — no cap when
  the prior-year base is near zero. Needs a threshold decision (audit suggests capping at ~150%).
- **#13** — Raw freshness token in the Collier permits block. Same narrative-builder as #22 below;
  needs the same rewrite treatment.
- **#22** — Internal build-state wording ("current build excludes Collier") leaks into served
  narrative. **Pinpointed exactly:** `refinery/packs/permits-swfl.mts:594-608`,
  `buildConclusionProse()`. This is genuinely useful information to the reader, just phrased
  internally — needs a reworded, user-facing version, not a deletion.
- **#47** — "6-county footprint" overclaim in a permits-commercial-swfl citation. **Good news:**
  the live pack source (`refinery/packs/permits-commercial-swfl.mts:369`) no longer contains that
  phrase — it now reads "ranked against the Lee + Collier core ZIP universe." Only the *un-rebuilt*
  `brains/permits-commercial-swfl.md:637` still shows the old string. This looks stale, not broken
  — a normal rebuild should clear it; worth a live-verify rather than a code fix.
- **#65** — `redfin_swfl` ingest includes Charlotte + Sarasota ZIPs (126 total), outside locked
  Lee+Collier scope. **Pinpointed:** `ingest/duckdb_pipelines/redfin_swfl/` (`pipeline.py`,
  `constants.py`). Needs a scope-gate-at-ingest vs. gate-every-consumer decision.
- **#67** — "List-to-sold 76.15%" computes closed-vs-active-asking (different populations),
  contradicting Redfin's real sale-to-list (94.9%). **Pinpointed:**
  `refinery/packs/market-temperature-swfl.mts`.
- **#68** — Same metric (DOM, active listings, price) shows 3-4 different unreconciled values per
  ZIP across brains. This is the "one authority per shared metric" architecture question (RULE 3
  C1) spanning `housing-swfl`, `market-temperature-swfl`, `market-heat-swfl`,
  `listing-momentum-swfl` — not a single-file fix.
- **#83** — Same root cause as #67/#68: `market-temperature-swfl` says "cold" while
  `market-heat-swfl` says a 63.8/100 tilt, same ZIP. **Pinpointed:**
  `refinery/packs/market-heat-swfl.mts` + `market-temperature-swfl.mts`.

---

## What's next

1. Opus review of the diff (40 files + 2 test-assertion fixes) — this file is written for that pass.
2. Your call on the 11 carved-out items above and however many of the 30 flagged ones you want
   picked up next.
3. Once reviewed: push, then close the `checks` for the 43 fixed findings (not yet closed — waiting
   on the review).
