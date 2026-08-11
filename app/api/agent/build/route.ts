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
// TOKEN-OWNER CONSEQUENCE FOR TASK 6 (found during this task's recon, not a code change):
// findProjectId scopes the project search to requireScope's own userId -- the OWNER of the
// agent_build bearer token making this call. A demo-account rehearsal (Task 6 Step 4,
// "draft visible in demo project") therefore needs an agent_build token MINTED UNDER THE
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
import {
  findProjectId,
  insertDraft,
  recordDraftOnLedger,
  lookupDuplicateDraft,
} from "@/lib/agent-build/persist";

export const runtime = "nodejs";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com";

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

// The real ingest pipeline's to_state vocabulary (traced pipeline.py:65-70 / transitions.py
// during Task 4 -- every scanned row is state="active"; the only OTHER values ever written
// are holding/sold/withdrawn). Mirrors app/api/agent-feed/test-inject/route.ts's
// VALID_TO_STATES verbatim -- one authority for this vocabulary would be better than two
// copies, but the sibling module is not exported for reuse; noted, not fixed here.
const VALID_TO_STATES = new Set(["active", "holding", "sold", "withdrawn"]);
const VALID_SALE_OR_RENT = new Set(["sale", "rent"]);

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

  const address = typeof record.address === "string" ? record.address.trim() : "";
  if (!address) return badRequest("missing_field:address");

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
  // header comment's Task-6 note) -- never searched across every account.
  const projectId = await findProjectId(scoped.userId, address);
  if (!projectId) {
    return NextResponse.json({ error: "no_matching_project" }, { status: 404 });
  }

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
    if (!dup) {
      // Not corruption -- the far more common cause is a genuine race: the WINNING call is
      // still mid-build (resolveSubject + the narrator can take seconds) and has not linked
      // its draft to the ledger row yet. The cursor does not advance on a non-200, so Hermes
      // retries and, by then, the winner has almost always finished.
      return NextResponse.json({ error: "duplicate_pending" }, { status: 500 });
    }
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
      projectId,
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
    // real and already returned below.
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
