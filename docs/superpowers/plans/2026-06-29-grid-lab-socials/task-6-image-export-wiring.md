> **RESOLVED / SUPERSEDED 2026-06-30.** C1 resolved to a **canvas-native composer**; native PNG export comes for free via the canvas (`toDataURL`), so this task is superseded by `docs/superpowers/specs/2026-06-30-social-canvas-composer-design.md` (build check `social_canvas_composer_live_verify`). The original gated text is kept below for context only.

## Task 6: Platform-correct image export wiring — ⛔ GATED on C1

> **BLOCKED until the C1 decision gate (see README) is made.** This task's shape is determined by the Task 5 branch. Under (a) it is mostly wiring an endpoint that already exists; under (b) it depends on Task 5's net-new rasterizer.

**Goal:** Export a social card to a real PNG at the right pixel dimensions per platform, surfaced from the lab (download / attach as the schedule's `media_url`). REVIEW A2 + B1: `renderSocialImage` already rasterizes 4 confirmed-current sizes; `app/api/social/render/[format]/route.ts` already exists. So under branch (a) this is **wiring, not building**.

**The fork:**

- **If (a):** add an "Export image" / "Use as post image" action that POSTs the card's `SocialModel` + chosen `format` to `app/api/social/render/[format]/route.ts`, gets the PNG, and (i) offers download and (ii) sets the schedule's `frozen_post.media_url` (uploads via the existing `lib/social/media-upload.ts` → public Supabase Storage URL — see open check `social_media_storage_upload`).
  - **Files (a):** `EmailLabGridShell.tsx` (export action), small client in `components/email-lab/` for the format picker (square/portrait/landscape/story), reuse `app/api/social/render/[format]/route.ts`.

- **If (b):** export calls Task 5's `render-emaildoc-image` rasterizer at each `SOCIAL_FORMATS` size; same upload/attach path.

**Sizes are settled (REVIEW B1):** the 4 `SOCIAL_FORMATS` cover all 5 publishable platforms (Reels/Stories/TikTok all = `story` 1080×1920). Pinterest 1000×1500 + YouTube 1280×720 are Phase-2, non-publishable — add only when their adapters land.

**Shared:** 🔴 touches `EmailLabGridShell.tsx` — serialize after Task 5.

- [ ] **Step 0 (gate):** Confirm C1 decided + Task 5 branch landed.
- [ ] **Steps 1+:** _authored once the branch is chosen._ Closes check `grid_lab_socials_live_verify` (full flow: generate → tailor → compose → export PNG → schedule → row written) plus assists `social_media_storage_upload`.
