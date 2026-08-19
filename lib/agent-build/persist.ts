// lib/agent-build/persist.ts
//
// DB-access layer for POST /api/agent/build (Task 5, hermes-email-driver spec 2026-08-10,
// Piece 4). Mirrors lib/agent-feed/test-inject-source.ts's shape (RULE 0.5 -- each function
// owns its own client, the route mocks this module wholesale) and materials-route.ts's
// EXACT persistence pattern for "save a doc to a project": a `deliverables` row, template
// "block-canvas", written via the service-role client because `deliverables` has public
// SELECT and NO owner INSERT/UPDATE policy (docs/sql/20260613_email_send_ledger.sql /
// 20260613_deliverables.sql).
//
// `deliverables` and `email_send_ledger` are BOTH public-schema and typed in
// database-generated.types.ts (recipe_key/data_as_of/deleted_at at lines ~1098-1124,
// broadcast_id/idempotency_key/created_at at ~1383-1414) -- unlike the data_lake.* reads
// elsewhere in this feature, no untyped hatch is needed here; createServiceRoleClient()
// (typed) is used throughout.
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { normalizedAddressKey } from "@/lib/agent-feed/test-inject-source";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import type { EmailDoc } from "@/lib/email/doc/types";

const EMPTY_NARRATIVE = { exec_summary: "", sections: [], inference_notes: [] };

// L1 fix (hermes-email-driver review round): PostgREST truncates an unbounded/default-max
// result set silently -- a project owner with more listing projects than that ceiling could
// see a real project MISS the scan and 404 as "no_matching_project" even though the row
// exists. Bounded explicitly + ordered so truncation, if it ever happens, drops the
// LEAST-recently-touched rows first rather than an arbitrary unordered slice. 1000 listing
// projects for one account is far beyond any real usage today; raise this only alongside
// evidence an account is actually near it. Since 08/19/2026 the query no longer filters
// kind, so this caps ALL of the owner's projects (updated_at desc) — an account holding
// more than this many TOTAL projects could age a real match off the scan window.
const PROJECT_SCAN_LIMIT = 1000;

export interface ProjectMatch {
  projectId: string;
  /** The project's OWN stored subject_address -- the canonical spelling downstream code
   *  should use (L2 fix), never the caller's raw request string once a match is found. */
  subjectAddress: string;
}

/**
 * The listing project this build's draft belongs to -- the OWNER's own project whose
 * `subject_address` matches, compared via the SAME address_key convention as every other
 * listing-identity compare in this repo (lib/listings/address-key.ts via
 * lib/agent-feed/test-inject-source.ts's normalizedAddressKey -- RULE 0.5, no third
 * normalizer). Scoped to `userId` (the requesting token's own owner, from `requireScope`) --
 * NEVER searched across every user's projects, which would let one token's build write into
 * a stranger's project it merely guessed the address for.
 *
 * Fails CLOSED on any miss (no such project, any query error) -- null, never a guess. The
 * caller 404s rather than inventing a destination project.
 */
export async function findProjectId(userId: string, address: string): Promise<ProjectMatch | null> {
  const db = createServiceRoleClient();
  // No kind filter: address-titled projects born through older doors are kind:"general"
  // with subject_address set (or backfilled 08/19/2026) — a subject_address match IS the
  // listing signal; filtering kind made every one of those invisible and scattered builds.
  const { data, error } = await db
    .from("projects")
    .select("id, subject_address, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(PROJECT_SCAN_LIMIT);
  if (error || !data) return null;
  const target = normalizedAddressKey(address);
  const hit = data.find(
    (row) => row.subject_address && normalizedAddressKey(row.subject_address) === target,
  );
  return hit ? { projectId: hit.id, subjectAddress: hit.subject_address as string } : null;
}

export interface DraftInsert {
  projectId: string;
  userId: string;
  recipeKey: string;
  doc: EmailDoc;
}

/**
 * Persist the built EmailDoc as an ordinary `block-canvas` deliverable -- the SAME row
 * shape `app/api/projects/[id]/materials/route.ts` POST and `app/api/projects/[id]/week/
 * route.ts`'s `insertMaterial` write for every other "save a doc to a project" caller in
 * this repo. Saved UNBRANDED (week/route.ts's own convention: "brand applies client-side on
 * load, like calendar cards") -- this seam never fetches or applies an account brand.
 *
 * Re-validates with EmailDocSchema before the insert, exactly like `insertMaterial` does for
 * its OWN internally-built doc (payload.doc from buildContentDoc) -- a coded recipe builder
 * is trusted at the TYPE level, but the schema check is cheap defense-in-depth against a
 * malformed doc reaching a stored row, and mirroring the sibling exactly is the brief's own
 * instruction.
 *
 * Returns the new row's id, or null on a schema-parse failure or an insert error -- the
 * route maps null -> a released claim + 500, never a fabricated id.
 */
export async function insertDraft(input: DraftInsert): Promise<string | null> {
  const parsed = EmailDocSchema.safeParse(input.doc);
  if (!parsed.success) return null;

  const db = createServiceRoleClient();
  const newId = crypto.randomUUID();
  const { error } = await db.from("deliverables").insert({
    id: newId,
    project_id: input.projectId,
    user_id: input.userId,
    template: "block-canvas",
    doc: parsed.data,
    instruction: null,
    recipe_key: input.recipeKey,
    data_as_of: new Date().toISOString(),
    narrative: EMPTY_NARRATIVE,
    items_snapshot: [],
    status: "ready",
  });
  return error ? null : newId;
}

/**
 * L3 fix (hermes-email-driver review round). The original version trusted a bare `!error`
 * as proof of a successful link -- but a Postgres/PostgREST UPDATE with a WHERE clause that
 * matches ZERO rows returns `error: null` too (it isn't an error to match nothing). Without
 * `.select()` on the update, there was no way to tell "I linked the draft" apart from "I
 * quietly updated nothing" -- so `linked === true` never actually proved a row changed.
 * `.select("idempotency_key")` makes PostgREST return the rows it actually touched; `linked`
 * is now `updated row count > 0`, a real assertion instead of an error-absence assumption.
 */
export async function recordDraftOnLedger(
  idempotencyKey: string,
  draftId: string,
): Promise<boolean> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("email_send_ledger")
    .update({ broadcast_id: draftId })
    .eq("idempotency_key", idempotencyKey)
    .select("idempotency_key");
  if (error) {
    console.warn(
      `[agent-build/persist] recordDraftOnLedger("${idempotencyKey}" -> "${draftId}") failed: ${error.message}`,
    );
    return false;
  }
  const linked = (data?.length ?? 0) > 0;
  if (!linked) {
    console.warn(
      `[agent-build/persist] recordDraftOnLedger("${idempotencyKey}") matched 0 ledger rows -- link not recorded`,
    );
  }
  return linked;
}

export interface LedgerClaim {
  broadcastId: string | null;
  /** ISO timestamp string -- email_send_ledger.created_at, DB-server-stamped at claim time. */
  createdAt: string;
}

/**
 * H1 fix (hermes-email-driver review round). The raw ledger row for a claimed key, exposing
 * `createdAt` -- the piece `lookupDuplicateDraft` alone can't answer: "is this claim just
 * mid-build, or did the process that won it die before ever linking a draft?" The route uses
 * this to decide whether a claim-lost-with-no-draft reply is a genuine, still-in-progress
 * race (return duplicate_pending, unchanged) or an ORPHANED claim old enough that nothing is
 * plausibly still building it (release + retryable:true, so the next tick can re-claim).
 *
 * Returns null on no row / any query error -- the caller treats a missing row as "not stale"
 * (nothing to release) rather than guessing an age it cannot compute.
 */
export async function findLedgerClaim(idempotencyKey: string): Promise<LedgerClaim | null> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("email_send_ledger")
    .select("broadcast_id, created_at")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error || !data) return null;
  return { broadcastId: data.broadcast_id, createdAt: data.created_at };
}

export interface DuplicateDraft {
  draftId: string;
  recipeKey: string | null;
}

/**
 * On a lost claim, resolve the draft the WINNING call produced -- reads the PERSISTED row,
 * never echoes the replaying caller's own request body (a caller could post a different
 * recipe_key for the same transition natural key; the honest answer is what actually got
 * built). Built on `findLedgerClaim` (H1 fix -- one authority for reading the ledger row,
 * not two separate queries drifting apart) plus a `deliverables` lookup so a soft-trashed
 * draft (`deleted_at` -- live on this table, checked the same way
 * `app/api/deliverables/[id]/preview-html/route.ts` does) is never handed back as if it
 * still existed.
 *
 * Returns null when: the ledger row is missing, `broadcast_id` was never linked (the WINNING
 * call is still mid-build, or its link update failed -- a legitimate race, not corruption;
 * the caller maps this to `duplicate_pending`, not a 4xx), or the linked draft was trashed.
 */
export async function lookupDuplicateDraft(idempotencyKey: string): Promise<DuplicateDraft | null> {
  const claim = await findLedgerClaim(idempotencyKey);
  if (!claim?.broadcastId) return null;

  const db = createServiceRoleClient();
  const draftId = claim.broadcastId;
  const { data: draftRow, error: draftError } = await db
    .from("deliverables")
    .select("id, recipe_key, deleted_at")
    .eq("id", draftId)
    .maybeSingle();
  if (draftError || !draftRow || draftRow.deleted_at) return null;

  return { draftId: draftRow.id, recipeKey: draftRow.recipe_key };
}
