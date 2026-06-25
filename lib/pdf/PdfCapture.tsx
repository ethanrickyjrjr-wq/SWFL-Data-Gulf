// lib/pdf/PdfCapture.tsx — the ONE PDF→thumbnail capturer. Renders page 1 of a
// PDF off-screen to a canvas, exports PNG, and POSTs it to the thumbnail route.
// Browser-side so it needs no native `node-canvas` on Vercel (the pdftoppm
// problem the capabilities map flagged). Mount it after a PDF upload; it unmounts
// itself via onDone. Lazy-import with next/dynamic({ ssr: false }).
"use client";
import { useRef } from "react";
import { Document, Page } from "react-pdf";
import "./pdfjs-worker";

interface Props {
  url: string;
  projectId: string;
  itemId: string;
  /** Always called once (success or failure) so the parent can unmount. */
  onDone: () => void;
}

const CAPTURE_WIDTH = 400;

export function PdfCapture({ url, projectId, itemId, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <div
      style={{
        position: "absolute",
        left: -9999,
        top: -9999,
        width: CAPTURE_WIDTH,
        height: 1,
        overflow: "hidden",
      }}
    >
      <Document file={url} onLoadError={onDone} error={null} loading={null}>
        <Page
          pageNumber={1}
          width={CAPTURE_WIDTH}
          canvasRef={canvasRef}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          onRenderError={onDone}
          onRenderSuccess={() => {
            const dataUrl = canvasRef.current?.toDataURL("image/png");
            if (!dataUrl) {
              onDone();
              return;
            }
            void fetch(`/api/projects/${projectId}/items/${itemId}/thumbnail`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ dataUrl }),
            })
              .catch(() => {})
              .finally(onDone);
          }}
        />
      </Document>
    </div>
  );
}
