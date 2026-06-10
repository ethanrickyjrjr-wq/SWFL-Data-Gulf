# Session 9 — MCP co-build  ·  **OPUS**  ·  ~2 days

> Read `../shared/conventions.md`, `../shared/data-model.md`, `../AUDIT.md`. **Why Opus:** this adds **write tools** to the MCP surface (today it's a single read-only `swfl_fetch`), introduces per-project capability tokens, and changes a live external contract. Key-leak and write-scope mistakes are the risk. **`[AUDIT-FIX C6]`**: `auth.ts` is a *conditional* bearer check (open if `MCP_BEARER_TOKEN` unset, enforced if set), NOT a no-op stub — the project-key layer is **additive** and orthogonal; leave `MCP_BEARER_TOKEN`/`auth.ts` behavior intact.

**Goal:** A user's own Claude (via our MCP) co-builds the SAME project: list it, add items into it, and build a deliverable — authorized by a per-project capability key, write-only-into-items, revocable.

**Architecture:** "Connect your AI" on `/project/[id]` mints `projects.mcp_key` (capability token scoping ONE project, regenerate = revoke). Three new MCP tools (zod mirrors `lib/project/items.ts`); writes go via service-role **after** key lookup (a documented second capability-authorized lane — the cookie-RLS lane is for the web UI; this is for the keyed agent). Items get `origin:'mcp'`.

**Tasks (in order):**
- [ ] `task-01-project-key-capability.md` — `POST /api/projects/[id]/mcp-key` (mint/regenerate) + UI snippet
- [ ] `task-02-mcp-write-tools.md` — `swfl_project_list/add/build`; `[ADDED]` dedupe; `origin:'mcp'`
- [ ] `task-03-amend-readonly-annotations.md` — narrow "read-only" prose (`server.ts:59`) + per-tool `readOnlyHint` (A7)
- [ ] `task-04-live-verify-their-claude.md` — end-to-end their-Claude flow; close `mcp_project_tools_live_verify`

**Files:** new `app/api/projects/[id]/mcp-key/route.ts` · `app/api/mcp/server.ts` (3 tools + amend prose/annotations) · `app/project/[id]/page.tsx` ("Connect your AI" + snippet)

**Depends on:** S4 (projects + `mcp_key` column), S6 (`build` reuses `lib/deliverable/build.ts`), **and the `MCP_BEARER_TOKEN` keystone (see gates).**

**Acceptance gates — BOTH must hold before the write tools ship (`[LB-R6]`/`[LB-R7]`):**
- **(a) Bearer enforced FIRST.** `MCP_BEARER_TOKEN` is **unset in prod today**, so `auth.ts` is OPEN and the MCP server is currently unauthenticated (`[AUDIT-FIX C6]`). With write tools added, the project-key check would be the ONLY thing between an anonymous caller and a service-role write that bypasses RLS. So `MCP_BEARER_TOKEN` MUST be SET in prod (the standing keystone check) **before** these tools deploy. This session does not ship its write tools until the bearer gate is live. Verify in task-04.
- **(b) Write hard-bound to the key's project.** The service-role write target is derived **solely** from the `mcp_key`→`project_id` lookup. **No payload/param/tool-arg field may carry a `project_id`** that could redirect the write to another project. The `item` arg carries item content only — never a target project. Verify with a negative test (task-02/04).

**Risk:** `mcp_key` leak in chat logs → single-project scope + regenerate-to-revoke; never a global token.

**Diff-review gate:** YES — changes the live MCP surface (RULE 1). Show the operator the `server.ts` diff (new tools + annotation changes) before pushing.
