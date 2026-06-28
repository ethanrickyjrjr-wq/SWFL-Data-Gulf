import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const runtime = "nodejs";

const PUBLIC_BUCKET = "email-media";
const HEADER_SIZE = 2000;
const MAX_PAYLOAD = 20 * 1024 * 1024; // 20 MB

interface PhotopeaVersion {
  format: string;
  start: number;
  size: number;
}
interface PhotopeaMeta {
  source?: string;
  versions?: PhotopeaVersion[];
}

// Format preference for email rendering: png best, then jpg/jpeg, then webp.
// PSD files are never renderable in an email block.
const FORMAT_RANK: Record<string, number> = { png: 0, jpg: 1, jpeg: 1, webp: 2 };

function mimeFor(format: string): string {
  if (format === "jpg" || format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  if (format === "gif") return "image/gif";
  return `image/${format}`;
}

// POST /api/email-lab/save-photo
// Called by Photopea's server-save feature. Payload = 2000-byte JSON header
// (per photopea.com/api) followed by the exported image bytes. We pick the
// best renderable format, store it in email-media, then return the public URL
// in the Photopea response envelope. The `script` field triggers echoToOE so
// the parent modal receives the URL via postMessage without polling this route.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.arrayBuffer();
  if (raw.byteLength < HEADER_SIZE)
    return NextResponse.json({ error: "payload too small" }, { status: 400 });
  if (raw.byteLength > MAX_PAYLOAD)
    return NextResponse.json({ error: "payload too large" }, { status: 413 });

  const buf = Buffer.from(raw);

  let meta: PhotopeaMeta;
  try {
    const headerStr = buf.subarray(0, HEADER_SIZE).toString("utf8").replace(/\0/g, "").trim();
    meta = JSON.parse(headerStr) as PhotopeaMeta;
  } catch {
    return NextResponse.json({ error: "invalid photopea header" }, { status: 400 });
  }

  const renderable = (meta.versions ?? []).filter((v) => v.format !== "psd");
  if (renderable.length === 0)
    return NextResponse.json({ error: "no renderable format in payload" }, { status: 400 });

  const picked = renderable.sort(
    (a, b) => (FORMAT_RANK[a.format] ?? 99) - (FORMAT_RANK[b.format] ?? 99),
  )[0];

  const imgBytes = buf.subarray(
    HEADER_SIZE + picked.start,
    HEADER_SIZE + picked.start + picked.size,
  );
  const ext = picked.format === "jpeg" ? "jpg" : picked.format;
  const key = `${user.id}/photopea/${crypto.randomUUID()}.${ext}`;

  const admin = createServiceRoleClient();
  const { error } = await admin.storage
    .from(PUBLIC_BUCKET)
    .upload(key, imgBytes, { contentType: mimeFor(picked.format), upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(key);
  const url = data.publicUrl;

  return NextResponse.json({
    url,
    message: "Photo saved!",
    script: `app.echoToOE(JSON.stringify({type:"photopea-saved",url:${JSON.stringify(url)}}));`,
  });
}
