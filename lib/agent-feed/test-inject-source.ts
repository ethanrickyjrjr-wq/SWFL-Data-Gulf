// lib/agent-feed/test-inject-source.ts
//
// DB-access layer for POST /api/agent-feed/test-inject (Task 4, hermes-email-driver spec
// 2026-08-10). The load-bearing guard (spec failure mode 3/7b -- "fake event leaking to a
// real account"): a test-inject address must belong to the FICTIONAL demo account's OWN
// saved listing projects, checked SERVER-SIDE -- never trusted from the caller. The demo
// account is allstatecoop@gmail.com (docs/standards/emails.md:885-887 -- "FULLY FICTIONAL
// demo account: never treat as a real client, never send it anything externally-visible";
// same account docs/superpowers/specs/2026-08-10-hermes-email-driver-design.md:15 names as
// the pilot's second account), overridable via DEMO_ACCOUNT_EMAIL for a non-prod environment.
//
// EMAIL -> USER ID: no email->user lookup helper exists anywhere in the repo (grepped
// listUsers/getUserByEmail/a profiles table -- the same finding
// app/api/webhooks/resend/route.ts's switch-forward lane already made, comment at its
// findUserIdByEmail), so auth.admin.listUsers pagination is the only surface -- mirrored
// from that route rather than re-derived (RULE 0.5).
//
// ADDRESS MATCHING uses the SAME address_key convention as every other listing-identity
// compare in this repo (lib/listings/address-key.ts, the TS port of the ingest
// address_key.py) -- keyed on normalized street + 5-digit ZIP, never a raw string compare.
// Street/ZIP are split out of the free-text address the SAME way
// app/api/projects/[id]/watch/route.ts already does for a project's own subject_address
// (street = text before the first comma; ZIP = the last 5-digit run in the string, same
// shape as lib/listings/resolve-subject.ts's commaCity ZIP strip) rather than a live geocode
// call -- this module makes zero network calls, and the caller (Hermes / an operator curl)
// posts the literal address text off the demo project's own subject_address, which already
// carries its own ZIP.
import type { SupabaseClient } from "@supabase/supabase-js";
// KNOWN-DEBT(data_lake/public untyped read): agent_feed_test_events and the `scope` column
// on user_api_tokens are new columns/tables the generated Database type doesn't know about
// yet (migration landed this session, codegen not re-run) -- same untyped hatch
// lib/agent-feed/transitions-source.ts already uses for this exact reason.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { addressKey } from "@/lib/listings/address-key";

const DEMO_ACCOUNT_EMAIL = process.env.DEMO_ACCOUNT_EMAIL ?? "allstatecoop@gmail.com";

/** Street line = text before the first comma; ZIP = the LAST 5-digit run in the string
 *  MUST take the LAST match, not the first (review fix, was MEDIUM-HIGH). SWFL house
 *  numbers commonly run 5 digits (Cape Coral, Golden Gate Estates grids) -- a single
 *  non-global .match() on "12345 Ocean Blvd, Naples, FL 34102" returns the HOUSE
 *  NUMBER (12345), not the ZIP (34102), silently computing the wrong address_key.
 *  That corrupts every downstream consumer keyed on it: Task 3's feed payload and
 *  Task 5's claimOnce idempotency key both trust this value verbatim. matchAll (not
 *  .match) walks every 5-digit run; the LAST one wins because a ZIP always trails
 *  street/city/state while a 5-digit house number always leads.
 *  (a trailing +4 is tolerated and dropped, matching address-key.ts's own ZIP
 *  normalization). Deterministic, no network call -- both the posted address and each demo
 *  project's stored subject_address run through this SAME function, so surface differences
 *  never block a real match. */
export function normalizedAddressKey(address: string): string {
  const raw = String(address ?? "");
  const street = raw.split(",")[0]?.trim() ?? "";
  const zipMatches = [...raw.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)];
  const zip = zipMatches.length > 0 ? zipMatches[zipMatches.length - 1]![1] : "";
  return addressKey(street, zip ?? "");
}

/** Paginate auth.admin.listUsers for an exact (case-insensitive) email match. Mirrors
 *  app/api/webhooks/resend/route.ts's switch-forward lane findUserIdByEmail -- the one other
 *  place in the repo that resolves an email to a user id, since no profiles table or
 *  dedicated lookup RPC exists. Hard page cap so a large user base can't hang the request; a
 *  miss past the cap is a known limitation, not a silent one. */
async function findDemoUserId(db: SupabaseClient): Promise<string | null> {
  const PAGE_SIZE = 200;
  const MAX_PAGES = 25;
  const target = DEMO_ACCOUNT_EMAIL.toLowerCase();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error || !data) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < PAGE_SIZE) break;
  }
  return null;
}

/** True only if `address` (normalized) matches an address_key already held by one of the
 *  demo account's OWN listing projects (kind='listing'). Fails CLOSED on any lookup miss
 *  (no demo user resolvable, no projects, any query error) -- false, never true; an address
 *  is scoped to the demo account only on a positive, server-verified match. */
export async function isDemoScopedAddress(address: string): Promise<boolean> {
  const db = createServiceRoleClientUntyped();

  const demoUserId = await findDemoUserId(db);
  if (!demoUserId) return false;

  const { data, error } = await db
    .from("projects")
    .select("subject_address")
    .eq("kind", "listing")
    .eq("user_id", demoUserId);
  if (error || !data) return false;

  const target = normalizedAddressKey(address);
  return (data as { subject_address: string | null }[]).some(
    (row) => row.subject_address && normalizedAddressKey(row.subject_address) === target,
  );
}

export interface InsertTestEventRow {
  address: string;
  address_key: string;
  sale_or_rent: string;
  from_state: string | null;
  to_state: string;
  price_delta: number | null;
  /** Omitted -> the table's own `default now()` fills it. */
  at?: string;
  created_by: string;
}

/** Writes ONLY public.agent_feed_test_events -- NEVER data_lake.listing_transitions (plan
 *  Global Constraint, docs/superpowers/plans/2026-08-10-hermes-email-driver.md:16). Returns
 *  the new row's bigserial id, or null on any insert failure -- the route maps null -> 500,
 *  never fabricates an id. */
export async function insertTestEvent(row: InsertTestEventRow): Promise<number | null> {
  const db = createServiceRoleClientUntyped();
  const { data, error } = await db.from("agent_feed_test_events").insert(row).select("id").single();
  if (error || !data) return null;
  return (data as { id: number }).id;
}
