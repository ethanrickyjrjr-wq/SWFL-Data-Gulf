import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import type { NextRequest } from "next/server";
import { issueContactImportToken } from "../contact-import-token";

/**
 * ROUTE-LEVEL single-use replay proof for POST /api/email/contacts/phone
 * (check `contacts_singleuse_replay_e2e_test`).
 *
 * The unit tests next door prove token integrity/TTL; THIS file proves the
 * route's replay posture end-to-end: the real handler runs the real
 * `verifyContactImportToken` and the real `claimOnce` upsert flow against an
 * in-memory ledger that mirrors the UNIQUE(idempotency_key) semantics of
 * `email_send_ledger` (first insert returns a row, duplicate returns none).
 * Only true side effects are intercepted: the Supabase client factory, the
 * contact upsert, and the Resend audience sync.
 *
 * LEAK GUARD: bun's mock.module is process-global for the whole `bun test`
 * run, so each mock spreads the REAL module and delegates to it whenever this
 * file's tests aren't active — other test files see unchanged behavior (the
 * naive version broke upsert-contacts.test.ts by dropping `mergeContact`).
 */

// ── In-memory UNIQUE(idempotency_key) ledger ────────────────────────────────
const ledger = new Map<string, Record<string, unknown>>();

function makeFakeSupabase() {
  return {
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>, _opts: unknown) {
          return {
            select(_cols: string) {
              if (table !== "email_send_ledger") {
                return Promise.resolve({ data: [], error: null });
              }
              const key = String(row.idempotency_key);
              // ON CONFLICT DO NOTHING: an existing key inserts nothing and
              // returns zero rows — exactly what claimOnce treats as "lost".
              if (ledger.has(key)) return Promise.resolve({ data: [], error: null });
              ledger.set(key, row);
              return Promise.resolve({ data: [{ id: ledger.size }], error: null });
            },
          };
        },
      };
    },
  };
}

const upsertCalls: Array<{ uid: string; rows: unknown[] }> = [];

// Real modules first, so the mocks can delegate transparently when inactive.
const realServiceRole = await import("../../../utils/supabase/service-role");
const realUpsert = await import("../upsert-contacts");
const realAudience = await import("../audience-sync");
const realMarketing = await import("../marketing-client");

// Snapshot the real implementations into stable consts BEFORE mock.module runs.
// bun's mock.module (1.3.14) mutates the module namespace object IN PLACE, so a
// later `realAudience.syncUserAudiences` reference resolves to the MOCK itself —
// the inactive fall-through then delegates to itself and overflows the stack
// ("Maximum call stack size exceeded"). Because the mock is process-global, that
// recursion leaks to any other test file that touches these modules while this
// file is inactive (the intermittent syncUserAudiences RangeError). Binding the
// real fn to a const here captures a reference the in-place mutation can't clobber;
// the `...realX` spreads stay correct because the factory runs before the swap.
const realCreateServiceRoleClient = realServiceRole.createServiceRoleClient;
const realUpsertContacts = realUpsert.upsertContacts;
const realSyncUserAudiences = realAudience.syncUserAudiences;
const realGetMarketingResend = realMarketing.getMarketingResend;

let active = false;

mock.module("@/utils/supabase/service-role", () => ({
  ...realServiceRole,
  createServiceRoleClient: () =>
    active
      ? (makeFakeSupabase() as unknown as ReturnType<
          typeof realServiceRole.createServiceRoleClient
        >)
      : realCreateServiceRoleClient(),
}));
mock.module("@/lib/email/upsert-contacts", () => ({
  ...realUpsert,
  upsertContacts: async (
    db: Parameters<typeof realUpsert.upsertContacts>[0],
    uid: string,
    rows: Parameters<typeof realUpsert.upsertContacts>[2],
  ) => {
    if (!active) return realUpsertContacts(db, uid, rows);
    upsertCalls.push({ uid, rows: [...rows] });
    return { inserted: rows.length, updated: 0, skipped: 0 };
  },
}));
mock.module("@/lib/email/audience-sync", () => ({
  ...realAudience,
  syncUserAudiences: async (...args: Parameters<typeof realAudience.syncUserAudiences>) =>
    active ? undefined : realSyncUserAudiences(...args),
}));
mock.module("@/lib/email/marketing-client", () => ({
  ...realMarketing,
  getMarketingResend: () =>
    active ? ({} as ReturnType<typeof realMarketing.getMarketingResend>) : realGetMarketingResend(),
}));

// Import AFTER the mocks so the route binds the wrappers.
const { POST } = await import("../../../app/api/email/contacts/phone/route");

beforeAll(() => {
  process.env.SDG_COOKIE_SECRET = "test-secret-for-contact-import-token";
  active = true;
});
afterAll(() => {
  active = false; // later test files hit the real modules through the wrappers
});

function post(body: unknown): Promise<Response> {
  const req = new Request("http://localhost/api/email/contacts/phone", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as NextRequest);
}

const CONTACTS = [{ email: "buyer@example.com", name: "Buyer" }];

describe("POST /api/email/contacts/phone — single-use replay", () => {
  test("first use of a token imports (200) and claims its nid in the ledger", async () => {
    const token = issueContactImportToken({ uid: "user-1", workOnly: false })!;
    const res = await post({ token, contacts: CONTACTS });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { imported: number };
    expect(json.imported).toBe(1);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].uid).toBe("user-1");
    expect([...ledger.keys()].some((k) => k.startsWith("contact-import:"))).toBe(true);
  });

  test("REPLAY of the same token is rejected 409 with zero writes", async () => {
    const token = issueContactImportToken({ uid: "user-2", workOnly: false })!;
    const first = await post({ token, contacts: CONTACTS });
    expect(first.status).toBe(200);
    const writesAfterFirst = upsertCalls.length;

    const replay = await post({ token, contacts: CONTACTS });
    expect(replay.status).toBe(409);
    const json = (await replay.json()) as { error: string };
    expect(json.error).toBe("token_already_used");
    // The claim is lost BEFORE the contact write — replay must not touch contacts.
    expect(upsertCalls).toHaveLength(writesAfterFirst);
  });

  test("a fresh token still works after a replay rejection (claim is per-nid, not per-user)", async () => {
    const uid = "user-3";
    const burned = issueContactImportToken({ uid, workOnly: false })!;
    await post({ token: burned, contacts: CONTACTS });
    const replay = await post({ token: burned, contacts: CONTACTS });
    expect(replay.status).toBe(409);

    const fresh = issueContactImportToken({ uid, workOnly: false })!;
    const res = await post({ token: fresh, contacts: CONTACTS });
    expect(res.status).toBe(200);
  });

  test("a tampered token is 401 before any claim or write", async () => {
    const token = issueContactImportToken({ uid: "user-4", workOnly: false })!;
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ v: 1, uid: "attacker", wo: 0, iat: Date.now(), nid: "forged-nid" }),
    ).toString("base64url");
    const ledgerBefore = ledger.size;
    const writesBefore = upsertCalls.length;

    const res = await post({ token: `${forged}.${sig}`, contacts: CONTACTS });
    expect(res.status).toBe(401);
    expect(ledger.size).toBe(ledgerBefore);
    expect(upsertCalls).toHaveLength(writesBefore);
    // Sanity: the untampered original still round-trips.
    expect(payload.length).toBeGreaterThan(0);
  });
});
