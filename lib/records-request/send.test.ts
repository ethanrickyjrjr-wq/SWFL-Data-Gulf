import { test, expect } from "bun:test";
import { sendRecordsRequest } from "./send";

function stub(error: { message: string } | null) {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    emails: {
      send: async (m: Record<string, unknown>) => {
        calls.push(m);
        return { error };
      },
    },
  };
  return { client, calls };
}

test("sends a transactional message and returns ok", async () => {
  const { client, calls } = stub(null);
  const res = await sendRecordsRequest(client, {
    from: "SWFL Data Gulf <hello@swfldatagulf.com>",
    to: "records@example.gov",
    subject: "Florida Public Records Request — X",
    text: "body",
  });
  expect(res.ok).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0].to).toBe("records@example.gov");
  expect(calls[0].from).toBe("SWFL Data Gulf <hello@swfldatagulf.com>");
});

test("passes NO commercial-email fields (no headers, tags, or html)", async () => {
  const { client, calls } = stub(null);
  await sendRecordsRequest(client, {
    from: "SWFL Data Gulf <hello@swfldatagulf.com>",
    to: "records@example.gov",
    subject: "s",
    text: "b",
  });
  expect(calls[0].headers).toBeUndefined();
  expect(calls[0].tags).toBeUndefined();
  expect(calls[0].html).toBeUndefined();
});

test("a send error surfaces as ok:false with the message", async () => {
  const { client } = stub({ message: "domain not verified" });
  const res = await sendRecordsRequest(client, { from: "a", to: "b", subject: "s", text: "b" });
  expect(res.ok).toBe(false);
  expect(res.error).toBe("domain not verified");
});
