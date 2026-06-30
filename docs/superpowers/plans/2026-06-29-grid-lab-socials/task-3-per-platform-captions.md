## Task 3: Per-platform caption variants + audience/network/tone/goal knobs

**Goal:** One generated post → per-platform caption variants (the Buffer "content tailoring" pattern, REVIEW B2). Today `build-week.ts` emits ONE generic caption; a Thread, a LinkedIn post, and an IG caption have different shape, length, and hashtag conventions. Add an explicit per-network instruction + a goal/tone knob the user sets once.

**Parallel-safe:** touches `lib/email/social-calendar/*` only — NO shell conflict. Can run alongside Tasks 1/2.

**Files:**
- Modify: `lib/email/social-calendar/build-week.ts` — add per-network tailoring to the synthesis prompt; carry `goal`/`tone` knobs through.
- Modify: `lib/email/social-calendar/types.ts` — `SocialDraft` gains `variants?: Record<Platform, string>`; add `GoalTone` input type.
- Modify: `app/api/email-lab/social-calendar/route.ts` — accept `{ goal, tone, platforms }` and pass through.
- Modify: `lib/email/social/platforms.ts` — **read only** for display labels; do NOT add publish logic here (publish = the 5-member `Platform` union).
- Test: `lib/email/social-calendar/build-week.test.ts` — extend.

**Interfaces:**
- Consumes: existing `socialPostSystem` / four-lane prompt in `build-week.ts`; `Platform` (`@/lib/social/types`) for the publishable subset; the 8 display platforms (`@/lib/email/social/platforms.ts`).
- Produces: `SocialDraft.variants` keyed by the **5 publishable** platforms (author for 8 if the operator wants display previews, but only the 5 are schedule targets — REVIEW A3 guard); `type GoalTone = { goal: "awareness" | "leads" | "engagement"; tone: "professional" | "casual" | "bold" }`.

- [ ] **Step 1** — Open `build-week.ts`; locate `socialPostSystem` and the per-day generation. Confirm the four-lane sourcing block (lake → upload → named web → `[Need: …]`) so the tailoring instruction layers ON it, never replaces it.
- [ ] **Step 2: Failing test** — generating with `platforms: ["x","linkedin"]` returns a draft whose `variants.x.length <= 280` (X limit) and `variants.linkedin` differs from `variants.x`. Mock the Anthropic call deterministically (mirror the existing `build-week.test.ts` mock).
- [ ] **Step 3** — Add to the system prompt: per-network caption rules (X ≤280 chars + 1–2 hashtags; LinkedIn longer-form, professional; IG caption + hashtag block; Facebook conversational) and the goal/tone knob. Numbers still obey the four-lane moat — the tailoring changes SHAPE, never invents a figure.
- [ ] **Step 4** — Thread `variants` onto `SocialDraft`; default the panel/scheduler to the variant for the selected platform, falling back to the generic `caption`.
- [ ] **Step 5: Run tests** (`bun test lib/email/social-calendar/build-week.test.ts`).
- [ ] **Step 6: Typecheck** (`bunx next build 2>&1 | tail -20`).
- [ ] **Step 7: Commit** — `feat(social-calendar): per-platform caption variants + goal/tone knobs (four-lane preserved)`.

**Create-from-scratch (handoff #6) folds in here:** the goal/tone knobs + per-network instruction ARE the "start a post" controls; a blank-canvas social create is the Task-5 seam decision (square/portrait canvas), so it is intentionally NOT duplicated here.
