"use client";
// components/email-lab/MediaPanel.tsx
//
// The MEDIA accordion — the user's persistent library (email_media_assets) plus
// a Pexels search picker. Self-contained data-wise (it owns the fetches to
// /api/email-lab/media and /api/email-lab/pexels); the parent owns "where does
// a picked URL land" via onApply, exactly like PhotosPanel's onApplyUrl. A pick
// with attribution hands the caption along so "Photo by X on Pexels" rides the
// image block (license credit — citation culture).
import { useCallback, useRef, useState, type ChangeEvent } from "react";

interface MediaItem {
  id: string;
  url: string;
  kind: string;
  label: string;
  width?: number;
  height?: number;
  caption?: string;
}

interface PexelsResult {
  id: number;
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  photographer: string;
  photographerUrl?: string;
  pexelsUrl?: string;
}

const inputCls =
  "min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none focus:ring-1 focus:ring-gulf-teal";

export function MediaPanel({ onApply }: { onApply: (url: string, caption?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"library" | "pexels">("library");
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PexelsResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/email-lab/media");
    if (!res.ok) return;
    const { items: next } = (await res.json()) as { items: MediaItem[] };
    setItems(next);
  }, []);

  // Event-driven load (no fetch-in-effect): first open pulls the library.
  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && items === null) void refresh();
  }

  async function uploadFile(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/email-lab/media", { method: "PUT", body: fd });
      if (!res.ok) return;
      const { url } = (await res.json()) as { url: string };
      await refresh();
      onApply(url);
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string) {
    const label = renameText.trim();
    setRenamingId(null);
    if (!label) return;
    const prev = items;
    setItems((cur) => cur?.map((i) => (i.id === id ? { ...i, label } : i)) ?? cur);
    const res = await fetch("/api/email-lab/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, label }),
    });
    if (!res.ok) {
      setItems(prev);
      setError("Couldn't rename that item — try again.");
    }
  }

  async function remove(id: string) {
    setConfirmingId(null);
    const prev = items;
    setItems((cur) => cur?.filter((i) => i.id !== id) ?? cur);
    const res = await fetch("/api/email-lab/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setItems(prev);
      setError("Couldn't remove that item — try again.");
    }
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/email-lab/pexels?q=${encodeURIComponent(q)}`);
      const { photos } = res.ok
        ? ((await res.json()) as { photos: PexelsResult[] })
        : { photos: [] };
      setResults(photos);
    } finally {
      setSearching(false);
    }
  }

  async function pick(photo: PexelsResult) {
    setBusy(true);
    try {
      const res = await fetch("/api/email-lab/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pick", photo }),
      });
      if (!res.ok) return;
      const { item, caption } = (await res.json()) as { item: MediaItem; caption?: string };
      await refresh();
      onApply(item.url, caption);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-white/8 px-4 pb-4 pt-3">
      <button
        onClick={toggleOpen}
        className="flex w-full items-center justify-between py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60"
      >
        <span>Media</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}

      {open && (
        <div className="mt-2 mb-2 flex gap-1">
          {(["library", "pexels"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                tab === t ? "bg-white/10 text-white/80" : "text-white/40 hover:text-white/70"
              }`}
            >
              {t === "library" ? "My library" : "Pexels"}
            </button>
          ))}
        </div>
      )}

      {open && tab === "library" && (
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex aspect-square items-center justify-center rounded-md border border-dashed border-white/20 bg-white/3 text-white/30 transition-colors hover:border-gulf-teal/50 hover:text-gulf-teal/70 disabled:opacity-40"
            title="Upload an image"
          >
            {busy ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-gulf-teal" />
            ) : (
              <span className="text-lg leading-none">＋</span>
            )}
          </button>
          {(items ?? []).map((item) => (
            <div key={item.id} className="group relative">
              <button
                type="button"
                onClick={() => onApply(item.url, item.caption)}
                disabled={busy}
                title={item.label}
                className="relative block aspect-square w-full overflow-hidden rounded-md border-2 border-transparent transition-all hover:border-gulf-teal disabled:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.label} className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                onClick={() =>
                  confirmingId === item.id ? void remove(item.id) : setConfirmingId(item.id)
                }
                className={`absolute right-1 top-1 rounded px-1 text-[10px] leading-4 ${
                  confirmingId === item.id
                    ? "bg-red-500 text-white"
                    : "bg-black/50 text-white/60 opacity-0 group-hover:opacity-100"
                }`}
                title="Remove from library"
              >
                {confirmingId === item.id ? "Sure?" : "✕"}
              </button>
              {renamingId === item.id ? (
                <input
                  autoFocus
                  className="mt-0.5 w-full rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] text-white/80 focus:outline-none"
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={() => void rename(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void rename(item.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(item.id);
                    setRenameText(item.label);
                  }}
                  className="mt-0.5 w-full truncate text-left text-[10px] text-white/40 hover:text-white/70"
                  title="Rename"
                >
                  {item.label || "Untitled"}
                </button>
              )}
            </div>
          ))}
          {items !== null && items.length === 0 && (
            <p className="col-span-1 self-center text-[10px] leading-tight text-white/30">
              Uploads and Pexels picks land here.
            </p>
          )}
        </div>
      )}

      {open && tab === "pexels" && (
        <>
          <div className="mb-2 flex gap-1.5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void search();
              }}
              placeholder="Search free photos…"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => void search()}
              disabled={searching || !query.trim()}
              className="shrink-0 rounded-md bg-gulf-teal px-3 py-1.5 text-xs font-semibold text-[#070f14] disabled:opacity-40"
            >
              {searching ? "…" : "Go"}
            </button>
          </div>
          <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
            {(results ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void pick(p)}
                disabled={busy}
                title={`${p.alt ?? "Pexels photo"} — by ${p.photographer}`}
                className="relative aspect-square overflow-hidden rounded-md border-2 border-transparent transition-all hover:border-gulf-teal disabled:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.alt ?? ""} className="h-full w-full object-cover" />
              </button>
            ))}
            {results !== null && results.length === 0 && !searching && (
              <p className="col-span-2 text-[10px] text-white/30">No results.</p>
            )}
          </div>
          {results !== null && results.length > 0 && (
            <p className="mt-1.5 text-[9px] text-white/25">
              Photos from Pexels — credit rides the image caption.
            </p>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const f = e.target.files?.[0];
          if (f) void uploadFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
