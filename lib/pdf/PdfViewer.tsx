// lib/pdf/PdfViewer.tsx — the ONE inline PDF viewer (replaces dead <object> embeds).
//
// react-pdf (pdfjs canvas) works cross-browser incl. mobile Safari, where the
// <object> embed renders nothing. Canvas-only (text/annotation layers off) so it
// needs no extra CSS and no cross-origin text-layer fetch. Lazy-import this with
// next/dynamic({ ssr: false }) — pdfjs is browser-only (no DOMMatrix in Node).
"use client";
import { useState } from "react";
import { Document, Page } from "react-pdf";
import "./pdfjs-worker";

export function PdfViewer({
  url,
  width = 480,
  label,
}: {
  url: string;
  width?: number;
  /** Fallback link text when the PDF can't render. */
  label?: string;
}) {
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-gulf-teal underline underline-offset-2"
      >
        {label || "Open PDF"}
      </a>
    );
  }

  return (
    <div>
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        onLoadError={() => setFailed(true)}
        loading={<p className="py-6 text-center text-xs text-white/40">Loading PDF…</p>}
        error={null}
        className="w-full overflow-hidden rounded border border-white/10"
      >
        <Page
          pageNumber={pageNum}
          width={width}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>

      {numPages > 1 && (
        <div className="mt-2 flex items-center gap-3 text-xs text-white/50">
          <button
            type="button"
            disabled={pageNum <= 1}
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            className="disabled:opacity-30"
            aria-label="Previous page"
          >
            ←
          </button>
          <span>
            {pageNum} / {numPages}
          </span>
          <button
            type="button"
            disabled={pageNum >= numPages}
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            className="disabled:opacity-30"
            aria-label="Next page"
          >
            →
          </button>
        </div>
      )}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block text-[11px] text-gulf-teal underline underline-offset-2"
      >
        Open PDF
      </a>
    </div>
  );
}
