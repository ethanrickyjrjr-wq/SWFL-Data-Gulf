# Task 04 — Their-Claude end-to-end verify + close `mcp_project_tools_live_verify`

**Why:** the co-build promise is only real when a separate Claude, using only the capability key, can drive the full loop (`feedback_checks-prod-evidence-not-dev-attestation`).

- [ ] **Step 0 `[LB-R6a]`: confirm the bearer gate is enforced in prod.** `MCP_BEARER_TOKEN` is SET; an unauthenticated `tools/call` (no/incorrect bearer) is rejected by `auth.ts` BEFORE any tool runs. Do not ship/verify the write tools onto an open server.
- [ ] **Step 1: Ship** (after the operator's MCP diff-review OK), per `../shared/conventions.md`.
- [ ] **Step 2: Connect a real second Claude** to the deployed MCP with a freshly minted project key (the snippet from Task 01).
- [ ] **Step 3: Full flow** — have that Claude: `swfl_fetch` a dossier → `swfl_project_add` 2 metrics (verbatim value/source/token) + a note → confirm the **web UI** shows them live with an `origin:'mcp'` badge → `swfl_project_build` → returns a working `/p/[id]` URL that renders.
- [ ] **Step 4: Negatives** — a bad/expired key → clean error, no write. Regenerate the key (Task 01) → the old key is rejected. Dedupe → filing the same metric twice yields one item. **`[LB-R6b]`:** an `add` call whose payload tries to target a different `project_id` writes ONLY to the key's project (smuggled field ignored).
- [ ] **Step 5: Close** with evidence:

```bash
node scripts/check.mjs close mcp_project_tools_live_verify "prod: 2nd Claude fetch->add(2 metrics+note, origin:mcp)->build returned working /p/ URL; bad key clean error; regenerate revokes; dedupe works"
```

Build-queue: append + mark MCP co-build `[x]`. **This is the last session — the full arc (highlight → file → assemble → deliver → co-build) is now live.**
