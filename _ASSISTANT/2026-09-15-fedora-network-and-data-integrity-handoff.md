# 2026-09-15 — Fedora reachability, public/private, and "no new builds until it repairs itself" — HANDOFF

Ricky's words: "I am not continuing these builds that fail, so we need every piece of data in order
before we add more. We need rules, guards and repairs automatic before we do anything." And: "does
that folder have access to fedora? do we get everything off public github and store it on 1 TB SSD?
don't really like everything being public and would like to change that before we fix everything so
it actually runs correctly." He explicitly does **not** want Lenses/MCP/SDK work (see
`wiki/mcp-connector.md`) touched until the above is settled.

**Same-day correction — read this before the credit question below.** Ricky pushed back hard on
"why do we need Anthropic credits, we have Max." The first answer he got (Consumer Terms ban) was
wrong. The second answer this session gave ("explicitly permitted, not a ban") was also incomplete —
a second session working the exact same repo at the same time found the real answer with code-level
evidence. Full citations are in `wiki/pipeline-health.md`'s Facts section, corrected in place rather
than left wrong. The short version, and it's a number, not a legal argument: **measured Anthropic
spend is $6.03 in the last 30 days, $81.42 lifetime.** The key isn't expensive, it hit a zero balance
on a tiny run rate. Separately, routing the *customer-facing* brain rebuild through Ricky's personal
Max login runs into Anthropic's own "not for third parties' products" line — the brain content is
what SWFL Data Gulf sells. That's a real reason to keep the pipeline on the API key regardless of
cost, distinct from the standing 30-day no-new-adoption freeze (`_ASSISTANT/NORTH-STAR.md` priority
5, runs through 2026-09-18) which blocks wiring up `CLAUDE_CODE_OAUTH_TOKEN` for anything right now
anyway.

**Two $0 fixes available today, no fan-out needed:**
1. Add `credit` on the Anthropic console key. At ~$6/month measured run rate this unblocks 16
   workflows for the cost of a coffee, not a real spend decision.
2. Add `claude-sonnet-5` and `claude-opus-5` rows to `RATES` in `refinery/agents/anthropic.mts` —
   those models are logging at $0.00 today and the spend guard can't see them. One commit, $0, a
   repair to an existing guard (not a new adoption, doesn't touch the freeze). This is the concrete
   down payment on "rules, guards and repairs automatic."

**On "should we rebuild everything":** the evidence says REPAIR, not rebuild — 81/100 workflows were
green before SteadyAPI and the credit both died in the same window; that reads like two dead switches
on an otherwise-working fleet, not rotten architecture. Said plainly, not deferred: don't rebuild.
What would change this call: Thread E below finding real REBUILD candidates (a pipeline still
fighting a WAF with no proven alternate source, something with no test and no owner) — those get
scoped individually if found, not folded into one all-or-nothing rebuild.

This is the fast-orientation file. It ends with a fan-out plan for this session (or whoever picks it
up) — each thread below maps to a step already in `wiki/pipeline-health.md`'s Decision-log rebuild
order (0-5), not a new parallel plan. Read `RULE 1.5` in this repo's own `CLAUDE.md` first
(no `git add -A`, overlapping files go through `scripts/worktree.mjs`) and `RULE 0.8` (every thread
reports back n of N, counted, with proof — not a claim). Also read `_ASSISTANT/NORTH-STAR.md` before
dispatching anything: it exists because a past session re-diagnosed instead of executing, and this
handoff is deliberately built to extend the existing rebuild order, not replace it with a new one.

## What's already verified (do not re-derive, just act on it)

1. **Fedora access: none exists today.** Grepped `.github`, `ingest`, `docs`, `_ASSISTANT` for any
   Fedora reference — zero SSH keys, deploy targets, or workflow wiring. The box is reachable only
   as `ssh fedora` from Ricky's own machine on his own network. `wiki/pipeline-health.md` already
   scopes the job precisely: Fedora becomes the residential-IP runner for the four jobs DBPR/Crexi's
   WAFs currently force onto the Windows box (DBPR SIRS, Crexi, Collier official records, Collier
   permits) — **not** a replacement for the GitHub Actions cron fleet, and **not** an LLM-auth
   shortcut either (see the credit correction above).
2. **The repo is public, confirmed live:** `gh repo view ... --json visibility,isPrivate` →
   `{"isPrivate":false,"visibility":"PUBLIC"}`.
3. **No leaked secrets found.** Every `SUPABASE_SERVICE_KEY`-shaped hit in workflow YAML is the safe
   `${{ secrets.X }}` reference pattern. `.env.local` is untracked and correctly gitignored
   (`.gitignore:30`). This is not the exposure problem.
4. **The real exposure problem: `brains/` is the product, and it's public.** 46 files of derived
   insight (the actual thing worth selling — see `wiki/florida-public-records.md`'s "sell the JOIN,
   not the rows" doctrine) are committed and fully readable by anyone at
   `github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/tree/main/brains`, no account needed. Raw
   `data_lake.*` tables are **not** in git — they live in Supabase only.
5. **Going private has a real, already-documented cost.** This repo's own `CLAUDE.md` states GitHub
   Actions is free specifically *because* the repo is public. Flipping to private forces a real
   choice for all 113 workflows: pay for Actions minutes, or migrate execution to self-hosted
   runners. Nobody has pulled GitHub's actual private-repo Actions pricing live yet — Thread B below.
6. **Repo visibility is a structure change.** Global rule: no visibility flip without Ricky's
   explicit word. Nothing here authorizes making that change — only researching the real cost of
   each option so he can decide with numbers instead of a guess.
7. **GitHub flagged 11 Dependabot vulnerabilities on this repo's default branch (2 critical, 4 high,
   5 moderate)** on today's push. Not yet triaged by anyone — Thread G.

## Fan-out plan — each thread serves a step already in pipeline-health.md's rebuild order (0-5)

**Freeze first.** Nothing below unblocks new data sources, the condo SIRS build, or PR #204 /
`/connect` marketing. Those stay parked until the relevant thread reports back proven.

- **Thread A — Fedora reachability runbook (prep only, blocked on Ricky's network) → serves step (3).**
  Can't be executed from a cloud sandbox. Write the exact checklist (commands, expected output, what
  proves success) for: install the GitHub self-hosted runner as a user service, no sudo; confirm
  rootless podman can pull and run a Playwright image; confirm that container reaches DBPR and Crexi
  from the Xfinity residential IP. Hand it to Ricky as a script he runs in one `ssh fedora` session.
- **Thread B — Public-exposure cost model, live-verified → serves the visibility decision (item 3
  under "what needs Ricky").** Crawl GitHub's actual current private-repo Actions pricing (Vendor
  First — do not use training memory) and price out 113 workflows' real monthly minutes against it.
  Separately cost out "keep `brains/` out of the public tree" as its own narrower option: a private
  submodule, a separate private repo for `brains/` only, or gating the read path behind the existing
  account-key auth already built for MCP writes. Report real options with real numbers.
- **Thread C — Turn every manual repair into an automatic one → serves step (2), fleet hygiene.**
  `wiki/pipeline-health.md` already lists what's still manual: credit/429 failures misclassified as
  generic instead of BILLING, three ghost `NEVER_LANDED` registry entries, one signal querying a
  schema-prefixed name PostgREST can't see, a missing `/api/health` route, 22 stale `cron-failure`
  issues with no auto-close. Fix each so it repairs or reports itself — proof is the doctor going
  green on its own, not a claim.
- **Thread D — Settle the open data-integrity contradictions → serves step (1)/(4).** (1) The
  `leepa_comp_sales` contradiction — doctor says `NEVER_LANDED`, the inventory audit says 108,848
  rows exist in `data_lake.leepa_comparable_sales` — one live row count settles it. (2) Confirm the
  pre-SteadyAPI scrape source (`--source scrape`) still parses — one dry-run, unchecked since
  2026-07-01. (3) Before pulling anything from the 75-entry `source_ceiling` list, confirm each
  candidate isn't already landed under a different name.
- **Thread E — Full 113-workflow census → serves the rebuild-vs-repair call above, and confirms it.**
  Every workflow, one row: what it does, last green run, why it's red if it's red, whether it touches
  an LLM call at all. Verify the "16 workflows blocked on credit" number against a full count now
  that the credit question has a corrected answer, and name any REBUILD candidates (still fighting a
  WAF with no proven alternate source, no test, no owner) — that's what would overturn "repair, not
  rebuild" above.
- **Thread F — Measure and document, do NOT wire up, the internal-CI subscription option → serves
  nothing until after 2026-09-18.** The freeze forbids adopting `CLAUDE_CODE_OAUTH_TOKEN` right now.
  What's safe to do today: write down (not implement) what scope this would cover if unfrozen later
  (the repo's own internal dev/CI GHA workflows only, never customer-facing brain content per the
  "not for their products" line), and what unattended-auth-persistence question would need answering
  first (does a subscription login survive a scheduled run with nobody watching, or does it need
  periodic re-auth). Hand Ricky a scoped option for after 09-18, don't build it now.
- **Thread G — Triage the 11 Dependabot vulnerabilities → new hygiene item, not yet in the rebuild
  order; add it as step (2b).** `gh api repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/dependabot/alerts` and
  classify each: patchable now, needs a major-version bump, or false positive. On a public repo this
  isn't optional.

Each thread reports back counted and proven (RULE 0.8) before `wiki/mcp-connector.md`'s Lenses/MCP/
SDK work resumes.

## What needs Ricky, in order

1. **Anthropic console credit** — do this now, it's cheap (~$6/month measured), and it's step (0) of
   the existing rebuild order.
2. **A session on his own network** (`ssh fedora`) to run Thread A's checklist once it exists.
3. **Repo visibility decision**, made with Thread B's real numbers in hand, not a guess.
4. **What "1 TB SSD" actually means to him** — needs one clarifying answer: (a) full self-hosted git
   off GitHub entirely (Gitea/Forgejo on Fedora — a real build, needs a rule-9 discovery comparison
   first, not started), (b) keep code + CI on GitHub but stop `brains/*.md` from being public
   (Thread B's narrower option), or (c) physically relocate the Supabase `data_lake.*` tables onto
   local Postgres on the SSD/Fedora box (a data-migration project, unrelated to visibility).

## What's explicitly parked until the freeze lifts (2026-09-18) or the fan-out reports back

- `wiki/mcp-connector.md` — PR #204, the `/connect` page, any Lenses/MCP/SDK work.
- `wiki/diversification.md` — condo SIRS build, the other four verticals.
- `CLAUDE_CODE_OAUTH_TOKEN` for anything (Thread F is measure-only).
- Any new pull from the 75-entry `source_ceiling` list beyond Thread D's verification pass.

## Where the rest of the context lives

- `wiki/INDEX.md` — this repo's own wiki, start here.
- `wiki/pipeline-health.md` — the full dated rebuild order this handoff builds on, corrected in
  place today rather than left wrong.
- `_ASSISTANT/NORTH-STAR.md` — the 5 standing priorities; read before dispatching anything new.
- `_RESEARCH/agent-behavior/2026-09-15-max-subscription-vs-api-key-for-pipeline-calls-evaluation.md`
  — the concurrent session's code-level research this correction is built on.
- `_ASSISTANT/2026-09-15-mcp-diversification-and-pipeline-handoff.md` — yesterday's handoff, now
  partially superseded: the MCP/diversification work it describes is paused by this one.
- `chief-of-staff` (sister repo) — the business-decision layer; same-date reasoning on the
  public/private tradeoff lives there too.
