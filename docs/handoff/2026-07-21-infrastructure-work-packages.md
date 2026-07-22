# Infrastructure Playbook — Work Packages (2026-07-21)

**What this is.** The dispatch table for `docs/standards/infrastructure-playbook.md`. Six
packages, each scoped so a fresh session can execute it cold, with file ownership declared so
two sessions do not collide.

**What this is not.** A second copy of the playbook. Every package points at its layer and
stops — the evidence, the vendor facts, and the DON'Ts live in the playbook and are not
duplicated here. Read your layer there first. Open obligations live in `checks`, not here.

**Why six and not thirteen.** The playbook's volume lens is the discriminator: eight layers are
STANDING (maintained, no end state) and two are **NO-OP BY DESIGN**. Dispatching thirteen
sessions would send eight to do nothing and bait two into "fixing" the no-ops the playbook
explicitly says never to touch. The dispatchable set is the work order plus Layer 7's ratchets.

---

## Dispatch table

| # | Package | Layer | Lane | Owns | Blocked by |
|---|---|---|---|---|---|
| A | Egress + revalidate triage | 10 | code | `app/**/page.tsx` (public report pages) | internal gate — read the bill first |
| B | Backup posture verification | 13 | **operator** | `SESSION_LOG.md`, new dump script | nothing |
| C | WAF rate-limit ceiling | 9 | **operator** | nothing in repo | nothing |
| D | Error tracking | 12 | code | `package.json`, `bun.lock`, `next.config.ts`, `sentry.*.config.ts`, `instrumentation-client.ts` | nothing |
| E | Authz perimeter sweep | 8 | code | `app/api/**/route.ts` | **D** (error-leak half only) |
| F | CI ratchets | 7 | code | `knip.jsonc`, `.github/workflows/*.yml` | nothing — but internally sequential |

Run order when serial (playbook's own ranking): **A → B → C → D → E → F**.
Safe to run simultaneously: **A ∥ E ∥ F**, and **B ∥ C** (both operator-lane, no repo files).

---

## Collision matrix — read before dispatching two at once

Four real serialization points. Everything else is disjoint.

1. **`package.json` / `bun.lock` — hard lock, package D only.** D is the only package adding a
   dependency (`@sentry/nextjs`). Pre-push Gate 1 requires `bun install` + `git add bun.lock` in
   the same push. While D is live, no other session may touch `package.json`. This is not
   advisory — a concurrent lockfile edit reds the gate for whoever pushes second.

2. **D before E's error-leak fix.** The playbook states it outright: the fix returns a generic
   message to the client and sends the detail *somewhere*, and that somewhere is Layer 12. Run
   E's route-ownership sweep in parallel with D freely — but hold E's
   `sa0718_unhandled_internal_error_messages_passed_s` fix until D has landed.

3. **`SESSION_LOG.md` — serializes at push, always.** Every package appends a top-of-file entry
   before pushing. Two sessions pushing in the same window conflict on the first line of the
   file regardless of what else they touched. Per RULE 1.5, overlapping packages go in a
   worktree via `scripts/worktree.mjs`; the SESSION_LOG entry still lands one at a time.

4. **A and E are disjoint by file type, despite the naming.** A edits **pages**
   (`app/r/`, `app/p/[id]/page.tsx`, ZIP/community report pages). E edits **route handlers**
   (`app/api/**/route.ts`). Note the trap: `app/r/` (public reader pages, package A) and
   `app/api/r/` (one service-role route, package E) are different trees. Path-check before
   editing, don't pattern-match on `/r/`.

`next.config.ts` is owned by D alone (Sentry wraps the config export). A does not touch it.

---

## A — Egress and revalidate triage (Layer 10)

**Lane:** code. **Do this first** — the only gap costing money.
**Check:** `egress_read_the_actual_bill` (due 07/22/2026).

**Internal gate, non-negotiable:** step 1 is reading the real billed number. Every egress figure
quoted to date is payload arithmetic — there is no `SUPABASE_ACCESS_TOKEN`, so served bytes have
never been read. Mint the token with `analytics_usage_read`, run
`node scripts/supabase-egress-read.mjs`. Do not begin the revalidate pass against an estimate.

Then triage force-dynamic into the playbook's three buckets. Verified surface as of 07/21/2026:
**38 pages** and **35 route handlers** export `dynamic`; about eight surfaces carry `revalidate`.
The win is the public report/reader bucket. Set `revalidate` to the cadence in
`ingest/cadence_registry.yaml`, not to a guess.

Keep `scripts/check-lake-reads.mts` armed — no new exceptions during this work.

**Done when:** the billed number is known before AND after, and the delta is in `SESSION_LOG.md`.
The delta is the only proof this package did anything.

---

## B — Backup posture verification (Layer 13)

**Lane:** operator action. A session cannot click the Supabase dashboard.
**Cost:** ~15 minutes. Cheapest risk reduction on the page.

**Operator does:** open Database → Backups, answer three questions — what plan is this project
on, are daily backups present and recent, is PITR on or off.

**Session does:** record the answers in `SESSION_LOG.md`, then execute whichever branch the
answer selects (playbook steps 2–6), and draft the pre-migration dump step and the Storage
export decision. Rollback covers a bad deploy; nothing currently covers a bad migration.

**Do not buy PITR before the plan question is answered** — RULE 11 applies squarely, and the
playbook sizes that decision against the user-generated tables only, not the whole database.

**Done when:** plan and backup state are in `SESSION_LOG.md`, the Storage decision is recorded,
and a restore has been rehearsed once so the real recovery time is known.

---

## C — WAF rate-limit ceiling (Layer 9)

**Lane:** operator action. Vercel dashboard, no repo files.
**Check:** `api_b_open_rate_limit` (14d untouched). **Cost:** $0.50 per million allowed requests.

Three rules — `/api/b/`, `/api/mcp`, `/api/assistant`. The assistant one matters most: it spends
Anthropic tokens per call, so an unthrottled loop is a direct billing-DoS.

**Set the action to `Log` first, not 429.** Our own uptime probes and the smoke suite hit these
endpoints — watch the real traffic shape for a few days before denying. Then flip to 429, set
above the in-code 60/60s so the code layer trips first.

**Session does:** close the check with the rule id and the Firewall overview screenshot.

---

## D — Error tracking (Layer 12)

**Lane:** code. **Holds the `package.json` lock — announce it before starting.**
**Check:** `selfheal_error_spike_parked`.

Recommendation is Sentry over Vercel Drains (Drains require Pro — verify the plan first, and
they hand you a firehose you then have to build alerting on). Confirmed against `package.json`:
no Sentry, no OTel, no PostHog, no log drain today.

All three runtimes get config — edge is not optional, `middleware.ts` does real work.

Two things the playbook flags that are easy to skip:
- **Scrub before sending.** Disable user data and HTTP bodies. We handle contact lists, client
  uploads, and a demo account that is fictional but looks exactly like real PII.
- **`tracesSampleRate` from an env var.** Sentry's 0.1 production default is a hyperscaler
  default. Confirm against the current free-tier event quota, then set it deliberately.

ONE alert to start — new-issue-in-production. No dashboard. This layer's failure mode is noise.

**Done when:** a deliberate uncaught exception in a preview deploy produces an alert, and the API
response for it carries no internal detail.

---

## E — Authz perimeter sweep (Layer 8)

**Lane:** code. Largest package, most likely to sprawl. **Do not start it the same week as
anything else on this list.** Tranches, not one sitting.

**Read the playbook's framing before touching anything.** The advisor output looks alarming and
is not: RLS-on-no-policy means those tables deny `anon` and `authenticated` outright. The
`rls_enabled_no_policy` advisor lines are **expected to remain** under the recommended posture —
they are not the completion signal, and clearing them is not the goal.

**Step 1 is a written decision, not code.** Ratify posture (a) — service-role plus app-code
authz — in writing. Then make it rigorous. Do not enable policies table-by-table while routes
still use service-role; a policy service-role bypasses is theater, and it produces exactly the
half-built state `project_activity` is in now.

**⚠ Scope discrepancy — verify before planning tranches.** The playbook says "82 routes." Live
repo, 07/21/2026: **120** total `route.ts` under `app/api`, **64** importing service-role
directly, **160** files across `app/` + `lib/` touching service-role. The 82 does not reconcile
with any of these. Re-count and correct the playbook's Layer 8 EVIDENCE line in the same commit.

Indicative tranche sizes by service-role importers, highest risk first. These come from one grep
on the `service-role` literal — a route reaching it transitively through a wrapper would not
match, so treat them as the numbers to reconcile, not as the settled count:

- `projects` 16 · `email` 9 · `deliverables` 9 · `mls` 4 · `email-lab` 4 · `stripe` 3 · `segments` 3
- then the long tail: `charts` 2, and 15 areas with 1 each (`contacts`, `claim`, `social`,
  `insiders`, `webhooks`, `cron`, `templates`, `unsubscribe`, `waitlist`, and others)

Per route: does it resolve the caller, and does it verify the caller owns the row it is about to
read or mutate?

Two named fixes that are NOT the sweep and can ship independently:
- `sa0718_unhandled_internal_error_messages_passed_s` — one fix, not a sweep. **Blocked by D.**
- `email_lab_project_activity_rls_insert_missing` — `project_activity` has had a SELECT policy
  and no INSERT policy since 06/19/2026, so every `logActivity` call has been silently failing.
  Add the policy or route through service-role, and wire the AI-build route that never calls it.

Batch the low-severity pair last: `search_path` on the 14 flagged functions, `vector` extension
out of `public`.

---

## F — CI ratchets (Layer 7)

**Lane:** code. Four one-line flips, each with an evidence run behind it.

**Internally sequential by the playbook's own rule — one at a time, never as a batch, so a red is
attributable.** This is the whole discipline of this package; batching them destroys the signal.

1. **knip to phase 2** — triage the orphan surface (the ~14-file estimate above was stale; the live
   07/21 surface was 32 files — re-run knip rather than trusting either number), then flip
   `rules.files` to `error`.
2. **Registry identity to live gating** — `registry_identity_live_gating`. Advisory on purpose:
   `redfin_city_swfl`, `dbpr_re_licensees`, and `leepa_parcel_zip` are genuinely red on the
   current snapshot. Flip to `--live --gate` only after one green confirm, or you red `main` on
   day one — the exact false-red disease this build exists to kill.
3. **Factuality gate to blocking** — `factuality_gate_blocking_flip`. Flip `continue-on-error` to
   false after a clean warn-first stretch; record the evidence run ids.
4. **Visual regression into CI** — `visual_regression_ci_job`, `visual_regression_prepush_wiring`,
   `storybook_visual_regression_gap`.

---

## Ground rules — every package

- No autonomous push. Commit, show the log, ASK. Approval is per push, never carried forward.
- `git add <explicit paths>` only, never `-A`. Overlapping packages go in a worktree
  (`scripts/worktree.mjs`), never `git push origin wt/*`.
- SESSION_LOG entry before every push, in the same push. Never rewrite a past entry.
- No silent deferrals (RULE 2.4) — a parked finding gets a `checks` entry the same session. A
  SESSION_LOG sentence is not a deferral, it is forgetting on a delay.
- Vendor facts in the playbook were fetched 07/21/2026. **Re-verify prices and plan tiers via
  crawl4ai before acting on them** — they drift, and a stale tier ships a wrong decision.
- When a package lands, edit its layer's STATUS line in the playbook in the same commit as the
  code. The playbook is a status document; do not let it drift from what shipped.
