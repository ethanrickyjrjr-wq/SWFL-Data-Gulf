# 2026-09-15 — Fedora reachability, public/private, and "no new builds until it repairs itself" — HANDOFF

Ricky's words: "I am not continuing these builds that fail, so we need every piece of data in order
before we add more. We need rules, guards and repairs automatic before we do anything." And: "does
that folder have access to fedora? do we get everything off public github and store it on 1 TB SSD?
don't really like everything being public and would like to change that before we fix everything so
it actually runs correctly." He explicitly does **not** want Lenses/MCP/SDK work (see
`wiki/mcp-connector.md`) touched until the above is settled.

This is the fast-orientation file. It ends with a fan-out plan for this session (or whoever picks
it up) to dispatch parallel Sonnets — read `RULE 1.5` in this repo's own `CLAUDE.md` first
(no `git add -A`, overlapping files go through `scripts/worktree.mjs`) and `RULE 0.8` (every thread
reports back n of N, counted, with proof — not a claim).

## What's already verified (do not re-derive, just act on it)

1. **Fedora access: none exists today.** Grepped `.github`, `ingest`, `docs`, `_ASSISTANT` for any
   Fedora reference — zero SSH keys, deploy targets, or workflow wiring. The box is reachable only
   as `ssh fedora` from Ricky's own machine on his own network. `wiki/pipeline-health.md` already
   scopes the job precisely: Fedora becomes the residential-IP runner for the four jobs DBPR/Crexi's
   WAFs currently force onto the Windows box (DBPR SIRS, Crexi, Collier official records, Collier
   permits) — **not** a replacement for the GitHub Actions cron fleet. That page's own open question
   is unverified: does the Actions runner tarball run as a user service on Fedora 44 without sudo,
   does rootless-podman reach DBPR/Crexi from the Xfinity line. Nobody can answer that from a cloud
   sandbox — it needs a session literally on Ricky's network.
2. **The repo is public, confirmed live:** `gh repo view ... --json visibility,isPrivate` →
   `{"isPrivate":false,"visibility":"PUBLIC"}`.
3. **No leaked secrets found.** Every `SUPABASE_SERVICE_KEY`-shaped hit in workflow YAML is the safe
   `${{ secrets.X }}` reference pattern. `.env.local` is untracked and correctly gitignored
   (`.gitignore:30`). This is not the exposure problem.
4. **The real exposure problem: `brains/` is the product, and it's public.** 46 files of derived
   insight (the actual thing worth selling — see `wiki/florida-public-records.md`'s "sell the JOIN,
   not the rows" doctrine) are committed and fully readable by anyone at
   `github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/tree/main/brains`, no account needed. That directly
   undercuts the business model. Raw `data_lake.*` tables are **not** in git — they live in Supabase
   only — so "everything" isn't literally all on GitHub today, but the finished analysis is.
5. **Going private has a real, already-documented cost.** This repo's own `CLAUDE.md` states GitHub
   Actions is free specifically *because* the repo is public, and `wiki/pipeline-health.md`'s own
   Decision log already says "do not move the cron fleet to Fedora — GitHub Actions is free on the
   public repo." Flipping to private forces a real choice for all 113 workflows: pay for Actions
   minutes, or migrate execution to self-hosted runners — the same Fedora-runner work already
   scoped, just for the whole fleet instead of 4 jobs. Nobody has pulled GitHub's actual private-repo
   Actions pricing live yet — that's Vendor First work, not a guess, and it's below.
6. **Repo visibility is a structure change.** Global rule: no visibility flip without Ricky's
   explicit word. Nothing here authorizes making that change — only researching the real cost of
   each option so he can decide with numbers instead of a guess.

## Fan-out plan — dispatch these as separate Sonnets, one fan-out at a time, no overlapping files

**Freeze first.** Nothing below unblocks new data sources, the condo SIRS build, or PR #204 /
`/connect` marketing. Those stay parked until every thread here reports back proven.

- **Thread A — Fedora reachability runbook (prep only, blocked on Ricky's network).** Can't be
  executed from a cloud sandbox. Write the exact checklist (commands, expected output, what proves
  success) for: install the GitHub self-hosted runner as a user service, no sudo; confirm rootless
  podman can pull and run a Playwright image; confirm that container reaches DBPR and Crexi from the
  Xfinity residential IP. Hand it to Ricky as a script he runs in one `ssh fedora` session, not a
  live investigation he has to narrate.
- **Thread B — Public-exposure cost model, live-verified.** Crawl GitHub's actual current private-repo
  Actions pricing (Vendor First — do not use training memory) and price out 113 workflows' real
  monthly minutes against it. Separately cost out "keep `brains/` out of the public tree" as its own
  narrower option: a private submodule, a separate private repo for `brains/` only, or gating the
  read path behind the existing account-key auth already built for MCP writes. Report three real
  options with real numbers, not opinions — this is what Ricky decides on next.
- **Thread C — Turn every manual repair into an automatic one.** This is the literal ask ("rules,
  guards and repairs automatic before we do anything"). `wiki/pipeline-health.md` already lists what
  exists (the `$1`/run and `$5`/day API caps, the `assert_landed` row gate, content contracts, the
  doctor that writes prescriptions, one auto-retry, incident issues, a Healthchecks.io dead-man
  ping) and what's still manual: credit/429 failures misclassified as generic instead of BILLING,
  three ghost `NEVER_LANDED` registry entries nobody's landed or deleted, one signal querying a
  schema-prefixed name PostgREST can't see, a missing `/api/health` route a signal targets, 22 stale
  `cron-failure` issues with no auto-close. Fix each one so it repairs or reports itself without a
  human reading logs — proof is the doctor going green on its own, not a claim.
- **Thread D — Settle the open data-integrity questions before counting anything as landed.**
  (1) The `leepa_comp_sales` contradiction — doctor says `NEVER_LANDED`, the inventory audit says
  108,848 rows exist in `data_lake.leepa_comparable_sales` — one live row count against the actual
  table name settles it. (2) Confirm the pre-SteadyAPI scrape source (`--source scrape`) still
  parses — one dry-run dispatch, unchecked since 2026-07-01. (3) Before pulling anything from the
  75-entry `source_ceiling` list, confirm each candidate isn't already landed under a different name
  — the `leepa` mismatch above is exactly the kind of false gap that wastes a build cycle.

Each thread reports back counted and proven (RULE 0.8) before anything in the "what needs Ricky"
section below gets acted on, and before `wiki/mcp-connector.md`'s Lenses/MCP/SDK work resumes.

## What needs Ricky, in order

1. **Anthropic console credit** — still the single blocker for 16 workflows including the nightly
   brain rebuild. Unrelated to the fan-out above; can land any time.
2. **A session on his own network** (`ssh fedora`) to run Thread A's checklist once it exists.
3. **Repo visibility decision**, made with Thread B's real numbers in hand, not a guess.
4. **What "1 TB SSD" actually means to him** — needs one clarifying answer, because the three real
   shapes cost wildly different amounts of work: (a) full self-hosted git off GitHub entirely
   (Gitea/Forgejo on Fedora — a real build, needs a rule-9 discovery comparison first, not started),
   (b) keep code + CI on GitHub but stop `brains/*.md` from being public (Thread B's narrower
   option), or (c) physically relocate the Supabase `data_lake.*` tables onto local Postgres on the
   SSD/Fedora box (a data-migration project, unrelated to visibility). Don't guess which — ask.

## What's explicitly parked until the freeze lifts

- `wiki/mcp-connector.md` — PR #204, the `/connect` page, any Lenses/MCP/SDK work.
- `wiki/diversification.md` — condo SIRS build, the other four verticals.
- Any new pull from the 75-entry `source_ceiling` list beyond Thread D's verification pass.

## Where the rest of the context lives

- `wiki/INDEX.md` — this repo's own wiki, start here.
- `wiki/pipeline-health.md` — the full dated rebuild order this handoff builds on.
- `_ASSISTANT/2026-09-15-mcp-diversification-and-pipeline-handoff.md` — yesterday's handoff, now
  partially superseded: the MCP/diversification work it describes is paused by this one.
- `chief-of-staff` (sister repo) — the business-decision layer; this session's own reasoning on the
  public/private tradeoff is there too, same date.
