import { test, expect, beforeAll, afterAll } from "bun:test";
import { listingsMapUrl } from "./listings-map";

const prev = process.env.MAPBOX_TOKEN;
beforeAll(() => {
  process.env.MAPBOX_TOKEN = "pk.test";
});
afterAll(() => {
  if (prev === undefined) delete process.env.MAPBOX_TOKEN;
  else process.env.MAPBOX_TOKEN = prev;
});

test("builds an auto-fit street map with a subject pin and comp pins", () => {
  const url = listingsMapUrl([
    { lat: 26.5, lon: -81.9, role: "subject" },
    { lat: 26.51, lon: -81.91, role: "comp" },
  ]);
  expect(url).toContain("api.mapbox.com/styles/v1/mapbox/streets-v12/static/");
  expect(url).toContain("/auto/"); // auto-fit, not a fixed center/zoom
  expect(url).toContain("-81.9,26.5"); // subject: lon FIRST
  expect(url).toContain("access_token=pk.test");
});

test("returns null when there is no valid subject/comp pin", () => {
  expect(listingsMapUrl([])).toBeNull();
  expect(listingsMapUrl([{ lat: NaN, lon: -81.9, role: "subject" }])).toBeNull();
  expect(listingsMapUrl([{ lat: 999, lon: -81.9, role: "subject" }])).toBeNull();
});

test("returns null with no MAPBOX_TOKEN (degrades to no map, never broken)", () => {
  const saved = process.env.MAPBOX_TOKEN;
  delete process.env.MAPBOX_TOKEN;
  expect(listingsMapUrl([{ lat: 26.5, lon: -81.9, role: "subject" }])).toBeNull();
  process.env.MAPBOX_TOKEN = saved;
});
