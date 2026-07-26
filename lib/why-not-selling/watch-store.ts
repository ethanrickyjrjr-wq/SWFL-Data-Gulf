// lib/why-not-selling/watch-store.ts — the Why Isn't It Selling track-it store.
// Pure validation + three thin operations over public.report_watches (RLS deny-all;
// service-role only). THE SENDER IS DARK BY SPEC: nothing here sends email, and
// confirmed_at stays null until `wins_watch_email_live` wires the confirmation flow.
// The agent opt-in is explicit consent — stored with the EXACT label text the form
// showed and a timestamp, only when the checkbox was actually checked.
//
// KNOWN-DEBT(data_lake): report_watches is a new public-schema table not yet in the
// generated Supabase types — untyped service-role client until types regenerate.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface WatchInput {
  email: string;
  addressKey: string;
  zip: string;
  queryText: string;
  agentOptin: boolean;
}

/** The exact consent label the form renders — stored verbatim on opt-in. */
export const AGENT_OPTIN_CONSENT_TEXT =
  "Have one vetted local agent review this report with me (optional)";

/** A plain shape-check email pattern (not RFC exhaustive — the confirm loop is the real
 *  verification, when it lights). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_RE = /^\d{5}$/;

export interface WatchRow {
  email: string;
  address_key: string;
  zip: string;
  query_text: string;
  agent_optin_at: string | null;
  consent_text: string | null;
}

export interface WatchDb {
  insertWatch(row: WatchRow): Promise<"saved" | "exists">;
  stampByToken(column: "confirmed_at" | "unsubscribed_at", token: string): Promise<boolean>;
}

export interface WatchDeps {
  db?: WatchDb;
  now?: Date;
}

/** Form → WatchInput, or null on anything that isn't honestly storable. The opt-in is
 *  true ONLY when the checkbox value is "on" (an unchecked box posts nothing). */
export function validateWatchInput(form: Record<string, unknown>): WatchInput | null {
  const email = typeof form.email === "string" ? form.email.trim() : "";
  const addressKey = typeof form.address_key === "string" ? form.address_key.trim() : "";
  const zip = typeof form.zip === "string" ? form.zip.trim() : "";
  const queryText = typeof form.q === "string" ? form.q.trim() : "";
  if (!EMAIL_RE.test(email) || !ZIP_RE.test(zip) || !addressKey) return null;
  return { email, addressKey, zip, queryText, agentOptin: form.agent_optin === "on" };
}

function defaultDb(): WatchDb {
  return {
    async insertWatch(row) {
      const db = createServiceRoleClientUntyped();
      const { data, error } = await db
        .from("report_watches")
        .upsert(row, { onConflict: "email,address_key", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      return Array.isArray(data) && data.length > 0 ? "saved" : "exists";
    },
    async stampByToken(column, token) {
      const db = createServiceRoleClientUntyped();
      const { data, error } = await db
        .from("report_watches")
        .update({ [column]: new Date().toISOString() })
        .eq("confirm_token", token)
        .select("id");
      if (error) throw error;
      return Array.isArray(data) && data.length > 0;
    },
  };
}

/** Store a watch. "exists" = same email already tracks this home (idempotent, fine).
 *  ANY failure → "error" — the route turns it into a banner, never a crash. */
export async function createWatch(
  input: WatchInput,
  deps: WatchDeps = {},
): Promise<"saved" | "exists" | "error"> {
  const db = deps.db ?? defaultDb();
  const now = (deps.now ?? new Date()).toISOString();
  try {
    return await db.insertWatch({
      email: input.email,
      address_key: input.addressKey,
      zip: input.zip,
      query_text: input.queryText,
      agent_optin_at: input.agentOptin ? now : null,
      consent_text: input.agentOptin ? AGENT_OPTIN_CONSENT_TEXT : null,
    });
  } catch {
    return "error";
  }
}

/** Stamp confirmed_at for the watch holding this token. False on miss or any error. */
export async function confirmWatch(token: string, deps: WatchDeps = {}): Promise<boolean> {
  const db = deps.db ?? defaultDb();
  try {
    return token ? await db.stampByToken("confirmed_at", token) : false;
  } catch {
    return false;
  }
}

/** Stamp unsubscribed_at. Idempotent (re-stamping is harmless). False on miss/error. */
export async function unsubscribeWatch(token: string, deps: WatchDeps = {}): Promise<boolean> {
  const db = deps.db ?? defaultDb();
  try {
    return token ? await db.stampByToken("unsubscribed_at", token) : false;
  } catch {
    return false;
  }
}
