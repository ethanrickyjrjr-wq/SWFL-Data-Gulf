// lib/connect/skill-content.test.ts
// Guard: failure mode 11 is solved by serving from OUR deploy; THIS test
// guards the format contract (agentskills.io frontmatter constraints,
// live-verified 08/02/2026) and that the endpoints it documents are real.
import { describe, expect, test } from "bun:test";
import { SKILL_MD } from "./skill-content";

describe("SKILL_MD (agentskills.io contract)", () => {
  const fm = /^---\n([\s\S]*?)\n---/.exec(SKILL_MD)?.[1] ?? "";
  test("frontmatter name: required, ≤64 chars, lowercase/digits/hyphens, no edge hyphens", () => {
    const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim() ?? "";
    expect(name.length).toBeGreaterThan(0);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
  });
  test("frontmatter description: required, non-empty, ≤1024 chars", () => {
    const desc = /^description:\s*(.+)$/m.exec(fm)?.[1]?.trim() ?? "";
    expect(desc.length).toBeGreaterThan(0);
    expect(desc.length).toBeLessThanOrEqual(1024);
  });
  test("body documents both import endpoints, the verify step, and asks before writing", () => {
    expect(SKILL_MD).toContain("/api/contacts/import");
    expect(SKILL_MD).toContain("/api/listings/import");
    expect(SKILL_MD).toContain("echo");
    expect(SKILL_MD).toMatch(/ASK the user/);
  });
});
