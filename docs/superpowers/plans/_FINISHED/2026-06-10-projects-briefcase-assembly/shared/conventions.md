# Shared conventions — read before executing ANY session

## Locked v1 decisions (operator, 2026-06-10)

- **Delivery rail:** hosted `/p/[id]` page + `window.print()` PDF + email **DRAFT** (copy / `mailto:` / share-sheet). Resend real-send (7b) and server PDF/PPTX **deferred to demand**.
- **Anonymous-first:** full briefcase on `localStorage`; magic-link login only to save / share / build / upload. **No dead ends** — anon always sees a login prompt, never a hard stop.
- **Uploads v1:** images + PDFs, attach + caption only (10MB/file, 10/project). No parsing/OCR.
- **Naming (LOCKED — do not drift):** table `public.projects`, route `/project/[id]`, API `/api/projects`. "Briefcase" = the capture-tray UI **only**. `saved_charts` + `/c/[id]` keep their spec names. Deliverables: table `deliverables`, route `/p/[id]`.

## Per-session ship checklist (RULE 0 + RULE 2)

Every session ends with ONE push that includes all of:
1. The code + tests (green: `bun test` for touched areas; `npm run refinery -- ...` only if you touched packs/vocab — this plan does not).
2. A new top-of-file `SESSION_LOG.md` entry (1–3 lines, file paths welcome). **Hook-enforced** — the pre-push hook blocks a push whose commits don't touch `SESSION_LOG.md`.
3. Reconcile the `checks` ledger: `node scripts/check.mjs close <key>` / `open <project> <key> "<label>"`. **Never** track open obligations as `⬜/✅` in a plan doc.
4. Flip `_AUDIT_AND_ROADMAP/build-queue.md` (`[~]` in progress, `[x]` done) — the ops board auto-syncs from it within 5 min.
5. Push with `node scripts/safe-push.mjs` (never raw `git push`, never `--no-verify`, never force-push `main`).

**Diff-review gate (RULE 1):** Sessions that change a live `/api/b/*` or MCP response, or the `--- OUTPUT ---` shape, must **ask the operator for a diff review before pushing** (S2 touches `/api/converse`; S9 changes the MCP surface). Pure doc/SQL/UI-wiring sessions just commit and push.

**SQL migrations:** run them yourself, idempotent (`IF NOT EXISTS`, `CREATE ... IF NOT EXISTS`, `on conflict do nothing`). Creds in `.dlt/secrets.toml` (gitignored); `postgresql://postgres:{password}@{host}:5432/postgres`; run via `python -c "import psycopg; ..."`. Verify row count / policy existence after. After creating a table that PostgREST/refinery reads, `GRANT` + `NOTIFY pgrst,'reload schema'`.

**Push autonomy / confirmation:** Per the operator's standing decree (auto-memory `feedback_no-autonomous-push`), **stop after commit, show the log, and ask before pushing.** Do not push autonomously even though RULE 1 grants commit autonomy. Never create branches (`feedback_no-auto-branch-creation`) — work on `main`. Never open/merge PRs autonomously.

## Vendor-First — WebFetch these IN the executing session (never from memory/this doc)

| Surface | Session | Why |
|---|---|---|
| Supabase SSR middleware auth + `@supabase/ssr` ~0.10.x API | S4 | gating a route via `getUser()`; wrong call locks public pages |
| Supabase Storage RLS syntax + `createSignedUrl` + size ceilings | S8 | **only never-touched vendor surface in this plan** — mandatory |
| Anthropic `tool_choice` + strict on `@anthropic-ai/sdk` ^0.69.0 | S6 | forced-tool assembly; verbatim tool schema matters |
| Vercel `maxDuration` / `after()` | S6 | sync build now, `after()` upgrade later |
| Resend `reply_to` / verified-domain rules | S7 (7b only) | when real-send un-defers |
| iOS Safari / Android print + share-sheet | S5, S7 | real-device, not docs |

## Model-tier hygiene

The folder name carries the assignment (`__OPUS` / `__SONNET`). If you were dispatched as the wrong tier, note it and proceed — but Opus sessions encode irreversible/security decisions (first RLS, storage scoping, anti-hallucination lint, MCP write surface) deliberately.

## Locked names cross-reference

`ProjectItem` / `projectItemSchema` (`lib/project/items.ts`) · `projects` / `/project/[id]` / `/api/projects` · `saved_charts` / `/c/[id]` / `/api/charts/save` · `deliverables` / `/p/[id]` / `/api/projects/[id]/build` · `ChartBlock` + `lintChartBlock` + `isAnchored` (`refinery/validate/chart-block-lint.mts`) · `ChartBlockView` (`components/charts/ChartBlockView.tsx`, **exists**) · `buildChartForIntent` (`lib/build-chart-for-intent.mts`, new) · `routeChart` (`lib/route-chart.ts`, exists) · `SYNTHESIS_MODEL` / `getAnthropic` (`refinery/agents/anthropic.mts`).
