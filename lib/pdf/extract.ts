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
import { PDFParse } from "pdf-parse";

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
