# U2 — HANDOFF (ask-AI schedule + compose, frozen preview) — probe-verified grounding

> ### 🎯 READ THIS FIRST — do not skim, do not skip to the code.
> This was written by reading the **actual code** (RULE 0.5), and it already caught **two integration traps** that each cost ~a day if you hit them at build time instead of now. **Before writing one line: read the "TWO gaps that WILL bite" section below in full, then the "REUSE, do not rebuild" seams.** The build itself is small and mechanical once those are internalized — *the gotchas are the whole game.* Concrete focus, in order:
> 1. **Don't write a second `fetchBrain`** — extract the cron's into a shared lib (Gap 1).
> 2. **Don't rebuild the card model** — reuse build 05's dossier→`SocialModel` mapper (Gap 2).
> 3. **Numbers are sacred** — captions are prose-only over a verbatim dossier; lint every variant.
> 4. **Resolve a connected account on CONFIRM** or route to connect-first (the U1↔U2 seam).
>
> If you build without reading the two gaps, you will duplicate the brain-fetch and the card model, and your preview will silently diverge from what the cron actually posts. Don't.

**Read `U2-ask-ai-schedule-and-compose.md` + spec `docs/superpowers/specs/2026-06-20-social-user-side-design.md` §2.2/§2.5/§5 for the full assignment.** This is the *probe-first* supplement (every anchor re-opened 2026-06-20): the seams U2 reuses verbatim, and — more important — the **two gaps a blind build will miss**. U2 is **unblocked**: backend 01 (compose core) + 02 (renderer) + 03 (tokens) + **U1 (connect, now on `main`)** are all live.

## Model + shape
**Build with Opus** (no-invention compose + multi-caption + preview judgment). The LLM *calls* use **Haiku** (`claude-haiku-4-5`) — both the NL parse AND the caption variants. Mirror the email two-step exactly: **PROPOSE → signed nonce → CONFIRM**, no silent writes.

New files: `lib/social/schedule-command.ts` (tool + validate + prompt), `app/api/social/schedule-command/route.ts`, `lib/social/compose-caption.ts` (the NEW multi-variant step), `+ tests`.

## ⚠️ The TWO gaps that WILL bite (the revokeToken-equivalents)

### Gap 1 — the live `fetchBrain` is trapped in the cron script, not a shared lib
`buildSocialContent(target, deps)` (compose core, build 01) needs a `deps.fetchBrain`. The **only real implementation** is `buildContentDeps()` **inside `scripts/social/run-schedules.mts:58`** — it fetches `${SITE_URL}/api/b/master?scope_kind=&scope_value=` (15s timeout + per-scope cache). It is **not exported from a lib.** U2's route needs the *same* brain fetch. **DO:** extract `buildContentDeps`/`fetchBrain` into a shared `lib/social/brain-fetch.ts` and **re-point the cron import in the SAME commit** (atomic — no divergence between the route's preview and the cron's real post). Do NOT write a second fetchBrain.

### Gap 2 — nothing maps a dossier → the renderer's `SocialModel`
`renderSocialImage({ model: SocialModel })` (build 02) wants a **`SocialModel { headline, stat?, chart?, as_of?, source?, freshness_token? }`** (`lib/social/render-social-image.ts`). But `buildSocialContent` returns **`SocialContent { caption, hashtags, freshness, image? }`** with **`image` left undefined** ("injected by build 02" — comment, build-content.ts:79). **There is no dossier→SocialModel mapper exposed to a route.** Build **05** (the "social" single-visual template — recent commits `2c4319fc`/`577fecc6`) owns that mapping; `run-schedules.mts` builds the model inline before calling `renderSocialImage`. **DO:** locate build 05's model builder (or the inline mapping in run-schedules.mts), extract it to a shared lib, and reuse it for the preview render. Don't rebuild the card model — that's how the preview and the real post drift.

## Verified seams — REUSE, do not rebuild (symbols, no line numbers)
- **Grounded content (MOAT-gated):** `buildSocialContent(target: SocialTarget, deps: { fetchBrain }): Promise<SocialContent | null>` — `lib/social/build-content.ts`. Returns null when `in_scope=false` → out-of-scope, never invents. The caption it returns is a **deterministic baseline**; U2 generates the *variants* (below).
- **Preview render:** `renderSocialImage(args): Promise<Buffer>` + `SOCIAL_FORMATS {square 1080², portrait 1080×1350, landscape 1200×630, story 1080×1920}` — `lib/social/render-social-image.ts`. Renderer is no-invention (empty stat value → block omitted).
- **Preview hosting:** `uploadSocialImage(db, buffer, key)` → public URL — `lib/social/media-upload.ts` (the build-04 helper; bucket `social-media` is public). Use a preview key e.g. `preview/<uid>/<hash>.png`. PROPOSE returns `preview.image_url` from this.
- **Nonce (single-use, anti-forgery):** `issueProposalNonce({ uid, pid, proposal })` / `verifyProposalNonce(token, { uid, pid, proposal })` — `lib/email/proposal-nonce.ts`, **reuse UNCHANGED** (HMAC, storage-agnostic).
- **Single-use claim:** `claimSocialOnce(db, key, { userId, kind })` — `lib/social/idempotency.ts` (NOT the email one — it writes `social_send_ledger`). CONFIRM key `nonce:<nid>`, kind `"nonce"`.
- **Cadence:** `computeNextRunAt(spec: CadenceSpec): Date | null` + `CadenceSpec { cadence, day_of_week?, day_of_month?, send_hour_et }` — `lib/email/schedule-cadence.ts`.
- **Scope:** `parseDeliverableScope(kind?, value?): { scope_kind, scope_value }`, `SCOPE_KINDS = {zip, place, county}` — `lib/deliverable/parse-scope.ts`. **Corridor is NOT supported** (spec drift #5) — do not offer it in the tool enum.
- **Two-step precedent to clone:** `app/api/email/schedule-command/route.ts` (PROPOSE/CONFIRM + the deterministic `fromDeliverable`/`fromScope` lanes that bypass the model and reuse `deliverableToScheduleRecipe` — a "schedule this card" button gets them free) + `lib/email/schedule-command.ts` (`SCHEDULE_COMMAND_TOOL`, `validateToolInput`, `buildSystemPrompt`, `summarizeCommand`). Auth = cookie/RLS client + `getUser()`, never service-role.

## U2-owned NEW work
- **`lib/social/compose-caption.ts`** — the net-new creative step. `buildSocialContent` emits ONE caption; U2 generates **~3 per-platform variants** (Haiku over the *grounded content* — numbers stay verbatim from the dossier, only prose is model-generated; "deterministic math, narrative prose"). Apply the **no-invention lint** to every variant (placeholder literal → fail) + the §5 char/hashtag caps (X ≤280, LinkedIn ≤3000, IG ≤2200; hashtags IG/LI 3–5, X/FB 1–2). User picks + edits inline; never auto-commit (U-D6).
- **`SOCIAL_SCHEDULE_COMMAND_TOOL`** (`propose_social_schedule_action`) — actions `create|pause|stop|change-cadence|change-platform`; fields `platform, cadence, day_of_week, day_of_month, send_hour_et, scope_kind(zip|place|county), scope_value, content_template, hashtags, media_kind`. `additionalProperties:false`.

## CONFIRM must (the write path)
1. `verifyProposalNonce` → `claimSocialOnce(db, "nonce:<nid>", { userId, kind:"nonce" })` (single-use; replay → already-confirmed).
2. **Resolve `social_account_id`** — `social_schedules.social_account_id` is **NOT NULL**. SELECT the user's connected `social_accounts` row for the chosen platform (`status='connected'`). **None connected → return a "connect first" clarification** routing to U1's `/api/social/connect/{platform}/start` (the U1↔U2 seam). Don't INSERT a schedule with no account.
3. `computeNextRunAt(spec)` → INSERT `social_schedules` (set `user_id`, `social_account_id`, `platform`, `status='active'`, cadence cols, `scope_kind/value`, `content_template`, `hashtags[]`, `media_kind`, `freshness_gate`, `signature`, **`project_id`** so U4's lane can scope it, `next_run_at`).
4. **Freeze (U-D2/§2.5):** write `frozen_post jsonb` = `{ caption, media_url, hashtags, freshness_token, composed_at }` (the `FrozenPost` type, `lib/social/types.ts`) — the approved artifact, posted verbatim on the first fire. **Coordination flag:** build 04's worker (`run-schedules.mts`) must POST `frozen_post` on first fire then refresh-or-skip after; verify it reads the column (it was added 2026-06-20 — likely NOT consumed yet). If unwired, U2 still writes it and it degrades to "re-compose every fire" — note it for a build-04 follow-up.

## Determinism gate (carry the lesson)
The nonce single-use test MUST flip a **decoded byte**, not a base64url char — the flaky-`proposal-nonce` ~6.5%/push-red incident ([[project_flaky-proposal-nonce-and-pack-gate]]). Reuse `proposal-nonce.ts` unchanged; the test lives with the new route.

## Tests & gates (done-bar)
Nonce PROPOSE→CONFIRM happy path + replay→409 + tampered-nonce reject (decoded-byte flip) · caption no-invention lint (every number traces to the dossier) + char/hashtag caps · PROPOSE returns a 200-fetchable `preview.image_url` + ≤3 captions · CONFIRM with no connected account → connect-first clarification (no INSERT) · CONFIRM writes `frozen_post` · MOAT: out-of-scope scope → no preview, no invent. Gates: real-tsc 0, eslint clean, `next build` ✓, relevant `bun test` green. No new deps expected.

## Order: **U2 ‖ U3 → U4.** U2 + U3 share no files (U3 = MCP tools). U4 (workspace lane) edits the shipped FINAL-BOSS workspace files — re-probe at build time. DRY throughout: the user surfaces only write a recipe + freeze; only the cron posts, only when `SOCIAL_PUBLISH_ENABLED=true`.
