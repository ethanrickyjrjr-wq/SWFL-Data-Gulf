# Email Lab Inline Text Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 19 files, 2 conflict groups, keywords: schema, architecture

**Goal:** Click any text on the Email Lab grid canvas and type in place; link/color popovers on the block pill; sent email HTML stays byte-identical.

**Architecture:** One shared `EditableText` primitive renders every text node in the pure block components. With no edit scope (server `render()`, compile-grid) it emits exactly today's markup; on the canvas, `BlockRenderer` threads an explicit `EditScope` prop (blockId + commit) down and the node becomes an uncontrolled `contentEditable` that commits on blur through the same doc-update path the inspector uses (same undo stack, same auto-height). No React context (a module-scope `createContext` would poison the pure block modules for any future server-component importer); no new dependencies.

**Tech Stack:** React 19, `@react-email/components` (Text spreads full `<p>` props — verified in installed 1.0.12), `react-grid-layout@2.2.3` (drag is handle-scoped; verified `DragConfig` in the live README 07/12/2026), bun:test, `react-dom/server` `renderToStaticMarkup` for parity tests.

**Spec:** `docs/superpowers/specs/2026-07-12-lab-inline-text-edit-design.md` · **Check:** `lab_inline_text_edit_live_verify`

## Global Constraints

- **Sendable parity is the invariant:** `EditableText` with no `scope` must render byte-identical markup to today's `<Comp style>{value}</Comp>` (or the bare string, in `as`-omitted mode). The renderer guard test (Task 3) asserts no `contenteditable` / `data-edit-path` / `data-placeholder` ever appears in sendable HTML.
- **`sources` block is never editable** — no `EditableText` in `SourcesBlock.tsx`, no scope passed to it. `divider` and `social-icons` are also untouched (no bindable text nodes).
- **No new dependencies.** Zero installs; `bun.lock` must not change.
- **Block components stay PURE** — no `"use client"`, no hooks, no context in `lib/email/blocks/**`. Event handlers as plain props are fine (ignored by static server render).
- Verify with `bunx next build`, never `npx tsc`. Run email suites with `bun test lib/email components/email-lab`.
- `react-hooks/set-state-in-effect` is a hard ESLint error — the shell effects added here are DOM-only (scrollIntoView), no setState.
- Commit only the files this plan owns (shared git index — always `git add <explicit paths>`).
- Empty-string commits are KEPT (an empty field stays an open AI slot per the seed slot rule); `undefined` commits DELETE the key (popover Clear actions).

## File Structure

- Create: `lib/email/doc/edit-path.ts` (+ `edit-path.test.ts`) — pure immutable path-setter.
- Create: `lib/email/blocks/editable-text.tsx` (+ `editable-text.test.tsx`) — `EditScope`, `escapeHtml`, `readEditedText`, `EditableText`.
- Create: `lib/email/blocks/editable-adoption.test.tsx` — per-block "which paths are editable" + "server HTML carries no edit artifacts" table, grows with each adoption task.
- Create: `lib/email/lab/block-edit-maps.ts` (+ `block-edit-maps.test.ts`) — `LINK_PROP` / `COLOR_PROP` per block type.
- Modify: `lib/email/blocks/BlockRenderer.tsx` (edit prop → per-block scope), 14 block components (adopt `EditableText`), `components/email-lab/GridCanvas.tsx` (commit fn, pointer policy, link interception, pill popovers), `components/email-lab/EmailLabGridShell.tsx` (keydown guard, rail auto-scroll), `app/globals.css` (caret/placeholder rules), `lib/email/blocks/EmailDocRenderer.test.ts` (sendable guard).

---

### Task 1: `applyTextAtPath` — the one write path for inline commits

**Files:**
- Create: `lib/email/doc/edit-path.ts`
- Test: `lib/email/doc/edit-path.test.ts`
- Modify: `docs/superpowers/specs/2026-07-12-lab-inline-text-edit-design.md` (one wording amendment)

**Interfaces:**
- Produces: `applyTextAtPath(block: EmailBlock, path: string, text: string | undefined): EmailBlock` — immutable; dot-paths into `block.props` (`"body"`, `"stats.0.value"`, `"items.2.text"`, `"columns.1.heading"`); `undefined` deletes the leaf key; `""` is stored; missing containers / bad indexes return the block unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/doc/edit-path.test.ts
import { describe, expect, it } from "bun:test";
import { applyTextAtPath } from "./edit-path";
import type { EmailBlock } from "./types";

const text = (): EmailBlock => ({ id: "t1", type: "text", props: { body: "old", linkUrl: "https://x.test" } });
const stats = (): EmailBlock => ({
  id: "s1",
  type: "stats",
  props: { stats: [{ value: "34", label: "DOM" }, { value: "3.2", label: "Supply" }] },
});

describe("applyTextAtPath", () => {
  it("sets a top-level prop immutably", () => {
    const b = text();
    const next = applyTextAtPath(b, "body", "new");
    expect(next).not.toBe(b);
    expect(next.props).toEqual({ body: "new", linkUrl: "https://x.test" });
    expect(b.props.body).toBe("old");
  });

  it("creates a missing leaf key (typing into an empty placeholder)", () => {
    const b: EmailBlock = { id: "h1", type: "hero", props: {} };
    expect(applyTextAtPath(b, "kicker", "Market Spotlight").props).toEqual({ kicker: "Market Spotlight" });
  });

  it("keeps an empty string (open slot), deletes on undefined", () => {
    const b = text();
    expect(applyTextAtPath(b, "body", "").props.body).toBe("");
    expect("linkUrl" in applyTextAtPath(b, "linkUrl", undefined).props).toBe(false);
  });

  it("sets inside an array row without touching siblings", () => {
    const b = stats();
    const next = applyTextAtPath(b, "stats.1.value", "4.0");
    expect((next.props as { stats: { value: string }[] }).stats[1].value).toBe("4.0");
    expect((next.props as { stats: { value: string }[] }).stats[0]).toBe(
      (b.props as { stats: { value: string }[] }).stats[0],
    );
  });

  it("returns the block unchanged on a bad index, missing container, or no-op write", () => {
    const b = stats();
    expect(applyTextAtPath(b, "stats.9.value", "x")).toBe(b);
    expect(applyTextAtPath(b, "items.0.text", "x")).toBe(b);
    expect(applyTextAtPath(b, "stats.0.value", "34")).toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/doc/edit-path.test.ts`
Expected: FAIL — `Cannot find module './edit-path'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/email/doc/edit-path.ts — PURE. The one write path for on-canvas inline edits.
//
// A dot path addresses a string inside block.props ("body", "stats.0.value",
// "items.2.text"). `undefined` DELETES the leaf key (popover Clear); "" is KEPT
// (an empty field stays an open AI slot per the seed slot rule). Traversing a
// missing container or an out-of-range index returns the block unchanged —
// inline editing can retitle a row, never create one.
import type { EmailBlock } from "./types";

export function applyTextAtPath(
  block: EmailBlock,
  path: string,
  text: string | undefined,
): EmailBlock {
  const segs = path.split(".");

  const setIn = (node: unknown, i: number): unknown => {
    const key = segs[i];
    if (Array.isArray(node)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) return node;
      const child = setIn(node[idx], i + 1);
      if (child === node[idx]) return node;
      const next = node.slice();
      next[idx] = child;
      return next;
    }
    if (node !== null && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (i === segs.length - 1) {
        if (text === undefined) {
          if (!(key in obj)) return node;
          const rest = { ...obj };
          delete rest[key];
          return rest;
        }
        if (obj[key] === text) return node;
        return { ...obj, [key]: text };
      }
      if (!(key in obj)) return node;
      const child = setIn(obj[key], i + 1);
      if (child === obj[key]) return node;
      return { ...obj, [key]: child };
    }
    return node;
  };

  const nextProps = setIn(block.props, 0);
  if (nextProps === block.props) return block;
  return { ...block, props: nextProps } as EmailBlock;
}
```

Note the leaf write does NOT require the key to exist (typing into an empty placeholder creates it); only intermediate segments and deletes require existence. An array as the leaf container is handled by the same recursion (unused today, harmless).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/doc/edit-path.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Amend the spec's one implementation-detail line**

In `docs/superpowers/specs/2026-07-12-lab-inline-text-edit-design.md`, section "1. `EditableText`", replace:

`- A `CanvasEditContext` (React context, default `null`). The grid canvas provides`

with:

`- An explicit `EditScope` prop (no React context — a module-scope createContext would poison the pure block modules for server-component importers). The grid canvas provides`

- [ ] **Step 6: Commit**

```bash
git add lib/email/doc/edit-path.ts lib/email/doc/edit-path.test.ts docs/superpowers/specs/2026-07-12-lab-inline-text-edit-design.md
git commit -m "feat(email-lab): applyTextAtPath — the one write path for inline canvas edits" -- lib/email/doc/edit-path.ts lib/email/doc/edit-path.test.ts docs/superpowers/specs/2026-07-12-lab-inline-text-edit-design.md
```

---

### Task 2: `EditableText` — the canvas-editing primitive

**Files:**
- Create: `lib/email/blocks/editable-text.tsx`
- Test: `lib/email/blocks/editable-text.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (standalone).
- Produces:
  - `type EditCommit = (blockId: string, path: string, text: string | undefined) => void`
  - `interface EditScope { blockId: string; commit: EditCommit }`
  - `escapeHtml(s: string): string`
  - `readEditedText(el: HTMLElement): string` — innerText with NBSP→space and trailing newlines trimmed
  - `EditableText(props: { value: string; path: string; scope?: EditScope; as?: React.ElementType; className?: string; style?: React.CSSProperties; multiline?: boolean; placeholder?: string })`
    - `scope` absent + `as` given → `<Comp className style>{value}</Comp>` (byte parity)
    - `scope` absent + `as` omitted → the bare string (fragment; for text inside a shared `<td>`/`<a>`)
    - `scope` present → editable node (`as` omitted renders a `<span>`); `dangerouslySetInnerHTML={{__html: escapeHtml(value)}}` so canvas re-renders (auto-height, RGL) never clobber in-progress typing — React skips the DOM write while the `__html` string is unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
// lib/email/blocks/editable-text.test.tsx
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Text } from "@react-email/components";
import { EditableText, escapeHtml, readEditedText, type EditScope } from "./editable-text";

const S = { fontSize: "16px", margin: 0 } as const;
const scope: EditScope = { blockId: "b1", commit: () => {} };

describe("escapeHtml", () => {
  it("escapes the five specials and nothing else", () => {
    expect(escapeHtml(`<b>&"'x`)).toBe("&lt;b&gt;&amp;&quot;&#39;x");
    expect(escapeHtml("plain 3 bd · 2 ba\nline2")).toBe("plain 3 bd · 2 ba\nline2");
  });
});

describe("EditableText — server parity (no scope)", () => {
  it("as={Text}: byte-identical to the raw component", () => {
    const ours = renderToStaticMarkup(<EditableText as={Text} style={S} value="Hi" path="body" />);
    const raw = renderToStaticMarkup(<Text style={S}>Hi</Text>);
    expect(ours).toBe(raw);
  });

  it("as omitted: the bare string, no wrapper", () => {
    const html = renderToStaticMarkup(
      <td>
        <EditableText value="Row text" path="items.0.text" />
      </td>,
    );
    expect(html).toBe("<td>Row text</td>");
  });

  it("className passes through (display-font nodes)", () => {
    const ours = renderToStaticMarkup(
      <EditableText as={Text} className="df" style={S} value="$485K" path="value" />,
    );
    const raw = renderToStaticMarkup(
      <Text className="df" style={S}>
        $485K
      </Text>,
    );
    expect(ours).toBe(raw);
  });
});

describe("EditableText — canvas mode (scope present)", () => {
  it("renders contentEditable with the path attr and escaped content", () => {
    const html = renderToStaticMarkup(
      <EditableText as={Text} style={S} value={`<i>&`} path="body" scope={scope} placeholder="Add text…" />,
    );
    expect(html).toContain('contenteditable="true"');
    expect(html).toContain('data-edit-path="body"');
    expect(html).toContain('data-placeholder="Add text…"');
    expect(html).toContain("&lt;i&gt;&amp;");
  });

  it("as omitted becomes an editable span", () => {
    const html = renderToStaticMarkup(<EditableText value="34" path="stats.0.value" scope={scope} />);
    expect(html).toStartWith("<span");
    expect(html).toContain('data-edit-path="stats.0.value"');
  });
});

describe("readEditedText", () => {
  it("normalizes NBSP and trims trailing newlines", () => {
    const el = { innerText: "a b\n\n" } as unknown as HTMLElement;
    expect(readEditedText(el)).toBe("a b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/blocks/editable-text.test.tsx`
Expected: FAIL — `Cannot find module './editable-text'`

- [ ] **Step 3: Write the implementation**

```tsx
// lib/email/blocks/editable-text.tsx — PURE (no "use client", no hooks, no context).
//
// The ONE canvas-editing primitive. Every text node in a block component renders
// through this. With no `scope` (server render(), compile-grid, emailRender) it
// emits EXACTLY today's markup — `<Comp className style>{value}</Comp>`, or the
// bare string when `as` is omitted (text living inside a shared <td>/<a>) — so
// sendable HTML is byte-identical (pinned by editable-text.test.tsx).
//
// With a scope (the grid canvas passes one through BlockRenderer) the node is an
// UNCONTROLLED contentEditable: content seeds via dangerouslySetInnerHTML with an
// escaped string, so canvas re-renders mid-edit (auto-height, RGL layout) never
// clobber typing — React skips the DOM write while the __html string is unchanged
// (the react.dev contentEditable rule: manage content manually, commit on blur).
// Escape reverts; Enter commits on single-line fields; blur commits when changed.
import type * as React from "react";

export type EditCommit = (blockId: string, path: string, text: string | undefined) => void;

export interface EditScope {
  blockId: string;
  commit: EditCommit;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** innerText → committed string: NBSP (contentEditable's space) back to a plain
 *  space, trailing newlines (the <br> a browser leaves at the end) trimmed. */
export function readEditedText(el: HTMLElement): string {
  return el.innerText.replace(/ /g, " ").replace(/\n+$/, "");
}

export function EditableText({
  value,
  path,
  scope,
  as,
  className,
  style,
  multiline,
  placeholder,
}: {
  value: string;
  path: string;
  scope?: EditScope;
  /** Element to render (Text, "td"…). Omitted → bare string on the server,
   *  an editable <span> on the canvas (for text inside a shared cell/anchor). */
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  /** Multi-line prose (whiteSpace: pre-line fields): Enter inserts a newline.
   *  Single-line (default): Enter commits. */
  multiline?: boolean;
  /** Canvas-only empty-state hint (rendered via CSS :empty::before). */
  placeholder?: string;
}) {
  if (!scope) {
    if (!as) return value;
    const Comp = as;
    return (
      <Comp className={className} style={style}>
        {value}
      </Comp>
    );
  }

  const Comp = as ?? "span";
  const { blockId, commit } = scope;
  return (
    <Comp
      className={className}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-edit-path={path}
      data-placeholder={placeholder}
      dangerouslySetInnerHTML={{ __html: escapeHtml(value) }}
      onFocus={(e: React.FocusEvent<HTMLElement>) => {
        const el = e.currentTarget;
        if (el.dataset.orig === undefined) el.dataset.orig = readEditedText(el);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        const el = e.currentTarget;
        if (e.key === "Escape") {
          el.innerText = el.dataset.orig ?? value;
          el.blur();
        } else if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          el.blur();
        }
      }}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const el = e.currentTarget;
        const next = readEditedText(el);
        delete el.dataset.orig;
        if (next !== value) commit(blockId, path, next);
      }}
    />
  );
}
```

Note `EditableText` returns `value` (a string) in bare server mode — a valid React node. If TypeScript's JSX return type complains under the repo's config, wrap as `<>{value}</>` ONLY if the bare-string parity test still passes (fragments add no bytes).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/blocks/editable-text.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/email/blocks/editable-text.tsx lib/email/blocks/editable-text.test.tsx
git commit -m "feat(email-lab): EditableText primitive — uncontrolled contentEditable, byte-parity server render" -- lib/email/blocks/editable-text.tsx lib/email/blocks/editable-text.test.tsx
```

---

### Task 3: BlockRenderer edit prop + TextBlock adoption + sendable guard

**Files:**
- Modify: `lib/email/blocks/BlockRenderer.tsx`
- Modify: `lib/email/blocks/TextBlock.tsx`
- 🔴 Test: `lib/email/blocks/editable-adoption.test.tsx` (new — grows through Task 7)
- Modify: `lib/email/blocks/EmailDocRenderer.test.ts` (sendable guard)

**Interfaces:**
- Consumes: `EditScope`, `EditCommit`, `EditableText` from Task 2.
- Produces:
  - `BlockRenderer` gains `edit?: { commit: EditCommit }`; computes `scope = edit ? { blockId: block.id, commit: edit.commit } : undefined` and passes `scope` to adopted components.
  - Adopted block components gain `scope?: EditScope` in their props object (last position). Later tasks repeat this exact pattern.
  - Test helpers `pathsIn(block)` / `serverHtml(block)` used by Tasks 4–7.

- [ ] **Step 1: Write the failing adoption test**

```tsx
// lib/email/blocks/editable-adoption.test.tsx
//
// Per-block contract: WHICH paths are editable on the canvas, and that the
// server render (no edit prop) carries zero edit artifacts. Grows with each
// adoption task; the `sources` block is pinned NEVER-editable here.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockRenderer } from "./BlockRenderer";
import type { EmailBlock, EmailGlobalStyle } from "../doc/types";

const GS: EmailGlobalStyle = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};
const EDIT = { commit: () => {} };

export function pathsIn(block: EmailBlock): string[] {
  const html = renderToStaticMarkup(<BlockRenderer block={block} globalStyle={GS} edit={EDIT} />);
  return [...html.matchAll(/data-edit-path="([^"]+)"/g)].map((m) => m[1]);
}
export function serverHtml(block: EmailBlock): string {
  return renderToStaticMarkup(<BlockRenderer block={block} globalStyle={GS} />);
}
function expectClean(block: EmailBlock) {
  const html = serverHtml(block);
  expect(html).not.toContain("contenteditable");
  expect(html).not.toContain("data-edit-path");
  expect(html).not.toContain("data-placeholder");
}

describe("text block", () => {
  const b: EmailBlock = { id: "t1", type: "text", props: { body: "Hello", align: "left" } };
  it("canvas: body is editable", () => expect(pathsIn(b)).toEqual(["body"]));
  it("canvas: empty body still renders an editable placeholder node", () => {
    expect(pathsIn({ id: "t2", type: "text", props: {} })).toEqual(["body"]);
  });
  it("server: clean", () => expectClean(b));
  it("server: empty body renders nothing (parity with today)", () => {
    expect(serverHtml({ id: "t2", type: "text", props: {} })).not.toContain("<p");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/blocks/editable-adoption.test.tsx`
Expected: FAIL — BlockRenderer has no `edit` prop / no `data-edit-path` in output.

- [ ] **Step 3: Wire BlockRenderer**

In `lib/email/blocks/BlockRenderer.tsx`, add the import and prop:

```tsx
import type { EditCommit, EditScope } from "./editable-text";
```

Extend the signature (after `emailRender`):

```tsx
  /** Canvas-editing hook (GridCanvas passes it; server callers never do).
   *  Present → adopted components render their text via EditableText. */
  edit?: { commit: EditCommit };
```

At the top of the function body:

```tsx
  const scope: EditScope | undefined = edit ? { blockId: block.id, commit: edit.commit } : undefined;
```

Change the `text` case (later tasks change their own cases the same way):

```tsx
    case "text":
      return <TextBlock props={block.props} globalStyle={globalStyle} scope={scope} />;
```

- [ ] **Step 4: Adopt in TextBlock**

`lib/email/blocks/TextBlock.tsx` — replace the whole component with:

```tsx
// lib/email/blocks/TextBlock.tsx — PURE. A paragraph of prose.
import { Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, TextProps } from "../doc/types";
import { fontStack, sectionPad, CARD_BG, BORDER } from "./styles";
import { isDarkBg, ON_DARK_BODY } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

export function TextBlock({
  props,
  globalStyle,
  scope,
}: {
  props: TextProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const bg = props.sectionBg ?? CARD_BG;
  const inner = (
    <Section
      style={{
        backgroundColor: bg,
        padding: sectionPad(props.paddingY),
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      {props.body || scope ? (
        <EditableText
          as={Text}
          value={props.body ?? ""}
          path="body"
          scope={scope}
          multiline
          placeholder="Write your message…"
          style={{
            fontFamily: font,
            fontSize: "16px",
            lineHeight: "1.75",
            color: isDarkBg(bg) ? ON_DARK_BODY : globalStyle.textColor,
            textAlign: props.align ?? "left",
            margin: 0,
            whiteSpace: "pre-line",
          }}
        />
      ) : null}
    </Section>
  );
  if (!props.linkUrl) return inner;
  return (
    <Link href={props.linkUrl} style={{ display: "block", textDecoration: "none" }}>
      {inner}
    </Link>
  );
}
```

The condition change `props.body ?` → `props.body || scope ?` is the adoption pattern for every conditional text node: server behavior identical (scope undefined), canvas always offers the node with a placeholder.

- [ ] **Step 5: Add the sendable guard to the renderer test**

In `lib/email/blocks/EmailDocRenderer.test.ts`, inside the existing `describe` that renders `ALL_BLOCKS_DOC`, add:

```ts
  it("sendable HTML carries zero canvas-edit artifacts", async () => {
    const html = await render(<EmailDocEmail doc={ALL_BLOCKS_DOC} />);
    expect(html).not.toContain("contenteditable");
    expect(html).not.toContain("data-edit-path");
    expect(html).not.toContain("data-placeholder");
  });
```

(If the file's existing tests call `render` without JSX — match the file's existing invocation style exactly.)

- [ ] **Step 6: Run tests**

Run: `bun test lib/email/blocks/editable-adoption.test.tsx lib/email/blocks/EmailDocRenderer.test.ts lib/email/blocks/editable-text.test.tsx`
Expected: PASS — adoption tests green, renderer suite untouched-green, guard green.

- [ ] **Step 7: Commit**

```bash
git add lib/email/blocks/BlockRenderer.tsx lib/email/blocks/TextBlock.tsx lib/email/blocks/editable-adoption.test.tsx lib/email/blocks/EmailDocRenderer.test.ts
git commit -m "feat(email-lab): BlockRenderer edit scope + TextBlock inline editing + sendable-HTML guard" -- lib/email/blocks/BlockRenderer.tsx lib/email/blocks/TextBlock.tsx lib/email/blocks/editable-adoption.test.tsx lib/email/blocks/EmailDocRenderer.test.ts
```

---

### Task 4: Hero + Signal adoption

**Files:**
- Modify: `lib/email/blocks/HeroBlock.tsx`, `lib/email/blocks/SignalBlock.tsx`, `lib/email/blocks/BlockRenderer.tsx`
- 🔴 Test: `lib/email/blocks/editable-adoption.test.tsx`

**Interfaces:**
- Consumes: `EditableText`/`EditScope` (Task 2), `pathsIn`/`serverHtml` helpers and the `props.X || scope` pattern (Task 3).
- Produces: `hero` paths `["kicker","value","label","prose"]`; `signal` paths `["kicker","title","body"]`.

- [ ] **Step 1: Write the failing tests** (append to `editable-adoption.test.tsx`)

```tsx
describe("hero block", () => {
  const b: EmailBlock = {
    id: "h1",
    type: "hero",
    props: { kicker: "K", value: "$485K", label: "L", prose: "P" },
  };
  it("canvas paths", () => expect(pathsIn(b)).toEqual(["kicker", "value", "label", "prose"]));
  it("server clean", () => expectClean(b));
});

describe("signal block", () => {
  const b: EmailBlock = { id: "sg1", type: "signal", props: { kicker: "K", title: "T", body: "B" } };
  it("canvas paths", () => expect(pathsIn(b)).toEqual(["kicker", "title", "body"]));
  it("server clean", () => expectClean(b));
});
```

(`expectClean` from Task 3 — make it a non-exported top-level function in this file.)

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/blocks/editable-adoption.test.tsx` → FAIL (no paths found).

- [ ] **Step 3: Adopt in HeroBlock**

`BlockRenderer.tsx`: `case "hero": return <HeroBlock props={block.props} globalStyle={globalStyle} scope={scope} />;`

`HeroBlock.tsx`: add `import { EditableText, type EditScope } from "./editable-text";`, add `scope?: EditScope` to the props object (same shape as TextBlock), then convert the four text nodes. Each conversion keeps the STYLE OBJECT VERBATIM and moves the child into `value`:

```tsx
      {props.kicker || scope ? (
        <EditableText
          as={Text}
          value={props.kicker ?? ""}
          path="kicker"
          scope={scope}
          placeholder="Kicker"
          style={{
            fontFamily: font,
            fontSize: "11px",
            fontWeight: 700,
            color: onDark ? legibleAccent(globalStyle.accentColor, bg) : globalStyle.accentColor,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            margin: "0 0 8px",
            ...(clipping ? { minHeight: "34px" } : {}),
          }}
        />
      ) : null}
```

Same transform for `value` (keeps `className={DISPLAY_FONT_CLASS}` via `className` prop, `placeholder="$0"`), `label` (`placeholder="Label"`), `prose` (`multiline`, `placeholder="Add a sentence…"`). Exact style objects are already in the file — do not retype them, move them.

- [ ] **Step 4: Adopt in SignalBlock** — same pattern: `kicker` (`placeholder="Kicker"`), `title` (`placeholder="Headline"`), `body` (`multiline`, `placeholder="What's the signal…"`), plus the `case "signal"` scope pass-through in BlockRenderer.

- [ ] **Step 5: Run tests** — `bun test lib/email/blocks` → all green (adoption, parity, renderer guard, hero-clipping, ink-guards, on-dark suites).

- [ ] **Step 6: Commit**

```bash
git add lib/email/blocks/HeroBlock.tsx lib/email/blocks/SignalBlock.tsx lib/email/blocks/BlockRenderer.tsx lib/email/blocks/editable-adoption.test.tsx
git commit -m "feat(email-lab): inline editing — hero + signal blocks" -- lib/email/blocks/HeroBlock.tsx lib/email/blocks/SignalBlock.tsx lib/email/blocks/BlockRenderer.tsx lib/email/blocks/editable-adoption.test.tsx
```

---

### Task 5: Stats + List + MultiColumn adoption (array rows)

**Files:**
- Modify: `lib/email/blocks/StatsBlock.tsx`, `lib/email/blocks/ListBlock.tsx`, `lib/email/blocks/MultiColumnBlock.tsx`, `lib/email/blocks/BlockRenderer.tsx`
- 🔴 Test: `lib/email/blocks/editable-adoption.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: `stats` paths `["stats.0.value","stats.0.label","stats.1.value","stats.1.label"]` (per cell, both stacked and side-by-side variants); `list` paths `["title","items.0.lead","items.0.text",…]`; `multi-column` paths `["columns.0.heading","columns.0.body","columns.0.linkLabel",…]`.

- [ ] **Step 1: Failing tests** (append)

```tsx
describe("stats block", () => {
  const b: EmailBlock = {
    id: "st1",
    type: "stats",
    props: { stats: [{ value: "34", label: "DOM" }, { value: "3.2", label: "Supply" }] },
  };
  it("canvas paths (side-by-side)", () =>
    expect(pathsIn(b)).toEqual(["stats.0.value", "stats.0.label", "stats.1.value", "stats.1.label"]));
  it("server clean", () => expectClean(b));
});

describe("list block", () => {
  const b: EmailBlock = {
    id: "l1",
    type: "list",
    props: { title: "Events", items: [{ lead: "JUL 12 ·", text: "Open house", linkUrl: "https://x.test" }] },
  };
  it("canvas paths", () => expect(pathsIn(b)).toEqual(["title", "items.0.lead", "items.0.text"]));
  it("server clean", () => expectClean(b));
});

describe("multi-column block", () => {
  const b: EmailBlock = {
    id: "mc1",
    type: "multi-column",
    props: { columns: [{ heading: "H", body: "B", linkUrl: "https://x.test", linkLabel: "More" }] },
  };
  it("canvas paths", () =>
    expect(pathsIn(b)).toEqual(["columns.0.heading", "columns.0.body", "columns.0.linkLabel"]));
  it("server clean", () => expectClean(b));
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: StatsBlock** — add `scope?: EditScope` + BlockRenderer pass-through (`case "stats"` keeps `colPx`). In BOTH variants (stacked and side-by-side), the two `<Text>` cells become (side-by-side shown; stacked is identical with its own style objects):

```tsx
            <EditableText
              as={Text}
              value={s.value}
              path={`stats.${i}.value`}
              scope={scope}
              placeholder="0"
              style={{
                fontFamily: font,
                fontSize: "32px",
                fontWeight: 700,
                letterSpacing: "0.01em",
                color: globalStyle.primaryColor,
                margin: 0,
              }}
            />
            <EditableText
              as={Text}
              value={s.label}
              path={`stats.${i}.label`}
              scope={scope}
              placeholder="Label"
              style={{ fontFamily: font, fontSize: "11px", color: MUTED, margin: "4px 0 0" }}
            />
```

Stats cells always exist (structural array) — no `|| scope` conditionals needed; `value`/`label` are required strings.

- [ ] **Step 4: ListBlock** — `title` becomes `as={Text}` EditableText (`props.title || scope` condition, `placeholder="List title"`). The `lead` and `text` live inside shared `<td>`s (the text td also holds the View→ link), so they use **bare/span mode** (`as` omitted — server renders the raw string, canvas an editable span):

```tsx
                  <EditableText value={item.lead ?? ""} path={`items.${i}.lead`} scope={scope} />
```

replaces `{item.lead}` inside its td (keep the td's conditional as `item.lead ? … : null` — an absent lead cell is LAYOUT, colSpan changes; do not force-render it), and

```tsx
                {(item.text || scope) ? (
                  <EditableText value={item.text} path={`items.${i}.text`} scope={scope} placeholder="Row text…" />
                ) : null}
```

replaces `{item.text}`.

- [ ] **Step 5: MultiColumnBlock** — `heading`/`body` become `as={Text}` EditableTexts (conditions `c.heading || scope`, `c.body || scope`; body `multiline`; keep verbatim styles). `linkLabel` is inside the `<Link>` with an ` →` suffix — bare mode around the label only:

```tsx
                  <EditableText value={c.linkLabel || "Learn more"} path={`columns.${i}.linkLabel`} scope={scope} />
                  {" →"}
```

replaces `{c.linkLabel || "Learn more"} →` (server output byte-check: JSX `{label} →` and `{label}{" →"}` both emit `label →` with no extra nodes — the parity guard in the test pins it).

- [ ] **Step 6: Run tests** — `bun test lib/email/blocks` → PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/email/blocks/StatsBlock.tsx lib/email/blocks/ListBlock.tsx lib/email/blocks/MultiColumnBlock.tsx lib/email/blocks/BlockRenderer.tsx lib/email/blocks/editable-adoption.test.tsx
git commit -m "feat(email-lab): inline editing — stats, list, multi-column rows" -- lib/email/blocks/StatsBlock.tsx lib/email/blocks/ListBlock.tsx lib/email/blocks/MultiColumnBlock.tsx lib/email/blocks/BlockRenderer.tsx lib/email/blocks/editable-adoption.test.tsx
```

---

### Task 6: Listing + MetricCard adoption (joined-string splits)

**Files:**
- Modify: `lib/email/blocks/ListingBlock.tsx`, `lib/email/blocks/MetricCardBlock.tsx`, `lib/email/blocks/BlockRenderer.tsx`
- 🔴 Test: `lib/email/blocks/editable-adoption.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: `listing` paths `["badge","price","beds","baths","sqft","address"]`; `metric-card` paths `["metricValue","metricLabel","sub","rankText","movementText"]`. Pattern for JOINED strings (specs line, captions line): server renders today's joined string verbatim; canvas renders per-field editable spans with the identical separator literals between them.

- [ ] **Step 1: Failing tests** (append)

```tsx
describe("listing block", () => {
  const b: EmailBlock = {
    id: "li1",
    type: "listing",
    props: { badge: "Just Sold", price: "$485K", beds: "3", baths: "2", sqft: "1,850", address: "123 Main St" },
  };
  it("canvas paths", () =>
    expect(pathsIn(b)).toEqual(["badge", "price", "beds", "baths", "sqft", "address"]));
  it("server: specs line stays the joined string", () => {
    expect(serverHtml(b)).toContain("3 bd   ·   2 ba   ·   1,850 sqft");
  });
  it("server clean", () => expectClean(b));
});

describe("metric-card block", () => {
  const b: EmailBlock = {
    id: "m1",
    type: "metric-card",
    props: { metricValue: "$495K", metricLabel: "Median", sub: "90-day", rankText: "#2 of 54", movementText: "↑ 6.8% YoY" },
  };
  it("canvas paths", () =>
    expect(pathsIn(b)).toEqual(["metricValue", "metricLabel", "sub", "rankText", "movementText"]));
  it("server: captions stay joined", () => expect(serverHtml(b)).toContain("#2 of 54  ·  ↑ 6.8% YoY"));
  it("server clean", () => expectClean(b));
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: ListingBlock** — `badge`, `price`, `address` are straight `as={Text}` conversions (`X || scope` conditions; placeholders `"Badge"`, `"$0"`, `"Address"`; verbatim styles). The computed `specs` line branches on scope:

```tsx
      {scope ? (
        <Text style={{ fontFamily: font, fontSize: "13px", color: MUTED, margin: "4px 0 0" }}>
          <EditableText value={props.beds ?? ""} path="beds" scope={scope} placeholder="3" /> bd{"   ·   "}
          <EditableText value={props.baths ?? ""} path="baths" scope={scope} placeholder="2" /> ba{"   ·   "}
          <EditableText value={props.sqft ?? ""} path="sqft" scope={scope} placeholder="1,200" /> sqft
        </Text>
      ) : specs ? (
        <Text style={{ fontFamily: font, fontSize: "13px", color: MUTED, margin: "4px 0 0" }}>
          {specs}
        </Text>
      ) : null}
```

(Server branch is byte-identical to today; canvas shows all three unit suffixes even when a field is empty — acceptable canvas-only affordance, documented in the spec's empty-slot rule.)

- [ ] **Step 4: MetricCardBlock** — `metricValue`, `metricLabel`, `sub` are straight `as={Text}` conversions. The captions line branches like specs:

```tsx
      {scope ? (
        <Text
          style={{ fontFamily: font, fontSize: "12px", fontWeight: 600, color: accent, margin: "8px 0 0" }}
        >
          <EditableText value={props.rankText ?? ""} path="rankText" scope={scope} placeholder="#rank" />
          {"  ·  "}
          <EditableText value={props.movementText ?? ""} path="movementText" scope={scope} placeholder="↑ change" />
        </Text>
      ) : captions.length > 0 ? (
        <Text
          style={{ fontFamily: font, fontSize: "12px", fontWeight: 600, color: accent, margin: "8px 0 0" }}
        >
          {captions.join("  ·  ")}
        </Text>
      ) : null}
```

The percentile BAR stays untouched (a bar is a restatement of a held percentile — no text path binds `barPct`).

- [ ] **Step 5: BlockRenderer pass-throughs** for `listing` and `metric-card`; run `bun test lib/email/blocks` (includes `MetricCardBlock.test.ts`, `ImageBlock.test.ts` etc.) → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/email/blocks/ListingBlock.tsx lib/email/blocks/MetricCardBlock.tsx lib/email/blocks/BlockRenderer.tsx lib/email/blocks/editable-adoption.test.tsx
git commit -m "feat(email-lab): inline editing — listing + metric card (joined-string canvas splits)" -- lib/email/blocks/ListingBlock.tsx lib/email/blocks/MetricCardBlock.tsx lib/email/blocks/BlockRenderer.tsx lib/email/blocks/editable-adoption.test.tsx
```

---

### Task 7: Header + Button + Footer + Image + AgentCard + AgentHero adoption; sources pinned never-editable

**Files:**
- Modify: `lib/email/blocks/HeaderBlock.tsx`, `ButtonBlock.tsx`, `FooterBlock.tsx`, `ImageBlock.tsx`, `AgentCardBlock.tsx`, `AgentHeroBlock.tsx`, `BlockRenderer.tsx`
- 🔴 Test: `lib/email/blocks/editable-adoption.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–3 patterns (straight `as={Text}`, bare/span-in-anchor, shared-Text split).
- Produces: `header` `["companyName","tagline"]` · `button` `["label"]` · `footer` `["companyName","address","phone"]` · `image` `["caption"]` or `["overlayTitle","overlayBody"]` · `agent-card` `["name","title","bio","phone","ctaLabel"]` · `agent-hero` `["name","designation","tagline","ctaLabel"]` · `sources` `[]` (pinned).

- [ ] **Step 1: Failing tests** (append)

```tsx
describe("header block", () => {
  const b: EmailBlock = { id: "hd1", type: "header", props: { companyName: "Acme", tagline: "Tag" } };
  it("canvas paths", () => expect(pathsIn(b)).toEqual(["companyName", "tagline"]));
  it("server clean", () => expectClean(b));
});

describe("button block", () => {
  const linked: EmailBlock = { id: "bt1", type: "button", props: { label: "Book", url: "https://x.test" } };
  const bare: EmailBlock = { id: "bt2", type: "button", props: { label: "Book" } };
  it("canvas: label editable in both variants", () => {
    expect(pathsIn(linked)).toEqual(["label"]);
    expect(pathsIn(bare)).toEqual(["label"]);
  });
  it("server: anchor markup unchanged (no span inside)", () => {
    expect(serverHtml(linked)).toContain(">Book</a>");
  });
  it("server clean", () => expectClean(linked));
});

describe("footer block", () => {
  const b: EmailBlock = {
    id: "f1",
    type: "footer",
    props: { companyName: "Acme", address: "1 Main St", phone: "239-555-0100", unsubscribeUrl: "https://x.test/u" },
  };
  it("canvas paths", () => expect(pathsIn(b)).toEqual(["companyName", "address", "phone"]));
  it("server clean", () => expectClean(b));
});

describe("image block", () => {
  const cap: EmailBlock = { id: "i1", type: "image", props: { url: "https://x.test/p.jpg", caption: "Cape Coral" } };
  const ovl: EmailBlock = { id: "i2", type: "image", props: { url: "https://x.test/p.jpg", overlayTitle: "T", overlayBody: "B" } };
  it("caption path", () => expect(pathsIn(cap)).toEqual(["caption"]));
  it("overlay paths", () => expect(pathsIn(ovl)).toEqual(["overlayTitle", "overlayBody"]));
  it("server clean", () => expectClean(cap));
});

describe("agent blocks", () => {
  const card: EmailBlock = {
    id: "a1",
    type: "agent-card",
    props: { name: "N", title: "T", bio: "B", phone: "P", ctaLabel: "Call", ctaUrl: "https://x.test" },
  };
  const hero: EmailBlock = {
    id: "a2",
    type: "agent-hero",
    props: { name: "N", designation: "D", tagline: "TL", ctaLabel: "Call", ctaUrl: "https://x.test" },
  };
  it("agent-card paths", () => expect(pathsIn(card)).toEqual(["name", "title", "bio", "phone", "ctaLabel"]));
  it("agent-hero paths", () => expect(pathsIn(hero)).toEqual(["name", "designation", "tagline", "ctaLabel"]));
  it("server clean", () => expectClean(card));
});

describe("sources block — NEVER editable (provenance carve-out)", () => {
  const b: EmailBlock = {
    id: "src1",
    type: "sources",
    props: { sources: [{ url: "https://x.test", label: "Source" }], note: "refreshed nightly" },
  };
  it("no canvas paths even with edit scope", () => expect(pathsIn(b)).toEqual([]));
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (sources test passes already; it is the pin).

- [ ] **Step 3: Adopt.** All BlockRenderer cases gain `scope={scope}` EXCEPT `sources`, `divider`, `social-icons`. Component edits:

- **HeaderBlock:** `companyName` → `as={Text}` with `className={DISPLAY_FONT_CLASS}` kept, `placeholder="Company"`; `tagline` → `as={Text}`, `placeholder="Tagline"`. Conditions `props.X || scope`.
- **ButtonBlock:** the early return `if (!props.label) return null;` becomes `if (!props.label && !scope) return null;`. Linked variant — bare mode inside the anchor: `<Button href={props.url} style={sharedStyle}><EditableText value={props.label ?? ""} path="label" scope={scope} placeholder="Button" /></Button>`. Text variant — `as={Text}` with the `{ ...sharedStyle, margin: 0 }` style, same path/placeholder.
- **FooterBlock:** the shared company+address `<Text>` keeps its outer condition extended (`props.companyName || props.address || scope`) and splits its two strings into bare-mode EditableTexts around the existing `<br />`: `<EditableText value={props.companyName ?? ""} path="companyName" scope={scope} placeholder="Company" />` and, inside the address conditional (`props.address || scope`), `<EditableText value={props.address ?? ""} path="address" scope={scope} placeholder="Postal address (CAN-SPAM)" />`. The contact line: only `phone` binds (email/website are link plumbing — inspector-only): on canvas render `<EditableText value={props.phone ?? ""} path="phone" scope={scope} placeholder="Phone" />` followed by the email/website joined remainder as static text (` · ` separators preserved); on server keep today's `[...].filter(Boolean).join(" · ")` verbatim (same branch pattern as Task 6's specs line). Social links + unsubscribe untouched.
- **ImageBlock:** overlay branch — `overlayTitle`/`overlayBody` → `as={Text}` conversions (`multiline` on body; placeholders `"Headline"` / `"Supporting text"`; conditions `X || scope`). Non-overlay branch — `caption` → `as={Text}` (`placeholder="Caption"`, condition `props.caption || scope`). The `"Image"` empty-state placeholder Text is UI copy — NOT bound.
- **AgentCardBlock:** `name`, `title`, `bio` (`multiline`), `phone` → straight `as={Text}` conversions with `X || scope` conditions; `ctaLabel` — bare mode inside the Link, keeping the arrow outside: `<EditableText value={props.ctaLabel ?? ""} path="ctaLabel" scope={scope} />{" →"}` (the whole CTA `<Text>` keeps its `props.ctaLabel && props.ctaUrl` condition — a CTA without a URL is inspector work, not typing).
- **AgentHeroBlock:** `name` (`placeholder="Agent name"`), `designation`, `tagline` (`multiline`) → `as={Text}` conversions; `ctaLabel` — same bare-in-Link pattern as AgentCardBlock. The `"Agent photo"` placeholder Text is UI copy — NOT bound.

- [ ] **Step 4: Run the full email test surface** — `bun test lib/email` → PASS (adoption table complete: 14 adopted, 3 pinned out).

- [ ] **Step 5: Commit**

```bash
git add lib/email/blocks/HeaderBlock.tsx lib/email/blocks/ButtonBlock.tsx lib/email/blocks/FooterBlock.tsx lib/email/blocks/ImageBlock.tsx lib/email/blocks/AgentCardBlock.tsx lib/email/blocks/AgentHeroBlock.tsx lib/email/blocks/BlockRenderer.tsx lib/email/blocks/editable-adoption.test.tsx
git commit -m "feat(email-lab): inline editing — header, button, footer, image, agent blocks; sources pinned never-editable" -- lib/email/blocks/HeaderBlock.tsx lib/email/blocks/ButtonBlock.tsx lib/email/blocks/FooterBlock.tsx lib/email/blocks/ImageBlock.tsx lib/email/blocks/AgentCardBlock.tsx lib/email/blocks/AgentHeroBlock.tsx lib/email/blocks/BlockRenderer.tsx lib/email/blocks/editable-adoption.test.tsx
```

---

### Task 8: Canvas wiring — commit path, pointer policy, link interception, shell guards, CSS

**Files:**
- 🟡 Modify: `components/email-lab/GridCanvas.tsx`
- Modify: `components/email-lab/EmailLabGridShell.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `applyTextAtPath` (Task 1), `EditCommit` (Task 2), BlockRenderer `edit` prop (Task 3).
- Produces: `handleEditCommit: EditCommit` inside GridCanvas (also passed to GridBlock in Task 9 as `onEditCommit`).

- [ ] **Step 1: GridCanvas — commit path + edit prop.** Add imports:

```tsx
import { applyTextAtPath } from "@/lib/email/doc/edit-path";
import type { EditCommit } from "@/lib/email/blocks/editable-text";
```

Below the existing `onAutoHeight` callback add:

```tsx
  // Inline-edit commits (EditableText blur, pill popovers) — one write path
  // through applyTextAtPath into a NORMAL undo frame (unlike autoHeightOnly).
  const handleEditCommit = useCallback<EditCommit>(
    (blockId, path, text) => {
      const cur = docRef.current;
      const blocks = cur.blocks.map((b) => (b.id === blockId ? applyTextAtPath(b, path, text) : b));
      onChangeDoc({ ...cur, blocks });
    },
    [onChangeDoc],
  );
  const edit = useMemo(() => ({ commit: handleEditCommit }), [handleEditCommit]);
```

Pass it to the renderer inside GridBlock's JSX — GridBlock gains a prop. In `GridCanvas`'s map: `<GridBlock … edit={edit} />`; in `GridBlock`'s props: `edit?: { commit: EditCommit };` and the render becomes `<BlockRenderer block={block} globalStyle={globalStyle} edit={edit} />`.

- [ ] **Step 2: GridBlock — pointer policy + link interception.** Replace the content wrapper:

```tsx
      {/* Clicks flow INTO the content now (inline editing); block-select still
          works via bubbling to this wrapper. Anchors are intercepted so a linked
          block never navigates mid-design. */}
      <div
        className="h-full"
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest("a")) e.preventDefault();
        }}
      >
        <div ref={contentRef}>
          <BlockRenderer block={block} globalStyle={globalStyle} edit={edit} />
        </div>
      </div>
```

(The old wrapper was `<div className="pointer-events-none h-full">`. The `onClickCapture` sits on the content wrapper, NOT the outer group div — pill buttons and the drag handle live outside it and keep their behavior.)

- [ ] **Step 3: Shell — keydown guard.** In `EmailLabGridShell.tsx`'s window keydown effect (`function onKey`, ~line 979), add as the FIRST line of `onKey`:

```tsx
      // Typing in an inline-editable node: let the browser's native text-level
      // undo/Escape work; the doc-level shortcuts stay out of the field.
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
```

- [ ] **Step 4: Shell — rail auto-scroll.** Add near the other refs:

```tsx
  const nowEditingRef = useRef<HTMLDivElement>(null);
  // DOM-only effect (no setState) — scroll the editor into view on select.
  useEffect(() => {
    if (selectedId) nowEditingRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);
```

and attach `ref={nowEditingRef}` to the selected-block panel div (the `<div className="border-b border-white/8 px-4 pb-4 pt-4">` directly under the `selectedBlock ?` branch, ~line 1506).

- [ ] **Step 5: Placeholder + caret CSS.** Append to `app/globals.css`:

```css
/* Email Lab inline editing (EditableText) — canvas-only affordances */
[data-edit-path] {
  cursor: text;
}
[data-edit-path]:focus {
  outline: 1px dashed #3dc9c0;
  outline-offset: 2px;
}
[data-edit-path]:empty::before {
  content: attr(data-placeholder);
  color: #9ca3af;
}
```

- [ ] **Step 6: Manual smoke** (dev server): open `/email-lab/grid`, click into the text block → caret lands, type, click away → text persists, ⌘Z restores it; click a linked hero → no navigation; drag by the ⠿ handle still moves the block; select a block → right rail scrolls "Now editing" into view; Escape once mid-edit reverts text, Escape again deselects.

- [ ] **Step 7: Run canvas-adjacent suites** — `bun test lib/email components/email-lab` and `bunx next build` → green.

- [ ] **Step 8: Commit**

```bash
git add components/email-lab/GridCanvas.tsx components/email-lab/EmailLabGridShell.tsx app/globals.css
git commit -m "feat(email-lab): canvas inline-edit wiring — commit path, pointer policy, link interception, keydown guard, rail auto-scroll" -- components/email-lab/GridCanvas.tsx components/email-lab/EmailLabGridShell.tsx app/globals.css
```

---

### Task 9: Pill popovers — link + color on the selected block

**Files:**
- Create: `lib/email/lab/block-edit-maps.ts`
- Test: `lib/email/lab/block-edit-maps.test.ts`
- 🟡 Modify: `components/email-lab/GridCanvas.tsx` (GridBlock)

**Interfaces:**
- Consumes: `handleEditCommit`/`edit` from Task 8 (GridBlock already receives `edit`).
- Produces:
  - `LINK_PROP: Partial<Record<BlockType, string>>` — `{ hero: "linkUrl", signal: "linkUrl", text: "linkUrl", image: "linkUrl", listing: "linkUrl", button: "url", "agent-card": "ctaUrl", "agent-hero": "ctaUrl" }`
  - `COLOR_PROP: Partial<Record<BlockType, string>>` — `{ header: "bgColor", signal: "bgColor", button: "bgColor", hero: "sectionBg", stats: "sectionBg", text: "sectionBg", image: "sectionBg", listing: "sectionBg", "multi-column": "sectionBg", list: "sectionBg", "metric-card": "sectionBg" }`

- [ ] **Step 1: Failing test**

```ts
// lib/email/lab/block-edit-maps.test.ts
import { describe, expect, it } from "bun:test";
import { LINK_PROP, COLOR_PROP } from "./block-edit-maps";

describe("block edit maps", () => {
  it("link prop names match the doc contract", () => {
    expect(LINK_PROP.button).toBe("url");
    expect(LINK_PROP["agent-hero"]).toBe("ctaUrl");
    expect(LINK_PROP.text).toBe("linkUrl");
    expect(LINK_PROP.sources).toBeUndefined();
    expect(LINK_PROP.footer).toBeUndefined();
  });
  it("color prop prefers bgColor where the type paints a box", () => {
    expect(COLOR_PROP.header).toBe("bgColor");
    expect(COLOR_PROP.signal).toBe("bgColor");
    expect(COLOR_PROP.text).toBe("sectionBg");
    expect(COLOR_PROP.divider).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/lab/block-edit-maps.test.ts` → FAIL.

- [ ] **Step 3: Implement the maps**

```ts
// lib/email/lab/block-edit-maps.ts — which props the canvas pill popovers edit.
// LINK: the block-level click-through (list/multi-column per-row links stay in
// the inspector). COLOR: the box the type actually paints — bgColor where the
// component reads it (header/signal/button), else the BlockBase sectionBg.
import type { BlockType } from "@/lib/email/doc/types";

export const LINK_PROP: Partial<Record<BlockType, string>> = {
  hero: "linkUrl",
  signal: "linkUrl",
  text: "linkUrl",
  image: "linkUrl",
  listing: "linkUrl",
  button: "url",
  "agent-card": "ctaUrl",
  "agent-hero": "ctaUrl",
};

export const COLOR_PROP: Partial<Record<BlockType, string>> = {
  header: "bgColor",
  signal: "bgColor",
  button: "bgColor",
  hero: "sectionBg",
  stats: "sectionBg",
  text: "sectionBg",
  image: "sectionBg",
  listing: "sectionBg",
  "multi-column": "sectionBg",
  list: "sectionBg",
  "metric-card": "sectionBg",
};
```

- [ ] **Step 4: GridBlock popover UI.** In `GridCanvas.tsx`: `import { useCallback, useMemo, useRef, useEffect, useState } from "react";` (add `useState`, `useMemo` if not present) and `import { LINK_PROP, COLOR_PROP } from "@/lib/email/lab/block-edit-maps";`. Inside `GridBlock` add:

```tsx
  const [popover, setPopover] = useState<"link" | "color" | null>(null);
  const linkProp = LINK_PROP[block.type];
  const colorProp = COLOR_PROP[block.type];
  const propsRec = block.props as Record<string, unknown>;
  const currentLink = linkProp ? ((propsRec[linkProp] as string | undefined) ?? "") : "";
  const currentColor = colorProp ? ((propsRec[colorProp] as string | undefined) ?? "#ffffff") : "#ffffff";
```

Deselecting closes popovers — add after the state line:

```tsx
  useEffect(() => {
    if (!selected) setPopover(null);
  }, [selected]);
```

In the action pill (before the ✦ button), add the two buttons, rendered only when the map has an entry:

```tsx
        {edit && linkProp && (
          <button
            type="button"
            aria-label="Edit link"
            title="Link"
            onClick={() => setPopover((p) => (p === "link" ? null : "link"))}
            className="px-1 text-sm leading-none text-gray-400 hover:text-gulf-teal"
          >
            🔗
          </button>
        )}
        {edit && colorProp && (
          <button
            type="button"
            aria-label="Edit background color"
            title="Background"
            onClick={() => setPopover((p) => (p === "color" ? null : "color"))}
            className="px-1 text-sm leading-none text-gray-400 hover:text-gulf-teal"
          >
            ▨
          </button>
        )}
```

Below the pill div (sibling, still inside the group wrapper), the anchored popover:

```tsx
      {popover && edit && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1 top-8 z-30 flex items-center gap-1.5 rounded-md bg-white p-2 shadow-md ring-1 ring-gray-200"
        >
          {popover === "link" && linkProp && (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget).get("url");
                const url = typeof v === "string" ? v.trim() : "";
                edit.commit(block.id, linkProp, url === "" ? undefined : url);
                setPopover(null);
              }}
            >
              <input
                name="url"
                type="url"
                defaultValue={currentLink}
                placeholder="https://…"
                className="w-52 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900"
              />
              <button type="submit" className="rounded bg-gulf-teal px-2 py-1 text-xs font-semibold text-[#06231f]">
                Save
              </button>
            </form>
          )}
          {popover === "color" && colorProp && (
            <>
              <input
                type="color"
                defaultValue={/^#[0-9a-fA-F]{6}$/.test(currentColor) ? currentColor : "#ffffff"}
                onBlur={(e) => {
                  edit.commit(block.id, colorProp, e.currentTarget.value);
                  setPopover(null);
                }}
                className="h-7 w-9 cursor-pointer rounded border border-gray-300"
              />
              <button
                type="button"
                onClick={() => {
                  edit.commit(block.id, colorProp, undefined);
                  setPopover(null);
                }}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
              >
                Default
              </button>
            </>
          )}
        </div>
      )}
```

(Color commits ONCE on blur of the native picker — one undo frame, no drag-spam. Empty link / Default color commit `undefined`, which `applyTextAtPath` turns into a key delete so `?? CARD_BG` fallbacks re-apply.)

- [ ] **Step 5: Run tests + manual smoke** — `bun test lib/email components/email-lab` PASS; in the browser: link popover on a text block saves and clears; color popover recolors a hero and "Default" restores; both undo with ⌘Z; popover clicks don't deselect the block.

- [ ] **Step 6: Commit**

```bash
git add lib/email/lab/block-edit-maps.ts lib/email/lab/block-edit-maps.test.ts components/email-lab/GridCanvas.tsx
git commit -m "feat(email-lab): pill link + color popovers on the selected block" -- lib/email/lab/block-edit-maps.ts lib/email/lab/block-edit-maps.test.ts components/email-lab/GridCanvas.tsx
```

---

### Task 10: Full gates + ledger sync

**Files:**
- Modify: `SESSION_LOG.md`, `_AUDIT_AND_ROADMAP/build-queue.md`

- [ ] **Step 1: Full test surface**

Run: `bun test lib/email components/email-lab lib/lab-entry` → all green.
Run: `bunx next build` → compiles clean (this is the typecheck gate — never `npx tsc`).

- [ ] **Step 2: Build-queue flip** — in `_AUDIT_AND_ROADMAP/build-queue.md`, flip the `Email Lab inline text editing` entry from `- [ ]` "SPEC WRITTEN" to `- [~]` "BUILT <date> local — ⬜ operator live-verify (`lab_inline_text_edit_live_verify`): click-type-blur on prod grid, sent email byte-parity spot-check, then close."

- [ ] **Step 3: SESSION_LOG entry** — prepend the standard entry (what shipped, suites green, spec/plan links, live-verify held open for the operator).

- [ ] **Step 4: Commit docs** (same explicit-path pattern). **Do NOT push** — pushes are operator-confirmed in this repo; hand the operator the ready state and the `node scripts/safe-push.mjs` step.

- [ ] **Step 5: Live-verify (operator)** — on the deployed lab: edit text inline on a real project doc, send-to-self, confirm the received email renders the edited text with no `contenteditable` artifacts (view source), then `node scripts/check.mjs close lab_inline_text_edit_live_verify`.

---

## Self-Review Notes

- **Spec coverage:** §1 EditableText → Task 2 · §2 prop-path binding + carve-out → Tasks 1, 3–7 (sources pinned in Task 7's test) · §3 pointer policy → Task 8 · §4 pill popovers → Task 9 · §5 rail auto-scroll → Task 8 · §6 phone/tier → no gate anywhere (nothing reads `capabilitiesFor`) · AI-contract-unchanged → no file under `lib/email/doc/schema.ts`, `lib/assistant`, or the patch path is touched · test plan → Tasks 1–3, 7, 8, 10.
- **Deviation from spec, documented:** explicit `EditScope` prop threading instead of a React context (spec amended in Task 1 Step 5).
- **Known canvas-only visual deltas (accepted, spec's empty-slot rule):** empty fields render placeholders on canvas that don't exist in sends; listing specs / metric captions show separator scaffolding when partially empty. Sendable bytes pinned identical by tests.
- **Type consistency check:** `EditCommit(blockId, path, text | undefined)` is the single signature used by EditableText (Task 2), BlockRenderer (Task 3), handleEditCommit (Task 8), and popovers (Task 9). `applyTextAtPath` mirrors it minus blockId.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 3, Task 4, Task 5, Task 6, Task 7 | `lib/email/blocks/editable-adoption.test.tsx` |
| 🟡 | Task 8, Task 9 | `components/email-lab/GridCanvas.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
