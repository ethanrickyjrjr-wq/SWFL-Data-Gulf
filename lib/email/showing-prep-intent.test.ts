import { test, expect } from "bun:test";
import { isShowingPrepPrompt } from "./showing-prep-intent";

test("matches the showing-prep recipe wording", () => {
  expect(isShowingPrepPrompt("Build a showing prep packet for 123 Main St")).toBe(true);
  expect(isShowingPrepPrompt("make me a showing-prep packet for my 2pm")).toBe(true);
  expect(isShowingPrepPrompt("prep packet for 16447 Rainbow Meadows Ct")).toBe(true);
});

test("does not match new-listing / just-sold / market-update wording", () => {
  expect(isShowingPrepPrompt("Build a new-listing announcement email for 123 X Rd")).toBe(false);
  expect(isShowingPrepPrompt("Build a just-sold email for 123 X Rd")).toBe(false);
  expect(isShowingPrepPrompt("my monthly market update on home prices")).toBe(false);
});

test("empty / nullish is false, never throws", () => {
  expect(isShowingPrepPrompt("")).toBe(false);
  expect(isShowingPrepPrompt(undefined as unknown as string)).toBe(false);
});
