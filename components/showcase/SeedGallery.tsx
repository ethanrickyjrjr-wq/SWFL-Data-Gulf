"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  SEED_PREVIEW_GROUPS,
  SEED_PREVIEW_CAPTION,
  seedPreviewsFor,
  type SeedPreview,
} from "@/lib/email/doc/seed-previews";
import { seedGalleryDestination } from "@/lib/lab-entry/destination";

/**
 * The /showcase "Start-from layouts" section — every SEED_DOCS template as a
 * filled preview tile, grouped by JOB (RGE taxonomy pattern), each one click
 * from the lab with that template picked (spec:
 * 2026-07-09-template-preview-gallery-design.md).
 *
 * Cards keep an identical internal structure — capture, name, one-line pitch
 * in fixed positions (NN/g: comparison needs consistent internals) — and carry
 * the Stripo dual CTA: the card opens the full preview, the hover/overlay
 * "Use this layout →" deep-links via seedGalleryDestination (?seed=), the
 * anonymous-usable arrival. The preview shows FILLED content; what the visitor
 * lands on in the lab is the honest slot-rule skeleton — the overlay caption
 * says exactly that.
 */
export function SeedGallery() {
  const [open, setOpen] = useState<SeedPreview | null>(null);

  return (
    <div className="flex flex-col gap-12">
      {SEED_PREVIEW_GROUPS.map((g) => {
        const previews = seedPreviewsFor(g.key);
        if (previews.length === 0) return null;
        return (
          <section key={g.key}>
            <h3 className="text-lg font-semibold tracking-tight text-text-primary">
              {g.title}
              <span className="ml-2 text-sm font-normal text-text-secondary">
                {previews.length} {previews.length === 1 ? "layout" : "layouts"}
              </span>
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">{g.pitch}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {previews.map((p) => (
                <SeedCard key={p.id} preview={p} onOpen={() => setOpen(p)} />
              ))}
            </div>
          </section>
        );
      })}
      {open && <SeedPreviewOverlay preview={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function SeedCard({ preview, onOpen }: { preview: SeedPreview; onOpen: () => void }) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-white/10 bg-[#0f1d24] transition-colors hover:border-white/30">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
        aria-label={`Preview the ${preview.name} layout`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- committed static capture, top crop */}
        <img
          src={preview.image}
          alt=""
          className="h-48 w-full object-cover object-top"
          loading="lazy"
        />
        <span className="block px-3 py-2.5">
          <span className="block text-xs font-semibold text-[#f0ede6]">{preview.name}</span>
          <span className="mt-0.5 block text-[10px] leading-snug text-gray-400">
            {preview.description}
          </span>
        </span>
      </button>
      {/* Stripo dual CTA: straight to the lab without opening the preview. */}
      <Link
        href={seedGalleryDestination(preview.id)}
        className="absolute right-2 top-2 rounded-md bg-gulf-teal px-2.5 py-1.5 text-[10px] font-bold text-navy-dark opacity-0 shadow transition-opacity focus:opacity-100 group-hover:opacity-100"
      >
        Use this layout →
      </Link>
    </div>
  );
}

function SeedPreviewOverlay({ preview, onClose }: { preview: SeedPreview; onClose: () => void }) {
  const scrimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={scrimRef}
      className="fixed inset-0 z-[90] flex h-dvh flex-col bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === scrimRef.current) onClose();
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-3 py-3 sm:px-6 sm:py-5">
        <div className="flex items-center gap-3 rounded-t-xl bg-[#0b161c] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#f0ede6]">{preview.name}</p>
            <p className="truncate text-[11px] text-gray-400">{preview.description}</p>
          </div>
          <Link
            href={seedGalleryDestination(preview.id)}
            className="shrink-0 rounded-lg bg-gulf-teal px-4 py-2 text-xs font-bold text-navy-dark transition-opacity hover:opacity-90"
          >
            Use this layout →
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 text-gray-400 transition-colors hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#101f27] p-4 sm:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- committed static capture */}
          <img
            src={preview.image}
            alt={`${preview.name} template, filled with live SWFL data`}
            className="mx-auto w-full max-w-xl rounded-lg border border-white/10"
          />
        </div>
        <div className="flex items-center gap-3 rounded-b-xl bg-[#0b161c] px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-[10px] text-gray-500">
            {SEED_PREVIEW_CAPTION} · You start from the clean layout — the AI fills it with your
            area&rsquo;s live figures.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
