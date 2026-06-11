import { test, expect } from "bun:test";
import { highlighterUiEnabled } from "./flag";

test("ON by default when unset", () => {
  expect(highlighterUiEnabled({})).toBe(true);
});

test("ON for empty / unrecognized values (default-on)", () => {
  expect(highlighterUiEnabled({ HIGHLIGHTER_UI: "" })).toBe(true);
  expect(highlighterUiEnabled({ HIGHLIGHTER_UI: "1" })).toBe(true);
  expect(highlighterUiEnabled({ HIGHLIGHTER_UI: "true" })).toBe(true);
  expect(highlighterUiEnabled({ HIGHLIGHTER_UI: "on" })).toBe(true);
});

test("OFF only when explicitly disabled", () => {
  expect(highlighterUiEnabled({ HIGHLIGHTER_UI: "0" })).toBe(false);
  expect(highlighterUiEnabled({ HIGHLIGHTER_UI: "false" })).toBe(false);
});
