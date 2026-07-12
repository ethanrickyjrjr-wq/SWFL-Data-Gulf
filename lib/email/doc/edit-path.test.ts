import { describe, expect, it } from "bun:test";
import { applyTextAtPath } from "./edit-path";
import type { EmailBlock } from "./types";

const text = (): EmailBlock => ({
  id: "t1",
  type: "text",
  props: { body: "old", linkUrl: "https://x.test" },
});
const stats = (): EmailBlock => ({
  id: "s1",
  type: "stats",
  props: {
    stats: [
      { value: "34", label: "DOM" },
      { value: "3.2", label: "Supply" },
    ],
  },
});

describe("applyTextAtPath", () => {
  it("sets a top-level prop immutably", () => {
    const b = text();
    const next = applyTextAtPath(b, "body", "new");
    expect(next).not.toBe(b);
    expect(next.props).toEqual({ body: "new", linkUrl: "https://x.test" });
    expect((b.props as { body: string }).body).toBe("old");
  });

  it("creates a missing leaf key (typing into an empty placeholder)", () => {
    const b: EmailBlock = { id: "h1", type: "hero", props: {} };
    expect(applyTextAtPath(b, "kicker", "Market Spotlight").props).toEqual({
      kicker: "Market Spotlight",
    });
  });

  it("keeps an empty string (open slot), deletes on undefined", () => {
    const b = text();
    expect((applyTextAtPath(b, "body", "").props as { body: string }).body).toBe("");
    expect("linkUrl" in applyTextAtPath(b, "linkUrl", undefined).props).toBe(false);
  });

  it("sets inside an array row without touching siblings", () => {
    const b = stats();
    const next = applyTextAtPath(b, "stats.1.value", "4.0");
    expect((next.props as { stats: { value: string }[] }).stats[1].value).toBe("4.0");
    expect((next.props as { stats: { value: string }[] }).stats[0]).toBe(
      (b.props as { stats: { value: string }[] }).stats[0],
    );
  });

  it("returns the block unchanged on a bad index, missing container, or no-op write", () => {
    const b = stats();
    expect(applyTextAtPath(b, "stats.9.value", "x")).toBe(b);
    expect(applyTextAtPath(b, "items.0.text", "x")).toBe(b);
    expect(applyTextAtPath(b, "stats.0.value", "34")).toBe(b);
  });
});
