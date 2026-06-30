"use client";
// components/email-lab/PhotosPanel.tsx
//
// The Photos accordion, extracted from EmailLabGridShell so BOTH shells (email + the
// social composer) use the identical component: paste-a-URL, upload-new, and the
// project's filed photos. Purely presentational — the parent owns "what does this URL
// land on" (an email image block, or the selected social image element) via onApplyUrl.
import { useRef, useState, type ChangeEvent } from "react";

export interface PhotosPanelProps {
  projectPhotos?: { storage_path: string; signedUrl: string; caption?: string }[];
  /** Path currently being promoted/uploaded (drives the spinner), or "__upload__". */
  promotingPath: string | null;
  /** A pasted URL — apply it to the current target. */
  onApplyUrl: (url: string) => void;
  /** A filed photo was picked (its storage_path) — parent promotes + applies. */
  onPickFiled: (storagePath: string) => void;
  /** A new file was chosen — parent uploads + applies. */
  onUploadFile: (file: File) => void;
}

export function PhotosPanel({
  projectPhotos,
  promotingPath,
  onApplyUrl,
  onPickFiled,
  onUploadFile,
}: PhotosPanelProps) {
  const [showPhotos, setShowPhotos] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyTyped() {
    if (imageUrlInput.trim()) {
      onApplyUrl(imageUrlInput.trim());
      setImageUrlInput("");
    }
  }

  return (
    <div className="px-4 pb-6 pt-3">
      <button
        onClick={() => setShowPhotos((v) => !v)}
        className="flex w-full items-center justify-between py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60"
      >
        <span>Photos</span>
        <span className={`transition-transform ${showPhotos ? "rotate-180" : ""}`}>▾</span>
      </button>
      {showPhotos && (
        <div className="mt-2 mb-2 flex gap-1.5">
          <input
            type="text"
            value={imageUrlInput}
            onChange={(e) => setImageUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyTyped();
            }}
            placeholder="Paste image URL…"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none focus:ring-1 focus:ring-gulf-teal"
          />
          <button
            type="button"
            onClick={applyTyped}
            disabled={!imageUrlInput.trim()}
            className="shrink-0 rounded-md bg-gulf-teal px-3 py-1.5 text-xs font-semibold text-[#070f14] disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
      {showPhotos && (
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={promotingPath !== null}
            className="flex aspect-square items-center justify-center rounded-md border border-dashed border-white/20 bg-white/3 text-white/30 transition-colors hover:border-gulf-teal/50 hover:text-gulf-teal/70 disabled:opacity-40"
            title="Upload a photo"
          >
            {promotingPath === "__upload__" ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-gulf-teal" />
            ) : (
              <span className="text-lg leading-none">＋</span>
            )}
          </button>
          {(projectPhotos ?? []).map((photo) => (
            <button
              key={photo.storage_path}
              type="button"
              onClick={() => onPickFiled(photo.storage_path)}
              disabled={promotingPath !== null}
              title={photo.caption ?? photo.storage_path.split("/").pop()}
              className={`relative aspect-square overflow-hidden rounded-md border-2 transition-all ${
                promotingPath === photo.storage_path
                  ? "border-gulf-teal"
                  : "border-transparent hover:border-gulf-teal disabled:opacity-60"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.signedUrl}
                alt={photo.caption ?? ""}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const f = e.target.files?.[0];
          if (f) onUploadFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
