import { test, expect } from "bun:test";
import { parseReplyIntent, describeIntent } from "./parse-intent";

test("pulls a SWFL ZIP and resolves its place", () => {
  const i = parseReplyIntent("what about 33908? thinking of buying");
  expect(i.zip).toBe("33908");
  expect(i.place).toBeTruthy();
  expect(i.topic).toBe("home prices"); // "buying"
});

test("pulls a place name and a topic from a messy body", () => {
  const i = parseReplyIntent("Is Cape Coral waterfront a good buy right now?");
  expect(i.place?.toLowerCase()).toContain("cape coral");
  expect(i.topic).toBe("waterfront");
});

test("flood/insurance maps to flood risk", () => {
  const i = parseReplyIntent("how bad is the flood insurance in Fort Myers Beach");
  expect(i.place?.toLowerCase()).toContain("fort myers beach");
  expect(i.topic).toBe("flood risk");
});

test("ignores a non-SWFL ZIP", () => {
  const i = parseReplyIntent("I'm moving from 90210, any thoughts?");
  expect(i.zip).toBeNull();
});

test("describeIntent renders a clean one-liner", () => {
  expect(describeIntent({ zip: "33914", place: "Cape Coral", topic: "waterfront" })).toBe(
    "Cape Coral — waterfront",
  );
  expect(describeIntent({ zip: null, place: null, topic: null })).toBe(
    "a question about the market",
  );
});
