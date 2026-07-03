// app/api/figures/find/route.ts
//
// POST { zip, metric_key } — the Find-it button endpoint (spec §5). Public but
// hard-bounded: fixed metric-gap ALLOWLIST (lib/figures/metric-gaps.ts), per-IP
// burst limit, and a global daily cap on cold lookups inside findFigure. A found
// figure is cached in sourced_figures for every consumer; a miss returns an
// honest pointer to the real issuing source — never an invented number.
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, clientIpFromHeaders, rateLimitHeaders } from "@/lib/rate-limit";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { findFigure } from "@/lib/figures/find";

export const runtime = "nodejs";

const VALID_ZIP = /^\d{5}$/;

export async function POST(req: NextRequest) {
  // Per-IP burst limit — inline (house pattern: app/api/email/contacts/phone).
  const rl = checkRateLimit(clientIpFromHeaders(req.headers));
  if (rl.limited) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    zip?: unknown;
    metric_key?: unknown;
  } | null;
  const zip = typeof body?.zip === "string" ? body.zip : "";
  const metricKey = typeof body?.metric_key === "string" ? body.metric_key : "";
  if (!VALID_ZIP.test(zip) || !metricKey || !resolveZip(zip).in_scope) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await findFigure(zip, metricKey);
  if (result.ok) {
    return NextResponse.json({ found: true, figure: result.figure, cached: result.cached });
  }
  if (result.reason === "not_found") {
    return NextResponse.json({ found: false, pointer: result.pointer });
  }
  if (result.reason === "not_allowed") {
    return NextResponse.json({ error: "not_allowed" }, { status: 400 });
  }
  if (result.reason === "capped") {
    return NextResponse.json({ error: "capped" }, { status: 429 });
  }
  return NextResponse.json({ error: "unavailable" }, { status: 503 });
}
