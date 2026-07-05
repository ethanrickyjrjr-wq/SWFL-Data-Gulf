import { describe, it, expect } from "bun:test";
import { registerBrandPanel, revealBrandPanel } from "./reveal-brand-panel";

describe("brand-reveal registry", () => {
  it("returns false with no handler registered", () => {
    expect(revealBrandPanel()).toBe(false);
  });

  it("claims via the newest handler and unregisters cleanly", () => {
    const calls: string[] = [];
    const un1 = registerBrandPanel(() => calls.push("one"));
    const un2 = registerBrandPanel(() => calls.push("two"));
    expect(revealBrandPanel()).toBe(true);
    expect(calls).toEqual(["two"]); // newest wins (innermost surface)
    un2();
    expect(revealBrandPanel()).toBe(true);
    expect(calls).toEqual(["two", "one"]);
    un1();
    expect(revealBrandPanel()).toBe(false);
  });

  it("double-unregister is a no-op", () => {
    const un = registerBrandPanel(() => {});
    un();
    un();
    expect(revealBrandPanel()).toBe(false);
  });
});
