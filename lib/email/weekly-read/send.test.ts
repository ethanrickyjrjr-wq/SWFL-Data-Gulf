// lib/email/weekly-read/send.test.ts
import { describe, expect, it } from "bun:test";
import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";
import {
  buildWeeklyReadBatches,
  sendWeeklyReadBatches,
  type BatchSender,
  type WeeklyReadBatchMessage,
  type WeeklyReadOutgoing,
} from "./send";
import { extractWeeklyReadAction } from "./webhook";

function msg(n: number): WeeklyReadOutgoing {
  return {
    subscriberId: `sub-${n}`,
    email: `p${n}@example.com`,
    subject: `s${n}`,
    html: `<html><body><a href="${UNSUBSCRIBE_TOKEN}">Unsubscribe</a></body></html>`,
  };
}

describe("buildWeeklyReadBatches", () => {
  it("substitutes the per-subscriber ?wid= unsubscribe URL and sets one-click headers", () => {
    const [batch] = buildWeeklyReadBatches({
      messages: [msg(1)],
      from: "SWFL Data Gulf <hello@swfldatagulf.com>",
      unsubBase: "https://www.swfldatagulf.com/",
    });
    const m = batch[0];
    const expected = "https://www.swfldatagulf.com/api/unsubscribe?wid=sub-1";
    expect(m.html).toContain(expected);
    expect(m.html).not.toContain(UNSUBSCRIBE_TOKEN);
    expect(m.headers["List-Unsubscribe"]).toBe(`<${expected}>`);
    expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(m.to).toEqual(["p1@example.com"]);
    expect(m.tags).toEqual([{ name: "wid", value: "sub-1" }]);
  });
  it("extra tags ride each message alongside wid (market-area alerts attribution)", () => {
    const [batch] = buildWeeklyReadBatches({
      messages: [
        {
          ...msg(1),
          tags: [
            { name: "ma", value: "i-1" },
            { name: "trigger", value: "lifecycle_burst" },
            { name: "area", value: "cape-coral" },
          ],
        },
      ],
      from: "x <x@y.z>",
      unsubBase: "https://www.swfldatagulf.com",
    });
    expect(batch[0].tags).toContainEqual({ name: "wid", value: "sub-1" });
    expect(batch[0].tags).toContainEqual({ name: "trigger", value: "lifecycle_burst" });
    expect(batch[0].tags).toContainEqual({ name: "area", value: "cape-coral" });
  });
  it("chunks at 100 (Resend batch cap)", () => {
    const batches = buildWeeklyReadBatches({
      messages: Array.from({ length: 205 }, (_, i) => msg(i)),
      from: "x <x@y.z>",
      unsubBase: "https://www.swfldatagulf.com",
    });
    expect(batches.map((b) => b.length)).toEqual([100, 100, 5]);
  });
});

describe("sendWeeklyReadBatches", () => {
  it("counts sent/failed per batch and never throws", async () => {
    let calls = 0;
    const client: BatchSender = {
      batch: {
        send: async (_msgs: WeeklyReadBatchMessage[]) => {
          calls++;
          return calls === 1 ? { error: null } : { error: { message: "boom" } };
        },
      },
    };
    const batches = buildWeeklyReadBatches({
      messages: Array.from({ length: 101 }, (_, i) => msg(i)),
      from: "x <x@y.z>",
      unsubBase: "https://www.swfldatagulf.com",
    });
    const r = await sendWeeklyReadBatches(client, batches);
    expect(r.sent).toBe(100);
    expect(r.failed).toBe(1);
    expect(r.errors).toEqual(["boom"]);
  });
});

describe("extractWeeklyReadAction", () => {
  it("bounce → bounced, complaint → unsubscribed (via cadence onEvent)", () => {
    expect(
      extractWeeklyReadAction({ type: "email.bounced", data: { tags: { wid: "w1" } } }),
    ).toEqual({ wid: "w1", suppressTo: "bounced" });
    expect(
      extractWeeklyReadAction({ type: "email.complained", data: { tags: { wid: "w1" } } }),
    ).toEqual({ wid: "w1", suppressTo: "unsubscribed" });
  });
  it("ignores untagged events and non-suppression types", () => {
    expect(extractWeeklyReadAction({ type: "email.bounced", data: { tags: {} } })).toBeNull();
    expect(
      extractWeeklyReadAction({ type: "email.opened", data: { tags: { wid: "w1" } } }),
    ).toBeNull();
    expect(
      extractWeeklyReadAction({ type: "email.received", data: { tags: { wid: "w1" } } }),
    ).toBeNull();
  });
});
