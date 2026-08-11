// app/api/agent/build/route.ts -- Task 5, hermes-email-driver spec (2026-08-10), Piece 4.
// THE SEAM: an agent-triggered build runs the NORMAL email pipe (resolveSubject -> builderFor
// -> the recipe's own doc) and saves a draft to the listing project -- exactly the way
// app/api/projects/[id]/materials/route.ts POST and app/api/projects/[id]/week/route.ts's
// insertMaterial already save a doc to a project (a `deliverables` row, template
// "block-canvas") -- lib/agent-build/persist.ts mirrors that shape rather than inventing a
// second one.
//
// DELIBERATELY SINGLE-PHASE (design doc Piece 4): the shipped G1 action surface
// (app/api/projects/[id]/action/route.ts) is PROPOSE->CONFIRM because a HUMAN is in that
// loop. Here the call is machine-to-machine with nobody to confirm, and the output is a
// DRAFT -- human confirmation happens later, in the product, at send. So `claimOnce`
// (lib/email/idempotency.ts, the SAME atomic ON CONFLICT DO NOTHING primitive the G1 surface
// claims its nonce with) substitutes for the nonce round-trip.
//
// NO SEND PATH. Nothing below imports or calls any send/schedule/blast module -- the token
// this route accepts (agent_build) cannot reach one either (lib/api-tokens/scopes.ts).
//
// RELEASE-ON-ANY-FAILURE, AND WHY THAT IS SAFE HERE (the retry story the brief asked to be
// decided and documented): releaseClaim's own doc gates its use to a DEFINITIVE non-send,
// because on a SEND primitive an ambiguous failure (timeout, network drop) might have gone
// through, and releasing would risk a double-send. This seam never sends anything -- its
// only side effect is a stored draft -- so that asymmetry does not apply: the worst case of
// releasing after an ambiguous failure here is a duplicate DRAFT on retry, never a duplicate
// send. Every failure path after a won claim below releases it for exactly this reason.
//
// ORPHANED-CLAIM RECOVERY (H1 fix, hermes-email-driver review round). If the process dies
// between winning a claim and linking its draft to the ledger row (recordDraftOnLedger), a
// naive claim-lost reply would 500 "duplicate_pending" FOREVER -- there is no draft to find
// and no process left to finish building one. On a claim-lost reply with no linked draft,
// this route now reads the ledger row's own `created_at` (findLedgerClaim): younger than
// ORPHAN_THRESHOLD_MS is treated as a genuine in-progress build (unchanged: plain
// duplicate_pending, the winner is almost certainly still running); older releases the claim
// (releaseClaim -- already exists in lib/email/idempotency.ts, reused rather than adding a
// second delete helper, RULE 0.5) and replies `retryable:true` so the next Hermes tick
// re-claims and actually builds it.
//
// TOKEN-OWNER CONSEQUENCE FOR TASK 6 (found during Task 5's recon, not a code change):
// `findProjectId` scopes the project search to `requireScope`'s own `userId` -- the OWNER of
// the `agent_build` bearer token making this call. A demo-account rehearsal (Task 6 Step 4,
// "draft visible in demo project") therefore needs an `agent_build` token MINTED UNDER THE
// DEMO ACCOUNT, not the operator's own account -- an operator-account token can only ever
// resolve projects the operator owns. Searching every user's projects by address instead
// would be a write-into-a-stranger's-project hole, so this scoping is not optional.
import { NextResponse } from "next/server";
import { requireScope } from "@/lib/api-tokens/scopes";
import { claimOnce, releaseClaim } from "@/lib/email/idempotency";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { builderFor } from "@/lib/deliverable/recipes/index";
import { recipeByKey } from "@/lib/deliverable/recipes";
import { resolveSubject } from "@/lib/deliverable/recipes/shared";
import { defaultDoc } from "@/lib/email/doc/default-docs";
import { normalizedAddressKey } from "@/lib/agent-feed/test-inject-source";
// L4 fix (review round): the to_state/sale_or_rent vocabulary used to be duplicated here AND
// in app/api/agent-feed/test-inject/route.ts. Extracted to ONE authority.
import { VALID_TO_STATES, VALID_SALE_OR_RENT } from "@/lib/agent-feed/event-vocab";
import {
  findProjectId,
  insertDraft,
  recordDraftOnLedger,
  lookupDuplicateDraft,
  findLedgerClaim,
} from "@/lib/agent-build/persist";

export const runtime = "nodejs";
// Every sibling LLM-build route declares this (the recipe pipe can run a narrator call) --
// removes the fluid-compute default-duration dependency flagged in review.
export const maxDuration = 300;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com";

// A claim with no linked draft OLDER than this is treated as orphaned (the process that won
// it is gone), not mid-build -- see the H1 header note above.
const ORPHAN_CLAIM_MS = 10 * 60 * 1000;

// STRICT SCHEMA (design doc failure mode 4 -- "Hermes local model invents content or
// numbers, happened 08/09"): exactly these five fields, nothing else. A free-text/prose
// field can never reach this seam.
const ALLOWED_FIELDS = new Set(["recipe_key", "address", "sale_or_rent", "to_state", "at"]);

// Plan-verbatim allowlist, cross-checked against the ACTUAL RecipeKey registry
// (lib/deliverable/recipes.ts RECIPE_KEYS) during recon -- all seven are real, registered
// keys with a live builder in RECIPE_BUILDERS (lib/deliverable/recipes/index.ts). This is a
// SUBSET of RECIPE_KEYS, not the full registry: the area/agent/social recipes (agent-launch,
// market-pulse, social-pack, ...) have no transition that could ever select them and are
// deliberately not reachable from this seam.
const ALLOWED_RECIPE_KEYS = new Set([
  "new-listing",
  "price-reduced",
  "under-contract",
  "just-sold",
  "back-on-market",
  "coming-soon",
  "open-house",
]);

function badRequest(error: string): Response {
  return NextResponse.json({ error }, { status: 400 });
}

function previewUrlFor(draftId: string): string {
  return `${BASE_URL}/p/${draftId}`;
}

export async function POST(req: Request) {
  const scoped = await requireScope(req, "agent_build");
  if (scoped instanceof Response) return scoped;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid_json");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return badRequest("invalid_body");
  }
  const record = body as Record<string, unknown>;

  const extra = Object.keys(record).filter((k) => !ALLOWED_FIELDS.has(k));
  if (extra.length > 0) return badRequest(`unknown_field:${extra.join(",")}`);

  const recipeKey = typeof record.recipe_key === "string" ? record.recipe_key : "";
  if (!ALLOWED_RECIPE_KEYS.has(recipeKey)) return badRequest("invalid_field:recipe_key");

  const rawAddress = typeof record.address === "string" ? record.address.trim() : "";
  if (!rawAddress) return badRequest("missing_field:address");

  const saleOrRent = typeof record.sale_or_rent === "string" ? record.sale_or_rent : "";
  if (!VALID_SALE_OR_RENT.has(saleOrRent)) return badRequest("invalid_field:sale_or_rent");

  const toState = typeof record.to_state === "string" ? record.to_state : "";
  if (!VALID_TO_STATES.has(toState)) return badRequest("invalid_field:to_state");

  // `at` is the transition's own timestamp (the feed's ms-precision ISO-8601 UTC, per
  // app/api/agent-feed/transitions/route.ts's own contract) and rides VERBATIM into the
  // idempotency key -- considered and accepted: the transitions feed always emits one exact
  // string per real transition, so a byte-for-byte key match is the correct identity check,
  // not a looser timestamp-tolerant compare. Validated only for "is this parseable at all",
  // never reformatted.
  const at = typeof record.at === "string" ? record.at.trim() : "";
  if (!at || !Number.isFinite(Date.parse(at))) return badRequest("invalid_field:at");

  // Which project does this draft belong to? Scoped to the CALLING TOKEN'S OWNER (see the
  // header comment's Task-6 note) -- never searched across every account. H2a fix: the 404
  // body carries a machine-distinguishable `skippable:true` field so the Task 6 skill can
  // advance the cursor past a transition with no matching project on a FIELD, not by parsing
  // the HTTP status.
  const projectMatch = await findProjectId(scoped.userId, rawAddress);
  if (!projectMatch) {
    return NextResponse.json({ error: "no_matching_project", skippable: true }, { status: 404 });
  }
  // L2 fix: once matched, use the project's OWN stored subject_address for everything
  // downstream (the idempotency key, resolveSubject, the response's built_from.address) --
  // never the caller's raw request string. They normalize to the SAME address_key (that is
  // how the match above succeeded), but the project's canonical spelling is what every other
  // draft on this listing already carries, and what the rendered doc should carry too.
  const address = projectMatch.subjectAddress;

  // Plan-locked idempotency key: agent-build:<address_key>:<sale_or_rent>:<to_state>:<at> --
  // the transition's own natural key (mirrors the listing_transitions UNIQUE constraint),
  // never including recipe_key: a given transition triple always maps to exactly one
  // recipe_key (the Hermes skill's deterministic map), so recipe_key adds no identity here.
  const key = `agent-build:${normalizedAddressKey(address)}:${saleOrRent}:${toState}:${at}`;
  const db = createServiceRoleClient();

  let won: boolean;
  try {
    won = await claimOnce(db, key, { userId: scoped.userId, kind: "agent-build" });
  } catch (e) {
    console.error(`[agent/build] claimOnce("${key}") failed:`, e);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  if (!won) {
    const dup = await lookupDuplicateDraft(key);
    if (dup) {
      return NextResponse.json(
        {
          draft_id: dup.draftId,
          preview_url: previewUrlFor(dup.draftId),
          built_from: {
            recipe_key: dup.recipeKey ?? recipeKey,
            address,
            transition_at: at,
          },
          duplicate: true,
        },
        { status: 200 },
      );
    }

    // H1: no linked draft yet. Distinguish "the winner is still mid-build" (the ordinary,
    // frequent shape of this race -- resolveSubject + the narrator can take seconds) from
    // "the winner died and this claim is orphaned forever" by the ledger row's own age.
    const claim = await findLedgerClaim(key);
    const ageMs = claim ? Date.now() - Date.parse(claim.createdAt) : null;
    if (claim && ageMs != null && Number.isFinite(ageMs) && ageMs > ORPHAN_CLAIM_MS) {
      await releaseClaim(db, key);
      return NextResponse.json({ error: "duplicate_pending", retryable: true }, { status: 500 });
    }
    return NextResponse.json({ error: "duplicate_pending" }, { status: 500 });
  }

  // WON THE CLAIM -- build + persist. See the header comment: every failure path below
  // releases the claim, because this seam never sends.
  try {
    const { facts, resolved } = await resolveSubject(address, "");
    const recipe = recipeByKey(recipeKey);
    const builder = builderFor(recipeKey as never);
    if (!recipe || !builder) {
      await releaseClaim(db, key);
      return NextResponse.json({ error: "recipe_not_built" }, { status: 500 });
    }

    const built = await builder({
      recipe,
      prompt: "",
      currentDoc: defaultDoc(),
      facts,
      resolved,
      zip: facts?.zip,
    });
    if (!built) {
      await releaseClaim(db, key);
      return NextResponse.json({ error: "build_returned_null" }, { status: 500 });
    }

    const draftId = await insertDraft({
      projectId: projectMatch.projectId,
      userId: scoped.userId,
      recipeKey,
      doc: built,
    });
    if (!draftId) {
      await releaseClaim(db, key);
      return NextResponse.json({ error: "persist_failed" }, { status: 500 });
    }

    // Best-effort link so a FUTURE claim-lost reply can find this draft (persist.ts's
    // recordDraftOnLedger doc). A failure here is logged there, not fatal -- the draft is
    // real and already returned below; only a future duplicate lookup degrades (and, if it
    // stays unlinked past ORPHAN_CLAIM_MS, the H1 path above recovers it anyway).
    await recordDraftOnLedger(key, draftId);

    return NextResponse.json(
      {
        draft_id: draftId,
        preview_url: previewUrlFor(draftId),
        built_from: { recipe_key: recipeKey, address, transition_at: at },
      },
      { status: 200 },
    );
  } catch (e) {
    console.error(`[agent/build] build failed after claim("${key}"):`, e);
    await releaseClaim(db, key);
    return NextResponse.json({ error: "build_failed" }, { status: 500 });
  }
}
