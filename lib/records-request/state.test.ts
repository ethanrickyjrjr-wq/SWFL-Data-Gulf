import { test, expect } from "bun:test";
import { nextState, STATES, TERMINAL, ACTIONS } from "./state";

test("legal happy-path transitions advance", () => {
  expect(nextState("drafted", "send")).toBe("filed");
  expect(nextState("filed", "ack")).toBe("acknowledged");
  expect(nextState("acknowledged", "quote")).toBe("cost_quoted");
  expect(nextState("cost_quoted", "approveCost")).toBe("cost_approved");
  expect(nextState("cost_approved", "fulfill")).toBe("fulfilled");
  expect(nextState("fulfilled", "land")).toBe("landed");
});

test("no-charge path: acknowledged -> fulfilled directly", () => {
  expect(nextState("acknowledged", "fulfill")).toBe("fulfilled");
});

test("quote may arrive on the first reply (from filed)", () => {
  expect(nextState("filed", "quote")).toBe("cost_quoted");
});

test("deny and withdraw are reachable from open states", () => {
  expect(nextState("acknowledged", "deny")).toBe("denied");
  expect(nextState("drafted", "withdraw")).toBe("withdrawn");
});

test("illegal transitions throw", () => {
  expect(() => nextState("filed", "land")).toThrow(/illegal transition/);
  expect(() => nextState("acknowledged", "approveCost")).toThrow(/illegal transition/);
  expect(() => nextState("landed", "withdraw")).toThrow(/illegal transition/);
});

test("unknown action throws", () => {
  expect(() => nextState("drafted", "frobnicate")).toThrow(/unknown action/);
});

test("exports are shaped as expected", () => {
  expect(STATES).toContain("cost_approved");
  expect(TERMINAL.has("landed")).toBe(true);
  expect(ACTIONS).toContain("approveCost");
});
