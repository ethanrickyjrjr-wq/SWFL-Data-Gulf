import { describe, expect, it } from "bun:test";
import {
  haversineMiles,
  rankNearby,
  rankCorridorPulse,
  type CorridorPulseRow,
  type PulseGeoRow,
} from "./nearby-rank";

const base = {
  fact: "F",
  topic: "business",
  city: "Fort Myers",
  location_anchor: null,
  source_url: "https://x.example",
  source_title: null,
  cited_text: null,
  captured_at: "2026-07-09T00:00:00Z",
};

describe("haversineMiles", () => {
  it("downtown Fort Myers to Bonita Springs is roughly 20mi", () => {
    const d = haversineMiles(26.6406, -81.8723, 26.3398, -81.7787);
    expect(d).toBeGreaterThan(18);
    expect(d).toBeLessThan(23);
  });
});

describe("rankNearby", () => {
  const center = { lat: 26.64, lng: -81.87 };

  it("orders point → neighborhood → city and drops far out-of-zip points", () => {
    const rows: PulseGeoRow[] = [
      { ...base, zip_code: null, lat: null, lon: null, geo_grain: "city" },
      { ...base, zip_code: "33901", lat: 26.64, lon: -81.87, geo_grain: "point" },
      { ...base, zip_code: "33901", lat: null, lon: null, geo_grain: "neighborhood" },
      // point ~35mi away, different zip: outside the 3mi band -> excluded
      { ...base, zip_code: "34102", lat: 26.14, lon: -81.79, geo_grain: "point" },
    ];
    const out = rankNearby(rows, "33901", center, 10);
    expect(out.map((r) => r.geo_grain)).toEqual(["point", "neighborhood", "city"]);
  });

  it("keeps an out-of-zip point inside the 3mi band, with its distance", () => {
    const rows: PulseGeoRow[] = [
      { ...base, zip_code: "33916", lat: 26.65, lon: -81.85, geo_grain: "point" },
    ];
    const out = rankNearby(rows, "33901", center, 10);
    expect(out).toHaveLength(1);
    expect(out[0].distance_mi).not.toBeNull();
    expect(out[0].distance_mi!).toBeLessThan(3);
  });

  it("sorts newest first within a grain and caps at the limit", () => {
    const rows: PulseGeoRow[] = [
      {
        ...base,
        captured_at: "2026-07-01T00:00:00Z",
        zip_code: null,
        lat: null,
        lon: null,
        geo_grain: "city",
        fact: "old",
      },
      {
        ...base,
        captured_at: "2026-07-09T00:00:00Z",
        zip_code: null,
        lat: null,
        lon: null,
        geo_grain: "city",
        fact: "new",
      },
      {
        ...base,
        captured_at: "2026-07-05T00:00:00Z",
        zip_code: null,
        lat: null,
        lon: null,
        geo_grain: "city",
        fact: "mid",
      },
    ];
    const out = rankNearby(rows, "33901", center, 2);
    expect(out.map((r) => r.fact)).toEqual(["new", "mid"]);
  });

  it("ungeocoded rows (geo_grain null) never surface", () => {
    const rows: PulseGeoRow[] = [
      { ...base, zip_code: null, lat: null, lon: null, geo_grain: null },
    ];
    expect(rankNearby(rows, "33901", center, 10)).toHaveLength(0);
  });
});

describe("rankCorridorPulse", () => {
  const row = (over: Partial<CorridorPulseRow>): CorridorPulseRow => ({
    fact: "F",
    topic: "business",
    location_anchor: null,
    source_url: "https://x.example",
    source_title: null,
    cited_text: null,
    captured_at: "2026-07-09T00:00:00Z",
    zip_code: null,
    lat: null,
    lon: null,
    geo_grain: null,
    corridor: "US 41 Fort Myers",
    ...over,
  });

  it("keeps only this corridor's rows, points before corridor-wide, newest first", () => {
    const rows = [
      row({ geo_grain: null, captured_at: "2026-07-09T00:00:00Z" }),
      row({
        geo_grain: "point",
        lat: 26.6,
        lon: -81.87,
        zip_code: "33901",
        location_anchor: "4125 Cleveland Ave",
        captured_at: "2026-07-08T00:00:00Z",
      }),
      row({ corridor: "Pine Island Rd", geo_grain: "point" }),
    ];
    const out = rankCorridorPulse(rows, "us-41-fort-myers", "US 41 — Fort Myers", 10);
    expect(out).toHaveLength(2);
    expect(out[0].geo_grain).toBe("point");
    expect(out[1].city).toBe("US 41 — Fort Myers"); // wide item labels by display name
  });

  it("caps at the limit", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row({ captured_at: `2026-07-0${(i % 9) + 1}T00:00:00Z` }),
    );
    expect(rankCorridorPulse(rows, "us-41-fort-myers", "US 41", 10)).toHaveLength(10);
  });
});
