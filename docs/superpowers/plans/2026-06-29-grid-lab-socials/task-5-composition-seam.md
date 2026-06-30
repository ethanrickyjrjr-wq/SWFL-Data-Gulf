## Task 5: Native grid composition of social cards — ⛔ GATED on C1

> **BLOCKED until the C1 decision gate (see README) is made by the operator.** This task IS the (a)/(b) fork — do not expand it into executable steps until Ricky picks a branch. Writing detailed steps now would fabricate a design that the decision hasn't chosen yet.

**Goal:** A social card composes natively on the 2D grid at the right aspect ratio (IG 1080×1080 square, story 1080×1920 portrait), instead of `loadSocialCard` stacking EmailDoc blocks full-width (today's shim).

**The fork (decide first — README C1):**

- **If (a) SocialModel-on-grid:** constrain a social card to the `SocialModel` template (1 headline + 1 stat + optional chart, `lib/social/render-social-image.ts`). Then:
  - Replace `loadSocialCard`'s full-width stack with a fixed social layout (headline / stat / chart regions) on a social-sized canvas preset.
  - Add canvas presets keyed to `SOCIAL_FORMATS` (square / portrait / landscape / story).
  - `renderSocialImage(format)` already yields the per-platform PNG → Task 6 is then trivial.
  - **Files (a):** `EmailLabGridShell.tsx` (`loadSocialCard` + canvas presets), maybe a new `lib/email/lab/social-canvas.ts` for the preset map.

- **If (b) EmailDoc→PNG:** a card stays a rich EmailDoc grid; build the net-new HTML/grid→PNG rasterizer (resvg can't render HTML — needs Satori / `@vercel/og` / headless, vendor-verified in-session per RULE 1 before picking the lib). Then any grid composes; Task 6 rasterizes it per platform size.
  - **Files (b):** new `lib/social/render-emaildoc-image.ts` (the rasterizer), `EmailLabGridShell.tsx` (social canvas presets), `app/api/email-lab/render` wiring.

**Shared (either branch):** 🔴 touches `EmailLabGridShell.tsx` — serialize after Tasks 1/2.

- [ ] **Step 0 (gate):** Confirm the C1 decision is recorded (README updated with the chosen branch). Only then expand Steps 1+.
- [ ] **Steps 1+:** _authored once the branch is chosen._
