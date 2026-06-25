// lib/pdf/render.ts — the ONE server entry that turns an EmailDoc into PDF bytes.
//
// Both PDF surfaces call this: GET/POST /api/deliverables/[id]/pdf (download) and
// the blast route's "attach PDF" path. renderToBuffer runs in Node only — these
// callers set `runtime = "nodejs"`. @react-pdf/renderer is opted out of bundling
// in next.config.ts (serverExternalPackages) so Turbopack doesn't choke on its
// yoga/fontkit deps.
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { EmailDoc } from "@/lib/email/doc/types";
import { EmailDocPdf } from "./email-doc-pdf";

/** EmailDoc → a real PDF Buffer (Resend-attachable, downloadable). */
export async function renderEmailDocToBuffer(
  doc: EmailDoc,
  opts?: { asOf?: string },
): Promise<Buffer> {
  return renderToBuffer(
    createElement(EmailDocPdf, { doc, asOf: opts?.asOf }) as ReactElement<DocumentProps>,
  );
}

/** A safe, human-ish download filename. `report.pdf` when no seed. */
export function pdfFilename(seed?: string): string {
  const base =
    (seed ?? "")
      .replace(/[^a-z0-9-_ ]+/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 48) || "report";
  return `${base}.pdf`;
}
