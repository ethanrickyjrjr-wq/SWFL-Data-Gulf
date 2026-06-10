# Task 01 — Spec amendments (A1–A8) + open checks + flip build-queue

**Why here:** Session 0 ships first, so it carries the one-time bookkeeping the whole plan needs.

**Files:**
- Modify: `docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md` (append an "Amendments 2026-06-10" section)
- Modify: `_AUDIT_AND_ROADMAP/build-queue.md`
- Ledger: `public.checks` via `scripts/check.mjs`

- [ ] **Step 1: Append the amendments block to the boards spec.** Add this verbatim at the end of the file (do not rewrite existing prose — append):

```markdown
## Amendments 2026-06-10 (Projects + Assembly Engine — operator-approved)

- **A1 — Rename.** `boards` → `projects`; `/board/[id]` → `/project/[id]`; `/api/boards` → `/api/projects`. `saved_charts` + `/c/[id]` keep their names.
- **A2 — Item union widened** (additive): the discriminated union gains `qa | metric | source | file | table_slice` (full shape in `docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/shared/data-model.md`); `projects` gains `branding jsonb` and `mcp_key text UNIQUE` columns.
- **A3 — Assembly engine added** (net-new, the spec never covered it): `deliverables` table + `POST /api/projects/[id]/build` (forced-tool LLM assembly) + hosted `/p/[id]`. Print-the-page PDF is kept.
- **A4 — Meter every action day one, enforcement OFF.** Resolves the spec's open "0 or 1 usage" question: count `ask, chart_save, project_create, item_add, build, export_print, deliver_email, upload`; no hard wall.
- **A5 — Free/paid line preserved as FUTURE wall placement** ("free = answer in the moment; paid = keep/combine/take with you"), not flipped on.
- **A6 — Persistence:** `projects`/`deliverables` in Postgres; `project-uploads` bucket is solely user attachments; the Tier-1 Parquet/S3 lane is untouched.
- **A7 — MCP "read-only" promise narrowed to `swfl_fetch`;** three capability-keyed write tools added (`swfl_project_list/add/build`).
- **A8 — Chart Tier C (NL charts) + vitals chart scope stay deferred.**
```

- [ ] **Step 2: Flip the build-queue.** In `_AUDIT_AND_ROADMAP/build-queue.md`, mark item 1 (Highlighter persistence/briefcase) `[~]` in progress, and append the net-new lines for the assembly engine / delivery / uploads / MCP co-build (Sessions 6–9). Keep existing lines; do not delete.

- [ ] **Step 3: Open the 5 checks.** Run each (project = `brain-platform`):

```bash
node scripts/check.mjs open brain-platform cookie_mint_live_verify "sdg_cid signed cookie minted+verified in prod; usage_events.client_id != anon" --detail "S0 — verify after deploy"
node scripts/check.mjs open brain-platform projects_rls_live_verify "first auth.uid()=user_id RLS: two-account cross-read DENIED in prod" --detail "S4"
node scripts/check.mjs open brain-platform deliverable_anchor_lint "every numeric token in assembled narrative anchors to an item snapshot; poisoned-narrative test green" --detail "S6"
node scripts/check.mjs open brain-platform storage_rls_scope_verify "project-uploads RLS path-prefix = auth.uid(); cross-user object read DENIED in prod" --detail "S8"
node scripts/check.mjs open brain-platform mcp_project_tools_live_verify "their-Claude flow: fetch->add->build returns working /p/ URL; bad key clean error" --detail "S9"
```

- [ ] **Step 4: Verify checks landed.** Run `node scripts/check.mjs list` — expect the 5 new keys present and open. (These are **prod-evidence** checks per `feedback_checks-prod-evidence-not-dev-attestation`: do NOT close any on "code looks right" — only on a live signal.)

- [ ] **Step 5: Commit.** This goes out with the rest of Session 0's push (one push), but commit it as its own logical commit:

```bash
git add docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs(projects): amend boards spec A1-A8; queue assembly-engine sessions"
```
