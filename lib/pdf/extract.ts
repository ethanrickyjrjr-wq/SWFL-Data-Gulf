// lib/pdf/extract.ts — the ONE text-layer extraction fallback (zero API cost).
//
// Used by /api/projects/[id]/extract-pdf when Claude vision fails or is skipped.
// Claude is still primary (it handles scanned/image-only PDFs that have no text
// layer); the text-layer read catches PDFs Claude missed, at no token cost.
//
// Engine: `unpdf` (unjs) — its bundled PDF.js is a SERVERLESS build (browser-specific
// references stripped, worker inlined), so unlike the stock `pdfjs-dist` that
// `pdf-parse` pulled in, it loads without DOMMatrix/ImageData/Path2D and therefore
// works in the Vercel serverless Node runtime. Verified in-session against the
// installed package + https://github.com/unjs/unpdf (RULE 0.4).
//
// LOADED LAZILY, ON PURPOSE — do not hoist this back to a module-scope import.
// `lib/pdf/index.ts` re-exports this file, and two routes behind that barrel only
// ever WRITE PDFs; a module-scope reader import is dead bundle weight for them and
// once took prod down when the reader couldn't load at all (see
// lib/pdf/__tests__/no-eager-pdfjs.test.ts — the guard that keeps this invariant).

export interface PdfTextResult {
  /** Concatenated document text (trimmed, non-empty). */
  text: string;
  /** Page count, from extractText's totalPages. */
  pages: number;
}

/**
 * Extract the text layer from a PDF. Returns `null` for image-only, encrypted,
 * or otherwise unreadable PDFs (Claude was right to leave those `failed`).
 */
export async function parsePdfText(
  data: ArrayBuffer | Uint8Array | Buffer,
): Promise<PdfTextResult | null> {
  const mod = await import("unpdf").catch(() => null);
  if (!mod) return null;
  // pdfjs v5 REJECTS a Node Buffer outright ("Please provide binary data as
  // `Uint8Array`, rather than `Buffer`") — and Buffer IS a Uint8Array subclass,
  // so a plain instanceof check waves it through. Re-wrap as a bare Uint8Array
  // view (no copy) whenever the prototype isn't exactly Uint8Array.
  const bytes =
    data instanceof Uint8Array
      ? Object.getPrototypeOf(data) === Uint8Array.prototype
        ? data
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data as ArrayBuffer);
  let pdf: Awaited<ReturnType<typeof mod.getDocumentProxy>> | null = null;
  try {
    pdf = await mod.getDocumentProxy(bytes);
    const { totalPages, text } = await mod.extractText(pdf, { mergePages: true });
    const trimmed = text.trim();
    if (!trimmed) return null;
    return { text: trimmed, pages: totalPages };
  } catch {
    return null;
  } finally {
    await pdf?.destroy().catch(() => {});
  }
}
