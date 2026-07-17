/**
 * GET /api/email/contacts/mailchimp/callback
 *
 * Mailchimp redirects here with `code` + `state`. We verify `state` against
 * the httpOnly cookie set by /start, exchange the code for an access token,
 * resolve the account's datacenter, read every member across every audience,
 * map to canonical ContactRows, and upsert into public.contacts through the
 * shared core (Task 5). A successful import that clears the Switch Pass
 * floor activates the pass (Task 4). The token is never stored. On every
 * outcome we redirect back to /contacts/upload with a status query so the UI
 * can render a banner. Mirrors app/api/email/contacts/google/callback.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import {
  exchangeCodeForToken,
  fetchMailchimpDatacenter,
  fetchAllMembers,
  mailchimpMembersToContactRows,
  mailchimpRedirectUri,
} from "@/lib/email/mailchimp-oauth";
import { upsertCanonicalContacts } from "@/lib/contacts/upsert";
import { activateSwitchPass } from "@/lib/switch/activate";
import { OAUTH_STATE_COOKIE } from "../start/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/contacts/upload", req.url));
  }

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/contacts/upload?mailchimp_error=${reason}`, req.url));

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return finish(fail("denied"));

  const code = params.get("code");
  const stateParam = params.get("state");
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value ?? "";

  // CSRF: the echoed state must match the one we stashed (constant work — fine here).
  if (!code || !stateParam || !cookieState || stateParam !== cookieState) {
    return finish(fail("state"));
  }

  let rows;
  try {
    const redirectUri = mailchimpRedirectUri(req.url);
    const token = await exchangeCodeForToken({ code, redirectUri });
    const dc = await fetchMailchimpDatacenter(token);
    const members = await fetchAllMembers(token, dc);
    rows = mailchimpMembersToContactRows(members);
  } catch {
    return finish(fail("fetch"));
  }

  const { added, error } = await upsertCanonicalContacts(supabase, user.id, rows);
  if (error) {
    return finish(fail("import"));
  }

  // The import already committed — a pass-activation problem (including
  // createServiceRoleClient() throwing on missing env) must degrade to
  // pass=0, never turn a successful import into a 500.
  let passActivated = false;
  try {
    const passResult = await activateSwitchPass(createServiceRoleClient(), user.id, {
      lane: "oauth_extraction",
      platform: "mailchimp",
      contactsImported: added,
    });
    passActivated = passResult.activated;
  } catch (err) {
    console.error("[mailchimp-oauth] pass activation failed:", err);
  }

  const url = new URL("/contacts/upload", req.url);
  url.searchParams.set("source", "mailchimp");
  url.searchParams.set("imported", String(added));
  url.searchParams.set("pass", passActivated ? "1" : "0");
  return finish(NextResponse.redirect(url));
}

/** Drop the single-use state cookie on the way out, whatever the outcome. */
function finish(res: NextResponse): NextResponse {
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
