# cursor/plugins — pstack (poteto-mode) — evaluation

- Source: https://github.com/cursor/plugins/tree/main/pstack (README + `.cursor-plugin/plugin.json` + `skills/setup-pstack/SKILL.md`, crawled via crawl4ai 08/30/2026)
- Author: Lauren Tan (poteto, React core / Cursor). MIT. v0.14.5 at crawl.
- Operator asked: "how do we get this?"

## What it is

A **Cursor plugin**, not a Claude Code one. Install is `/add-plugin pstack` typed inside Cursor's
agent chat. Manifest lives at `.cursor-plugin/plugin.json` (`"skills": "./skills/"`,
`"agents": "./agents/"`). ~25 SKILL.md skills + 22 "playbooks" under `poteto-mode`, plus a
`poteto-agent` subagent and a "Comment Sicko" reviewer subagent.

The load-bearing feature is **multi-model routing**: `/setup-pstack` writes
`~/.cursor/rules/pstack-models.mdc` mapping roles to vendor slugs — feature/refactor →
`grok-4.6-fast-xhigh`, bug-fix/perf → `gpt-5.6-sol-max`, prose/judgment → `claude-fable-5-thinking-max`,
critic panels fan out one subagent per slug (Fable / Sol / Grok / Opus 5). Every "panel" skill
(`/how` critics, `/arena`, `/interrogate`, `/swarm`) is built on Cursor's `Task` subagent taking an
arbitrary vendor model id.

## Does it port to Claude Code?

- SKILL.md frontmatter (`name` / `description`) is the same shape Claude Code reads, so the
  prose could be dropped into `.claude/skills/` or wrapped in a Claude Code plugin manifest.
- What does NOT port: the Agent tool here accepts only `sonnet | opus | haiku | fable`. No GPT,
  no Grok. Every cross-vendor panel (the reason the plugin exists) collapses to "N Claude
  subagents", which is what `/arena`-style fan-out already costs and gains nothing new.
- References to `Task`, `AskQuestion`, `~/.cursor/rules/*.mdc`, Cursor `/loop`, Graphite
  merge-when-ready would all need hand-rewrite. That's a port project, not an install.

## Overlap with what we already run

- superpowers: brainstorming, systematic-debugging, tdd, verification-before-completion,
  writing-plans, executing-plans, subagent-driven-development, dispatching-parallel-agents.
- ours: `verify` skill (== their create-verification-skill output), `second-order` agent
  (== `/blast-radius`), `what-do-we-have` (== `/recall` half), code-review / security-review,
  `unslop` ≈ our voice-guard + fair-housing lints on the output side.
- The one genuinely different idea: a **sticky mode** that picks a playbook per task and copies
  the steps verbatim into a todo list. Our equivalent is the NORTH STAR hook + skills gate.

## Verdict: DO NOT ADOPT (freeze + no vendor fit)

1. NORTH STAR #5 — "ADOPT NOTHING NEW FOR 30 DAYS from 08/19/2026" — is in force until
   09/18/2026. This is exactly the "make the AI better" lead shape it names.
2. Its differentiator (cross-vendor model panels) is unreachable from this harness.
3. Everything else already exists here under a different name. Same family as Writ, Omnigent,
   block/buzz.

**Steal, maybe, after the freeze:** the playbook table as a shape — one file per task type,
steps copied verbatim into the todo list — if the scoped-rules injection (NORTH STAR #3) ever
wants per-task-type rule sets instead of per-directory ones. No code, no plugin, no port.

## If the operator wants it anyway

It is a Cursor thing: open Cursor, type `/add-plugin pstack`, then `/setup-pstack`. It will not
show up in Claude Code. A Claude Code port = fork `pstack/skills/*`, rewrite the model slugs to
`fable/opus/sonnet/haiku`, drop the Cursor rule file, and register as a plugin — a day of work
for a strictly worse version of superpowers.
