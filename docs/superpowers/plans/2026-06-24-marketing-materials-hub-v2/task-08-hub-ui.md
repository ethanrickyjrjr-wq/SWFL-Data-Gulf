### Task 8: Hub UI — Create rail + list-default Library + version accordion

**Model:** Sonnet — but **build strictly to the spec's "Visual design" section** (those are decisions, not guesses). · **Depends on:** Tasks 2, 3, 6 (uses their endpoints + `getMaterialStatus`/`getFormatBadge`).

**Files:**
- Create: `components/project/MaterialsHub.tsx` (the section: create rail over library)
- Create: `components/project/IntentLine.tsx` (the hero input + progress state machine)
- Create: `components/project/TemplateRail.tsx` (the 6 seed cards + report-template group)
- Create: `components/project/MaterialRow.tsx` (a library row: swatch bar + badge + status + version accordion)
- Create: `components/project/MaterialRow.test.tsx` (renders title + version-count affordance)

**Interfaces:**
- Consumes: `DeliverableRow` from `@/app/project/[id]/workspace/types`; `getMaterialStatus`/`getFormatBadge` from `@/lib/deliverable/material-status`; `SEED_DOCS` from `@/lib/email/doc/default-docs`.
- Produces: `<MaterialsHub projectId materials onRefresh onAiMaterial />` rendered by Task 9. `materials` are heads (with `.versions`).

> Read the spec's **Visual design (gaps 1–6)** before writing any JSX. Palette: base `#0d1e2b`, accent `#1BB8C9`, hairlines `white/8`, text `white/85`, muted `white/35–50`. Boldness only on the intent line.

---

- [ ] **Step 1: IntentLine — the hero (Gap 2 state machine)**

```tsx
// components/project/IntentLine.tsx
"use client";
import { useState } from "react";

type Phase = { k: "idle" } | { k: "picking" } | { k: "filling" } | { k: "done"; name: string } | { k: "fail" };

export function IntentLine({ onSubmit }: { onSubmit: (intent: string) => Promise<{ template: { name: string }; id: string } | null> }) {
  const [intent, setIntent] = useState("");
  const [phase, setPhase] = useState<Phase>({ k: "idle" });

  async function go() {
    if (!intent.trim()) return;
    setPhase({ k: "picking" });
    setTimeout(() => setPhase((p) => (p.k === "picking" ? { k: "filling" } : p)), 600);
    const res = await onSubmit(intent.trim());
    if (res) setPhase({ k: "done", name: res.template.name });
    else setPhase({ k: "fail" });
  }

  const busy = phase.k === "picking" || phase.k === "filling";
  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d1e2b]/80 px-3 py-2 focus-within:ring-2 focus-within:ring-[#1BB8C9]/40">
        <span className="text-[#1BB8C9]">✦</span>
        <input
          value={intent} onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()} disabled={busy}
          placeholder={`What's this for? — e.g. "just listed 123 Gulf Blvd" or "April market update"`}
          className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/30 focus:outline-none"
        />
        <button onClick={go} disabled={busy} aria-label="Build"
          className="text-[#1BB8C9] disabled:opacity-40">→</button>
      </div>
      {phase.k !== "idle" && (
        <p className="mt-1.5 text-xs text-white/45" aria-live="polite">
          {phase.k === "picking" && "Picking a template…"}
          {phase.k === "filling" && "Filling in your numbers…"}
          {phase.k === "done" && <span className="text-[#1BB8C9]">Built a {phase.name} ✓</span>}
          {phase.k === "fail" && "Couldn't build that one automatically — pick a starter below."}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TemplateRail — the 6 seeds + report group (Gap 1 create rail)**

Map `SEED_DOCS` to compact chips (`name` + `description`) linking to `/project/${projectId}/email-lab?seed=${s.id}`. Below, a quieter "…or build a report" group for the report templates (link to the existing report build flow). When the intent line failed, the parent passes a `highlight` flag → one-pulse teal outline on the chips (Gap 2 failure path).

- [ ] **Step 3: MaterialRow test (TDD-lite)**

```tsx
// components/project/MaterialRow.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, test, expect } from "bun:test";
import { MaterialRow } from "./MaterialRow";

const base = { id: "d1", template: "block-canvas", status: "ready", created_at: new Date().toISOString(),
  scope_kind: null, scope_value: null, exec_summary: null, preview_chart: null, branding: null,
  deleted_at: null, supersedes_id: null, item_ids: [], doc: { globalStyle: { accentColor: "#1BB8C9" }, blocks: [{ type: "hero", props: { label: "Just Sold · Cape Coral" } }] } as any, data_as_of: new Date().toISOString() };

describe("MaterialRow", () => {
  test("shows derived headline title", () => {
    render(<MaterialRow d={{ ...base, versions: [] }} projectId="p1" onRefresh={async () => {}} />);
    expect(screen.getByText(/Just Sold · Cape Coral/)).toBeTruthy();
  });
  test("shows 'Updated N×' when versions exist", () => {
    render(<MaterialRow d={{ ...base, versions: [base as any] }} projectId="p1" onRefresh={async () => {}} />);
    expect(screen.getByText(/Updated 1/)).toBeTruthy();
  });
});
```

- [ ] **Step 4: MaterialRow — swatch + badge + status + version accordion (Gaps 3, 4)**

Build to the spec: a **4px left bar** colored `d.doc?.globalStyle?.accentColor ?? getFormatBadge(d.template).color`; derived title (`hero.label → hero.value → header.tagline`, fallback `"{badge.label} · {Mon YYYY}"`); the format badge; `getMaterialStatus(d)` → amber "Update" affordance only when `needs_update`; a right-aligned `Updated N× ⌄` `<button aria-expanded>` when `d.versions.length > 0` that expands indented, recessed sub-rows (date + Open + Trash). Row click opens the material (`block-canvas` → `/project/${projectId}/email-lab?did=${d.id}`; else `/p/${d.id}`). The ↻ action calls `onRefresh(d.id)`.

- [ ] **Step 5: MaterialsHub — assemble (Gap 1 hierarchy + Gap 6 empty state)**

Elevated create-rail panel (`bg-[#0d1e2b]/70`, 1px top border `#1BB8C9/30`, rounded-xl) holding `<IntentLine>` + `<TemplateRail>`; below, a flat "Materials · N" header + the **list-default** of `<MaterialRow>` (grid toggle optional). Empty library → the guided dashed panel from Gap 6 ("Start your first piece — describe it above, or pick a template."), not "No materials yet."

- [ ] **Step 6: Run tests + build**

Run: `bun test components/project/MaterialRow.test.tsx && bunx next build`
Expected: tests pass; build clean.

- [ ] **Step 7: Commit**

```bash
git add components/project/MaterialsHub.tsx components/project/IntentLine.tsx components/project/TemplateRail.tsx components/project/MaterialRow.tsx components/project/MaterialRow.test.tsx
git commit -m "feat(materials-hub): hub UI — intent line, template rail, list library, version accordion"
```
