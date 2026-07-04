# 20 — Wire dead-code CI (knip) (P5)

- **Status:** ⬜ Not started
- **Owner:** SESSION
- **Source:** autopsy §9.5

## What

Built-and-never-imported modules accreted for weeks (see task 10). Wire `knip` so orphan modules get
caught at **PR time** instead of piling up. crawl4ai research (in the autopsy) recommends `knip` — one
config + a CI step.

## Steps

1. Verify we don't already have knip (RULE 0.5 — probe `package.json` first).
2. Add a `knip` config tuned for this repo (allowlist the intentional-parked grep-0 files the autopsy
   named: `map-placeholder.ts`, `lib/social/recipients.ts`, `Waitlist.tsx`, `PhotopeaModal.tsx`,
   `lib/email/snicklefritz/targets.ts`).
3. Add a CI step (report-only first run, then failing) so PRs surface new orphans.
4. Lockfile gate: `package.json` change → `bun install` + stage `bun.lock` in the same push.

## Done when (live proof)

- A PR that adds an unimported module makes the knip CI step **fail** (or comment); the intentional
  allowlist does not trip it.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
