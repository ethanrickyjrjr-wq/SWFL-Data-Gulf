import { describe, it, expect } from "bun:test";
import {
  shouldRender,
  reportTrail,
  zipReportTrail,
  corridorTrail,
  sourceTrail,
  methodTrail,
  projectTrail,
  HOME_CRUMB,
} from "./breadcrumbs";

/**
 * Pure breadcrumb trail builders (B2). The <Breadcrumbs/> component is a thin mapper
 * over these; the repo has no component-render harness, so the real contract — what
 * the trail SAYS and when it renders — is asserted here.
 */

describe("shouldRender (earns its place only past a section index)", () => {
  it("renders a deep trail (Home + leaf)", () => {
    expect(shouldRender(reportTrail("Lee County — Parcel Velocity"))).toBe(true);
  });
  it("does NOT render a bare/one-crumb trail", () => {
    expect(shouldRender([HOME_CRUMB])).toBe(false);
    expect(shouldRender([])).toBe(false);
  });
});

describe("trail builders use the REAL name (never a slug)", () => {
  it("reportTrail leaf is the customer title", () => {
    const t = reportTrail("Southwest Florida — Flood & Environmental Read");
    expect(t.map((c) => c.label)).toEqual([
      "Home",
      "Search",
      "Southwest Florida — Flood & Environmental Read",
    ]);
    expect(t[0].href).toBe("/");
    expect(t[1].href).toBe("/r");
    expect(t[2].href).toBeUndefined(); // leaf is not a link
  });

  it("zipReportTrail combines place + ZIP, ZIP in mono via keyTail", () => {
    const t = zipReportTrail("Fort Myers Beach", "33931");
    expect(t.map((c) => c.label)).toEqual(["Home", "Search", "ZIP Reports", "Fort Myers Beach"]);
    expect(t.find((c) => c.label === "ZIP Reports")?.href).toBe("/r/search");
    expect(t[t.length - 1].keyTail).toBe("33931");
  });

  it("zipReportTrail falls back to 'ZIP' when the place is unknown", () => {
    const t = zipReportTrail(null, "34102");
    expect(t[t.length - 1].label).toBe("ZIP");
    expect(t[t.length - 1].keyTail).toBe("34102");
  });

  it("corridor / source / method carry a non-link sub-section then the real label", () => {
    const corr = corridorTrail("US-41 / Bonita Springs");
    expect(corr.map((c) => c.label)).toEqual([
      "Home",
      "Search",
      "Commercial Real Estate",
      "US-41 / Bonita Springs",
    ]);
    expect(corr.find((c) => c.label === "Commercial Real Estate")?.href).toBe("/r/cre-swfl");
    expect(sourceTrail("Florida DOR — TDT collections").map((c) => c.label)).toEqual([
      "Home",
      "Search",
      "Sources",
      "Florida DOR — TDT collections",
    ]);
    expect(methodTrail("Latest monthly TDT collections (SWFL)").map((c) => c.label)).toEqual([
      "Home",
      "Search",
      "Methods",
      "Latest monthly TDT collections (SWFL)",
    ]);
  });

  it("projectTrail uses the user's title, falling back to 'Project'", () => {
    expect(projectTrail("Gateway Acquisition Memo").map((c) => c.label)).toEqual([
      "Home",
      "Projects",
      "Gateway Acquisition Memo",
    ]);
    expect(projectTrail(null).map((c) => c.label)).toEqual(["Home", "Projects", "Project"]);
    expect(projectTrail("").map((c) => c.label)).toEqual(["Home", "Projects", "Project"]);
  });
});
