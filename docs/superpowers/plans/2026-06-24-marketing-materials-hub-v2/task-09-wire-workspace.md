### Task 9: Wire ProjectWorkspace + refactor DeliverableLanes

**Model:** Opus (refactor judgment — orphans the modal + handlers; `runBuild` navigates away) · **Depends on:** all prior. **Touches `page.tsx` (T1) + `ProjectWorkspace.tsx` — do LAST, never in parallel.**

**Files:**
- Modify: `app/project/[id]/ProjectWorkspace.tsx` (render hub; handlers; `ui_state` collapse)
- Modify: `app/project/[id]/workspace/DeliverableLanes.tsx` (strip Built lane → schedules-only)
- Modify: `app/project/[id]/page.tsx` (only if `ui_state` isn't already passed to the workspace)

**Interfaces:**
- Consumes: `<MaterialsHub>` (Task 8); the materials/refresh/ai-material endpoints (Tasks 2/3/4); `useRouter().refresh()`.
- Produces: the hub rendered above a collapsed filed-data board; `DeliverableLanes` reduced to a schedules-only lane.

---

- [ ] **Step 1: Read the current ProjectWorkspace render + handlers**

Open `app/project/[id]/ProjectWorkspace.tsx`. Note: `runBuild` returns `void` and `window.location.assign('/p/${data.id}')` on success (~287) — **do NOT append post-build logic to it.** Note the deliverables prop is named `deliverables` (not `initialDeliverables`), and the current order: `ItemsBoard` → `UploadDrop` → `DeliverableLanes` → `BuildActions`.

- [ ] **Step 2: Add hub handlers (router.refresh, not GET)**

```tsx
import { useRouter } from "next/navigation";
const router = useRouter();

async function handleRefreshMaterial(did: string) {
  const res = await fetch(`/api/projects/${id}/materials/${did}/refresh`, { method: "POST" });
  if (res.ok) router.refresh(); // re-runs the server component → fresh heads via splitDeliverableVersions
}

async function handleAiMaterial(intent: string) {
  const res = await fetch(`/api/projects/${id}/ai-material`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent }),
  });
  if (!res.ok) return null;
  const data = await res.json();           // { id, template: { id, name } }
  router.push(`/project/${id}/email-lab?did=${data.id}`); // open the new material to edit
  return data;
}
```

- [ ] **Step 3: Render the hub + collapse filed data via `ui_state`**

Replace the old `ItemsBoard`/`DeliverableLanes(Built)` block. `materials` = the `deliverables` prop (already heads from `splitDeliverableVersions`). Use a `ui_state` key for the collapse (persist through the existing ui_state PATCH mechanism — find how the file already writes `projects.ui_state`):

```tsx
const filedCollapsed = uiState.materials_filed_collapsed ?? false;

<MaterialsHub
  projectId={id}
  materials={deliverables}
  onRefresh={handleRefreshMaterial}
  onAiMaterial={handleAiMaterial}
/>

<DeliverableLanes emailSchedules={emailSchedules} />  {/* schedules-only after Step 5 */}

<details open={!filedCollapsed} onToggle={(e) => persistUiState({ materials_filed_collapsed: !(e.target as HTMLDetailsElement).open })} className="mt-6">
  <summary className="cursor-pointer text-sm text-white/35 hover:text-white/60 select-none">Filed data · {items.length} items</summary>
  <div className="mt-3">
    <ItemsBoard items={items} charts={charts} fileUrls={fileUrls} localPreviews={localPreviews}
      onMove={move} onRemove={removeById} changesByItemId={changesByItemId} confirmingId={confirmingId} onKeepMine={keepMine} />
    <UploadDrop projectId={id} fileCount={fileItemCount} onUploaded={addFileItem} />
  </div>
</details>

<BuildActions id={id} template={template} onTemplate={setTemplate} onBuild={() => runBuild()} building={building} buildError={buildError} itemCount={items.length} />
```

Pass the **real** props each child requires (read the components — `ItemsBoard`, `UploadDrop`, `BuildActions` each have several non-optional props; don't omit any). Reuse the names already in scope in this file.

- [ ] **Step 4: `persistUiState` key**

If the file already has a ui_state setter, add the `materials_filed_collapsed` key through it (additive — never repurpose an existing `ProjectUiState` key; see `workspace/types.ts:78-88`). If not, PATCH `/api/projects/${id}` with the merged `ui_state` as the file does for other keys.

- [ ] **Step 5: Refactor `DeliverableLanes` to schedules-only**

In `app/project/[id]/workspace/DeliverableLanes.tsx`: remove the "Built deliverables" `<section>` (now the hub's job), the `<DeliverableModal>` and its `openId` state, and the `onRefresh/onEdit/onTrash`/`handleRefresh/handleEdit/handleTrash`/`optimistic` machinery + the `deliverables`/`trashedDeliverables`/`items`/`projectBranding`/`mcpConnected`/`onConnectMcp`/`onToggleRevoke` props. Shrink the prop interface to `{ emailSchedules: EmailScheduleRow[] }` and keep the existing `emailSchedules.length > 0` guard (renders nothing when empty — no empty state until the scheduler spec ships). Rename the section header to "Scheduled sends".

- [ ] **Step 6: Verify build + full test suite**

Run: `bunx next build && bun test`
Expected: build clean; all tests green (existing suites unchanged + the new pure-logic/UI tests).

- [ ] **Step 7: Manual verify (dev) — acceptance walk**

Per spec acceptance criteria: hub renders above filed data; intent line builds a material; a seed card opens the lab; Save creates a library row; ↻ forks a version and the row shows "Updated N×"; a >30-day material shows the amber "Update"; filed-data collapse persists across reload.

- [ ] **Step 8: Commit**

```bash
git add "app/project/[id]/ProjectWorkspace.tsx" "app/project/[id]/workspace/DeliverableLanes.tsx" "app/project/[id]/page.tsx"
git commit -m "feat(materials-hub): wire MaterialsHub into workspace; DeliverableLanes → schedules-only"
```
