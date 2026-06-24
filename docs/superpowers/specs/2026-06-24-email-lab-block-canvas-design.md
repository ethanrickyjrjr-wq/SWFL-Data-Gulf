# Email Lab — Block Canvas Design

**Date:** 2026-06-24  
**Status:** Draft  
**Scope:** Replace the static iframe email preview with a live, drag-and-drop block canvas while keeping the AI left panel intact.

---

## What we're building

Right now: AI prompt → token substitution → static HTML in an iframe. Zero user editing.

After: AI prompt → `EmailDoc` (JSON block array) → draggable, click-to-edit block canvas. User can reorder blocks, edit any field inline, add/remove blocks. Export still produces clean email HTML.

---

## Research findings (crawl4ai, 2026-06-24)

| Library | Version | React compat | Status | License |
|---|---|---|---|---|
| `@react-email/components` | 1.0.12 | **No peer dep lock** (React is `--external`) → React 19 safe | **Already installed** | MIT |
| `@react-email/render` | 2.0.9 | **No peer dep on React at all** — has browser + node + edge exports | **Already installed** (we have 2.0.8) | MIT |
| `@dnd-kit/core` | 6.3.1 | `>=16.8.0` → React 19 safe | New install | MIT |
| `@dnd-kit/sortable` | 10.0.0 | same | New install | MIT |
| `@usewaypoint/email-builder` | 0.0.9 | `^16 \|\| ^17 \|\| ^18` → **React 19 NOT listed** | Skip entirely | MIT |
| `@atlaskit/pragmatic-drag-and-drop` | 2.0.1 | framework-agnostic | Fallback if dnd-kit breaks | Apache-2.0 |

**Key discovery:** The project already has `@react-email/components` and `@react-email/render` installed and working — proven in `scripts/email/DigestEmail.tsx` + `build-digest.mts`. `@react-email/render` even has a browser export (`./dist/browser/index.mjs`), meaning `render()` works both server-side (API route) and client-side.

**Decision:** Block components use `@react-email/components` primitives (same pattern as `DigestEmail.tsx`). They render as-is in the browser DOM for the canvas view. Export calls `render()` server-side via the API route. Skip `@usewaypoint/email-builder` (React 19 conflict, unnecessary since react-email is already here). New install: `@dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities` only.

---

## Block types

Ten block types cover all existing templates:

| Type | What it renders | Key props |
|---|---|---|
| `header` | Logo + company name | `logoUrl`, `companyName`, `tagline`, `bgColor` |
| `hero` | Big number / kicker / prose | `kicker`, `value`, `label`, `prose` |
| `stats` | 2–3 KPI cells side by side | `stats: [{value, label}]` (2–3 items) |
| `signal` | Callout box with kicker + body | `kicker`, `title`, `body` |
| `text` | Paragraph of prose | `body`, `align` |
| `image` | Full-width photo | `url`, `alt`, `caption` |
| `agent-card` | Circular headshot + name + bio | `photoUrl`, `name`, `title`, `bio`, `phone`, `ctaUrl`, `ctaLabel` |
| `button` | Single centered CTA | `label`, `url`, `bgColor` |
| `divider` | Horizontal rule | `color` |
| `footer` | Company name + unsubscribe + address | `companyName`, `address`, `websiteUrl` |

---

## Data model

```typescript
// app/email-lab/types.ts

type BlockType =
  | "header" | "hero" | "stats" | "signal" | "text"
  | "image" | "agent-card" | "button" | "divider" | "footer";

interface EmailBlock {
  id: string;          // "block_" + nanoid(8)
  type: BlockType;
  props: Record<string, unknown>;  // type-narrowed per block
}

interface EmailGlobalStyle {
  primaryColor: string;    // e.g. "#0f1d24"
  accentColor: string;     // e.g. "#1BB8C9"
  fontFamily: "MODERN_SANS" | "BOOK_SERIF" | "GEOMETRIC_SANS";
  textColor: string;       // e.g. "#242424"
  backdropColor: string;   // e.g. "#F8F8F8"
}

interface EmailDoc {
  globalStyle: EmailGlobalStyle;
  blocks: EmailBlock[];    // ordered array — index = render order
}
```

Why ordered array and not the flat-map+childrenIds pattern from EmailBuilder.js: simpler for AI generation (no ID management), simpler for dnd-kit (`arrayMove` on the array), simpler for the HTML renderer to walk linearly. Our emails are linear — no nested containers needed.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ EmailLabClient (grid grid-cols-[340px_1fr] h-dvh)                        │
│                                                                           │
│  ┌──────── LEFT PANEL ─────────┐    ┌──────── RIGHT CANVAS ──────────┐  │
│  │                             │    │                                  │  │
│  │  AI Prompt Bar              │    │  BlockCanvas                    │  │
│  │  ├─ textarea                │    │  ├─ DndContext                  │  │
│  │  └─ "Fill with AI" button   │    │  │  └─ SortableContext          │  │
│  │                             │    │  │     ├─ SortableBlock (header)│  │
│  │  Brand colors               │ ←→ │  │     ├─ SortableBlock (hero)  │  │
│  │  Fine-tune accordion        │    │  │     ├─ SortableBlock (stats) │  │
│  │  (when no block selected)   │    │  │     └─ [+] AddBlockButton    │  │
│  │                             │    │  │                               │  │
│  │  BlockEditor panel          │    │  │  (click block → left panel   │  │
│  │  (when block selected)      │    │  │   switches to block editor)  │  │
│  │                             │    │                                  │  │
│  │  Export HTML button         │    │                                  │  │
│  └─────────────────────────────┘    └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Interaction model

- **Select block:** click anywhere on the block → left panel switches from fine-tune accordion to `BlockEditor` for that block. Canvas highlights the selected block with a ring.
- **Drag to reorder:** drag handle (≡ icon, top-left of each block) → `@dnd-kit/sortable` reorders `doc.blocks` array.
- **Edit field:** in the `BlockEditor` left panel, all props are editable fields (text inputs, color pickers, textareas). Changes are live — canvas re-renders on every keystroke.
- **Delete block:** trash icon on hover in the canvas, or a Delete button in BlockEditor.
- **Add block:** `[+]` button that appears between blocks and at the bottom. Opens a mini block-type picker (10 types, each with an icon and label). Adds a new block with default props.
- **Deselect:** click outside any block, or press Escape → left panel returns to fine-tune/AI mode.

---

## File map

### New files

```
app/email-lab/
  types.ts                    EmailDoc, EmailBlock, BlockType, per-block prop types
  BlockCanvas.tsx             DndContext + SortableContext, renders all blocks
  SortableBlock.tsx           useSortable wrapper: drag handle + selection ring + trash
  BlockEditor.tsx             Left-panel form for editing selected block's props
  AddBlockPanel.tsx           10-type mini palette, appears on [+] click
  blocks/
    BlockRenderer.tsx         Switch on block.type → correct block component
    HeaderBlock.tsx           uses @react-email/components: Section, Img, Text
    HeroBlock.tsx             uses Section, Text (kicker/value/label/prose)
    StatsBlock.tsx            uses Section, Row, Column, Text (2-3 KPI cells)
    SignalBlock.tsx           uses Section, Text (kicker + callout box)
    TextBlock.tsx             uses Section, Text
    ImageBlock.tsx            uses Section, Img
    AgentCardBlock.tsx        uses Section, Row, Column, Img, Text, Link
    ButtonBlock.tsx           uses Section, Button
    DividerBlock.tsx          uses Hr
    FooterBlock.tsx           uses Section, Text, Link

lib/email/
  EmailDocRenderer.tsx        <EmailDocEmail doc={doc}> — wraps blocks in Html+Body+Container
  default-docs.ts             10 starter EmailDoc templates (replaces TEMPLATES array)
```

**Note:** `BlockRenderer.tsx` and all block `.tsx` files in `app/email-lab/blocks/` are `"use client"` — they render in the browser DOM for the canvas. The same components are also used server-side in `EmailDocRenderer.tsx` (no `"use client"` directive — it's imported by the API route via `@react-email/render`).

### Modified files

```
app/email-lab/EmailLabClient.tsx
  - Remove: TEMPLATES array, DEFAULTS tokens, FINE_TUNE_GROUPS, fetchRender
  - Add: EmailDoc state, <BlockCanvas>, selectedBlockId state
  - Keep: AI prompt bar, brand color fields (wired to globalStyle), Export button

app/project/[id]/email-lab/ProjectEmailLabClient.tsx
  - Same swap: iframe → BlockCanvas

app/api/email-lab/ai/route.ts
  - System prompt now asks AI to return EmailDoc JSON (full doc, not token patches)
  - Response shape: { doc: EmailDoc }

app/api/email-lab/render/route.ts
  - Accept: { doc: EmailDoc }
  - Return: { html: string } from emailDocToHtml(doc)
```

---

## Rendering strategy — `@react-email` already installed

**Same pattern as `DigestEmail.tsx`** — already proven in production.

```typescript
// lib/email/EmailDocRenderer.tsx  (server component, used by API route)
import { Html, Body, Container } from "@react-email/components";
import { render } from "@react-email/render";
import { EmailDoc } from "./types";
import { BlockRenderer } from "./blocks/BlockRenderer";

export function EmailDocEmail({ doc }: { doc: EmailDoc }) {
  return (
    <Html lang="en">
      <Body style={{ backgroundColor: doc.globalStyle.backdropColor, margin: 0 }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#fff" }}>
          {doc.blocks.map(block => (
            <BlockRenderer key={block.id} block={block} globalStyle={doc.globalStyle} />
          ))}
        </Container>
      </Body>
    </Html>
  );
}

// In /api/email-lab/render/route.ts:
const html = await render(<EmailDocEmail doc={doc} />);
```

**Why this is better than writing our own HTML renderer:**
- `@react-email/components` already handles cross-client `<Section>` → `<table>`, `<Row>` → `<tr>`, inline styles, etc.
- Already tested in our DigestEmail.tsx (same library, same pattern)
- Zero new render logic to write or maintain
- The same block components used in the canvas DOM view produce the email HTML — one source of truth

**Canvas view (browser):** Block components use `@react-email/components` primitives and render directly in the DOM (no iframe). `<Section>` renders as a table, `<Text>` as a `<p>`, etc. This produces a visual email preview in-page that looks correct at 600px width.

**HTML export (server):** API route calls `render(<EmailDocEmail doc={doc} />)` — same `render()` used by `build-digest.mts` today.

---

## AI route update

Current: returns `{ tokens: Record<string, string> }` — patches only changed tokens.

New: returns `{ doc: EmailDoc }` — full document. AI generates the whole block list.

Updated system prompt structure:
```
You are an email builder for SWFL Data Gulf. 
Return a valid EmailDoc JSON with blocks array.
Available block types: header, hero, stats, signal, text, image, agent-card, button, divider, footer.

[LAKE DATA if scope provided]

[CURRENT DOC if user editing]

User: {{prompt}}
```

The AI generates a full `EmailDoc`. Client merges it into state (or replaces entirely). The AI doesn't need to know block IDs — we assign them on arrival.

For the project-aware version, the lake context is exactly the same as now — the `/api/b/master?tier=1` fetch is unchanged.

---

## dnd-kit integration

```typescript
// BlockCanvas.tsx (sketch)
import { DndContext, closestCenter, PointerSensor, useSensor } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";

function BlockCanvas({ doc, onChange, selectedId, onSelect }) {
  const sensors = useSensor(PointerSensor);

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIndex = doc.blocks.findIndex(b => b.id === active.id);
    const newIndex = doc.blocks.findIndex(b => b.id === over.id);
    onChange({ ...doc, blocks: arrayMove(doc.blocks, oldIndex, newIndex) });
  }

  return (
    <DndContext sensors={[sensors]} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={doc.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        <div className="max-w-[600px] mx-auto bg-white">
          {doc.blocks.map(block => (
            <SortableBlock
              key={block.id}
              block={block}
              globalStyle={doc.globalStyle}
              selected={block.id === selectedId}
              onSelect={() => onSelect(block.id)}
              onDelete={() => onChange({ ...doc, blocks: doc.blocks.filter(b => b.id !== block.id) })}
            />
          ))}
          <AddBlockButton onAdd={(type) => onChange(addBlock(doc, type))} />
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

```typescript
// SortableBlock.tsx (sketch)
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableBlock({ block, globalStyle, selected, onSelect, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} onClick={onSelect}
      className={`relative group ${selected ? "ring-2 ring-[#1BB8C9]" : ""}`}>
      {/* drag handle */}
      <div {...attributes} {...listeners}
        className="absolute left-1 top-2 opacity-0 group-hover:opacity-100 cursor-grab text-gray-400 z-10">
        ≡
      </div>
      {/* trash */}
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute right-1 top-2 opacity-0 group-hover:opacity-100 text-red-400 z-10">
        ✕
      </button>
      {/* the actual block */}
      <BlockRenderer block={block} globalStyle={globalStyle} />
    </div>
  );
}
```

---

## Phased delivery

### Phase 1 — Schema + renderer (no UI change, ~2 days)
- Write `app/email-lab/types.ts` with all block types and prop interfaces
- Write all 10 `app/email-lab/blocks/*.tsx` components using `@react-email/components`
- Write `lib/email/EmailDocRenderer.tsx` (wraps blocks in Html+Body+Container)
- Write `lib/email/default-docs.ts` (10 starter docs replacing current TEMPLATES array)
- Update `/api/email-lab/render` to accept `{ doc: EmailDoc }` → call `render(<EmailDocRenderer>)`
- Update `/api/email-lab/ai` system prompt to return `{ doc: EmailDoc }` JSON
- All existing tests + build must pass at end of phase

### Phase 2 — Static block canvas (no drag yet, ~2 days)
- Install `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- Write all 10 `blocks/*.tsx` visual components
- Write `BlockCanvas.tsx` (no dnd yet — just renders blocks)
- Replace `<EmailPreviewFrame>` in both EmailLab clients with `<BlockCanvas>`
- Left panel: remove token accordion, keep AI prompt + brand colors + Export
- Blocks are clickable — selection ring shows, left panel switches to stub BlockEditor

### Phase 3 — Drag-to-reorder (~1 day)
- Wire `DndContext` + `SortableContext` into BlockCanvas
- `SortableBlock.tsx` with drag handle
- `arrayMove` on drag end
- Verify no React 19 conflicts

### Phase 4 — Inline editing (~2 days)
- `BlockEditor.tsx` — renders a form per block type when block is selected
- Live preview: every field change updates `doc.blocks` state → canvas re-renders
- "Done editing" / Escape → deselects block, left panel returns to AI + brand mode

### Phase 5 — Add block palette (~1 day)
- `AddBlockPanel.tsx` — 10 block type buttons with icon + label
- Appears on `[+]` click (between blocks and at bottom)
- New block appended (or inserted at position) with default props

---

## What stays the same

- Left panel AI prompt bar and "Fill with AI" button
- `/api/email-lab/ai` route (same endpoint, updated response shape)
- Project-aware scope injection (ZIP, county, region → lake data)
- Export HTML button → copy to clipboard or download
- Brand color fields (mapped to `doc.globalStyle.primaryColor/accentColor`)
- Both clients: standalone `/email-lab` and project `/project/[id]/email-lab`

---

## What gets removed

- `TEMPLATES` array (replaced by `default-docs.ts`)
- `DEFAULTS` token object (replaced by per-block defaults in each starter doc)
- `FINE_TUNE_GROUPS` accordion (replaced by `BlockEditor` per-block forms)
- `fetchRender` (replaced by direct `emailDocToHtml` in the export path)
- `<EmailPreviewFrame>` on the Email Lab page (kept on deliverable `/p/[id]` pages, not affected)

---

## Risks / unknowns

| Risk | Mitigation |
|---|---|
| `@dnd-kit` React 19 runtime warnings | Peer dep says `>=16.8.0` — should be fine. Test in Phase 3. If it breaks, swap to `@atlaskit/pragmatic-drag-and-drop` (Apache-2.0, framework-agnostic, no React dep at all). |
| AI hallucinating bad EmailDoc JSON | Parse with try/catch; fallback to current doc. Schema validation at parse time. |
| Email HTML cross-client rendering | Patterns extracted from our existing templates (already tested). Add new blocks conservatively — table layout only. |
| Phase 1 breaks existing Email Lab | API route accepts both old `{ template, tokens }` and new `{ doc }` shape during transition. Drop old shape after Phase 2 ships. |
| `@react-email/components` renders differently in DOM vs email HTML | These components are designed to render in both environments. Canvas uses DOM render (visual). Export uses `render()` server-side (email HTML). Divergence is intentional: canvas is approximate, export is authoritative. |
| Block components have `"use client"` but `EmailDocRenderer.tsx` is server-only | Block components should NOT have `"use client"` — they're shared. If a block needs client state (e.g. hover for drag handle), that state lives in `SortableBlock.tsx` which wraps the block, not in the block itself. |
