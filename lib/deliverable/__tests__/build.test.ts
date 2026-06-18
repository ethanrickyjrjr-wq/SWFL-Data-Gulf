import { describe, it, expect } from "bun:test";
import { renderItem } from "../build";

describe("renderItem — file kind", () => {
  const base = {
    id: "1",
    added_at: new Date().toISOString(),
    origin: "web" as const,
    kind: "file" as const,
    storage_path: "uid/proj/abc.pdf",
    mime: "application/pdf",
    size: 1000,
  };

  it("renders the storage path when no extracted_text", () => {
    expect(renderItem(base, 1)).toBe("[1] FILE — uid/proj/abc.pdf (pdf, content not available)");
  });

  it("renders the caption when no extracted_text", () => {
    expect(renderItem({ ...base, caption: "Beach Condo Flyer" }, 1)).toBe(
      "[1] FILE — Beach Condo Flyer (pdf, content not available)",
    );
  });

  it("renders extracted DOCUMENT content when present", () => {
    const result = renderItem(
      {
        ...base,
        caption: "Beach Condo Flyer",
        extracted_text: "2BR/2BA, $450,000, 1,200 sqft, Fort Myers Beach FL 33931",
        extraction_status: "done" as const,
      },
      1,
    );
    expect(result).toContain("[1] DOCUMENT — Beach Condo Flyer");
    expect(result).toContain("2BR/2BA, $450,000");
  });

  it("falls back to the file label when extracted_text is blank", () => {
    const result = renderItem(
      { ...base, extracted_text: "   ", extraction_status: "done" as const },
      2,
    );
    expect(result).toBe("[2] FILE — uid/proj/abc.pdf (pdf, content not available)");
  });
});
