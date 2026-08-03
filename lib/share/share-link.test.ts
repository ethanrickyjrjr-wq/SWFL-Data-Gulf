// lib/share/share-link.test.ts
// Guards: spec failure mode 4 (share on a dead deliverable) and the ref=share
// contract (every minted share link carries the growth param).
import { describe, expect, test } from "bun:test";
import { buildShareUrl, canShare } from "./share-link";

describe("buildShareUrl", () => {
  test("mints /p/{id}?ref=share on the given origin", () => {
    expect(buildShareUrl("https://www.swfldatagulf.com", "abc-123")).toBe(
      "https://www.swfldatagulf.com/p/abc-123?ref=share",
    );
  });
  test("localhost origin works the same (dev)", () => {
    expect(buildShareUrl("http://localhost:3000", "x")).toBe("http://localhost:3000/p/x?ref=share");
  });
});

describe("canShare", () => {
  test("only a ready deliverable is shareable", () => {
    expect(canShare("ready")).toBe(true);
    expect(canShare("building")).toBe(false);
    expect(canShare("revoked")).toBe(false);
    expect(canShare("")).toBe(false);
  });
});
