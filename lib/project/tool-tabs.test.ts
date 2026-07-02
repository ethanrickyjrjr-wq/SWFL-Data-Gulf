// lib/project/tool-tabs.test.ts
import { describe, expect, test } from "bun:test";
import { activeTool } from "./tool-tabs";

describe("activeTool", () => {
  test("project root → overview", () => {
    expect(activeTool("/project/abc123", "abc123")).toBe("overview");
    expect(activeTool("/project/abc123/", "abc123")).toBe("overview");
  });
  test("email-lab → email", () => {
    expect(activeTool("/project/abc123/email-lab", "abc123")).toBe("email");
  });
  test("social → social", () => {
    expect(activeTool("/project/abc123/social", "abc123")).toBe("social");
  });
  test("unknown subpath → overview", () => {
    expect(activeTool("/project/abc123/whatever", "abc123")).toBe("overview");
  });
});
