# Task 02 — Three project tools on the MCP server

**Context (verified):** `app/api/mcp/server.ts` registers a single `swfl_fetch` tool (`server.registerTool(...)` ~line 213) with `readOnlyHint:true` (~245). Add three project tools whose zod input mirrors `lib/project/items.ts`. **Each does a project-key lookup FIRST**, then writes via service-role (the documented second capability-authorized lane). Items written get `origin:'mcp'`.

**Files:** Modify `app/api/mcp/server.ts`.

- [ ] **Step 0 `[LB-R6a]`: confirm the bearer gate is live before coding writes.** `MCP_BEARER_TOKEN` must be SET in prod (the MCP server is unauthenticated otherwise — `[AUDIT-FIX C6]`). Do not deploy write tools onto an open server. If the token isn't set yet, that keystone lands first (it's the standing `Smallest paid path` check). Verified again in task-04.

- [ ] **Step 1: Key→project resolver `[LB-R6b]`** — a helper that takes the `project_key` arg (or the `X-Project-Key` header — match Task 01) → looks up the `projects` row by `mcp_key` (service-role) → returns the project or a clean "invalid/expired key" error. No key match = no write. **The returned `project.id` is the ONLY write target** for everything downstream — it is derived solely from the key. **No tool arg carries a `project_id`**; the `item`/`template`/`instruction` args carry content only. A request cannot name another project to write to.

- [ ] **Step 2: `swfl_project_list { project_key }`** → returns the project title + condensed items (no internal ids beyond what's needed).

- [ ] **Step 3: `swfl_project_add { project_key, item }`** — `item` zod-restricted to `note | metric | qa | report | chart_block`:
  - `chart_block` → `lintChartBlock` (provenance-checked against the named report's dossier when a `report` is given) → insert into `saved_charts` → store as a `{kind:"chart", chart_id}` ref.
  - others → validate with `projectItemSchema`, stamp `origin:'mcp'`, `id`, `added_at`.
  - **`[ADDED]` dedupe:** before appending, drop a new item that matches an existing one by `(kind, report_id, label, value)` (for metric/qa) so a co-building Claude filing twice doesn't spam the project.
  - Tool description (the prompt the user's Claude reads): *"File metrics with the exact value, source url, and freshness_token from the dossier you just fetched — verbatim, never recomputed."*
  - Append to `projects.items` (service-role update, scoped to the resolved project id only). Meter `item_add` to the owner.

- [ ] **Step 4: `swfl_project_build { project_key, template, instruction? }`** → calls `lib/deliverable/build.ts` (S6) for the resolved project → returns the `/p/[id]` URL. Meter `build` to the owner.

- [ ] **Step 5: Tests** — extend the MCP server tests: valid key adds an item visible in the web UI with `origin:'mcp'`; bad/expired key → clean error (no write); dedupe drops the second identical metric; build returns a working URL. **`[LB-R6b]` negative test:** key for project X + an item payload that tries to smuggle a `project_id` for project Y → the write still lands ONLY on X (the smuggled field is ignored — there is no code path that reads a target project from the payload).

- [ ] **Step 6: Commit (hold for diff review).** `git add app/api/mcp/server.ts && git commit -m "feat(mcp): swfl_project_list/add/build (capability-keyed writes, origin:mcp, dedupe)"`
