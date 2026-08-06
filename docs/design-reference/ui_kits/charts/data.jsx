/* global React */
// 8 SWFL CRE corridors with their corridor profiles (Lee + Collier).
// City coordinates approximated from corridor names.
// Active flags and character quotes are verbatim from the source.

window.CORRIDORS = [
  {
    id: "immokalee",
    name: "Immokalee Rd North Naples",
    short: "Immokalee Rd",
    city: "Naples",
    county: "collier",
    type: "highway-strip-mall",
    seasonalIdx: 0.30,
    evolution: "stable",
    character: "The 'Suburban 5th Avenue' — true commercial gravity center of north Collier, anchored by daytime medical-tech employment rather than seasonal tourism.",
    tenants: "Arthrex HQ campus · Seed to Table grocery · national QSR pads · medical office",
    metrics: {
      capRate:    { val: 5.8,   dir: "falling", unit: "%" },
      vacancy:    { val: 4.2,   dir: "falling", unit: "%" },
      absorption: { val: 120500, dir: "rising",  unit: "sqft" },
      rent:       { val: 42.50, dir: "rising",  unit: "$/sf" },
    },
    flags: [
      { type: "status_update", priority: "structural",        text: "Arthrex Effect — non-seasonal daytime economy, year-round captive workforce" },
      { type: "new_project",   priority: "pending_resolution", text: "Founders Square mixed-use delivering 2026" },
    ],
    // approx lon/lat — Immokalee Rd & US-41 area
    lonlat: [-81.7600, 26.2800],
  },
  {
    id: "gulf-coast",
    name: "Gulf Coast Town Center / Alico Rd",
    short: "Gulf Coast TC",
    city: "Estero",
    county: "lee",
    type: "anchor-dependent",
    seasonalIdx: 0.45,
    evolution: "repositioning",
    character: "Big-box power center whose health tracks a handful of anchor leases. Anchor turnover is the dominant risk variable.",
    tenants: "Costco · Bass Pro · Belk · mid-box junior anchors",
    metrics: {
      capRate:    { val: 7.5,   dir: "stable",  unit: "%" },
      vacancy:    { val: 12.0,  dir: "falling", unit: "%" },
      absorption: { val: 45000, dir: "rising",  unit: "sqft" },
      rent:       { val: 28.00, dir: "stable",  unit: "$/sf" },
    },
    flags: [
      { type: "new_project",    priority: "pending_resolution", text: "Junior anchor box backfill underway" },
      { type: "infrastructure", priority: "structural",         text: "Alico Rd widening to six lanes" },
    ],
    lonlat: [-81.8000, 26.4400],
  },
  {
    id: "estero",
    name: "Estero Blvd / Fort Myers Beach",
    short: "Estero Blvd",
    city: "Fort Myers Beach",
    county: "lee",
    type: "beachfront-tourism",
    seasonalIdx: 0.88,
    evolution: "repositioning",
    character: "Barrier-island tourism corridor mid-rebuild after Hurricane Ian. Extreme seasonality — winter-quarter revenue carries the year.",
    tenants: "Beachfront F&B · resort retail · tourist services",
    metrics: {
      capRate:    { val: 8.5,    dir: "falling", unit: "%" },
      vacancy:    { val: 18.0,   dir: "falling", unit: "%" },
      absorption: { val: -5000,  dir: "stable",  unit: "sqft" },
      rent:       { val: 45.00,  dir: "rising",  unit: "$/sf" },
    },
    flags: [
      { type: "new_project",   priority: "structural",         text: "Margaritaville Resort reopening anchoring the rebuild" },
      { type: "construction",  priority: "pending_resolution", text: "Estero Blvd streetscape reconstruction" },
    ],
    lonlat: [-81.9500, 26.4350],
  },
  {
    id: "pine-ridge",
    name: "Pine Ridge Rd Naples",
    short: "Pine Ridge Rd",
    city: "Naples",
    county: "collier",
    type: "medical-anchored",
    seasonalIdx: 0.35,
    evolution: "stable",
    character: "Medical-office and health-services corridor with a stable, age-driven demand base less exposed to tourist seasonality.",
    tenants: "Physician groups · outpatient surgical · pharmacy · supporting retail",
    metrics: {
      capRate:    { val: 6.5,    dir: "falling", unit: "%" },
      vacancy:    { val: 6.0,    dir: "stable",  unit: "%" },
      absorption: { val: 28000,  dir: "rising",  unit: "sqft" },
      rent:       { val: 38.00,  dir: "rising",  unit: "$/sf" },
    },
    flags: [
      { type: "new_project", priority: "structural", text: "NCH outpatient campus expansion" },
    ],
    lonlat: [-81.7700, 26.2100],
  },
  {
    id: "cape-coral",
    name: "Cape Coral Pkwy E",
    short: "Cape Coral Pkwy",
    city: "Cape Coral",
    county: "lee",
    type: "suburban-residential",
    seasonalIdx: 0.25,
    evolution: "growing",
    character: "Neighborhood-serving retail spine for a fast-growing residential base. Demand is rooftop-driven, not destination-driven.",
    tenants: "Publix-anchored centers · local services · QSR",
    metrics: {
      capRate:    { val: 6.2,    dir: "falling", unit: "%" },
      vacancy:    { val: 5.0,    dir: "falling", unit: "%" },
      absorption: { val: 32000,  dir: "rising",  unit: "sqft" },
      rent:       { val: 32.50,  dir: "rising",  unit: "$/sf" },
    },
    flags: [
      { type: "regulatory", priority: "pending_resolution", text: "Bimini Basin mixed-use district entitlement" },
    ],
    lonlat: [-81.9495, 26.5629],
  },
  {
    id: "alico",
    name: "Alico Rd Industrial Flex",
    short: "Alico Industrial",
    city: "Fort Myers",
    county: "lee",
    type: "industrial-flex",
    seasonalIdx: 0.10,
    evolution: "growing",
    character: "Logistics and light-industrial flex corridor riding regional distribution growth. Effectively zero seasonality.",
    tenants: "Distribution · contractor flex · last-mile logistics",
    metrics: {
      capRate:    { val: 6.0,     dir: "falling", unit: "%" },
      vacancy:    { val: 3.0,     dir: "falling", unit: "%" },
      absorption: { val: 185000,  dir: "rising",  unit: "sqft" },
      rent:       { val: 16.50,   dir: "rising",  unit: "$/sf" },
    },
    flags: [],
    lonlat: [-81.8200, 26.4700],
  },
  {
    id: "us41-fm",
    name: "US-41 / Cleveland Ave Fort Myers",
    short: "US-41 Fort Myers",
    city: "Fort Myers",
    county: "lee",
    type: "mixed-use-downtown",
    seasonalIdx: 0.15,
    evolution: "declining",
    character: "Legacy commercial spine in structural decline. Auto-row dealerships thinning, retail vacancy climbing north of Colonial.",
    tenants: "Auto dealerships (declining) · Edison Mall (struggling) · discount retail",
    metrics: null, // no quantitative metrics available
    flags: [
      { type: "status_update", priority: "monitoring", text: "Edison Mall medical-office outmigration" },
    ],
    lonlat: [-81.8723, 26.6406],
  },
  {
    id: "us41-bonita",
    name: "US-41 Bonita Springs",
    short: "US-41 Bonita",
    city: "Bonita Springs",
    county: "lee",
    type: "highway-strip-mall",
    seasonalIdx: 0.40,
    evolution: "stable",
    character: null,
    tenants: "Strip retail · national QSR · big-box junior anchors",
    metrics: {
      capRate:    { val: 7.0,    dir: "stable", unit: "%" },
      vacancy:    { val: 8.0,    dir: "stable", unit: "%" },
      absorption: { val: 12000,  dir: "stable", unit: "sqft" },
      rent:       { val: 26.50,  dir: "stable", unit: "$/sf" },
    },
    flags: [
      { type: "regulatory", priority: "pending_resolution", text: "Old 41 downtown revitalization district" },
    ],
    lonlat: [-81.7787, 26.3398],
  },
];

// Pack-level medians (from f006-f009 in the source).
window.PACK_MEDIANS = {
  capRate:    { val: 6.5,    dir: "falling", label: "Median cap rate" },
  vacancy:    { val: 6.0,    dir: "falling", label: "Median vacancy" },
  absorption: { val: 32000,  dir: "rising",  label: "Median net absorption" },
  rent:       { val: 32.50,  dir: "rising",  label: "Median asking rent" },
};

window.PACK_META = {
  verdict: "bullish",
  magnitude: 0.86,
  confidence: 0.91,
  refined: "2026-05-22",
  freshness: "SWFL-7421-v34-20260522",
  source: { label: "SWFL CRE corridors", url: "#" },
  conclusion: "8 verified corridors across Lee and Collier. Medians lean landlord-market — rates compressing, space tightening, leasing velocity up.",
  caveat: "1 of 8 corridors (US-41 Fort Myers) reports no quantitative metrics — read direction from the 7 with data.",
};

window.FLAG_TYPES = {
  status_update: { label: "STATUS UPDATE", color: "var(--gulf-teal)"     },
  new_project:   { label: "NEW PROJECT",   color: "var(--mangrove)"      },
  regulatory:    { label: "REGULATORY",    color: "var(--neutral-gold)"  },
  infrastructure:{ label: "INFRASTRUCTURE",color: "var(--neutral-gold)"  },
  construction:  { label: "CONSTRUCTION",  color: "var(--neutral-gold)"  },
};

window.PRIORITY_LABEL = {
  structural:         "structural",
  pending_resolution: "pending resolution",
  monitoring:         "monitoring",
};

window.EVOLUTION_COLOR = {
  growing:       "var(--mangrove)",
  stable:        "var(--gulf-teal)",
  repositioning: "var(--neutral-gold)",
  declining:     "var(--sunset-coral)",
};

// ---- Palette presets ----
// Toggle for professionals embedding charts in a report.
// "brand"    — full SWFL Data Gulf colors (default)
// "neutral"  — desaturated monochrome on the same dark surface, for print
// "standard" — the colors most chart libraries use (matplotlib tab10-ish)
window.CHART_PALETTES = {
  brand: {
    label: "Brand",
    growing:       "#3FB68B",  // mangrove
    stable:        "#3DC9C0",  // gulf-teal
    repositioning: "#D4A552",  // neutral-gold
    declining:     "#E07A5F",  // sunset-coral
    flag_new_project:    "#3FB68B",
    flag_regulatory:     "#D4A552",
    flag_infrastructure: "#D4A552",
    flag_construction:   "#D4A552",
    flag_status_update:  "#3DC9C0",
  },
  neutral: {
    label: "Neutral",
    growing:       "#E5E1D6",
    stable:        "#9C9A91",
    repositioning: "#6E6C64",
    declining:     "#3D3B36",
    flag_new_project:    "#E5E1D6",
    flag_regulatory:     "#9C9A91",
    flag_infrastructure: "#9C9A91",
    flag_construction:   "#6E6C64",
    flag_status_update:  "#9C9A91",
  },
  standard: {
    label: "Standard",
    // matplotlib tab10 picks — universally readable in pro reports
    growing:       "#2CA02C",  // green
    stable:        "#1F77B4",  // blue
    repositioning: "#FF7F0E",  // orange
    declining:     "#D62728",  // red
    flag_new_project:    "#2CA02C",
    flag_regulatory:     "#FF7F0E",
    flag_infrastructure: "#9467BD",
    flag_construction:   "#8C564B",
    flag_status_update:  "#1F77B4",
  },
};
