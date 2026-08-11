# Agent Skills spec — the format our hosted intake skill file must follow (08/02/2026)

Fetched live via crawl4ai from https://agentskills.io/specification (the open Agent Skills
spec, agentskills/agentskills on GitHub). Context: the user-data typed lane
(`docs/superpowers/specs/2026-08-03-user-data-typed-lane-design.md`) ships a hosted skill
file that walks a user's coding agent through importing their data via our endpoints —
Mixpanel's `mixpanel-first-implementation` skill (see
`2026-08-02-mixpanel-app-drive.md` §8) is the working example of the pattern; THIS is the
format contract it follows.

## Verbatim contract (from the live spec page)

- A skill is a DIRECTORY with `SKILL.md` required; optional `scripts/`, `references/`,
  `assets/`.
- `SKILL.md` = YAML frontmatter + markdown body.
- Frontmatter fields:
  - `name` — REQUIRED. Max 64 chars. Lowercase letters, numbers, hyphens only; must not
    start/end with a hyphen.
  - `description` — REQUIRED. Max 1024 chars, non-empty. What the skill does AND when to
    use it.
  - `license` — optional.
  - `compatibility` — optional, max 500 chars (environment requirements).
  - `metadata` — optional arbitrary key-value map.
  - `allowed-tools` — optional space-separated pre-approved tools (experimental).
- Progressive disclosure: keep `SKILL.md` as the conversation spine; put SDK
  snippets/detail docs in `references/` files the agent reads on demand (Mixpanel does
  exactly this with `reference.md`).

## What this means for our intake skill

- Ours: `name: swfl-data-connect` (or similar), description states the when ("when a user
  wants their contacts/listings/figures imported into SWFL Data Gulf"), body = the
  mode-based guided conversation (ask what the data is BEFORE any write), endpoint calls
  documented in a `references/` file, final step = the verify-first-record poll loop.
- Serve it from OUR deploy (same repo as the endpoints) so the contract cannot drift —
  spec-compliant single markdown works for Claude Code, Cursor, Codex, and any client on
  the showcase list.

Provenance homepage: https://agentskills.io
