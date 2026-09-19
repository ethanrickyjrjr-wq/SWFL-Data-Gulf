import { describe, it, expect } from "bun:test";
import { MIN_POINTS, isDateColumn, numericQualifyingColumns } from "./chart-from-metrics.mts";
import type { BrainOutputDetailTable } from "../types/brain-output.mts";

describe("chart-from-metrics exports", () => {
  it("MIN_POINTS is 3", () => {
    expect(MIN_POINTS).toBe(3);
  });

  it("isDateColumn matches date/year/month/period/quarter/week (case-insensitive)", () => {
    expect(isDateColumn("date")).toBe(true);
    expect(isDateColumn("year")).toBe(true);
    expect(isDateColumn("Month")).toBe(true);
    expect(isDateColumn("period")).toBe(true);
    expect(isDateColumn("quarter")).toBe(true);
    expect(isDateColumn("week")).toBe(true);
    expect(isDateColumn("zip")).toBe(false);
    expect(isDateColumn("value")).toBe(false);
    expect(isDateColumn("corridor")).toBe(false);
  });

  it("numericQualifyingColumns returns non-date columns with >= MIN_POINTS numeric rows", () => {
    const table: BrainOutputDetailTable = {
      id: "test-table",
      title: "Test table",
      source: {
        url: "https://example.test",
        fetched_at: "2026-09-18T00:00:00Z",
        tier: 1,
        citation: "Test fixture",
      },
      grain: "zip",
      columns: [
        { id: "zip", label: "ZIP" },
        { id: "aal_usd", label: "AAL ($)", display_format: "currency" },
      ],
      rows: [
        { key: "33901", label: "33901", cells: { zip: "33901", aal_usd: 12000 } },
        { key: "33908", label: "33908", cells: { zip: "33908", aal_usd: 30074 } },
        { key: "33931", label: "33931", cells: { zip: "33931", aal_usd: 18500 } },
      ],
    };
    const cols = numericQualifyingColumns(table);
    expect(cols).toHaveLength(1);
    expect(cols[0].id).toBe("aal_usd");
    expect(cols[0].numericRowCount).toBe(3);
  });

  it("numericQualifyingColumns excludes date columns", () => {
    const table: BrainOutputDetailTable = {
      id: "test-table",
      title: "Test table",
      source: {
        url: "https://example.test",
        fetched_at: "2026-09-18T00:00:00Z",
        tier: 1,
        citation: "Test fixture",
      },
      grain: "month",
      columns: [
        { id: "date", label: "Month" },
        { id: "value", label: "Index", display_format: "raw" },
      ],
      rows: [
        { key: "2025-01", label: "2025-01", cells: { date: "2025-01", value: 102.1 } },
        { key: "2025-02", label: "2025-02", cells: { date: "2025-02", value: 104.5 } },
        { key: "2025-03", label: "2025-03", cells: { date: "2025-03", value: 108.0 } },
      ],
    };
    const cols = numericQualifyingColumns(table);
    expect(cols.map((c) => c.id)).not.toContain("date");
    expect(cols.map((c) => c.id)).toContain("value");
  });

  it("numericQualifyingColumns returns empty when no column has >= MIN_POINTS numeric rows", () => {
    const table: BrainOutputDetailTable = {
      id: "test-table",
      title: "Test table",
      source: {
        url: "https://example.test",
        fetched_at: "2026-09-18T00:00:00Z",
        tier: 1,
        citation: "Test fixture",
      },
      grain: "corridor",
      columns: [{ id: "name", label: "Name" }],
      rows: [
        { key: "A", label: "A", cells: { name: "Alpha" } },
        { key: "B", label: "B", cells: { name: "Beta" } },
      ],
    };
    expect(numericQualifyingColumns(table)).toHaveLength(0);
  });
});
