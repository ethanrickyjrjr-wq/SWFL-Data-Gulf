// lib/pdf/pdfjs-worker.ts — configure the pdf.js worker ONCE for every react-pdf
// surface. Both PdfViewer and PdfCapture import this for its side effect, so the
// worker path is pinned in exactly one place (single-root).
//
// Pinned to the pdfjs-dist that react-pdf@10.4.1 bundles (5.4.296). The worker is
// shipped as ESM (`pdf.worker.min.mjs`); `new URL(spec, import.meta.url)` lets the
// bundler (Turbopack) emit it as an asset URL. If a future react-pdf bump changes
// the worker filename, this is the only line to touch — verify with:
//   ls node_modules/pdfjs-dist/build | grep worker
"use client";
import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
