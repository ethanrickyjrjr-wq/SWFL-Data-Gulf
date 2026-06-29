"use client";
// components/email-lab/FilerobotModal.tsx
// Drop-in replacement for PhotopeaModal. Filerobot Image Editor (MIT, no ads)
// lets the user crop / filter / annotate. On save it gives us a base64 data URL;
// we convert to a File, PUT it to /api/email-lab/media, and call onSave(blockId, url).
import { useState } from "react";
import FilerobotImageEditor, { TABS, TOOLS } from "react-filerobot-image-editor";
import type { EmailBlock } from "@/lib/email/doc/types";

function photoUrlOf(block: EmailBlock): string | undefined {
  if (block.type === "image") return block.props.url;
  if (block.type === "listing") return block.props.photoUrl;
}

export function FilerobotModal({
  block,
  onSave,
  onClose,
}: {
  block: EmailBlock;
  onSave: (blockId: string, url: string) => void;
  onClose: () => void;
}) {
  const photoUrl = photoUrlOf(block);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(editedImageObject: {
    imageBase64?: string;
    mimeType?: string;
    fullName?: string;
  }) {
    const { imageBase64, mimeType, fullName } = editedImageObject;
    if (!imageBase64) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(imageBase64);
      const blob = await res.blob();
      const file = new File([blob], fullName ?? "edited.png", {
        type: mimeType ?? "image/png",
      });
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/email-lab/media", { method: "PUT", body: fd });
      if (!up.ok) {
        setError("Upload failed — try again.");
        return;
      }
      const { url } = (await up.json()) as { url: string };
      onSave(block.id, url);
      onClose();
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex h-[90dvh] w-[95vw] max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
          <span className="text-sm font-semibold text-gray-700">
            Edit photo
            {uploading && (
              <span className="ml-2 text-xs font-normal text-gray-400">Uploading…</span>
            )}
          </span>
          <button
            type="button"
            aria-label="Close photo editor"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {!photoUrl ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            Add an image URL to the block first, then click edit.
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <FilerobotImageEditor
              source={photoUrl}
              onSave={(editedImageObject) => void handleSave(editedImageObject)}
              onClose={onClose}
              tabsIds={[
                TABS.ADJUST,
                TABS.FINETUNE,
                TABS.FILTERS,
                TABS.ANNOTATE,
                TABS.WATERMARK,
                TABS.RESIZE,
              ]}
              defaultTabId={TABS.ADJUST}
              defaultToolId={TOOLS.CROP}
              savingPixelRatio={2}
              previewPixelRatio={window.devicePixelRatio ?? 1}
            />
          </div>
        )}
      </div>
    </div>
  );
}
