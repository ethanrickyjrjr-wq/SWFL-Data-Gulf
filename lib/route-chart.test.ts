import { describe, expect, test } from "bun:test";
import { routeChart } from "./route-chart";

describe("routeChart — asking-rent commercial/residential split", () => {
  test("bare residential rent question falls through (no commercial signal)", () => {
    expect(routeChart("what's the rental market like in 33901")).toBeNull();
    expect(routeChart("how is the rental market in Fort Myers")).toBeNull();
    expect(routeChart("what are rents doing")).toBeNull();
    expect(routeChart("how much is rent")).toBeNull();
  });

  test("commercial corridor rent question routes to the asking-rent chart", () => {
    expect(routeChart("what are commercial corridor asking rents doing")).toEqual({
      chart_type: "bar",
      scope: "asking-rent",
    });
    expect(routeChart("asking rent for retail space")).toEqual({
      chart_type: "bar",
      scope: "asking-rent",
    });
    expect(routeChart("office cap rate and rent trends")).toEqual({
      chart_type: "bar",
      scope: "asking-rent",
    });
  });

  test("bare 'asking rent' phrase alone still matches (explicit commercial term)", () => {
    expect(routeChart("show me asking rent")).toEqual({ chart_type: "bar", scope: "asking-rent" });
  });
});

describe("routeChart — other intents unaffected", () => {
  test("flood/insurance still routes to flood-aal", () => {
    expect(routeChart("what's my flood risk")).toEqual({ chart_type: "bar", scope: "flood-aal" });
  });

  test("home value question still routes to zhvi", () => {
    expect(routeChart("what's the home value trend")).toEqual({
      chart_type: "area",
      scope: "zhvi",
    });
  });

  test("unrelated question returns null", () => {
    expect(routeChart("what's the weather")).toBeNull();
  });
});
