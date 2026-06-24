# Email Lab — Block Canvas Design

**Date:** 2026-06-24
**Status:** Draft (rev 3 — audited + vendor-verified + tier model)
**Scope:** Replace the static iframe email preview with a live, click-to-edit block canvas while keeping the AI left panel intact. Drag-to-reorder is the *last* phase, not the first.

---

## What we're building

Right now: AI prompt → token substitution → static HTML in an iframe. Zero user editing.

After: AI prompt → `EmailDoc` (JSON block array) → click-to-edit block canvas. User selects any block, edits its fields in a side panel, adds/removes blocks, and (final phase) drags to reorder. Export still produces clean, cross-client email HTML via the React Email `render()` already in the repo.

**The user's mental model:** "Pick a starting layout (or describe one to the AI) → the AI fills it with *real* SWFL numbers → I tweak the words and colors → I copy the HTML or export a PDF." Structure is the user's; *content* is the AI's, grounded in lake data. That split is the whole design (see [AI + data contract](#ai--data-contract)).

---

## Editing tiers — what we're actually capable of

The question "do we just offer sample backgrounds to pick, or let people adjust until they freeze?" is a false either/or. We can — and should — offer **both, as two tiers of one surface.** They share a single `EmailDoc` model, so a user can start guided and graduate to free-form without losing work.

| | **Tier 1 — Token Fill** | **Tier 2 — Block Canvas** |
|---|---|---|
| **User does** | Pick a template, fill the blanks (or "Fill with AI") | Add / remove / reorder / restyle blocks; edit any field |
| **Freedom** | Low — fixed layout, swap the words | High — compose the layout itself |
| **Ceiling** | A clean standard email, fast | A bespoke design that's *theirs* |
| **Backgrounds** | Chosen from sample templates | Chosen, then adjusted, then **frozen** |
| **Maps to today** | The existing token-fill clients (22 templates, live) | New in this spec |
| **Effort to ship** | Already built | The phased plan below |

**"Adjust until they freeze"** is just Tier 2 + save: the user moves things until they like it, then **freezes** the design — and that frozen `EmailDoc` becomes the project's saved layout, which the weekly refresh re-fills with new data (see [Saved layouts](#saved-layouts-issues-and-recurring-refresh-the-payoff)). "Freeze" = "save this project's design."

**A different design = a different project**, exactly as today (`app/project/[id]/email-lab/`). A project owns its email design. We are *not* building a multi-layout library inside one project; the project IS the unit of a design. New design → new project.

**Tokens are optional, never required.** The ~50 default tokens a template ships (and likewise a block's props) are *options* — a build uses only the fields it needs; unused ones fall back to defaults or simply don't render. The AI patch returns only the fields it's changing (as the live route already does), never the full set. No build is gated on filling everything.

**Showing the difference (the operator's "place that shows quality + creativity").** A small *compare* affordance: the same content rendered as a Tier-1 template vs. a Tier-2 custom layout, so the user sees what the extra freedom buys. This stays consistent with the locked moat — **builds are free, SEND is the paywall** ([[feedback_build-monetization-model]]): the compare surface sells *capability/quality*, it does **not** gate building. Nobody is blocked from designing; they're shown what's possible.

**Token budget is not the constraint (verified, crawl4ai 2026-06-24 → Anthropic docs).** `claude-haiku-4-5` = **200K context / 64K max output** ($1/$5 per MTok); Opus 4.8 / Sonnet 4.6 = 1M / 128K. The AI route's current `max_tokens: 1024` is an *artificial* limiter sized for token-patches, not a model ceiling. Tier-2 generation (a full `EmailDoc`, longer prose, an AI "reading/advice" section) fits with room to spare, and sending the whole current doc + lake context as input is trivially affordable. The reason to keep content-patch mode is **quality/safety** (don't let the model restructure or recolor), not cost.

---

## Audit resolution (rev 1 → rev 2)

This rev folds in a Sonnet audit + a fresh crawl4ai vendor pass. Verdicts:

| # | Pushback | Verdict | Resolution in this rev |
|---|---|---|---|
| 1 | Spec ignores already-installed `@react-email` | **Already fixed in rev 1** | Rendering strategy uses `render()` from `@react-email/render` (proven in `scripts/email/build-digest.mts`). |
| 2 | dnd-kit unmaintained / React 19 risk | **Valid, re-scoped** | Verified: last stable `@dnd-kit/core` publish **2024-12-05** (~18 mo, not "2 yr"). Drag moved to the **final** phase; core value (click-to-edit) ships without it. Fallback = `@hello-pangea/dnd@18.0.1` (peer-deps React 19 explicitly). |
| 3 | Template removal loses 7+ structural layouts | **Valid, understated** | There are **22** templates (not 17). `shell-two-col`, `email-compare`, `email-hbar`, `email-table`, `email-ranked` have no single-column block equivalent. v1 explicitly scopes them OUT and keeps the picker as a "start from" seed. See [Template regression](#template-regression--explicit). |
| 4 | AI returning a full `EmailDoc` is risky | **Valid, redesigned** | AI fills **content into a chosen skeleton**, not free-form structure. Output is **zod-validated** (we already depend on `zod@4`), not `try/catch`. Lake-grounded, no-invention enforced. See [AI + data contract](#ai--data-contract). |
| 5 | `useSensor` code bug + missing `activationConstraint` | **Confirmed by vendor docs** | dnd-kit docs: `useSensor(...)` must be wrapped in `useSensors(...)`; `activationConstraint.distance` is required or clicks start drags. Code corrected. |
| 6 | "Inline editing" mislabels a side panel | **Valid** | Renamed to **Block Inspector** (a properties panel). True in-canvas text editing is a noted post-v1 option. |
| 7 | No undo/redo on a destructive canvas | **Valid** | Added a bounded `EmailDoc` history stack with ⌘Z / ⌘⇧Z. Phase 4. |
| 8 | `app/email-lab/blocks/` can't serve both clients | **Valid + spec was self-contradictory** | Blocks now live in `lib/email/blocks/` (the renderer sample already imported from there). Both clients import cleanly. |

---

## Research findings (crawl4ai, 2026-06-24 — re-verified)

Sourced live from `registry.npmjs.org` (`/latest` manifests + publish `time`) and `docs.dndkit.com`. **Corrections to rev 1 are flagged.**

| Library | Latest | React peer dep | Last stable publish | Status |
|---|---|---|---|---|
| `@react-email/components` | 1.0.12 | `^18 \|\| ^19 \|\| ^19.0.0-rc` | active | **Installed.** React 19 listed → safe. ⚠️ rev 1 said "no peer dep lock" — wrong, it *has* a peer dep, but 19 is in range. |
| `@react-email/render` | 2.0.9 | `^18 \|\| ^19 \|\| ^19.0.0-rc` | **2026-06-16** (8 days ago) | **Installed** (`^2.0.8` → resolves 2.0.9). ⚠️ Manifest exposes **only the `.` export** — rev 1's claimed `./dist/browser` / "client-side `render()`" export **does not exist**. We never need it: the canvas renders components as JSX in the DOM; `render()` runs server-side only. |
| `@dnd-kit/core` | 6.3.1 | `>=16.8.0` | 2024-12-05 (~18 mo) | New install. Open peer range → **installs clean on React 19, no warning.** Risk is *runtime*, not install. |
| `@dnd-kit/sortable` | 10.0.0 | `>=16.8.0` (+ core `^6.3.0`) | 2024-12-04 (~18 mo) | New install. Same. |
| `@dnd-kit/utilities` | 3.2.2 | `>=16.8.0` | — | New install (for `CSS.Transform`). |
| `@hello-pangea/dnd` | 18.0.1 | `^18.0.0 \|\| ^19.0.0` | 2025-02-09 (~16 mo) | **Fallback only.** React 19 explicit, but heavier (pulls `react-redux`) and render-props API, not hooks. Not preferred for a simple vertical reorder. |
| `@usewaypoint/email-builder` | 0.0.9 | `^16 \|\| ^17 \|\| ^18` | — | **Skip** — React 19 not listed; unnecessary. |

**Key facts that anchor the design:**
- `render()` is **async** → `const html = await render(<EmailDocEmail doc={doc} />)`. Proven verbatim in `scripts/email/build-digest.mts:204`.
- dnd-kit declares `react >=16.8.0`, so npm install on React 19.2.4 **will not error or warn**. The honest risk is React 19 StrictMode/effect timing at runtime — caught by a real drag test in the final phase, not at install.
- The dnd-kit sensors contract (verified at `docs.dndkit.com/api-documentation/sensors`): *"When initializing sensors with `useSensor`, make sure you pass the sensors to `useSensors` before passing them to `DndContext`."* Activation example uses `activationConstraint: { distance: 10 }`.

**Decision:** Block components use `@react-email/components` primitives (same pattern as `DigestEmail.tsx`). They render as JSX in the browser DOM for the canvas. Export calls `render()` server-side in the API route. New install (final phase only): `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.

---

## Block types

Ten single-column block types cover the *linear* templates. (Structural/2-col/chart templates are explicitly out of v1 — see [Template regression](#template-regression--explicit).)

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
// lib/email/doc/types.ts

type BlockType =
  | "header" | "hero" | "stats" | "signal" | "text"
  | "image" | "agent-card" | "button" | "divider" | "footer";

interface EmailBlock {
  id: string;          // "block_" + nanoid(8) — assigned on arrival, never from the AI
  type: BlockType;
  props: Record<string, unknown>;  // validated per-type by zod (below)
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

**Why an ordered array** (not the flat-map+childrenIds pattern from EmailBuilder.js): simpler for AI generation (no ID graph), simpler for reorder (`arrayMove` on the array), simpler for the renderer to walk linearly. Our emails are linear — no nested containers in v1.

### Zod schema (the safety net Pushback 4 demands)

We already depend on `zod@^4.4.3`. Every per-block prop shape gets a schema; the AI route and the client both parse through it. A malformed or partial AI response is **rejected and reported**, never silently rendered as garbage.

```typescript
// lib/email/doc/schema.ts
import { z } from "zod";

const HeroProps = z.object({
  kicker: z.string().max(60), value: z.string().max(24),
  label: z.string().max(80), prose: z.string().max(500),
});
// …one per block type…

const Block = z.discriminatedUnion("type", [
  z.object({ id: z.string().optional(), type: z.literal("hero"), props: HeroProps }),
  // …
]).transform(b => ({ ...b, id: b.id ?? "block_" + nanoid(8) }));  // keep saved ids; mint new ones
// Saved layouts carry stable ids → the weekly content-patch can target { blockId → text }.
// AI-proposed / freshly-added blocks have no id yet → we mint one. Ids never come FROM the model.

export const EmailDocSchema = z.object({
  globalStyle: GlobalStyleSchema,
  blocks: z.array(Block).min(1).max(20),
});
export type EmailDoc = z.infer<typeof EmailDocSchema>;
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ EmailLabClient (grid grid-cols-[340px_1fr] h-dvh)                         │
│                                                                            │
│  ┌──────── LEFT PANEL ─────────┐    ┌──────── RIGHT CANVAS ──────────┐   │
│  │  AI Prompt Bar              │    │  BlockCanvas                    │   │
│  │  ├─ textarea                │    │  ├─ (Phase 5) DndContext        │   │
│  │  └─ "Fill with AI" button   │    │  │  └─ SortableContext          │   │
│  │                             │    │  │     ├─ CanvasBlock (header)  │   │
│  │  Brand colors  ────────────→│ ←→ │  │     ├─ CanvasBlock (hero)    │   │
│  │  Start-from picker          │    │  │     ├─ CanvasBlock (stats)   │   │
│  │  (seeds initial EmailDoc)   │    │  │     └─ [+] AddBlockButton    │   │
│  │                             │    │  │                              │   │
│  │  Block Inspector            │    │  │  click block → left panel    │   │
│  │  (when a block is selected) │    │  │  switches to Block Inspector │   │
│  │                             │    │                                  │   │
│  │  Undo/Redo · Export HTML    │    │                                  │   │
│  └─────────────────────────────┘    └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Interaction model

- **Select block:** click anywhere on the block → left panel switches from the start-from/AI view to the **Block Inspector** for that block. Canvas rings the selected block.
- **Edit field:** every prop is an editable field (text inputs, color pickers, textareas) in the Inspector. Live — canvas re-renders on each keystroke (debounced for `render()`-free DOM view; export is on demand).
- **Add block:** `[+]` button between blocks and at the bottom → mini 10-type palette → appends/inserts a block with default props at that position.
- **Delete block:** trash icon on hover, or a Delete button in the Inspector. **Undoable.**
- **Reorder (Phase 5 only):** drag handle (≡) → `@dnd-kit/sortable` reorders `doc.blocks`.
- **Undo / Redo:** ⌘Z / ⌘⇧Z, plus toolbar buttons. Bounded history (see [Undo](#undoredo)).
- **Deselect:** click empty canvas or Escape → left panel returns to start-from/AI mode.

---

## File map

### New files

```
lib/email/doc/
  types.ts                  EmailDoc, EmailBlock, BlockType, per-block prop types
  schema.ts                 zod EmailDocSchema (validates AI output + client state)
  default-docs.ts           starter EmailDocs (the "start from" seeds)
  history.ts                bounded undo/redo stack helpers (pure functions)

lib/email/blocks/           ← SHARED by both clients AND the server renderer (Pushback 8)
  BlockRenderer.tsx         switch on block.type → correct block component
  HeaderBlock.tsx           @react-email/components: Section, Img, Text
  HeroBlock.tsx             Section, Text (kicker/value/label/prose)
  StatsBlock.tsx            Section, Row, Column, Text (2–3 KPI cells)
  SignalBlock.tsx           Section, Text (kicker + callout box)
  TextBlock.tsx             Section, Text
  ImageBlock.tsx            Section, Img
  AgentCardBlock.tsx        Section, Row, Column, Img, Text, Link
  ButtonBlock.tsx           Section, Button
  DividerBlock.tsx          Hr
  FooterBlock.tsx           Section, Text, Link
  EmailDocRenderer.tsx      <EmailDocEmail doc={doc}> — wraps blocks in Html+Body+Container

components/email-lab/        ← canvas UI (client-only), shared by both routes
  BlockCanvas.tsx           renders blocks; (Phase 5) DndContext + SortableContext
  CanvasBlock.tsx           selection ring + hover trash + (Phase 5) drag handle wrapper
  BlockInspector.tsx        left-panel form for the selected block's props
  AddBlockPanel.tsx         10-type mini palette
```

**Why these homes:** block components are pure (no client state) so they render in *both* the browser DOM (canvas) and server `render()` (export) — they must NOT carry `"use client"`. Any client-only behavior (hover, drag handle, selection) lives in `CanvasBlock.tsx`, which wraps the pure block. The canvas *UI* (`components/email-lab/*`) is `"use client"`. Both routes — `app/email-lab/` and `app/project/[id]/email-lab/` — import from these neutral `lib/`+`components/` homes, never across route boundaries.

### Modified files

```
app/email-lab/EmailLabClient.tsx
  - Remove: DEFAULTS tokens, FINE_TUNE_GROUPS, fetchRender, EmailPreviewFrame
  - Keep + repurpose: TEMPLATES array → "start from" seed picker (maps to default-docs)
  - Add: EmailDoc state + history, <BlockCanvas>, selectedBlockId, undo/redo
  - Keep: AI prompt bar, brand color fields (wired to globalStyle), Export, Export PDF

app/project/[id]/email-lab/ProjectEmailLabClient.tsx
  - Same swap. Keeps project scope → lake fetch unchanged.

app/api/email-lab/ai/route.ts
  - New mode: returns a validated EmailDoc (or content patch). Lake-grounded. See AI contract.

app/api/email-lab/render/route.ts
  - Accept BOTH { template, tokens } (legacy) AND { doc: EmailDoc } during transition.
  - For { doc }: return { html } from render(<EmailDocEmail doc={doc} />).
```

---

## Rendering strategy — `@react-email` already installed

**Same pattern as `DigestEmail.tsx` + `build-digest.mts`** — proven in production.

```typescript
// lib/email/blocks/EmailDocRenderer.tsx  (pure — no "use client"; used by the API route)
import { Html, Body, Container } from "@react-email/components";
import { BlockRenderer } from "./BlockRenderer";
import type { EmailDoc } from "../doc/types";

export function EmailDocEmail({ doc }: { doc: EmailDoc }) {
  return (
    <Html lang="en">
      <Body style={{ backgroundColor: doc.globalStyle.backdropColor, margin: 0 }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#fff" }}>
          {doc.blocks.map((block) => (
            <BlockRenderer key={block.id} block={block} globalStyle={doc.globalStyle} />
          ))}
        </Container>
      </Body>
    </Html>
  );
}

// app/api/email-lab/render/route.ts
import { render } from "@react-email/render";
const html = await render(<EmailDocEmail doc={doc} />);   // async — returns Promise<string>
```

**Why this beats a hand-rolled HTML renderer:**
- `@react-email/components` already emits cross-client `<Section>`→`<table>`, `<Row>`→`<tr>`, inline styles, VML button fallbacks, etc.
- Already exercised by `DigestEmail.tsx` (same lib, same `render()`).
- One source of truth: the *same* block components draw the canvas DOM view AND produce the export HTML.

**Canvas view (browser):** block components render as JSX directly in the DOM (no iframe, no `render()`). `<Section>`→table, `<Text>`→`<p>`. Approximate-but-faithful at 600px.
**HTML/PDF export (server):** API route calls `render()` — authoritative. The canvas is the preview; the export is the deliverable. The (intentional) gap is documented in Risks.

> **Note:** rev 1 claimed `@react-email/render` ships a browser export so `render()` could run client-side. The live manifest exposes only the `.` export — that claim is dropped. We don't need it; the canvas never calls `render()`.

---

## AI + data contract

This is the part that has to "work well with AI and data," and it's where the project's **no-invention moat** (CLAUDE.md RULE 0.7, Rules of Engagement) lives. Two redesigns vs rev 1:

**1. AI fills content into a skeleton; it does not invent structure.**
Free-form `{ doc: EmailDoc }` generation (rev 1) has a 10× larger surface and fails silently when the AI returns a valid-but-wrong shape. Instead:

- The **skeleton** (which blocks, in what order) comes from the user's "start from" pick or their current canvas — not the model.
- The AI receives the current `EmailDoc` + the lake context and returns a **text-only content patch**: `{ blockId → { …text props } }`. It rewrites *words and numbers*, not the block graph.
- **Colors, backgrounds, and fonts are NOT regenerated.** `globalStyle` (`primaryColor`, `accentColor`, `backdropColor`, `textColor`, `fontFamily`) and any per-block `bgColor` are **user-owned and sticky** — they come from the brand pickers, set once, and persist across every AI fill. The model has no write access to them in content-patch mode. "Fill with AI" changes the message; it never restyles the email. So your backgrounds survive untouched.
- **Two explicit, separate intents** are the *only* paths that touch styling/structure, and both are zod-validated before they hit state:
  - *"Restyle / rebrand"* → may write `globalStyle` (still keeps the block graph).
  - *"Start over from scratch"* → may propose a new block list (the only full-doc path).
  Neither is the default; the default fill leaves layout and color alone.

**2. Output is validated, grounded, and no-invention-gated.**
- Parse the model response with `EmailDocSchema` / a `ContentPatchSchema`. On failure: keep current doc, surface "AI returned an invalid layout — try rephrasing." No `try/catch`-and-render-garbage.
- Lake grounding is unchanged from today's route: `fetchLakeContext(scope)` hits `/api/b/master?view=speak&tier=1` (ZIP/county/region aware). Numbers in `hero.value`, `stats[].value`, `signal.body` must come from that context — the system prompt forbids inventing SWFL figures (mirrors the Rules of Engagement already enforced elsewhere).
- Keep `claude-haiku-4-5` for the fill (content substitution, not reasoning), but **raise `max_tokens` off the current `1024`** — verified limits are 200K context / 64K output, so a full-doc fill plus an AI "reading/advice" section fit easily (~4–8K output is plenty; `1024` was sized for token-patches). A premium long-form "market reading" block is the upgrade path to Sonnet 4.6 if quality demands.
- **AI advice/reading is content, not structure.** A `text` or `signal` block holds the AI's narrative; the content-patch fills its prose from the lake slice, marked `[INFERENCE]` with a falsifier when it goes beyond cited facts (Rules of Engagement). The AI writes the *words* into an existing block — it does not invent a new section.
- The patch carries **only the fields it changes** — unfilled props keep their defaults or don't render. Tokens/props are options, never a required set.

```
System (sketch):
You are an email content writer for SWFL Data Gulf.
You are given an EmailDoc skeleton and REAL LAKE DATA.
Return ONLY a JSON content patch: for each block you change, its id and new text props.
- Put real numbers from LAKE DATA into value/stat/signal fields. Never invent a SWFL number.
- Do not add, remove, or reorder blocks. Do not change block types.
- Do NOT change colors, backgrounds, or fonts — those are the user's brand settings. Never emit globalStyle or bgColor.
- Keep prose tight, no jargon, no internal ids.

[LAKE DATA: {scope-aware master tier-1 slice}]
[CURRENT DOC: {blocks with ids + current props}]
User: {{prompt}}
```

The project-aware client's lake fetch is **unchanged** — same `/api/b/master?tier=1` call as today.

---

## Saved layouts, issues, and recurring refresh (the payoff)

Because `EmailDoc` is plain JSON, three things the operator wants fall straight out of this design — none are precluded by content-patch mode:

1. **Save a layout.** Persist an `EmailDoc` as a named, reusable design (same shape as `default-docs.ts`, just user-owned and stored). Saved layouts join the "Start from" picker. Block ids are minted **once at creation** and persist — they are the stable handles the AI content-patch targets across every later fill.

2. **Recurring email — fixed design, fresh data + AI reading.** This is exactly what the skeleton/content split is for. A **saved layout + a scheduled content-patch fill against the current lake = a new issue each period with the same look**. The numbers and the AI narrative refresh; the layout, colors, and fonts do not. We already run this pattern for the *hardcoded* digest (`scripts/email/build-digest.mts` + the Mon–Fri cron); the block canvas only makes the layout **user-designed JSON** instead of a hardcoded React component — same send / idempotency / logging rails, pointed at a saved `EmailDoc`. Three nouns to keep distinct:
   - **Layout** = the saved `EmailDoc` (blocks + brand `globalStyle`). Sticky. One per project.
   - **Issue** = layout + this period's content-patch (fresh data + AI advice/reading). What actually sends.
   - **Project** = the container, exactly as today. A project owns its design.

3. **A different design = a different project** (today's model — *not* a multi-layout library inside one project). New design → new project, its own saved `EmailDoc`. Editing or scheduling one project's design never touches another's.

**Scope honesty:** the [phased plan](#phased-delivery) below covers the **editor** (design → edit → export). **Persistence** (save/load a layout to a row) and **recurring refresh** (schedule a saved layout against fresh lake data) are the *next* layer — straightforward on this architecture but not yet phased. Candidate Phase 6 = save/load `EmailDoc` rows; Phase 7 = a cron wrapper that re-fills a saved layout and sends (reusing the digest send rails). Flagged as open question 4.

---

## dnd-kit integration (Phase 5 — corrected)

Vendor-verified API. `useSensor` is wrapped in `useSensors`; `activationConstraint.distance` makes click ≠ drag.

```typescript
// components/email-lab/BlockCanvas.tsx (drag wiring — Phase 5)
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";

function BlockCanvas({ doc, onChange, selectedId, onSelect }) {
  // ✅ useSensors(useSensor(...)) — and a distance so a click selects instead of dragging
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIndex = doc.blocks.findIndex((b) => b.id === active.id);
    const newIndex = doc.blocks.findIndex((b) => b.id === over.id);
    onChange({ ...doc, blocks: arrayMove(doc.blocks, oldIndex, newIndex) });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={doc.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <div className="max-w-[600px] mx-auto bg-white">
          {doc.blocks.map((block) => (
            <CanvasBlock
              key={block.id}
              block={block}
              globalStyle={doc.globalStyle}
              selected={block.id === selectedId}
              onSelect={() => onSelect(block.id)}
              onDelete={() => onChange({ ...doc, blocks: doc.blocks.filter((b) => b.id !== block.id) })}
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
// components/email-lab/CanvasBlock.tsx (Phase 5 adds drag; Phases 2–4 use a plain <div>)
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function CanvasBlock({ block, globalStyle, selected, onSelect, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} onClick={onSelect}
      className={`relative group ${selected ? "ring-2 ring-[#1BB8C9]" : ""}`}>
      <div {...attributes} {...listeners}
        className="absolute left-1 top-2 opacity-0 group-hover:opacity-100 cursor-grab text-gray-400 z-10">≡</div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute right-1 top-2 opacity-0 group-hover:opacity-100 text-red-400 z-10">✕</button>
      <BlockRenderer block={block} globalStyle={globalStyle} />
    </div>
  );
}
```

**Phases 2–4 ship `CanvasBlock` without `useSortable`** (a plain `<div onClick>` + ring + trash). Phase 5 swaps in the sortable hook. If React 19 runtime issues surface, the fallback is `@hello-pangea/dnd@18.0.1` (React-19-explicit) — a contained, Phase-5-local change, since reorder is the only thing wired to it.

---

## Undo/redo

A destructive canvas (delete + reorder) without undo is a UX trap (Pushback 7). Minimum viable, bounded:

```typescript
// lib/email/doc/history.ts (pure)
interface DocHistory { past: EmailDoc[]; present: EmailDoc; future: EmailDoc[]; }
const LIMIT = 50;
export const pushDoc = (h, next) =>
  ({ past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] });
export const undo = (h) => h.past.length
  ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h;
export const redo = (h) => h.future.length
  ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
```

- Every mutation (edit, add, delete, reorder, AI fill) goes through `pushDoc`.
- Keystroke edits **coalesce** (don't push a frame per character — push on blur or after a 500 ms idle) so undo steps are meaningful.
- ⌘Z / ⌘⇧Z + toolbar buttons. Capped at 50 frames.

---

## Template regression — explicit

The current picker has **22** templates. The 10 block types are single-column, so these **have no v1 equivalent** and would silently regress if the picker were just deleted:

- `shell-two-col` — two-column layout
- `email-compare` — side-by-side comparison
- `email-hbar`, `email-table`, `email-ranked` — embedded chart/table content

**Decision:** Do NOT delete the picker. Repurpose it as a **"Start from"** seed list mapping to `default-docs.ts`. The ~17 linear templates seed a real `EmailDoc`; the 5 structural ones are **marked "classic (not editable)"** and continue to render through the *existing* token path (the legacy `{ template, tokens }` branch the render route still accepts). v1 ships the block canvas for linear emails and is honest that 2-col/chart layouts stay on the old rail until a future "container block" rev. No silent capability loss.

---

## Phased delivery

Re-ordered from rev 1: **click-to-edit is the value; drag is last.** Each phase ends green (`bun test` + `next build`).

### Phase 1 — Schema + renderer + AI contract (no UI change, ~2 days)
- `lib/email/doc/{types,schema,default-docs}.ts`
- `lib/email/blocks/*` (10 blocks + `BlockRenderer` + `EmailDocRenderer`)
- `/api/email-lab/render`: accept `{ doc }` → `render(<EmailDocEmail>)`; keep legacy `{ template, tokens }`.
- `/api/email-lab/ai`: content-patch mode, zod-validated, lake-grounded.
- **Acceptance:** unit test renders a default doc to HTML; zod rejects a bad AI payload; existing suites + build pass.

### Phase 2 — Static block canvas (no drag, ~2 days)
- `components/email-lab/{BlockCanvas,CanvasBlock,AddBlockPanel}.tsx` (CanvasBlock = plain div).
- Swap `<EmailPreviewFrame>` → `<BlockCanvas>` in both clients.
- Left panel: drop token accordion; keep AI prompt + brand colors + "Start from" + Export.
- Blocks clickable → selection ring → left panel shows a stub Inspector.
- **Acceptance:** pick a seed → canvas paints; click a block → ring + stub Inspector; both routes work.

### Phase 3 — Block Inspector (the real editing, ~2 days)
- `components/email-lab/BlockInspector.tsx` — per-type form for the selected block.
- Live: field change → `doc.blocks` update → canvas re-renders.
- Escape / "Done" → deselect → left panel returns to AI + brand.
- **Acceptance:** edit hero value, stats, agent bio, colors → canvas reflects instantly; export HTML matches.

### Phase 4 — Add/remove + undo/redo (~1 day)
- `AddBlockPanel` wired to `[+]`; new block at position with defaults.
- `lib/email/doc/history.ts` wired; ⌘Z/⌘⇧Z + buttons; coalesced edits.
- **Acceptance:** add → delete → ⌘Z restores; reorder-by-add/delete is undoable; 50-frame cap holds.

### Phase 5 — Drag-to-reorder (~1 day)
- Install `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`; add `bun.lock` in same push (pre-push gate 1).
- Wire `DndContext`/`SortableContext`; `CanvasBlock` gains `useSortable`.
- Verify on React 19.2.4 at runtime (StrictMode on). If broken → `@hello-pangea/dnd` swap (contained).
- **Acceptance:** drag reorders; click still selects (activation distance works); no console errors under StrictMode; reorder is undoable.

---

## What stays the same

- Left-panel AI prompt bar + "Fill with AI".
- `/api/email-lab/ai` endpoint (new response mode, same URL) + project scope → lake fetch.
- Export HTML (copy/download) + Export PDF (`email-print` skin).
- Brand color fields → `doc.globalStyle.primaryColor/accentColor`.
- Both clients: `/email-lab` and `/project/[id]/email-lab`.
- Legacy `{ template, tokens }` render path (kept for the 5 structural templates).

## What gets removed

- `DEFAULTS` token object → per-block defaults in `default-docs.ts`.
- `FINE_TUNE_GROUPS` accordion → `BlockInspector`.
- `fetchRender(template, tokens)` for *linear* emails → `{ doc }` render path. (Kept for structural templates.)
- `<EmailPreviewFrame>` on the Email Lab pages (still used on `/p/[id]` deliverable pages — untouched).
- **Not removed:** the `TEMPLATES` array (repurposed as the "Start from" seed list).

---

## Risks / unknowns

| Risk | Mitigation |
|---|---|
| `@dnd-kit` React 19 *runtime* (not install) | Open peer range → installs clean. Drag is Phase 5, isolated. Real drag test under StrictMode. Fallback `@hello-pangea/dnd@18.0.1` (React-19-explicit) is a contained swap. |
| AI returns malformed/partial layout | **zod-validated**, not `try/catch`. Failure keeps current doc + shows a message. AI patches content only — can't break the block graph. |
| AI invents SWFL numbers | System prompt forbids it; numbers must come from the lake-context slice (Rules of Engagement). Content-patch mode means the AI never fabricates structure either. |
| Canvas DOM view ≠ export HTML | Same components both ways. Canvas = approximate preview; server `render()` = authoritative export. Documented, intentional. |
| Phase 1 breaks existing Email Lab | Render route accepts BOTH shapes through the transition; drop legacy linear path only after Phase 3 ships. Structural-template legacy path stays. |
| 2-col / chart templates regress | Explicitly out of v1; picker keeps them on the legacy token rail labelled "classic." No silent loss. Future "container block" rev revisits. |
| Block components accidentally `"use client"` | They must stay pure (shared server+DOM). Client behavior lives only in `CanvasBlock`. Lint/PR check: no `"use client"` under `lib/email/blocks/`. |

---

## Open questions for the operator

1. **Structural templates** — OK to ship v1 with 2-col/compare/chart templates on the legacy "classic" rail (read-only in the block canvas), or should they block v1 until a container-block model exists?
2. **"Regenerate whole doc" affordance** — keep the AI strictly to content patches in v1, or also expose a "propose a fresh layout" button (zod-validated full-doc path) from the start?
3. **Send button** — out of scope here, but the canvas is the natural launch point for it (memory: SEND is the paywall). Wire a stub now or defer entirely?
4. **Saved layouts + recurring refresh** — fold persistence (Phase 6) and a scheduled re-fill/send (Phase 7, reusing the digest rails) into *this* spec, or keep the editor spec lean and write the recurring-send layer as its own spec? (Architecture supports both; it's a sequencing call.)
