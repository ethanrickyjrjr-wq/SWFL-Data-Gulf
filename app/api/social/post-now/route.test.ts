/**
 * app/api/social/post-now/route.test.ts
 *
 * Gate order under test (see task-4-brief.md): auth 403 → env presence 503 →
 * validatePostNow 400/413 → empty-post 400 → dedupe 409 → adapter → 502 on
 * failure → social_posts insert (best-effort) → 200.
 *
 * Auth uses the cookie-bound `@/utils/supabase/server` client (getUser only —
 * `social_posts` grants SELECT/INSERT to `service_role` only, verified live
 * 07/26/2026 via information_schema.role_table_grants, so the dedupe SELECT and
 * the publish INSERT go through `@/utils/supabase/service-role` instead). Both
 * modules + the adapter are mocked here, same style as
 * app/api/social/connect/[platform]/callback/route.test.ts.
 */
import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import { NextRequest } from "next/server";

const scenario: {
  user: { id: string; email: string | null } | null;
  dupeRows: { id: string }[];
  insertError: { message: string } | null;
} = {
  user: { id: "user-a", email: "operator@swfldatagulf.com" },
  dupeRows: [],
  insertError: null,
};

const captured: {
  postToBlueskyArgs?: unknown[];
  insertRow?: unknown;
  dedupeEq?: [string, unknown];
} = {};

let postToBlueskyResult: { ok: boolean; uri?: string; url?: string; error?: string } = {
  ok: true,
  uri: "at://did:plc:abc/app.bsky.feed.post/xyz",
  url: "https://bsky.app/profile/swfldatagulf.com/post/xyz",
};

mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
  }),
}));

mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (_table: string) => ({
      select: () => ({
        eq: (col: string, val: unknown) => {
          captured.dedupeEq = [col, val];
          return {
            gte: () => ({
              limit: async () => ({ data: scenario.dupeRows, error: null }),
            }),
          };
        },
      }),
      insert: async (row: unknown) => {
        captured.insertRow = row;
        return { error: scenario.insertError };
      },
    }),
  }),
}));

mock.module("@/lib/social/channels/bluesky", () => ({
  postToBluesky: async (...args: unknown[]) => {
    captured.postToBlueskyArgs = args;
    return postToBlueskyResult;
  },
}));

mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));

const { POST } = await import("./route");

const realEnv = { ...process.env };

function req(body: unknown) {
  return new NextRequest("https://www.swfldatagulf.com/api/social/post-now", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  scenario.user = { id: "user-a", email: "operator@swfldatagulf.com" };
  scenario.dupeRows = [];
  scenario.insertError = null;
  captured.postToBlueskyArgs = undefined;
  captured.insertRow = undefined;
  captured.dedupeEq = undefined;
  postToBlueskyResult = {
    ok: true,
    uri: "at://did:plc:abc/app.bsky.feed.post/xyz",
    url: "https://bsky.app/profile/swfldatagulf.com/post/xyz",
  };
  process.env.OPERATOR_EMAIL = "operator@swfldatagulf.com";
  process.env.BSKY_IDENTIFIER = "swfldatagulf.com";
  process.env.BSKY_APP_PASSWORD = "app-pw";
});

afterEach(() => {
  process.env = { ...realEnv };
});

test("non-operator session → 403 with a human-readable message", async () => {
  scenario.user = { id: "user-b", email: "not-operator@example.com" };
  const res = await POST(req({ caption: "hello" }));
  expect(res.status).toBe(403);
  const json = await res.json();
  expect(json.error).toBe("Only the site operator can post.");
  expect(captured.postToBlueskyArgs).toBeUndefined();
});

test("OPERATOR_EMAIL unset (fail closed), even with a session email → 403", async () => {
  delete process.env.OPERATOR_EMAIL;
  const res = await POST(req({ caption: "hello" }));
  expect(res.status).toBe(403);
  expect(captured.postToBlueskyArgs).toBeUndefined();
});

test("operator email differs only by case/whitespace from session email → still passes", async () => {
  process.env.OPERATOR_EMAIL = "  Operator@SWFLDataGulf.com  ";
  scenario.user = { id: "user-a", email: "operator@swfldatagulf.com" };
  const res = await POST(req({ caption: "Case-insensitive operator match" }));
  expect(res.status).toBe(200);
});

test("OPERATOR_EMAIL set to whitespace-only → still 403 (fail closed, not an accidental pass)", async () => {
  process.env.OPERATOR_EMAIL = "   ";
  const res = await POST(req({ caption: "hello" }));
  expect(res.status).toBe(403);
  expect(captured.postToBlueskyArgs).toBeUndefined();
});

test("operator + missing BSKY_APP_PASSWORD → 503 'Bluesky not configured'", async () => {
  delete process.env.BSKY_APP_PASSWORD;
  const res = await POST(req({ caption: "hello" }));
  expect(res.status).toBe(503);
  const json = await res.json();
  expect(json.error).toBe("Bluesky not configured");
  expect(captured.postToBlueskyArgs).toBeUndefined();
});

test("301-grapheme caption → 400", async () => {
  const res = await POST(req({ caption: "a".repeat(301) }));
  expect(res.status).toBe(400);
  expect(captured.postToBlueskyArgs).toBeUndefined();
});

test("empty caption AND no image → 400 'nothing to post'", async () => {
  const res = await POST(req({ caption: "" }));
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error).toContain("nothing to post");
  expect(captured.postToBlueskyArgs).toBeUndefined();
});

test("operator + valid input → calls postToBluesky once and returns its url", async () => {
  const res = await POST(req({ caption: "Market update for Cape Coral" }));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json).toEqual({
    ok: true,
    url: "https://bsky.app/profile/swfldatagulf.com/post/xyz",
    uri: "at://did:plc:abc/app.bsky.feed.post/xyz",
  });
  expect(captured.postToBlueskyArgs).toBeDefined();
  // postToBluesky(input, cred)
  const [input, cred] = captured.postToBlueskyArgs as [
    { caption: string; image?: unknown },
    { identifier: string; appPassword: string },
  ];
  expect(input.caption).toBe("Market update for Cape Coral");
  expect(cred).toEqual({ identifier: "swfldatagulf.com", appPassword: "app-pw" });
  expect(captured.insertRow).toBeDefined();
});

test("identical payload again within the dedupe window → 409 with a human-readable message, no adapter call", async () => {
  scenario.dupeRows = [{ id: "existing-post-1" }];
  const res = await POST(req({ caption: "Market update for Cape Coral" }));
  expect(res.status).toBe(409);
  const json = await res.json();
  expect(json.error).toBe("Same caption and image were already posted in the last 10 minutes.");
  expect(captured.postToBlueskyArgs).toBeUndefined();
});

test("valid aspectRatio in the body is forwarded to postToBluesky's image.aspectRatio", async () => {
  const res = await POST(
    req({
      caption: "Card with aspect ratio",
      imageDataUrl: "data:image/png;base64,aGVsbG8=",
      aspectRatio: { width: 1080, height: 1350 },
    }),
  );
  expect(res.status).toBe(200);
  const [input] = captured.postToBlueskyArgs as [{ image?: { aspectRatio?: unknown } }];
  expect(input.image?.aspectRatio).toEqual({ width: 1080, height: 1350 });
});

test("malformed aspectRatio (non-integer) is dropped, never a 400", async () => {
  const res = await POST(
    req({
      caption: "Card with bad aspect ratio",
      imageDataUrl: "data:image/png;base64,aGVsbG8=",
      aspectRatio: { width: 1080.5, height: -1 },
    }),
  );
  expect(res.status).toBe(200);
  const [input] = captured.postToBlueskyArgs as [{ image?: { aspectRatio?: unknown } }];
  expect(input.image?.aspectRatio).toBeUndefined();
});

test("adapter { ok: false } → 502 with the same error string", async () => {
  postToBlueskyResult = { ok: false, error: "Bluesky createRecord failed (400): rate limited" };
  const res = await POST(req({ caption: "Another distinct caption" }));
  expect(res.status).toBe(502);
  const json = await res.json();
  expect(json).toEqual({ ok: false, error: "Bluesky createRecord failed (400): rate limited" });
  // Adapter failed → never persisted.
  expect(captured.insertRow).toBeUndefined();
});

test("posted ok but social_posts insert fails → still 200 (logged, not fatal)", async () => {
  scenario.insertError = { message: "db unavailable" };
  const errSpy = mock(() => {});
  const realConsoleError = console.error;
  console.error = errSpy;
  try {
    const res = await POST(req({ caption: "Yet another distinct caption" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(errSpy).toHaveBeenCalled();
  } finally {
    console.error = realConsoleError;
  }
});
