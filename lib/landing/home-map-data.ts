// lib/landing/home-map-data.ts
//
// MOCK FIXTURE — fail-soft fallback ONLY (originally ported from
// docs/_archive/superseded/homepage/build_demo4.py). The homepage runs on live
// lake rows via load-home-map-data.ts; these numbers are served only when a
// lake query fails, and always with `sample: true` so the "Sample data" badge
// renders (honesty over a blank map). Import-quarantined by
// lib/highlighter/grounding-coverage.test.ts — do NOT import from new surfaces.
//
// "permits" fixture is DELETED with the New Construction pill (operator ruling
// 07/03/2026: corridor-scoped scrape, not county-wide — we don't surface a
// metric where the data is bad). Market Activity has no fixture by design: a
// failed live query hides the pill rather than showing invented-adjacent rows.

import type { MetricDef } from "./home-map-types";
import { ZIP_PLACE_NAMES } from "./zip-place-names";

/** The two metrics with an honest mock fallback. */
export type FixtureMetricKey = "value" | "flood";

export interface HomeMapFixture {
  placeNames: Record<string, string>;
  metrics: Record<FixtureMetricKey, MetricDef>;
}

export const HOME_MAP_DATA: HomeMapFixture = {
  // Place names are the ONE shared authority (lib/landing/zip-place-names.ts) —
  // static geography, not mock numbers. Only `metrics` below is the fixture.
  placeNames: ZIP_PLACE_NAMES,
  metrics: {
    flood: {
      label: "Flood Risk",
      sublabel: "Avg annual insurance loss per property (FEMA NFIP)",
      format: "currency",
      sample: true,
      data: {
        "33901": 2900,
        "33903": 1800,
        "33904": 3500,
        "33905": 1200,
        "33907": 1400,
        "33908": 4200,
        "33909": 1900,
        "33912": 900,
        "33913": 1200,
        "33914": 5200,
        "33916": 2100,
        "33917": 1600,
        "33919": 3800,
        "33920": 600,
        "33921": 14200,
        "33922": 6400,
        "33924": 18500,
        "33928": 1800,
        "33931": 30074,
        "33936": 800,
        "33956": 12800,
        "33957": 22400,
        "33965": 900,
        "33966": 1100,
        "33967": 1200,
        "33971": 700,
        "33972": 650,
        "33973": 680,
        "33974": 620,
        "33976": 710,
        "33990": 2800,
        "33991": 3100,
        "33993": 2200,
        "34101": 4800,
        "34102": 8500,
        "34103": 5800,
        "34104": 1400,
        "34105": 2100,
        "34108": 7200,
        "34109": 2600,
        "34110": 4100,
        "34112": 3200,
        "34113": 2800,
        "34114": 1900,
        "34116": 1100,
        "34117": 900,
        "34119": 900,
        "34120": 700,
        "34134": 3900,
        "34135": 2400,
        "34137": 1500,
        "34138": 3200,
        "34139": 11400,
        "34140": 9200,
        "34141": 2200,
        "34142": 600,
        "34145": 18900,
      },
      low: 600,
      high: 30074,
      c0: "#33525e",
      c1: "#d4b370",
      c2: "#e08158",
    },
    value: {
      label: "Home Value",
      sublabel: "Typical home value (Zillow ZHVI)",
      format: "currency",
      sample: true,
      data: {
        "33901": 285000,
        "33903": 310000,
        "33904": 350000,
        "33905": 295000,
        "33907": 380000,
        "33908": 410000,
        "33909": 340000,
        "33912": 420000,
        "33913": 480000,
        "33914": 395000,
        "33916": 265000,
        "33917": 295000,
        "33919": 410000,
        "33920": 340000,
        "33921": 850000,
        "33922": 375000,
        "33924": 1200000,
        "33928": 520000,
        "33931": 680000,
        "33936": 265000,
        "33956": 420000,
        "33957": 920000,
        "33965": 310000,
        "33966": 415000,
        "33967": 390000,
        "33971": 280000,
        "33972": 270000,
        "33973": 275000,
        "33974": 260000,
        "33976": 272000,
        "33990": 345000,
        "33991": 370000,
        "33993": 355000,
        "34101": 620000,
        "34102": 985000,
        "34103": 890000,
        "34104": 420000,
        "34105": 540000,
        "34108": 1250000,
        "34109": 720000,
        "34110": 680000,
        "34112": 480000,
        "34113": 420000,
        "34114": 380000,
        "34116": 390000,
        "34117": 440000,
        "34119": 620000,
        "34120": 520000,
        "34134": 680000,
        "34135": 590000,
        "34137": 180000,
        "34138": 310000,
        "34139": 220000,
        "34140": 380000,
        "34141": 195000,
        "34142": 185000,
        "34145": 890000,
      },
      low: 185000,
      high: 1250000,
      // The orange brand ramp (operator ruling 07/03/2026): dark slate base,
      // gold→coral where values run high — Home Value wears it as the first map.
      c0: "#33525e",
      c1: "#d4b370",
      c2: "#e08158",
    },
  },
};
