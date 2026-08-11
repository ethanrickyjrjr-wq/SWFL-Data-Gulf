# Hermes continuous autonomous work — what it actually ships (researched live 08/09/2026)

Operator decree: *"crawl4ai what we can have hermes actually do to make this project better…
How do we make it work continuously on problems?"* All findings below fetched live from
https://hermes-agent.nousresearch.com/docs/ (crawl4ai, this session) plus the shipped docs in
`C:\Users\ethan\AppData\Local\hermes\hermes-agent\docs\`. Not memory.

Current install state (verified on disk): NousResearch hermes-agent (MIT), native Windows at
`AppData\Local\hermes`. Model: **gpt-oss:120b via Ollama Cloud** (config.yaml, upgraded 08/08).
swfl-lake MCP already wired (`https://www.swfldatagulf.com/api/mcp`, 6 tools). `.hermes.md` repo
context file + `swfl-data-gulf` skill exist from 08/08. Cron ticker and kanban.db already
initialized in the install.

## The five continuous-work mechanisms (live-verified)

1. **`/goal` — Ralph-style continuation loop with completion contracts.**
   Source: /docs/user-guide/features/goals. `/goal <text>` re-prompts the SAME session until a
   judge model says done (default 20-turn budget). `/goal draft <text>` expands a one-liner into
   a 5-field completion contract: `outcome`, `verification`, `constraints`, `boundaries`,
   `stop_when`. Judge marks done ONLY on concrete evidence (command output, file excerpt).
   **`/goal gate add <shell command>`** — quality gates: shell commands that must pass before
   the goal can be judged done (e.g. `bunx tsc --noEmit`, a `bun test` line). `/goal wait <pid>`
   parks the loop on a background process. This is the anti-"model claims done" guard built in.

2. **Kanban — durable multi-agent task board with dispatcher.**
   Source: /docs/user-guide/features/kanban (+ kanban-tutorial, kanban-worker-lanes,
   `docs/hermes-kanban-v1-spec.pdf` in the install). SQLite board (`kanban.db`); tasks have
   status `triage|todo|ready|running|blocked|done|archived`, dependencies (`task_links`,
   auto-promote when parents done), named worker profiles, comment threads as the inter-agent
   protocol (workers re-read the full thread on respawn). Dispatcher loop (default 60s, runs
   inside the gateway process) reclaims crashed workers, promotes ready tasks, spawns workers;
   auto-blocks a task after 2 consecutive spawn failures. **Goal-mode cards (`--goal`) run the
   /goal continuation engine inside one card's worker.** Workspaces: `scratch` (ephemeral),
   `dir:<abs path>` (shared dir, preserved), **`worktree:` (git worktree under `.worktrees/<id>`
   — built for coding tasks)**. Boards give hard per-project isolation
   (`hermes kanban boards create brain-platform`). Humans drive via `hermes kanban …` CLI /
   dashboard; agents via `kanban_*` tools. delegate_task = RPC fork-join; kanban = durable queue
   that survives restarts and takes human comments mid-flight.

3. **Cron — durable scheduler, fresh session per tick, with a zero-token mode.**
   Source: /docs/guides/automate-with-cron + /docs/user-guide/features/cron +
   /docs/guides/cron-script-only. Natural-language creation in chat (`cronjob` tool). Prompts
   must be self-contained (no chat memory). The `script` param runs a Python script BEFORE the
   agent; its stdout becomes agent context — script does mechanical fetch/diff, model does
   judgment, and the pattern "notify only when something changed" is the documented Pattern 1.
   **`no_agent=True` = script-only cron: same scheduler, zero LLM tokens** — right shape for
   watchdogs whose message is already exact. `hermes send` pipes any script's stdout straight
   to Telegram/Discord/Slack without a cron entry. Delivery of any job's output to any gateway
   platform. (Hosted "Chronos" scale-to-zero cron exists for VPS installs —
   `docs/chronos-managed-cron-contract.md` — not needed locally, the local 60s ticker is fine.)

4. **Session heartbeats** — `/heartbeat every <interval> <prompt>` (min 60s), in-conversation
   recurring check WITH context; idle-only, missed ticks coalesce, don't-invent-work guard
   baked into the injected prompt. Heartbeat = needs this conversation's context; cron = self-
   contained job. Source: /docs/user-guide/features/heartbeat.

5. **Gateway** — one process serving 20+ platforms (Telegram the obvious one here); cron
   delivery, kanban dispatcher, and goal loops all ride it. Talk to the same agent from the
   phone; results arrive without sitting at the desk.

Also relevant: Event Hooks (/docs/user-guide/features/hooks), Automation Blueprints catalog,
GitHub PR review via webhook guide, batch processing, `hermes` as a Python library.

## What this means for brain-platform (the honest division of labor)

gpt-oss:120b will not out-reason Claude on architecture or land-on-main code. Its edge is
**zero marginal cost + always-on + a harness built for unattended grinding**. RULE 0.9 says
route the job to the tool that fits: Hermes is the minion runner we said we shouldn't build
ourselves — and it's already installed.

**Fits Hermes (bounded, verifiable, repeated):**
- Watchdogs: GHA cron-failure watch, site/API freshness checks, records-request nag timers,
  the ops signals nobody reads — script-only cron, zero tokens, Telegram delivery.
- Standing daily jobs: morning digest of open checks / overnight GHA runs / lake freshness.
- Grinding cards with mechanical acceptance criteria: run-and-report jobs, research crawls,
  draft triage of check rows, backfill dry-runs — each a kanban card with `--goal` + a gate
  that is a real shell command.
- Drafts for Claude/operator review: never lands its own work.

**Stays with Claude (judgment, contracts, main):** pack/output-shape edits, data-roots
decisions, anything RULE 1 lists as ask-first, all pushes. **Hermes never pushes** — worktree
workspaces + human/Claude review is the landing path.

## Pilot postmortem (same night, 08/09/2026 ~01:00)

First goal-mode card (`t_46da3186`, absorption named-source research, gpt-oss:120b via Ollama
Cloud) ran 6.7 min of genuinely sensible research (fought Cloudflare blocks on CBRE PDFs, tried
jina.ai text-extraction fallbacks), then died on **HTTP 429 "you have reached your session usage
limit"** — the Ollama Cloud FREE-tier session cap. Dispatcher auto-blocked the card with the
reason preserved; no file landed. Two lessons, both now applied:
1. **The free cloud cap cannot sustain a grinding loop.** One 15-turn goal card burned the whole
   session allowance. Cloud free tier = short one-shot drafts only; grinding runs LOCAL.
   Fix in progress: `ollama pull gpt-oss:20b` (13 GB, fits the 4060 Ti) → retry the card with
   `hermes kanban set-model t_46da3186 --model gpt-oss:20b --provider ollama-launch` + `unblock`.
2. **Hermes silently flipped its own default model back to local gemma4:12b** after the 429
   (config.yaml `model:` block rewritten). Don't assume the configured model is the running
   model — read config.yaml after any provider failure.
3. **Run 2 (local gpt-oss:20b) FABRICATED a number and cited US as the source.** Its draft table
   contained "Net Absorption: 2,345,678 sq ft" attributed to swfldatagulf.com's own API — an
   invented figure sourced to our own product, on the exact card whose purpose was finding a real
   source. The harness behaved well (worker blocked with `needs_input` instead of claiming done;
   the file never reached the inbox), but the lesson is standing: **NOTHING from hermes-inbox
   carries a number into any surface until a human/Claude verifies every figure against its cited
   URL.** The no-invention gate applies at the review step, always. Corrective comment + unblock
   issued for run 3 (redirected to plain-HTML SWFL sources: Gulfshore Business, LSI Companies,
   CRE Consultants, Colliers HTML snapshots; honest partial report = done).

## Pilot verdict (run 3, ~02:30 08/09/2026)

Run 3 (local gpt-oss:20b, after the corrective comment) delivered
`_RESEARCH/hermes-inbox/absorption-source-candidates.md` — **honest, zero invented numbers,
zero usable sources found**: CBRE/Colliers Cloudflare-blocked, NAIOP timed out, EDC paywalled.
The correction loop WORKS (fabricator → told the rules → truthful report). Final read:
- **Harness: proven.** Dispatch, heartbeat, auto-block, human comment changing worker behavior,
  artifact delivery — all live.
- **Model lane: watchdogs + simple grinding, NOT hostile-web research.** Bot-walled CRE sites
  beat a 20b worker with basic HTTP tools; the absorption-source hunt is a Claude/crawl4ai job.
- The absorption card sits in `triage` on the brain-platform board — re-spec or archive, operator
  call. The open defect check on `corridor_profiles.absorption_sqft` remains the tracking home.

## Guards to set before turning it loose
- Quality gates on every goal card — "done" must be a passing command, not a model claim.
- Workspace `worktree:` or `dir:` pinned; never the bare repo root with push creds.
- Spend: model is Ollama Cloud free tier (low usage cap) — grinding loops burn cap; watchdogs
  should be script-only (zero tokens) wherever the message is already exact (RULE 0.7a ladder).
- Kanban `failure_limit` auto-block is the circuit breaker; check the board, not the vibes.
