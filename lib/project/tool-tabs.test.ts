// lib/project/tool-tabs.test.ts
import { describe, expect, test } from "bun:test";
import { activeTool, projectEntry } from "./tool-tabs";

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
  test("outside the project (the hub) → null, no false Overview highlight", () => {
    expect(activeTool("/project", "abc123")).toBeNull();
    expect(activeTool("/project/other456/email-lab", "abc123")).toBeNull();
  });
});

describe("projectEntry", () => {
  test("no remembered doc → the project's email lab base", () => {
    expect(projectEntry("abc123", null)).toBe("/project/abc123/email-lab");
  });
  test("remembered doc → reopens it via ?did=", () => {
    expect(projectEntry("abc123", "d9")).toBe("/project/abc123/email-lab?did=d9");
  });
});
