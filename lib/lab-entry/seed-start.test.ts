import { describe, expect, it } from "bun:test";
import { planSeedStart } from "./seed-start";

describe("planSeedStart", () => {
  const base = { knownAddress: null, knownArea: null, blankChosen: false };

  it("blank chosen always wins", () => {
    expect(planSeedStart({ ...base, subject: "address", blankChosen: true })).toEqual({
      mode: "blank",
    });
    expect(planSeedStart({ ...base, subject: "none", blankChosen: true })).toEqual({
      mode: "blank",
    });
  });

  it("address template + known address → skip-and-build", () => {
    expect(planSeedStart({ ...base, subject: "address", knownAddress: "123 Palm Ave" })).toEqual({
      mode: "build",
      subjectValue: "123 Palm Ave",
    });
  });

  it("address template + no address → ask (even when an area is known)", () => {
    expect(planSeedStart({ ...base, subject: "address", knownArea: "Cape Coral" })).toEqual({
      mode: "ask",
      inputKind: "address",
    });
  });

  it("area template + known area → skip-and-build", () => {
    expect(planSeedStart({ ...base, subject: "area", knownArea: "33904" })).toEqual({
      mode: "build",
      subjectValue: "33904",
    });
  });

  it("area template with only an address known still asks — an address is not an area", () => {
    expect(planSeedStart({ ...base, subject: "area", knownAddress: "123 Palm Ave" })).toEqual({
      mode: "ask",
      inputKind: "area",
    });
  });

  it("no-subject template → fill-or-blank choice", () => {
    expect(planSeedStart({ ...base, subject: "none" })).toEqual({ mode: "choice" });
  });

  it("blank/whitespace known values do not count as known", () => {
    expect(planSeedStart({ ...base, subject: "address", knownAddress: "  " })).toEqual({
      mode: "ask",
      inputKind: "address",
    });
  });

  it("known values are trimmed into the build plan", () => {
    expect(planSeedStart({ ...base, subject: "area", knownArea: "  Cape Coral " })).toEqual({
      mode: "build",
      subjectValue: "Cape Coral",
    });
  });
});
