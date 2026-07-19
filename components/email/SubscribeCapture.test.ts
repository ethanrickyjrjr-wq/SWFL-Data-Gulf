// This repo has no DOM test environment by design — tests are bun:test + pure.
// SubscribeCapture exports its body builder + activation-visibility logic for that.
import { describe, test, expect } from "bun:test";
import { activationFieldsVisible, buildSubscribeBody } from "./SubscribeCapture";

const base = { email: "a@b.com", source: "zip-report", zip: "", consent: false };

describe("buildSubscribeBody", () => {
  test("presetZip reaches the POST body without consent fields", () => {
    const body = buildSubscribeBody({ ...base, activation: false, presetZip: "33931" });
    expect(body).toEqual({ email: "a@b.com", source: "zip-report", zip: "33931" });
  });

  test("valid presetZip wins even if activation was requested", () => {
    const body = buildSubscribeBody({
      ...base,
      activation: true,
      presetZip: "33931",
      zip: "99999",
      consent: true,
    });
    expect(body).toEqual({ email: "a@b.com", source: "zip-report", zip: "33931" });
  });

  test("invalid presetZip is ignored — falls back to the plain opt-in body", () => {
    const body = buildSubscribeBody({ ...base, activation: false, presetZip: "339" });
    expect(body).toEqual({ email: "a@b.com", source: "zip-report" });
  });

  test("activation mode without presetZip keeps typed zip + consent", () => {
    const body = buildSubscribeBody({ ...base, activation: true, zip: "33901", consent: true });
    expect(body).toEqual({
      email: "a@b.com",
      source: "zip-report",
      zip: "33901",
      consent: true,
    });
  });

  test("plain digest opt-in body is unchanged", () => {
    const body = buildSubscribeBody({ ...base, activation: false });
    expect(body).toEqual({ email: "a@b.com", source: "zip-report" });
  });
});

describe("activationFieldsVisible", () => {
  test("presetZip suppresses the activation ZIP box + consent checkbox", () => {
    expect(activationFieldsVisible(true, "33931")).toBe(false);
  });

  test("activation without presetZip still shows the fields", () => {
    expect(activationFieldsVisible(true)).toBe(true);
    expect(activationFieldsVisible(true, "not-a-zip")).toBe(true);
  });

  test("non-activation never shows the fields", () => {
    expect(activationFieldsVisible(false)).toBe(false);
    expect(activationFieldsVisible(false, "33931")).toBe(false);
  });
});
