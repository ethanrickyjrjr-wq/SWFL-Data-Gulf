// lib/lab-entry/use-autosave.test.ts
import { describe, expect, test } from "bun:test";
import { shouldKeepaliveFlush } from "./use-autosave";

describe("shouldKeepaliveFlush (keepalive ~64KB cap)", () => {
  test("small docs flush on exit", () => {
    expect(shouldKeepaliveFlush(10_000)).toBe(true);
  });
  test("oversized docs skip the flush — the 5s autosave has them covered", () => {
    expect(shouldKeepaliveFlush(70_000)).toBe(false);
  });
  test("boundary at 64000 bytes", () => {
    expect(shouldKeepaliveFlush(64_000)).toBe(true);
    expect(shouldKeepaliveFlush(64_001)).toBe(false);
  });
});
