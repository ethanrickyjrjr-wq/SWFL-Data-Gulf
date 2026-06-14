# Task 07 — Build all 4 templates + close `deliverable_anchor_lint`

- [ ] **Step 1: Seed a project** with mixed items (a chart ref, 3 metrics with tokens, a qa, a source, a note).
- [ ] **Step 2: Build each template** (`market-overview`, `bov-lite`, `client-email`, `one-pager`) → each returns a working `/p/[id]` URL in a few seconds; provenance appears under every exhibit; logged-out render works; print is clean.
- [ ] **Step 3: Poisoned-narrative unit test green** (Task 04) — the anchor lint catches an invented number and the strip removes it. This is the prod-evidence the check needs: the guarantee is *structural*, demonstrated by the test, not "the model was careful."
- [ ] **Step 4:** Confirm the jargon scrub strips a planted `dossier`/`master` leak.
- [ ] **Step 5: Ship** (after operator diff-review of the build route + system prompt). Then close:

```bash
node scripts/check.mjs close deliverable_anchor_lint "poisoned-narrative test green: invented number flagged+stripped; jargon scrub strips master/dossier; all 4 templates build to /p/ in <8s"
```

Build-queue: append + mark the assembly-engine line `[x]`.
