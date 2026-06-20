# Social Auto-Posting System — Design Spec

**Date:** 2026-06-20
**Status:** Design approved (brainstorm complete). Program-level spec; Wave 1 goes to an implementation plan next.
**Author:** session 2026-06-20 (grounded by a 7-agent code-verified probe + crawl4ai platform research)

---

## 0. One-paragraph summary

A social-media auto-posting system that mirrors our existing email-campaign engine: a user (us in v1, clients in Phase 2) gets branded graphics + captions auto-generated from live brain data, on a freshness-gated daily/weekly/monthly cadence, directed at a client-specific geographic target, posted to the best B2B platforms **just by asking the AI**. The recurring-send spine is ~80% reusable from the email engine; the genuinely net-new pieces are a server-side branded-image renderer and the platform connectors. **Everything builds and runs end-to-end in a cost-free preview/dry mode behind a single go-live switch — when payments are in, we flip one flag and it publishes for real. No code change at go-live.**

---

## 1. Locked decisions (from the brainstorm)

| # | Decision | Choice |
|---|---|---|
| D1 | Ownership / tenancy | **Phased — single-tenant (our own brand/accounts) first to prove the engine live, then generalize the same engine to per-client multi-tenant.** Every row is `user_id`-namespaced from day 1 so Phase 2 needs zero migration. |
| D2 | Connectors | **Direct connectors now** (we own the apps for our own accounts); **aggregator (Ayrshare) deferred to Phase 2**, adopted when the first paying client onboards. Swaps in behind the same DI seam with no spine change. |
| D3 | v1 platform scope | **LinkedIn + Bluesky + X.** IG/FB/TikTok/Threads/GBP/Pinterest/YouTube are a Phase-2 fast-follow via the aggregator (they require the multi-week Meta App Review / TikTok audit gauntlet). |
| D4 | Graphic renderer | **Satori / `next/og` `ImageResponse`** — native on Vercel, emits PNG directly, no chromium binary. Accepts the Satori constraint (flexbox-only, no recharts): v1 draws native data-viz; rich charts pre-rasterize as a fast-follow. |
| D5 | Compose-by-AI UX | **MCP tool `swfl_social_post` first** (the "ask AI" surface). In-app chat panel + deterministic "schedule this weekly" button are follow-ups behind the same compose engine. |
| D6 | Geographic grain | **Lift to place / county / corridor** (today recurring content is hard-locked to a single ZIP) with a strict **no-sub-grain-invention guard**. |
| D7 | Cadence | **Freshness-gated** — post only when the underlying brain `freshness_token` advances; never re-post stale numbers. Daily slot is *eligible* but only fires if data moved. |
| D8 | Go-live model | **Build-now, flip-to-live.** A single switch (`SOCIAL_PUBLISH_ENABLED`, default `false`) keeps the whole pipeline in cost-free DRY mode (compose + render + schedule + record, but the platform API call is short-circuited). Costs are incurred only after the flip, which happens when payments are in. |

**Carried defaults (locked, not re-litigated):**
- Paywall mirrors email exactly: **compose / preview / render / download is FREE** (login capture); **auto-publish is the paywall**. Watermark rides in the artifact, never a block. (`app/api/deliverables/[id]/blast/route.ts:3-4` — "SEND is the paywall".)
- **Human confirm before any publish** — non-negotiable (platform ToS + our no-autonomous-action posture).
- **No-invention number lint on every caption and graphic** — verbatim from the brain dossier; placeholder literals fail the build.
- Sibling tables (not columns bolted onto the email tables) — the recipe columns diverge enough that a sibling keeps both clean.

---

## 2. What we reuse (the channel-agnostic spine)

The email engine was deliberately built channel-agnostic with dependency-injection seams. `lib/email/scheduler.ts` is the **only** file besides the runner that knows it is email. We lift the spine and swap exactly one seam.

| Component | Source file(s) | Verdict |
|---|---|---|
| Recipe row + cadence (3 cols + materialized `next_run_at`) | `docs/sql/20260612_email_product.sql:21-49`, `20260613_email_schedule_scope.sql` | **Generalize** → `post_schedules` |
| DST-correct cadence math | `lib/email/schedule-cadence.ts:92-106` | **Reuse as-is** (zero channel coupling) |
| Atomic claim RPC (`FOR UPDATE SKIP LOCKED` + park-on-claim) | `docs/sql/20260612_email_schedule_claim_fn.sql:35-55` | **Clone** → `claim_due_posts` (the no-double-post crown jewel) |
| DI processing core (gate→render→idempotency-claim→send→record→re-arm-in-`finally`) | `lib/email/scheduler.ts:282-446` (`processSchedule`), `:108-201` (`ProcessDeps`), `:501-539` (`reapOrphans`) | **Reuse structure**; swap `postBroadcast→postToChannel`, `readAudience→resolveAccount` |
| At-most-once idempotency (`INSERT ON CONFLICT DO NOTHING`) | `docs/sql/20260613_email_send_ledger.sql:19-33`, `lib/email/idempotency.ts:48-84` | **Reuse**; key = `post:<id>:<date>` |
| NL schedule-command (forced-tool → propose → signed single-use nonce → confirm; zod defense-in-depth) | `app/api/email/schedule-command/route.ts`, `lib/email/schedule-command.ts:33-282`, `lib/email/proposal-nonce.ts` | **Reuse pattern**; swap the actions. Note the two non-LLM PROPOSE lanes (`fromDeliverable`, `fromScope`) → the deterministic button (D5 follow-up) gets them for free. |
| Idempotent recipe upsert (NULL-equal signature, reactivate-not-duplicate) | `lib/email/schedule-upsert.ts:59-108` | **Generalize** signature columns |
| Per-client scope contract (`zip\|place\|county` + value + free-text topic; NULL/NULL = whole region) | `docs/sql/20260613_email_schedule_scope.sql`, `lib/deliverable/parse-scope.ts:21-29` | **Reuse** (same contract a deliverable carries → a project's place flows unchanged) |
| Fresh-data-every-run bridge (recipe carries scope only; re-pulls grounded content each fire) | `lib/deliverable/schedule-recipe.ts:42-71`, `lib/email/recurring-report.ts:62-93` | **Reuse mechanism**; lift the ZIP-only lock (D6) |
| Usage meter + 402 paywall gate (period-keyed, fails OPEN; 402-before-work → record-after-success) | `lib/email/usage.ts:54-167`, `docs/sql/20260612_email_usage_increment_fn.sql`, `blast/route.ts:86-93,193` | **Reuse**; add a `channel` dimension |
| Append-only event ledger + dedup-on-provider-id + rollup view | `docs/sql/20260620_outreach_events.sql`, `20260620_outreach_recipients.sql`, `20260620_outreach_metrics_view.sql` | **Reuse architecture**; populated by **poll**, not webhook (§4) |
| Brand application (colors + logo_url + agent identity in `branding` JSONB; thin injection) | `lib/project/apply-brand.ts:34-64`, `lib/deliverable/brand-theme.ts:24-46` (`extractBrandTheme`/`toChartTheme`) | **Reuse as-is** → feeds the renderer with zero adapter |
| No-invention moat (forced-tool + verbatim-number lint) | `lib/deliverable/build.ts:281-336,405-474` (`gateNarrative`) | **Reuse as-is** → applies to captions |
| Operational infra (GHA `concurrency.group`, crash-orphan reaper, DRY_RUN posture, exit-code semantics) | `scripts/email/run-schedules.mts`, `.github/workflows/email-scheduler.yml` | **Reuse pattern** → template for `run-posts.mts` |
| Engine on/off switch | `scripts/engine.mjs`, repo var `ENGINE_ENABLED` + job-level `if:` guard | **Reuse pattern** → the new cron carries the same guard (§5) |

**Email-specific layer we DELETE / replace** (the adapter swap points): `/api/email/broadcast` (Resend Segments), CAN-SPAM unsubscribe-token + postal-address machinery (`scheduler.ts:219-229`, `drip-email.ts:62-70`), `resolveSender`/`email_sender_config` verified-domain DKIM (→ OAuth-token-per-account), the email HTML renderers (`templates/html/email/**`), the Resend webhook event *mapping* (the lifecycle state machine stays), `audience_slug`→Segment targeting (for posting, "audience" = "a feed," not a list).

---

## 3. What is net-new (none of this exists today)

1. **Platform connectors / OAuth-per-account.** Each social account is an authenticated *connection* (OAuth token), not a from-address. No connector / token store / refresh handling exists.
2. **Server-side HTML→image renderer.** Verified absent: `package.json` has zero render libs; the only image-format path is a `501` stub (`app/api/templates/render/route.ts:72-74`) and browser `window.print()`. The HTML token-fill engine (`lib/templates/render-html-template.ts`) exists but emits HTML, never image bytes.
3. **Fixed-ratio social templates** — no 1080×1080 / 1080×1350 / 1080×1920 / 1200×675 shell exists; must be authored as Satori JSX.
4. **Per-platform asset/caption fan-out** (one source dossier → X / LinkedIn / Bluesky variants).
5. **Post-tracking + engagement read-back** — no post-identity record, no engagement ledger. **Social metrics are pull (poll), not push (webhook).**
6. **Compose-by-AI surface for post *content*** (the NL engine exists for *scheduling*, not for composing the post).

---

## 4. Architecture

```
ASK AI (MCP swfl_social_post)  ──┐
"schedule this corridor card     │   compose engine          renderer (Satori)
 to LinkedIn weekly"             ├─► (brain dossier ─► ─►   branded PNG 1080×…
                                 │   per-platform caption     + as-of watermark)
in-app chat / button (follow-up)─┘   + no-invention lint)            │
                                            │                        ▼
                          propose ─► signed nonce ─► confirm ─► post_schedules row
                                                                     │
   GHA cron (freshness-gated) ─► claim_due_posts (SKIP LOCKED) ─────►│
                                                                     ▼
                       freshness gate ─► compose ─► render ─► postToChannel ──┐
                          (skip+re-arm   (fresh data         (DRY unless       │
                         if token unmoved) each fire)      SOCIAL_PUBLISH_ENABLED)
                                                                     │         │
                                          social_posts (platform_post_id) ◄────┘
                                                     │
                                  engagement poll ─► social_events ─► /ops rollup
```

### 4.1 Components

- **Renderer — `lib/social/render/`** (Satori / `next/og` `ImageResponse`). JSX shells per ratio: square `1080×1080`, portrait `1080×1350`, story `1080×1920`, landscape `1200×675`. Fonts embedded as `ArrayBuffer` (Satori requirement). Brand via `extractBrandTheme()` (props, not a fork). **Burned-in watermark "SWFL Data Gulf • as of {date}" + source brain — mandatory** (provenance must survive a screenshot). Data fed from the frozen deliverable / brain dossier; numbers verbatim (no-invention). *Satori has no recharts* → v1 draws native data-viz (big-stat card, div/SVG bars, SVG sparkline); rich charts pre-rasterize as a fast-follow, never on the hot path.
- **Compose engine — `lib/social/compose.ts`.** Brain/master dossier + scope + platform + format → caption shaped per platform (X ≤280 with **link-in-first-comment** to dodge the $0.20 link tax; LinkedIn long-form + carousel; Bluesky ≤300, 1 hashtag norm). Forced-tool LLM + no-invention number lint. One source → N platform variants (fan-out).
- **MCP tool `swfl_social_post`** on the existing `/api/mcp`. Actions: `compose | preview | schedule | list | cancel`. Two-step: `propose` (returns caption + image URL + the schedule it would write) → **signed single-use nonce** (reuses `lib/email/proposal-nonce.ts`) → `confirm` (writes a `post_schedules` recipe or a one-off `social_posts`). Human confirm before publish — always.
- **Runner — `scripts/social/run-posts.mts` + `.github/workflows/social-scheduler.yml`.** Clone of `run-schedules.mts`: `concurrency.group`, crash-orphan reaper, DRY_RUN, exit-code semantics, and the **`ENGINE_ENABLED` job-guard**. Per fire: claim → **freshness gate** (compare brain `freshness_token` vs the last `social_posts.freshness_token` for this schedule; if unmoved and `freshness_gate=true`, skip + re-arm, never post stale) → compose → render → `postToChannel` → record `social_posts` → re-arm `next_run_at` in `finally`.
- **Channel adapter — `lib/social/channels/`** behind `postToChannel({channel, account_id, caption, media})`. v1 direct connectors: `bluesky.ts` (app-password, trivial), `x.ts` (OAuth2, paid tier, link-in-first-comment), `linkedin.ts` (OAuth2, Company Page). Phase-2 `ayrshare.ts` slots in behind the same interface.
- **Grain lift — generalize `recurring-report.ts:62-76`** from ZIP-only to `place | county | corridor`, reusing the `parse-scope` contract + corridor-alias machinery, with the hard **no-sub-grain-invention guard**: if we don't hold data at the requested grain, refuse and offer the grain we hold (the moat). County/corridor reads county/corridor-grain brain data; never fabricate a number finer than held.

### 4.2 Data model — sibling tables, `user_id`-namespaced from day 1

(DDL sketches; finalized in the implementation plan. Idempotent migrations per RULE 1.)

1. **`social_accounts`** — connection/token store (replaces `email_sender_config`): `id`, `user_id`, `platform` (`linkedin|bluesky|x`), `handle`, `display_name`, `platform_account_id` (e.g. LinkedIn org URN), `access_token` (encrypted), `refresh_token` (encrypted), `token_expires_at`, `status` (`connected|expired|revoked`), `created_at`.
2. **`post_schedules`** — recipe row (clone of `email_schedules`): `id`, `user_id`, `social_account_id` FK, `cadence_kind` (`daily|weekly|monthly`) + cadence cols + materialized `next_run_at`, `scope_kind` (`zip|place|county|corridor`) + `scope_value` + `topic`, `post_template` (`stat_card|carousel|scorecard`), `format` (ratio), `brain_source`, `freshness_gate` bool, idempotent-upsert `signature`, `status` (`active|paused`), `created_at`.
3. **`social_posts`** — post identity + publish record (clone of `email_sends`/ledger): `id`, `post_schedule_id` (nullable for one-offs), `social_account_id`, `platform`, `platform_post_id` (the engagement join key; null while DRY/queued), `freshness_token` (snapshot posted), `caption`, `media_url`, `status` (`queued|dry_run|published|failed`), `error`, `idempotency_key` (`post:<schedule>:<date>`), `published_at`.
4. **`social_events`** — append-only engagement ledger (clone of `outreach_events`): `id`, `social_post_id` FK, `platform_post_id`, `metric` (`like|comment|share|impression|click`), `value`, `captured_at`, `source` (`poll`); dedup on `(platform_post_id, metric, captured_at-window)`. + `social_metrics_view` rollup for /ops.
5. **`claim_due_posts` RPC** — mirror `email_schedule_claim_fn` verbatim (`FOR UPDATE SKIP LOCKED` + park-on-claim).
6. **Usage meter** — add a `channel` dimension to the existing meter; gate *publish*.

---

## 5. Go-live model — "build it all, click to go live" (D8)

The whole pipeline is built and exercised **before a single dollar is spent or a single real post goes out**. Two independent switches, both defaulting to the safe state, both flippable in one command with no code change:

1. **`SOCIAL_PUBLISH_ENABLED`** (repo variable, default `false`).
   - **`false` (build mode, the default):** the runner and the MCP `confirm` path do *everything* — claim, freshness-gate, compose, render the real branded PNG, write the `social_posts` row with `status='dry_run'` and the intended caption/media — **but `postToChannel` is short-circuited and never calls the platform API.** Zero X API cost, zero live posts. The rendered images and captions are fully reviewable (preview surface), so we can QA the entire output end-to-end.
   - **`true` (live):** `postToChannel` calls the real connector; `social_posts.status` becomes `published`, `platform_post_id` is captured, the engagement poll arms. **Flip = `node scripts/social.mjs go-live` (one command, mirrors `engine.mjs`).**
2. **`ENGINE_ENABLED`** (existing repo var) — the new `social-scheduler.yml` carries the standard job-guard, so the global engine off-switch parks social posting too.

Connectors and OAuth tokens can be **connected ahead of go-live** (the `social_accounts` rows exist, tokens are valid) so the flip is instant. The paywall gate (`checkUsageLimit` 402-before-publish) is built behind the same publish path; in v1 single-tenant the global flag is the effective gate, and when Phase-2 payments land the per-user meter becomes the gate with no new wiring.

**Cost ledger (so it's explicit):** v1 build + dry mode = **$0 platform cost**. The only v1 live COGS is the **X API tier** (verify live before go-live — pricing churns; the $0.20-per-link-post tax is why we link in the first comment). **Phase 2 aggregator (Ayrshare $299–599/mo)** is incurred only when the first paying client onboards. Nothing recurring is paid before revenue.

---

## 6. Build plan (waves — each ships independently)

| Wave | Slices | Notes |
|---|---|---|
| **1 — Spine + Renderer** | (a) **Connector spike** — connect our own Bluesky/X/LinkedIn, post one card each *in dry mode*, confirm contracts. (b) **Renderer** (`lib/social/render/`, Satori) — L, critical path. (c) **Spine** — `social_*` tables + `claim_due_posts` + `run-posts.mts` + `social-scheduler.yml` with the `ENGINE_ENABLED` guard + `SOCIAL_PUBLISH_ENABLED` dry-mode short-circuit. | Renderer + spine parallelize. End of Wave 1 = the engine schedules + renders + "dry-publishes" real branded graphics. |
| **2 — Ask-AI + reach** | (d) **Compose engine** + **MCP `swfl_social_post`** (the headline "ask AI" surface). (e) **Channel adapter + token store** (real `postToChannel` for the 3 platforms). (f) **Grain lift** to place/county/corridor with the no-sub-grain guard. | Needs Wave 1. End of Wave 2 = a usable v1: ask AI → branded graphic → freshness-gated schedule → dry-publish to our own LinkedIn/Bluesky/X, ready to flip live. |
| **3 — Money + measure** | (g) **Publish paywall gate** (`channel`-dimensioned meter, 402-before-publish). (h) **Post-tracking + engagement poll** (per-platform scheduled fetch → `social_events` → `social_metrics_view`) → /ops rollup. | Monetization seam + measurement. Engagement columns nullable (business-account-gated → Operation Dumbo Drop posture). |

**Go-live happens by flipping `SOCIAL_PUBLISH_ENABLED` once Wave 2 is QA'd in dry mode and payments are in — not as a code milestone.**

---

## 7. Testing (clone the email posture)

- Cadence-math units; **`claim_due_posts` concurrency test (no double-post)**; idempotency test (`post:<id>:<date>`).
- **Renderer no-fabrication tripwire** — render with empty data → must not emit any placeholder literal; every number in the output must trace to the data object. (This test exists because a beautiful email template once shipped hardcoded `$412K`/fake ZIP data — `2026-06-16-email-report-data-driven-design.md:8-35`.)
- Caption no-invention lint test; per-platform caption-shaping tests (char limits, X link-tax / first-comment).
- **MCP nonce single-use test — deterministic** (flip a *decoded* byte, not a base64url char; that is the flaky-`proposal-nonce` lesson, ~6.5%/push red otherwise).
- Grain-guard test: a county/corridor scope never resolves to a "representative" ZIP; out-of-footprint refuses.
- **DRY_RUN end-to-end test** — full pipeline with `SOCIAL_PUBLISH_ENABLED=false` writes a `dry_run` row and never calls a connector.

---

## 8. Vendor-First verification items (do before building the relevant slice)

Per CLAUDE.md Rule 1 — verify live, do not build on remembered specs:

1. **X API** current tier, per-post + per-link cost, rate limits, OAuth2 scopes for posting (the $0.20 link-post figure and PPU model must be re-confirmed).
2. **LinkedIn** Company Page posting product access (Community Management API / "Share on LinkedIn") + required scopes (`w_organization_social`) — may add app-review latency.
3. **Bluesky** AT Protocol post + image-blob upload contract (app-password auth).
4. **Satori / `next/og`** current image-format support, font-loading contract, and the exact unsupported-CSS list (confirm the no-recharts / flexbox-only constraints before authoring shells).
5. **Phase 2 only:** Ayrshare current plan pricing + per-profile cost + the "post on behalf of users" API contract.

---

## 9. Out of scope (v1)

- Multi-tenant per-client OAuth + per-client app review (Phase 2).
- Instagram / Facebook / TikTok / Threads / GBP / Pinterest / YouTube (Phase 2 via aggregator).
- Rich recharts-fidelity chart images (pre-raster fast-follow).
- In-app chat compose panel + deterministic button (D5 follow-ups; engine built to support them).
- Social DM / reply sequences (the drip cursor state machine is reusable later if wanted).

---

## 10. Open design question deferred to the implementation plan

- Exact `social_posts` ⇄ `social_events` dedup window per platform (depends on each platform's metric-refresh cadence, surfaced in §8 verification).
- Whether the engagement poll is one cron per platform or a single fan-out cron (lean: single fan-out, mirrors `daily-rebuild`).
