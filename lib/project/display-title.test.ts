// lib/project/display-title.test.ts
import { describe, expect, test } from "bun:test";
import { displayProjectTitle } from "./display-title";

describe("displayProjectTitle", () => {
  test("strips ', FL 33991' state+zip tail", () => {
    expect(displayProjectTitle("2006 SW 15th Ave, Cape Coral, FL 33991")).toBe(
      "2006 SW 15th Ave, Cape Coral",
    );
  });
  test("strips ', FL' state-only tail", () => {
    expect(displayProjectTitle("2006 SW 15th Ave, Cape Coral, FL")).toBe(
      "2006 SW 15th Ave, Cape Coral",
    );
  });
  test("strips spelled-out Florida", () => {
    expect(displayProjectTitle("123 Main St, Naples, Florida")).toBe("123 Main St, Naples");
  });
  test("strips zip+4", () => {
    expect(displayProjectTitle("123 Main St, Naples, FL 34102-1234")).toBe("123 Main St, Naples");
  });
  test("strips bare trailing ZIP (auto-named 'Place 33931' projects)", () => {
    expect(displayProjectTitle("Fort Myers Beach 33931")).toBe("Fort Myers Beach");
  });
  test("non-address titles pass through", () => {
    expect(displayProjectTitle("Del Prado Test")).toBe("Del Prado Test");
  });
  test("a lone ZIP is not stripped to empty", () => {
    expect(displayProjectTitle("33901")).toBe("33901");
  });
  test("null/empty → Untitled project", () => {
    expect(displayProjectTitle(null)).toBe("Untitled project");
    expect(displayProjectTitle("  ")).toBe("Untitled project");
  });
});
