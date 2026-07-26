/**
 * lib/social/channels/bluesky.test.ts
 *
 * Mocked-fetch adapter test — mirrors the globalThis.fetch stub + afterEach
 * restore pattern from app/api/social/connect/[platform]/callback/route.test.ts.
 * No real network calls; every XRPC response is fabricated in-test.
 */
import { test, expect, afterEach } from "bun:test";
import type { BlueskyCredential, BlueskyPostInput } from "./bluesky";
import { postToBluesky } from "./bluesky";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const cred: BlueskyCredential = {
  identifier: "swfldatagulf.bsky.social",
  appPassword: "app-pass-123",
};

interface CapturedCall {
  url: string;
  init: RequestInit;
}

function fakeResponse(status: number, body: unknown): Response {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

test("happy path with image: 3 calls in order, Bearer on calls 2+3, blob verbatim, alt present, uri/url derived", async () => {
  const calls: CapturedCall[] = [];
  const mockBlob = {
    $type: "blob",
    ref: { $link: "bafySomeCid" },
    mimeType: "image/png",
    size: 1234,
  };

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (url === "https://bsky.social/xrpc/com.atproto.server.createSession") {
      return fakeResponse(200, { accessJwt: "jwt-abc", did: "did:plc:xyz" });
    }
    if (url === "https://bsky.social/xrpc/com.atproto.repo.uploadBlob") {
      return fakeResponse(200, { blob: mockBlob });
    }
    if (url === "https://bsky.social/xrpc/com.atproto.repo.createRecord") {
      return fakeResponse(200, {
        uri: "at://did:plc:xyz/app.bsky.feed.post/3kabc123",
        cid: "bafyRecordCid",
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  const input: BlueskyPostInput = {
    caption: "Hello Bluesky",
    image: { bytes: new Uint8Array([1, 2, 3]), mime: "image/png", alt: "a chart" },
  };

  const result = await postToBluesky(input, cred);

  // Call order
  expect(calls.length).toBe(3);
  expect(calls[0].url).toBe("https://bsky.social/xrpc/com.atproto.server.createSession");
  expect(calls[1].url).toBe("https://bsky.social/xrpc/com.atproto.repo.uploadBlob");
  expect(calls[2].url).toBe("https://bsky.social/xrpc/com.atproto.repo.createRecord");

  // Bearer auth on calls 2 + 3 only
  const sessionHeaders = (calls[0].init.headers ?? {}) as Record<string, string>;
  const uploadHeaders = calls[1].init.headers as Record<string, string>;
  const createHeaders = calls[2].init.headers as Record<string, string>;
  expect(sessionHeaders["Authorization"]).toBeUndefined();
  expect(uploadHeaders["Authorization"]).toBe("Bearer jwt-abc");
  expect(createHeaders["Authorization"]).toBe("Bearer jwt-abc");

  // Raw bytes, image mime content-type — no multipart, no base64
  expect(uploadHeaders["Content-Type"]).toBe("image/png");
  expect(calls[1].init.body).toBe(input.image!.bytes);

  // createRecord body: blob embedded verbatim, alt present
  const createBody = JSON.parse(calls[2].init.body as string);
  expect(createBody.repo).toBe("did:plc:xyz");
  expect(createBody.collection).toBe("app.bsky.feed.post");
  expect(createBody.record.$type).toBe("app.bsky.feed.post");
  expect(createBody.record.text).toBe("Hello Bluesky");
  expect(createBody.record.langs).toEqual(["en"]);
  expect(createBody.record.embed.$type).toBe("app.bsky.embed.images");
  expect(createBody.record.embed.images[0].image).toEqual(mockBlob);
  expect(createBody.record.embed.images[0].alt).toBe("a chart");

  // Result: uri/url derived from the at:// uri's rkey
  expect(result.ok).toBe(true);
  expect(result.uri).toBe("at://did:plc:xyz/app.bsky.feed.post/3kabc123");
  expect(result.url).toBe("https://bsky.app/profile/swfldatagulf.bsky.social/post/3kabc123");
});

test("aspectRatio, when supplied, is embedded verbatim alongside the image", async () => {
  const mockBlob = {
    $type: "blob",
    ref: { $link: "bafySomeCid" },
    mimeType: "image/png",
    size: 99,
  };
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://bsky.social/xrpc/com.atproto.server.createSession") {
      return fakeResponse(200, { accessJwt: "jwt-abc", did: "did:plc:xyz" });
    }
    if (url === "https://bsky.social/xrpc/com.atproto.repo.uploadBlob") {
      return fakeResponse(200, { blob: mockBlob });
    }
    if (url === "https://bsky.social/xrpc/com.atproto.repo.createRecord") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      expect(body.record.embed.images[0].aspectRatio).toEqual({ width: 1080, height: 1350 });
      return fakeResponse(200, {
        uri: "at://did:plc:xyz/app.bsky.feed.post/3karatio",
        cid: "bafyRatioCid",
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  const input: BlueskyPostInput = {
    caption: "With aspect ratio",
    image: {
      bytes: new Uint8Array([1, 2, 3]),
      mime: "image/png",
      alt: "a chart",
      aspectRatio: { width: 1080, height: 1350 },
    },
  };

  const result = await postToBluesky(input, cred);
  expect(result.ok).toBe(true);
});

test("caption-only path: 2 calls (no uploadBlob), no embed key", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://bsky.social/xrpc/com.atproto.server.createSession") {
      return fakeResponse(200, { accessJwt: "jwt-abc", did: "did:plc:xyz" });
    }
    if (url === "https://bsky.social/xrpc/com.atproto.repo.createRecord") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      expect("embed" in body.record).toBe(false);
      return fakeResponse(200, {
        uri: "at://did:plc:xyz/app.bsky.feed.post/3kdef456",
        cid: "cid2",
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  const result = await postToBluesky({ caption: "text only" }, cred);

  expect(calls.length).toBe(2);
  expect(calls).not.toContain("https://bsky.social/xrpc/com.atproto.repo.uploadBlob");
  expect(result.ok).toBe(true);
  expect(result.uri).toBe("at://did:plc:xyz/app.bsky.feed.post/3kdef456");
});

test("createSession 401 → ok:false with the body's message", async () => {
  globalThis.fetch = (async () =>
    fakeResponse(401, {
      error: "AuthenticationRequired",
      message: "Invalid identifier or password",
    })) as typeof fetch;

  const result = await postToBluesky({ caption: "hi" }, cred);

  expect(result.ok).toBe(false);
  expect(result.error).toContain("Invalid identifier or password");
  expect(result.error).toContain("401");
});

test("uploadBlob failure short-circuits (no createRecord call)", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://bsky.social/xrpc/com.atproto.server.createSession") {
      return fakeResponse(200, { accessJwt: "jwt-abc", did: "did:plc:xyz" });
    }
    if (url === "https://bsky.social/xrpc/com.atproto.repo.uploadBlob") {
      return fakeResponse(500, { error: "InternalServerError", message: "blob store down" });
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  const result = await postToBluesky(
    { caption: "hi", image: { bytes: new Uint8Array([9]), mime: "image/jpeg", alt: "x" } },
    cred,
  );

  expect(calls.length).toBe(2);
  expect(calls).not.toContain("https://bsky.social/xrpc/com.atproto.repo.createRecord");
  expect(result.ok).toBe(false);
  expect(result.error).toContain("blob store down");
});
