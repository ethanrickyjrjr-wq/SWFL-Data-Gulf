// lib/pdf/extract.ts — the ONE text-layer extraction fallback (zero API cost).
//
// Used by /api/projects/[id]/extract-pdf when Claude vision fails or is skipped.
// Claude is still primary (it handles scanned/image-only PDFs that have no text
// layer); pdf-parse catches text-layer PDFs that Claude missed, at no token cost.
//
// Vendor surface verified IN-SESSION against the installed package (RULE 0.4):
//  • `PDFParse` is the MAIN export — NOT `pdf-parse/node` (that subpath only
//    exports `getHeader`). Confirmed: require('pdf-parse').PDFParse is a function.
//  • Constructor takes LoadParameters → the binary field is `data` (NOT `buffer`),
//    accepting Buffer/Uint8Array/ArrayBuffer; a Node Buffer is converted to
//    Uint8Array automatically.
//  • getText() → TextResult { text: string; pages: PageTextResult[]; total: number }.
//  • destroy() frees the worker — always call it.
//
// LOADED LAZILY, ON PURPOSE — do not hoist this back to a module-scope import.
// `pdf-parse` pulls in `pdfjs-dist`, which needs browser graphics globals
// (`DOMMatrix`, `ImageData`, `Path2D`) and an optional `@napi-rs/canvas`. None of
// those exist in the Vercel serverless Node runtime, so merely *loading* the module
// there throws `ReferenceError: DOMMatrix is not defined`. Because `lib/pdf/index.ts`
// re-exports this file, a module-scope import made every importer of the "@/lib/pdf"
// barrel load pdfjs — including the two routes that only *write* PDFs and never read
// one. That took PDF download (`/api/deliverables/[id]/pdf`) and PDF-attached blasts
// (`.../blast`) to a hard 500 in production while every local test passed, since Node
// on a dev box happens to have the globals. Reading a PDF is the only thing that needs
// pdfjs; pay for it inside the one function that reads.

export interface PdfTextResult {
  /** Concatenated document text (trimmed, non-empty). */
  text: string;
  /** Page count, from TextResult.total. */
  pages: number;
}

/**
 * Extract the text layer from a PDF. Returns `null` for image-only, encrypted,
 * or otherwise unreadable PDFs (Claude was right to leave those `failed`).
 */
export async function parsePdfText(
  data: ArrayBuffer | Uint8Array | Buffer,
): Promise<PdfTextResult | null> {
  const { PDFParse } = await import("pdf-parse");
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  const parser = new PDFParse({ data: bytes });
  try {
    const res = await parser.getText();
    const text = res.text?.trim() ?? "";
    if (!text) return null;
    return { text, pages: res.total };
  } catch {
    return null;
  } finally {
    await parser.destroy().catch(() => {});
  }
}
