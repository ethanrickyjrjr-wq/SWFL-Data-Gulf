# Bluesky Post-Now Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 12 files, keywords: migration, schema, architecture

**Goal:** A "Post to Bluesky" button in the project Social tab that posts the composed canvas card + caption to @swfldatagulf.com via the env app-password credential.

**Architecture:** `bluesky` joins the engine's `Platform` union (atomic type-lift); a new adapter `lib/social/channels/bluesky.ts` does session→uploadBlob→createRecord against `https://bsky.social`; a new route `/api/social/post-now` validates (operator gate, env presence, 300 graphemes, 2,000,000 bytes, 10-min dedupe) then calls the adapter DIRECTLY (not via `postToChannel` — the `SOCIAL_PUBLISH_ENABLED` flag guards only the unattended cron lane); a small `BlueskyPostBar` component wires into the existing composer.

**Tech Stack:** Next.js App Router route handler, Bun tests, Konva `stage.toDataURL` export, `Intl.Segmenter`, Web Crypto SHA-256, Supabase (`social_posts` history).

**Spec:** `docs/superpowers/specs/2026-07-26-bluesky-post-now-design.md` · **Check:** `bluesky_post_now_live_verify`

## Global Constraints

- Image blob hard cap **2,000,000 bytes** (`lexicons/app/bsky/embed/images.json` `maxSize`, read live 07/26/2026). Caption cap **300 graphemes** (`app.bsky.feed.post` `maxGraphemes`) — count with `Intl.Segmenter`, NEVER `.length`.
- `alt` is REQUIRED on the image embed (empty string legal; we default to the card headline).
- Env credential names: `BSKY_IDENTIFIER` / `BSKY_APP_PASSWORD` (already in `.env.local`; must be added to Vercel env before prod use).
- Operator gate = session user's email equals `process.env.OPERATOR_EMAIL` (repo's existing operator convention — `scripts/records-request.mts:186`).
- No hex literals under `lib/social/design/**` (ESLint-enforced); UI follows the one-room rule — reuse Social-tab chrome.
- Never `git add -A`; stage explicit paths. Commits local; push only with operator confirmation.
- PowerShell tool for pwsh syntax, Bash tool for POSIX — never cross.

---

### Task 1: Type-lift — `bluesky` in the Platform union

**Files:**
- Modify: `lib/social/types.ts:23` (union) and the file-top comment listing v1 scope
- Modify: `lib/social/channels/index.ts` (dispatch switch + `platformLabel`)
- Test: `lib/social/channels/channels.test.ts` (extend existing)

**Interfaces:**
- Produces: `Platform` now includes `"bluesky"`. `postToChannel` case `"bluesky"` returns `{ ok: false, error: "bluesky posts via /api/social/post-now (env credential); cron lane not wired" }` — honest exhaustiveness, no pretend cron support. `platformLabel("bluesky") === "Bluesky"`.

- [ ] **Step 1: Write failing tests** — append to `channels.test.ts`:

```ts
test("platformLabel knows bluesky", () => {
  expect(platformLabel("bluesky")).toBe("Bluesky");
});
test("postToChannel routes bluesky to the not-wired error, not token lookup", async () => {
  process.env.SOCIAL_PUBLISH_ENABLED = "true";
  const r = await postToChannel(fakeDb as never, "u1", {
    platform: "bluesky", accountId: "env", caption: "x", media: [],
  });
  expect(r.ok).toBe(false);
  expect(r.error).toContain("post-now");
});
test("bluesky is NOT an OAuth-configurable platform", () => {
  // Gate connect UIs off oauth-config keys, never the union (spec failure-mode 2).
  // Import the oauth config map from lib/social/connect/oauth-config.ts and assert
  // no "bluesky" key exists.
  expect(Object.keys(OAUTH_PLATFORMS ?? {})).not.toContain("bluesky");
});
```

(Adjust the third test's import to the actual exported name in `lib/social/connect/oauth-config.ts` — read that file first; the assertion, not the name, is the requirement.)

- [ ] **Step 2: Run** `bun test lib/social/channels/channels.test.ts` — expect FAIL (type error: `"bluesky"` not in union).
- [ ] **Step 3: Implement** — add `"bluesky"` to the union in `types.ts:23`; in `channels/index.ts` add the switch case ABOVE the `default` returning the not-wired error, and `bluesky: "Bluesky"` to `platformLabel`'s record. Fix every other compile error the union change surfaces (compiler enumerates them — that is the point of the atomic lift; typical spots: schedule route platform parsing, connect `[platform]` route param validation. In each, bluesky must be REJECTED on OAuth-only paths with a clear error, mirroring how an unknown platform is rejected there today).
- [ ] **Step 4: Run** `bun test lib/social/channels/` AND the repo typecheck — expect PASS/clean.
- [ ] **Step 5: Commit** `git add lib/social/types.ts lib/social/channels/index.ts lib/social/channels/channels.test.ts <any files the lift touched>` · `git commit -m "feat(social): bluesky joins the Platform union (post-now lane; cron not wired)"`

### Task 2: Validation module (TDD)

**Files:**
- Create: `lib/social/post-now-validate.ts`
- Test: `lib/social/post-now-validate.test.ts`

**Interfaces (Produces — route and UI both import these):**

```ts
export const MAX_CAPTION_GRAPHEMES = 300;
export const MAX_IMAGE_BYTES = 2_000_000;
export function graphemeCount(s: string): number;               // Intl.Segmenter("en", {granularity:"grapheme"})
export function decodeDataUrl(d: string): { bytes: Uint8Array; mime: string } | null; // null on malformed / non-image/*
export async function contentHash(caption: string, bytes: Uint8Array | null): Promise<string>; // sha256 hex via crypto.subtle
export type PostNowInvalid = { ok: false; status: 400 | 413; error: string };
export type PostNowValid = { ok: true; bytes: Uint8Array | null; mime: string | null };
export function validatePostNow(input: { caption: string; imageDataUrl?: string }): PostNowInvalid | PostNowValid;
```

- [ ] **Step 1: Write failing tests** covering: 300 graphemes exactly passes; 301 rejects with the count in the message; an emoji family (`"👨‍👩‍👧‍👦"`) counts as 1 grapheme; `decodeDataUrl("data:image/png;base64,<tiny valid b64>")` returns bytes+mime; `decodeDataUrl("data:text/html;base64,...")` returns null; a decoded payload over `MAX_IMAGE_BYTES` rejects with status 413 naming the byte count; `contentHash` is stable for same input, different for different captions; caption-only input (no image) is valid with `bytes: null`.
- [ ] **Step 2: Run** `bun test lib/social/post-now-validate.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement** the module exactly to the interface above. Keep it dependency-free (Web APIs only) so the client can import `graphemeCount`/`MAX_CAPTION_GRAPHEMES` for the counter.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `git add lib/social/post-now-validate.ts lib/social/post-now-validate.test.ts` · `git commit -m "feat(social): post-now validation — grapheme cap, byte cap, dedupe hash"`

### Task 3: Bluesky adapter (TDD, mocked fetch)

**Files:**
- Create: `lib/social/channels/bluesky.ts`
- Test: `lib/social/channels/bluesky.test.ts`

**Interfaces (Produces):**

```ts
export interface BlueskyCredential { identifier: string; appPassword: string }
export interface BlueskyPostInput {
  caption: string;
  image?: { bytes: Uint8Array; mime: string; alt: string; aspectRatio?: { width: number; height: number } };
}
export interface BlueskyPostResult extends PublishResult { uri?: string; url?: string }
// url = https://bsky.app/profile/<identifier>/post/<rkey>; rkey = last segment of the at:// uri
export async function postToBluesky(input: BlueskyPostInput, cred: BlueskyCredential): Promise<BlueskyPostResult>;
```

Call sequence (all against `https://bsky.social`): (1) POST `/xrpc/com.atproto.server.createSession` `{identifier, password}` → `{accessJwt, did}`; (2) if image: POST `/xrpc/com.atproto.repo.uploadBlob` with raw bytes, `Content-Type: <mime>`, Bearer auth → `{blob}`; (3) POST `/xrpc/com.atproto.repo.createRecord` `{repo: did, collection: "app.bsky.feed.post", record: {$type:"app.bsky.feed.post", text: caption, createdAt: new Date().toISOString(), langs:["en"], embed?: {$type:"app.bsky.embed.images", images:[{alt, image: blob, aspectRatio?}]}}}`. Any non-OK response → `{ ok:false, error }` carrying the platform's error JSON verbatim; never throw.

- [ ] **Step 1: Write failing tests** with a `fetch` mock (restore in `afterEach` — same pattern as `app/api/social/connect/[platform]/callback/route.test.ts`): happy path with image asserts the 3 calls in order, Bearer header on calls 2 and 3, blob object embedded verbatim, `alt` present, result `{ok:true}` with `uri`/`url` derived; caption-only path makes 2 calls (no uploadBlob) and no `embed` key; createSession 401 → `{ok:false}` with the body's message; uploadBlob failure short-circuits (no createRecord call).
- [ ] **Step 2: Run** `bun test lib/social/channels/bluesky.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `postToBluesky` per the sequence above.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `git add lib/social/channels/bluesky.ts lib/social/channels/bluesky.test.ts` · `git commit -m "feat(social): bluesky adapter — session, blob upload, post record"`

### Task 4: `/api/social/post-now` route (TDD)

**Files:**
- Create: `app/api/social/post-now/route.ts`
- Test: `app/api/social/post-now/route.test.ts`
- Maybe create: SQL migration (see Step 0)

**Interfaces:**
- Consumes: `validatePostNow`/`contentHash` (Task 2), `postToBluesky` (Task 3).
- Produces: `POST /api/social/post-now` body `{ caption: string; imageDataUrl?: string; alt?: string }` → 200 `{ ok:true, url, uri }` · 403 (not operator) · 503 `"Bluesky not configured"` (env absent) · 400/413 (validation) · 409 (dedupe) · 502 `{ ok:false, error }` (platform failure, error verbatim).

- [ ] **Step 0: Schema check.** `social_posts.social_account_id` is typed non-null (`lib/social/types.ts:100`) and likely FK to `social_accounts` — an env-credential post has no account row. Query the live schema (`information_schema` via the repo's Bun.SQL migration pattern). If NOT NULL, run an idempotent migration: `ALTER TABLE public.social_posts ALTER COLUMN social_account_id DROP NOT NULL;` and verify with a re-query. (RULE 1: migrations run directly, idempotent, verify after.)
- [ ] **Step 1: Write failing tests** (mock the supabase server client for auth + `postToBluesky` via module mock, same style as the connect callback route test): non-operator session → 403; operator + missing `BSKY_APP_PASSWORD` → 503 with "Bluesky not configured"; 301-grapheme caption → 400; operator + valid input → calls `postToBluesky` once and returns its url; identical payload again within the dedupe window → 409 and NO adapter call; adapter `{ok:false}` → 502 with the same error string.
- [ ] **Step 2: Run** `bun test app/api/social/post-now/route.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** gate order exactly: session (supabase server client) → `user.email === process.env.OPERATOR_EMAIL` else 403 → env presence else 503 → `validatePostNow` else its status → `contentHash` → dedupe: select `social_posts` where `idempotency_key = 'postnow:' + hash.slice(0,32)` and `created_at > now()-10min`, hit → 409 → `postToBluesky` with `{caption, image: bytes ? {bytes, mime, alt: alt || "SWFL Data Gulf market card"} : undefined}` and `{identifier: BSKY_IDENTIFIER, appPassword: BSKY_APP_PASSWORD}` → on ok, insert `social_posts` `{platform:"bluesky", post_schedule_id:null, social_account_id:null, platform_post_id:uri, caption, media_url:null, status:"published", idempotency_key:'postnow:'+hash.slice(0,32), published_at:now}` — insert failure does NOT fail the response; log `console.error("[post-now] posted but social_posts insert failed", uri, err)` (spec failure-mode 9) → 200.
- [ ] **Step 4: Run** — expect PASS. Also `bun test lib/social/` stays green.
- [ ] **Step 5: Commit** `git add app/api/social/post-now/ <migration file if any>` · `git commit -m "feat(social): post-now route — operator-gated bluesky publish"`

### Task 5: UI — BlueskyPostBar in the composer

**Files:**
- Create: `components/email-lab/social/BlueskyPostBar.tsx` (+ sibling `bluesky-post-bar-logic.ts` if helpers must stay DOM-free for tests)
- Modify: `components/email-lab/social/SocialComposer.tsx` (render the bar near the existing export controls)
- Test: `components/email-lab/social/bluesky-post-bar-logic.test.ts`

**Interfaces:**
- Consumes: `graphemeCount`, `MAX_CAPTION_GRAPHEMES`, `MAX_IMAGE_BYTES` (Task 2); the composer's existing stage export (`useSocialComposer.ts:437` pattern — `stage.toDataURL({ pixelRatio, mimeType })`, JPEG quality supported); card headline text from the composer's design model for the alt default (fallback literal: `"SWFL Data Gulf market card"`).
- Produces: `<BlueskyPostBar exportImage={(opts: {pixelRatio: number; mimeType: string; quality?: number}) => string | null} altDefault={string} />` — caption textarea + live `n/300` counter (red at >300, button disabled), alt input, "Post to Bluesky" button.

- [ ] **Step 1: Write failing tests** for the pure helpers: caption-over-limit state at 301 graphemes; re-encode ladder `shrinkToCap(exportImage)` tries `[{pixelRatio:2,mimeType:"image/png"},{pixelRatio:2,mimeType:"image/jpeg",quality:0.9},{pixelRatio:1.5,mimeType:"image/jpeg",quality:0.85},{pixelRatio:1,mimeType:"image/jpeg",quality:0.8}]` in order and returns the first data URL whose decoded bytes ≤ `MAX_IMAGE_BYTES`, or `{error}` if none fit (spec failure-mode 4).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** the bar: in-flight state disables the button (spec failure-mode 6); on success render the returned post URL as a link; on failure render the server's error string verbatim (spec failure-modes 3 and 7). Reuse existing Social-tab styling classes — one-room rule, no new chrome, no raw hex.
- [ ] **Step 4: Run** logic tests + `bun test lib/social/` — PASS.
- [ ] **Step 5: Wire into `SocialComposer.tsx`**, passing the stage-export closure and headline-derived `altDefault`.
- [ ] **Step 6: Commit** `git add components/email-lab/social/BlueskyPostBar.tsx components/email-lab/social/SocialComposer.tsx components/email-lab/social/bluesky-post-bar-logic.ts components/email-lab/social/bluesky-post-bar-logic.test.ts` · `git commit -m "feat(social): Post to Bluesky bar in the composer"`

### Task 6: Verify, ship, close the check

- [ ] **Step 1:** `bunx next build` — clean (repo rule: verify with next build, not tsc alone).
- [ ] **Step 2:** Add `BSKY_IDENTIFIER` + `BSKY_APP_PASSWORD` to the Vercel project env (operator in the dashboard, or `vercel env add` once the CLI is installed) — without them prod correctly 503s.
- [ ] **Step 3:** SESSION_LOG entry + scratchpad update; stage explicit paths; ASK the operator before pushing (per-push approval, never carried).
- [ ] **Step 4:** After deploy: compose a card in the Social tab, post it live, confirm it renders at https://bsky.app/profile/swfldatagulf.com, then `node scripts/check.mjs close bluesky_post_now_live_verify`. Checks close on prod evidence only.

## Self-review

Spec coverage: type-lift→T1, adapter→T3, route gates a–e→T4, UI→T5; failure modes 1–2→T1 tests, 3→T4 (503), 4→T2+T5 ladder, 5→T2, 6→T4 dedupe + T5 disable, 7→T3 (error verbatim), 8→T4 alt default, 9→T4 insert-failure logging, 10→design (no automation in this lane). Types consistent: `postToBluesky`/`BlueskyPostInput`/`validatePostNow`/`shrinkToCap` names match across tasks. The one variable point (oauth-config export name, T1) is explicitly a read-first instruction with the assertion fixed.
