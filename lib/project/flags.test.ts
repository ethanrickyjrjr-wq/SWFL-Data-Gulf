import { describe, it, expect } from "bun:test";
import { promptPolishEnabled, prebuildEnabled, assembleLlmEnabled } from "./flags";

const OFF = {};
const ON_1 = (key: string) => ({ [key]: "1" });
const ON_TRUE = (key: string) => ({ [key]: "true" });

describe("promptPolishEnabled", () => {
  it("is OFF by default", () => expect(promptPolishEnabled(OFF)).toBe(false));
  it("is ON with '1'", () => expect(promptPolishEnabled(ON_1("PROMPT_POLISH_ENABLED"))).toBe(true));
  it("is ON with 'true'", () =>
    expect(promptPolishEnabled(ON_TRUE("PROMPT_POLISH_ENABLED"))).toBe(true));
});

describe("prebuildEnabled", () => {
  it("is OFF by default", () => expect(prebuildEnabled(OFF)).toBe(false));
  it("is ON with '1'", () => expect(prebuildEnabled(ON_1("PREBUILD_ENABLED"))).toBe(true));
  it("is ON with 'true'", () => expect(prebuildEnabled(ON_TRUE("PREBUILD_ENABLED"))).toBe(true));
});

describe("assembleLlmEnabled", () => {
  it("is OFF by default", () => expect(assembleLlmEnabled(OFF)).toBe(false));
  it("is ON with '1'", () => expect(assembleLlmEnabled(ON_1("ASSEMBLE_LLM_ENABLED"))).toBe(true));
  it("is ON with 'true'", () =>
    expect(assembleLlmEnabled(ON_TRUE("ASSEMBLE_LLM_ENABLED"))).toBe(true));
});
