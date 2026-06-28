import { describe, it, expect } from "bun:test";
import {
  specAgeInDays,
  specSlug,
  queueStatus,
  isReferencedByCheck,
  isDeadSpec,
  isDeadHandoff,
} from "./assistant-lib.mjs";

describe("specAgeInDays", () => {
  it("returns large number for old filename date", () => {
    expect(specAgeInDays("docs/specs/2020-01-01-old-thing-design.md")).toBeGreaterThan(1000);
  });
  it("returns Infinity for filename with no date prefix", () => {
    expect(specAgeInDays("CLEANED.md")).toBe(Infinity);
  });
  it("returns ~0 for today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(specAgeInDays(`${today}-some-thing-design.md`)).toBeLessThan(2);
  });
});

describe("specSlug", () => {
  it("strips date prefix and -design.md suffix", () => {
    expect(specSlug("2026-05-16-tool-research-personalization-design.md")).toBe(
      "tool-research-personalization",
    );
  });
  it("strips date prefix and plain .md suffix", () => {
    expect(specSlug("2026-06-08-corridor-build-standard.md")).toBe("corridor-build-standard");
  });
  it("handles basename inside a path", () => {
    expect(specSlug("docs/superpowers/specs/2026-06-08-foo-bar-design.md")).toBe("foo-bar");
  });
});

describe("queueStatus", () => {
  const queue = `
- [x] **Housing brain** (housing-swfl) done
- [~] **one-assistant** building now
- [ ] **zip-report** next up
- **corridor-pulse** mentioned but no bracket
`;
  it("returns done for [x] line containing a keyword from slug", () => {
    expect(queueStatus("housing-swfl", queue)).toBe("done");
  });
  it("returns building for [~] line", () => {
    expect(queueStatus("one-assistant", queue)).toBe("building");
  });
  it("returns next for [ ] line", () => {
    expect(queueStatus("zip-report", queue)).toBe("next");
  });
  it("returns null when slug keywords not found", () => {
    expect(queueStatus("completely-missing-thing", queue)).toBeNull();
  });
  it("ignores short keywords under 5 chars", () => {
    // 'zip' is 3 chars — filtered out; 'report' is 6 — matches [ ] line
    expect(queueStatus("zip-report", queue)).toBe("next");
  });
});

describe("isReferencedByCheck", () => {
  it("returns true when slug is substring of a check key", () => {
    expect(isReferencedByCheck("housing-swfl", ["housing_swfl_live_verify", "other_check"])).toBe(
      true,
    );
  });
  it("returns false when slug not in any check key", () => {
    expect(
      isReferencedByCheck("old-thing", ["housing_swfl_live_verify", "zip_report_verify"]),
    ).toBe(false);
  });
  it("returns false for empty check list", () => {
    expect(isReferencedByCheck("any-slug", [])).toBe(false);
  });
});

describe("isDeadSpec", () => {
  const doneQueue = "- [x] **Housing brain** (housing-swfl) done and shipped";

  it("marks spec dead when [x] in queue, no open check, old file", () => {
    const result = isDeadSpec("2020-01-01-housing-swfl-design.md", doneQueue, []);
    expect(result.dead).toBe(true);
    expect(result.reason).toMatch(/build-queue \[x\]/);
  });

  it("keeps spec alive when referenced by open check", () => {
    const result = isDeadSpec("2020-01-01-housing-swfl-design.md", doneQueue, [
      "housing_swfl_live_verify",
    ]);
    expect(result.dead).toBe(false);
    expect(result.reason).toMatch(/open check/);
  });

  it("keeps spec alive when queue status is building", () => {
    const buildingQueue = "- [~] **Housing brain** (housing-swfl) in progress";
    const result = isDeadSpec("2020-01-01-housing-swfl-design.md", buildingQueue, []);
    expect(result.dead).toBe(false);
  });

  it("keeps spec alive when no queue mention and age < 60 days", () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = isDeadSpec(`${today}-brand-new-design.md`, "", []);
    expect(result.dead).toBe(false);
  });

  it("marks spec dead when not in queue and age >= 60 days", () => {
    const result = isDeadSpec("2020-01-01-orphan-research-design.md", "", []);
    expect(result.dead).toBe(true);
    expect(result.reason).toMatch(/not in build-queue/);
  });
});

describe("isDeadHandoff", () => {
  it("marks SHIPPED handoff as dead", () => {
    const result = isDeadHandoff("2026-06-13-charts-rebuild-SHIPPED.md", []);
    expect(result.dead).toBe(true);
    expect(result.reason).toMatch(/signals completion/);
  });

  it("marks old handoff (>21 days) as dead when no open check", () => {
    const result = isDeadHandoff("2020-01-01-some-handoff.md", []);
    expect(result.dead).toBe(true);
    expect(result.reason).toMatch(/days old/);
  });

  it("keeps handoff alive when referenced by open check", () => {
    const result = isDeadHandoff("2020-01-01-charts-rebuild.md", ["charts_rebuild_live_verify"]);
    expect(result.dead).toBe(false);
  });

  it("keeps recent handoff alive", () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = isDeadHandoff(`${today}-fresh-handoff.md`, []);
    expect(result.dead).toBe(false);
  });
});
