# 04 — Compose engine + `swfl_social_post` MCP tool

| | |
|---|---|
| **Model** | **Opus** (LLM prompt design + safety/nonce + no-invention moat) |
| **Stage** | 2 — after 01's `types.ts` + migration merge |
| **Runs in parallel with** | 03 |
| **CANNOT run at same time as** | **05** — both touch scope/grain resolution. Let 05 publish the grain-resolver interface first, then consume it. If you can't sequence, run 05 alone first. |
| **Blocked by** | 01 (writes `post_schedules`/`social_posts`, uses the publish path + nonce). Integrates 02 (`render`) + 03 (platform formats) **via interfaces** — build in parallel, wire at the end. |
| **Files** | NEW: `lib/social/compose.ts`, `lib/social/fanout.ts`; EDIT: the MCP tool registry (`app/api/mcp/**`) to add `swfl_social_post` |

## Goal
The headline "just by asking AI" surface. Turn a brain/master dossier into per-platform posts, and expose compose+schedule as an MCP tool with the same propose→confirm safety as the email command.

## Build
1. **`compose.ts`:** given `{ dossier, scope, platform, template }` → a `ComposedPost` (caption + media via `render`). Caption shaped per platform: X ≤280 with **link-in-first-comment**; LinkedIn long-form / carousel; Bluesky ≤300, 1-hashtag norm.
2. **No-invention lint (MOAT):** reuse the forced-tool + verbatim-number gate (`lib/deliverable/build.ts:281-336,405-474`, `gateNarrative`). Every number in a caption traces to the dossier; placeholder/invented numbers fail. Tier-1 = cited facts only; direction calls come from master, tagged `[INFERENCE]` + falsifier.
3. **`fanout.ts`:** one source dossier → N platform variants (don't re-pull per platform — one grounded source, re-skinned).
4. **`swfl_social_post` MCP tool** on the existing `/api/mcp`. Actions: `compose | preview | schedule | list | cancel`. Two-step: `propose` (returns caption + image URL + the schedule it would write) → **signed single-use nonce** (reuse `lib/email/proposal-nonce.ts`) → `confirm` (writes a `post_schedules` recipe or a one-off `social_posts` through 01's gated publish path). Mirror `lib/email/schedule-command.ts:33-282` + `app/api/email/schedule-command/route.ts`.
5. **Human confirm before publish — non-negotiable.** A one-off "post now" still routes through 01's `SOCIAL_PUBLISH_ENABLED` gate, so it's dry until go-live.

## Tests & gates
Caption no-invention lint test · per-platform shaping tests (char limits, X first-comment link) · **MCP nonce single-use test — DETERMINISTIC** (flip a *decoded* byte, not a base64url char — the flaky-`proposal-nonce` lesson, ~6.5%/push red otherwise) · propose→confirm happy path + replay-rejection. real-tsc 0, eslint, MCP surface intact.

## Done =
"Schedule this corridor stat to LinkedIn weekly" via the MCP tool → preview (real caption + rendered image) → confirm → a `post_schedules` row, all dry until the go-live flip.
