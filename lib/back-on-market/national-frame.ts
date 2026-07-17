// lib/back-on-market/national-frame.ts
//
// The national contract-cancellation frame — a Lane-3 named-source figure, VERIFIED
// via crawl4ai of the live Redfin /news/ page 07/17/2026 (not a search summary).
// Real, cited, dated. REFRESH MONTHLY (Redfin publishes ~mid-month); bump `asOf` +
// the value together, never edit one alone. Never rendered without its as-of date.
export const NATIONAL_FALLTHROUGH = {
  ratePct: 13.6,
  asOf: "05/01/2026",
  note: "unchanged for four straight months; the U.S. rate has held 13.4–14% for two years — about 1 in 7 deals, the current normal, not a spike",
  leaders:
    "Atlanta led at 18.8%; Fort Worth, TX and Jacksonville, FL were close behind (~18%), and 3 of the 10 highest-cancellation metros were in Florida",
  source: {
    label: "Redfin",
    url: "https://www.redfin.com/news/contract-cancellations-may-2026/",
  },
} as const;
