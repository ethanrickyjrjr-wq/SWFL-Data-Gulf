# CI-green cascade — handoff (2026-07-17)

Main's `ci.yml` `build` job had been RED for 7+ consecutive runs, with every push bypassing the
required `CI / build` check (safe-push admin-bypass). Because CI steps run in ORDER and stop at the
first failure, the red hid MULTIPLE independent layers — each fix exposed the next. This session drove
it back to GREEN (first green: commit `bdfd9f18`, run 29618424950). This handoff records what was
fixed and — more importantly — the non-blocking issues surfaced along the way that are NOT yet
addressed.

## What was fixed (all on main, CI-verified green)

Order of the `build` job: Typecheck → Lint → Test (bun) → Test .github scripts (node:test) → Dead code
(knip, report-only) → Registry identity (static) → Registry identity (live, advisory).

1. **bun-test layer** (4 failures, all stale-test or infra, none from the triggering diffs):
   - `place-from-prompt.wrong-city.test` asserted "North Fort Myers" → undefined, but NFM was added to
     the gazetteer 07/16 with its own ZIPs (33903/33917/33918). Test moved to the DO-hold block.
   - `rules-of-engagement.test` still required CLAUDE.md to carry the verbatim rules block; commit
     1def7125 had replaced it with a pointer. Dropped CLAUDE.md from the MIRRORS list.
   - `ci.yml` ran `bun test` with **no browser installed** → every lib/pdf rasterize + visual-parity
     test died on "Executable doesn't exist". Added `bunx playwright install --with-deps chromium`.
   - **agent-hero PDF/HTML aspect-ratio** (the one real product bug): HTML rendered the hero photo
     600×300 (2:1), PDF rendered it full-width 612×200 (3.06:1) — same photo cropped differently in the
     email vs the downloadable PDF. Fixed at the root: new `lib/email/blocks/agent-hero-dimensions.ts`
     holds one ratio; PDF now uses react-pdf's `aspectRatio`. (Handoff 2026-07-14-pdf-html-visual-parity
     §1 was the source; this closes its open item.)

2. **node:test layer** (2 failures, exposed only once bun test went green):
   - `.github/_watch-manifest.json` + both watcher workflows (log-cron-incident.yml, heal-cron-failure.yml)
     were stale vs the workflows dir. Ran the sanctioned regen `node scripts/build-watch-lists.mjs
     --write --write-watchers`.
   - `push-touched-unit-coverage.mjs` — a **real cross-platform bug** (passed on Windows, failed on
     Linux CI): `absForwardSlashed` normalized with `.split(sep).join("/")`, and `sep` is the runtime
     OS separator, so Windows-style backslash inputs survived on a Linux runner and the forward-slashed
     markers never matched. Replaced with `.replace(/\\/g, "/")`.

## STILL OPEN — non-blocking, surfaced during the cascade (the "new issues")

### 1. Four ZOMBIE CRONS — disabled at the GitHub API but cron-LIVE in source
Surfaced by the watch-list regen. These workflows have a live `schedule:` in source but are DISABLED
at the GitHub Actions API, so they never fire — yet the cadence registry still expects fresh rows from
them:
- `dbpr-sirs-monthly.yml`
- `fgcu-reri-monthly.yml`
- `marketbeat-pdf-ingest.yml`
- `rsw-airport-monthly.yml`

`gh workflow enable <name>` resumes each instantly. **DO NOT blindly enable** — at least some
workflows in this repo were paused DELIBERATELY (cost / paid-search retrofit — see the daily-digest
kill 07/16 and the "grep for web_search before re-enabling any paused workflow" rule in
`ingest/CLAUDE.md`). Each needs an intentional-or-not decision by the operator. Tracked as a check
(`zombie_crons_disabled_but_registry_expects_rows`).

### 2. `action_major_behind` advisories (no action needed)
The static registry-identity check WARNs that many workflows pin `actions/checkout@v6` /
`actions/setup-python@v5` while v7/v6 exist. The tool itself marks these **advisory only** and does not
fail on them — "tag-exists != compatible; do NOT mass-bump" (checkout v7 blocks fork-PR checkout on
`workflow_run`, which 4 workflows use, and moved to ESM). Left as-is by design.

### 3. The required check is still being BYPASSED
`CI / build` is a required status check, but safe-push admin-bypasses it on every push (that is HOW
main stayed red for 7+ runs without anyone being forced to fix it). Now that it's green, this is the
moment to stop bypassing — otherwise it silently rots again. Policy call for the operator: enforce the
required check / stop the admin bypass, or keep bypassing knowingly.

### 4. Shared-checkout crowding (cosmetic)
Multiple sessions were pushing to `main` concurrently during this work; safe-push's stash/rebase left a
pile of `safe-push-stash` / `lint-staged` stash entries. Cosmetic — **do NOT clean them**, they may hold
another live session's in-progress work.

## Verification
- Final green run: `gh run view 29618424950` (build = success).
- Local: full `node --test` suite 143/0; `bun test lib/pdf lib/email/blocks` 151/0; `tsc --noEmit` clean;
  registry-identity `--static` OK.
