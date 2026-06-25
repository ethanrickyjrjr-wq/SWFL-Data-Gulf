import { test, expect, mock, beforeEach, afterEach } from "bun:test";

// We test the client by mocking global fetch.
// The test spies on pagination: after two full pages, the third page is empty
// and the client should stop and return all items.

const makeFetchMock = (pages: unknown[][]) => {
  let call = 0;
  return mock(async (_url: string, _opts: unknown) => {
    const page = pages[call++] ?? [];
    return {
      ok: true,
      json: async () => ({ value: page }),
    };
  });
};

let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

test("paginates until an empty page is returned", async () => {
  process.env.RESO_BASE_URL_SWFL_MLS = "https://sandbox.example.com";
  process.env.RESO_TOKEN_SWFL_MLS = "tok-test";

  const items200 = Array.from({ length: 200 }, (_, i) => ({ ListingKey: `K${i}` }));
  const items50 = Array.from({ length: 50 }, (_, i) => ({ ListingKey: `L${i}` }));
  global.fetch = makeFetchMock([items200, items50]) as typeof fetch;

  const { ResoClient } = await import("./client");
  const client = new ResoClient("swfl_mls");
  const results = await client.get("Property", { $select: "ListingKey" });

  expect(results.length).toBe(250);
});

test("throws on non-ok HTTP response", async () => {
  process.env.RESO_BASE_URL_SWFL_MLS = "https://sandbox.example.com";
  process.env.RESO_TOKEN_SWFL_MLS = "tok-test";

  global.fetch = mock(async () => ({
    ok: false,
    status: 401,
    text: async () => "Unauthorized",
  })) as typeof fetch;

  const { ResoClient } = await import("./client");
  const client = new ResoClient("swfl_mls");
  await expect(client.get("Property", {})).rejects.toThrow("401");
});

test("throws when env vars are missing for a board", async () => {
  delete process.env.RESO_BASE_URL_NABOR;
  delete process.env.RESO_TOKEN_NABOR;

  const { ResoClient } = await import("./client");
  expect(() => new ResoClient("nabor")).toThrow("env vars not configured");
});
