// POST /api/projects/[id]/items/[itemId]/thumbnail — store the page-1 PNG that
// `lib/pdf/PdfCapture` rendered in the browser and patch the matching `file`
// item with its durable public URL, so the project surface can show a preview.
//
// Mirrors the email-media route's promote/upload shape: RLS-gated ownership via a
// `projects` select, then a service-role write to the PUBLIC `email-media` bucket
// (reused — no separate thumbnails bucket), then `getPublicUrl`.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { MEDIA_CACHE_MUTABLE } from "@/lib/media/cache-control";
import { projectItemsSchema } from "@/lib/project/items";

export const runtime = "nodejs";

const PUBLIC_BUCKET = "email-media";
const DATA_URL_PREFIX = "data:image/png;base64,";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<NextResponse> {
  const { id, itemId } = await params;

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS proves ownership — a non-owner's project is invisible (→ 404).
  const { data: project } = await supabase
    .from("projects")
    .select("items")
    .eq("id", id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { dataUrl } = await req.json().catch(() => ({}));
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(DATA_URL_PREFIX)) {
    return NextResponse.json({ error: "invalid dataUrl" }, { status: 400 });
  }

  const base64 = dataUrl.slice(DATA_URL_PREFIX.length);
  const bytes = Buffer.from(base64, "base64");

  // Public bucket lives under the owner's uid prefix, like email-media uploads.
  const key = `${user.id}/thumbnails/${itemId}.png`;
  const admin = createServiceRoleClient();
  const { error: upErr } = await admin.storage.from(PUBLIC_BUCKET).upload(key, bytes, {
    contentType: "image/png",
    upsert: true,
    // MUTABLE: key is stable (`thumbnails/${itemId}.png`) with upsert on, so a
    // regenerated thumbnail replaces these bytes in place.
    cacheControl: MEDIA_CACHE_MUTABLE,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(key);
  const publicUrl = pub.publicUrl;

  // Re-read items and patch just the target file item, so a concurrent edit
  // isn't clobbered by a stale array. Write back under the cookie/user client so
  // RLS still scopes the update to the owner.
  const parsed = projectItemsSchema.safeParse(project.items);
  if (parsed.success) {
    const hasItem = parsed.data.some((it) => it.id === itemId && it.kind === "file");
    if (hasItem) {
      const next = parsed.data.map((it) =>
        it.id === itemId && it.kind === "file" ? { ...it, thumbnail_url: publicUrl } : it,
      );
      await supabase
        .from("projects")
        .update({ items: next, updated_at: new Date().toISOString() })
        .eq("id", id);
    }
    // Item not found in the array → the capture raced the item's DB persist.
    // Still return 200 with the URL; the upload itself succeeded.
  }

  return NextResponse.json({ url: publicUrl });
}
