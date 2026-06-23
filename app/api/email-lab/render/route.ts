import { NextRequest, NextResponse } from "next/server";
import { renderHtmlTemplate } from "@/lib/templates/render-html-template";
import { SWFL_TOKEN_DEFAULTS } from "@/lib/email/templates/token-defaults";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { template = "email/email-hero", tokens = {} } = body as {
    template?: string;
    tokens?: Record<string, string>;
  };

  const merged = { ...SWFL_TOKEN_DEFAULTS, ...tokens };

  const html = await renderHtmlTemplate(template, merged);
  return NextResponse.json({ html });
}
