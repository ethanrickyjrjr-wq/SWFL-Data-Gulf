// POST /api/agent-feed/test-inject -- Task 4, hermes-email-driver spec (2026-08-10), Piece 2.
// The "fake test runs" lane (design decision 6): creates a SYNTHETIC transition scoped to
// the demo account so every recipe can be rehearsed end-to-end on demand. Only the EVENT is
// fake -- writes ONLY public.agent_feed_test_events, NEVER data_lake.listing_transitions
// (Global Constraint, plan.md line 16); the downstream build still runs real lake data
// through the real gates.
//
// TWO guards, both load-bearing:
//   1. STRICT SCHEMA (failure mode 4 -- "Hermes local model invents content or numbers,
//      happened 08/09"): the body allows ONLY address, sale_or_rent?, from_state?, to_state,
//      price_delta?, at? -- any other key is rejected 400 before anything else runs. Free
//      text (a `prose` field, say) can never reach this seam.
//   2. DEMO-ACCOUNT SCOPING (failure mode 3/7b -- "fake event leaking to a real account"):
//      the posted address must belong to the demo account's OWN saved listing projects,
//      verified SERVER-SIDE via lib/agent-feed/test-inject-source.ts's isDemoScopedAddress
//      -- the caller's claim about which account an address belongs to is never trusted.
//      403 on any miss, before any write.
import { NextResponse } from "next/server";
import { requireScope } from "@/lib/api-tokens/scopes";
import {
  isDemoScopedAddress,
  insertTestEvent,
  normalizedAddressKey,
} from "@/lib/agent-feed/test-inject-source";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set([
  "address",
  "sale_or_rent",
  "from_state",
  "to_state",
  "price_delta",
  "at",
]);

// Real to_state vocabulary the ingest pipeline actually writes (RULE 0.5 -- read
// ingest/pipelines/listing_lifecycle/transitions.py before allowlisting a single value here,
// never invented from the plan's shorthand). Task 6's plan doc names to_state values
// (new/pending/under_contract/sold/back_on_market) that read like recipe-selection shorthand,
// not the literal strings the diff engine writes -- verified against transitions.py directly:
//   - _LIVE_STATES = {"active","new","coming_soon","back_on_market"} (line 22).
//   - SOLD="sold", WITHDRAWN="withdrawn", HOLDING="holding" (lines 135-137) -- HOLDING is the
//     one ambiguous-departure state (a listing left the active market; sold/pending/withdrawn
//     is unresolved until the off-market hook probes it), not "pending" or "gone".
//   - A price cut/raise is represented by an UNCHANGED to_state (e.g. "active"->"active")
//     carrying a non-null price_delta (transitions.py lines 63-72) -- "price_reduced" is
//     NEVER itself a to_state value; Task 6's price_delta<0 recipe rule reads price_delta,
//     not this field.
//   - "pending"/"contingent"/"under_contract"/"withdrawn"/"delisted" etc. (extract_api.py
//     PENDING_STATUSES/OFF_MARKET_STATUSES, lines 88-94) are RAW VENDOR statuses the internal
//     sold-capture resolver matches against to decide whether a "holding" row resolves to
//     sold/withdrawn -- they are never written to listing_transitions.to_state itself.
const VALID_TO_STATES = new Set([
  "new",
  "active",
  "coming_soon",
  "back_on_market",
  "holding",
  "sold",
  "withdrawn",
]);

// sale_or_rent vocabulary: the current lifecycle pipeline only ever writes "sale"
// (ingest/pipelines/listing_lifecycle/extract.py:144 -- "Source B is for-sale only -- no
// rent class exists"; extract_api.py:185 hardcodes "sale" too), but the column itself
// (address_key.py:5, the migration's own default) treats sale_or_rent as a real two-value
// category -- "rent" is a legitimate future value, not an invented one.
const VALID_SALE_OR_RENT = new Set(["sale", "rent"]);

function badRequest(error: string): Response {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(req: Request) {
  const scoped = await requireScope(req, "agent_test_inject");
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

  // Schema-reject any extra/unknown field BEFORE anything else runs (FM4).
  const extra = Object.keys(record).filter((k) => !ALLOWED_FIELDS.has(k));
  if (extra.length > 0) return badRequest(`unknown_field:${extra.join(",")}`);

  const address = typeof record.address === "string" ? record.address.trim() : "";
  if (!address) return badRequest("missing_field:address");

  const toState = typeof record.to_state === "string" ? record.to_state.trim() : "";
  if (!toState) return badRequest("missing_field:to_state");
  if (!VALID_TO_STATES.has(toState)) {
    return badRequest(`invalid_field:to_state`);
  }

  if ("sale_or_rent" in record && typeof record.sale_or_rent !== "string") {
    return badRequest("invalid_field:sale_or_rent");
  }
  const saleOrRent = typeof record.sale_or_rent === "string" ? record.sale_or_rent : "sale";
  if (!VALID_SALE_OR_RENT.has(saleOrRent)) {
    return badRequest(`invalid_field:sale_or_rent`);
  }
  if (
    "from_state" in record &&
    record.from_state !== null &&
    typeof record.from_state !== "string"
  ) {
    return badRequest("invalid_field:from_state");
  }
  if (
    "price_delta" in record &&
    record.price_delta !== null &&
    typeof record.price_delta !== "number"
  ) {
    return badRequest("invalid_field:price_delta");
  }
  if ("at" in record && typeof record.at !== "string") {
    return badRequest("invalid_field:at");
  }

  // DEMO-ACCOUNT SCOPING -- server-verified, never trusted from the caller (FM3/7b).
  const allowed = await isDemoScopedAddress(address);
  if (!allowed) {
    return NextResponse.json({ error: "address not in demo projects" }, { status: 403 });
  }

  const id = await insertTestEvent({
    address,
    address_key: normalizedAddressKey(address),
    sale_or_rent: saleOrRent,
    from_state: typeof record.from_state === "string" ? record.from_state : null,
    to_state: toState,
    price_delta: typeof record.price_delta === "number" ? record.price_delta : null,
    ...(typeof record.at === "string" ? { at: record.at } : {}),
    created_by: scoped.userId,
  });

  if (id == null) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ id }, { status: 201 });
}
