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

/** Upload a file the user picked/dropped on an OPEN SLOT → the hosted URL (null on
 *  a miss). The shell owns the ONE uploader (EmailLabGridShell.uploadPhotoFile →
 *  /api/email-lab/media | /api/projects/:id/email-media); the slot only asks for a
 *  URL and commits it to ITS OWN block, so filling a slot never depends on which
 *  block happens to be selected. */
export type SlotUpload = (file: File) => Promise<string | null>;

export interface EditScope {
  blockId: string;
  commit: EditCommit;
  /** Present on the canvas when the shell wired an uploader; absent → an open
   *  image slot offers "paste a link" only (never a broken file button). */
  upload?: SlotUpload;
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
