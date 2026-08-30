# block/buzz — "does this help us in any way?" — evaluated 08/29/2026

Source: https://github.com/block/buzz (README.md, LICENSE, Cargo.toml fetched raw 08/29/2026).
31.4k stars · 2,542 commits · last commit 08/29/2026 · Apache-2.0 · workspace version 0.1.0.

## What it is
A self-hostable team workspace (Slack-shaped: channels, threads, DMs, canvases, media, voice huddles)
built as a Nostr relay in Rust. Every message / reaction / workflow step / git event is a signed Nostr
event in one Postgres log. AI agents are first-class members with their own keypairs; `buzz-cli` is
JSON-in/JSON-out for LLM tool calls; an ACP harness bridges Goose / Codex / Claude Code. YAML workflows
fire on message / reaction / schedule / webhook. Git hosting via NIP-34 patches.

Stack to run it: Docker + Postgres + Redis + MinIO (+ optional Caddy), Rust 1.88+, Node 24+, pnpm 10+,
Hermit toolchain, `just`. Desktop client = Tauri + React. Windows build is "alpha-unsigned"; the agent
shell tool needs Git Bash on Windows.

README's own status table: ✅ relay/channels/search/audit/CLI/YAML workflows/git events ·
🚧 mobile, **workflow approval gates ("infra exists, glue still drying")**, huddle lifecycle ·
💭 web-of-trust, push notifications, "culture features."

## Verdict: do not adopt. Nothing to steal either.
- It is a TEAM chat product. We are one operator plus parallel Claude Code sessions. Every problem it
  solves (humans + agents in shared rooms, cross-team audit, branch-as-room, agent identity scoping) is
  a many-humans problem we do not have.
- RULE 0.9: it is pure plumbing — a relay, a pub/sub, an object store, a desktop app — to be
  self-hosted so that agent actions land in a searchable log. We already have that log at zero infra:
  `SESSION_LOG.md` + `public.checks` + repolith claims + git. Standing up Postgres+Redis+MinIO+Docker
  to get a second copy of it fails RULE 11 at our volume.
- The one piece adjacent to something we own — workflow approval gates for agent actions — is in the
  🚧 column ("glue still drying"). Our hook-enforced gates (`.claude/hooks/check-prepush-gate.mjs`,
  PreToolUse denies) already do this at write/push time, in-repo.
- NORTH STAR #5: adopt nothing new until 09/18/2026. Same family as Writ (08/18) and Omnigent
  (07/30), both rejected for the same shape: a second governance/coordination substrate that would
  fight the one we run.
- Licence is clean (Apache-2.0) — irrelevant, since there is nothing to take.

## If anything ever changes
The only scenario where it earns a re-look: a second human joins and needs to see what the agent
sessions did without reading git. Even then, the cheaper answer is the ops site (19 live pages,
`swfldatagulf-ops.vercel.app`) which already surfaces checks, coverage, and session history.
