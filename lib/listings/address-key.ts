// lib/listings/address-key.ts
//
// TS port of ingest/pipelines/listing_lifecycle/address_key.py. MUST stay in exact parity with
// the Python original — address-key.test.ts mirrors its test file case-for-case. address_key is
// the property identity: a relisting gets a NEW listing id, so keying on the id reads a relist
// as two unrelated events. We key on the normalized street address + ZIP instead. The unit is
// part of the key (a condo's #301 and #414 are different properties).

const SUFFIX_CANON: Record<string, string> = {
  AVENUE: "AVE",
  STREET: "ST",
  BOULEVARD: "BLVD",
  DRIVE: "DR",
  ROAD: "RD",
  LANE: "LN",
  COURT: "CT",
  PLACE: "PL",
  TERRACE: "TER",
  CIRCLE: "CIR",
  PARKWAY: "PKWY",
  HIGHWAY: "HWY",
  TRAIL: "TRL",
  POINT: "PT",
  COVE: "CV",
  // directional (long -> short; one-to-one with the eight compass abbreviations)
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
};

const UNIT_RE = /\b(?:UNIT|APT|APARTMENT|STE|SUITE|#)\s*([A-Z0-9-]+)/i;
const UNIT_RE_G = /\b(?:UNIT|APT|APARTMENT|STE|SUITE|#)\s*([A-Z0-9-]+)/gi;

/** Deterministic, collision-resistant-within-a-ZIP, stable-across-relists property key. */
export function addressKey(street: string, zipCode: string): string {
  let s = (street || "").toUpperCase();
  let unit = "";
  const m = s.match(UNIT_RE);
  if (m) {
    unit = "UNIT" + m[1].replace(/[^A-Z0-9]/g, "");
    s = s.replace(UNIT_RE_G, "");
  }
  s = s.replace(/[^A-Z0-9 ]/g, " "); // drop punctuation
  const toks = s
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => SUFFIX_CANON[t] ?? t); // canonicalize suffixes + directionals
  const core = toks.join("");
  const z = (zipCode || "").replace(/[^0-9]/g, "").slice(0, 5); // 5-digit ZIP only
  return `${core}${unit}:${z}`;
}
