// lib/landing/zip-place-names.ts
//
// The ONE authority for SWFL ZIP → human place name (Lee + Collier). This is
// static geographic reference data — a label for a ZIP, NOT a metric — so it is
// import-safe on any user-facing surface (unlike the mock FIXTURE numbers in
// home-map-data.ts, which the grounding-coverage guard quarantines).
//
// Extracted 2026-07-11 so a second consumer (app/insiders/_lib/desk-stats.ts)
// could read the map without importing the quarantined mock module. home-map-data.ts
// now imports FROM here rather than owning its own copy (shared-concept → one root).

/** SWFL ZIP → display place name. Lee + Collier, the two data-rich core counties. */
export const ZIP_PLACE_NAMES: Record<string, string> = {
  "33901": "Fort Myers (Downtown)",
  "33903": "North Fort Myers",
  "33904": "Fort Myers / Cape Coral",
  "33905": "East Fort Myers",
  "33907": "Fort Myers",
  "33908": "South Fort Myers",
  "33909": "Cape Coral North",
  "33912": "Fort Myers East",
  "33913": "Gateway",
  "33914": "Cape Coral SW",
  "33916": "Fort Myers",
  "33917": "North Fort Myers",
  "33919": "South Fort Myers",
  "33920": "Alva",
  "33921": "Boca Grande",
  "33922": "Matlacha",
  "33924": "Captiva Island",
  "33928": "Estero",
  "33931": "Fort Myers Beach",
  "33936": "Lehigh Acres",
  "33956": "St. James City",
  "33957": "Sanibel Island",
  "33965": "Fort Myers",
  "33966": "Fort Myers SW",
  "33967": "Fort Myers SW",
  "33971": "Lehigh Acres W",
  "33972": "Lehigh Acres",
  "33973": "Lehigh Acres",
  "33974": "Lehigh Acres",
  "33976": "Lehigh Acres E",
  "33990": "Cape Coral East",
  "33991": "Cape Coral West",
  "33993": "Cape Coral NW",
  "34101": "Naples",
  "34102": "Naples (Downtown)",
  "34103": "Naples Park Shore",
  "34104": "Naples East",
  "34105": "Naples Central",
  "34108": "Pelican Bay",
  "34109": "North Naples",
  "34110": "North Naples",
  "34112": "Naples South",
  "34113": "Lely Resort",
  "34114": "Naples East",
  "34116": "Golden Gate",
  "34117": "Golden Gate Estates",
  "34119": "North Naples",
  "34120": "Golden Gate Estates E",
  "34134": "Bonita Springs Beach",
  "34135": "Bonita Springs",
  "34137": "Copeland",
  "34138": "Marco Shores",
  "34139": "Everglades City",
  "34140": "Goodland",
  "34141": "Ochopee",
  "34142": "Immokalee",
  "34145": "Marco Island",
};
