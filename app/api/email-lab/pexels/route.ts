import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { searchPexels } from "@/lib/email/pexels";

export const runtime = "nodejs";

// GET /api/email-lab/pexels?q=… — auth-gated server proxy for the media panel's
// Pexels picker (PEXELS_API_KEY stays server-side). Keyless or failing upstream
// degrades to { photos: [] } — the picker shows "no results", never an error
// that blocks a build. Picking a result POSTs to /api/email-lab/media.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const photos = await searchPexels(q);
  return NextResponse.json({ photos });
}
