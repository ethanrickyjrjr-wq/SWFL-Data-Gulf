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
