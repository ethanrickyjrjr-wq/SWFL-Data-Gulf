# Lane 30 — Build/typecheck baseline (pre-fix)

Goal: capture pass/fail state of `bunx tsc --noEmit` and `bunx next build` BEFORE any
email-build-fix changes land. Read-only. No DB writes, no browser, no git.

## Plan
- Check package.json scripts (done): `build` = `next build`, no root-level `tsc --noEmit` script
  (there's `refinery:typecheck` = `tsc -p refinery/tsconfig.json --noEmit`, scoped to refinery/).
- Run `bunx tsc --noEmit` from repo root (uses root tsconfig.json if present).
- Run `bunx next build` from repo root.
- Record full output, exit codes, error/warning counts.

## Results (2026-07-20, before any email-build-fix code changes)

### `bunx tsc --noEmit` (root `tsconfig.json`)
- Exit code: 0
- Output: **empty** (zero errors, zero warnings)
- Scope confirmed via `tsconfig.json`: `include` = `next-env.d.ts`, `**/*.ts`, `**/*.tsx`,
  `.next/types/**/*.ts`, `.next/dev/types/**/*.ts`, `**/*.mts` — i.e. covers `app/`, `components/`,
  `lib/` (including every file named in the incident brief: `app/api/email-lab/ai/route.ts`,
  `lib/deliverable/recipes.ts`, `lib/email/doc/*.ts`, `lib/email/render-email-doc.ts`,
  `lib/email/blocks/*.tsx`, `lib/pdf/email-doc-pdf.tsx`, `lib/listings/*.ts`,
  `components/email-lab/*.tsx`, `app/email-lab/**`, `app/dev-emails/page.tsx`).
- `exclude`: `node_modules`, `refinery`, `docs`, `tools`, `ops`, `scripts`, `ingest`,
  `mcp-widget`, plus all `*.test.ts(x)`/`*.test.mts` and `scratch-*`. So `refinery/` and
  `scripts/dev-render-listing-emails.mts` are NOT typechecked by this command (they have their
  own `refinery:typecheck` script pointed at `refinery/tsconfig.json` — not run here, out of
  scope for this lane unless asked).
- **Conclusion: clean baseline, 0 type errors in the app/lib/components surface.**

### `bunx next build` (Next.js 16.2.9, Turbopack)
- Exit code: 0
- `✓ Compiled successfully in 12.3s`
- `Running TypeScript ... Finished TypeScript in 17.8s` (next build's own internal typecheck pass,
  separate from the root tsc invocation above) — no errors reported.
- `Generating static pages using 27 workers (95/95)` — all 95 routes built successfully, including
  `/email-lab`, `/email-lab/grid`, `/dev-emails`, `/api/email-lab/ai`, `/project/[id]/email-lab`.
- Only warning in the entire output: `⚠ The "middleware" file convention is deprecated. Please
  use "proxy" instead.` (Next 16 naming migration notice, pre-existing, unrelated to the email
  build bug — this is a Next.js internal rename, not a code defect.)
- No other warnings, no failed page generations, no build errors.
- **Conclusion: clean production build. 95/95 routes generate successfully.**

## Bottom line for the before/after comparison
Both gates pass 100% clean right now, with the single pre-existing "middleware→proxy" deprecation
notice as the only diagnostic output at all. This means:
1. The confirmed runtime bugs (empty hero photo, wrong-property ZIP-stats fallback, mid-word
   truncation, garbled chart layering, ZIP mismatch, `/dev-emails` placeholder photos, LinkAskModal
   duplicate-key warning) are **NOT type errors and NOT build failures** — they are logic/runtime
   bugs that a clean `tsc`/`next build` cannot catch (wrong data selection, silent zod strip-mode
   drops, runtime React key collisions, prompt/AI-routing logic). Static analysis gives zero signal
   on any of them.
2. Whatever fix lands for the other lanes' findings, the acceptance bar for "did we regress
   anything" is simple and binary: `bunx tsc --noEmit` must stay empty/exit 0, and `bunx next
   build` must stay `✓ Compiled successfully` + `(95/95)` pages with only the middleware notice
   (or zero warnings if that's fixed too). Any new tsc error or any drop below 95/95 generated
   pages after a fix lands is a regression introduced by that fix, not a pre-existing condition.
3. Recommend the post-fix pass re-run BOTH commands verbatim and diff against this file.
