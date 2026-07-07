# Self-Healing Deploy Bots — implementation plan

**Date:** 2026-07-07
**Status:** plan — approved shape (brainstormed this session), NOT built.
**Parent research:** in-session crawl4ai pass over Vercel rollback/promote/checks/rolling-releases + GitHub Actions billing + claude-code-action. Evidence in SESSION_LOG.
**Origin:** operator asked how `paperclipinc/openclaw-operator` (a Kubernetes operator for a different product) maps to caring for our Vercel site + creating loops. It doesn't port; these are the equivalent bots on our stack.

---

## 0. What this is

A small fleet of deploy-safety bots that keep the live site in a known-good state and pull Claude in to diagnose, all on **free GitHub Actions + a Vercel token**. Three buildable now, three parked as roadmap. Every bot is the same shape: **GitHub Actions (trigger) → our script (logic) → Vercel REST (actuator) → guards.**

The one paid piece is bounded Claude inference for the triage bot. Everything else costs nothing beyond the Pro plan we already pay for.

---

## 1. Ground truth (from code probe, RULE 0.5 — not memory)

- `.github/workflows/smoke-prod.yml` — fires on `deployment_status` where `state=='success' && environment=='Production'`; runs `bun scripts/smoke-prod.mts`. **Post-go-live** (Vercel has already aliased the deploy before smoke runs).
- `scripts/smoke-prod.mts` — a `SMOKE_TESTS[]` catalog of 9 HTTP assertions + a `MANUAL_ONLY[]` list; `Promise.allSettled`, exits 1 on any failure, stamps passing checks via `scripts/check.mjs update`.
- `.github/workflows/claude-code-automation.yml` — `anthropics/claude-code-action@v1`, triggers on issue opened/assigned or an `@claude` comment; has `contents: write` + `pull-requests: write` + `issues: write`.
- `.github/workflows/heal-cron-failure.yml` — leveled cron heal (L0 rerun capped at `run_attempt===1`, L2 Claude *diagnosis only*, "the LLM never writes code"); kill-switch repo vars. **Pattern to mirror.**
- `scripts/check.mjs` — Supabase `checks` ledger: `open <project> <key> "<label>"` (create-only, fails if exists), `update`, `close`, `list`.
- **`VERCEL_KEY` is a repo secret + in `.env.local`, but wired into ZERO workflows** (grep-confirmed). And it is **under-scoped**: authenticates as user `ethanrickyjrjr-wq` but `Project not found` on project read, `forbidden` on deployment list. It cannot roll back as-is.
- Plan tier = **Pro** (read from billing dashboard 07/07/2026): canary (Rolling Releases, one project), Observability Plus, and Drains are **included**.
- Vercel Checks API (gate-before-live) requires **OAuth2** (create/update check 400s without it) — needs a registered integration, not a plain token. Plan tier does not unlock this.

Verbatim command reference in §8.

---

## 2. BUILD 0 — Vercel rollback token (BLOCKER for Build B)

**Owner:** operator (I cannot create accounts/tokens — hard rule). I verify + wire.
**Why first:** the rollback bot is void without a token that can POST `/v1/projects/{id}/rollback/{id}`. Existing `VERCEL_KEY` can't.

Steps:
1. Operator mints a token at `https://vercel.com/account/tokens`, scoped to the `ethanrickyjrjr-wqs-projects` team with deploy/write on `brain-platform`.
2. `gh secret set VERCEL_ROLLBACK_TOKEN -R ethanrickyjrjr-wq/SWFL-Data-Gulf` (Gate 3 step 1).
3. I verify scope with a safe read (`GET /v6/deployments?...&target=production`) — must return deployments, not `forbidden`.

**Done-check (live, operator-run):** `selfheal_vercel_rollback_token` — token reads production deployments successfully.

---

## 3. BUILD A — Preview-smoke (smallest, first, no dependency)

**Goal:** run the smoke assertions on **Preview** deploys too, so bugs die in a PR preview before prod.
**Owner:** `general-purpose` agent, or direct this session (recommended — ~1 file).
**Files:** `.github/workflows/smoke-prod.yml` (+ maybe a small `--base` plumb in `scripts/smoke-prod.mts`).

Steps:
1. Broaden the `if:` to also accept `environment=='Preview'`.
2. Pass the deployment-specific URL from the `deployment_status` payload as `--base` (smoke already accepts `--base`), so Preview asserts against the preview URL, not prod.
3. On Preview, do NOT stamp prod checks (guard the `stampCheck` path to prod-only).

**Done-check (offline, agent-verifiable):** workflow YAML valid; `bun scripts/smoke-prod.mts --base <url> --dry-run` runs; unit assertion that Preview events target the preview URL.
**Done-check (live, operator-run):** `selfheal_preview_smoke_live_verify` — a PR preview deploy triggers a smoke run against its preview URL.

---

## 4. BUILD B — Rollback bot (depends on Build 0)

**Goal:** on a *confirmed critical* red smoke, auto-roll-back the bad prod deploy, then open an incident.
**Owner:** `general-purpose` agent, or direct this session (~2 files).
**Files:** new `.github/workflows/rollback-on-red.yml`; refactor `scripts/smoke-prod.mts` to tag each test `critical` vs `soft`; new `scripts/rollback-deploy.mts` (the curl actuator + guards).

Design (locked forks from brainstorming):
- Split `SMOKE_TESTS` into **critical** (homepage 200, `/api/assistant` reachable) vs **soft** (everything else).
- **Soft** red → open issue only, never roll back.
- **Critical** red → re-run *only critical* assertions once (flake filter) → still red → roll back.
- Actuator: `POST /v1/projects/$PROJECT_ID/rollback/$DEPLOYMENT_ID` with `VERCEL_ROLLBACK_TOKEN`.
- Handle the confirmed gotcha: **rollback disables auto-assignment of production domains** — the loop is not "done" at rollback; it's done when a fix is promoted forward (`vercel promote`). The plan states this; the bot logs it loudly in the incident.

Guards (all free):
- `SELFHEAL_ROLLBACK_ENABLED` repo variable kill-switch (mirror heal-cron's pattern).
- Rollback capped once per deploy (concurrency group on the deploy SHA).
- Least-privilege `VERCEL_ROLLBACK_TOKEN` (Build 0), never printed.
- The rollback's own resulting deploy event must not re-trigger the bot.

**Done-check (offline):** unit tests — critical/soft split correct; confirm-retry only fires on critical; rollback step is skipped when `SELFHEAL_ROLLBACK_ENABLED!=true`; the actuator builds the right URL. `bun test` green.
**Done-check (live, operator-run):** `selfheal_rollback_bot_live_verify` — ship a deliberately-broken deploy (or force a critical assertion red), observe the rollback fire + the previous good deploy served + the incident issue open.

---

## 5. BUILD C — Claude auto-triage (depends on Build B for the trigger)

**Goal:** the rollback/incident bot opens an issue with the failure output + `@claude`; Claude triages severity/cause first, drafts a fix PR only if the cause is in-repo code.
**Owner:** `general-purpose` agent, or direct this session (~1 workflow edit + a prompt file).
**Files:** the incident-issue step in `rollback-on-red.yml`; a triage prompt; reuse existing `claude-code-automation.yml`.

Design (operator directive: "determine how big the problem is first", guard everything auto):
- Claude's FIRST action is classify: `infra | transient | data | in-repo-code` + severity. ("How big is the problem" as a literal first step.)
- Only `in-repo-code` → open a **draft** PR. Else comment root cause + label, stop.
- Guards: draft-only (never merges — human merges), spend cap via the existing tripwire, one invocation per issue, least-privilege `GITHUB_TOKEN`.

**Done-check (offline):** the incident step emits a well-formed `@claude` issue with the failure log + classification prompt; dry-run of the prompt renders.
**Done-check (live, operator-run):** `selfheal_claude_triage_live_verify` — a real incident issue drives a Claude classification comment; a code-caused one yields a draft PR; an infra-caused one yields comment-only.

---

## 6. Auto-dispatch — what's possible, and the honest boundary

The operator asked to "auto send out the next agent when one is done." Two truths:

- **Possible for the build+test stage only.** An agent can confirm *offline* done (tests green, YAML valid, build compiles). A `Workflow` pipeline could run Build A → B → C in sequence, each in an isolated worktree, advancing when the prior stage's offline done-check passes.
- **It cannot cross into live.** No agent can confirm a bot *works* — that needs a real bad deploy observed in prod, which is **operator-run** (`feedback_checks-prod-evidence-not-dev-attestation`). And no autonomous push to `main`. So between every build the operator reviews the diff, pushes, and runs the live-verify. "Auto-dispatch" means the *building* chains; the *proving* does not.

**Recommendation (proportion, RULE 0.6):** these are three ~1–3 file edits that fit one session's context. An agent-orchestration pipeline costs more than the task. Fastest path = **I build all three directly this session**, one at a time, offline-verifying each, and hand you reviewable diffs + the live-verify steps. The multi-agent pipeline is available if you want it, but I'd advise against it for work this small.

---

## 7. Parked roadmap (checks opened this session — RULE 2.4)

Not built now; each carries a `checks` entry so it can't be lost to a log sentence:

- **Gate-before-live** (`selfheal_gate_before_live_parked`) — the strictly-better protection (bad deploy never serves), but needs a registered OAuth2 Vercel integration + a hosted receiver. Heavier lift; revisit after Builds A–C prove out.
- **Canary** (`selfheal_canary_parked`) — Rolling Releases, included on our Pro plan (one project). Enable in project settings; `vercel rolling-release start/complete`. Softens blast radius on top of rollback.
- **Error-spike bot** (`selfheal_error_spike_parked`) — now viable since Observability Plus + Drains are included on Pro; query error/latency, alert or rollback.

---

## 8. Verbatim command reference (crawl4ai-verified 07/07/2026)

```
# roll back prod to the previous deployment (REST — no CLI install)
curl -X POST "https://api.vercel.com/v1/projects/$PROJECT_ID/rollback/$DEPLOYMENT_ID" \
     -H "Authorization: Bearer $VERCEL_ROLLBACK_TOKEN"

# CLI equivalents (if we npm i -g vercel on the runner)
vercel rollback [deployment-id or url]     # Instant Rollback, re-aliases previous prod
vercel rollback status                     # poll pending rollback
vercel promote [deployment-id or url]      # UNDO a rollback; re-enables auto-assignment

# canary (Pro, included) — use start/complete in CI, NOT promote
vercel rolling-release start ; vercel rolling-release complete
```

- CI auth: `VERCEL_TOKEN` env (preferred over `--token`, which leaks in process lists) + `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`; `--non-interactive` is default under agents.
- GitHub Actions: free on public repos; 2,000 free min/month on private (blocks, never surprise-bills, with no card on file).
- Vercel Checks API create/update require **OAuth2** — plain token 400s.

---

## 9. Definition of done (whole plan)

- Build 0 token minted + scope-verified; wired into the rollback workflow env (Gate 3).
- Builds A, B, C each: offline tests green + operator-run live-verify check closed on real prod evidence.
- Three parked checks open with clear labels.
- SESSION_LOG entry + `_AUDIT_AND_ROADMAP/build-queue.md` synced on the push that lands each build.
- No autonomous push; no live-verify closed on "code looks right."
