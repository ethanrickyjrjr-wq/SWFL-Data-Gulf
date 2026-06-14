# Task 02 — `lib/deliverable/templates.ts` (deterministic scaffolds)

**Principle:** content separate from template → restyle = re-render (no new LLM call, Task 06). A template is a deterministic function mapping the narrative + item kinds → ordered slots. **The LLM never picks the structure** — it only fills connective prose into the slots the template defines.

**Files:** Create `lib/deliverable/templates.ts`. Test: `lib/deliverable/templates.test.ts`.

- [ ] **Step 1: Define the template registry.** Four genres (named genres the CRE industry already buys — Firecrawl research pass):
  - `market-overview` — exec summary → sections (one assertion each) → all exhibits → sources.
  - `bov-lite` (Broker Opinion of Value) — branding cover → subject context → comparable data → value narrative → assumptions + sources.
  - `client-email` — subject line + pyramid-first body (answer first) + exhibit links.
  - `one-pager` — exec summary + ≤2 exhibits + 3 stats, fits one print page.

```ts
export type TemplateId = "market-overview" | "bov-lite" | "client-email" | "one-pager";
export interface Slot { kind: "exec_summary" | "section" | "exhibit" | "stat" | "sources" | "branding"; /* + payload refs */ }
export interface RenderModel { template: TemplateId; branding?: object; slots: Slot[]; inference_notes: string[]; }
export function buildRenderModel(template: TemplateId, narrative: Narrative, items: ProjectItem[], branding?: object): RenderModel { /* deterministic mapping */ }
```

- [ ] **Step 2:** Each template deterministically routes item kinds → slots (e.g. `chart`/`table_slice` → exhibits, `metric` → stats, `qa` → section intros' backing, `source` → sources list, `note` → inline context, `file` → appendix). No LLM here.

- [ ] **Step 3: Test** — given a fixed narrative + items, `buildRenderModel("one-pager", …)` yields ≤2 exhibits + 3 stats; `bov-lite` puts branding first; output is pure/deterministic (same input → same model).

- [ ] **Step 4: Commit.** `git add lib/deliverable/templates.ts lib/deliverable/templates.test.ts && git commit -m "feat(deliverable): 4 deterministic templates (content separate from template)"`
