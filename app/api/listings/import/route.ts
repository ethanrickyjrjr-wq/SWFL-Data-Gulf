// POST /api/listings/import — bulk import user listings from CSV. Mirrors
// app/api/contacts/import. Verify-first-record: the `echo` rows are SELECTed
// back after the write — "connected" means a row round-tripped, never "a
// file parsed" (spec 2026-08-03 §3). Partial success is the normal outcome:
// bad rows degrade counts, they never fail the import.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseListingsCsv } from "@/lib/listings-user/parse-listings-csv";
import { upsertUserListings } from "@/lib/listings-user/upsert";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — same cap as contacts
const MAX_ROWS = 5000;
const ECHO_LIMIT = 3;

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 5 MB)" }, { status: 413 });
  }

  const { rows, skippedCount, skipReasons } = parseListingsCsv(await file.text());
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `too many rows (max ${MAX_ROWS})` }, { status: 413 });
  }
  if (rows.length === 0) {
    return NextResponse.json({
      total: 0,
      added: 0,
      skipped: skippedCount,
      skip_reasons: skipReasons,
      matched_to_county: 0,
      echo: [],
    });
  }

  const { added, matchedToCounty, error } = await upsertUserListings(supabase, user.id, rows);
  if (error) {
    return NextResponse.json({ error: "import failed", detail: error }, { status: 500 });
  }

  // Verify-first-record: read back what actually landed (never echo the payload).
  const keys = rows.slice(0, ECHO_LIMIT).map((r) => r.address_key);
  const { data: echoRows } = await supabase
    .from("user_listings")
    .select("address, price, beds, county")
    .eq("user_id", user.id)
    .in("address_key", keys)
    .limit(ECHO_LIMIT);

  return NextResponse.json({
    total: rows.length,
    added,
    skipped: skippedCount,
    skip_reasons: skipReasons,
    matched_to_county: matchedToCounty,
    echo: echoRows ?? [],
  });
}
