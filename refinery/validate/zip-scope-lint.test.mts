import { describe, expect, it } from "bun:test";
import { lintZipScope } from "./zip-scope-lint.mts";
import type { BrainOutput } from "../types/brain-output.mts";

function table(id: string, keys: string[]): BrainOutput["detail_tables"] {
  return [
    {
      id,
      title: id,
      grain: "zip",
      columns: [],
      rows: keys.map((k) => ({ key: k, label: k, cells: {} })),
      source: { citation: "test", url: "" } as never,
    },
  ];
}

describe("zip-scope-lint", () => {
  it("passes an all-core table", () => {
    const r = lintZipScope({ detail_tables: table("housing_by_zip", ["33901", "34102", "33914"]) });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("fails on a non-core SWFL ZIP (Sarasota)", () => {
    const r = lintZipScope({ detail_tables: table("housing_by_zip", ["33901", "34285"]) });
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].key).toBe("34285");
    expect(r.violations[0].table).toBe("housing_by_zip");
  });

  it("fails on a pure-leak ZIP (Manatee spillover, not in the crosswalk)", () => {
    const r = lintZipScope({ detail_tables: table("seller_stress_by_zip", ["34102", "34205"]) });
    expect(r.ok).toBe(false);
    expect(r.violations[0].key).toBe("34205");
  });

  it("ignores non-ZIP keys (month, city, corridor)", () => {
    const r = lintZipScope({
      detail_tables: table("tier_by_month", ["2026-01", "cape_coral", "us41-corridor"]),
    });
    expect(r.ok).toBe(true);
  });

  it("no-op when detail_tables is absent (master, leaf brains with no finer grain)", () => {
    expect(lintZipScope({ detail_tables: undefined }).ok).toBe(true);
  });

  it("reports every leaking row across multiple tables", () => {
    const r = lintZipScope({
      detail_tables: [
        ...table("a_by_zip", ["33901", "34285"])!,
        ...table("b_by_zip", ["33440", "34102"])!,
      ],
    });
    expect(r.violations.map((v) => v.key).sort()).toEqual(["33440", "34285"]);
  });
});
