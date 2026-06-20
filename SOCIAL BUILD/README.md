# SOCIAL BUILD — assignment files

One file = one ultracode Claude's complete job. Hand each file to a separate session.
Design source of truth: `docs/superpowers/specs/2026-06-20-social-auto-posting-design.md`.

**Go-live model (applies to every file):** everything is built and exercised in a **cost-free DRY mode** (`SOCIAL_PUBLISH_ENABLED=false`, the default). No real post, no X API spend. When payments are in we flip one switch (`node scripts/social.mjs go-live`) — no code change. Build 01 owns that switch; every other build must respect it (the runner gates publish, so connectors are never called in dry mode).

---

## Who builds what (model assignment)

**Opus** = net-new / judgment-heavy / LLM-prompt / no-invention-moat work.
**Sonnet** = clone-and-rename of the well-understood email engine / vendor-doc-following / mechanical.

| File | Build | Model | New files only? |
|---|---|---|---|
| `01-spine-and-go-live-switch.md` | Scheduling spine, tables, claim RPC, runner, go-live switch | **Sonnet** | New (+ owns `lib/social/types.ts`) |
| `02-satori-renderer.md` | Server-side branded-graphic renderer (Satori) | **Opus** | New |
| `03-platform-connectors.md` | LinkedIn + Bluesky + X direct connectors + token store | **Sonnet** | New |
| `04-compose-engine-and-mcp-tool.md` | Brain→caption fan-out + `swfl_social_post` MCP tool | **Opus** | New + edits MCP registry |
| `05-grain-lift.md` | ZIP-only → place/county/corridor, no-invention guard | **Opus** | Edits shared scope resolver |
| `06-publish-paywall-gate.md` | `channel`-metered 402-before-publish | **Sonnet** | Edits 01's runner + 03's adapter |
| `07-tracking-and-engagement-poll.md` | Post tracking + engagement poll → /ops rollup | **Sonnet** | New |

---

## What can run together — the concurrency matrix

The only real conflicts are (a) two files editing the same code, or (b) a file needing another's output to exist. Run in stages:

### STAGE 1 — start now, fully parallel (2 Claudes)
- **01** (Sonnet) and **02** (Opus) run together. Zero overlap (all new files).
- **01 must merge `lib/social/types.ts` + the migration FIRST** (small, fast) — it is the shared interface + schema everyone else codes against. The rest of 01 (runner, switch) continues after.

### STAGE 2 — after 01's `types.ts` + migration land (3 Claudes)
- **03** (Sonnet), **04** (Opus), **05** (Opus) run together.
- ⚠ **04 and 05 must NOT edit scope-resolution at the same time.** 05 owns the grain resolver — it publishes the grain interface stub first, then 04 consumes it. If you can't sequence them, run 05 alone first.

### STAGE 3 — after 03 merges (2 Claudes)
- **06** (Sonnet) and **07** (Sonnet) run together.
- ⚠ **06 CANNOT run while 01 or 03 are in flight** — it edits the runner's publish path (01) and the adapter (03). Those must be merged first.

### CANNOT-RUN-AT-SAME-TIME (quick reference)
| Pair | Why | Fix |
|---|---|---|
| 06 ✕ 01 | both edit `run-posts.mts` publish path | 06 waits for 01 to merge |
| 06 ✕ 03 | both edit the channel adapter | 06 waits for 03 to merge |
| 04 ✕ 05 | both touch scope/grain resolution | 05 publishes grain interface first, then 04 |
| 03/04/05/06/07 ✕ 01 (schema) | all read 01's `social_*` tables + `types.ts` | 01 merges schema + types first |

Everything not listed is safe in parallel. **02 (renderer) conflicts with nothing — always parallelizable.**

Max useful concurrency: **3 Claudes** (Stage 2).

---

## Every file's done-bar (house rules)
- Build in DRY mode; never wire a live post path that fires without `SOCIAL_PUBLISH_ENABLED=true`.
- Gates before push: `real-tsc` 0, eslint clean, `next build` ✓, relevant `bun test` green. Migrations idempotent + verified by row count.
- `SESSION_LOG.md` entry on push; stage only your own files (explicit paths, never `git add -A`); no autonomous push (stop, show log, ask).
- Vendor-First: re-verify the §8 vendor items live before coding the connector/renderer slice.
