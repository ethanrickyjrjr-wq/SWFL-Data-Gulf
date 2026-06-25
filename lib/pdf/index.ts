// lib/pdf/index.ts — THE PDF root (server/shared surface).
//
// Every server-side PDF concern imports from "@/lib/pdf". The two BROWSER
// components are imported by direct path because they pull the client-only
// react-pdf viewer bundle:
//   • "@/lib/pdf/PdfViewer"  — inline PDF viewer (project board, etc.)
//   • "@/lib/pdf/PdfCapture" — page-1 → PNG thumbnail capture at upload
//
// See lib/pdf/README.md for the full surface map ("PDF issue → this is where I go").

// EmailDoc → PDF (generation)
export { EmailDocPdf } from "./email-doc-pdf";
export { renderEmailDocToBuffer, pdfFilename } from "./render";

// PDF text extraction (the pdf-parse fallback) + the doc-type-aware prompt
export { parsePdfText, type PdfTextResult } from "./extract";
export { buildExtractionPrompt, EXTRACTION_MAX_TOKENS, LARGE_PDF_PAGES } from "./doc-type";
