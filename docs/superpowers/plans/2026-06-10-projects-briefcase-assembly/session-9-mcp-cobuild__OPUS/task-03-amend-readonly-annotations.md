# Task 03 — Amend the "read-only" promise (A7)

**Context (verified):** `server.ts:59` says in prose "This server is read-only"; the `swfl_fetch` tool sets `readOnlyHint:true` (~245). With write tools added, that blanket claim is now false. Narrow it — don't delete it.

**Files:** Modify `app/api/mcp/server.ts`.

- [ ] **Step 1:** Update the prose at ~line 59 to: *"`swfl_fetch` is read-only. The `swfl_project_*` tools write into a single project you authorize with a per-project capability key."*
- [ ] **Step 2: Per-tool annotations** — `swfl_fetch` keeps `readOnlyHint:true`. The three new tools set `readOnlyHint:false` (and `destructiveHint:false`, `idempotentHint` per each — `add` is non-idempotent, `build` non-idempotent, `list` read-only-ish but it's a write-capable surface). Match the annotation fields the MCP SDK version in use supports (verify against the registered shape already in the file).
- [ ] **Step 3:** Confirm the bearer behavior is untouched — `MCP_BEARER_TOKEN`/`auth.ts` still gates the transport exactly as before (`[AUDIT-FIX C6]`); the project key is an *additional* per-call authorization, not a replacement.
- [ ] **Step 4: Commit.** `git add app/api/mcp/server.ts && git commit -m "feat(mcp): narrow read-only promise to swfl_fetch; annotate write tools (A7)"`
