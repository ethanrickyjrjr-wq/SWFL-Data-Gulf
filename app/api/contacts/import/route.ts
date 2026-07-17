// POST /api/contacts/import — bulk import contacts from a CSV or vCard (.vcf) file.
// multipart/form-data with `file`. Reuses the repo's CSV parser; vCard via the
// dependency-free parser in lib/contacts/parse-vcard.ts.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseContactsCsv } from "@/lib/email/parse-contacts-csv";
import { parseVcards } from "@/lib/contacts/parse-vcard";
import { upsertCanonicalContacts } from "@/lib/contacts/upsert";
import type { ContactRow, ImportResult } from "@/lib/contacts/types";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 5000;

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

  const text = await file.text();
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, skip_reasons: [] };
  let rows: ContactRow[] = [];

  if (file.name.toLowerCase().endsWith(".vcf")) {
    const parsed = parseVcards(text);
    rows = parsed.rows;
    result.skipped += parsed.skipped;
    result.skip_reasons.push(...parsed.skip_reasons.slice(0, 20));
  } else {
    const parsed = parseContactsCsv(text);
    result.skipped += parsed.skippedCount;
    if (parsed.skippedCount > 0) {
      result.skip_reasons.push(`${parsed.skippedCount} row(s) had no valid email`);
    }
    // The CSV parser doesn't emit phone; leave it null (extend the parser if needed).
    rows = parsed.rows.map((r) => ({
      email: r.email,
      name: r.name,
      phone: null,
      tags: r.tags,
      attribs: r.attribs ?? {},
    }));
  }

  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `too many rows (max ${MAX_ROWS})` }, { status: 413 });
  }
  if (rows.length === 0) {
    return NextResponse.json(result);
  }

  const { added, error } = await upsertCanonicalContacts(supabase, user.id, rows);
  if (error) {
    return NextResponse.json({ error: "import failed", detail: error }, { status: 500 });
  }
  result.added = added;

  return NextResponse.json(result);
}
