import { assertAuthorized } from "@/app/api/mcp/auth";
import {
  renderHtmlTemplate,
  InvalidSlugError,
  TemplateNotFoundError,
} from "@/lib/templates/render-html-template";
import { getTemplateEntry } from "@/lib/templates/manifest";

export const runtime = "nodejs";

/**
 * GET /api/templates/render?slug=<slug> — PUBLIC preview render.
 *
 * Renders a card using its OWN manifest `previewData` (SWFL-branded sample
 * values). No auth and no caller-supplied tokens — this is the surface the public
 * /showcase page opens in a new tab, so it must never require the bearer secret.
 * Custom-token rendering goes through POST (authed) below.
 */
export async function GET(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const entry = getTemplateEntry(slug);
  if (!entry) {
    return Response.json({ error: `unknown slug: ${slug}` }, { status: 400 });
  }
  try {
    const html = await renderHtmlTemplate(slug, entry.previewData);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${slug.split("/").pop()}.html"`,
      },
    });
  } catch (e) {
    if (e instanceof InvalidSlugError || e instanceof TemplateNotFoundError) {
      return Response.json({ error: "template unavailable" }, { status: 400 });
    }
    throw e;
  }
}

/**
 * POST /api/templates/render — render a template shell to HTML.
 *
 * Auth: `Authorization: Bearer <MCP_BEARER_TOKEN>` (reuses the MCP auth gate —
 * open only when MCP_BEARER_TOKEN is unset, same as the rest of the surface).
 *
 * Body: { slug: string; tokens: Record<string, string|number>; format?: "html" }
 *   - slug must be a known viz template (validated against TEMPLATE_MANIFEST).
 *   - brand_primary / brand_secondary are ordinary token keys — no separate param.
 *
 * Returns text/html with `Content-Disposition: inline`. PDF is v2 (stub below).
 */
export async function POST(request: Request): Promise<Response> {
  await assertAuthorized(request); // throws Response(401) when configured + bad

  const body = (await request.json().catch(() => null)) as {
    slug?: unknown;
    tokens?: unknown;
    format?: unknown;
  } | null;

  if (!body || typeof body.slug !== "string") {
    return Response.json({ error: "slug required" }, { status: 400 });
  }

  const entry = getTemplateEntry(body.slug);
  if (!entry) {
    return Response.json({ error: `unknown slug: ${body.slug}` }, { status: 400 });
  }

  const format = typeof body.format === "string" ? body.format : "html";
  if (format === "pdf") {
    // TODO: PDF via puppeteer-core + @sparticuz/chromium
    return Response.json({ error: "pdf format not yet implemented" }, { status: 501 });
  }

  const tokens =
    body.tokens && typeof body.tokens === "object"
      ? (body.tokens as Record<string, string | number>)
      : {};

  try {
    const html = await renderHtmlTemplate(body.slug, tokens);
    const filename = `${body.slug.split("/").pop()}.html`;
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (e) {
    if (e instanceof InvalidSlugError || e instanceof TemplateNotFoundError) {
      return Response.json({ error: "template unavailable" }, { status: 400 });
    }
    throw e;
  }
}
