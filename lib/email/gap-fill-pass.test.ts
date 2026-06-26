import { describe, expect, it } from "bun:test";
import { gapFillPayload } from "./gap-fill-pass";

describe("gapFillPayload — four-lane gap-fill (cited or [Need:], never invented)", () => {
  it("(a) blank field -> filled value + citation from the fill fn", async () => {
    const fill = async (key: string) => {
      if (key === "vacancy") return { value: "6.75%", citation: "https://cbre.com/report" };
      return null;
    };
    const out = await gapFillPayload([{ key: "vacancy", value: null }], fill);
    expect(out).toEqual([{ key: "vacancy", value: "6.75%", citation: "https://cbre.com/report" }]);
  });

  it("(b) blank field, fill -> null -> needed:true with [Need:...] placeholder, NEVER an invented number", async () => {
    const fill = async () => null;
    const out = await gapFillPayload([{ key: "rent", value: "" }], fill);
    expect(out).toEqual([{ key: "rent", value: "[Need: rent]", needed: true }]);
    // hard moat: no fabricated digits leak in
    expect(out[0].value).not.toMatch(/\d/);
    expect(out[0].citation).toBeUndefined();
  });

  it("(c) non-blank field passes through unchanged (fill is never called)", async () => {
    let called = false;
    const fill = async () => {
      called = true;
      return { value: "999", citation: "x" };
    };
    const out = await gapFillPayload([{ key: "noi", value: "$1.2M" }], fill);
    expect(out).toEqual([{ key: "noi", value: "$1.2M" }]);
    expect(called).toBe(false);
  });

  it("treats whitespace-only as blank and fills it", async () => {
    const fill = async () => ({ value: "42", citation: "https://census.gov" });
    const out = await gapFillPayload([{ key: "pop", value: "   " }], fill);
    expect(out).toEqual([{ key: "pop", value: "42", citation: "https://census.gov" }]);
  });

  it("processes a mixed batch in order", async () => {
    const fill = async (key: string) =>
      key === "a" ? { value: "10", citation: "https://bls.gov" } : null;
    const out = await gapFillPayload(
      [
        { key: "a", value: null },
        { key: "b", value: "held" },
        { key: "c", value: "" },
      ],
      fill,
    );
    expect(out).toEqual([
      { key: "a", value: "10", citation: "https://bls.gov" },
      { key: "b", value: "held" },
      { key: "c", value: "[Need: c]", needed: true },
    ]);
  });
});
