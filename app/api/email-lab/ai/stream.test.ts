// app/api/email-lab/ai/stream.test.ts
//
// THE STREAMING BRANCH of POST /api/email-lab/ai (spec 2026-08-18, live build
// streaming — Task 5). Two failure modes, one per test:
//
//   FM-STREAM-1  a client that asks for the stream gets a stream: NDJSON content
//                type, the beats in the order the build produced them, and a
//                terminal `done` carrying EXACTLY the payload the JSON branch
//                would have returned. A `done` that disagrees with the JSON
//                branch is a silently forked build.
//   FM-STREAM-6  DEPLOY SKEW — an OLD client (no `stream` field) hitting the NEW
//                route must still get today's plain JSON response. The streaming
//                branch is opt-in or it is a breaking change.
//
// `authorDoc` is mocked at the module boundary (process-local `mock.module`, the
// same pattern claim-and-send/route.test.ts and build-doc.test.ts's FM-TRACK-2
// use) so this test measures the ROUTE's translation of progress beats into wire
// events — not the build engine, which Task 4 already covers.

import { test, expect, mock, afterAll } from "bun:test";
import type { NextRequest } from "next/server";
import { decodeEvents, type BuildStreamEvent } from "@/lib/email/lab/stream-events";
import { seedById } from "@/lib/email/doc/default-docs";
import * as buildDocNs from "@/lib/email/build-doc";
import type { BuildArgs, BuildResult } from "@/lib/email/build-doc";

process.env.ANTHROPIC_API_KEY = "test-key";

// Snapshot the REAL exports into a plain object BEFORE mocking. `mock.module`
// live-updates bindings, so a namespace import held across the mock can already
// be pointing at the fake by the time it is spread or restored from.
const buildDocOrig = { ...buildDocNs };

// The doc the fake build streams. A real seed doc — the emitter validates every
// content-bearing event against EmailDocSchema before it reaches the wire, so a
// hand-rolled stub would be rejected by the gate rather than by the route.
const DOC = seedById("market-spotlight")!.build();
const FIRST_BLOCK = DOC.blocks[0];

const PAYLOAD: Record<string, unknown> = {
  applied: true,
  doc: DOC,
  recipeKey: "new-listing",
  message: "built",
};

const progressPlan: (emit: (ev: buildDocNs.BuildProgressEvent) => void) => void = (emit) => {
  emit({ stage: "status", label: "laying out your email" });
  emit({ stage: "skeleton", doc: DOC });
  emit({
    stage: "block",
    blockId: FIRST_BLOCK.id,
    props: { ...(FIRST_BLOCK.props as Record<string, unknown>) },
    doc: DOC,
  });
};
let authorDocCalls = 0;
/** What the fake build RETURNS — varied per test so the 4xx branch is reachable.
 *  Reset in every test; the beats it streams first never change. */
let nextResult: BuildResult = { payload: PAYLOAD };

mock.module("@/lib/email/build-doc", () => ({
  ...buildDocOrig,
  authorDoc: async (args: BuildArgs): Promise<BuildResult> => {
    authorDocCalls += 1;
    if (args.onProgress) progressPlan(args.onProgress);
    return nextResult;
  },
}));

mock.module("next/headers", () => ({ cookies: async () => ({}) }));

// Anonymous caller: `loadCaller` returns an empty library and `meterUserId`
// returns null, so the metering lane stays exactly where it sits in prod.
mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({
      select: () => ({
        order: () => ({ limit: async () => ({ data: [] }) }),
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    }),
  }),
}));

mock.module("@/lib/email/build-usage", () => ({
  checkBuildAllowance: async () => ({ allowed: true }),
  recordBuild: async () => {},
}));

const { POST } = await import("./route");

function makeReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/email-lab/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** The body every test posts. `recipeKey` is deliberate: it makes
 *  `wantSuggestions` false, so the payload the route emits is the build's own
 *  payload with nothing merged in — the two readings of "exactly the payload"
 *  coincide and the assertion is unambiguous. */
function askBody(extra: Record<string, unknown> = {}) {
  return {
    prompt: "Build a new listing email for 123 Gulf Shore Blvd.",
    doc: DOC,
    build: true,
    recipeKey: "new-listing",
    ...extra,
  };
}

async function readEvents(res: Response): Promise<BuildStreamEvent[]> {
  const { events, carry } = decodeEvents(await res.text(), "");
  expect(carry.trim()).toBe(""); // every line terminated — no truncated tail
  return events;
}

afterAll(() => {
  // mock.module is process-global; hand the real build engine back so anything
  // running after this file gets the real `authorDoc`.
  mock.module("@/lib/email/build-doc", () => buildDocOrig);
});

test("FM-STREAM-1: stream:true → NDJSON, beats in build order, done carries the JSON branch's payload", async () => {
  authorDocCalls = 0;
  nextResult = { payload: PAYLOAD };
  const res = await POST(makeReq(askBody({ stream: true })));

  expect(res.headers.get("content-type")).toBe("application/x-ndjson");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.status).toBe(200);

  const events = await readEvents(res);
  const kinds = events.map((e) => e.e);

  // Order is the contract: the shell paints a skeleton, then repaints blocks
  // into it, then swaps in the authoritative payload. A block before its
  // skeleton would repaint a doc the client does not hold yet.
  expect(kinds).toContain("status");
  expect(kinds).toContain("skeleton");
  expect(kinds).toContain("block");
  expect(kinds.indexOf("skeleton")).toBeLessThan(kinds.indexOf("block"));
  expect(kinds.indexOf("block")).toBeLessThan(kinds.indexOf("done"));
  expect(kinds[kinds.length - 1]).toBe("done");
  expect(kinds).not.toContain("error");

  const skeleton = events.find((e) => e.e === "skeleton")!;
  expect(skeleton.e === "skeleton" && skeleton.doc.blocks.length).toBe(DOC.blocks.length);

  const block = events.find((e) => e.e === "block")!;
  expect(block.e === "block" && block.id).toBe(FIRST_BLOCK.id);

  const done = events[events.length - 1];
  // Compared through a JSON round-trip: the wire is JSON, so an `undefined`
  // field in the seed doc is dropped by encoding, not by the route.
  expect(done.e === "done" && done.payload).toEqual(JSON.parse(JSON.stringify(PAYLOAD)));

  expect(authorDocCalls).toBe(1); // one build per request, never two
});

test("FM-STREAM-2: a 4xx build terminates the stream with `error`, never `done`", async () => {
  authorDocCalls = 0;
  // The shape buildContentDoc/authorDoc return on an invalid doc.
  nextResult = { httpStatus: 400, payload: { error: "Invalid email document." } };
  const res = await POST(makeReq(askBody({ stream: true })));

  // A 4xx BUILD inside a 200 STREAM is the contract — the transport succeeded,
  // the build did not. Pinned so nobody later "fixes" this into a 400 response
  // and breaks every client that is already reading the body.
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/x-ndjson");

  const events = await readEvents(res);
  const kinds = events.map((e) => e.e);
  expect(kinds).not.toContain("done"); // a failed build must never look finished
  const last = events[events.length - 1];
  expect(last.e).toBe("error");
  expect(last.e === "error" && last.message).toBe("Invalid email document.");
});

test("FM-STREAM-6: no `stream` field (an old client) → today's plain JSON, same payload", async () => {
  authorDocCalls = 0;
  nextResult = { payload: PAYLOAD };
  const res = await POST(makeReq(askBody()));

  expect(res.headers.get("content-type")).toContain("application/json");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(JSON.parse(JSON.stringify(PAYLOAD)));
  expect(authorDocCalls).toBe(1);
});
