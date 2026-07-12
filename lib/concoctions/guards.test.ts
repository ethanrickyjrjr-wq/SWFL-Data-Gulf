import { describe, it, expect } from "bun:test";
import { evaluateGuards } from "./guards";
import type { ColumnSpec, ConcoctionRow } from "./types";

const col = (guards: ColumnSpec["guards"]): ColumnSpec => ({
  key: "x",
  label: "X",
  kind: "measure",
  format: "number",
  guards,
});
const rows = (vals: (number | null)[]): ConcoctionRow[] => vals.map((x) => ({ x }));

describe("evaluateGuards — the cap-rate lesson as law", () => {
  it("near-constant column fails minDistinct (6.7×22, 8.3×3, null×2)", () => {
    const capRateish = rows([...Array(22).fill(6.7), ...Array(3).fill(8.3), null, null]);
    const r = evaluateGuards(capRateish, col({ minDistinct: 5 }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toContain("distinct");
  });
  it("spread-bearing column passes (rent-PSF-like)", () => {
    const r = evaluateGuards(
      rows([16.04, 22.5, 31.0, 42.5, 60.84]),
      col({ minDistinct: 5, minSpreadRatio: 0.2 }),
    );
    expect(r.ok).toBe(true);
  });
  it("near-zero column fails minSpreadRatio (sales_90d-like)", () => {
    const r = evaluateGuards(rows([0, 0, 1, 0, 2, 0, 1]), col({ minDistinct: 5 }));
    expect(r.ok).toBe(false);
  });
  it("mostly-null column fails maxNullShare", () => {
    const r = evaluateGuards(rows([null, null, null, 5]), col({ maxNullShare: 0.5 }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toContain("null");
  });
  it("no guards → always ok", () => {
    expect(evaluateGuards(rows([1, 1, 1]), col(undefined)).ok).toBe(true);
  });
  it("fewer than 2 non-null values fails any spread guard", () => {
    const r = evaluateGuards(rows([7, null]), col({ minSpreadRatio: 0.1 }));
    expect(r.ok).toBe(false);
  });
});
