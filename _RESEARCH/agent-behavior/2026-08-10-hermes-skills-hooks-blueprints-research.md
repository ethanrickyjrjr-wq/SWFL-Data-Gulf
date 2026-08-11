# Hermes skills, hooks, and automation blueprints — the driver surface for the email-builder agent (researched live 08/10/2026)

Operator decree: *"brainstorm so we get it right after you crawl4ai ideas and skills for hermes."*
All findings fetched live via crawl4ai from https://hermes-agent.nousresearch.com/docs/ this
session. Builds on 08/08 (model upgrade) + 08/09 (continuous work) research in this folder —
kanban/goal/cron/heartbeat/gateway mechanics are documented THERE, not repeated here.

## Skills System (/docs/user-guide/features/skills)

- Skills live in `~/.hermes/skills/` (Windows: `AppData\Local\hermes` profile dir), follow the
  **agentskills.io open standard** — SAME SKILL.md format we already researched 08/02 for the
  hosted intake skill (`_RESEARCH/.../2026-08-02-agent-skills-spec-for-intake.md`). One format,
  both harnesses: a skill written for Hermes is spec-portable.
- **External skill directories**: Hermes can scan additional folders alongside `~/.hermes/skills/`
  — we could point it at a repo-adjacent (gitignored or separate-repo) skills dir so the
  swfl skills are versioned where we control them.
- Every installed skill = a slash command on EVERY gateway platform (Telegram included).
  `/skill-name args` loads it; bare `/skill-name` loads and lets the agent ask what's needed.
- **Stacking**: up to 5 leading `/skill` tokens chain in one message. **Skill bundles** wrap a
  repeated combination under one command.
- **`/learn`** — the agent authors its own SKILL.md from anything you can describe: a local doc
  dir, a URL (web_extract), or *"the workflow you just walked the agent through in this
  conversation"*. House standards enforced (≤60-char description, standard section order, no
  invented commands). This is the cheapest path to the email-driver skill: walk Hermes through
  one build cycle manually, then `/learn` it.

## Event Hooks (/docs/user-guide/features/hooks)

- Hook = directory under `~/.hermes/hooks/` with `HOOK.yaml` (event subscriptions, wildcards
  like `command:*`) + `handler.py`. Errors isolated, don't crash the agent.
- Not all passive: directive/control hooks change flow; a shell `pre_tool_call` hook can BLOCK
  or fail closed — i.e., we can hard-block a Hermes worker from ever calling a send endpoint,
  enforcing the human-click send paywall at the harness layer, not just by prompt.
- Gateway hooks fire on Telegram/Discord/Slack events without blocking the pipeline.

## Automation Blueprints (/docs/guides/automation-blueprints)

- **Three trigger types**: Schedule (cron), GitHub event (webhook), **API call — an external
  service POSTs JSON to a Hermes webhook endpoint** (`hermes webhook subscribe` or config.yaml
  routes). The third is the load-bearing one for us: the PLATFORM can push a listing event to
  Hermes instead of Hermes polling.
- Delivery targets per job: Telegram, Discord, Slack, SMS, email, GitHub comments, local files.
- Documented `[SILENT]` convention — cron prompt ends "If no new X, respond with [SILENT]" so
  quiet ticks deliver nothing. Same shape as the 08/09 "notify only when something changed"
  Pattern 1.
- Parameterized blueprints with forms: /docs/reference/automation-blueprints-catalog.

## What this changes for the email-builder-agent design

1. The driver is a **skill + a trigger**, not a resident program: SKILL.md (agentskills.io
   format, portable) telling Hermes how to pick recipe/subject and call OUR build surface;
   trigger is either script-first cron polling the lake (zero-token until an event) or the
   platform POSTing to a Hermes webhook.
2. **The build itself never leaves our server.** Hermes calls the product's authed build
   seam — the `piece2_g1_action_surface` open check already recommends exactly this seam
   (reuse schedule-command PROPOSE→CONFIRM + build route, thin authed dispatcher). The Hermes
   driver is that check's first real consumer.
3. **Send stays impossible from Hermes**: pre_tool_call shell hook blocks send-shaped calls
   fail-closed; the dispatcher simply has no send scope. Two independent layers.
4. 08/09 pilot lessons still govern: local model fabricated a figure once — NOTHING Hermes
   produces carries a number anywhere; it only triggers OUR pipe, whose gates already refuse
   unsourced figures. Watchdog ticks should be script-only (zero tokens) per RULE 0.7a.
