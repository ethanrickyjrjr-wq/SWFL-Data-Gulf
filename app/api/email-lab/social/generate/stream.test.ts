import { describe, it, expect, mock, afterAll } from "bun:test";
import type { BuildStreamEvent } from "@/lib/email/lab/stream-events";

// ── module-boundary mocks ────────────────────────────────────────────────────
// `mock.module` is PROCESS-GLOBAL, so the real exports are snapshotted into plain
// objects first and restored in `afterAll` — a leaked fake builder would poison
// `lib/social/**` suites that run after this file in the same process.
import * as fillNs from "@/lib/email/social-calendar/build-canvas-fill";
import * as authorNs from "@/lib/social/design/author";

const fillOrig = { ...fillNs };
const authorOrig = { ...authorNs };

type FillResult = Awaited<ReturnType<typeof fillNs.buildSocialCanvasFill>>;
type AuthorResult = Awaited<ReturnType<typeof authorNs.authorSocialPost>>;

let fillImpl: (onStatus?: (l: string) => void) => Promise<FillResult> = async () => null;
let authorImpl: (onStatus?: (l: string) => void) => Promise<AuthorResult> = async () => null;

mock.module("@/lib/email/social-calendar/build-canvas-fill", () => ({
  ...fillOrig,
  buildSocialCanvasFill: (
    _scope: unknown,
    _skeleton: unknown,
    opts?: { onStatus?: (l: string) => void },
  ) => fillImpl(opts?.onStatus),
}));
mock.module("@/lib/social/design/author", () => ({
  ...authorOrig,
  authorSocialPost: (_scope: unknown, _prompt: string, opts?: { onStatus?: (l: string) => void }) =>
    authorImpl(opts?.onStatus),
}));
mock.module("@/lib/project/uploads-text", () => ({
  loadProjectUploadsText: async () => undefined,
}));
mock.module("@/lib/project/user-data-feed", () => ({ loadUserDataText: async () => undefined }));

afterAll(() => {
  mock.module("@/lib/email/social-calendar/build-canvas-fill", () => fillOrig);
  mock.module("@/lib/social/design/author", () => authorOrig);
});

const { POST } = await import("./route");

// ── helpers ──────────────────────────────────────────────────────────────────
const post = (body: unknown): Promise<Response> =>
  POST(
    new Request("http://localhost/api/email-lab/social/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  ) as unknown as Promise<Response>;

async function readEvents(res: Response): Promise<{ events: BuildStreamEvent[]; raw: string }> {
  const raw = await res.text();
  const events = raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as BuildStreamEvent);
  return { events, raw };
}

const SKELETON = {
  head: { type: "text", text: "Your text" },
  price: { type: "stat", value: "", label: "median" },
};

const FILL_PAYLOAD = {
  caption: "Cape Coral medians are up.",
  hashtags: ["capecoral"],
  patch: { head: { text: "Medians up 4%" }, price: { value: "$412K", label: "median" } },
  variants: {},
  webSources: [],
};

describe("/api/email-lab/social/generate — streaming", () => {
  it("FM-SOCSTREAM-1: fill + stream:true → NDJSON status…slot…done, done = the JSON payload", async () => {
    const labels: string[] = [];
    fillImpl = async (onStatus) => {
      onStatus?.("reading the lake");
      onStatus?.("writing the post");
      labels.push("ran");
      return FILL_PAYLOAD as unknown as FillResult;
    };
    const res = await post({ skeleton: SKELETON, stream: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const { events } = await readEvents(res);
    expect(events.map((e) => e.e)).toEqual(["status", "status", "slot", "done"]);
    expect(events[0]).toEqual({ e: "status", label: "reading the lake" });
    // the `text` element streams; the multi-field `stat` does NOT (one-string protocol)
    expect(events[2]).toEqual({ e: "slot", id: "head", text: "Medians up 4%" });
    const done = events[3] as { e: "done"; payload: unknown };
    expect(done.payload).toEqual(FILL_PAYLOAD);
    expect(labels).toEqual(["ran"]);
  });

  it("FM-SOCSTREAM-2: author + stream:true → status beats then done; NO slot is invented", async () => {
    const authored = {
      design: { version: 1, format: "portrait", background: "#000000", elements: [] },
      caption: "hi",
      hashtags: [],
      variants: {},
      webSources: [],
    };
    authorImpl = async (onStatus) => {
      onStatus?.("reading the lake");
      onStatus?.("placing it on the canvas");
      return authored as unknown as AuthorResult;
    };
    const res = await post({ author: true, prompt: "a post about Cape Coral", stream: true });
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    const { events } = await readEvents(res);
    expect(events.map((e) => e.e)).toEqual(["status", "status", "done"]);
    expect(events.some((e) => e.e === "slot")).toBe(false);
    expect((events[2] as { payload: unknown }).payload).toEqual(authored);
  });

  it("FM-SOCSTREAM-3: NO `stream` field → today's exact JSON (deploy-skew guard), both modes", async () => {
    fillImpl = async () => FILL_PAYLOAD as unknown as FillResult;
    const fillRes = await post({ skeleton: SKELETON });
    expect(fillRes.status).toBe(200);
    expect(fillRes.headers.get("content-type")).toContain("application/json");
    expect(await fillRes.json()).toEqual(FILL_PAYLOAD);

    authorImpl = async () =>
      ({ design: { version: 1, format: "portrait", background: "#000", elements: [] } }) as never;
    const authorRes = await post({ author: true, prompt: "hi" });
    expect(authorRes.headers.get("content-type")).toContain("application/json");
    expect(((await authorRes.json()) as { design: unknown }).design).toBeTruthy();
  });

  it("FM-SOCSTREAM-4: a failed build ends the stream with `error`, never `done`, still 200 NDJSON", async () => {
    fillImpl = async () => null;
    const res = await post({ skeleton: SKELETON, stream: true });
    expect(res.status).toBe(200); // a 4xx/5xx BUILD inside a 200 STREAM is the contract
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    const { events } = await readEvents(res);
    expect(events.map((e) => e.e)).toEqual(["error"]);
    expect(events.some((e) => e.e === "done")).toBe(false);
    expect(events[0]).toEqual({ e: "error", message: "fill_failed" });
  });

  it("FM-SOCSTREAM-5: an unhandled throw NEVER puts the exception text on the wire", async () => {
    fillImpl = async () => {
      throw new Error("ECONNREFUSED postgres://user:hunter2@10.0.0.7:5432/data_lake");
    };
    const res = await post({ skeleton: SKELETON, stream: true });
    const { events, raw } = await readEvents(res);
    expect(raw).not.toContain("ECONNREFUSED");
    expect(raw).not.toContain("hunter2");
    expect(raw).not.toContain("data_lake");
    expect(events.map((e) => e.e)).toEqual(["error"]);
    expect(events[0]).toEqual({
      e: "error",
      message: "Something went wrong on the server — check logs.",
    });
  });

  it("FM-SOCSTREAM-6: a request that never reaches a build keeps its real status + JSON", async () => {
    const noElements = await post({ skeleton: {}, stream: true });
    expect(noElements.status).toBe(400);
    expect(noElements.headers.get("content-type")).toContain("application/json");
    expect(await noElements.json()).toEqual({ error: "no elements to fill" });

    const noPrompt = await post({ author: true, prompt: "  ", stream: true });
    expect(noPrompt.status).toBe(400);
    expect(noPrompt.headers.get("content-type")).toContain("application/json");
    expect(await noPrompt.json()).toEqual({ error: "no prompt" });
  });
});
