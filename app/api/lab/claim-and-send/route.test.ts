// app/api/lab/claim-and-send/route.test.ts
//
// CAN-SPAM footer address: withSelfSendFooter must carry the REAL resolved
// postal address (account brand profile), never the hardcoded "Fort Myers, FL"
// placeholder — same floor app/api/deliverables/[id]/blast/route.ts already
// enforces via resolvePostalAddress. Two failure modes:
//   1. a real business_address exists → it must appear in the sent HTML, and
//      the platform's own placeholder city must NOT appear.
//   2. no address exists anywhere → the route must never invent one; it skips
//      the send (sent:false, capture already saved) rather than fabricate a
//      compliance-critical field.

import { test, expect, mock, beforeEach } from "bun:test";

process.env.DIGEST_SENDER_ADDRESS = "hello@swfldatagulf.com";
process.env.DIGEST_SENDER_NAME = "SWFL Data Gulf";

const scenario: {
  user: { id: string; email: string } | null;
  brandProfile: { business_address: string | null } | null;
} = {
  user: { id: "user-a", email: "user@example.com" },
  brandProfile: null,
};

let sendCalls: Array<{ html: string; to: string[] }> = [];

mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
    from: (table: string) => {
      if (table === "projects") {
        return { insert: async () => ({ error: null }) };
      }
      if (table === "user_brand_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: scenario.brandProfile, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "deliverables") return { insert: async () => ({ error: null }) };
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

mock.module("next/headers", () => ({ cookies: async () => ({}) }));

mock.module("@/lib/email/render-email-doc", () => ({
  renderEmailDocHtml: async () => "<html><body><h1>Doc</h1></body></html>",
}));

mock.module("@/lib/email/marketing-client", () => ({
  getMarketingResend: () => ({
    emails: {
      send: async (payload: { html: string; to: string[] }) => {
        sendCalls.push(payload);
        return { error: null, data: { id: "email-1" } };
      },
    },
  }),
}));

mock.module("@/lib/email/usage", () => ({
  checkUsageLimit: async () => ({ allowed: true, tier: "free", sent: 0, limit: 10 }),
  recordEmailSent: async () => {},
}));

mock.module("@/lib/project/apply-brand", () => ({
  applyUserBrandToProject: async () => {},
}));

mock.module("@/lib/project/activity", () => ({
  logActivity: async () => {},
}));

mock.module("@/lib/prospects/arrival-event", () => ({
  logClaimed: async () => {},
}));

const { POST } = await import("./route");

const validDoc = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "MODERN_SANS",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
  },
  blocks: [{ type: "header", props: { companyName: "Acme" } }],
};

function makeReq(body: unknown) {
  return new Request("http://localhost/api/lab/claim-and-send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as import("next/server").NextRequest;
}

beforeEach(() => {
  scenario.user = { id: "user-a", email: "user@example.com" };
  scenario.brandProfile = null;
  sendCalls = [];
});

test("real business_address on the brand profile → footer carries it, never the hardcoded placeholder", async () => {
  scenario.brandProfile = { business_address: "500 Gulf Shore Blvd, Naples, FL 34102" };
  const res = await POST(makeReq({ doc: validDoc }));
  expect(res.status).toBe(201);
  expect((await res.json()).sent).toBe(true);
  expect(sendCalls).toHaveLength(1);
  expect(sendCalls[0].html).toContain("500 Gulf Shore Blvd, Naples, FL 34102");
  expect(sendCalls[0].html).not.toContain("Fort Myers, FL");
});

test("no address anywhere → send is skipped, never fabricates the platform's placeholder city", async () => {
  scenario.brandProfile = null;
  const res = await POST(makeReq({ doc: validDoc }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.sent).toBe(false);
  expect(body.projectId).toBeTruthy(); // capture still succeeded
  expect(sendCalls).toHaveLength(0); // never sent a fabricated-address email
});

test("blank-only business_address → treated as absent, no send", async () => {
  scenario.brandProfile = { business_address: "   " };
  const res = await POST(makeReq({ doc: validDoc }));
  expect((await res.json()).sent).toBe(false);
  expect(sendCalls).toHaveLength(0);
});
