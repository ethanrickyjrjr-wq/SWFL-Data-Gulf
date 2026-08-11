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
// broadcast_id/idempotency_key at ~1383-1414) -- unlike the data_lake.* reads elsewhere in
// this feature, no untyped hatch is needed here; createServiceRoleClient() (typed) is used
// throughout.
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { normalizedAddressKey } from "@/lib/agent-feed/test-inject-source";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import type { EmailDoc } from "@/lib/email/doc/types";

const EMPTY_NARRATIVE = { exec_summary: "", sections: [], inference_notes: [] };

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
export async function findProjectId(userId: string, address: string): Promise<string | null> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("projects")
    .select("id, subject_address")
    .eq("kind", "listing")
    .eq("user_id", userId);
  if (error || !data) return null;
  const target = normalizedAddressKey(address);
  const hit = data.find(
    (row) => row.subject_address && normalizedAddressKey(row.subject_address) === target,
  );
  return hit?.id ?? null;
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
 * Link a won claim to the draft it produced -- BEST EFFORT, called AFTER `insertDraft`
 * succeeds (the draft id doesn't exist before then, so this can never be folded into the
 * claim itself). `email_send_ledger` carries no `draft_id` column; `broadcast_id` (free-text,
 * "Resend broadcast id when known" per its own DDL comment) is repurposed as the generic
 * "external id this claim produced" slot -- confirmed safe by grep: every OTHER reader of a
 * `broadcast_id` column in this repo (webhooks/resend, campaign-click-alert, blast-events)
 * queries `email_sends`/webhook payloads, never `email_send_ledger`; this table's
 * `broadcast_id` has no reader today except `lookupDuplicateDraft` below.
 *
 * A failure here is logged, not fatal -- the draft is already real and already returned to
 * the caller; only a FUTURE claim-lost reply degrades (see lookupDuplicateDraft's
 * `duplicate_pending` note). Never thrown into the request.
 */
export async function recordDraftOnLedger(
  idempotencyKey: string,
  draftId: string,
): Promise<boolean> {
  const db = createServiceRoleClient();
  const { error } = await db
    .from("email_send_ledger")
    .update({ broadcast_id: draftId })
    .eq("idempotency_key", idempotencyKey);
  if (error) {
    console.warn(
      `[agent-build/persist] recordDraftOnLedger("${idempotencyKey}" -> "${draftId}") failed: ${error.message}`,
    );
  }
  return !error;
}

export interface DuplicateDraft {
  draftId: string;
  recipeKey: string | null;
}

/**
 * On a lost claim, resolve the draft the WINNING call produced -- reads the PERSISTED row,
 * never echoes the replaying caller's own request body (a caller could post a different
 * recipe_key for the same transition natural key; the honest answer is what actually got
 * built). Two reads: the ledger row for the linked draft id (see recordDraftOnLedger), then
 * the deliverables row itself so a soft-trashed draft (`deleted_at` -- live on this table,
 * checked the same way `app/api/deliverables/[id]/preview-html/route.ts` does) is never
 * handed back as if it still existed.
 *
 * Returns null when: the ledger row is missing, `broadcast_id` was never linked (the WINNING
 * call is still mid-build, or its link update failed -- a legitimate race, not corruption;
 * the caller maps this to `duplicate_pending`, not a 4xx), or the linked draft was trashed.
 */
export async function lookupDuplicateDraft(idempotencyKey: string): Promise<DuplicateDraft | null> {
  const db = createServiceRoleClient();
  const { data: ledgerRow, error: ledgerError } = await db
    .from("email_send_ledger")
    .select("broadcast_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (ledgerError || !ledgerRow?.broadcast_id) return null;

  const draftId = ledgerRow.broadcast_id;
  const { data: draftRow, error: draftError } = await db
    .from("deliverables")
    .select("id, recipe_key, deleted_at")
    .eq("id", draftId)
    .maybeSingle();
  if (draftError || !draftRow || draftRow.deleted_at) return null;

  return { draftId: draftRow.id, recipeKey: draftRow.recipe_key };
}
