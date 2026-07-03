import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { hostEmailMedia } from "@/lib/email/chart-image";
import {
  attributionCaption,
  deriveMediaUpload,
  labMediaKey,
  storageKeyFromPublicUrl,
  toPanelItem,
  type MediaAssetRow,
} from "@/lib/email/media-assets";

export const runtime = "nodejs";

const PUBLIC_BUCKET = "email-media";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// The Email Lab media library. Auth split (repo-canonical): the cookie client
// authorizes; RLS on email_media_assets scopes every row op to the caller;
// storage writes go through service-role under user-keyed paths.

async function requireUser() {
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  return { db, user };
}

// PUT /api/email-lab/media — upload: derive (≤1200px 2x-retina JPEG), store in
// the email-media bucket, insert the library row. Returns { url, item }.
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const { db, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json({ error: "file too large (8MB max)" }, { status: 413 });

  let derived;
  try {
    derived = await deriveMediaUpload(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "not a readable image" }, { status: 400 });
  }

  let url: string;
  try {
    url = await hostEmailMedia(
      labMediaKey(user.id, crypto.randomUUID()),
      derived.buf,
      "image/jpeg",
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const label = (file.name.replace(/\.[a-zA-Z0-9]+$/, "") || "Upload").slice(0, 120);
  const { data: row, error } = await db
    .from("email_media_assets")
    .insert({
      user_id: user.id,
      url,
      kind: "upload",
      label,
      width: derived.width,
      height: derived.height,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ url, item: toPanelItem(row as unknown as MediaAssetRow) });
}

// GET /api/email-lab/media — the caller's library, newest first.
export async function GET(): Promise<NextResponse> {
  const { db, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await db
    .from("email_media_assets")
    .select()
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    items: (data as unknown as MediaAssetRow[]).map(toPanelItem),
  });
}

// POST /api/email-lab/media — { action: "pick", photo } files a Pexels pick:
// hotlinks the Pexels CDN URL and stores the attribution that must ride the
// caption ("Photo by X on Pexels" — license credit, citation culture).
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { db, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    photo?: {
      url?: string;
      alt?: string;
      width?: number;
      height?: number;
      photographer?: string;
      photographerUrl?: string;
      pexelsUrl?: string;
    };
  } | null;
  const photo = body?.photo;
  if (body?.action !== "pick" || !photo?.url || !photo.photographer)
    return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { data: row, error } = await db
    .from("email_media_assets")
    .insert({
      user_id: user.id,
      url: photo.url,
      kind: "pexels",
      label: (photo.alt || "Pexels photo").slice(0, 120),
      width: photo.width ?? null,
      height: photo.height ?? null,
      attribution: {
        photographer: photo.photographer,
        photographer_url: photo.photographerUrl,
        pexels_url: photo.pexelsUrl,
      },
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const item = toPanelItem(row as unknown as MediaAssetRow);
  return NextResponse.json({
    item,
    caption: item.caption ?? attributionCaption({ photographer: photo.photographer }),
  });
}

// PATCH /api/email-lab/media — { id, label } renames a library entry.
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const { db, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: string; label?: string } | null;
  if (!body?.id || typeof body.label !== "string")
    return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { error } = await db
    .from("email_media_assets")
    .update({ label: body.label.slice(0, 120) })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/email-lab/media — { id } removes the row and, for our own bucket
// objects (never a hotlinked Pexels URL), the stored derivative.
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { db, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "bad request" }, { status: 400 });

  // RLS scopes the read to the owner — a foreign id simply comes back empty.
  const { data: row } = await db
    .from("email_media_assets")
    .select()
    .eq("id", body.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await db.from("email_media_assets").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const key = storageKeyFromPublicUrl((row as unknown as MediaAssetRow).url);
  if (key && key.startsWith(`${user.id}/`)) {
    // Best-effort: a stale storage object is inert; the row is gone either way.
    await createServiceRoleClient().storage.from(PUBLIC_BUCKET).remove([key]);
  }
  return NextResponse.json({ ok: true });
}
