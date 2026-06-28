# Section Map - where everything lives

**As-of:** 06/28/2026.
**Provenance:** directory/file counts + import-edge coupling measured this date (ripgrep import scan,
in docs/superpowers/specs/2026-06-28-repo-focus-restructure-analysis.md section 1b). This doc is the
stable architectural map; graphify is the live detail (see 'Live graph').

**Verdict:** the TypeScript code (app + lib + refinery + lib/assistant) is ONE tightly-coupled organism
(1,000+ cross-edges). Do NOT split it into packages/workspaces. Only ingest/ (Python), brains/ (md),
mcp-widget/, and docs/ are cleanly separable - and they already are.

## The platform (code + content)

```text
app/          Next.js App Router - pages, REST + MCP API        (~355 files)
lib/          Shared TS helpers - THE HUB (in-degree ~684)       (~505)
refinery/     Brain factory: packs, stages 1-4, validators, vocab (~400)
ingest/       Python dlt ingest pipelines, one per source        (~404)
components/   React UI components                                  (~99)
brains/       Compiled brain outputs, one .md per brain            (~38)
docs/         Standards, blueprints, plans, specs                 (~739)
scripts/      Operational scripts                                  (~88)
```

## The 5 sections (by import coupling)

1. WEBSITE - app/ (pages + app/api/*), components/, lib/landing, lib/map, lib/zip-summary, lib/citations.
2. EMAIL / DELIVERABLES - lib/email, lib/deliverable, templates/, app/email-lab.
3. MCP / ANSWER-ENGINE - app/api/mcp, mcp-widget/, lib/assistant, refinery/lib/rules-of-engagement.mts.
4. DATA-INGEST - ingest/ (Python island, zero TS coupling), .github/workflows, ingest/cadence_registry.yaml.
5. BRAINS / REFINERY - refinery/ (packs, stages, validators, vocab), brains/.

## Coupling (measured 06/28/2026 - regenerate via graphify for live numbers)

```text
app/          -> lib/         339 edges
components/   -> lib/          98
lib/          -> lib/         244  (internal)
lib/          -> refinery/     87  (+ app/ -> refinery/  43)
refinery/     -> refinery/    728  (internal)
refinery/     -> app|components  0  (clean one-way: nothing upstream depends on the UI)
lib/assistant -> refinery     direct (compose-chart.ts, conversation-path.ts)
```

- Hub: lib/ (in-degree ~684). Most sections route through it - change it carefully.
- Clean boundary: refinery -> app/components = 0. The brain factory never imports the UI.

## Separable vs one organism

- One organism (do NOT package-split): app + lib + refinery + lib/assistant.
- Cleanly separable (already are): ingest/ (Python), brains/ (md), mcp-widget/, docs/.

## Non-code working dirs at root

Remaining at root (active / load-bearing):
- SOCIAL BUILD/ - actively building ([~] in build-queue); 2 open social_* checks.
- GO-LIVE/ - operator parallel-session files (per ENGINE-HANDOFF.md).
- GET DONE/ - TURN SYSTEM ON.md (live launch runbook) + contacts-phone-import.md (open contacts checks).

Relocated to docs/_archive/ on 06/28/2026 (git mv, history preserved):
- superseded/: final-boss, homepage (demo kit; revival banner in its HANDOFF), live-data, todo (significance-gate + phase-F).
- parked/: site-flow-build (B6 pending), unknown (patch stash), get-done (email-audience + pdf-template), todo (mcp-mini-site).
- shipped ingest specs -> docs/superpowers/specs/_archive/ (dlt-faf5, ingest-pipelines, bls-qcew, duckdb-parquet, census-acs).

## Live graph (graphify)

graphify builds the cross-section dependency graph into graphify-out/ (gitignored, ~31 MB): graph.json,
app-graph.json, and a human-readable GRAPH_REPORT.md.

Regenerate - the verified repo scripts (run these, NOT the bare CLI):

```
bun run graphify:update                # full rebuild: graphify update . + app-plane nodes
node scripts/graphify-app-nodes.mjs    # app-plane only (~1s)
```

Read it without a CLI: open graphify-out/GRAPH_REPORT.md, or query graphify-out/graph.json directly.
The graphify query/path/explain verbs are the global graphify Python CLI (not a repo dep) and only work
where that CLI is installed and functioning - else fall back to Grep/Glob/Read.
