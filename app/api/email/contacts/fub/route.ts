// POST /api/email/contacts/fub — paste-your-API-key import from Follow Up
// Boss. Body: { apiKey: string }. The key is used ONLY for the fetch loop
// below (Basic auth, key as username, blank password — verified live against
// docs.followupboss.com/reference/authentication, 07/16/2026) and is never
// stored or logged. Pages every person via fetchAllFubPeople (hard-capped at
// FUB_MAX_PAGES/FUB_MAX_PEOPLE — lib/switch/fub-map.ts), maps to canonical
// ContactRows, upserts through the shared core (Task 5), and activates the
// Switch Pass on success (Task 4). Mirrors the partial-import-honesty
// contract fixed on the Mailchimp connector's review pass (Task 6): an
// upsert error with added > 0 still counts, activates a pass on that partial
// count, and flags `partial: true` — only a fully-failed upsert (added === 0)
// is a pure error response.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { fetchAllFubPeople, fubPeopleToContactRows, FubFetchError } from "@/lib/switch/fub-map";
import { upsertCanonicalContacts } from "@/lib/contacts/upsert";
import { activateSwitchPass } from "@/lib/switch/activate";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return NextResponse.json({ error: "apiKey required" }, { status: 400 });
  }

  let people;
  let truncated = false;
  try {
    const result = await fetchAllFubPeople(apiKey);
    people = result.people;
    truncated = result.truncated;
  } catch (err) {
    const reason = err instanceof FubFetchError ? err.message : "fetch failed";
    console.error("[fub] people fetch failed:", reason);
    return NextResponse.json(
      { error: "fub_fetch_failed", imported: 0, skipped: 0, pass: false },
      { status: 502 },
    );
  }

  const { rows, skipped } = fubPeopleToContactRows(people);

  if (rows.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped,
      pass: false,
      ...(truncated ? { truncated: true } : {}),
    });
  }

  const { added, error } = await upsertCanonicalContacts(supabase, user.id, rows);
  // upsertCanonicalContacts commits its 100-row batches sequentially and
  // stops on the FIRST error (lib/contacts/upsert.ts), so a later-batch
  // failure still leaves `added` real, already-committed rows in the DB.
  // Only a total, nothing-landed failure is the pure error path; any partial
  // success must still be reflected (and still eligible for pass
  // activation) rather than silently discarded — see file header.
  if (error && added === 0) {
    return NextResponse.json(
      { error: "import_failed", detail: error, imported: 0, skipped, pass: false },
      { status: 500 },
    );
  }

  // The import already committed `added` rows — a pass-activation problem
  // (including createServiceRoleClient() throwing on missing env) must
  // degrade to pass: false, never turn a successful or partially-successful
  // import into a 500.
  let passActivated = false;
  try {
    const passResult = await activateSwitchPass(createServiceRoleClient(), user.id, {
      lane: "oauth_extraction",
      platform: "followupboss",
      contactsImported: added,
    });
    passActivated = passResult.activated;
  } catch (err) {
    console.error("[fub] pass activation failed:", err);
  }

  return NextResponse.json({
    imported: added,
    skipped,
    pass: passActivated,
    ...(error ? { partial: true } : {}),
    ...(truncated ? { truncated: true } : {}),
  });
}
