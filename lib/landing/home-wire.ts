// lib/landing/home-wire.ts
//
// Pure builder for the homepage wire ticker (spec: 2026-07-12-homepage-one-site-design.md).
// The homepage reuses the insiders WireTicker COMPONENT + .ins-wire styles verbatim (one
// authority — no third ticker fork); this module only decides the items.
//
// Deliberately DISJOINT from the data door's tiles (loadHomeMapData's payload.stats): the
// door shows the desk's headline figures (active listings / most-active ZIP / highest
// value), the wire carries the metro indices + the news desk — no figure appears twice on
// the page. Empty-tolerant: a missing input drops its items; items.length === 0 → the
// caller renders no ticker at all (a sample number never scrolls past a prospect).

import type { WireItem } from "@/app/insiders/_components/wire-ticker";
import type { DeskStats } from "@/app/insiders/_lib/desk-stats";

/** Minimal structural view of lib/charts/load-metro-trend's MetroTrendPanel. */
export interface MetroPanelLike {
  asOf?: string;
  data: Array<Record<string, unknown>>;
}

const METROS: Array<{ key: string; name: string }> = [
  { key: "cape_coral", name: "Cape Coral" },
  { key: "fort_myers", name: "Fort Myers" },
  { key: "naples", name: "Naples" },
];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** "2026-05" → "May 2026" (null when absent). Twin of the inline helper in
 *  app/insiders/page.tsx — a month-name formatter, not a shared drift-risk concept. */
function monthLabel(ym?: string): string | null {
  if (!ym) return null;
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${names[m - 1]} ${y}`;
}

/** Latest complete row of a pivoted panel (rows arrive oldest → newest). */
function latestRow(panel?: MetroPanelLike): Record<string, unknown> | null {
  return panel && panel.data.length > 0 ? panel.data[panel.data.length - 1] : null;
}

export function buildHomeWire(inputs: {
  desk: DeskStats;
  zhvi?: MetroPanelLike;
  zori?: MetroPanelLike;
}): { items: WireItem[]; note: string } {
  const { desk, zhvi, zori } = inputs;
  const items: WireItem[] = [];

  const zhviLatest = latestRow(zhvi);
  if (zhviLatest) {
    for (const m of METROS) {
      const v = zhviLatest[m.key];
      if (isNum(v)) items.push({ label: `${m.name} · median home value`, value: usd(v) });
    }
  }
  const zoriLatest = latestRow(zori);
  if (zoriLatest) {
    for (const m of METROS) {
      const v = zoriLatest[m.key];
      if (isNum(v)) items.push({ label: `${m.name} · median rent`, value: `${usd(v)}/mo` });
    }
  }
  if (desk.newsThisMonth != null && desk.newsThisMonth > 0) {
    items.push({
      label: `Local stories filed since ${desk.newsMonthName} 1`,
      value: desk.newsThisMonth.toLocaleString("en-US"),
    });
  }

  const zhviMonth = monthLabel(zhvi?.asOf);
  const zoriMonth = monthLabel(zori?.asOf);
  const noteParts: string[] = [];
  if (desk.listingsAsOf) noteParts.push(`desk updated ${desk.listingsAsOf}`);
  if (zhviMonth && zoriMonth && zhviMonth !== zoriMonth) {
    noteParts.push(`Zillow values through ${zhviMonth}, rents through ${zoriMonth}`);
  } else if (zhviMonth || zoriMonth) {
    noteParts.push(`Zillow ZHVI & ZORI through ${zhviMonth ?? zoriMonth}`);
  }
  noteParts.push("SWFL Data Gulf");

  return { items, note: noteParts.join(" · ") };
}
