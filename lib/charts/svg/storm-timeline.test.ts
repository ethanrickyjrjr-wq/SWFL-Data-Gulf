import { test, expect } from "bun:test";
import { stormTimelineSvg } from "./storm-timeline";

const EVENTS = [
  { label: "Charley", date: "2004-08-13", amount_usd: 890_000_000 },
  { label: "Wilma", date: "2005-10-24", amount_usd: 410_000_000 },
  { label: "Ian", date: "2022-09-28", amount_usd: 4_800_000_000 },
  { label: "Idalia", date: "2023-08-30", amount_usd: 320_000_000 },
];

test("stormTimelineSvg emits a self-contained SVG with the title + USD ticks", () => {
  const svg = stormTimelineSvg(EVENTS, { title: "NFIP paid claims by storm", accent: "#e05c2e" });
  expect(svg).toContain("<svg");
  expect(svg).toContain("</svg>");
  expect(svg).toContain("NFIP paid claims by storm");
  // Y-axis top tick = domainMax (maxVal * 1.15 = 5.52B) → "$5.5B".
  expect(svg).toContain("$5.5B");
  expect(svg).toContain("Amount (USD)");
});

test("columns are ordered by date and labelled '{event} {year}'", () => {
  const svg = stormTimelineSvg(EVENTS, { title: "Claims", accent: "#e05c2e" });
  const iCharley = svg.indexOf("Charley 2004");
  const iIan = svg.indexOf("Ian 2022");
  const iIdalia = svg.indexOf("Idalia 2023");
  expect(iCharley).toBeGreaterThan(-1);
  expect(iIan).toBeGreaterThan(-1);
  // date order: Charley(2004) before Ian(2022) before Idalia(2023).
  expect(iCharley).toBeLessThan(iIan);
  expect(iIan).toBeLessThan(iIdalia);
});

test("the MAX column gets the full accent; others get accent at 60% (accent+'99')", () => {
  const svg = stormTimelineSvg(EVENTS, { title: "Claims", accent: "#e05c2e" });
  // Ian is the max → full "#e05c2e" fill present; the dimmed "#e05c2e99" also present.
  expect(svg).toContain('fill="#e05c2e"');
  expect(svg).toContain('fill="#e05c2e99"');
});

test("an optional baseline draws a dashed reference line + labelled value", () => {
  const svg = stormTimelineSvg(EVENTS, {
    title: "Claims",
    accent: "#e05c2e",
    baseline: 900_000_000,
  });
  expect(svg).toContain('stroke="#60a5fa"');
  expect(svg).toContain("Baseline $900.0M");
});

test("the as-of caption is MM/DD/YYYY, never the raw ISO (Rule 2)", () => {
  const svg = stormTimelineSvg(EVENTS, {
    title: "Claims",
    accent: "#e05c2e",
    source: "env-swfl",
    asOf: "2026-06-30",
  });
  expect(svg).toContain("06/30/2026");
  expect(svg).not.toContain("2026-06-30");
  expect(svg).toContain("env-swfl");
});

test("empty input still returns a valid (chart-less) SVG, never throws", () => {
  const svg = stormTimelineSvg([], { title: "Claims", accent: "#e05c2e" });
  expect(svg).toContain("<svg");
  expect(svg).toContain("</svg>");
});
