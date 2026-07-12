import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The PDF *writer* must never statically load the PDF *reader*.
 *
 * `pdf-parse` pulls in `pdfjs-dist`, which needs browser graphics globals
 * (DOMMatrix / ImageData / Path2D) that do not exist in the Vercel serverless Node
 * runtime — merely importing it there throws `ReferenceError: DOMMatrix is not defined`.
 * `lib/pdf/index.ts` re-exports `extract.ts`, so a module-scope `import { PDFParse }
 * from "pdf-parse"` in that file made EVERY importer of the "@/lib/pdf" barrel load
 * pdfjs — including the two routes that only write PDFs and never read one. Production
 * answered `/api/deliverables/[id]/pdf` and PDF-attached blasts with a hard 500 while
 * every unit test passed, because a dev box happens to have the globals.
 *
 * This guard is deliberately static rather than behavioural: the failure only reproduces
 * inside a serverless bundle, which a unit test cannot stand up. So assert the property
 * that actually prevents it — the reader is imported lazily, inside the one function that
 * reads. If you hoist that import back to module scope, this test fails instead of prod.
 */

const PDF_DIR = join(import.meta.dir, "..");

/** Files reachable from the "@/lib/pdf" barrel via static re-export. */
function barrelReachableFiles(): string[] {
  const barrel = readFileSync(join(PDF_DIR, "index.ts"), "utf8");
  const specifiers = [...barrel.matchAll(/from\s+"\.\/([^"]+)"/g)].map((m) => m[1]);
  const all = readdirSync(PDF_DIR);
  return specifiers
    .map((s) => all.find((f) => f === `${s}.ts` || f === `${s}.tsx`))
    .filter((f): f is string => Boolean(f));
}

/** A module-scope (non-dynamic) import of `spec` — `await import(...)` does not match. */
function hasStaticImportOf(source: string, spec: string): boolean {
  return new RegExp(`^\\s*import\\s[^;]*?from\\s+["']${spec}["']`, "m").test(source);
}

describe("lib/pdf — the writer never statically loads the reader", () => {
  const BROWSER_ONLY = ["unpdf", "pdf-parse", "pdfjs-dist"];

  it("the @/lib/pdf barrel reaches real files (guard is not vacuous)", () => {
    const files = barrelReachableFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain("extract.ts");
  });

  it.each(BROWSER_ONLY)("no file behind the barrel statically imports %s", (spec) => {
    const offenders = barrelReachableFiles().filter((f) =>
      hasStaticImportOf(readFileSync(join(PDF_DIR, f), "utf8"), spec),
    );
    expect(offenders).toEqual([]);
  });

  it("extract.ts still uses unpdf — lazily, inside the function", () => {
    const src = readFileSync(join(PDF_DIR, "extract.ts"), "utf8");
    expect(hasStaticImportOf(src, "unpdf")).toBe(false);
    expect(src).toContain('await import("unpdf")');
  });
});
