import { TEMPLATE_MANIFEST, type TemplateEntry } from "@/lib/templates/manifest";

export const runtime = "nodejs";

/**
 * GET /api/templates/list — public catalog of renderable templates.
 *
 * Returns `TemplateEntry[]` with `previewData` omitted (the showcase page and any
 * client UI list templates from this; preview values are an internal default the
 * render route / showcase supplies). No auth — this is a public catalog.
 */
export async function GET(): Promise<Response> {
  const list: Omit<TemplateEntry, "previewData">[] = TEMPLATE_MANIFEST.map(
    ({ previewData: _previewData, ...rest }) => rest,
  );
  return Response.json(list);
}
