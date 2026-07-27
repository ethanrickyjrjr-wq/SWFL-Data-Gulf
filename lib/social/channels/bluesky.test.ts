/**
 * lib/social/channels/bluesky.test.ts
 *
 * Mocked-fetch adapter test — mirrors the globalThis.fetch stub + afterEach
 * restore pattern from app/api/social/connect/[platform]/callback/route.test.ts.
 * No real network calls; every XRPC response is fabricated in-test.
 */
import { test, expect, afterEach } from "bun:test";
import type { BlueskyCredential, BlueskyPostInput } from "./bluesky";
import { detectLinkFacets, postToBluesky } from "./bluesky";

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

test("detectLinkFacets: UTF-8 byte offsets, exclusive end, trailing punctuation excluded", () => {
  // "café " is 6 UTF-8 bytes (é = 2) — a .length-based index would be off by one.
  const text = "café https://www.swfldatagulf.com.";
  const facets = detectLinkFacets(text);
  expect(facets.length).toBe(1);
  expect(facets[0].index.byteStart).toBe(6);
  // uri byte length = 28; trailing "." excluded from range and uri.
  expect(facets[0].index.byteEnd).toBe(6 + 28);
  expect(facets[0].features).toEqual([
    { $type: "app.bsky.richtext.facet#link", uri: "https://www.swfldatagulf.com" },
  ]);
});

test("detectLinkFacets: no URLs → empty array", () => {
  expect(detectLinkFacets("no links here, just words")).toEqual([]);
});

test("caption with a URL → record.facets carries the link facet; plain caption → no facets key", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://bsky.social/xrpc/com.atproto.server.createSession") {
      return fakeResponse(200, { accessJwt: "jwt-abc", did: "did:plc:xyz" });
    }
    if (url === "https://bsky.social/xrpc/com.atproto.repo.createRecord") {
      bodies.push(JSON.parse((init?.body as string) ?? "{}"));
      return fakeResponse(200, {
        uri: "at://did:plc:xyz/app.bsky.feed.post/3kfacet1",
        cid: "cidF",
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  const withLink = await postToBluesky({ caption: "See https://www.swfldatagulf.com today" }, cred);
  expect(withLink.ok).toBe(true);
  const record = bodies[0].record as Record<string, unknown>;
  expect(Array.isArray(record.facets)).toBe(true);
  const facet = (record.facets as ReturnType<typeof detectLinkFacets>)[0];
  expect(facet.index.byteStart).toBe(4);
  expect(facet.index.byteEnd).toBe(4 + 28);
  expect(facet.features[0].uri).toBe("https://www.swfldatagulf.com");

  const noLink = await postToBluesky({ caption: "plain words" }, cred);
  expect(noLink.ok).toBe(true);
  expect("facets" in (bodies[1].record as Record<string, unknown>)).toBe(false);
});

test("images[] path: one uploadBlob per image, embed order preserved, per-image alt", async () => {
  const uploads: string[] = [];
  let blobN = 0;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://bsky.social/xrpc/com.atproto.server.createSession") {
      return fakeResponse(200, { accessJwt: "jwt-abc", did: "did:plc:xyz" });
    }
    if (url === "https://bsky.social/xrpc/com.atproto.repo.uploadBlob") {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      uploads.push(headers["Content-Type"]);
      blobN += 1;
      return fakeResponse(200, { blob: { $type: "blob", ref: { $link: `cid-${blobN}` } } });
    }
    if (url === "https://bsky.social/xrpc/com.atproto.repo.createRecord") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      const images = body.record.embed.images;
      expect(images.length).toBe(2);
      expect(images[0].alt).toBe("the house");
      expect(images[0].image.ref.$link).toBe("cid-1");
      expect(images[1].alt).toBe("the card");
      expect(images[1].image.ref.$link).toBe("cid-2");
      return fakeResponse(200, {
        uri: "at://did:plc:xyz/app.bsky.feed.post/3kmulti1",
        cid: "cidM",
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  const result = await postToBluesky(
    {
      caption: "two images",
      images: [
        { bytes: new Uint8Array([1]), mime: "image/jpeg", alt: "the house" },
        { bytes: new Uint8Array([2]), mime: "image/png", alt: "the card" },
      ],
    },
    cred,
  );
  expect(result.ok).toBe(true);
  expect(uploads).toEqual(["image/jpeg", "image/png"]);
});

test("more than 4 images → ok:false, no network calls", async () => {
  let fetches = 0;
  globalThis.fetch = (async () => {
    fetches += 1;
    return fakeResponse(200, {});
  }) as typeof fetch;

  const img = { bytes: new Uint8Array([1]), mime: "image/png", alt: "x" };
  const result = await postToBluesky(
    { caption: "too many", images: [img, img, img, img, img] },
    cred,
  );
  expect(result.ok).toBe(false);
  expect(result.error).toContain("4");
  expect(fetches).toBe(0);
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
