// app/insiders/001/route.ts
//
// Issue 001 gated read (spec: docs/superpowers/specs/
// 2026-07-26-insiders-issue001-gated-read-design.md). Hard server gate: the
// full artifact leaves this handler ONLY with a valid signed reader cookie.
// Anonymous → teaser from splitTeaser; splitter null → lastResortTeaser
// (gate page with zero issue content — degraded, never leaking). Plain
// Request/Response (no next/headers) keeps the handler unit-testable.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyReader, readerCookieFromHeader } from "@/lib/insiders/reader-cookie";
import { splitTeaser, lastResortTeaser } from "@/lib/insiders/teaser-split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARTIFACT = join(process.cwd(), "content", "insiders", "issue-2026-07.html");

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  // Never let the CDN serve one reader's variant to everyone (failure mode #2).
  "Cache-Control": "private, no-store",
};

export async function GET(request: Request): Promise<Response> {
  let full: string;
  try {
    full = await readFile(ARTIFACT, "utf8");
  } catch (e) {
    console.error("[insiders/001] artifact read failed:", e);
    return new Response(lastResortTeaser(), { status: 200, headers: HEADERS });
  }

  const cookie = readerCookieFromHeader(request.headers.get("cookie"));
  if (verifyReader(cookie, process.env.INSIDERS_READER_SECRET)) {
    return new Response(full, { status: 200, headers: HEADERS });
  }

  return new Response(splitTeaser(full) ?? lastResortTeaser(), {
    status: 200,
    headers: HEADERS,
  });
}
