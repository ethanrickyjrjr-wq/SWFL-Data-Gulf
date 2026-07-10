// scripts/geo/build-market-areas.mts
//
// Groups the 58 Lee+Collier ZIPs into named market areas and writes the
// committed fixture fixtures/swfl-market-areas.json. Rules, in order (spec
// 2026-07-10-market-area-alerts-design.md §1):
//   1. Place anchor  — resolveZip primary place → that place's area.
//   2. Barrier lock  — barrier-classified ZIPs never merge with mainland areas.
//   3. Nearest-anchor fill — unplaced ZIPs join the nearest same-county,
//      same-barrier-class anchor by centroid. Joins beyond MAX_JOIN_MILES (or
//      with no eligible anchor) still land somewhere — coverage of all 58 is
//      total — but are FLAGGED needs_review + listed loudly, never silent.
//   4. Band flag     — a distance-joined ZIP whose 180-day median sold price is
//      >BAND_RATIO_MAX off (or <1/BAND_RATIO_MAX of) the area's median-of-
//      medians is flagged needs_review. Sold prices: data_lake.listing_transitions
//      (sold_price) joined to listing_state (zip_code) via address_key — the
//      transitions table itself carries no ZIP. --skip-band skips this pass.
//
// Footprint note: membership is ANY-county (fixture `counties[]` ∩ {Lee 12071,
// Collier 12021}) = the operator-ruled 58. One straddle ZIP (33955 Burnt Store,
// primary county Charlotte) is IN footprint via its Lee membership and is
// assigned county 12071 here — resolveZip's primary_county would wrongly drop it.
//
// Usage: bun scripts/geo/build-market-areas.mts [--skip-band]
// Output is COMMITTED and human-reviewed — a subscriber's market area must not
// churn week to week. Regenerate only deliberately; test diffs must be intentional.

import { readFile, writeFile } from "node:fs/promises";
import { haversineMi, resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { selectAllPaged } from "@/refinery/lib/paginate.mts";
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

const MAX_JOIN_MILES = 12; // [PROVISIONAL] operator-tunable join cap
const BAND_RATIO_MAX = 2; // [PROVISIONAL] median-price band flag threshold
const SOLD_SINCE = "2026-01-11"; // 180 days before generation date 07/10/2026
const FOOTPRINT_COUNTIES = new Set(["12071", "12021"]); // Lee + Collier ONLY

/**
 * Hand-authored membership overrides — the operator-reviewable resolution of the
 * first auto-run's review flags (11 crosswalk places are too few anchors: the
 * auto pass put Everglades City in "the Immokalee market" 36mi away and gave
 * Cape Coral 12 ZIPs). Area names follow USPS preferred city names
 * (tools.usps.com — same verification lane as fixtures/swfl-place-zip-crosswalk.json);
 * membership follows contiguous real-estate submarkets. An override wins over
 * every auto rule; ZIPs absent here follow place-anchor + nearest-anchor rules.
 */
const OVERRIDES: Record<string, { area_id: string; label: string; anchor_place: string }> = {
  // Lee — split out of the oversized cape-coral/fort-myers auto areas
  "33903": {
    area_id: "north-fort-myers",
    label: "the North Fort Myers market",
    anchor_place: "North Fort Myers",
  },
  "33917": {
    area_id: "north-fort-myers",
    label: "the North Fort Myers market",
    anchor_place: "North Fort Myers",
  },
  "33922": { area_id: "pine-island", label: "the Pine Island market", anchor_place: "Bokeelia" },
  "33956": {
    area_id: "pine-island",
    label: "the Pine Island market",
    anchor_place: "St. James City",
  },
  "33955": { area_id: "burnt-store", label: "the Burnt Store market", anchor_place: "Punta Gorda" },
  "33905": {
    area_id: "buckingham-alva",
    label: "the Buckingham & Alva market",
    anchor_place: "Fort Myers",
  },
  "33920": {
    area_id: "buckingham-alva",
    label: "the Buckingham & Alva market",
    anchor_place: "Alva",
  },
  "33921": { area_id: "boca-grande", label: "the Boca Grande market", anchor_place: "Boca Grande" },
  "33924": { area_id: "sanibel", label: "the Sanibel & Captiva market", anchor_place: "Sanibel" },
  "33957": { area_id: "sanibel", label: "the Sanibel & Captiva market", anchor_place: "Sanibel" },
  "33928": {
    area_id: "bonita-springs",
    label: "the Bonita Springs & Estero market",
    anchor_place: "Bonita Springs",
  },
  "34134": {
    area_id: "bonita-springs",
    label: "the Bonita Springs & Estero market",
    anchor_place: "Bonita Springs",
  },
  "34135": {
    area_id: "bonita-springs",
    label: "the Bonita Springs & Estero market",
    anchor_place: "Bonita Springs",
  },
  "33908": { area_id: "fort-myers", label: "the Fort Myers market", anchor_place: "Fort Myers" },
  "33967": {
    area_id: "gateway",
    label: "the Gateway & San Carlos market",
    anchor_place: "Fort Myers",
  },
  "33965": {
    area_id: "gateway",
    label: "the Gateway & San Carlos market",
    anchor_place: "Fort Myers",
  },
  "33966": {
    area_id: "gateway",
    label: "the Gateway & San Carlos market",
    anchor_place: "Fort Myers",
  },
  "33913": {
    area_id: "gateway",
    label: "the Gateway & San Carlos market",
    anchor_place: "Fort Myers",
  },
  // Collier — split the 13-ZIP naples auto area into real submarkets
  "34102": { area_id: "naples", label: "the Naples market", anchor_place: "Naples" },
  "34103": { area_id: "naples", label: "the Naples market", anchor_place: "Naples" },
  "34105": { area_id: "naples", label: "the Naples market", anchor_place: "Naples" },
  "34101": { area_id: "naples", label: "the Naples market", anchor_place: "Naples" }, // PO-box ZCTA — review
  "34108": { area_id: "north-naples", label: "the North Naples market", anchor_place: "Naples" },
  "34109": { area_id: "north-naples", label: "the North Naples market", anchor_place: "Naples" },
  "34110": { area_id: "north-naples", label: "the North Naples market", anchor_place: "Naples" },
  "34104": { area_id: "east-naples", label: "the East Naples market", anchor_place: "Naples" },
  "34112": { area_id: "east-naples", label: "the East Naples market", anchor_place: "Naples" },
  "34113": { area_id: "east-naples", label: "the East Naples market", anchor_place: "Naples" },
  "34114": { area_id: "east-naples", label: "the East Naples market", anchor_place: "Naples" },
  "34116": { area_id: "golden-gate", label: "the Golden Gate market", anchor_place: "Naples" },
  "34117": { area_id: "golden-gate", label: "the Golden Gate market", anchor_place: "Naples" },
  "34119": { area_id: "golden-gate", label: "the Golden Gate market", anchor_place: "Naples" },
  "34120": { area_id: "golden-gate", label: "the Golden Gate market", anchor_place: "Naples" },
  "34140": {
    area_id: "marco-island",
    label: "the Marco Island market",
    anchor_place: "Marco Island",
  }, // Goodland is on the island
  "34137": {
    area_id: "everglades-city",
    label: "the Everglades City market",
    anchor_place: "Everglades City",
  },
  "34138": {
    area_id: "everglades-city",
    label: "the Everglades City market",
    anchor_place: "Everglades City",
  },
  "34139": {
    area_id: "everglades-city",
    label: "the Everglades City market",
    anchor_place: "Everglades City",
  },
  "34141": {
    area_id: "everglades-city",
    label: "the Everglades City market",
    anchor_place: "Everglades City",
  },
};

/** ZIPs whose assignment the operator should still eyeball explicitly. */
const FORCE_REVIEW = new Set(["34101", "33955"]); // PO-box ZCTA; Charlotte-straddle singleton

interface CountyEntry {
  zip: string;
  counties: string[];
  primary_county: string;
}

interface Centroid {
  zip: string;
  lat: number;
  lng: number;
}

interface Draft {
  area_id: string;
  label: string;
  county: string;
  anchor_place: string;
  barrier: boolean;
  zips: string[];
  needs_review: string[];
}

function slugify(place: string): string {
  return place
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** 180-day median sold price per footprint ZIP. Transitions carry no zip_code —
 *  join to listing_state via address_key (watch-scan.mts precedent), chunked. */
async function soldMediansByZip(footprint: Set<string>): Promise<Map<string, number>> {
  const lake = createServiceRoleClientUntyped();
  const sold = await selectAllPaged<{ address_key: string; sold_price: number }>(
    () =>
      lake
        .schema("data_lake")
        .from("listing_transitions")
        .select("id, address_key, sold_price")
        .eq("seed", false)
        .eq("sale_or_rent", "sale")
        .eq("to_state", "sold")
        .gte("sold_date", SOLD_SINCE)
        .not("sold_price", "is", null) as never,
    "id",
  );
  const keys = [...new Set(sold.map((r) => r.address_key))];
  const zipByKey = new Map<string, string>();
  for (const part of chunk(keys, 200)) {
    const { data, error } = await lake
      .schema("data_lake")
      .from("listing_state")
      .select("address_key, zip_code")
      .eq("sale_or_rent", "sale")
      .in("address_key", part);
    if (error) throw new Error(`listing_state join: ${error.message}`);
    for (const r of (data ?? []) as { address_key: string; zip_code: string | null }[]) {
      if (r.zip_code && footprint.has(r.zip_code)) zipByKey.set(r.address_key, r.zip_code);
    }
  }
  const pricesByZip = new Map<string, number[]>();
  for (const r of sold) {
    const zip = zipByKey.get(r.address_key);
    if (!zip) continue;
    const list = pricesByZip.get(zip) ?? [];
    list.push(r.sold_price);
    pricesByZip.set(zip, list);
  }
  const out = new Map<string, number>();
  for (const [zip, prices] of pricesByZip) {
    const m = median(prices);
    if (m !== null) out.set(zip, m);
  }
  return out;
}

async function main(): Promise<void> {
  const skipBand = process.argv.includes("--skip-band");

  const countyRaw = JSON.parse(await readFile("fixtures/swfl-zip-county.json", "utf8")) as {
    entries: CountyEntry[];
  };
  const centroidRaw = JSON.parse(await readFile("fixtures/swfl-zip-centroids.json", "utf8")) as {
    entries: Centroid[];
  };
  const centroids = new Map(centroidRaw.entries.map((e) => [e.zip, e]));

  // The 58: ANY-county membership, with the footprint county as area county.
  const footprintEntries = countyRaw.entries
    .map((e) => ({
      zip: e.zip,
      county: FOOTPRINT_COUNTIES.has(e.primary_county)
        ? e.primary_county
        : (e.counties.find((c) => FOOTPRINT_COUNTIES.has(c)) ?? null),
    }))
    .filter((e): e is { zip: string; county: string } => e.county !== null);
  const footprint = new Set(footprintEntries.map((e) => e.zip));
  console.log(`footprint: ${footprint.size} ZIPs (expect 58)`);

  const countyOf = new Map(footprintEntries.map((e) => [e.zip, e.county]));
  const areas = new Map<string, Draft>();
  const unplaced: string[] = [];

  // Rule 0: hand-authored overrides (operator-reviewable review-flag resolutions).
  for (const { zip, county } of footprintEntries) {
    const ov = OVERRIDES[zip];
    if (!ov) continue;
    const res = resolveZip(zip);
    const cur = areas.get(ov.area_id) ?? {
      area_id: ov.area_id,
      label: ov.label,
      county,
      anchor_place: ov.anchor_place,
      barrier: res.barrier.classification !== null,
      zips: [],
      needs_review: [],
    };
    cur.zips.push(zip);
    if (FORCE_REVIEW.has(zip)) cur.needs_review.push(zip);
    areas.set(ov.area_id, cur);
  }

  // Rule 1 + 2: place anchors, barrier tracked per area.
  for (const { zip, county } of footprintEntries) {
    if (OVERRIDES[zip]) continue;
    const res = resolveZip(zip);
    const place = (res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null;
    const isBarrier = res.barrier.classification !== null;
    if (!place) {
      unplaced.push(zip);
      continue;
    }
    const id = slugify(place);
    const cur = areas.get(id) ?? {
      area_id: id,
      label: `the ${place} market`,
      county,
      anchor_place: place,
      barrier: isBarrier,
      zips: [],
      needs_review: [],
    };
    if (cur.county !== county) {
      // A place spanning counties would violate the county lock — split by suffix.
      const splitId = `${id}-${county === "12071" ? "lee" : "collier"}`;
      const split = areas.get(splitId) ?? {
        ...cur,
        area_id: splitId,
        county,
        zips: [],
        needs_review: [],
      };
      split.zips.push(zip);
      areas.set(splitId, split);
      continue;
    }
    cur.zips.push(zip);
    areas.set(id, cur);
  }

  // Rule 3: nearest-anchor fill — county + barrier locked; beyond-cap joins flagged.
  const distanceJoined: string[] = [];
  for (const zip of unplaced) {
    const res = resolveZip(zip);
    const c = centroids.get(zip);
    const county = countyOf.get(zip)!;
    const zipBarrier = res.barrier.classification !== null;
    let best: { d: number; area: Draft } | null = null;
    if (c) {
      for (const area of areas.values()) {
        if (area.county !== county) continue; // county lock
        if (area.barrier !== zipBarrier) continue; // barrier lock (both directions)
        // Min distance to ANY member centroid — a single-anchor distance
        // misassigns elongated areas (the first auto-run's 36mi joins).
        for (const member of area.zips) {
          const mc = centroids.get(member);
          if (!mc) continue;
          const d = haversineMi(c.lat, c.lng, mc.lat, mc.lng);
          if (!best || d < best.d) best = { d, area };
        }
      }
    }
    if (best) {
      best.area.zips.push(zip);
      distanceJoined.push(zip);
      if (best.d > MAX_JOIN_MILES) {
        best.area.needs_review.push(zip);
        console.error(
          `NEEDS_REVIEW: ${zip} joined ${best.area.area_id} at ${best.d.toFixed(1)}mi (> ${MAX_JOIN_MILES}mi cap)`,
        );
      }
    } else {
      // No eligible anchor (e.g. lone barrier ZIP in county) — singleton, flagged.
      const id = `zip-${zip}`;
      areas.set(id, {
        area_id: id,
        label: `the ${zip} market`,
        county,
        anchor_place: zip,
        barrier: zipBarrier,
        zips: [zip],
        needs_review: [zip],
      });
      console.error(
        `NEEDS_REVIEW: ${zip} formed a singleton area (no eligible anchor) — name it by hand`,
      );
    }
  }

  // Rule 4: band flag on distance-joined ZIPs.
  if (!skipBand) {
    const medians = await soldMediansByZip(footprint);
    console.log(
      `sold medians held for ${medians.size}/${footprint.size} ZIPs (since ${SOLD_SINCE})`,
    );
    for (const area of areas.values()) {
      const areaMedian = median(
        area.zips.map((z) => medians.get(z)).filter((v): v is number => v != null),
      );
      if (areaMedian === null) continue;
      for (const zip of area.zips) {
        if (!distanceJoined.includes(zip) || area.needs_review.includes(zip)) continue;
        const m = medians.get(zip);
        if (m == null) continue;
        const ratio = m / areaMedian;
        if (ratio > BAND_RATIO_MAX || ratio < 1 / BAND_RATIO_MAX) {
          area.needs_review.push(zip);
          console.error(
            `NEEDS_REVIEW: ${zip} median $${m.toLocaleString()} vs ${area.area_id} $${areaMedian.toLocaleString()} (x${ratio.toFixed(2)})`,
          );
        }
      }
    }
  } else {
    console.error("NOTE: --skip-band — band flags not computed this run.");
  }

  for (const a of areas.values()) {
    if (a.zips.length > 6)
      console.error(`REVIEW SIZE: ${a.area_id} has ${a.zips.length} ZIPs (>6)`);
  }

  const total = [...areas.values()].reduce((n, a) => n + a.zips.length, 0);
  const fixture = {
    source:
      "Generated by scripts/geo/build-market-areas.mts from fixtures/swfl-zip-county.json (any-county Lee 12071 + Collier 12021 = 58 ZIPs incl. the 33955 Burnt Store straddle), fixtures/swfl-zip-centroids.json (Census TIGER centroids), refinery/lib/zip-resolver.mts places + barrier classification, and 180-day sold medians from the listing lifecycle lake (band flag).",
    rules:
      "1 place-anchor; 2 barrier-lock; 3 county-locked nearest-anchor fill (beyond-cap joins flagged needs_review); 4 band flag >x2 median ratio flagged needs_review, never silently joined.",
    generated_date: "2026-07-10",
    areas: [...areas.values()]
      .sort((a, b) => a.area_id.localeCompare(b.area_id))
      .map(({ barrier: _b, ...rest }) => ({ ...rest, zips: [...rest.zips].sort() })),
  };
  await writeFile("fixtures/swfl-market-areas.json", JSON.stringify(fixture, null, 2) + "\n");
  console.log(`Wrote ${areas.size} areas covering ${total} ZIPs.`);
}

main().catch((err) => {
  console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
