// POST /api/uploads/parked — a parked (shapeless) CSV opens a checks-ledger
// entry so shape demand is COUNTED, not forgotten (spec 2026-08-03 §4,
// failure mode 8). Cookie-authed; the checks write needs service role
// (checks has no per-user RLS grant). Column names match scripts/check.mjs
// (project / check_key / label / state / resolution / class — verified
// 08/02/2026); upsert on check_key keeps re-parks idempotent.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId.slice(0, 64) : null;
  const headers = Array.isArray(body?.headers)
    ? body.headers
        .filter((h: unknown) => typeof h === "string")
        .slice(0, 50)
        .join(", ")
        .slice(0, 500)
    : "";
  const rowCount = typeof body?.rowCount === "number" ? body.rowCount : 0;
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const admin = createServiceRoleClient();
  const { error } = await admin.from("checks").upsert(
    {
      project: "user-data",
      check_key: `parked_upload_${itemId}`,
      label: `Parked upload (no shape): ${rowCount} rows — columns: ${headers}`,
      state: "open",
      resolution: "manual",
      class: "task",
    },
    { onConflict: "check_key" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
