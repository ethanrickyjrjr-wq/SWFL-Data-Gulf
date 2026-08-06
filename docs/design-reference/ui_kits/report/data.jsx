/* global React */
const { useState, useEffect, useRef } = React;

// ============================================================
// MASTER REPORT — canonical mock data from 01-product-brief.md.
// Use verbatim. Don't invent alternate numbers.
// ============================================================
window.MASTER_REPORT = {
  id: "master",
  direction: "mixed",
  conclusion:
    "SWFL housing is cooling on demand metrics while supply tightens; commercial real estate diverges sharply by corridor with industrial outperforming office and retail.",
  key_metrics: [
    {
      label: "Median DOM, Lee single-family",
      value: 51,
      unit: "days",
      trend: "up",
      delta: "+6 vs prior month",
      source: { label: "LeePA", url: "https://www.leepa.org/" },
    },
    {
      label: "Cap rate, Lee multifamily",
      value: 5.42,
      unit: "%",
      trend: "up",
      delta: "+18 bps QoQ",
      source: { label: "LeePA", url: "https://www.leepa.org/" },
    },
    {
      label: "Building permits MTD, Lee",
      value: 1247,
      unit: "permits",
      trend: "down",
      delta: "-12% YoY",
      source: { label: "Lee Accela", url: "https://aca-prod.accela.com/LEECOUNTY/" },
    },
    {
      label: "Naples RevPAR",
      value: 312,
      unit: "USD",
      trend: "up",
      delta: "+4% YoY",
      source: { label: "Florida DOR", url: "https://floridarevenue.com/" },
    },
    {
      label: "Hurricane season probability",
      value: 67,
      unit: "%",
      trend: "neutral",
      delta: "vs 30-yr avg",
      source: { label: "NOAA", url: "https://www.noaa.gov/" },
    },
  ],
  drivers: [
    "Builder pipeline slowing — permits down 12% YoY across Lee while existing-home inventory rises.",
    "Industrial cap rates compressing on FAF5-flagged logistics corridors; office cap rates widening.",
    "Tourism strength holding NOI in Naples luxury segment despite cooler resi demand.",
  ],
  caveats: [
    "Cap rate sample size for Lee multifamily is small (n=12 transactions this quarter).",
    "FEMA NFIP claims data lags by ~45 days; flood-veto rules may shift on next refresh.",
  ],
  upstream_reports: [
    { id: "housing-lee", label: "Lee housing" },
    { id: "swfl-cre", label: "SWFL CRE" },
    { id: "permits-swfl", label: "Building permits" },
    { id: "tourism-tdt", label: "Tourism (TDT)" },
    { id: "env-swfl", label: "Hurricane / flood risk" },
    { id: "macro-florida", label: "Macro (Florida)" },
  ],
  freshness_token: "SWFL-7421-v5-20260522",
};

// ============================================================
// Number formatting helpers — per 06-voice-and-microcopy.md.
// ============================================================
window.fmt = {
  num: (v) => (v >= 1000 ? v.toLocaleString("en-US") : String(v)),
  value: (v, unit) => {
    if (unit === "USD") return "$" + (v >= 1000 ? v.toLocaleString() : v);
    if (v >= 1000) return v.toLocaleString();
    return String(v);
  },
  unit: (unit) => {
    if (unit === "USD") return null; // dollar sign already in value
    return unit;
  },
};

// ============================================================
// Lucide icon — small inline SVG wrapper. 1.5px stroke per design system.
// ============================================================
window.Icon = function Icon({ name, size = 14, color = "currentColor", style }) {
  const paths = {
    "chevron-up":   <polyline points="6 15 12 9 18 15" />,
    "chevron-down": <polyline points="6 9 12 15 18 9" />,
    "chevron-right":<polyline points="9 18 15 12 9 6" />,
    "minus":        <line x1="5" y1="12" x2="19" y2="12" />,
    "arrow-up-right": (
      <>
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
      </>
    ),
    "copy": (
      <>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
    "check": <polyline points="20 6 9 17 4 12" />,
    "info": (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </>
    ),
    "radio-tower": (
      <>
        <path d="M4.93 19.07A10 10 0 1 1 19.07 4.93" />
        <path d="M7.76 16.24a6 6 0 1 1 8.49-8.49" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    "settings": (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {paths[name] || null}
    </svg>
  );
};
