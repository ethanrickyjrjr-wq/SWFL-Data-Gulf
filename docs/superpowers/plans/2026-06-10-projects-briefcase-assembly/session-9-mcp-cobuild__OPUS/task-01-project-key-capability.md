# Task 01 — Per-project capability key

**Files:** Create `app/api/projects/[id]/mcp-key/route.ts`. Modify `app/project/[id]/page.tsx` ("Connect your AI").

- [ ] **Step 1: Mint/regenerate route** — cookie client proves project ownership (RLS); generate a high-entropy key (e.g. `proj_` + 32 random bytes base64url); write `projects.mcp_key` via the owner's authenticated update (RLS-scoped). Regenerate overwrites → old key instantly invalid (= revoke). Support a DELETE to clear it.
- [ ] **Step 2: UI** — on `/project/[id]`, a "Connect your AI" panel that mints the key and shows a copy-paste snippet for the user's Claude, e.g.:

```
claude mcp add --transport http swfl-project https://www.swfldatagulf.com/api/mcp \
  --header "X-Project-Key: <key>"
```

(Confirm the real header/auth mechanism the MCP server reads — Task 02 wires the lookup; keep them consistent.)

- [ ] **Step 3: Scope statement** — the panel states plainly: this key scopes ONE project, write-only-into-items, regenerate to revoke. Show a "Regenerate (revokes old)" button.
- [ ] **Step 4: Verify** — mint a key; regenerate → old key rejected by the tools (Task 02); owner-only (account B can't mint for A's project).
- [ ] **Step 5: Commit.** `git add "app/api/projects/[id]/mcp-key/route.ts" "app/project/[id]/page.tsx" && git commit -m "feat(mcp): per-project capability key (mint/regenerate=revoke)"`
