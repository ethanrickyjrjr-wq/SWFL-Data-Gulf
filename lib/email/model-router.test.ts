import { describe, expect, it } from "bun:test";
import { resolveEmailModel } from "./model-router";

const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-4-6";
const OPUS = "claude-opus-4-8";

describe("resolveEmailModel", () => {
  it("defaults to haiku when mode is undefined", () => {
    expect(resolveEmailModel(undefined)).toBe(HAIKU);
  });

  it("defaults to haiku when called with no argument", () => {
    expect(resolveEmailModel()).toBe(HAIKU);
  });

  it("maps 'interactive' -> haiku", () => {
    expect(resolveEmailModel("interactive")).toBe(HAIKU);
  });

  it("maps 'haiku' -> haiku", () => {
    expect(resolveEmailModel("haiku")).toBe(HAIKU);
  });

  it("maps 'quality' -> sonnet", () => {
    expect(resolveEmailModel("quality")).toBe(SONNET);
  });

  it("maps 'snicklefritz' -> sonnet", () => {
    expect(resolveEmailModel("snicklefritz")).toBe(SONNET);
  });

  it("maps 'sonnet' -> sonnet", () => {
    expect(resolveEmailModel("sonnet")).toBe(SONNET);
  });

  it("maps 'max' -> opus", () => {
    expect(resolveEmailModel("max")).toBe(OPUS);
  });

  it("maps 'opus' -> opus", () => {
    expect(resolveEmailModel("opus")).toBe(OPUS);
  });

  it("falls back to haiku for an unknown mode", () => {
    expect(resolveEmailModel("banana")).toBe(HAIKU);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveEmailModel("  Opus ")).toBe(OPUS);
    expect(resolveEmailModel("QUALITY")).toBe(SONNET);
  });
});
