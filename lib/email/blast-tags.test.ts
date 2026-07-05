// lib/email/blast-tags.test.ts
import { describe, expect, it } from "bun:test";
import { blastTags } from "./blast-tags";

describe("blastTags", () => {
  it("emits did + tpl tags, Resend-safe charset", () => {
    expect(blastTags("123e4567-e89b-12d3-a456-426614174000", "block-canvas")).toEqual([
      { name: "did", value: "123e4567-e89b-12d3-a456-426614174000" },
      { name: "tpl", value: "block-canvas" },
    ]);
  });

  it("strips characters outside [A-Za-z0-9_-]", () => {
    expect(blastTags("a b", "e!mail")).toEqual([
      { name: "did", value: "ab" },
      { name: "tpl", value: "email" },
    ]);
  });

  it("adds the campaign tag when the deliverable was campaign-seeded", () => {
    expect(blastTags("abc-123", "block-canvas", "agent-launch")).toContainEqual({
      name: "campaign",
      value: "agent-launch",
    });
  });

  it("null/undefined/unsafe campaign key = no campaign tag", () => {
    expect(blastTags("abc-123", "block-canvas", null)).toHaveLength(2);
    expect(blastTags("abc-123", "block-canvas")).toHaveLength(2);
    expect(blastTags("abc-123", "block-canvas", "!!!")).toHaveLength(2);
  });
});
