# PROJECT MAP — the repo root, one line per entry (verified 08/19/2026)

The table of contents an agent scans BEFORE opening files or concluding something
doesn't exist. Regenerate discipline: when a top-level entry is added/removed, update
this file in the same commit (the pre-push root-allowlist gate names this file).
Entries marked **[untracked]** are gitignored — invisible to repo-wide Grep AND to
`git ls-files`; read them by explicit path.

## App code (wired, load-bearing — generic names are historical, do not rename)

- `app/` — Next.js App Router pages + API routes. Area rules: `app/api/CLAUDE.md`.
- `components/` — React UI. ONE-ROOM rule at `components/CLAUDE.md`; charts typography lock at `components/charts/CLAUDE.md`.
- `lib/` — core logic. Area CLAUDE.mds: email, assistant, social, deliverable, listings, brand, charts, pdf.
- `refinery/` — the brain factory (stages 1-4, packs, validators). `refinery/CLAUDE.md` + `refinery/packs/CLAUDE.md`.
- `ingest/` — Python dlt pipelines + `cadence_registry.yaml`. `ingest/CLAUDE.md`.
- `brains/` — LIVE refinery OUTPUT (written by stage 4, read by `lib/fetch-brain.ts`). Not junk; core data.
- `emails/` — React-email templates + Playwright visual regression.
- `templates/` — HTML deliverable templates (own README).
- `utils/` — Next.js Supabase scaffold (`utils/supabase/*`, imported by 15+ files).
- `tools/` — lake MCP server (`tools/lake-mcp-server.mts`).
- `types/`, `middleware.ts`, `instrumentation*.ts`, `sentry.*.config.ts` — framework contracts.
- `supabase/`, `migrations/` — DB. Migrations run directly per RULE 1.
- `scripts/` — session/ops tooling. `scripts/CLAUDE.md` is the command reference.
- `public/` — static assets; `public/showcase/` + baked email captures (Gate 15 territory).
- `content/` — **LIVE**: `content/insiders/issue-2026-07.html` is read at runtime by `app/insiders/001/route.ts` and traced by `next.config.ts` — moving it silently empties a production page at HTTP 200.
- `fixtures/` — e.g. `swfl-zip-county.json`, named in CLAUDE.md's ZIP rules.
- `assets/`, `mcp-widget/` (PARKED.md — intentionally paused), `cloud-secrets/` (encrypted vault tooling).

## Operator surfaces (session machinery reads these)

- `SESSION_LOG.md` — RULE 0, append-only, hook-enforced on push.
- `_ASSISTANT/` — SCRATCHPAD.md, STRIKES.md, RULES.md (re-injected every prompt), TODAY.md, NORTH-STAR.md.
- `_RESEARCH/` — ALL research, 10 category folders + INDEX.md. TRACKED since 08/11/2026 (public repo; no credentials/PII ever).
- `_AUDIT_AND_ROADMAP/` — `build-queue.md` (machinery-read) + Operation July + postmortems.
- `_FABLE5/` — desk/collection cadence (SessionStart prints staleness).
- `docs/` — standards (the playbooks), runbooks, handoff, superpowers plans/specs/handoffs, audit, `_archive` + `_FINISHED` + `parked` (retired docs), `_diagrams` (mermaid sources).
- `verification/` — MIXED: machine-read hook state (answer-proofs.jsonl, tripwire-accepted.json, allowlists) + probe reports. Do not delete casually.
- `reports/` — provenance-tagged one-off analyses.
- `PROJECT_MAP.md` (this file) · `CLAUDE.md` (root rules) · `THE-CONTRACT.md`, `DELIVERABLES.md`, `DELIVERABLE-ENGINE-BLUEPRINT.md`, `ENGINE-HANDOFF.md`, `SOURCED.md` (root narrative docs — referenced by SESSION_LOG history, leave at root).
- `AGENTS.md` — Next.js scaffold version-drift note ONLY, not agent instructions.

## Scratch / caches (all **[untracked]** unless noted)

- `tmp/`, `out/`, `runs/`, `__scratch__/` — render-comparison dumps + debug scripts. Prefer `tmp/` for new scratch renders.
- `.firecrawl/` — legacy crawl cache (917 files) — new crawl output goes to `_RESEARCH/` per RULE 0.4, never here.
- `data/` — external CSV cache (Zillow/Redfin) + `data/prospects/` client working files.
- `graphify-out/`, `.qmd/`, `.next/`, `node_modules/`, `.venv/`, `.pytest_cache/`, `.refinery-cache/`, `.carousel-out/`, `design-extract-output/`, `test-results/` — tool output.
- `.private/` — vault backups. `GET DONE/`, `GO-LIVE/`, `SOCIAL BUILD/`, `_archive/`, `_diagrams/`, `__snapshots__/` — REMOVED 08/19/2026 (contents relocated under `docs/`; see SESSION_LOG).

## Config (tool-mandated, fixed names)

`package.json`, `bun.lock`, `tsconfig.json`, `next.config.ts`, `vercel.json`, `pyproject.toml`,
`uv.lock`, `eslint.config.mjs`, `postcss.config.mjs`, `playwright.config.ts`, `vitest.config.ts`,
`knip.jsonc`, `skills-lock.json`, `database*.types.ts`, `.mcp.json`, `.claude/`, `.github/`,
`.gitignore`, `.gitattributes`, `.prettierrc`, `.npmrc`, `.python-version`, `LICENSE`, `README.md`,
`CONTRIBUTING.md`, `.env.example`, `.storybook/`, `.vscode/`, `.agents/`.
