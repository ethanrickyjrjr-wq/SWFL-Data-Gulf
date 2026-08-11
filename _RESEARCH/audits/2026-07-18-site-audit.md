# SWFL Data Gulf — Site Audit (07/18/2026)

Fan-out audit of the whole site + emails + answer engine. Static fan-out — 2 rounds, 30 slices total, Sonnet find → adversarial verify — plus a live-probe track (per-ZIP answers vs lake ground truth + AI-honesty red-team).

**89 findings** after dedup — read this as a *machine-found backlog*, not a hand-verified list. Track A (static): 84 confirmed / **only 1 rejected** by the adversarial verifier (53 round 1, 31 round 2). That low reject rate means the verify pass rubber-stamped more than it refuted, so treat every static finding as a **candidate pending human triage**, not a proven defect. Track B (live-probe, 8) is different: each was checked by hand against the live serve + lake ground truth. The **5 criticals were additionally human-read at the source and all hold** (with severity nuances noted). Net: live-probe + criticals are the most defensible; the dead-code / design tail is the softest.

By severity: 5 critical · 35 high · 33 medium · 16 low

By lens: 26 ai-grounding · 18 data-match · 29 bug · 10 design · 6 email-content

Lenses: **bug** = broken/dead/crash · **data-match** = returned data doesn't match the question · **ai-grounding** = un-sourced/invented/jargon/token/scope leak · **email-content** = deliverable slot blank/placeholder/missing real info · **design** = visual/contrast/token (marketing pages; app pages = one-room compliance only).

> Live-probe reachability caveat: true NL red-team of the signed-in `/api/assistant` is auth-gated and was not reachable unauthenticated — the answer-engine grounding guards were audited statically (assistant-core/aux slices) plus the per-ZIP/master payloads were probed live. A signed-in manual red-team pass is still worth doing.

---

## CRITICAL (5)

### 1. Whole-region briefcase report renders literal "6-county region" — overclaims coverage far beyond Lee+Collier
- **Lens/track:** ai-grounding · Track A · slice `email-templates`
- **Where:** `lib/email/grounded-report.ts:213`
- **Problem:** When a report's scope is unresolved (blank/unknown scope_kind → `kind:"region"`, produced by `lib/deliverable/email-deliverable.ts` lines 125-131 for any deliverable with no scope), renderGroundedReport's subtitle hardcodes the county line to the literal string "6-county region". This ships to a real recipient as the email's second line, claiming coverage of six counties in Southwest Florida.
- **Evidence:** const county =
  model.scope.kind === "region"
    ? "6-county region"
    : model.countyName
      ? `${model.countyName} County`
      : "Southwest Florida";
- **Impact:** A recipient of any whole-region briefcase email or PDF (no ZIP/place/county scope) is told the report covers a "6-county region." Real data coverage is Lee (12071) + Collier (12021) core, with Hendry as a minor addition — Charlotte/Glades/Sarasota are explicitly NOT covered per the project's locked 07/07/2026 scope correction. This is a direct, user-facing geographic overclaim, and it is test-locked: `lib/email/grounded-report-briefcase.test.ts:109` asserts `html).toContain("6-county region")` (note: the file lives at `lib/email/grounded-report-briefcase.test.ts`, not `lib/email/__tests__/...` as originally cited — content and line number otherwise confirmed verbatim).

### 2. Nonsense DOM-YoY ('−2796.2%') ships in the answer/MCP payload
- **Lens/track:** data-match · Track B
- **Where:** `answer/MCP serve path — housing-swfl block renderer (pinpoint pending; refinery render/speaker or brain block builder)`
- **Problem:** The conversational/MCP answer relays 'Median days-on-market YoY change: −2796.2%'. Lake confirms systemic: 7,393 of 10,072 redfin_swfl rows (73%) have |median_dom_yoy_pct|>300%. The /r/zip-report PAGE is FINE (renders a day-delta '↓ 22 days YoY') — defect is the served brain block only.
- **Evidence:** live 33904 payload: 'Median days-on-market YoY change: -2796.2%'; lake: median_dom_yoy_pct=-2796.21 for 33904 period_end 2026-06-30; count |dom_yoy|>300 = 7393/10072.
- **Impact:** A headline housing number reads as obviously broken, torching trust in every other cited figure.
- **Fix:** Suppress/cap DOM-YoY% when prior-year base is near zero (|pct|>~150 → 'n/a small base'), or switch the served block to the day-delta the page already uses.

### 3. Unchecked Supabase read on the customer-lookup can silently overwrite a paying subscriber's tier back to free/none
- **Lens/track:** data-match · Track A · slice `api-stripe-billing`
- **Where:** `app/api/stripe/checkout/route.ts:47`
- **Problem:** The lookup of the existing Stripe customer row only destructures `data`, never `error`: `const { data: row } = await db.from("billing_subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();`. Any transient failure of this query returns `data: null` with the error silently discarded — indistinguishable from 'user genuinely has no customer yet'. The code then falls into the `if (!customerId)` branch, creates a BRAND NEW Stripe customer, and unconditionally upserts `{ tier: "free", status: "none" }` onto the user's `billing_subscriptions` row via `onConflict: "user_id"`. If that user was already an active paying subscriber, this upsert clobbers it back to free/none, and the previously-linked live Stripe customer/subscription becomes orphaned from the row.
- **Evidence:** Confirmed lines 46-51 verbatim: db select on billing_subscriptions with only data destructured, no error check; falls to if(!customerId) branch which upserts tier:free,status:none onConflict user_id.
- **Impact:** A paying customer whose row-lookup happens to hit a transient DB error while re-opening the billing page gets silently downgraded to 'free' in our own records and loses the link to their real Stripe subscription — with no error shown to them or to us beyond a swallowed failure.
- **Fix:** Destructure and check `error` from the select; on error, abort with a 500 (`db_unavailable`) rather than proceeding as if no customer existed. Never write a hardcoded `tier: "free", status: "none"` on top of a row whose real state you failed to read.

### 4. Embed widget fabricates freshness token + confidence and still labels itself "live" when the master fetch fails
- **Lens/track:** data-match · Track A · slice `charts`
- **Where:** `app/embed/footer-token/page.tsx:27`
- **Problem:** fetchMaster() swallows all errors and returns null on any fetch failure or non-OK response (lines 13-23). The page then falls back to a hardcoded freshness token "SWFL-7421-vX-pending" and a hardcoded confidence of 0.78, feeds that literal confidence into RadialConfidenceGauge, and renders the fixed caption "Master brain — live" regardless of whether real data was ever fetched.
- **Evidence:** async function fetchMaster() { try { ... } catch { return null; } } (lines 13-23); const token = master?.freshness_token ?? "SWFL-7421-vX-pending"; const confidence = typeof master?.confidence === "number" ? master.confidence : 0.78; ... <div>Master brain — live</div> (line 65); <RadialConfidenceGauge confidence={confidence} /> (line 55)
- **Impact:** Anyone embedding this widget sees a specific, plausible-looking confidence number and freshness token labeled "live" even when the backing fetch silently failed — no visual difference between real and fabricated data.

### 5. /map page always renders hardcoded mock flood-loss dollars as if they were real per-ZIP data
- **Lens/track:** data-match · Track A · slice `map`
- **Where:** `app/map/page.tsx:13`
- **Problem:** All three MapCanvas instances on the public /map page (lines 13, 21, 26) are called with metric="flood" and no override prop. MapCanvas.tsx only uses live data via the override prop; without it, it reads exclusively from lib/landing/home-map-data.ts's hardcoded fixture object, explicitly documented as a MOCK fail-soft fallback never meant to be a primary source. /map never fetches live data and never passes override, so the fixture becomes the page's sole, permanent data source, with no 'Sample data' disclosure.
- **Evidence:** app/map/page.tsx:13,21,26 — three MapCanvas calls, all metric="flood", none with override=. components/charts/MapCanvas.tsx:58,89-100 — override is the only path to live data (blendedT/rampColor); absent override, getColor reads DATA.metrics[m] from the imported HOME_MAP_DATA fixture. lib/landing/home-map-data.ts:1-8 — header comment: 'MOCK FIXTURE — fail-soft fallback ONLY ... served only when a lake query fails, and always with sample: true'. Fixture flood data (lines 37-55) are static literals (e.g. 33901:2900, 33920:600, 33931:30074).
- **Impact:** A visitor on the page whose stated purpose is 'Flood risk by ZIP' sees invented dollar figures labeled 'Avg annual insurance loss per property (FEMA NFIP)' with no disclosure they are static placeholder numbers — a direct violation of the no-invented-number rule on the platform's flood-risk map.
- **Fix:** Load live per-ZIP flood AAL (the same env-swfl source zip-report already uses via computeZipGradient) in app/map/page.tsx and pass it through MapCanvas's override prop, matching the /desk pattern. On live-load failure, surface the same Sample-data treatment the homepage hero uses instead of silently serving fixture numbers as fact.

## HIGH (35)

### 6. claim-and-send skips the CAN-SPAM postal-address floor and hardcodes a fake address
- **Lens/track:** ai-grounding · Track A · slice `api-deliverables`
- **Where:** `app/api/lab/claim-and-send/route.ts:53`
- **Problem:** This route sends a real commercial email (the visitor's built doc) via Resend but never calls resolvePostalAddress or checks for any real business/account address the way the sibling blast route does. Instead the footer hardcodes a literal city string as if it were the compliance address.
- **Impact:** Every lab-first funnel self-send ships with a fabricated postal line ('Fort Myers, FL' is the platform's own address, not the sender's), rather than refusing to send or resolving the real one — inconsistent with the compliance floor enforced two files over in the same slice.

### 7. "Grounded in SWFL lake data" renders even when the model signaled a data gap
- **Lens/track:** ai-grounding · Track A · slice `ask-pulse-guides` (also reported in slice ask-pulse-guides)
- **Where:** `app/ask/AskPage.tsx:166`
- **Problem:** useConverse exposes `answered: boolean | null`, documented as false = the AI signalled a data gap. AskPage destructures only `{ ask, answer, streaming, error, reset }` from the hook — never `answered` — and shows the "Grounded in SWFL lake data" badge on any non-streaming, non-empty answer regardless of whether it was actually grounded.
- **Evidence:** app/ask/AskPage.tsx:33 `const { ask, answer, streaming, error, reset } = useConverse();` and lines 164-166 `{!streaming && answer && (<div ...><span ...>Grounded in SWFL lake data</span>`; lib/assistant/use-converse.ts:14-18 documents `answered: boolean | null` with false meaning data gap.
- **Impact:** When the assistant honestly reports a data gap (still non-empty text), the UI slaps a false grounding badge on it anyway — undermining the product's core sourcing guarantee.

### 8. Demo page renders fully fabricated brain output/stats as if live, with no metadata and only one buried 'Sample data' hint
- **Lens/track:** ai-grounding · Track A · slice `marketing2`
- **Where:** `app/demo/page.tsx:5`
- **Problem:** The page imports static fixtures (fixtures/brain-output.json, fixtures/stats.json, fixtures/corridor-rents.json, fixtures/zhvi-trend.json) and renders them through the exact same presentation the real site uses for genuine cited data: a freshness token run through the real `asOfFromToken` helper, a percentage 'confidence', named 'Source: ... · Supabase · May 2026' captions, and dollar-figure key metrics — all hardcoded fake values. The route has no `export const metadata` (no title, no description, no robots noindex) — confirmed by reading the full file, which has zero metadata export — so it is publicly reachable/indexable at /demo with zero page-level disclosure that this is a mock. The only hint anywhere on the page is the string "Sample data" passed as `asOfNote` to one chart (line 92); the corridor chart (line 76-79), the hero stats line (lines 36-49), the 'Current conclusion' section (lines 52-67), and the key-metrics grid (lines 99-125) carry no such disclosure at all.
- **Evidence:** Lines 36-49 confirmed verbatim: `Intelligence · {statsData.data_sources} verified sources` ... `Confidence: {statsData.brain_confidence}% · {asOfFromToken(brainData.freshness_token) ?? brainData.freshness_token}` sourced from imported fixture JSON at lines 3-6 — fabricated numbers with no named source, displayed with the site's real 'cited fact' formatting conventions (font-mono uppercase labels, Source: ... · Supabase · date captions identical in style to genuine citations elsewhere in the app).
- **Impact:** A visitor who lands on /demo directly (shared link, search index, or crawler) sees what looks like a live, sourced SWFL Data Gulf market read — a specific confidence percentage, dollar-denominated key metrics, and a dated 'Source: SWFL corridor_profiles · Supabase · May 2026' citation — with no clear indication it is sample/demo content, directly contradicting the product's core promise that 'every number is cited' and 'nothing is invented.'

### 9. ReportFooter accepts freshnessToken but never renders it — dead prop across multiple report pages
- **Lens/track:** ai-grounding · Track A · slice `report-shared` (also reported in slice communities)
- **Where:** `app/r/_components/report-shell.tsx:58`
- **Problem:** ReportFooter destructures its freshnessToken prop as `_freshnessToken` and never reads it anywhere in the function body — only `note` and `children` are rendered.
- **Evidence:** report-shell.tsx:58-77 confirmed by direct read: the function signature aliases freshnessToken to _freshnessToken and the JSX body only renders the logo/brand div, children, and note — no reference to the token anywhere.
- **Impact:** A user reading a county/corridor dossier (or any of the other report types that rely on the footer for freshness) sees no as-of/last-updated indicator for the data on that surface.

### 10. RawFallback dumps the entire raw brain markdown file — including internal-only sections — straight into a public report page
- **Lens/track:** ai-grounding · Track A · slice `report-shared`
- **Where:** `app/r/[slug]/page.tsx:408`
- **Problem:** When parseBrainMarkdown/toDisplayBrain throws, ReportPage falls back to RawFallback, which renders the full unfiltered file contents inside a <pre> on the live public /r/[slug] route.
- **Evidence:** page.tsx:102-116 shows the try/catch returning <RawFallback slug={slug} content={content} /> on parse failure; RawFallback (confirmed at line 408-421) renders {content} verbatim inside a <pre>. brains/cre-swfl.md confirmed to contain brain_id, HOW THE USER LIKES TO WORK, SAVED FACTS sections in the raw file content that would be dumped.
- **Impact:** Any parse regression on a brain file instantly leaks internal system nouns and operator-private content on a live customer-facing URL.

### 11. Raw freshness token (not MM/DD/YYYY) leaks into public FAQPage JSON-LD
- **Lens/track:** ai-grounding · Track A · slice `communities`
- **Where:** `app/r/communities-swfl/[community]/page.tsx:91`
- **Problem:** communityJsonLd() is called with `token || (c.as_of ?? "")` where `token` is the raw freshness_token string from parseBrainMarkdown, not the MM/DD/YYYY-formatted date. lib/jsonld.ts embeds it verbatim as `As of ${freshnessToken}.` inside the FAQPage acceptedAnswer.text for golf/HOA/home-count questions, while the correct pattern (asOfFromToken(brain.freshness_token) ?? "") is already used elsewhere in the codebase (refinery/render/speaker.mts:913) and even on this same page for the visible header Meta (page.tsx:127).
- **Evidence:** page.tsx:36-43 freshnessToken() returns the raw parseBrainMarkdown(md).freshness_token; page.tsx:91-103 `const ld = communityJsonLd({...}, token || (c.as_of ?? ""))`; lib/jsonld.ts:274/282/289 embed `As of ${freshnessToken}.` verbatim; speaker.mts:913 shows the correct asOfFromToken-wrapped pattern; page.tsx:127 uses asOfFromToken(token) correctly for the visible Meta right above the JSON-LD call.
- **Impact:** Google/Bing rich results and AI overviews built from this page's structured data will surface an internal token string as the as-of date for community facts instead of a readable date -- confusing to a searcher and a leak of an internal system id into public-facing content.
- **Fix:** Wrap with asOfFromToken(token) before passing to communityJsonLd, mirroring speaker.mts:913 and the page's own visible header rendering at line 127.

### 12. housing-swfl brain's own scope string uses the banned 'ZIP-level' framing, and it renders verbatim on the page
- **Lens/track:** ai-grounding · Track A · slice `sell-pages`
- **Where:** `brains/housing-swfl.md:10`
- **Problem:** The brain's frontmatter `scope` field is 'SWFL ZIP-level residential buy-side housing market (Redfin), monthly — median sale price, days on market, inventory, sale-to-list ratio, and market heat direction.' `refinery/render/speaker.mts`'s `humanScope()` (lines 601-605) does `scope.split("—")[0].trim()` — since 'ZIP-level' sits BEFORE the first em-dash, it survives into `toDisplayBrain`'s `scope` field (line 909: `scope: sanitizeProse(humanScope(brain.scope))`), which `app/r/housing-swfl/page.tsx` then renders verbatim as the page's visible subtitle (line 156: `<p>{housing.scope}</p>`) and as the `<meta name="description">` via `generateMetadata` (line 108: `description: display.scope`). This directly violates the operator's locked rule against 'ZIP-level' framing (also documented in lib/assistant/CLAUDE.md).
- **Evidence:** brains/housing-swfl.md:10 exact string confirmed by Read. refinery/render/speaker.mts:601-605 humanScope() confirmed — splits on em-dash, keeps text before it. refinery/render/speaker.mts:909 toDisplayBrain applies humanScope to scope. app/r/housing-swfl/page.tsx:108 and :156 both confirmed rendering display.scope verbatim.
- **Impact:** Every visitor to /r/housing-swfl and every search-engine snippet for the page states the product is 'ZIP-level', contradicting the operator's locked positioning rule.

### 13. Raw internal token leaks as 'freshness' in the Collier-permits block
- **Lens/track:** ai-grounding · Track B
- **Where:** `Collier building-permits per-ZIP block (ingest/render for collier permits)`
- **Problem:** That block emits _Freshness:_ SWFL-7421-v35-20260718 (raw token) while every sibling block correctly shows MM/DD/YYYY. Violates the hard 'never the raw token' rule at the data layer.
- **Evidence:** live 34103 payload: Collier permits block '_Freshness:_ `SWFL-7421-v35-20260718`' vs all other blocks '07/17/2026'.
- **Impact:** Raw internal token can be relayed into a user answer.
- **Fix:** Format the Collier-permits freshness via asOfFromToken to MM/DD/YYYY like every other block.

### 14. groundingNote can describe upload/external/user figures that got truncated out of the actual chart
- **Lens/track:** ai-grounding · Track A · slice `assistant-aux`
- **Where:** `lib/assistant/compose-chart.ts:591`
- **Problem:** attachUploadPoints, attachExternalPoints, and attachUserPoints are applied in sequence, each doing `rows = [...block.rows, ...extraRows].slice(0, MAX_BARS)` (MAX_BARS=12, verified at line 53). If the model's held point_ids selection already fills 12 rows, subsequently-appended upload/external/user rows are silently dropped by the slice. But verifiedUploads, externals, and input.user_points — used to build groundingNote paragraphs and chart.options.*Sources — are computed independently of the post-truncation block.rows, so they are appended to groundingNote and options unconditionally, even when the value never survived into the rendered chart.
- **Evidence:** Verified lines 593-657 build groundingNote/options from verifiedUploads/externals/input.user_points directly, while attachUploadPoints (448-450), attachExternalPoints (413-415), attachUserPoints (477-479) each truncate `[...block.rows, ...extraRows].slice(0, MAX_BARS)` with no tracking of which extra rows were actually kept vs dropped by the slice.
- **Impact:** A user charting e.g. 12 ZIP prices plus a peer city's vacancy rate from the web can get a chart showing only 12 ZIP bars while the answer text still cites the unplotted peer figure as if it were on the chart.
- **Fix:** Have each attach* function return which extra items were actually kept after the slice, and use that filtered set (not the raw verifiedUploads/externals/user_points) to build groundingNote and chart.options.

### 15. `answered` flag computed before web-fallback runs, so a web-verified answer still shows a false 'data gap' banner
- **Lens/track:** ai-grounding · Track A · slice `assistant-core`
- **Where:** `lib/assistant/report-path.ts:109`
- **Problem:** `answered` is set at line 109 from `neededComponents.length === 0` (the authored method's `need` components) BEFORE `webFallbackForAnswer` runs at line 150. `webFallbackForAnswer` (lib/assistant/web-fallback.ts) can fetch and verify the exact missing figure live from a named web source and inject it into the grounding, and the model will then answer using it — but `answered` is never recomputed to reflect that. The stale `answered=false` is what streams on the `done` frame (line 197) and what's logged via `recordAsk` (line 189).
- **Evidence:** Verified by reading lib/assistant/report-path.ts:100-150 directly. Line 103-109: method/neededComponents/answered computed strictly from resolveMethod/grounding.method 'need' components. Line 150: `const { block: webBlock } = await webFallbackForAnswer(question, grounded);` executes after, and its result (webBlock) is only concatenated into `system` (line 151) — never fed back into `answered`. Line 184-194 recordAsk uses the same stale `answered`/`needed_components`. Line 195-199 emits `{ done: true, reach: reachSlugs, answered }` unchanged.
- **Impact:** HighlightPopup.tsx contains the gap-banner copy ('Request this data' CTA around line 555, matching the cited amber-box behavior) gated on `answered === false`. A user can get a real, web-cited answer to their exact question and still see the platform simultaneously claim the data isn't in the lake and invite a data request for the same figure just delivered — an internal contradiction that undermines trust in the grounding system.

### 16. Report-grounded chat stream skips the layer-2 brain-slug scrub
- **Lens/track:** ai-grounding · Track A · slice `api-mcp-assistant`
- **Where:** `lib/assistant/report-path.ts:177`
- **Problem:** runReportPath streams model text straight from `extractText(ai)` with no `scrubSlugStream` wrapper, unlike `streamAnswer` in stream.ts which wraps it. Layer 2 (output-stream scrub) never runs on the report-dock path.
- **Impact:** On the report page's ask-AI dock — fed the most raw multi-report grounding text of any surface — a hallucinated or leaked internal brain slug/id streams straight to the user with no safety net, unlike the conversation path.

### 17. freshness.ts's stale-figure force-refresh is never wired into the live chat/report conversation path
- **Lens/track:** ai-grounding · Track A · slice `assistant-aux`
- **Where:** `lib/assistant/web-fallback.ts:259`
- **Problem:** web-fallback.ts exports staleFiguresToRequests specifically so 'forced' web lookups can supersede stale held figures, and webFallback accepts a deps.forced param for exactly this. But webFallbackForAnswer — the one function conversation-path.ts and report-path.ts both call — invokes `webFallback(question, heldSystem)` with only two args, so deps defaults to {} and forced defaults to []. staleFiguresToRequests/staleFigures are only actually invoked from lib/email/build-doc.ts.
- **Evidence:** Confirmed webFallbackForAnswer body (lines 259-272) has no forced/staleFigures call; webFallback signature (line 173-176) shows `deps: {..., forced?: ExternalRequest[]} = {}` and `const forced = deps.forced ?? []` (line 180). Grep confirms conversation-path.ts:756,845 and report-path.ts:150 all call webFallbackForAnswer(question, system) with exactly two args, and staleFiguresToRequests/staleFigures are only invoked in lib/email/build-doc.ts (lines 213,219) plus test files.
- **Impact:** A chat or report-dock answer can serve an objectively stale held figure (by its own cadence rule) without ever refetching or caveating it, because the stale-refresh path only fires for scheduled emails, not the live conversational surface most users use.
- **Fix:** Thread staleFigures/staleFiguresToRequests into webFallbackForAnswer (or its callers) the same way build-doc.ts does, computing forced from the held dossier's figures before calling webFallback.

### 18. coverage_caveats collected but never rendered — non-core-county emails overclaim coverage
- **Lens/track:** ai-grounding · Track A · slice `email-activation`
- **Where:** `lib/email/grounded-report.ts:196`
- **Problem:** assembleActivationReport (lib/email/activation/snapshot.ts:248) collects dossier.coverage_caveats — the exact disclaimer that fires for a non-core-county ZIP (e.g. Hendry) telling the reader some data sets are Lee/Collier-only and don't extend to their county (lib/zip-dossier.ts:513-531, buildCoverageCaveats). AssembledReport carries this field, and GroundedReportModel extends AssembledReport so the field survives onto the model, but renderGroundedReport never reads model.coverage_caveats anywhere in the render path. Every lane built on this spine — activation email #1/#2, the recurring 'report' template, and the briefcase email/PDF — silently drops the one honesty caveat that exists specifically to stop a partial-coverage county read from looking like full coverage.
- **Evidence:** lib/zip-dossier.ts:526-529 produces the caveat string, snapshot.ts:248 stores it on AssembledReport.coverage_caveats. Grepping lib/email for 'coverage_caveats' shows every other hit is a test fixture (grounded-report.test.ts, render.test.ts, sequence.test.ts, recurring-report.test.ts, scoped-content.test.ts, golden/cases.ts) — no production render code in grounded-report.ts references it.
- **Impact:** A Hendry-County (or any non-core-county) recipient of an activation or recurring report email sees a fully-formed report with metrics and dossier lines but never the caveat explaining some domains don't cover their county — the email overclaims coverage in exactly the way the product's honesty rules forbid.

### 19. renderScopedBody renders the raw internal freshness_token verbatim into the sent email body, not an MM/DD/YYYY as-of date
- **Lens/track:** ai-grounding · Track A · slice `email-outreach`
- **Where:** `lib/email/scoped-content.ts:239`
- **Problem:** content.freshness_token is carried from WelcomeAnswer.freshness_token / dossier.freshness_tokens[brain_id], which is the raw internal brain token (format confirmed as e.g. 'SWFL-7421-v1-20260520' via refinery/render/speaker.test.mts and other call sites) — not a plain MM/DD/YYYY as-of date. renderScopedBody interpolates it unmodified into the plain-text email body on the renderHtml → ensureUnsubscribeToken → broadcast path this module's own header comment describes.
- **Evidence:** lib/email/scoped-content.ts:239-242 confirmed verbatim: `if (content.freshness_token) { if (lines.length) lines.push(""); lines.push(`Data: ${content.freshness_token}`); }`. Token format confirmed internal/raw via refinery/render/speaker.test.mts:91 (`freshness_token: "SWFL-7421-v1-20260520"`) and multiple other refinery/scripts call sites — never reformatted to MM/DD/YYYY anywhere in the token's lineage (lib/zip-dossier.ts assigns it straight from brain.freshness_token).
- **Impact:** Recipients of a scoped (ZIP/place/county) digest email see a raw internal system token like 'Data: SWFL-7421-v1-20260520' in the footer of a real send instead of a plain as-of date — a system-noun leak into user-facing copy, contradicting the locked rule that as-of dates are MM/DD/YYYY and the raw token stays internal-only.

### 20. PROPERTY/AGENT/EVENT/PRICE token defaults are fabricated concrete facts, not neutral placeholders
- **Lens/track:** ai-grounding · Track A · slice `email-templates2`
- **Where:** `lib/email/templates/token-defaults.ts:111`
- **Problem:** SWFL_TOKEN_DEFAULTS gives the hero-digest tokens (HERO_VALUE, STAT1_VALUE, etc.) the honest fallback "—" (lines 98-105, with comment '"—" = not held this run (never an invented number)'). But the real-estate tokens below get concrete, specific fake values: PROPERTY_ADDRESS: "123 Gulf Shore Blvd, Naples, FL 34102", PROPERTY_PRICE: "$850,000", PROPERTY_BEDS/BATHS/SQFT: "4"/"3"/"2,850", NEIGHBORHOOD_NAME: "Naples Park", EVENT_DATE/TIME: "Saturday, July 12"/"12:00 PM – 3:00 PM", PRICE_FROM/PRICE_TO/REDUCE_PCT: "$925,000"/"$850,000"/"8.1%". These merge via `{ ...SWFL_TOKEN_DEFAULTS, ...tokens }` in render-template.ts:31 (and app/api/email-lab/render/route.ts). If a caller omits a property/event field, the render silently substitutes a specific, plausible-looking fake address, price, bed/bath count, and date/time instead of a dash or explicit placeholder.
- **Evidence:** token-defaults.ts:98 HERO_VALUE: "—", (comment: never an invented number) vs line 112 PROPERTY_ADDRESS: "123 Gulf Shore Blvd, Naples, FL 34102", line 113 PROPERTY_PRICE: "$850,000", lines 125-126 EVENT_DATE/EVENT_TIME, lines 129-131 PRICE_FROM/PRICE_TO/REDUCE_PCT. Confirmed by direct read of the file.
- **Impact:** A recipient could receive a 'New Listing' or 'Price Drop' email quoting a specific Naples address, list price, reduction percentage, and open-house date/time that are entirely fabricated — none of it caveated as a placeholder — if any one of those fields wasn't populated by the caller before send.

### 21. Raw SWFL-...-YYYYMMDD freshness token shipped verbatim in user-facing dossier text
- **Lens/track:** ai-grounding · Track A · slice `zpage` (also reported in slice api-serve)
- **Where:** `lib/zip-dossier.ts:373`
- **Problem:** renderMetricText() — used by emitLine() branch (b) at line 432 (the true-ZIP key_metric path that /api/z/[zip]'s plain-text and JSON responses render via assembleLocationDossier) emits the raw freshness_token string wrapped in backticks instead of formatting it through asOfFromToken(). The comparable renderer in lib/fetch-brain.ts (renderDetailRowText at line 358, and fetchDetailRow's not-found message at line 413) both go through `asOfFromToken(token) ?? token` specifically to avoid rendering the raw internal token.
- **Evidence:** lib/zip-dossier.ts:373-379:
function renderMetricText(m: BrainOutputMetric, freshnessToken: string): string {
  return [
    `**${sanitizeProse(m.label)}** — ${formatMetricValue(m)}.`,
    `Source: ${cleanCitationForDisplay(m.source.citation)}`,
    `_Freshness:_ \`${freshnessToken}\``,
  ].join("\n\n");
}
called at line 432: `text: renderMetricText(m, brain.freshness_token)`.
Compare lib/fetch-brain.ts:358: `blocks.push(\`_Freshness:_ ${asOfFromToken(ctx.freshnessToken) ?? ctx.freshnessToken}\`);` and line 413 (fetchDetailRow not-found path) doing the same asOfFromToken() wrap.
- **Impact:** Any true-ZIP answer served through a brain's per-ZIP key_metric slug (branch b of the /api/z/[zip] fan-out) shows the reader an internal token like `SWFL-7421-v24-20260703` in a code-formatted span instead of a plain MM/DD/YYYY date — an internal-system artifact leaking into what's supposed to be a plain-English answer surface.

### 22. Internal build notes leak into the served per-ZIP payload
- **Lens/track:** ai-grounding · Track B
- **Where:** `permits/CRE per-ZIP block builder`
- **Problem:** 33904 payload text: 'Naples feed last refreshed 04/30/2026; current build excludes Collier from the SWFL rollup.' — process/internal wording the HARD RULES forbid surfacing.
- **Evidence:** live 33904 payload permit block verbatim.
- **Impact:** Internal build-state wording can be relayed to the user.
- **Fix:** Strip build-state notes from served narrative; keep them internal-only.

### 23. confirm-value insert writes columns the route's own comment says don't exist on the live table, so the endpoint 500s on every use
- **Lens/track:** bug · Track A · slice `api-projects`
- **Where:** `app/api/projects/[id]/confirm-value/route.ts:36`
- **Problem:** buildCollisionRow (lib/signals/log-collision.ts) always includes `surface`, `user_action`, and `gate_reason` keys in the inserted row. The route's own comment states these columns 'DO NOT exist on the live data_readiness_alerts table' per verification, and predicts the insert 500s (PGRST204) at runtime.
- **Evidence:** route.ts:30-35: `// KNOWN-DEBT(phantom-columns): buildCollisionRow writes surface/user_action/gate_reason, which DO NOT exist on the live data_readiness_alerts table ... So this insert 500s (PGRST204) at runtime today`. log-collision.ts:14-29 unconditionally sets `surface: "in_project"`, `user_action: a.userAction`, `gate_reason: a.gateReason ?? null` on every call.
- **Impact:** Every time a user clicks 'Keep mine' on a metric collision chip, the POST returns 500 and the confirmation is never recorded — the UI action silently fails to persist, and (per refresh-on-access.ts:52's confirmedValues gate) the value can then be overwritten again on the next refresh since the 'kept' confirmation never made it to storage.
- **Fix:** Apply migration docs/sql/20260619b_phase_f_alert_columns.sql to the live table if not already applied (it exists in-repo but per this route's comment the columns aren't present live) and drop the untyped client workaround, or strip the phantom fields from buildCollisionRow until the migration lands.

### 24. Contacts page has no server-side auth check, unlike every sibling page in the slice
- **Lens/track:** bug · Track A · slice `app-alerts-desk-contacts`
- **Where:** `app/contacts/page.tsx:7`
- **Problem:** ContactsPage is a bare client component with no cookies()/auth.getUser()/redirect() guard. Every other page in this slice (app/alerts/page.tsx:32-36, app/contacts/upload/page.tsx:34-38) does `const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect(...)` before rendering. Contacts skips this entirely and just renders the full UI (Add contact, Import CSV buttons, table) unconditionally.
- **Evidence:** export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  ...
  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((body) => setContacts(body.contacts ?? []))
      .catch(() => {});
  }, []);
- **Impact:** A logged-out (or session-expired) visitor hitting /contacts directly sees a fully-interactive page with the empty state "No contacts yet. Import a CSV / vCard or add one manually." — indistinguishable from a real empty contact list — instead of being redirected to log in. The 401 from /api/contacts is silently swallowed into `{ contacts: [] }`, so the user has no idea they aren't authenticated, and every action (Add/Import/Delete) will silently no-op or 401 with no error surfaced to them.

### 25. Page uses light-mode-default Tailwind color classes, but the site's actual background is unconditionally dark, making body text/borders unreadable for any visitor without a dark-mode OS preference
- **Lens/track:** bug · Track A · slice `marketing2`
- **Where:** `app/for-agents/page.tsx:75`
- **Problem:** app/globals.css sets `--background: var(--gulf-midnight)` (dark navy, #0a1419) unconditionally in `:root`, and a plain `body { background: var(--background); color: var(--foreground); }` rule applies it globally with no `@media (prefers-color-scheme: light)` or other light override anywhere in the file, and no Tailwind dark-mode variant customization (`@custom-variant dark` / `darkMode` config) exists in the codebase — confirmed by grep returning zero matches — so Tailwind's `dark:` classes activate only via the OS `prefers-color-scheme: dark` media query. This page instead uses the classic 'light-background-default, dark: as override' pattern: `text-neutral-600 dark:text-neutral-300` (line 75), `text-neutral-500` with no dark variant at all (line 69), and `border-black/[.08] dark:border-white/[.145]` (lines 99, 118, 146). For any visitor whose browser/OS reports a light or unset color-scheme preference, the `dark:` overrides never apply, leaving dark-gray text and near-black borders rendered against the page's actual, always-dark navy background. PageShell (components/PageShell.tsx) adds no background override either.
- **Evidence:** app/globals.css line 45: `--background: var(--gulf-midnight);` with no light override; line 185-188: `body { background: var(--background); color: var(--foreground); }` applied unconditionally; grep for `prefers-color-scheme|data-theme|darkMode` and `custom-variant|darkMode` across the repo returned zero matches. app/for-agents/page.tsx line 75: `text-lg text-neutral-600 dark:text-neutral-300`; line 69: `text-sm font-medium uppercase tracking-wide text-neutral-500` (no dark: pair); line 99: `border border-black/[.08] p-5 dark:border-white/[.145]`.
- **Impact:** Any visitor browsing with a light-mode or unset OS/browser color-scheme preference sees the hero subhead, step/differentiator card bodies, and card borders on this page rendered as dark gray on near-black — well below readable contrast — making most of the page's body copy and card boundaries effectively illegible.

### 26. Pulse page styled with Tailwind tokens that don't exist anywhere in the design system
- **Lens/track:** bug · Track A · slice `ask-pulse-guides`
- **Where:** `app/pulse/page.tsx:33`
- **Problem:** Secondary-text and divider classes (`text-muted-foreground`, `border-border/40`) used throughout app/pulse/page.tsx have no backing CSS custom property. app/globals.css's `@theme inline` block (lines 66-102) only exposes `--color-gulf-*`, `--color-text-primary/secondary/tertiary`, `--color-background/foreground`, etc. — there is no `--color-muted-foreground` or `--color-border` defined anywhere. A grep for `text-muted-foreground|border-border` across app/ turns up exactly one file: app/pulse/page.tsx.
- **Evidence:** app/pulse/page.tsx lines 22, 33, 54, 57, 81, 87 use text-muted-foreground / border-border/40; app/globals.css:66-102 @theme inline never declares --color-border or --color-muted-foreground; Grep across app/ confirms app/pulse/page.tsx is the sole match.
- **Impact:** Because Tailwind v4's CSS-first @theme can't resolve these utility names to any value, the intended muted/secondary text and hairline row dividers for stat labels, engagement metrics, hashtag counts, and captions never pick up the design system's grey — the page reads as unstyled boilerplate distinct from the rest of the site.

### 27. Anchor nested inside a button in CorridorRow
- **Lens/track:** bug · Track A · slice `cre-swfl`
- **Where:** `app/r/cre-swfl/CREMetricsExplorer.tsx:119`
- **Problem:** The corridor row's clickable element is a <button> (line 101), and inside it (nested inside a <span> at line 110) sits an <a href> (line 119) used as the SEO-crawlable link to the corridor's report. Interactive content (<a>) nested inside other interactive content (<button>) is invalid per the HTML content model, and React will emit a hydration-mismatch/validateDOMNesting warning at runtime.
- **Evidence:** Line 101: `<button onClick={onToggle} ...>` ... line 110: `<span className="flex flex-col">` ... line 119: `<a href={`/r/cre-swfl/${corridor.slug}`} className="sr-only">{corridor.name} commercial real estate report</a>` ... closing `</span>` and `</button>` follow.
- **Impact:** Screen-reader/keyboard users get an inconsistent, spec-invalid focus order (a hidden link buried inside a toggle button), and the console fills with React DOM-nesting warnings on every render of the corridor list — a real a11y regression on a page that already has an explicit visible 'Full {corridor} report →' link for the same purpose.

### 28. FindItButton keyed only by metric_key — state bleeds across ZIP navigation
- **Lens/track:** bug · Track A · slice `zip-report`
- **Where:** `app/r/zip-report/[zip]/page.tsx:332`
- **Problem:** The Find-it slot list is keyed by `g.metric_key` alone, never by `zip`. Since the FIND_METRIC_GAPS allowlist currently has exactly one gap (`permits_90d`), every gapped Cape Coral ZIP renders a single-item gaps array with the SAME React key on every ZIP page. A client-side App Router transition between two gapped ZIPs reconciles by key and reuses the FindItButton instance instead of remounting it — its internal useState (phase/figure/pointer) is preserved across the navigation.
- **Evidence:** page.tsx line 332: `key={g.metric_key}` with no zip component. find-it-button.tsx lines 43-45: `const [phase, setPhase] = useState<Phase>(initialFigure ? "found" : "idle"); const [figure, setFigure] = useState<FoundFigure | null>(initialFigure ?? null); const [pointer, setPointer] = useState<Pointer>(coverage);` — these only initialize once per mount and there is no effect resetting them when zip/metricKey/initialFigure props change.
- **Impact:** A user who clicks 'Find it' on one gapped ZIP's permit gap, gets a found figure, then navigates to another gapped ZIP via Nearby ZIPs can see the prior ZIP's found permit value/source rendered as if it belongs to the new ZIP — a wrong-ZIP figure shown as fact until a hard refresh.

### 29. Inspector has no field UI for the "sources" block type
- **Lens/track:** bug · Track A · slice `app-emaillab`
- **Where:** `components/email-lab/BlockInspector.tsx:41`
- **Problem:** LABELS registers a human label for the "sources" block type, but BlockInspector's JSX body has no `block.type === "sources"` branch anywhere in the file. Every other block type in BLOCK_CONTRACT has a matching case; sources does not.
- **Evidence:** Read the full file (lines 1-1281): LABELS includes `sources: "Sources",` at line 41, and the JSX body has explicit branches for header, hero, stats, signal, text, image, listing, multi-column, list, metric-card, agent-card, button, divider, agent-hero, social-icons, and footer — but zero occurrence of `block.type === "sources"`. Selecting a sources block renders only the header (label "Sources") and the AI-fill/Delete controls, with an empty middle panel.
- **Impact:** A signed-in user browsing a ZIP-seeded email who clicks the Sources block sees the header and Delete/AI-fill controls but a completely empty middle panel — no way to see or edit what's in it, reading as a broken/incomplete feature.
- **Fix:** Add a `block.type === "sources"` branch rendering the held SourceCitation[] (read-only list, since sources are builder-seeded/never AI-authored) — or short-circuit selection for sources blocks so clicking one doesn't open a blank inspector panel.

### 30. Six of the nine homepage components in this slice are dead code — never rendered on the homepage
- **Lens/track:** bug · Track A · slice `home`
- **Where:** `components/landing/Capabilities.tsx:38`
- **Problem:** app/page.tsx (the live homepage) imports and renders only HeroBar, Hero, SiteDoors, GuidesStrip, PricingStrip, and ObjectionFaq. Waitlist.tsx, ComparisonSection.tsx, Charts.tsx, ProofStrip.tsx, Capabilities.tsx, and DeliverableShowcase.tsx are not imported by app/page.tsx or by any other page/route in the repo.
- **Evidence:** Read app/page.tsx lines 1-53 directly: imports are exactly HeroBar, Hero, SiteDoors, GuidesStrip, PricingStrip, ObjectionFaq (plus EMAIL_LAB_LANDING and loadHomeMapData). A repo-wide grep for `landing/Waitlist|landing/ComparisonSection|landing/Charts|landing/ProofStrip|landing/Capabilities|landing/DeliverableShowcase` across all .ts/.tsx files returned zero matches. Confirmed app/charts/page.tsx and app/waitlist-form.tsx are unrelated same-named surfaces that import from @/components/charts (a different directory) or are self-contained, not the components/landing/ files in question.
- **Impact:** None directly for site visitors, but it is a landmine for whoever touches the homepage next — Capabilities.tsx's persona cards, DeliverableShowcase.tsx's 'how it works' walkthrough, and ProofStrip.tsx's citation strip look like real, current marketing copy but are entirely unreachable.

### 31. Send/model failure during auto-reply silently loses the block reason
- **Lens/track:** bug · Track A · slice `email-inbound`
- **Where:** `lib/email/process-inbound.ts:207`
- **Problem:** When `deps.generateAnswer` or `deps.sendAutoReply` throws inside the try block, the catch sets `answerText = null` but `decision.allow` is still `true`. `blockedReason` at line 220 is computed purely from `decision.allow ? null : decision.reason`, so a genuine send failure produces `blockedReason: null` — identical to the case where nothing needed blocking. Same collapse for `decision.allow && rawReply` failing solely because `rawReply` is empty.
- **Evidence:** catch (err) { deps.log(...); answerText = null; } ... const blockedReason = decision.allow ? null : decision.reason;
- **Impact:** agent-alert.ts's blockedNote(reason) switches on blockedReason and falls to the generic default "We did not auto-reply to this one." for null/unrecognized reasons (confirmed at agent-alert.ts:33-47,71) — a real send-side outage (Resend API error, grounded-engine failure) reads identically to a routine intentional no-reply, so a systemic failure can persist unnoticed.

### 32. Refresh route and applyRefresh build the brain-value cache key differently, so items without an explicit scope_value never refresh
- **Lens/track:** data-match · Track A · slice `api-projects`
- **Where:** `app/api/projects/[id]/refresh/route.ts:55`
- **Problem:** The route fetches brain values keyed by `refreshKey(item.report_id, slug, scopeVal)` where `scopeVal = item.scope_value ?? fallbackZip` — it falls back to the project's inferred ZIP when an item has no scope_value of its own. But `applyRefresh` (lib/project/refresh-on-access.ts) rebuilds the SAME key using `const scopeValue = item.scope_value;` with no fallback. For any metric/qa item that has no explicit scope_value, the route populates `brainValues['report|slug|33901']` but `applyRefresh` looks up `brainValues['report|slug|']` (empty scope segment) — a guaranteed miss.
- **Evidence:** route.ts:55-56: `const scopeVal = item.scope_value ?? fallbackZip; const key = refreshKey(item.report_id, slug, scopeVal);` vs refresh-on-access.ts:55-56: `const scopeValue = item.scope_value; const key = refreshKey(item.report_id, slug, scopeValue);` — the fallback exists only on the write side of the cache, never on the read side.
- **Impact:** Any project item that doesn't carry its own scope_value silently never picks up a fresher brain value on refresh — `brain` is always undefined so `applyRefresh` returns `item` unchanged (refresh-on-access.ts:59). The user sees `refreshed: 0` / 'No metric items needed refreshing' even when the underlying data has moved, with no error surfaced — a stale number is shown as current indefinitely.
- **Fix:** Either compute `fallbackZip` inside applyRefresh and use the same `item.scope_value ?? fallbackZip` expression there, or push the resolved scope value onto each item before calling applyRefresh so both sides key off the identical resolved value.

### 33. checkout.session.completed silently drops the tier upgrade forever if the follow-up subscription retrieve merely fails transiently
- **Lens/track:** data-match · Track A · slice `api-stripe-billing`
- **Where:** `app/api/stripe/webhook/route.ts:60`
- **Problem:** `fetchSubscription` (lines 38-56) wraps `stripe.subscriptions.retrieve` in try/catch and returns `null` on ANY failure — network blip, rate limit, transient Stripe 5xx — logging only `console.error`. `normalizeEvent`'s `checkout.session.completed` case then falls back to a null lookup key, and `subscriptionMutationFromEvent` treats a null lookup key as 'unknown price — refuse to guess', returning `null`. Back in the webhook route, `if (!mutation) return NextResponse.json({ received: true, ignored: true })` returns HTTP 200, so Stripe considers the event successfully delivered and NEVER retries. There is no persisted record of the failure, no DLQ, no follow-up job — only a `console.error` line.
- **Evidence:** Confirmed lines 38-60 verbatim: fetchSubscription catches all errors from subscriptions.retrieve and returns null with only console.error; line 58-60 acks 200 regardless of whether null resulted from transient failure or genuinely unknown price.
- **Impact:** A customer completes checkout and is charged, but if the immediately-following `subscriptions.retrieve` call hits any transient error, their `billing_subscriptions` row never gets upgraded — they keep seeing the free tier / send limits on /billing despite having paid, with no automatic recovery path.
- **Fix:** Distinguish 'transient fetch failure' from 'genuinely unrecognized price' — on a transient failure, return a non-2xx status (e.g. 500) so Stripe retries the webhook per its standard retry schedule, instead of acking an event whose payload we know is incomplete.

### 34. source_url is fetched for every neighborhood/community but never rendered as a visible citation
- **Lens/track:** data-match · Track A · slice `communities`
- **Where:** `app/r/communities-swfl/n/[neighborhood]/page.tsx:61`
- **Problem:** NeighborhoodStat.source_url and CommunityProfile.source_url are pulled from data_lake and mapped in communities.ts, but neither report page renders a source link to the human reader. The neighborhood page has no JSON-LD at all, so source_url populated by mapNeighborhood() is never read anywhere. The community page only stuffs source_url into invisible schema.org FAQ text -- never a visible link on the page. Two of the community page's own visible figures (nearby_dining_count, cdd_flag) aren't even included in that invisible JSON-LD, so they carry zero source treatment anywhere.
- **Evidence:** communities.ts:61 `source_url: string | null;` on NeighborhoodStat interface, populated at communities.ts:121 inside mapNeighborhood(); n/[neighborhood]/page.tsx (61 lines read in full) has zero references to n.source_url anywhere in the render; community page.tsx:149-151 renders CDD and Nearby dining Metas visibly but lib/jsonld.ts's communityJsonLd FAQ list (lines ~269-300) has no entries for cdd_flag or nearby_dining_count.
- **Impact:** A reader sees dollar HOA fees, home counts, golf-hole counts, dining counts and a median just-value with no way to tell where the number came from or verify it.
- **Fix:** Render a visible citation line (source_url as a link) on both pages for every displayed figure, or at minimum surface it once per page the way the community page does 'Drive-times computed by Mapbox.'

### 35. Disclosure panel hardcodes a full "trailing-365d" baseline claim that the source pack itself caveats as often incomplete
- **Lens/track:** data-match · Track A · slice `charts`
- **Where:** `components/charts/CorridorRentChart.tsx:447`
- **Problem:** The panel unconditionally states the permit z-score is measured relative to the trailing-365d baseline for every corridor, but permits-swfl.mts emits a narrative caveat when backfill_days < 365 saying the baseline is incomplete. The chart has no access to backfill_days and always prints the full-year claim.
- **Evidence:** Lines 446-450: 'Z-Score measures building permit volumes normalized relative to the trailing-365d baseline. Sample of {selectedCorridor.permits.n_current} qualifying permits.' Confirmed against refinery/packs/permits-swfl.mts line 875-877: 'if (snap.backfill_days < 365) { ... "Lee permit history only reaches back ${snap.backfill_days}d (< 365d) - the historical baseline is incomplete..."'
- **Impact:** A user reading the corridor detail panel is told the z-score is normalized against a full year of history even when the real backfill window is shorter — overstating the statistical reliability of the number shown.

### 36. MLS settings page renders in a light theme dropped into the dark app shell
- **Lens/track:** design · Track A · slice `app-account-settings`
- **Where:** `app/settings/mls/mls-settings-client.tsx:148`
- **Problem:** Every other settings/account surface in this slice uses the gulf-teal dark design system, while MlsSettingsClient.tsx uses plain light-mode Tailwind defaults: `border rounded-md` (default light gray border), `text-gray-700`, `text-red-600`, and a raw `bg-black text-white` primary button.
- **Evidence:** Line 153: className="w-full border rounded-md px-3 py-2 text-sm" (select); line 170 same pattern for input; line 178: className="w-full bg-black text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"; line 223: className="rounded-lg border p-4 space-y-2 text-sm text-gray-700". Confirmed by direct read of the file — every className cited matches verbatim at the cited lines.
- **Impact:** Text/labels with no explicit dark-safe color (e.g. text-gray-700 at line 223, text-gray-500 at line 265) render at low contrast if the page root inherits the dark canvas background, and the whole page reads as an unstyled product mid-flow through on-brand dark-themed settings pages.

### 37. Step-count pill uses near-black text on the showcase's own dark accent color — fails contrast for the agent-launch card
- **Lens/track:** design · Track A · slice `showcase`
- **Where:** `components/showcase/ShowcaseCard.tsx:36`
- **Problem:** The '{n} steps' pill sets `background: showcase.accent` and text class `text-navy-dark`. `--color-navy-dark` resolves to `--gulf-midnight` = #0a1419 (near-black), per app/globals.css. For the 'agent-launch' showcase (registry.ts, accent `#1F4D3A`, a dark forest green), that pairs near-black text (#0a1419) directly on a dark green pill (#1F4D3A) — well below WCAG minimum contrast. The same accent+text-navy-dark pairing is reused for that showcase's active-step nav button in ShowcaseOverlay.tsx.
- **Evidence:** Verified: ShowcaseCard.tsx lines 36-37 — className has text-navy-dark, style sets background: showcase.accent. registry.ts line 247: accent: "#1F4D3A" for id "agent-launch" (line 221). globals.css line 7: --gulf-midnight: #0a1419; line 91: --color-navy-dark: var(--gulf-midnight) inside unconditional @theme inline block (not dark-mode gated). ShowcaseOverlay.tsx line 127-129 reuses identical pattern: active ? "text-navy-dark" : ... with style background: showcase.accent when active.
- **Impact:** On the agent-launch showcase card (and its overlay's active step-rail button), the '3 steps' badge text is dark-on-dark — near-black (#0a1419) on dark forest green (#1F4D3A) — effectively illegible, while the same component looks fine for the other three showcases whose accents are lighter (#B98F45 gold, #0E7C86 teal, #C4551A orange).

### 38. Per-network caption variants are computed then discarded — every scheduled platform gets the same generic caption
- **Lens/track:** email-content · Track A · slice `social`
- **Where:** `app/api/social/schedule/route.ts:136`
- **Problem:** freezePost() is called ONCE on the generic `post` object (line 136) before the per-platform map at line 142, and the same `frozen` object is reused unmodified for every platform's insert row. `post.variants` (populated by buildVariants/PLATFORM_RULES in lib/email/social-calendar/build-week.ts) is never read in this file, and `freezePost` in lib/social/persist-schedule.ts only ever writes `draft.caption` into `FrozenPost.caption` — a type with no per-platform field at all.
- **Evidence:** Read route.ts lines 136-157: `const frozen = freezePost(post, nowIso, {...});` runs once, then `const rows = scheduled.map((platform) => buildSocialScheduleInsert({ ... frozenPost: frozen, ... }))` reuses the identical `frozen` for every platform. persist-schedule.ts freezePost() signature takes a single SocialDraft and returns caption: draft.caption with no platform parameter or branching.
- **Impact:** A user who schedules a post to X, LinkedIn, and Instagram in one action gets the identical caption fired to all three — the platform-tailored variants built at compose time (character clamping, long-form, hashtag block) never reach the persisted schedule.

### 39. Social-card patch validation failure silently ships raw authoring-instruction placeholder text as reader copy
- **Lens/track:** email-content · Track A · slice `email-outreach`
- **Where:** `lib/email/social-calendar/build-week.ts:211`
- **Problem:** assembleDraft() only rejects a draft when the FILLED doc fails EmailDocSchema. If the model's patch object fails ContentPatchSchema.safeParse, the code silently falls back to the unmodified seed card (filledRaw = card) instead of returning null. The seed card's hero/signal/text fields in default-docs.ts are literal authoring instructions (non-empty strings), so docSkeleton's open-slot mechanism never flags them as required-to-fill, and on a patch-parse failure this instruction text becomes the card that ships — repeating the same defect class documented (and only partially fixed for agent-card.bio) in default-docs.ts's own 07/13 postmortem comment.
- **Evidence:** lib/email/social-calendar/build-week.ts:211-214: `const patch = ContentPatchSchema.safeParse(parsed.patch); const filledRaw = patch.success ? applyPatch(card, patch.data) : card; const filled = EmailDocSchema.safeParse(filledRaw); if (!filled.success) return null;` — confirmed verbatim by Read. default-docs.ts:59-77 confirmed verbatim: hero.label/prose, signal.title/body, and text.body are all non-empty literal instruction strings (only hero.value is ""), and the file's own comment at lines 109-117 documents the identical defect class shipping live 07/13 for agent-card.bio.
- **Impact:** A social post (Market Monday / Tip Tuesday / Neighborhood Spotlight / Local Life card) can ship — or be shown as a 'ready' draft the agent copies verbatim — with the raw internal authoring instruction as its visible headline, sub-line, or body copy instead of real market content, repeating the live 07/13 agent-card.bio incident but now for hero/signal/text used by every social-calendar post.

### 40. Chart/body bracket placeholders are only replaced when the value is a non-empty string — an empty explanation ships the literal "[ BODY TEXT ]" to a live recipient
- **Lens/track:** email-content · Track A · slice `email-templates`
- **Where:** `lib/email/templates/render-template.ts:35`
- **Problem:** `if (data?.chart) html = html.replace(...)` and `if (data?.body) html = html.replace(...)` use truthy checks, unlike the DELTA slot two lines below which is always replaced (`html = html.replace(/\[\s*DELTA\s*\]/g, data?.delta ?? "")`, with a comment noting DELTA must never be left as a literal token). email-outreach.html always contains a literal `[ BODY TEXT ]` cell (line 55) with no conditional wrapper, so an empty-string `body` leaves the raw bracket text in the rendered HTML. The unfilled-token assert at line 43 only catches `{{UPPER_CASE}}` tokens, not `[ ... ]` bracket slots, so this ships silently.
- **Evidence:** if (data?.chart) html = html.replace(/\[\s*CHART\s*\]/g, data.chart);
if (data?.body) html = html.replace(/\[\s*BODY TEXT\s*\]/g, data.body);
// DELTA is always replaced — an absent delta must not leave a literal `[ DELTA ]`.
html = html.replace(/\[\s*DELTA\s*\]/g, data?.delta ?? "");
- **Impact:** `lib/email/outreach/drip-email.ts` builds `body` as `[input.explanation, ...optional sections].filter(Boolean).join("")` (lines 158-173) — if `input.explanation` is an empty string and no delta/stats/buttons/sources are set, `body` becomes `""`, which is falsy, so the `if (data?.body)` branch never fires. `campaign.ts` (the live cold-outreach composer, lines 126-143) only null-checks `content` itself before calling `renderDripEmail`, never `content.explanation` for non-emptiness. A copy-generation miss or trimmed whitespace-only explanation therefore ships a cold-outreach email with the literal text "[ BODY TEXT ]" visible to the recipient, with no server-side guard to catch it.

## MEDIUM (33)

### 41. Unhandled internal error messages passed straight through to the API response
- **Lens/track:** ai-grounding · Track A · slice `zpage`
- **Where:** `app/api/z/[zip]/route.ts:66`
- **Problem:** The GET handler's catch-all (lines 65-69) wraps resolveLocation/assembleLocationDossier in a try/catch that returns `(err as Error).message` verbatim as the JSON error body. assembleLocationDossier's per-entry loop (lib/zip-dossier.ts line 589, inside the function starting at 585) throws an internal-jargon message naming a raw brain_id and an internal doc path the moment a catalogued brain is missing a BRAIN_GEO entry.
- **Evidence:** app/api/z/[zip]/route.ts:65-69:
} catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500, headers: COMMON_HEADERS },
    );
  }
lib/zip-dossier.ts:588-592 (inside assembleLocationDossier's per-brain loop):
const geo = BRAIN_GEO[entry.id];
if (!geo) {
  throw new Error(
    `BRAIN_GEO missing entry for catalog brain '${entry.id}' — add it (see §C brief, 03-fanout.md).`,
  );
}
- **Impact:** If a catalogued brain is missing its BRAIN_GEO entry, any caller of /api/z/[zip] gets a 500 body that names an internal brain_id and an internal spec file path ('03-fanout.md') — a system-noun/internal-jargon leak on a user-facing API response, not just a generic failure.

### 42. As-of fallback can render an unformatted raw date string instead of MM/DD/YYYY
- **Lens/track:** ai-grounding · Track A · slice `communities`
- **Where:** `app/r/communities-swfl/[community]/page.tsx:130`
- **Problem:** Both report pages format the DB as_of value with asOfFromIso(x) ?? x -- if asOfFromIso fails to parse the value (returns null), the code falls back to the raw, unformatted x instead of a MM/DD/YYYY string, defeating the product's as-of formatting guarantee on the parse-failure path.
- **Evidence:** page.tsx:130 `{c.as_of && <Meta label="As of" value={asOfFromIso(c.as_of) ?? c.as_of} />}`; same pattern at n/[neighborhood]/page.tsx:68 `{n.as_of && <Meta label="As of" value={asOfFromIso(n.as_of) ?? n.as_of} />}`.
- **Impact:** If a future community_profiles/neighborhood_stats row stores as_of in any format other than what asOfFromIso parses, the page renders that raw value verbatim instead of the MM/DD/YYYY the product's date rule requires everywhere.
- **Fix:** Drop the raw fallback -- if asOfFromIso returns null, omit the Meta entirely rather than falling through to an unguarded raw string.

### 43. valueAppearsInText's 2-digit floor makes any true single-digit figure permanently unverifiable
- **Lens/track:** ai-grounding · Track A · slice `assistant-aux`
- **Where:** `lib/assistant/gap-fill.ts:137`
- **Problem:** valueAppearsInText requires digitsOf(value).length >= 2 before attempting any match. Any genuinely correct external figure whose digit-stripped form is a single digit (e.g. a whole-number percent like 5%-9%, or $5) can never be verified against a citation, regardless of how clearly the source states it — the function returns false unconditionally before comparing.
- **Evidence:** Confirmed function body lines 137-141: `const target = digitsOf(value); if (target.length < 2) return false; return digitsOf(text).includes(target);` digitsOf(5) === "5" (length 1), so the function returns false before the .includes check ever runs.
- **Impact:** Real, correctly-sourced single-digit figures (common shape for vacancy/cap rates) get systematically dropped as 'unverifiable' by fillExternalPoint even when the model quoted the exact right cited source, degrading a case that should just work.
- **Fix:** Raise the floor only for genuinely ambiguous values (e.g. require the matched digit to be bounded by non-digit characters on both sides in cited text) rather than blanket-rejecting every single-digit value.

### 44. As-of date renders as "Jun 10" (no year) instead of the required MM/DD/YYYY format
- **Lens/track:** ai-grounding · Track A · slice `email-templates`
- **Where:** `lib/email/grounded-report.ts:104`
- **Problem:** `tokenDate()` formats the parsed freshness-token date with `{ month: "short", day: "numeric" }` only — no year. This value fills the AS_OF_DATE token and the delta block's "Re-verified"/"since" phrases, so every grounded report and every recurring/briefcase email states its as-of date as e.g. "Jun 10" rather than the project's locked MM/DD/YYYY convention.
- **Evidence:** return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
- **Impact:** Every recipient-facing as-of date in the grounded-report lane (activation email, recurring digest "report" template, briefcase email/PDF) omits the year, e.g. "Data as of Jun 10" instead of "06/10/2026." Besides being off house-style, a year-less date read months or years after send is genuinely ambiguous about which year the report's data reflects.

### 45. Grounded auto-reply discards its own freshnessToken — no staleness caveat, ever
- **Lens/track:** ai-grounding · Track A · slice `email-inbound`
- **Where:** `lib/email/process-inbound.ts:205`
- **Problem:** `deps.generateAnswer` returns `{ text, freshnessToken }` but `freshnessToken` is never read in this file — not appended to the auto-reply body, not passed to `recordEvent`, not passed to `sendAgentAlert`. Other answer-rendering paths in the codebase treat the freshness token as load-bearing (append a caveat / gate staleness), but this path bypasses both.
- **Evidence:** const answer = await deps.generateAnswer(rawReply); await deps.sendAutoReply({ ..., text: answer.text }); answerText = answer.text; // freshnessToken never touched. InboundDeps.generateAnswer returns { text: string; freshnessToken: string } at line 75.
- **Impact:** A client who emails back and gets an automated grounded answer can receive a stale-data answer with no caveat at all — the one path in the codebase with an explicit staleness-check convention is bypassed entirely for this send.

### 46. Freshness fallback ships the raw internal token verbatim when the token fails to parse
- **Lens/track:** ai-grounding · Track A · slice `api-serve`
- **Where:** `lib/fetch-brain.ts:358`
- **Problem:** asOfFromToken(ctx.freshnessToken) ?? ctx.freshnessToken and the identical pattern at line 413 fall back to the raw token string itself when the freshness token doesn't match the expected date-suffix format, instead of omitting the line or erroring loudly.
- **Evidence:** Read lib/fetch-brain.ts: line 358 `blocks.push(`_Freshness:_ ${asOfFromToken(ctx.freshnessToken) ?? ctx.freshnessToken}`);` and line 413 `... _Freshness:_ ${asOfFromToken(brain.freshness_token) ?? brain.freshness_token}`... Confirmed in lib/project/as-of.ts that asOfFromToken returns null (not the raw token) whenever the regex /(\d{4})(\d{2})(\d{2})\b/ fails to match or month/day validation fails.
- **Impact:** If a brain ships a malformed/legacy freshness token, the ZIP-drill response silently prints the raw SWFL-... token to the user rather than a plain date, with no log or caveat.

### 47. '6-county footprint' scope overclaim in a source line
- **Lens/track:** ai-grounding · Track B
- **Where:** `permits-commercial-swfl source string`
- **Problem:** permits-commercial-swfl source string says 'scope-gated to the 6-county footprint' — contradicts locked scope (Lee+Collier core, Hendry minor; NOT 6-county).
- **Evidence:** live payload permits-commercial-swfl source line.
- **Impact:** Overclaims geographic coverage in a citation a user can see.
- **Fix:** Correct the source string to the real footprint.

### 48. CORS headers only applied to the OPTIONS preflight, never to the real POST/DELETE response
- **Lens/track:** bug · Track A · slice `api-mcp-assistant`
- **Where:** `app/api/mcp/route.ts:108`
- **Problem:** POST/DELETE return `handler(request)` verbatim with no CORS_HEADERS merge, and mcp-handler's `createMcpRouteHandler` never attaches Access-Control-Allow-Origin to its actual JSON-RPC response — only its unrelated protectedResourceHandler/metadata OPTIONS paths use corsHeaders.
- **Impact:** A browser-origin MCP client calling this connector cross-origin passes CORS preflight but then has the browser block reading the actual tool-call response body (missing Access-Control-Allow-Origin), so the call appears to hang or silently fail even though server-side/curl testing looks fine.

### 49. Address-gated spread silently discards found-but-unpriced comps and shows a misleading 'check your address' message
- **Lens/track:** bug · Track A · slice `sell-pages`
- **Where:** `app/r/should-i-sell/[zip]/page.tsx:93`
- **Problem:** `spread` only renders when `v0Estimate || comps.needs.length > 0` (line 93). `deriveV0FromComps` requires ≥2 priced comps (derive-v0.ts line 32: `if (prices.length < 2) return null;`, filtering to `price != null` only). `compsForAddress`'s `needs` array is populated only when `surfaced.length < 2` (comp-helper.ts line 337), which counts ALL surfaced comps regardless of whether they carry a price (comp-helper.ts line 317-319 shows `last_list` comps can have `price = c.listPrice` which 'may be null'). So an address that geocodes fine and returns 3+ comps, fewer than 2 of which are priced, produces `v0Estimate === null` and `comps.needs.length === 0` simultaneously — neither branch fires, `spread` stays null, and the page falls through to the generic message at lines 181-186: 'We couldn't pull nearby sales for that address yet — check it's a full Lee or Collier County street address...' even though the address resolved and comps were found.
- **Evidence:** app/r/should-i-sell/[zip]/page.tsx:93 confirmed `if (v0Estimate || comps.needs.length > 0)`. lib/should-i-sell/derive-v0.ts:32 confirmed `if (prices.length < 2) return null;` after filtering to typeof 'number' prices only. lib/assistant/comp-helper.ts:317-319 confirmed `price = c.listPrice; // may be null` for last_list comps. lib/assistant/comp-helper.ts:336-341 confirmed `needs` only pushed `if (surfaced.length < 2)` — no price-count check.
- **Impact:** A seller who enters a legitimate Lee/Collier address is told to double check their address is valid, when the real issue is too few of the nearby comps carried a price — sending the user down the wrong troubleshooting path instead of prompting them to enter their own value (which the code already supports).

### 50. Basemap fetch has no error handling — a failed/404 SVG load leaves a blank map with no error state
- **Lens/track:** bug · Track A · slice `charts`
- **Where:** `components/charts/ZipChoropleth.tsx:98`
- **Problem:** fetch("/maps/lee-collier.svg") is chained with .then() calls but no .catch(). If the request fails, the rejection is unhandled and the component silently renders just the empty background with no fallback UI.
- **Evidence:** Lines 98-100: fetch("/maps/lee-collier.svg").then((r) => r.text()).then((svgText) => { container.innerHTML = svgText; ... }) — no .catch anywhere in the effect.
- **Impact:** If the SVG asset is missing or the fetch fails, users see an unexplained blank dark panel where the ZIP map should be, with no indication anything went wrong.

### 51. The exported AddBlockPanel component is dead code with light-mode styling that would clash if ever mounted
- **Lens/track:** bug · Track A · slice `app-emaillab`
- **Where:** `components/email-lab/AddBlockPanel.tsx:11`
- **Problem:** EmailLabGridShell.tsx (the only production consumer) imports only `BLOCK_MENU` from this file and re-implements its own dark-styled add-block grid inline. The `AddBlockPanel` function itself, with its light `bg-white`/`text-gray-700` styling, is referenced nowhere else in the app — only in `AddBlockPanel.stories.tsx`.
- **Evidence:** AddBlockPanel.tsx:19 renders `className="grid w-56 grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"`. Grep of `EmailLabGridShell.tsx` shows only `import { BLOCK_MENU } from "./AddBlockPanel";` (line 44) — the `AddBlockPanel` component itself is never imported/rendered there. Lines 2198-2214 of EmailLabGridShell.tsx contain a separate, dark-themed (`bg-white/4`, `text-white/55`) inline reimplementation of the same add-block grid using `BLOCK_MENU`. A repo-wide grep confirms `AddBlockPanel` (the component/JSX) is used only in `AddBlockPanel.stories.tsx`.
- **Impact:** No direct user-facing symptom today since it's unreached, but it's a landmine: a future edit to EmailLabGridShell's inline add-block markup won't touch this component, and vice versa — the two will silently drift, and if AddBlockPanel is ever wired in by a future dev believing it's the live implementation, its light theme would render wrong inside the dark right-hand aside.
- **Fix:** Either delete the unused component (keep only the `BLOCK_MENU` export) or actually mount it and delete the duplicated inline markup in EmailLabGridShell.tsx.

### 52. Media library rename/delete update UI optimistically with no rollback or error surfacing on a failed request
- **Lens/track:** bug · Track A · slice `app-emaillab`
- **Where:** `components/email-lab/MediaPanel.tsx:78`
- **Problem:** `rename()` mutates local `items` state immediately, then fires the PATCH without checking `res.ok`; `remove()` mutates state immediately then fires DELETE without checking `res.ok`. If either request 4xx/5xx's, the UI keeps showing the change as successful with no error message and no revert.
- **Evidence:** Read lines 78-98 directly: rename() at lines 82-87 does `setItems(...)` then `await fetch(...)` with the response never inspected; remove() at lines 92-97 does the identical pattern for DELETE.
- **Impact:** A user renames or deletes a media asset, sees it take effect instantly, but if the request actually failed the asset is unchanged server-side — it may reappear/revert later with no explanation, and in the interim the user has no way to know the action didn't really happen.
- **Fix:** Check `res.ok` after the PATCH/DELETE; on failure, revert the optimistic state change and surface an error so the user isn't told a false success.

### 53. openSchedule() reuses a stale exported PNG after later canvas edits
- **Lens/track:** bug · Track A · slice `social`
- **Where:** `components/email-lab/social/useSocialComposer.ts:447`
- **Problem:** `mediaUrl` state is set exactly once, inside exportPng() (line 440), and is never reset to null by any other state-mutating function in the file (updateElement, addElement, deleteSelected, applyPhotoUrl, addChart, setDesign calls at lines 108/112/117/170/220/239/263/269/278/345/374 all mutate `design` without touching `mediaUrl`). openSchedule() at line 447-451 does `mediaUrl ?? (await exportPng())`, so once a PNG has been exported, any subsequent edit to the canvas is not reflected the next time openSchedule() runs — the stale URL short-circuits a fresh export.
- **Evidence:** Grep across the file confirms setMediaUrl appears only once, at line 440 inside exportPng(). Read lines 447-451: `async function openSchedule() { const url = mediaUrl ?? (await exportPng()); if (!url) return; setScheduleOpen(true); }` — no invalidation path exists for a previously-set mediaUrl.
- **Impact:** If a user opens Schedule, closes the modal, edits the canvas (fixes a typo, changes a stat, adds an element), and clicks Schedule again, the persisted frozen_post's media_url still points at the OLD exported image while the design/caption sent alongside it reflects the new content — the scheduled post's image will not match what the user just edited.

### 54. WeeklyReadCapture — the component whose own comment says it 'replaces the dead-end waitlist' — is itself dead, while the waitlist it was meant to replace is still in the tree
- **Lens/track:** bug · Track A · slice `home`
- **Where:** `components/landing/WeeklyReadCapture.tsx:6`
- **Problem:** WeeklyReadCapture.tsx's header comment states it 'replaces the dead-end waitlist' and posts to a real endpoint, but WeeklyReadCapture is not rendered anywhere, so the live homepage has neither the old Waitlist form nor its intended replacement.
- **Evidence:** Read components/landing/WeeklyReadCapture.tsx lines 1-15, confirmed the comment text verbatim: 'Weekly-read capture (Lane B spec §6 / spine D3) — replaces the dead-end waitlist. Posts to the LIVE Lane D enrollment endpoint (POST /api/weekly-read/subscribe...)'. Confirmed via the same repo-wide grep that WeeklyReadCapture is never imported by any page/route.
- **Impact:** The homepage currently has no email-capture/subscribe surface at all despite two full implementations existing in the codebase — a built, working backend endpoint sits unused.

### 55. Accent swatch bar is absolutely positioned inside a non-positioned row, so h-full stretches past the row
- **Lens/track:** bug · Track A · slice `app-project`
- **Where:** `components/project/MaterialRow.tsx:184`
- **Problem:** The 4px brand-color swatch (`absolute left-0 top-0 h-full w-1`) is nested inside the compact row's own `<div role="button" ...>` (line 170), but that row div has no `relative`/positioned class. Its nearest positioned ancestor is the OUTER wrapper at line 88 (`className="group relative"`), which also contains the version-accordion toggle (line 227+) and the send-to-contacts modal. Since that outer div's height auto-sizes to fit all its children stacked vertically, `h-full` on the swatch resolves against the WHOLE card's height, not just the visible row's height.
- **Evidence:** Line 88: `<div className="group relative">` wraps everything. Lines 170-181: the compact row `<div role="button" ... className="flex cursor-pointer items-center gap-3 border-b ...">` has no `relative`. Lines 184-188: `<div className="absolute left-0 top-0 h-full w-1 rounded-l" style={{ backgroundColor: swatchColor }} aria-hidden="true" />` sits as a child of that non-positioned row, so it escapes to the outer `relative` ancestor from line 88.
- **Impact:** For any material that has at least one earlier version (a common case — every refreshed/re-forked deliverable), the colored accent bar visibly stretches down past the row's border and bleeds into/behind the '# earlier versions ⌄' caption line below it, instead of tracking just the row it's meant to decorate.
- **Fix:** Add `relative` to the compact row's own className (line 181) so the swatch's `absolute`/`h-full` resolves against just that row, matching the intended '4px brand swatch bar' comment.

### 56. SECTION_INTRO map is missing the 'agent-launch' showcase, leaving an empty paragraph
- **Lens/track:** bug · Track A · slice `showcase`
- **Where:** `components/showcase/CampaignExamples.tsx:15`
- **Problem:** CampaignExamples renders one section per entry in SHOWCASES (registry.ts has 4: listing-to-close, launch-blitz, agent-launch, market-pulse), and for each section prints `{SECTION_INTRO[s.id]}` as the sub-headline under the h2. SECTION_INTRO only defines 3 keys — listing-to-close, launch-blitz, market-pulse — with no entry for 'agent-launch'.
- **Evidence:** Verified in file: SECTION_INTRO (lines 15-22) defines only "listing-to-close", "launch-blitz", "market-pulse" — no "agent-launch" key. Line 53: <p>{SECTION_INTRO[s.id]}</p> renders per showcase. registry.ts confirms SHOWCASES has 4 entries including id: "agent-launch" (line 221).
- **Impact:** The third showcase section on /showcase — 'Agent Launch' (Gulfline Realty) — renders its h2 title with SECTION_INTRO[s.id] evaluating to undefined, so the sub-headline paragraph is empty while every sibling section has a one-line explainer. Reads as an unfinished/broken section.

### 57. SSRF private-IP guard is checked only on the original URL, not after redirects
- **Lens/track:** bug · Track A · slice `email-templates2`
- **Where:** `lib/email/og-image.ts:108`
- **Problem:** isSafePublicUrl(u) is checked once against the caller-supplied URL (line 103) before the fetch, but the fetch itself is issued with `redirect: "follow"` (line 110). A remote server under attacker control can return a 3xx to an internal/link-local address (e.g. 169.254.169.254 or a private RFC1918 host) and `fetch` will follow it without ever re-validating the final destination against isSafePublicUrl.
- **Evidence:** line 103: if (!isSafePublicUrl(u)) return null; ... lines 108-113: const res = await fetch(u.toString(), { method: "GET", redirect: "follow", signal: ctrl.signal, headers: {...} });
- **Impact:** A user-supplied 'listing URL' fetched server-side to pull a hero photo can be used to make the server issue a GET to an internal-only endpoint (e.g. cloud metadata service) via an HTTP redirect, bypassing the private-range block this file otherwise enforces.

### 58. Thread-cap loop guard resets whenever the same contact is re-targeted by a new broadcast
- **Lens/track:** bug · Track A · slice `email-inbound`
- **Where:** `lib/email/process-inbound.ts:179`
- **Problem:** Gate 3 (threadCap) counts prior auto-replies via `deps.countThread(entry.token, fromEmail)`, keyed on the current send's token. The token is generated per `email_sends` row (per reply-token.ts's own comment: 'the token encodes AGENT + SEND ... NOT the client'), so a brand-new broadcast to the same segment mints a brand-new token and the thread-cap counter restarts at 0 for every contact, even one who already hit the 3-reply cap on a prior campaign.
- **Evidence:** const [senderRecentCount, threadCount, agentDayCount] = await Promise.all([ deps.countSenderRecent(...), deps.countThread(entry.token, fromEmail), deps.countAgentDay(...) ]);
- **Impact:** The 'hand off to a human once the exchange gets deep' guard (Gate 3, documented in inbound-guards.ts as 'hand off to the human at peak intent') is only effective within a single campaign's token lifetime — a contact who exchanged 3 auto-replies on one send can be auto-replied to again from scratch on the next campaign with no memory of the earlier hand-off.

### 59. The 'unfilled token' safety check can never fire — renderHtmlTemplate already consumes every {{TOKEN}} before this code runs
- **Lens/track:** bug · Track A · slice `email-templates2`
- **Where:** `lib/email/templates/render-template.ts:43`
- **Problem:** render-template.ts asserts `html.match(/\{\{[A-Z_]+\}\}/g)` is null and throws otherwise, commented 'any still-unfilled {{KEY}} is a bug'. But `html` is already the return value of `renderHtmlTemplate()` (line 33), whose own token pass (lib/templates/render-html-template.ts:99-102) unconditionally replaces every `{{key}}` match, substituting the empty string when a key is missing from the token map. By the time render-template.ts's regex runs, no literal `{{...}}` substring can remain, so the 'remaining unfilled tokens' branch is dead code that will never throw.
- **Evidence:** render-template.ts:43-44: `const remaining = html.match(/\{\{[A-Z_]+\}\}/g); if (remaining) throw new Error(...)` vs render-html-template.ts:99-102: `return shell.replace(TOKEN_RE, (_match, key) => { const value = tokens[key]; return value === undefined ? "" : String(value); });`
- **Impact:** The intended fail-loud guard against a genuinely missing/undeclared token is a no-op. A missing token silently renders as a blank string in the sent email (empty price, empty address line, etc.) instead of the build failing with a clear error.

### 60. computeDigest's topics field is fully computed but never rendered on /pulse
- **Lens/track:** bug · Track A · slice `ask-pulse-guides`
- **Where:** `lib/social-pulse/digest.ts:167`
- **Problem:** computeDigest classifies every post by topic, computes postCount and medianLikes per topic, sorts by volume, and returns it as PulseDigest.topics. app/pulse/page.tsx renders benchmarks, formats, topPosts, and hashtags but never references digest.topics anywhere.
- **Evidence:** lib/social-pulse/digest.ts:162-175 builds `const topics = [...byTopic.entries()]...sort(...)` and returns it on the digest object at line 185 (within the return block 177-186); Grep confirms no reference to `topics` in app/pulse/page.tsx.
- **Impact:** A whole category of computed engagement data (which content topics earn the most likes) is thrown away — visitors never see it even though the backend already computed it.

### 61. Landing page comparison/chart data is hardcoded and its 'freshness' labels are permanently stale lies
- **Lens/track:** data-match · Track A · slice `api-serve`
- **Where:** `app/api/landing-data/route.ts:12`
- **Problem:** The whole payload (comparison rows, corridorRents, marketEvents, keyMetrics) is a static object with human-readable freshness claims like "Updated today", "Updated 3 days ago", "Updated 6 days ago" baked in as literal strings. The route has no clock, no DB read, and no relation to the actual brain data it cites (comments reference a cre-swfl snapshot dated 2026-06-05).
- **Evidence:** Read app/api/landing-data/route.ts in full: line 13 `freshness: "Updated today"`, line 22 `freshness: "Updated 3 days ago"`, line 31 `freshness: "Updated today"`, line 41 `freshness: "Updated 6 days ago"` — all static literals in a plain NextResponse.json() object with no date logic whatsoever; comments at lines 45 and 56 pin the source snapshot to 2026-06-05.
- **Impact:** The landing page tells every visitor the CRE rent/vacancy/permit figures were 'Updated today' no matter how stale the underlying snapshot actually is (6+ weeks stale as of 2026-07-18), and the underlying numbers never refresh despite the UI's freshness claim.

### 62. POST accepts a client-supplied data_as_of with no validation, letting the freshness/staleness signal be spoofed
- **Lens/track:** data-match · Track A · slice `api-projects`
- **Where:** `app/api/projects/[id]/materials/route.ts:67`
- **Problem:** `data_as_of: body?.data_as_of ?? new Date().toISOString()` takes the value straight from the request body with no type check, date-format validation, or clamp against the actual data pull time. `getMaterialStatus` (lib/deliverable/material-status.ts:11) uses this same field to decide whether a deliverable is flagged `needs_update` (>30 days old).
- **Evidence:** materials/route.ts:67: `data_as_of: body?.data_as_of ?? new Date().toISOString(),` — no `typeof body?.data_as_of === "string"` guard, no schema validation (unlike `doc` which goes through `EmailDocSchema.safeParse`).
- **Impact:** A client bug or a crafted request can set an arbitrary future (or otherwise fabricated) data_as_of, causing the Materials Hub to show a stale email as freshly-dated ('draft', not 'needs_update') indefinitely — the freshness badge no longer reflects when the underlying data was actually pulled.
- **Fix:** Validate `body?.data_as_of` is a parseable ISO date and reject/clamp anything in the future (or ignore client input entirely and always stamp `new Date().toISOString()` server-side, matching the PATCH handler at line 129 which already does this correctly).

### 63. sampleThin (statistically-thin count) flag is computed but never rendered
- **Lens/track:** data-match · Track A · slice `zip-report`
- **Where:** `app/r/zip-report/[zip]/page.tsx:539`
- **Problem:** lib/zip-report/signal-rank.ts sets `sampleThin` to zero only the EXTREMITY scoring term for candidates with a raw count below THIN_COUNT_FLOOR (5); the real rankPos/rankOf and `why` text (e.g. '#23 of 23 SWFL ZIPs') still compute and the candidate still renders in the grid or hero bar. Neither the hero stats block nor SignalCard ever reads or surfaces `s.sampleThin` to the reader.
- **Evidence:** signal-rank.ts lines 43-53 doc the flag and line 113 `const extremity = c.sampleThin || c.percentile == null ? 0 : ...` — only the extremity term is zeroed, `why` still computes from rankPos/rankOf at lines 117-118. page.tsx lines 282-295 (hero stats block) and lines 535-548 (SignalCard) both render `s.why`/`s.display` with no reference to `s.sampleThin`. Grep of app/r/zip-report for `sampleThin` returns zero matches.
- **Impact:** A ZIP with a trace permit count (e.g. n=1-4) can display a rank claim like '#1 of 23 SWFL ZIPs' with no indication the sample is too thin to support that claim — exactly the misleading distinction the sampleThin flag was built to prevent from being the ranking/lead winner, except the fix only touches ranking priority, not the reader-facing copy.

### 64. back-on-market surface shows the raw day-precision as-of date for a rolling-monthly Redfin figure, contradicting the operator ruling applied to the sibling should-i-sell surface reading the identical field
- **Lens/track:** data-match · Track A · slice `sell-pages`
- **Where:** `components/back-on-market/BackOnMarketRead.tsx:49`
- **Problem:** `data.asOf` in BackOnMarketRead.tsx comes from `loadBackOnMarketZip` (lib/back-on-market/load-zip.ts), explicitly documented (lines 8-10, 38-40) as a Redfin rolling-monthly figure whose date 'over-states precision' if shown as a bare day, and which 'surfaces should display... as a month label.' The should-i-sell surface reads this exact same field — `lib/should-i-sell/load-stress-read.ts:65` does `dataThrough: read.asOf` where `read` comes from `loadBackOnMarketZip` — and SellerStressRead.tsx converts it via `monthYearLabel(data.dataThrough)` (line 38) before display ('Data through March 2026', line 134), per the documented 07/17/2026 operator ruling in lib/should-i-sell/format-period.ts. BackOnMarketRead.tsx never calls `monthYearLabel` and prints the raw MM/DD/YYYY string twice (lines 49 and 109: 'as of {data.asOf}').
- **Evidence:** components/back-on-market/BackOnMarketRead.tsx:49 and :109 confirmed raw `{data.asOf}` interpolation. lib/back-on-market/load-zip.ts:8-10,38-40 confirmed the rolling-window precision documentation. lib/should-i-sell/format-period.ts:1-7 confirmed the 07/17/2026 operator ruling text. lib/should-i-sell/load-stress-read.ts:65 confirmed `dataThrough: read.asOf` — the same underlying field, renamed. components/should-i-sell/SellerStressRead.tsx:38,134 confirmed monthYearLabel is applied and 'Data through {dataThroughLabel}' renders.
- **Impact:** The two sibling report pages reading the identical seller-stress-swfl data disagree on how precisely to state its currency: should-i-sell honestly frames it as a month ('March 2026'), while back-on-market implies day-level precision ('03/01/2026') for a number that is actually a rolling, ~4-month-lagged average.

### 65. Scope contamination in redfin_swfl (Charlotte + Sarasota ZIPs)
- **Lens/track:** data-match · Track B
- **Where:** `data_lake.redfin_swfl (ingest scope gate) + any region-wide consumer`
- **Problem:** redfin_swfl holds 4 metros incl Punta Gorda (Charlotte Co.) and North Port (Sarasota Co.), 126 ZIPs — outside locked Lee+Collier scope. Per-ZIP serve correctly declines out-of-scope; risk is any region-wide aggregate NOT ZIP-gated silently pulling out-of-scope counties. Sibling of known redfin_city scope defect, but ZIP-grain and NEW.
- **Evidence:** lake SELECT DISTINCT metro → Naples, Cape Coral, Punta Gorda, North Port; 126 zips. swfl_fetch zip=34201 → 'outside the SWFL footprint' (serve OK).
- **Impact:** A region-wide stat could silently include Charlotte/Sarasota, overstating SWFL coverage.
- **Fix:** Scope-gate redfin_swfl to Lee+Collier at ingest or in every consumer aggregate; audit consumers for ungated SUM/AVG.

### 66. MenuPoint carries no grain/coverage tag, so a region/county key_metric and a ZIP-level detail_table cell sharing a metric label are merged into one indistinguishable single-series chart
- **Lens/track:** data-match · Track A · slice `assistant-aux`
- **Where:** `lib/assistant/compose-chart.ts:338`
- **Problem:** buildMenu turns every numeric key_metric into a point with entity=m.label, metric=m.label (a region/county-wide rollup with no place dimension) and every detail_table cell into a point with entity=r.label||r.key (typically ZIP/place) and metric=col.label. buildHeldChartBlock's single-metric merge only checks metrics.size === 1 (the metric string) to decide whether to render one clean shared-unit axis — it has no notion of grain, so a region-wide key_metric point selected alongside ZIP-level detail_table points whose column label matches renders as ordinary bars on the same axis with no coverage distinction.
- **Evidence:** Confirmed buildMenu (lines 104-176), key_metrics loop (127-141) using entity=metric=m.label, detail_tables loop (143-162) using entity=r.label||r.key, metric=col.label; buildHeldChartBlock (338-369) computes `const metrics = new Set(picked.map((p) => p.metric)); const singleMetric = metrics.size === 1;` with no grain/coverage field anywhere in MenuPoint or the merge logic.
- **Impact:** A chart can present a region-wide/county-wide figure as just another ZIP/area bar among peers, with no visual or textual distinction that it covers a wider area than its neighbors.
- **Fix:** Add a grain/coverage tag to MenuPoint (e.g. 'region' vs 'zip') populated from where the value originated, and either exclude cross-grain merges from the single-series path or visually/textually flag the wider-coverage bar.

### 67. 'List-to-sold 76.15%' is an artifact, contradicts Redfin sale-to-list 94.9%
- **Lens/track:** data-match · Track B
- **Where:** `market-temperature-swfl list-to-sold computation`
- **Problem:** market-temperature computes 'List-to-sold' as median sold ÷ median list (closed vs active-asking — different populations). 33904 shows 76.15% while Redfin sale-to-list for the same ZIP is 94.9%; also labeled 'very_hot' which contradicts 76%.
- **Evidence:** live 33904: market-temperature list-to-sold 76.15% (sold $340k/list $446.5k) vs Redfin avg_sale_to_list 94.9%.
- **Impact:** A badly-wrong sale-to-list ratio shown as fact next to a correct one.
- **Fix:** Don't compute 'list-to-sold' from active-list median ÷ sold median; use a true matched ratio or drop the field.

### 68. Same metric, multiple unreconciled values per ZIP
- **Lens/track:** data-match · Track B
- **Where:** `per-ZIP composite assembly (multiple brains, same metric)`
- **Problem:** 34103: median DOM = 105 (Redfin) / 122 (market-temperature) / 120 (market-heat); active listings 304/362/373/350; median price $1,480,915 vs median sold $1,575,000. Each source-labeled but no reconciliation for a user asking one question.
- **Evidence:** live 34103 payload across housing/market-temperature/market-heat/active-listings/listing-momentum blocks.
- **Impact:** A user asking 'DOM in 34103?' gets 3 numbers with no guidance on which to trust.
- **Fix:** Designate one authority per shared metric per grain (one-authority rule), or add an explicit reconciliation line.

### 69. Add-contact modal has no dialog semantics or keyboard escape
- **Lens/track:** design · Track A · slice `app-misc`
- **Where:** `app/contacts/page.tsx:220`
- **Problem:** The 'Add contact' overlay is a plain div with no role=dialog, aria-modal, aria-labelledby, and no Escape-key handler to close it.

### 70. Desk page renders two <main> landmarks and its own header/logo stacked on top of the global SiteShell nav
- **Lens/track:** design · Track A · slice `app-alerts-desk-contacts`
- **Where:** `app/desk/page.tsx:135`
- **Problem:** /desk is not in SHELL_HIDDEN_PREFIXES or CHROME_FREE_PREFIXES (components/nav/nav-config.ts:114,129), so the global SiteShell nav bar (with its own logo/branding) renders above the page. DeskPage then wraps its own header — a second logo (Image src="/logo.png"), a second app-name title ("SWFL Data Desk"), and a Live badge — inside a `<PageShell width="wide">` at line 139, followed immediately by a second, sibling `<PageShell width="wide" className="pt-6">` at line 176 wrapping the rest of the content. Because PageShell itself renders a `<main>` element (components/PageShell.tsx:18), this produces two `<main>` landmarks on one page, with the WireTicker (line 174) floating between them outside any landmark.
- **Evidence:** return (
    <div className="min-h-dvh bg-navy-dark font-sans text-white">
      ...
      <PageShell width="wide">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <Image src="/logo.png" alt="SWFL Data Gulf" ... />
          <h1 ...>SWFL Data Desk</h1>
...
      <WireTicker entries={desk.ticker} />

      <PageShell width="wide" className="pt-6">
- **Impact:** Screen-reader users navigating by landmark get two competing 'main' regions plus a floating ticker with no landmark, breaking the single-main-per-page convention the rest of the app relies on. Sighted users see the global site nav bar and desk's own duplicate logo/title bar stacked back-to-back, which reads as double chrome rather than the ONE-ROOM shell every other app page reuses.

### 71. DIRECTION_CONFIG hex palette duplicated verbatim from metrics-table.tsx, defeating its 'one place to swap' comment
- **Lens/track:** design · Track A · slice `cre-swfl`
- **Where:** `app/r/cre-swfl/CREMetricsExplorer.tsx:16`
- **Problem:** app/r/_components/metrics-table.tsx defines the exact same direction→hex mapping (lines 29-37) with a doc comment stating 'Hexes live here so a swap is one place' (line 26), and exports directionClassName (line 41) for exactly this reuse. CREMetricsExplorer.tsx re-declares an identical object (lines 16-24), down to the same key/label/hex values, as its own local constant with a comment admitting it 'mirrors metrics-table.tsx DIRECTION_CONFIG' instead of importing the shared helper.
- **Evidence:** metrics-table.tsx:26 comment 'Hexes live here so a swap is one place.'; lines 29-37 define DIRECTION_CONFIG with rising/bullish/falling/bearish/mixed/stable/neutral entries and exports directionClassName (line 41) using it. CREMetricsExplorer.tsx:12-24 defines a second, textually identical DIRECTION_CONFIG object (same 7 keys, same labels, same hex values) with comment 'Direction color system (mirrors metrics-table.tsx DIRECTION_CONFIG)'.
- **Impact:** A future palette/brand tweak to trend colors (e.g. changing the 'rising' green) applied only in metrics-table.tsx silently leaves the CRE corridor explorer's stat boxes on the stale color while every other /r/ report page updates — corridors and their key-metrics table would visually disagree with no code signal that they drifted.

### 72. Legacy-template blast falls back to a contentless generic email when buildEmailDeliverableModel returns null
- **Lens/track:** email-content · Track A · slice `api-deliverables`
- **Where:** `app/api/deliverables/[id]/blast/route.ts:307`
- **Problem:** buildEmailDeliverableModel returns null only when it found zero metrics and zero narrative lines (lib/deliverable/email-deliverable.ts:181), i.e. a genuinely empty deliverable. blast/route.ts does not treat that as an error — it silently substitutes a placeholder email with no real figures and ships it to every selected contact, rather than refusing the send or surfacing the emptiness to the sender.
- **Impact:** A recipient can receive a real, quota-consuming, tracked send that contains zero actual market data — just a generic 'Your market report is ready' line and a link — with no signal to the sending agent that the underlying deliverable had nothing in it.

### 73. diffSignals can never flag a signal brain's FIRST appearance as "new activity"
- **Lens/track:** email-content · Track A · slice `email-activation`
- **Where:** `lib/email/activation/delta.ts:127`
- **Problem:** diffSignals only iterates prev.lines (filtered to DELTABLE_SIGNAL_BRAINS) and looks up the matching current line by brain_id — it has no branch for a brain_id present in current.lines but absent from prev.lines. Unlike diffMetrics, which explicitly models an 'appeared' direction for a metric that newly shows up, there is no equivalent 'appeared' case for signals.
- **Evidence:** delta.ts:127-141: `for (const p of prev.lines) { if (!DELTABLE_SIGNAL_BRAINS.has(p.brain_id)) continue; const c = currentByBrain.get(p.brain_id); if (!c) continue; ... }` — the loop's only source of brain_ids is prev.lines; current.lines entries with no matching prev entry are never visited or pushed to `out`.
- **Impact:** The 'It's Alive' step-2 email is supposed to headline what changed since email #1; a ZIP that goes from zero permit/news/city-pulse activity to a first real signal this cycle gets no 'New activity' line and can fall back to has_change=false and the generic 're-verified, nothing material moved' copy even though something genuinely new just appeared.

## LOW (16)

### 74. Method page surfaces the literal word 'Grain' as a field label, contradicting the product's own ban on that term
- **Lens/track:** ai-grounding · Track A · slice `report-shared`
- **Where:** `app/r/method/[metric]/page.tsx:58`
- **Problem:** The /r/method/<metric> page renders a dt labeled 'Grain / denominator' verbatim for any entry with a denominator, while location-ui.tsx's GrainChips comment explicitly states plain-language chips should never use the word 'grain'.
- **Evidence:** method/[metric]/page.tsx:55-62 confirmed verbatim: dt text reads 'Grain / denominator'. location-ui.tsx:59-60 confirmed comment reads 'Plain-language coverage chips ... Never the word "grain".'
- **Impact:** A user following a method-badge link lands on a page using internal data-modeling vocabulary ('grain') the rest of the product deliberately avoids.

### 75. Unhandled req.json() throw on malformed body, unlike every sibling route in this slice
- **Lens/track:** bug · Track A · slice `api-deliverables`
- **Where:** `app/api/email-lab/render/route.ts:14`
- **Problem:** Every other route in this slice guards JSON parsing with `.catch(() => null)` before validating (blast/route.ts:127, lab/claim-and-send/route.ts:65). This route awaits req.json() directly with no catch, so a malformed/empty request body throws inside the handler instead of producing the same controlled 400 the rest of the slice returns.
- **Impact:** A client sending an empty or non-JSON body to this render endpoint (used by the live Email Lab editor for every preview keystroke) gets an unhandled exception/framework 500 instead of the graceful validation error the rest of the deliverable/lab routes return for the same failure mode.

### 76. PageShell className="py-8" collides with PageShell's hardcoded py-10
- **Lens/track:** bug · Track A · slice `app-misc`
- **Where:** `app/contacts/page.tsx:93`
- **Problem:** PageShell always emits `py-10` and appends the caller's className after it via `cn()`, which is a plain filter+join (no tailwind-merge), so passing a conflicting utility class like `py-8` produces both classes on the same element with undefined precedence.

### 77. Caption preview always appends an ellipsis, even when the caption wasn't truncated
- **Lens/track:** bug · Track A · slice `ask-pulse-guides`
- **Where:** `app/pulse/page.tsx:87`
- **Problem:** previewOf() returns the caption sliced to 140 code points unconditionally, without signaling whether truncation actually happened. The render hardcodes a trailing "…" on every non-null preview regardless of the original caption's length.
- **Evidence:** app/pulse/page.tsx:86-88 `{p.captionPreview ? (<p ...>{p.captionPreview}…</p>) : null}` — the … is a literal string appended unconditionally; lib/social-pulse/digest.ts:74-79 previewOf() slices to 140 code points with no truncation flag returned.
- **Impact:** A post whose full caption is short (e.g. 40 characters) gets displayed with a trailing ellipsis implying more text was cut off, misrepresenting a complete caption as truncated.

### 78. Dead CSS: ~half the stylesheet targets classes the current markup never emits
- **Lens/track:** bug · Track A · slice `zip-report`
- **Where:** `app/r/zip-report/[zip]/zip-report.css:179`
- **Problem:** zip-report.css still defines a full metric-block/rail-row design (.zp-metric-block, .zp-metric-header, .zp-metric-label, .zp-metric-rank, .zp-metric-value, .zp-metric-sublabel, .zp-bar-track/.zp-bar-fill + 3 variants, .zp-percentile, .zp-rail-metric-row + --active, .zp-rail-row-label/value/rank, .zp-mini-bar + variants) inherited from 'the approved /z/[zip] design' per the file's own header comment. The actual grid/rail markup uses ad-hoc Tailwind utility classes instead — none of these ~20 CSS classes appear anywhere in the zip-report component tree.
- **Evidence:** zip-report.css lines 179-233 and 282-319 define the full set of .zp-metric-*, .zp-bar-*, .zp-rail-metric-row, .zp-rail-row-*, .zp-mini-bar* rules matching the finding's list exactly. Grepping app/r/zip-report/**/*.tsx for all of these class names returns zero matches.
- **Impact:** No visible defect today, but the dead rules are a landmine for the next edit: a future change to `.zp-metric-value` or `.zp-rail-row-value` would silently do nothing, and the two divergent designs living in one file make it easy to reintroduce the old bar-chart layout thinking it's still wired up.

### 79. Value cell's initial text is hardcoded to currency format regardless of the actual valueFormat prop
- **Lens/track:** bug · Track A · slice `charts`
- **Where:** `components/charts/HBarChart.tsx:230`
- **Problem:** Each row's value div is statically initialized to the literal text $0.00 before the GSAP count-up effect runs in useLayoutEffect, ignoring valueFormat/formatValue entirely.
- **Evidence:** Lines 224-231: <div ref={...} className="hbarchart-value">$0.00</div>. Component supports formatValue/valueFormat props (lines 42,49,81-88) defaulting to "currency", confirming the static markup doesn't route through them.
- **Impact:** On slow hydration or before the layout effect fires, a percent/count-formatted HBarChart flashes a dollar-sign placeholder that doesn't match the metric being shown.

### 80. Dead component's chart captions hardcode a fake, ever-'fresh' as-of string instead of deriving it from data
- **Lens/track:** bug · Track A · slice `home`
- **Where:** `components/landing/Charts.tsx:93`
- **Problem:** Charts.tsx renders static caption text unrelated to fetched payload, and app/api/landing-data/route.ts hardcodes freshness labels like 'Updated today' and 'Updated 3 days ago' as permanent string literals with no date logic.
- **Evidence:** Read components/landing/Charts.tsx lines 80-178: confirmed caption strings 'Source: SWFL CRE Corridor Profiles 2026-Q1' (line ~93) and '32 live flags across 17 corridors · Source: SWFL Corridor Pulse 2026-06-05' (line ~144) as static JSX text. Read app/api/landing-data/route.ts in full: lines 13, 22, 31, 41 hardcode 'Updated today', 'Updated 3 days ago', 'Updated today', 'Updated 6 days ago' as static literals returned on every request. Confirmed via grep that both components/landing/Charts.tsx and components/landing/ComparisonSection.tsx fetch '/api/landing-data', and per finding 1 both are dead/unreachable from the live homepage.
- **Impact:** If reconnected, would permanently claim data was 'Updated today' regardless of actual staleness.

### 81. metric-card / callout-box / stat-row / map-placeholder components are unused dead code — built and unit-tested but never called by any live render path
- **Lens/track:** bug · Track A · slice `email-templates`
- **Where:** `lib/email/templates/components/metric-card.ts:29`
- **Problem:** `renderMetricCard`, `renderCallout`, `renderStatRow`, and `renderMapPlaceholder` are exported and covered by unit tests, but no production render path (grounded-report.ts, activation/render.ts, recurring-report.ts, drip-email.ts) imports or calls any of them.
- **Evidence:** Repo-wide grep for `renderMetricCard|renderCallout|renderStatRow|renderMapPlaceholder` returns only: SESSION_LOG.md, design/plan/spec docs, the component definition files themselves, lib/email/__tests__/components.test.ts, and lib/email/__tests__/email-smoke.test.ts — zero call sites in any production render module.
- **Impact:** No direct user-facing impact today (nothing renders them), but it means any bug fixed or feature added to these components never reaches an actual email — the S3 'visual components' work is stranded, and a reviewer auditing 'what renders in our emails' from these files alone would incorrectly assume metric cards / callouts / stat rows / map placeholders are live.

### 82. Live flood-gradient bounds are numerically identical to the mock fixture's min/max, suggesting the 'live' calibration was copied from fake data
- **Lens/track:** data-match · Track A · slice `map`
- **Where:** `lib/map/zip-color.ts:18`
- **Problem:** FLOOD_GRADIENT.low/high (600 / 30074), used to color the live per-ZIP flood choropleth on /r/zip-report (confirmed in app/r/zip-report/[zip]/page.tsx, which feeds live floodForZip.aal through these exact bounds), exactly match the minimum and maximum values in the MOCK fixture (lib/landing/home-map-data.ts: 33920 to 600, 33931 to 30074). The bounds' provenance is unconfirmed as genuinely derived from the live AAL distribution versus copied from the mock.
- **Evidence:** lib/map/zip-color.ts:18-24 — FLOOD_GRADIENT = { low: 600, high: 30074, ... } with an explicit comment 'matches the homepage MapCanvas palette'. lib/landing/home-map-data.ts lines 50 and 55 — the fixture's flood data contains the identical values "33920": 600 and "33931": 30074. app/r/zip-report/[zip]/page.tsx:152-160 confirms FLOOD_GRADIENT.low/high are applied directly to the live computeZipGradient call against real floodForZip.aal values.
- **Impact:** If confirmed as copied rather than independently derived, every live flood-risk color on zip-report pages (and /map once fixed) is scaled against a range that was never actually measured from the real FEMA/NFIP distribution, silently skewing which ZIPs read as red vs green.
- **Fix:** Confirm with the env-swfl brain's actual AAL min/max whether 600/30074 is a coincidence or a literal copy from the mock fixture; if copied, recompute the gradient bounds from the real live distribution.

### 83. Two contradictory 'temperature' reads per ZIP
- **Lens/track:** data-match · Track B
- **Where:** `market-temperature vs market-heat temperature reads`
- **Problem:** 34103: market-temperature 'Strength: cold' (hotness 5.88) vs market-heat 'Heat Tilt 63.8/100'. Same ZIP, unreconciled.
- **Evidence:** live 34103 payload.
- **Impact:** Reads as a self-contradiction on the same card.
- **Fix:** Reconcile or clearly scope each ('relative rank' vs 'tilt') so they don't read as a contradiction.

### 84. Usage bar has no progressbar ARIA semantics
- **Lens/track:** design · Track A · slice `app-misc`
- **Where:** `app/billing/page.tsx:57`
- **Problem:** The send-usage meter is a plain nested div with inline width style and no role=progressbar / aria-valuenow / aria-valuemin / aria-valuemax.

### 85. Icon-only dismiss button has no accessible name
- **Lens/track:** design · Track A · slice `app-misc`
- **Where:** `app/contacts/page.tsx:128`
- **Problem:** The '×' dismiss button for the import banner has no aria-label.

### 86. Contacts table container clips overflow instead of scrolling on narrow viewports
- **Lens/track:** design · Track A · slice `app-alerts-desk-contacts`
- **Where:** `app/contacts/page.tsx:168`
- **Problem:** The table wrapper uses `overflow-hidden` rather than `overflow-x-auto`. With 5 columns (Name, Email, Phone, Tags, Remove) inside a `w-full` table at the default PageShell width, on a narrow/mobile viewport the table cannot shrink further and there is no scroll affordance — content is clipped rather than reachable.
- **Evidence:** <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
- **Impact:** On mobile widths, right-hand columns (phone, tags, the Remove button) can be cut off with no way to scroll to them, since `overflow-hidden` suppresses any horizontal scrollbar that `overflow-x-auto` would otherwise provide.

### 87. Composer backgrounds are literal hex values instead of the app's color tokens/Tailwind palette
- **Lens/track:** design · Track A · slice `app-emaillab`
- **Where:** `components/email-lab/social/SocialComposer.tsx:34`
- **Problem:** The composer's stage and caption-strip backgrounds are hardcoded hex (`bg-[#0a141a]`, `bg-[#0b1620]`) rather than a shared token/Tailwind color class, so this surface's dark chrome is defined independently of the rest of the app's palette.
- **Evidence:** Read lines 25-55 directly: line 34 is `<div className="flex flex-1 items-center justify-center bg-[#0a141a] p-6">` and line 49 is `<div className="shrink-0 border-t border-white/8 bg-[#0b1620] p-4">`. Confirmed EmailLabGridShell.tsx also contains hardcoded hex values (grep for `#0f1d24`/`#111418` returns a hit), supporting the claim that multiple files independently pick arbitrary hex rather than a shared token.
- **Impact:** No visible break today, but any future theme/brand color adjustment has to be hunted down across multiple arbitrary hex literals instead of one token, and touching one file risks the composer's shades drifting from the shell around it.
- **Fix:** Route these through the same token/palette source the rest of the grid shell uses — consolidate into one set of named color tokens instead of each file picking its own hex.

### 88. Dead components use a second, hardcoded-hex color system that has diverged from the live homepage's token-driven design (cap-* classes)
- **Lens/track:** design · Track A · slice `home`
- **Where:** `components/landing/Charts.tsx:123`
- **Problem:** Charts.tsx and ComparisonSection.tsx hardcode raw hex color stops directly in JSX, whereas the live-homepage components (Capabilities.tsx, DeliverableShowcase.tsx) use semantic class names with zero hex literals.
- **Evidence:** Read components/landing/Charts.tsx lines 123-124 and 167-168: confirmed `stopColor="#3DC9C0"` / `stopColor="#076358"` appear identically in both places. Read components/landing/ComparisonSection.tsx line 85: confirmed `backgroundColor: isActive ? "#2dd4bf" : ...` exactly as cited. Grepped Capabilities.tsx and DeliverableShowcase.tsx for any hex-color pattern and got zero matches in either file, confirming the claimed contrast.
- **Impact:** No live-user impact today since these files are unreachable, but a future engineer reusing one of these older files as a starting point would reintroduce hardcoded colors and an off-brand visual language.

### 89. Delta block drops the $ prefix the type comment promises, showing dollar metrics as bare numbers
- **Lens/track:** email-content · Track A · slice `email-activation`
- **Where:** `lib/email/grounded-report.ts:107`
- **Problem:** SnapshotMetric.unit (lib/email/activation/types.ts:41) is documented as 'Suffix for display, e.g. "$" prefix handled by render; here "%", " days", ""' — i.e. the render layer is supposed to add a leading "$" for currency metrics like median_sale_price, which is stored with unit:"" (snapshot.ts:78). But formatChangeValue in grounded-report.ts only ever appends `unit` as a trailing suffix; it never adds a "$" prefix for any metric. The main metrics table (via formatMetric in snapshot.ts:90-95) correctly renders "$412,000" using a separate `fmt==="currency"` branch, but MetricChange (types.ts:75-86) carries no `fmt`/format field at all, so the delta path has no way to know it should prefix $.
- **Evidence:** grounded-report.ts:107-112: `function formatChangeValue(v, unit) { ... return `${v.toLocaleString("en-US")}${unit ?? ""}`; }` — no currency/$ handling exists anywhere in grounded-report.ts despite the type comment's explicit claim that render handles the $ prefix; and MetricChange has no format field to key off of.
- **Impact:** A recipient of the delta email sees the median sale price change rendered as unlabeled raw numbers (e.g. '412,000 → 425,000 ▲') right next to correctly-formatted percent/day metrics in the same table, making the dollar figure read as an ambiguous count rather than a price and contradicting the formatting shown in the same email's main metrics table.

