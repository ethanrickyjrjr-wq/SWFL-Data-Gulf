# Audit — source plan vs. live code (2026-06-10)

Method: every "Verified ground truth" claim in the source plan was checked against `main` via parallel read-only exploration. Verdict: the source plan is **unusually accurate** — the large majority of claims verified TRUE. The corrections below are the only material deltas; each is tagged in the task files where it changes the work.

## Corrections (baked into task files as `[AUDIT-FIX C#]`)

### C1 — Phase 4 magic-link `next` threading is described backwards
- **Plan:** "login-form.tsx honors `next` in `emailRedirectTo`; verify callback forwards it."
- **Reality:** `app/auth/callback/route.ts:8-15` **already** reads + forwards `next`. `app/login/login-form.tsx:19` hardcodes `emailRedirectTo` to `/auth/callback` and **silently drops** the `next` prop it receives from `app/login/page.tsx`.
- **Fix (S4 task-05):** the work is in *login-form*, not the callback — append the received `next` as a query param on the callback URL it passes to `signInWithOtp({ options: { emailRedirectTo } })`. Then the existing callback forwarding works.

### C2 — Phase 2 rent/vacancy data path misread
- **Plan:** `buildChartForIntent` for asking-rent/vacancy should "read `corridor_profiles` exactly as `app/embed/charts/page.tsx:130` does — one data path."
- **Reality:** that query (`embed/charts/page.tsx:129-134`) selects `corridor_name, character_chart, character_facts, character_speculative` — **not** rent/vacancy. Asking-rent is loaded from a **`corridor-rents.json` fixture** (~lines 156-160). Vacancy source must be located.
- **Fix (S2 task-01):** first task is to *locate the real rent/vacancy source* and reuse it; do not assume a `corridor_profiles` column.

### C3 — `ChartBlockView` already exists
- **Reality:** `components/charts/ChartBlockView.tsx` exists and is imported by `app/embed/charts/page.tsx`. Import it; do not rebuild. (Plan was already correct in spirit; this makes it explicit.)

### C4 — `ChartBlock` import location is locked by the charts spec
- **Reality:** import `ChartBlock` from `refinery/validate/chart-block-lint.mts` (where the type + `lintChartBlock` + `isAnchored` live), **not** from `refinery/types`. Preserve this in S2/S3/S6/S9.

### C5 — "HBarChart fixed-px / non-responsive" is stale
- **Charts spec** locked HBarChart as non-responsive; **reality:** `HBarChart.tsx:281-330` already uses `clamp()` fluid padding + grid. So S2/S5 need only a `compact?: boolean` prop + a `beforeprint` final-width frame (gsap animates width 0→% at lines 92-126, so an immediate print can catch width:0) — **not** a responsive rewrite.

### C6 — MCP `auth.ts` is a conditional bearer check that is **OPEN in prod today**
- **Reality:** `app/api/mcp/auth.ts:9-25` enforces `Authorization: Bearer <MCP_BEARER_TOKEN>` **only when the env var is set**, and returns early (open) when unset. `MCP_BEARER_TOKEN` is **unset in prod today**, so the MCP server is currently **unauthenticated in production.** The function exists; it is not enforced. (`[LB-R7]` — do not let "conditional bearer check" read as "enforced.")
- **Impact (S9):** the per-project capability key is additive, BUT because the bearer gate is open, the key check would be the ONLY thing between an outside caller and a service-role write that bypasses RLS. See `[LB-R6]`: the bearer token MUST be SET/enforced before the S9 write tools ship, and the service-role write MUST be hard-bound to the key's single project. The keystone task is to **set/enforce the token**, not author the function.

## Confirmed TRUE (no change needed)
`sdg_cid` read at `meter.ts:26`, never minted (no `Set-Cookie` anywhere) · `usage_events` + `data_requests` tables exist · **zero** `auth.uid()` RLS policies in the repo (access is GRANT/REVOKE only — S4 writes the first policy) · `middleware.ts` rate-limits `/api/b`,`/api/mcp`,`/api/waitlist` + delegates to Supabase session refresh · `utils/supabase/{server,client}.ts` exist · amber soft-wall at `HighlightPopup.tsx:357-370` · `snapCrossRowSelection`@109, `SUPPRESS_CLOSEST`@32, no cross-cell snap (real gap) · `context.tsx` holds only `chipFact` (thread is local to popup; dock has its own) · `route-chart.ts` exists, `onChart` does **not** · `isAnchored` tolerance `0.05`@`chart-block-lint.mts:81` · MCP exposes a single `swfl_fetch` tool, `readOnlyHint:true`@245, "read-only" prose@59 · `SYNTHESIS_MODEL="claude-sonnet-4-6"`@`anthropic.mts:7`, `getAnthropic()` exported, sdk `^0.69.0` · Resend lazy-init in `app/api/waitlist/route.ts`, from `hello@swfldatagulf.com` · waitlist copy "Ask Claude for a sourced PDF or doc, get one"@`waitlist-form.tsx:31` · no Storage buckets / no PDF lib / no Stripe.

## Added features (`[ADDED]` — not in the source plan)

1. **As-of date on exhibits** (S6 task-05) — per operator (2026-06-10): the as-of date stamp is the **only** honesty mechanism required. Every chart and filed item carries the date it was captured (from the fixture's own date field or, for live-brain items, the brain's `freshness_token`). A `freshness_token` is present only on items from live brains (`qa`, `metric`, `report`, `table_slice`); chart items carry as-of date via their `chart_block` data. Drop the cadence-aware "may have updated" computation and per-item age badge. In printed/shared deliverables, the date appears **only** as a plain citation line under each exhibit — no freshness badges, no token display, no staleness warnings. Live-refresh-before-print is a deferred higher-tier feature. Never silently re-fetch in v1.
2. **Restyle without re-LLM** (S6 task-06). Content is already separate from template by design — expose a template-swap that re-renders the same narrative+items under a different template with **no new LLM call** (free, instant). Gamma/Perplexity-Labs "cheap restyle."
3. **Deterministic jargon scrub on the deliverable** (S6 task-04). The build system prompt forbids `master/brain/payload/grain/dossier`; don't trust the LLM — add a post-generation deterministic check reusing the speaker-layer scrub patterns.
4. **Deliverable revoke / unpublish** (S7 task-02). `/p/[id]` is public by unguessable slug; the `status` column already exists — add `status='revoked'` → `/p/[id]` returns 410. Owner-controlled kill switch for a shared link.
5. **MCP add-item dedupe** (S9 task-02). When a co-building Claude files the same metric twice, dedupe by `(kind, report_id, label, value)` so the project doesn't fill with duplicates.

## Sequencing notes
- S5 (print CSS) is consumed by S3's `/c/[id]` "Save as PDF" button too — S3 ships the button, S5 perfects the print frame. Acceptable; noted in both.
- The source plan's "Phase 0+1 = queue item 1" is kept, but split into two sessions (different skill profiles: cookie/SQL vs. React state). S0 ships first as the metering prereq.

## LB review addendum — risk/design requirements (`[LB-R#]`)

LittleBird's plan-review (notetaker — `feedback_littlebird-is-notetaker`) flagged truth-integrity risks a facts-only pass walked past. The two pastes are the same items; merged + reconciled here. Each is now a written acceptance/verify gate in the named session — **these are gates, not suggestions.**

| # | Requirement | Enforced in | Verdict |
|---|---|---|---|
| **R1** | ~~Never pin a `freshness_token` onto fixture data. Rent/vacancy chart needs a LIVE source or it defers.~~ **OVERRIDDEN BY OPERATOR (2026-06-10):** Fixture-backed charts are fully deliverable. An as-of date (from the fixture's own date field) is the **only required honesty mechanism** — no `freshness_token` required on chart items. All four Tier-B chart scopes ship from fixtures: asking-rent (`corridor-rents.json`), vacancy (`corridor-rents.json`), zhvi (ZHVI fixture), corridor-scatter (rents fixture). S2 task-01 is rewritten to locate fixture paths, not hunt for live sources. | S2 task-01 (rewritten) | **OVERRIDDEN** |
| **R2** | Deliverable narrative lint anchors numbers by **EQUALITY**, not the 5%/0.05 chart-render tolerance. Keep 5% on chart rendering only. | S6 task-04 + README acceptance | accepted — this was a real bug in my plan |
| **R3** | Add the `isGroundedConditional` / no-smoothing check (`refinery/render/speaker.mts`) to the narrative path — anchoring alone passes a number-free ungrounded forecast ("rents will keep climbing"). | S6 task-04 + README acceptance | accepted |
| **R4** | State the single source of truth for chart NUMBERS: the **persisted `chart_block` jsonb in `saved_charts` is the frozen authority for a saved/filed chart**; `computeMetricChart` stays the live `/r/` on-the-fly render only. They cannot diverge because they serve different lifecycles (live recompute vs frozen snapshot). | S2 README + S3 README/task-02 | accepted |
| **R5** | Deliverable slug entropy: `randomUUID().slice(0,8)` (32 bits) is too weak for a public page carrying agent branding + client-specific content. Use a full-entropy slug (≥122 bits); add `/p/` to the middleware rate-limit prefixes; re-justify public-SELECT. | S6 task-01 + task-05 | accepted; public-SELECT-by-strong-slug re-justified below |
| **R6** | (a) `MCP_BEARER_TOKEN` MUST be enforced before S9 write tools ship; (b) the service-role write MUST be hard-bound to the project the key maps to — **no payload/param field may carry a `project_id`** that redirects the write. | S9 README + task-02 (gate) | accepted, hardened |
| **R7** | C6 wording: the bearer function is OPEN in prod (token unset), not enforced. | C6 above, rewritten | accepted |

**R5 re-justification (public-SELECT on `deliverables`):** the product requires sharing a link with a client who is NOT logged in (the whole "send a client email / hosted page" rail). So link = capability is the right model (like a "anyone with the link" doc), made safe by (1) ≥122-bit unguessable slug, (2) `/p/*` behind the rate limiter, (3) owner revoke → 410 (S7 task-02). We do NOT gate `/p/` behind auth — that would break the share-with-client use case. This is a deliberate, bounded exception, not the saved_charts trust model copied blindly.
