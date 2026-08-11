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
// L4 fix (hermes-email-driver review round): this vocabulary used to be defined locally
// here AND duplicated in app/api/agent/build/route.ts. Extracted to ONE authority,
// lib/agent-feed/event-vocab.ts -- both routes import it. Full provenance (which ingest
// source file/line justifies each value) now lives in that module's header comment.
import {
  VALID_TO_STATES,
  VALID_FROM_STATES,
  VALID_SALE_OR_RENT,
} from "@/lib/agent-feed/event-vocab";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set([
  "address",
  "sale_or_rent",
  "from_state",
  "to_state",
  "price_delta",
  "at",
]);

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
  // NULL is the deliberate new-listing signal (see event-vocab.ts's header) -- only a
  // present, NON-NULL from_state is checked against the vocabulary.
  if ("from_state" in record && record.from_state !== null) {
    if (typeof record.from_state !== "string" || !VALID_FROM_STATES.has(record.from_state)) {
      return badRequest("invalid_field:from_state");
    }
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
