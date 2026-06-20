import { test, expect, mock, beforeEach } from "bun:test";

// mintClaimToken hits the service-role DB — mock it and capture its args. Real
// planOpenProject (pure, reads zip fixtures) runs so the in-scope gate is exercised.
let mintArgs: unknown[][] = [];
mock.module("@/lib/claim/claim-store", () => ({
  mintClaimToken: async (...args: unknown[]) => {
    mintArgs.push(args);
    return "TOK123";
  },
}));

const { POST } = await import("./route");

function makeReq(body: unknown) {
  return new Request("http://localhost/api/prospect/open-project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as import("next/server").NextRequest;
}

beforeEach(() => {
  mintArgs = [];
});

test("in-scope zip → mints token (empty items, grounded title, brand+seed), returns /claim url", async () => {
  const res = await POST(
    makeReq({
      zip: "33931",
      brand: {
        primary: "#0a7",
        secondary: "#012",
        logo_url: "https://x/l.png",
        company_name: "Acme",
      },
    }),
  );
  expect(res.status).toBe(200);
  expect((await res.json()).url).toBe("/claim?t=TOK123");
  const [items, title, opts] = mintArgs[0] as [
    unknown[],
    string,
    { brand: unknown; seed: unknown },
  ];
  expect(items).toEqual([]);
  expect(title).toBe("Fort Myers Beach 33931");
  expect(opts.seed).toEqual({ template: "email", scopeKind: "zip", scopeValue: "33931" });
  expect(opts.brand).toEqual({
    primary: "#0a7",
    secondary: "#012",
    logo_url: "https://x/l.png",
    company_name: "Acme",
  });
});

test("out-of-scope zip → 422, no mint", async () => {
  const res = await POST(makeReq({ zip: "33101" }));
  expect(res.status).toBe(422);
  expect(mintArgs).toHaveLength(0);
});

test("missing zip → 422, no mint", async () => {
  const res = await POST(makeReq({}));
  expect(res.status).toBe(422);
  expect(mintArgs).toHaveLength(0);
});

test("garbage brand fields are dropped (only clean strings carried)", async () => {
  const res = await POST(
    makeReq({ zip: "34102", brand: { primary: 123, company_name: "Acme", junk: "x" } }),
  );
  expect(res.status).toBe(200);
  const [, , opts] = mintArgs[0] as [unknown[], string, { brand: Record<string, unknown> }];
  expect(opts.brand).toEqual({ company_name: "Acme" });
});
