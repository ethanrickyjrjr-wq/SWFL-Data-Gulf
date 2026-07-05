import { describe, expect, test } from "bun:test";
import { initialPhoneTab } from "./phone-tabs";

// Spec 2026-07-05-grid-lab-phone-design: below lg the shell shows ONE pane,
// and where the visitor lands is a promise made by the door they came through.
describe("initialPhoneTab", () => {
  test("a recipe arrival (hero / pill 'Make this') lands on Build — their job is to fire it", () => {
    expect(initialPhoneTab({ hasRecipe: true })).toBe("build");
  });

  test("a plain / ?zip= arrival lands on Preview — the door promised 'opens prebuilt'", () => {
    expect(initialPhoneTab({ hasRecipe: false })).toBe("preview");
  });
});
