import { test, expect } from "bun:test";
import { parseSSEFrames } from "./sse";

test("parses a complete two-frame buffer (text then done)", () => {
  const buf = `data: {"text":"a"}\n\ndata: {"done":true,"reach":["env-swfl"]}\n\n`;
  const { events, rest } = parseSSEFrames(buf);
  expect(events).toEqual([{ text: "a" }, { done: true, reach: ["env-swfl"] }]);
  expect(rest).toBe("");
});

test("returns the trailing incomplete chunk as rest", () => {
  // Second frame is split mid-JSON — only the first frame is complete.
  const buf = `data: {"text":"hello"}\n\ndata: {"text":"wor`;
  const { events, rest } = parseSSEFrames(buf);
  expect(events).toEqual([{ text: "hello" }]);
  expect(rest).toBe(`data: {"text":"wor`);
});

test("rejoining rest with the next chunk recovers the split frame", () => {
  const first = parseSSEFrames(`data: {"text":"wor`);
  expect(first.events).toEqual([]);
  const next = parseSSEFrames(first.rest + `ld"}\n\n`);
  expect(next.events).toEqual([{ text: "world" }]);
  expect(next.rest).toBe("");
});

test("parses an error frame", () => {
  const { events } = parseSSEFrames(`data: {"error":"boom"}\n\n`);
  expect(events).toEqual([{ error: "boom" }]);
});

test("skips malformed and non-data lines without throwing", () => {
  const buf = `: heartbeat\n\ndata: not-json\n\ndata: {"text":"ok"}\n\n`;
  const { events } = parseSSEFrames(buf);
  expect(events).toEqual([{ text: "ok" }]);
});
