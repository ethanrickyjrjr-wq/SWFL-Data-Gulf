// app/api/agent/build/route.test.ts
// Guards Task 5 (hermes-email-driver spec 2026-08-10): strict schema rejection (FM4), the
// recipe_key allowlist, the real to_state/sale_or_rent vocabulary, wrong-scope passthrough,
// the happy-path build+persist call shape, claimOnce's exact idempotency key + ctx.kind
// ("agent-build"), and the claim-lost duplicate reply. Mirrors
// app/api/agent-feed/test-inject/route.test.ts's mock.module-wholesale style: every
// collaborator module is stubbed, this file never touches a real Supabase client.
//
// normalizedAddressKey is DELIBERATELY left real (not mocked) -- it is pure, makes no
// network call (address-key.ts is plain string math; the module's own Supabase client lives
// inside separate exported functions this route never calls), and the "claimOnce called with
// the exact key" assertions below would be tautological against a stubbed identity function.
import { describe, expect, test, mock } from "bun:test";

let scopeResult: { userId: string } | Response = { userId: "hermes-1" };
let projectIdResult: string | null = "proj-1";
let claimResult: boolean | Error = true;
let claimCalls: { key: string; ctx: unknown }[] = [];
let releaseCalls: string[] = [];
let resolveSubjectResult: { facts: unknown; resolved: boolean } = {
  facts: { address: "1275 Carlene Ave, Fort Myers, FL 33901", zip: "33901", photos: [] },
  resolved: true,
};
let recipeResult: unknown = { key: "just-sold" };
let builderResult: unknown = { blocks: [], globalStyle: {} };
let builderCalls: unknown[] = [];
let insertDraftResult: string | null = "draft-1";
let insertDraftCalls: unknown[] = [];
let recordDraftCalls: { key: string; draftId: string }[] = [];
let duplicateResult: { draftId: string; recipeKey: string | null } | null = null;

mock.module("@/lib/api-tokens/scopes", () => ({
  requireScope: async () => scopeResult,
}));
mock.module("@/lib/email/idempotency", () => ({
  claimOnce: async (_db: unknown, key: string, ctx: unknown) => {
    claimCalls.push({ key, ctx });
    if (claimResult instanceof Error) throw claimResult;
    return claimResult;
  },
  releaseClaim: async (_db: unknown, key: string) => {
    releaseCalls.push(key);
  },
}));
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({}),
  // test-inject-source.ts (real, not mocked -- see file header) imports this too for its
  // OTHER exports; normalizedAddressKey itself never calls it, but the module-level import
  // must resolve or bun's mock.module wholesale-replace breaks the whole module load.
  createServiceRoleClientUntyped: () => ({}),
}));
mock.module("@/lib/deliverable/recipes/shared", () => ({
  resolveSubject: async () => resolveSubjectResult,
}));
mock.module("@/lib/deliverable/recipes", () => ({
  recipeByKey: (key: string) => (recipeResult ? { key, ...(recipeResult as object) } : null),
}));
mock.module("@/lib/deliverable/recipes/index", () => ({
  builderFor: (_key: string) =>
    builderResult === "MISSING"
      ? null
      : async (ctx: unknown) => {
          builderCalls.push(ctx);
          return builderResult === "NULL" ? null : builderResult;
        },
}));
mock.module("@/lib/email/doc/default-docs", () => ({
  defaultDoc: () => ({ blocks: [], globalStyle: {} }),
}));
mock.module("@/lib/agent-build/persist", () => ({
  findProjectId: async (_userId: string, _address: string) => projectIdResult,
  insertDraft: async (input: unknown) => {
    insertDraftCalls.push(input);
    return insertDraftResult;
  },
  recordDraftOnLedger: async (key: string, draftId: string) => {
    recordDraftCalls.push({ key, draftId });
    return true;
  },
  lookupDuplicateDraft: async (_key: string) => duplicateResult,
}));

const { POST } = await import("./route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/agent/build", {
    method: "POST",
    headers: { authorization: "Bearer sdg_x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function resetState() {
  scopeResult = { userId: "hermes-1" };
  projectIdResult = "proj-1";
  claimResult = true;
  claimCalls = [];
  releaseCalls = [];
  resolveSubjectResult = {
    facts: { address: "1275 Carlene Ave, Fort Myers, FL 33901", zip: "33901", photos: [] },
    resolved: true,
  };
  recipeResult = { key: "just-sold" };
  builderResult = { blocks: [], globalStyle: {} };
  builderCalls = [];
  insertDraftResult = "draft-1";
  insertDraftCalls = [];
  recordDraftCalls = [];
  duplicateResult = null;
}

const VALID_BODY = {
  recipe_key: "just-sold",
  address: "1275 Carlene Ave, Fort Myers, FL 33901",
  sale_or_rent: "sale",
  to_state: "sold",
  at: "2026-08-10T12:00:00.000Z",
};

describe("POST /api/agent/build", () => {
  test("extra field -> 400, never claims", async () => {
    resetState();
    const res = await POST(req({ ...VALID_BODY, prose: "hi" }));
    expect(res.status).toBe(400);
    expect(claimCalls.length).toBe(0);
  });

  test("unknown recipe_key -> 400, never claims", async () => {
    resetState();
    const res = await POST(req({ ...VALID_BODY, recipe_key: "agent-launch" }));
    expect(res.status).toBe(400);
    expect(claimCalls.length).toBe(0);
  });

  test("recipe_key not in RECIPE_KEYS at all -> 400", async () => {
    resetState();
    const res = await POST(req({ ...VALID_BODY, recipe_key: "not-a-real-key" }));
    expect(res.status).toBe(400);
  });

  test("invalid to_state -> 400, never claims", async () => {
    resetState();
    const res = await POST(req({ ...VALID_BODY, to_state: "pending" }));
    expect(res.status).toBe(400);
    expect(claimCalls.length).toBe(0);
  });

  test("invalid sale_or_rent -> 400, never claims", async () => {
    resetState();
    const res = await POST(req({ ...VALID_BODY, sale_or_rent: "lease" }));
    expect(res.status).toBe(400);
    expect(claimCalls.length).toBe(0);
  });

  test("missing address -> 400", async () => {
    resetState();
    const { address: _address, ...rest } = VALID_BODY;
    const res = await POST(req(rest));
    expect(res.status).toBe(400);
  });

  test("unparseable at -> 400, never claims", async () => {
    resetState();
    const res = await POST(req({ ...VALID_BODY, at: "not-a-date" }));
    expect(res.status).toBe(400);
    expect(claimCalls.length).toBe(0);
  });

  test("wrong scope -> 403 passthrough from requireScope, never claims", async () => {
    resetState();
    scopeResult = new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(403);
    expect(claimCalls.length).toBe(0);
  });

  test("no matching project for this token's owner -> 404, never claims", async () => {
    resetState();
    projectIdResult = null;
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(404);
    expect(claimCalls.length).toBe(0);
  });

  test("happy path: 200 with draft_id + built_from, claimOnce called with the exact key and kind agent-build", async () => {
    resetState();
    const res = await POST(req(VALID_BODY));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      draft_id: "draft-1",
      preview_url: expect.stringContaining("/p/draft-1"),
      built_from: {
        recipe_key: "just-sold",
        address: VALID_BODY.address,
        transition_at: VALID_BODY.at,
      },
    });
    expect(claimCalls.length).toBe(1);
    // The key is address_key:sale_or_rent:to_state:at -- assert the literal computed value
    // via the REAL normalizedAddressKey (not mocked, see file header) rather than
    // re-deriving it by hand, so this test breaks if the route's key format ever drifts.
    const { normalizedAddressKey } = await import("@/lib/agent-feed/test-inject-source");
    expect(claimCalls[0].key).toBe(
      `agent-build:${normalizedAddressKey(VALID_BODY.address)}:sale:sold:${VALID_BODY.at}`,
    );
    expect(claimCalls[0].ctx).toMatchObject({ userId: "hermes-1", kind: "agent-build" });
    expect(insertDraftCalls.length).toBe(1);
    expect(insertDraftCalls[0]).toMatchObject({
      projectId: "proj-1",
      userId: "hermes-1",
      recipeKey: "just-sold",
    });
    expect(recordDraftCalls.length).toBe(1);
    expect(recordDraftCalls[0]).toMatchObject({ draftId: "draft-1" });
    expect(builderCalls.length).toBe(1);
  });

  test("replay same body: claim lost -> 200 duplicate:true, same draft_id, build never re-runs", async () => {
    resetState();
    claimResult = false;
    duplicateResult = { draftId: "draft-1", recipeKey: "just-sold" };
    const res = await POST(req(VALID_BODY));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      draft_id: "draft-1",
      preview_url: expect.stringContaining("/p/draft-1"),
      built_from: {
        recipe_key: "just-sold",
        address: VALID_BODY.address,
        transition_at: VALID_BODY.at,
      },
      duplicate: true,
    });
    expect(builderCalls.length).toBe(0);
    expect(insertDraftCalls.length).toBe(0);
  });

  test("claim lost and no linked draft yet (genuine race) -> 500 duplicate_pending, never fabricates a draft", async () => {
    resetState();
    claimResult = false;
    duplicateResult = null;
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(500);
    const bodyJson = await res.json();
    expect(bodyJson.error).toBe("duplicate_pending");
  });

  test("build-failure-after-claim: builder returns null -> releases claim, 500, no draft persisted", async () => {
    resetState();
    builderResult = "NULL";
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(500);
    expect(releaseCalls.length).toBe(1);
    expect(releaseCalls[0]).toBe(claimCalls[0].key);
    expect(insertDraftCalls.length).toBe(0);
  });

  test("build-failure-after-claim: recipe/builder not registered -> releases claim, 500", async () => {
    resetState();
    builderResult = "MISSING";
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(500);
    expect(releaseCalls.length).toBe(1);
  });

  test("build-failure-after-claim: resolveSubject throws -> releases claim, 500, no draft persisted", async () => {
    resetState();
    mock.module("@/lib/deliverable/recipes/shared", () => ({
      resolveSubject: async () => {
        throw new Error("boom");
      },
    }));
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(500);
    expect(releaseCalls.length).toBe(1);
    expect(insertDraftCalls.length).toBe(0);
    // restore for subsequent tests
    mock.module("@/lib/deliverable/recipes/shared", () => ({
      resolveSubject: async () => resolveSubjectResult,
    }));
  });

  test("build-failure-after-claim: persist fails -> releases claim, 500", async () => {
    resetState();
    insertDraftResult = null;
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(500);
    expect(releaseCalls.length).toBe(1);
  });
});
