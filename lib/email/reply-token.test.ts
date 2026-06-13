import { test, expect } from "bun:test";
import {
  generateReplyToken,
  buildReplyAddress,
  parseReplyAddress,
  pickReplyEntry,
  DEFAULT_REPLY_DOMAIN,
} from "./reply-token";

test("token round-trip: generate → address → parse recovers the token", () => {
  const token = generateReplyToken();
  expect(token).toMatch(/^[a-f0-9]{16}$/);
  const addr = buildReplyAddress(token, "reply.example.com");
  expect(addr).toBe(`r-${token}@reply.example.com`);
  expect(parseReplyAddress(addr)).toBe(token);
});

test("parseReplyAddress tolerates a display-name wrapper and is case-insensitive", () => {
  expect(parseReplyAddress("Sensor <r-ABC123@reply.example.com>")).toBe("abc123");
});

test("parseReplyAddress returns null for a non-sensor address", () => {
  expect(parseReplyAddress("sarah@gmail.com")).toBeNull();
  expect(parseReplyAddress("hello@swfldatagulf.com")).toBeNull();
});

test("pickReplyEntry selects the reply-domain entry from a mixed to[]", () => {
  const got = pickReplyEntry(
    ["agent@cc.com", "r-deadbeef00112233@reply.example.com", "someone@x.com"],
    "reply.example.com",
  );
  expect(got).toEqual({
    address: "r-deadbeef00112233@reply.example.com",
    token: "deadbeef00112233",
  });
});

test("pickReplyEntry returns null when nothing targets the reply domain", () => {
  expect(pickReplyEntry(["a@b.com", "c@d.com"], "reply.example.com")).toBeNull();
  expect(pickReplyEntry(null, "reply.example.com")).toBeNull();
  expect(pickReplyEntry("plain@string.com", "reply.example.com")).toBeNull();
});

test("default reply domain is the dedicated receiving subdomain", () => {
  expect(DEFAULT_REPLY_DOMAIN).toBe("reply.swfldatagulf.com");
});
