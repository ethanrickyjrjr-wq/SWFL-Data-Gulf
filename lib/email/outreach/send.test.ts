import { describe, expect, it } from "bun:test";
import { buildBatchMessages, sendBatches, type BatchSender } from "./send";
import type { ComposedMessage } from "./campaign";

function ready(over: Partial<ComposedMessage> = {}): ComposedMessage {
  return {
    email: "broker@acme.com",
    status: "ready",
    brandSource: "meta",
    brandConfidence: 0.9,
    usedHouseBrand: false,
    primary: "#0a3d62",
    arrivalUrl: "https://www.swfldatagulf.com/welcome",
    subject: "Your market update",
    html: '<body><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></body>',
    ...over,
  };
}

const input = {
  from: "SWFL <hello@swfldatagulf.com>",
  unsubBase: "https://www.swfldatagulf.com",
  recipientId: (m: ComposedMessage) => `rid-${m.email}`,
};

describe("buildBatchMessages", () => {
  it("injects a real per-recipient unsubscribe URL + List-Unsubscribe headers + rid tag", () => {
    const [batch] = buildBatchMessages({ ...input, messages: [ready()] });
    const msg = batch[0];
    const expectedUrl =
      "https://www.swfldatagulf.com/api/unsubscribe?rid=rid-broker%40acme.com";
    expect(msg.html).toContain(expectedUrl);
    expect(msg.html).not.toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(msg.headers["List-Unsubscribe"]).toBe(`<${expectedUrl}>`);
    expect(msg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(msg.tags).toEqual([{ name: "rid", value: "rid-broker@acme.com" }]);
    expect(msg.to).toEqual(["broker@acme.com"]);
  });

  it("drops non-ready messages and ones without html", () => {
    const batches = buildBatchMessages({
      ...input,
      messages: [
        ready(),
        ready({ email: "x@y.com", status: "out_of_scope", html: undefined }),
        ready({ email: "e@e.com", status: "error", html: undefined }),
      ],
    });
    expect(batches.flat()).toHaveLength(1);
  });

  it("chunks into batches of 100", () => {
    const messages = Array.from({ length: 250 }, (_, i) => ready({ email: `b${i}@x.com` }));
    const batches = buildBatchMessages({ ...input, messages });
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
  });

  it("returns no batches for an empty / all-skipped list", () => {
    expect(buildBatchMessages({ ...input, messages: [] })).toEqual([]);
  });
});

describe("sendBatches", () => {
  it("counts sent across batches", async () => {
    const client: BatchSender = { batch: { send: async () => ({ error: null }) } };
    const batches = buildBatchMessages({
      ...input,
      messages: Array.from({ length: 120 }, (_, i) => ready({ email: `b${i}@x.com` })),
    });
    const res = await sendBatches(client, batches);
    expect(res).toEqual({ sent: 120, failed: 0, errors: [] });
  });

  it("counts a failed batch's whole chunk as failed and records the error", async () => {
    const client: BatchSender = {
      batch: { send: async () => ({ error: { message: "rate limited" } }) },
    };
    const batches = buildBatchMessages({ ...input, messages: [ready()] });
    const res = await sendBatches(client, batches);
    expect(res.sent).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.errors).toEqual(["rate limited"]);
  });

  it("survives a thrown send (network) as a per-batch failure", async () => {
    const client: BatchSender = {
      batch: {
        send: async () => {
          throw new Error("ECONNRESET");
        },
      },
    };
    const batches = buildBatchMessages({ ...input, messages: [ready()] });
    const res = await sendBatches(client, batches);
    expect(res.failed).toBe(1);
    expect(res.errors[0]).toContain("ECONNRESET");
  });
});
