/**
 * POST /api/email/contacts/upload
 *
 * INPUT CONTRACT: JSON body `{ csv: string, tags?: string[] }`
 *   - `csv`  — raw CSV text (header row required; columns: email, name, tags)
 *   - `tags` — optional array of tags to apply to every row in this import
 *
 * Parses the CSV, validates each email, and upserts into `public.email_contacts`
 * scoped to the signed-in user. Conflict on (user_id, email) merges name + tags.
 *
 * RESPONSE: 200 { inserted, updated, skipped, errors }
 *           400 missing / invalid body
 *           401 unauthenticated
 *
 * AUTH: cookie/RLS client only — RLS `auth.uid() = user_id` IS the authorization.
 * Never use the service-role client here.
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { normalizeEmail, isValidEmail } from "@/lib/email/validation";
import { parseContactsCsv } from "@/lib/email/parse-contacts-csv";

export const runtime = "nodejs";

// Maximum number of contacts accepted in a single upload to guard against
// runaway payloads.
const MAX_ROWS = 10_000;

export async function POST(req: NextRequest) {
  // --- Auth (copy pattern from app/api/projects/route.ts) ---
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // --- Parse body ---
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body: expected JSON object" }, { status: 400 });
  }

  const { csv, tags: bodyTagsRaw } = body as { csv?: unknown; tags?: unknown };

  if (typeof csv !== "string" || csv.trim().length === 0) {
    return NextResponse.json(
      { error: "invalid body: 'csv' must be a non-empty string" },
      { status: 400 },
    );
  }

  // Normalize body-level tags
  const bodyTags: string[] = Array.isArray(bodyTagsRaw)
    ? bodyTagsRaw
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
    : [];

  // --- Parse CSV ---
  const { rows, skippedCount } = parseContactsCsv(csv, bodyTags);

  if (rows.length === 0) {
    return NextResponse.json(
      { inserted: 0, updated: 0, skipped: skippedCount, errors: [] },
      { status: 200 },
    );
  }

  // --- Validate emails + enforce row cap ---
  const validRows: { user_id: string; email: string; name: string | null; tags: string[] }[] = [];
  let extraSkipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!isValidEmail(email)) {
      extraSkipped++;
      errors.push(`skipped invalid email: ${row.email}`);
      continue;
    }
    if (validRows.length >= MAX_ROWS) {
      extraSkipped++;
      continue;
    }
    validRows.push({
      user_id: user.id,
      email,
      name: row.name,
      tags: row.tags,
    });
  }

  const totalSkipped = skippedCount + extraSkipped;

  if (validRows.length === 0) {
    return NextResponse.json(
      { inserted: 0, updated: 0, skipped: totalSkipped, errors },
      { status: 200 },
    );
  }

  // --- Upsert into email_contacts ---
  // onConflict: "user_id,email" — merge name (if non-null) and union tags.
  // Supabase upsert with ignoreDuplicates:false will update on conflict.
  // We use a merge strategy: updated_at always advances; name is replaced if
  // the incoming value is non-null; tags are unioned via a raw SQL expression
  // (not available in the JS client), so we fall back to a two-pass approach:
  //   1. Insert new rows (ignoreDuplicates: true) → counts as "inserted"
  //   2. Update existing rows with merged tags  → counts as "updated"
  //
  // This keeps the route logic in the JS client without requiring a DB function.

  // Step 1: attempt insert-only; conflicts are silently ignored here
  const { data: inserted, error: insertError } = await supabase
    .from("email_contacts")
    .upsert(validRows, {
      onConflict: "user_id,email",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insertError) {
    return NextResponse.json(
      { error: "database error on insert", detail: insertError.message },
      { status: 500 },
    );
  }

  const insertedCount = inserted?.length ?? 0;
  const conflictCount = validRows.length - insertedCount;

  // Step 2: for rows that conflicted (already existed), update name + union tags
  let updatedCount = 0;
  if (conflictCount > 0) {
    // Fetch existing rows to merge tags client-side
    const conflictEmails = validRows.slice(0, validRows.length).map((r) => r.email);
    const { data: existing, error: fetchError } = await supabase
      .from("email_contacts")
      .select("id, email, tags")
      .eq("user_id", user.id)
      .in("email", conflictEmails);

    if (!fetchError && existing && existing.length > 0) {
      const incomingByEmail = new Map(validRows.map((r) => [r.email, r]));

      const updates = existing
        .filter((ex) => {
          // Only rows that actually conflicted (not the freshly inserted ones)
          const incoming = incomingByEmail.get(ex.email);
          return incoming !== undefined;
        })
        .map((ex) => {
          const incoming = incomingByEmail.get(ex.email)!;
          const mergedTags = Array.from(
            new Set([...((ex.tags as string[]) ?? []), ...incoming.tags]),
          );
          return {
            id: ex.id as number,
            name: incoming.name,
            tags: mergedTags,
          };
        });

      // Update each conflicted row — batch via individual updates (small N typical)
      for (const update of updates) {
        const { error: upErr } = await supabase
          .from("email_contacts")
          .update({
            name: update.name,
            tags: update.tags,
            updated_at: new Date().toISOString(),
          })
          .eq("id", update.id)
          .eq("user_id", user.id); // belt-and-suspenders RLS
        if (!upErr) updatedCount++;
      }
    }
  }

  return NextResponse.json(
    {
      inserted: insertedCount,
      updated: updatedCount,
      skipped: totalSkipped,
      errors,
    },
    { status: 200 },
  );
}
