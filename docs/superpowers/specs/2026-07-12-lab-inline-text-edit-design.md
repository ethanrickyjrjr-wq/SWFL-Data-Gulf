# Click-to-type inline editing on the Email Lab grid canvas

**Date:** 2026-07-12
**Status:** Approved design (Approach A + sources carve-out, operator 07/12/2026)
**Check:** `lab_inline_text_edit_live_verify`

## Problem

The grid canvas is select-only. Every block's rendered content sits inside a
`pointer-events-none` wrapper (`components/email-lab/GridCanvas.tsx` — the inner
content div), so a click can never reach the text; it selects the block and nothing
else. The only text-edit path is the right-rail Block Inspector, which renders BELOW
the Build-with-AI section in a scrollable rail and is never scrolled into view on
select — on a normal screen the editor is invisible and the lab reads as "I can't
change the text."

**Debt trail (why this wasn't built the first time):**
- 06/24 block-canvas spec audit #6: "'Inline editing' mislabels a side panel" →
  renamed to Block Inspector; true in-canvas text editing demoted to a post-v1 option.
- 06/28 full-upgrade spec: "Per-block AI and inline WYSIWYG — other session." The
  per-block AI shipped; the inline-WYSIWYG session never happened.
- `2026-06-28-email-lab-block-editing-design.md` was left an empty stub.
- No `checks` entry was ever opened (pre-dates RULE 2.4), so no session was reminded.

This build pays that debt.

## Goal

Click any text on the canvas and type in place — same font, same position, a caret
in the actual email. On-canvas access to the panel-only fields (link, color, photo)
from the selected block's pill. The sent email is byte-identical to today. The AI's
authoring/patching contract does not change at all.

## What we're building

### 1. `EditableText` — one shared canvas-editing primitive

New pure module `lib/email/blocks/editable-text.tsx`:

- A `CanvasEditContext` (React context, default `null`). The grid canvas provides
  `{ commit(blockId, path, nextText) }`; the send/export paths provide nothing.
- `<EditableText value path style as … />` renders the text node. Context absent
  (server `render()`, `emailRender`, compile-grid) → plain static markup, exactly
  today's bytes. Context present (canvas DOM) → the same node with
  `contentEditable` + `suppressContentEditableWarning`.
- **Uncontrolled while editing** (the react.dev contentEditable rule, verified
  in-session 07/12/2026): the node is never re-rendered with new children mid-edit.
  Commit on blur; Escape reverts to the pre-edit value; Enter inserts a newline only
  where the field is multi-line (`whiteSpace: pre-line` fields), otherwise commits.
- Committing an empty string keeps the slot OPEN per the seed slot rule — an empty
  field stays an instruction to the AI, never a hole in the sent email (existing
  canvas-only empty-state placeholder pattern shows a hint on canvas only).
- Plain text only. No bold/italic runs, no rich-text framework (Lexical/Tiptap
  rejected — every field is a plain string in the doc model).

### 2. Prop-path binding — inline edits ARE inspector edits

Each visible text node binds to exactly the prop the inspector edits today:
`text.body`, `hero.kicker/value/label/prose`, `signal.kicker/title/body`,
`image.caption/overlayTitle/overlayBody`, `button.label`, `stats[i].value/label`,
`list.title` + `items[i].lead/text`, `multi-column columns[i].heading/body`,
`listing price/beds/baths/sqft/address/badge`, `metric-card` fields,
`header companyName/tagline`, `agent-card`/`agent-hero` text, `footer` lines.
Commits flow through the same `updateBlock` → `commit()` path the inspector uses:
same undo frame, same auto-height ResizeObserver reflow, same doc state.

**Carve-out — `sources` block is not inline-editable.** It has no inspector case
today either: citations are machine-written provenance, and hand-editing a source
label/URL manufactures a citation. This preserves an existing invariant rather than
adding a new gate. The metric card IS editable — the inspector already exposes its
fields as user-owned, and a figure the user writes in is a legitimate source lane.

### 3. Canvas pointer policy (`GridCanvas.tsx`)

- Replace the blanket `pointer-events-none` content wrapper with normal pointer flow;
  block select keeps working via bubbling to the `GridBlock` wrapper.
- Single click = select the block AND place the caret where you clicked (no
  double-click step; the trigger the operator reached for in the wild).
- `onClickCapture` on the wrapper intercepts every `<a>` inside the canvas
  (`preventDefault`) so linked blocks/rows never navigate mid-design.
- No drag conflict: drag is handle-scoped (`.drag-handle`) — verified against the
  live react-grid-layout 2.2.3 README (07/12/2026): `DragConfig { enabled, bounded,
  handle?: string, cancel?: string, threshold }`. `cancel` is available as
  belt-and-suspenders on editable nodes if needed.
- Resize handles (e/w) are separate DOM elements — untouched.

### 4. The block pill grows — panel-only fields on canvas

The selected block's action pill (✦ / ◧ / ⧉ / ✕ today) gains small anchored
popovers so links, colors, and photos never require the right rail:
- **Link** — edits the block's `linkUrl` (only on types that have one).
- **Color** — background swatch (`sectionBg` / `bgColor` where the type has it).
- **Photo** — the existing ◧ Photopea/Photos flow (already shipped; unchanged).

### 5. Right rail stays, and gets the discoverability fix

The Block Inspector remains (it is still the home for alt text, social platform
rows, footer plumbing, flip-side, etc.). On block select, the rail auto-scrolls the
"Now editing" section into view — the small fix rides along.

### 6. Phone + tier

Tap = select + caret (contentEditable works on touch); no new phone furniture.
No tier gate: inline editing is core canvas behavior on both tiers — builds are
free, send is the paywall.

## AI contract — explicitly unchanged

- The AI content-patch allowlist (message content only; links/colors/prices/brand
  are user-owned and stripped) is untouched.
- Per-block AI (✦) and Build-with-AI behave exactly as today.
- User-typed text becomes "the current answer" in the AI's view of the doc —
  identical semantics to a panel edit today.
- All build/send fences, coherence gates, voice guard, and no-invention lint run
  unchanged. Sent HTML is byte-identical (parity test below).

## Non-goals

- Rich text formatting (bold/italic/size runs) — fields stay plain strings.
- Editing the sources block.
- Any change to AI authoring, patching, or fencing.
- A free/paid capability split for editing.

## Test plan

- `bun:test` on `EditableText`: blur commits, Escape reverts, empty commit keeps the
  slot open, multi-line vs single-line Enter behavior.
- **Render parity:** server `render()` of a fixture doc before/after the helper —
  byte-identical email HTML (extends `EmailDocRenderer.test.ts`).
- Canvas interaction: a click on a linked block never navigates; caret lands on
  single click; drag-by-handle still works with an editable node under the pointer.
- Pill popovers write `linkUrl` / `sectionBg` through the same commit path (undo works).
- Verify with `bunx next build` (never `npx tsc`).

## Research (in-session, crawl4ai, 07/12/2026)

- **react-grid-layout 2.2.3** (live README, github.com/react-grid-layout/react-grid-layout):
  `DragConfig { enabled: boolean; bounded: boolean; handle?: string; cancel?: string;
  threshold: number }` — drag is already handle-only in our canvas; editable text
  cannot start a drag.
- **react.dev** (reference/react-dom/components/common, live): React warns on
  children + `contentEditable={true}` because React cannot update content after user
  edits; `suppressContentEditableWarning` is the sanctioned escape hatch for
  manually-managed text input — hence uncontrolled-while-editing, commit-on-blur.
- Beefree support article on text editing 404'd (site restructure); single-click-to-
  type is adopted as the operator-approved trigger and canvas-editor convention, not
  cited as a vendor fact.

## Files touched (implementation plan will detail)

- NEW `lib/email/blocks/editable-text.tsx` (+ its test)
- `components/email-lab/GridCanvas.tsx` — pointer policy, link interception, pill popovers
- `components/email-lab/EmailLabGridShell.tsx` — provide `CanvasEditContext`, rail auto-scroll
- `lib/email/blocks/*.tsx` — mechanical adoption of `EditableText` on text nodes
  (all block components except `SourcesBlock`, `DividerBlock`, `SocialIconsBlock` icons)
- `components/email-lab/BlockInspector.tsx` — untouched
