# Design workshop handoff — react-email preview, Storybook, visual regression

**Date:** 2026-07-08
**Scope:** developer tooling only — none of this is customer-facing, none of it is Email Lab or Social Lab (the real product surfaces at `/email-lab`, `/social-lab`). This is the workshop out back.

## What exists now

Three separate tools, each owning a different layer. They don't compete or overlap — picking the wrong one for a job is the main mistake to avoid.

| Tool | Owns | Run it | Config |
|---|---|---|---|
| `react-email` preview | Actual email HTML content (`lib/email/blocks/*`) | `bun email:dev` → http://localhost:3001 | Watches `emails/*.tsx` only |
| Storybook | The app's own editor UI (`components/email-lab/**`, `components/ui/**`) | `bun run storybook` → http://localhost:6006 | `.storybook/main.ts`, `.storybook/preview.tsx` |
| Playwright visual regression | Catches pixel-level regressions in the react-email previews | `bun run test:visual` | `playwright.config.ts` |

## react-email preview (`emails/`)

Three preview files, each a real `EmailDoc` rendered through the actual production path (`EmailDocEmail`), not a redrawn mockup:

- `fence-3-photo-ratio.tsx` — same 1200×1200 source image at three `kind` values; only `"photo"` locks to 3:2.
- `fence-4-typography.tsx` — the legal PLAYFAIR_SERIF display + LATO_SANS body pairing.
- `fence-4-typography-illegal.tsx` — the rejected serif+serif pairing, shows `brandGlobalStyle` dropping the display font.

Styled with the real "Dark Pro" skeleton palette (`lib/email/doc/default-docs.ts`) and real SWFL place names (Fort Myers, Naples) — not invented content.

**Important gotcha, cost real debugging time to find:** `email dev` only watches files inside `emails/`. It does **not** hot-reload when you edit something in `lib/email/blocks/*` or `lib/email/brand/*` that a preview file imports. If you change fence code and the preview doesn't reflect it, that's why — restart the server, don't trust hot-reload for anything outside `emails/`.

**Second gotcha:** stopping a background task that's running `email dev` does not reliably kill the underlying Node process on Windows — it can keep holding the port after the task shows as stopped. If a restart claims the port is already in use, check `netstat -ano | grep LISTENING` for the real PID and `taskkill //F //PID <pid>` it directly rather than trusting the task manager stopped it.

## Storybook (`components/ui/*.stories.tsx`, `components/email-lab/*.stories.tsx`)

5 story files, scoped to the actual editor UI (not email content, react-email owns that):

- `components/ui/badge.stories.tsx` — includes the project's one mandatory `CssCheck` story, asserting `Badge`'s `default` variant resolves to the real `rgb(61, 201, 192)` (`--brand-primary` → `--gulf-teal` → `#3DC9C0`, `app/globals.css`). Caught a real bug while writing it: `Badge`'s own default parameter is `variant = "secondary"`, not `"default"` — a story titled "Default" that doesn't explicitly pass `variant: "default"` renders the near-white secondary style, not teal. Fixed by renaming that story and adding an explicit `Filled` story.
- `components/ui/card.stories.tsx`
- `components/email-lab/AddBlockPanel.stories.tsx` — includes a real interaction test (`play` function clicking "Text" and asserting `onAdd` fired with `"text"`).
- `components/email-lab/MediaPanel.stories.tsx`
- `components/email-lab/BlockInspector.stories.tsx` — smoke-render only, using a real `EmailBlock` (hero type). The AI chat path (`onBlockAi`) isn't exercised.

Not covered: `components/email-lab/social/SocialComposer.tsx` — it takes a `SocialComposerHandle` produced by the `useSocialComposer` hook (Konva canvas state), not simple props. Building a story for it means either instantiating that hook inside a harness or mocking Konva — skipped rather than forcing something fragile. Real gap, not silently dropped.

`.storybook/main.ts` stories glob was originally left pointed at the auto-generated `stories/` sample folder (the installer's default) — fixed to `{app,components,lib}/**/*.stories.tsx`, and the sample `stories/` directory (Button/Header/Page boilerplate) was deleted per Storybook's own cleanup step once real stories existed and passed.

Verify: `bunx vitest --project storybook run` — 5 files, 9 tests, all passing.

## Visual regression (`playwright.config.ts`, `emails/visual-regression.spec.ts`)

Runs Playwright's built-in `toHaveScreenshot()` against every `emails/*.tsx` preview (discovered by reading the directory, not hand-maintained — add a new preview file and it's automatically covered). First run per file writes a baseline PNG to `emails/__screenshots__/`; every run after that fails on a pixel diff.

- `bun run test:visual` — check against the current baseline.
- `bun run test:visual:update` — accept the current render as the new baseline (run this deliberately after a design change you want to keep, not by default).

**Verified this actually catches something**, not just theoretically: temporarily reverted Fence 3's `aspectRatio`/`objectFit` in `ImageBlock.tsx`, restarted the preview server (see the hot-reload gotcha above — this step is not optional), ran `bun run test:visual`, confirmed it failed with a 17% pixel diff, restored the real code, restarted again, confirmed a clean pass. That's the actual proof the gate works, not an assumption.

**Why not the chrome-devtools MCP server for this** (it was the original ask): that MCP server is built for interactive agent-driven browsing — I use it myself for spot-checking — but it isn't a mechanism a script or pre-push hook can invoke on its own. `@playwright/test`'s `toHaveScreenshot()` is the vendor-standard tool for an automated, repeatable "catch it before it ships" gate; that's what actually got wired here.

## What this doesn't cover

- Not wired into the pre-push hook yet — running `bun run test:visual` before a fence change ships is a manual step today, not enforced.
- Storybook has no visual regression of its own — only the react-email previews are covered. Extending `toHaveScreenshot()` to Storybook stories would need Storybook's own test-runner integration, not built here.
- No CI job runs any of this yet — everything above is local-only.
