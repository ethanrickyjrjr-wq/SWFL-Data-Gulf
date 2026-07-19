import { NextRequest, NextResponse } from "next/server";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { lintCompiledHtml, collectAllowedUrls } from "@/lib/deliverable/url-lint";

// EmailDoc-ONLY (operator decree 07/19/2026: one email system). The legacy
// { template, tokens } branch is gone — the last poster of that shape was the
// parked classic-templates picker, deleted with it. The viz-template showcase
// renders through its own endpoint (app/api/templates/render, a WEBSITE surface).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { doc?: unknown } | null;
  if (!body || typeof body !== "object" || body.doc === undefined) {
    return NextResponse.json(
      { error: "Post { doc: EmailDoc }. The legacy { template, tokens } shape was removed." },
      { status: 400 },
    );
  }

  const parsed = EmailDocSchema.safeParse(body.doc);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email document.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  // The ONE EmailDoc→HTML root: paid grid docs (any block with `layout`)
  // compile; free docs stay byte-identical on render(EmailDocEmail(...)).
  // Shared with the blast route and the scheduled runner so preview and
  // send can't diverge.
  const html = await renderEmailDocHtml(parsed.data);
  // Fake-link tripwire (invention-surface-guards §C, interactive = strip +
  // warn, never block an edit).
  const urlGate = lintCompiledHtml(html, collectAllowedUrls(parsed.data));
  return NextResponse.json({
    html: urlGate.stripped,
    ...(urlGate.ok ? {} : { url_warnings: urlGate.violations }),
  });
}
