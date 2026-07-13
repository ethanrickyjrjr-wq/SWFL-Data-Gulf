// lib/email/blocks/OpenSlot.tsx — PURE (no "use client", no hooks). The canvas-only
// affordances for THE OPEN-SLOT CONTRACT.
//
// A gap is not a blocker and not a blank: it is an INVITATION, addressed to the user,
// that never reaches the recipient. Three states, and they are not the same:
//   sourced   → render the value.
//   not sourced → an open slot on the CANVAS; on `emailRender` the block/cell does
//                 not exist at all (never a zero, never a naked label).
//   invented  → forbidden, always.
//
// Suppression lives in the block components (they own `emailRender`); this file owns
// only what the user SEES on the canvas. Handlers are passed in (the same pattern
// EditableText uses) so these nodes stay hook-free and the shared block tree keeps
// rendering on the server paths.
//
// The uploader is NOT reimplemented here: `scope.upload` is EmailLabGridShell's own
// `uploadPhotoFile` (the one root: /api/email-lab/media, or the project's media
// endpoint), handed down through GridCanvas → BlockRenderer → the block.
import type * as React from "react";
import type { EditScope } from "./editable-text";
import { MUTED, BORDER } from "./styles";

const DASH = "#C7CDD3";

/** Read the picked file, hand it to the shell's uploader, commit the URL to THIS
 *  block. Resets the input so re-picking the same file fires again. */
function handleFile(scope: EditScope, file: File | undefined | null): void {
  if (!file || !scope.upload) return;
  void scope.upload(file).then((url) => {
    if (url) scope.commit(scope.blockId, "url", url);
  });
}

/**
 * An empty `image` block on the canvas: a dropzone with BOTH a file-picker button
 * and a "paste a link" input. `instruction` is the label — it tells the user what
 * belongs here (the image block's `alt` is the instruction channel).
 *
 * `kind: "chart"` slots get a neutral note instead: a chart is filled from real data
 * by the builder, and offering a photo picker there would be misleading.
 */
export function ImageSlot({
  instruction,
  font,
  scope,
  isChart,
}: {
  instruction: string;
  font: string;
  /** Absent (a non-canvas render) → a static, handler-free placeholder. */
  scope?: EditScope;
  isChart?: boolean;
}) {
  const box: React.CSSProperties = {
    padding: "36px 24px",
    textAlign: "center",
    backgroundColor: "#F9FAFB",
    border: `1px dashed ${DASH}`,
    borderRadius: "6px",
    margin: "12px",
  };
  const title: React.CSSProperties = {
    fontFamily: font,
    fontSize: "13px",
    fontWeight: 600,
    color: "#4B5563",
    margin: "0 0 10px",
  };

  if (isChart || !scope) {
    return (
      <div style={box}>
        <p style={title}>{instruction}</p>
        <p style={{ fontFamily: font, fontSize: "11px", color: MUTED, margin: 0 }}>
          {isChart
            ? "A chart lands here when its data resolves — every plotted number is a real one."
            : "Nothing here yet — it won't be sent."}
        </p>
      </div>
    );
  }

  return (
    <div
      style={box}
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => e.preventDefault()}
      onDrop={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        handleFile(scope, e.dataTransfer?.files?.[0]);
      }}
    >
      <p style={title}>{instruction}</p>
      <p style={{ fontFamily: font, fontSize: "11px", color: MUTED, margin: "0 0 12px" }}>
        Drop a photo here, choose a file, or paste a link. Empty slots are never sent.
      </p>
      {scope.upload ? (
        <label
          style={{
            display: "inline-block",
            cursor: "pointer",
            fontFamily: font,
            fontSize: "12px",
            fontWeight: 600,
            color: "#06231f",
            backgroundColor: "#3DC9C0",
            borderRadius: "4px",
            padding: "6px 12px",
            marginBottom: "10px",
          }}
        >
          Choose a file
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              handleFile(scope, file);
            }}
          />
        </label>
      ) : null}
      <form
        style={{ display: "flex", gap: "6px", justifyContent: "center" }}
        onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const raw = new FormData(e.currentTarget).get("slot-url");
          const url = typeof raw === "string" ? raw.trim() : "";
          e.currentTarget.reset();
          if (url) scope.commit(scope.blockId, "url", url);
        }}
      >
        <input
          name="slot-url"
          type="url"
          placeholder="…or paste an image link"
          style={{
            fontFamily: font,
            fontSize: "12px",
            padding: "5px 8px",
            border: `1px solid ${BORDER}`,
            borderRadius: "4px",
            color: "#111827",
            width: "220px",
            maxWidth: "60%",
          }}
        />
        <button
          type="submit"
          style={{
            fontFamily: font,
            fontSize: "12px",
            fontWeight: 600,
            padding: "5px 10px",
            border: `1px solid ${BORDER}`,
            borderRadius: "4px",
            backgroundColor: "#ffffff",
            color: "#374151",
            cursor: "pointer",
          }}
        >
          Add
        </button>
      </form>
    </div>
  );
}

/** The dashed outline an empty, fillable cell/paragraph wears on the canvas — the
 *  visible "this is yours to fill" cue. Never reaches an email (the block component
 *  returns null on `emailRender` before this is used). */
export const OPEN_SLOT_INK: React.CSSProperties = {
  border: `1px dashed ${DASH}`,
  borderRadius: "4px",
  backgroundColor: "#F9FAFB",
};
