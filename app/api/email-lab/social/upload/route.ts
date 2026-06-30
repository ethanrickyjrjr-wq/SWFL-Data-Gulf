// app/api/email-lab/social/upload/route.ts
//
// Authed canvas export: accepts a PNG blob from the SocialComposer, uploads it to the
// public `social-media` bucket under a user-scoped key, returns the public URL that
// the publish adapters fetch. Auth posture: the cookie/RLS client identifies the user
// (authorization); the Storage write uses the service-role client (Storage bypasses RLS)
// under a user-scoped key — mirrors the cron worker's use of uploadSocialImage.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { uploadSocialImage } from "@/lib/social/media-upload";

export const runtime = "nodejs";

/**
 * Pure key builder — exported so tests can import and assert the key contract
 * without mocking auth or storage.
 * Key format: lab/<userId>/<uuid>.png
 * - `lab/` prefix keeps composer exports separate from cron-generated schedule images.
 * - user-scoped so bucket policy can enforce per-user isolation.
 * - uuid suffix prevents re-exports from clobbering an already-scheduled image.
 */
export function buildLabMediaKey(userId: string, uuid: string): string {
  return `lab/${userId}/${uuid}.png`;
}

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const key = buildLabMediaKey(user.id, crypto.randomUUID());

  try {
    const url = await uploadSocialImage(createServiceRoleClient(), buf, key);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[social/upload] failed:", err);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
