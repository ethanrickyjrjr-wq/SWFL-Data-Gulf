---
title: Fedora and public exposure
type: overview
status: active
updated: 2026-09-15
sources:
  - _ASSISTANT/2026-09-15-fedora-network-and-data-integrity-handoff.md
  - _ASSISTANT/2026-09-15-fedora-runner-runbook.md
  - chief-of-staff:wiki/machine-stack.md
  - chief-of-staff:wiki/swfl-pipeline-health.md
  - chief-of-staff:research/toolwatch/TOOLS.md
---
# Fedora and public exposure

**Status (09/15/2026):** "the Spectre" and "the Fedora box" are the same machine. It's not yet
wired as a GitHub Actions runner. Going private would cost ~$9-15/month, not a scary number.
`brains/` being publicly readable is a separate, narrower problem with a clean fix (private
submodule) that doesn't require going private.

## What it is

Three threads Ricky asked about together: (1) what the Fedora/Spectre box is and does, (2) whether
this repo should go private, and (3) whether `weekly-dep-scan`/`weekly-platform-health` (Claude
Code cloud routines, not GitHub Actions) are actually being looked at.

## Facts

- 09/13/2026 — Ricky named a second physical machine, an **HP Spectre x360 15-df0033dx** laptop
  (Intel i7-8565U, 16GB RAM, CPU-only — the MX150 on its spec sheet doesn't show up live), running
  **Fedora 44**, live and SSH-reachable as `ssh fedora` since 09/13–14. "The Spectre" and "the
  Fedora box" are the same machine, used interchangeably in Chief Of Staff's wiki from 09/15
  onward. (source: `chief-of-staff:wiki/machine-stack.md`, `chief-of-staff:research/reopen/
  2026-09-13/W2-M1-fedora-spectre.md`)
- 09/15/2026 — Its job: an always-on **residential-IP GitHub Actions runner** for the 2 pipelines
  currently pinned to Ricky's offline Windows self-hosted runner (`dbpr-sirs-monthly.yml`,
  `ingest-crexi-listings.yml`) plus Collier official records and (maybe — see runbook) Collier
  permits. It is explicitly **not** meant to replace the GHA cron fleet, and explicitly **not** an
  LLM-auth shortcut (`claude -p` on the Max subscription is against Anthropic's Consumer Terms for
  a product's customer-facing content — the API key is the only legal path for pipeline calls).
  (source: `chief-of-staff:wiki/swfl-pipeline-health.md`, `_RESEARCH/agent-behavior/
  2026-09-15-max-subscription-vs-api-key-for-pipeline-calls-evaluation.md`)
- 09/15/2026 — **Not yet wired.** Two of the four target pipelines already have
  `runs-on: [self-hosted, swfl-local]` in their workflow YAML — reuse that label, don't invent a
  new one, but the offline Windows runner must be confirmed dead/removed before Fedora registers
  under the same label, or jobs can nondeterministically land on the dead box.
- 09/15/2026 — **The runbook is written**: `_ASSISTANT/2026-09-15-fedora-runner-runbook.md`.
  Grounded in the actual pipeline code (all 4 use crawl4ai in-process via Playwright, not a
  container — podman is documented as a fallback only) and live GitHub docs (self-hosted runner
  install requires a per-repo token generated on the UI, no static version-pinned command exists;
  `svc.sh install` requires sudo unconditionally, so the runbook uses a hand-written
  `systemd --user` unit instead). Run order: native venv setup → connectivity test (each
  pipeline's own `--dry-run`, not curl — 3 of 4 endpoints give misleading raw HTTP responses) →
  runner install → register/scope. One open question the runbook surfaces: Collier permits'
  own code comment says Akamai blocks by TLS/JA3 fingerprint "from any IP, datacenter and
  residential" and that `UndetectedAdapter` already defeats it on `ubuntu-latest` today — so it
  may not actually need Fedora, unlike the other 3. Cannot be executed from a cloud sandbox; needs
  one `ssh fedora` session on Ricky's own network.
- 09/15/2026 — **toolwatch is genuinely live**, not stale: `chief-of-staff:research/toolwatch/
  TOOLS.md` polls every 6h (00:40/06:40/12:40/18:40 local), last poll today 16:41 UTC, 7/7
  controls, 24/24 feeds ok, committed from the Fedora box each time. Confirmed via 5 consecutive
  commits landing right on the 6h cadence.
- 09/15/2026 — **`wiki/tool-discovery.md`'s core-stack review date is currently unbacked.** Global
  CLAUDE.md claims the TypeScript/Deno/React/Supabase/Vercel stack has a review date of
  12/13/2026 "backed by" a comparison on that page. The page's own ledger row says
  `| Core stack... | not counted | habit until compared | 2026-12-13 |` and its Open Questions
  section says the comparison "has never been done." The date is a due date, not evidence a
  comparison happened.
- 09/15/2026 — **Chief Of Staff already had a same-day, more complete diagnosis** of this repo's
  Anthropic-credit outage, SteadyAPI 429s (dead since 08/14, Ricky's own words: "Forget the steady
  api!!!!"), and the Fedora-as-runner plan — none of which had made it into brain-platform's own
  docs before today. (source: `chief-of-staff:wiki/LOG.md`, `chief-of-staff:wiki/
  swfl-pipeline-health.md`)

## Public-repo exposure — `brains/`

- 09/15/2026 — `brains/` (46 files, the actual sellable derived-insight product) is committed
  directly to this public repo and readable with no login at `github.com/ethanrickyjrjr-wq/
  SWFL-Data-Gulf/tree/main/brains`. `daily-rebuild.yml` commits fresh content there every day —
  this is an ongoing mechanism, not a one-time accident. `lib/fetch-brain.ts` is the one runtime
  chokepoint (`fs.readFile` off `process.cwd()/brains`) that every serving path funnels through.
- 09/15/2026 — **Three existing auth mechanisms on `/api/mcp`, none of which gate reads.**
  `swfl_fetch`/`swfl_reconcile` are deliberately keyless by product design (mcp-connector.md:
  "connect-once, no login"; PR #204 adds a 15/month rate cap for keyless callers instead of
  gating). Gating them would contradict that same-day product decision.
- 09/15/2026 — **Recommendation: a private git submodule for `brains/` only**, not a separate
  pulled-in repo, not API-gating. A submodule occupies the identical `brains/` path, so
  ~25 code sites that read it (chokepoint + refinery build pipeline + CI path filters) need zero
  changes; a separate-repo-with-CI-pull would need ~20 sites independently rewired with no single
  enforcement point (Vercel build command, every GHA workflow, local dev, all separately). API-
  gating doesn't touch the actual exposure (GitHub's own repo browser / `raw.githubusercontent.com`
  / `git clone`) — it closes a different, unauthenticated-API door that nobody has ever actually
  used to get this content.
- 09/15/2026 — **Hard ceiling on all three options**: none removes `brains/*.md` content already
  in this repo's git history. Every daily-rebuild commit that has ever landed is retrievable
  forever via `git log`/`git show` by anyone who's already cloned. Only a history rewrite
  (filter-repo/BFG + coordinated force-push) or going fully private removes that — out of scope
  here, a separate, bigger, disruptive call.
- 09/15/2026 — **Sign-off required**: creating a new private repo (options 1/2) triggers the
  global "new repo needs Ricky's word" rule regardless of diff size; option 3 (API-gating) touches
  live `/api/mcp`, on this repo's own ASK-FIRST list.

## Private-repo cost — the real number

- 09/15/2026 — **GitHub Actions pricing, live-verified** (crawl4ai against docs.github.com,
  confirmed real content not nav chrome): Free plan 2,000 min/month included, Pro/Team 3,000,
  Enterprise Cloud 50,000. Linux (`ubuntu-latest`) overage: **$0.006/min**. Every job rounds up to
  the nearest whole minute, no matter how short.
- 09/15/2026 — **109 of 111 workflows run on `ubuntu-latest`**; 0 on Windows/macOS; 2 on the
  Windows self-hosted runner (always free, any repo visibility).
- 09/15/2026 — **Estimated current usage: ~4,433 GH-hosted Linux minutes/month** (real range
  ~4,400–5,200, skewed up). Built from `gh run list` job-level detail, not top-line run duration —
  self-hosted runs excluded entirely (queue-wait isn't billed execution time); `nightly-chain.yml`
  counted once as a 7-job fan-out (13 min/run × 60 runs/month = 780 min) instead of triple-counting
  its 3 embedded sub-workflows; `log-cron-incident.yml`'s sheer firing volume (~842×/month) makes
  it the single largest line item at 757 min/month, not any one pipeline's execution cost;
  `supabase-metrics-scrape.yml` bills 720 min/month (~16% of the whole repo) for ~4 minutes of real
  hourly-scrape compute, purely from per-job rounding.
- 09/15/2026 — **Gross cost if private: ~$26.60/month** (range ~$26-31) before any included quota.
  Net overage: **~$14.60/month on GitHub Free, ~$8.60/month on Pro/Team.** Which plan the account
  is on wasn't resolvable from this session's `gh` token scope — a 10-second check at
  github.com/settings/billing settles it. Storage (artifacts/cache allowances) not measured, a
  real but unmeasured second line item.
- 09/15/2026 — This is an input to the visibility decision, not the decision. The number itself
  says going private for cost reasons alone is cheap either way — the `brains/` exposure problem
  above has its own cleaner fix regardless of what Ricky decides here.

## `weekly-dep-scan` / `weekly-platform-health` — genuinely unresolved

- 06/27/2026 — `SESSION_LOG.md:28674-28683` records these as new Claude Code **cloud routines**
  (not GHA, not the session-local `CronList` mechanism): `weekly-platform-health` (Mon 9am ET),
  `weekly-dep-scan` (Mon 10am ET), "health report results landing at claude.ai/code/routines."
- 09/15/2026 — Exhausted every in-repo angle: full-repo grep (both this repo and Chief Of Staff)
  for either literal name finds only that one setup line, ever, in 2.5 months of SESSION_LOG; no
  later entry references either firing again; `gh issue list`/`gh pr list` (both repos, full
  history) show nothing bot-shaped after that date. `deptry.yml` is confirmed a real, separate,
  currently-green GHA check on `ingest/**` pushes — distinct from `weekly-dep-scan`, not the same
  mechanism.
- **This is genuinely unverifiable from inside any session.** Routine results land at
  claude.ai/code/routines, a surface no session tool can query. Absence of evidence in the repo is
  consistent with either "dead" or "quietly healthy and never posting anywhere we'd see it."
  **Ricky needs to check claude.ai/code/routines directly** — is either routine listed, does it
  show run history.

## Decisions

- 09/15/2026 — **SUPERSEDED same day, see below.** ~~Ricky pushed back on "why do we need
  Anthropic credits, we have Max" — settled: measured spend is $6.03/30d, $81.42 lifetime; the fix
  is adding console credit (~$6/month rate)~~ — this was this repo's own conclusion earlier today
  and it is wrong as a course of action: Ricky rejected it again, explicitly, after it was
  re-raised (this is the 4th+ documented instance since the original 07/26/2026 decree — see
  `_ASSISTANT/STRIKES.md` shape `re-suggested-anthropic-api-credits-after-refusal`, guard now
  built as CLAUDE.md RULE 3 C2b: never recommend Anthropic credit top-up again, for any pipeline).
- 09/15/2026 — **Standing decision, do not re-litigate**: LLM-touching pipeline legs
  (`city_pulse` distill, `corridor_pulse` distill, `narrative-bake`, `factuality-gate`) that hit
  the credit wall stay **parked**, not funded. The Consumer-Terms objection to routing them
  through the Max subscription is real and already researched
  (`_RESEARCH/agent-behavior/2026-09-15-max-subscription-vs-api-key-for-pipeline-calls-
  evaluation.md`), so the actual resolution is still open — author affected content interactively
  in a Max session (the Issue 001 pattern, 07/26/2026 decree) or redesign the pipeline leg to not
  need an unattended LLM call. Neither is done yet; this page previously said "add credit" and
  that line was wrong.

## Open questions

- Repo visibility (public/private) — Ricky's call, with real numbers now in hand.
- `brains/` exposure fix — which option (submodule recommended), needs Ricky's go-ahead to create
  the new private repo.
- Whether Collier permits genuinely needs Fedora or already works from `ubuntu-latest` — one
  `--dry-run` on the existing pipeline would settle it before wiring a 4th job onto the new runner.
- `weekly-dep-scan`/`weekly-platform-health` status — Ricky checks claude.ai/code/routines.

## Related

- [Pipeline census](pipeline-census.md) — the residential-IP problem these 2-4 pipelines share
  with the rest of the fleet's red rows
- [Pipeline health](pipeline-health.md) — the dated rebuild order
- [MCP connector](mcp-connector.md) — the existing auth mechanisms referenced above
- `_ASSISTANT/2026-09-15-fedora-runner-runbook.md` — the executable checklist
- `chief-of-staff:wiki/machine-stack.md`, `chief-of-staff:wiki/swfl-pipeline-health.md`,
  `chief-of-staff:wiki/tool-discovery.md`
