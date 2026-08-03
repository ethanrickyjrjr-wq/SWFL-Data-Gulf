import { describe, it, expect } from "bun:test";
import { projectItemSchema } from "../items";

describe("file item schema — extraction fields", () => {
  const base = {
    id: "abc",
    added_at: new Date().toISOString(),
    origin: "web" as const,
    kind: "file" as const,
    storage_path: "uid/proj/uuid.pdf",
    mime: "application/pdf",
    size: 12345,
  };

  it("accepts extraction fields", () => {
    const result = projectItemSchema.safeParse({
      ...base,
      extracted_text: "2BR/2BA, $450,000, Fort Myers Beach FL 33931",
      extraction_status: "done",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a file item without extraction fields (back-compat)", () => {
    const result = projectItemSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid extraction_status", () => {
    const result = projectItemSchema.safeParse({ ...base, extraction_status: "bogus" });
    expect(result.success).toBe(false);
  });
});

describe("user_figure kind", () => {
  // Guard: failure mode 3 (spec 2026-08-03) — a figure without label+value
  // cannot enter the spine; provenance (stated_by) is mandatory.
  const base = { id: "i1", added_at: "2026-08-03T00:00:00Z", origin: "web" as const };

  it("valid figure parses", () => {
    const parsed = projectItemSchema.parse({
      ...base,
      kind: "user_figure",
      label: "My average days to close",
      value: "21",
      unit: "days",
      as_of: "08/03/2026",
      stated_by: "user",
    });
    expect(parsed.kind).toBe("user_figure");
  });

  it("figure without value is rejected", () => {
    const result = projectItemSchema.safeParse({
      ...base,
      kind: "user_figure",
      label: "x",
      stated_by: "user",
    });
    expect(result.success).toBe(false);
  });

  it("empty label is rejected", () => {
    const result = projectItemSchema.safeParse({
      ...base,
      kind: "user_figure",
      label: "",
      value: "21",
      stated_by: "user",
    });
    expect(result.success).toBe(false);
  });
});
