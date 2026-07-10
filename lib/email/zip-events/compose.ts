// lib/email/zip-events/compose.ts
//
// Deterministic events → EmailDoc composer (spec §3). NO LLM anywhere: copy is
// slotted template micro-copy around held numbers (describeWatchEvent precedent).
// Subject contract (research fold-in 07/10/2026): number + place inside the
// first SUBJECT_LEAD_MAX chars (Gmail-app truncation); ZIP-grain ⇒ subscriber's
// own place; area label fallback. As-of date MM/DD/YYYY exactly once; sources
// dedupe into ONE collapsed sources block; null facts/metrics are OMITTED —
// never rendered as 0 or "n/a". Doc construction mirrors lib/email/zip-seed.ts
// (createBlock + grid layout + NEUTRAL_SKELETON_STYLE — grid docs hit the same
// compileGrid engine real sends use; never a new renderer).

import { createBlock } from "@/lib/email/doc/default-docs";
import { NEUTRAL_SKELETON_STYLE } from "@/lib/email/doc/skeleton-style";
import type {
  BlockLayout,
  BlockOf,
  BlockPropsMap,
  BlockType,
  EmailDoc,
  ListItem,
} from "@/lib/email/doc/types";
import type { AreaHeatRank } from "./heat";
import type { MarketArea } from "./market-areas";
import {
  METRIC_LABELS,
  METRIC_UNITS,
  type MarketEvent,
  type MetricKey,
  type ZipMetricsSnapshot,
} from "./types";

export const SUBJECT_LEAD_MAX = 37; // Gmail-app visible chars (Backlinko, 07/10/2026)
export const INSIDER_EVERY_N_ISSUES = 4; // [PROVISIONAL]

export function shouldIncludeInsider(issuesSent: number): boolean {
  return issuesSent > 0 && (issuesSent + 1) % INSIDER_EVERY_N_ISSUES === 0;
}

/** Short metric names so number + place fit the 37-char lead. Keyed by the
 *  fact label the detectors emit (METRIC_LABELS values). */
const SHORT_LABELS: Record<string, string> = {
  "Median sale price": "median price",
  "Median days on market": "days on market",
  "Active listings": "active listings",
  "Homes sold (30 days)": "homes sold",
  "Sale-to-list ratio": "sale-to-list",
};

function formatValue(value: number | null, unit: string): string {
  if (value == null) return "";
  const n = value.toLocaleString("en-US");
  if (unit === "$") return `$${n}`;
  return `${n}${unit}`;
}

function capFirst(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Deterministic subject: leads with the headline event's number + place. */
export function subjectFor(
  events: MarketEvent[],
  subscriberPlace: string | null,
  areaLabel: string,
): string {
  const lead = events[0];
  if (!lead) return "Your market update";
  const place = lead.zip != null && subscriberPlace ? subscriberPlace : areaLabel;
  const f = lead.facts[0];
  switch (lead.type) {
    case "lifecycle_burst":
      return capFirst(`${formatValue(f.value, f.unit)} ${f.label.toLowerCase()} in ${place}`);
    case "threshold_cross": {
      const short = SHORT_LABELS[f.label] ?? f.label.toLowerCase();
      return capFirst(`${place} ${short}: ${formatValue(f.value, f.unit)}`);
    }
    case "rank_flip":
      return capFirst(`${place} jumps to #${f.to} in SWFL`);
    case "heat_shift":
      return capFirst(`${place} is heating up`);
    case "nearby_news":
      return capFirst(`${lead.facts.length} local updates in ${place}`);
  }
}

/** Baseline welcome subject — no event number yet; the place is the hook. */
export function baselineSubject(subscriberPlace: string | null, areaLabel: string): string {
  const place = subscriberPlace ?? areaLabel;
  return capFirst(`Your ${place} market snapshot`);
}

/** Grid block helper — copied shape from zip-seed's gblk (every block carries a
 *  layout so compile-grid orders them top-to-bottom). */
function gblk<K extends BlockType>(
  type: K,
  layout: BlockLayout,
  overrides: Partial<BlockPropsMap[K]> = {},
): BlockOf<K> {
  const b = createBlock(type);
  Object.assign(b.props as object, overrides);
  (b as { layout?: BlockLayout }).layout = layout;
  return b;
}

/** One event → a signal card. Copy is slotted micro-copy around held numbers. */
function eventCard(e: MarketEvent, y: number): BlockOf<"signal"> {
  const f = e.facts[0];
  const kickerByType: Record<MarketEvent["type"], string> = {
    threshold_cross: "Market move",
    rank_flip: "Rank change",
    lifecycle_burst: "Market activity",
    nearby_news: "Local news",
    heat_shift: "Market heat",
  };
  const title =
    e.type === "nearby_news"
      ? `${e.facts.length} local update${e.facts.length === 1 ? "" : "s"} nearby`
      : `${f.label}: ${formatValue(f.value, f.unit)}`;
  const body =
    e.type === "nearby_news"
      ? e.facts.map((x) => x.label).join(" · ")
      : f.from != null && f.to != null
        ? `Moved from ${formatValue(f.from, f.unit)} to ${formatValue(f.to, f.unit)}.`
        : "";
  return gblk("signal", { x: 0, y, w: 12, h: 3 }, { kicker: kickerByType[e.type], title, body });
}

/** Dedupe every fact source into ONE collapsed sources block. */
function sourcesBlock(events: MarketEvent[], extra: string[], y: number): BlockOf<"sources"> {
  const labels = [...new Set([...events.flatMap((e) => e.facts.map((f) => f.source)), ...extra])];
  return gblk(
    "sources",
    { x: 0, y, w: 12, h: 2 },
    {
      sources: labels.map((label) => ({ label, url: undefined })),
      note: "Every figure above is a held, cited value — nothing is estimated.",
    },
  );
}

export interface ComposeInput {
  events: MarketEvent[];
  subscriberZip: string;
  subscriberPlace: string | null;
  area: MarketArea;
  /** MM/DD/YYYY — stated exactly once in the doc. */
  asOf: string;
}

function headerAndHero(
  input: ComposeInput,
  kicker: string,
): { blocks: EmailDoc["blocks"]; y: number } {
  const blocks: EmailDoc["blocks"] = [];
  let y = 0;
  blocks.push(gblk("header", { x: 0, y, w: 12, h: 2 }));
  y += 2;
  blocks.push(
    gblk(
      "hero",
      { x: 0, y, w: 12, h: 3 },
      {
        kicker,
        value: input.subscriberPlace ?? input.area.anchor_place,
        label: capFirst(input.area.label),
        prose: "",
      },
    ),
  );
  y += 3;
  blocks.push(
    gblk("text", { x: 0, y, w: 12, h: 1 }, { body: `Data as of ${input.asOf}.`, align: "left" }),
  );
  y += 1;
  return { blocks, y };
}

/** Alert email: the firing event's cards + minimal context, same skeleton. */
export function composeAlertDoc(input: ComposeInput): EmailDoc {
  const { blocks, y: y0 } = headerAndHero(input, "Market alert");
  let y = y0;
  for (const e of input.events) {
    blocks.push(eventCard(e, y));
    y += 3;
  }
  blocks.push(sourcesBlock(input.events, [], y));
  y += 2;
  blocks.push(gblk("footer", { x: 0, y, w: 12, h: 3, static: true }));
  return { globalStyle: { ...NEUTRAL_SKELETON_STYLE }, blocks };
}

export interface InsiderCard {
  /** Specific-outcome title (caller provides from held data; composer never invents). */
  title: string;
  rows: { label: string; value: string }[];
  source: string;
}

export interface ComposeWeeklyInput extends ComposeInput {
  heatRanks: AreaHeatRank[];
  areaLabelsById: Record<string, string>;
  insider: InsiderCard | null;
}

/** Weekly roundup: event cards → heat leaderboard → insider extra (flagged). */
export function composeWeeklyDoc(input: ComposeWeeklyInput): EmailDoc {
  const { blocks, y: y0 } = headerAndHero(input, "Your weekly market read");
  let y = y0;
  for (const e of input.events) {
    blocks.push(eventCard(e, y));
    y += 3;
  }

  if (input.heatRanks.length > 0) {
    const items: ListItem[] = input.heatRanks
      .filter((r) => input.areaLabelsById[r.area_id])
      .slice(0, 6)
      .map((r) => ({
        lead: `#${r.position}`,
        text: capFirst(input.areaLabelsById[r.area_id]),
      }));
    if (items.length > 0) {
      blocks.push(
        gblk(
          "list",
          { x: 0, y, w: 12, h: 4 },
          { title: "Hottest market areas in Lee & Collier this week", items },
        ),
      );
      y += 4;
    }
  }

  if (input.insider) {
    blocks.push(
      gblk(
        "signal",
        { x: 0, y, w: 12, h: 3 },
        {
          kicker: "Insider extra — usually part of the paid tier",
          title: input.insider.title,
          body: input.insider.rows.map((r) => `${r.label}: ${r.value}`).join(" · "),
        },
      ),
    );
    y += 3;
  }

  blocks.push(sourcesBlock(input.events, input.insider ? [input.insider.source] : [], y));
  y += 2;
  blocks.push(gblk("footer", { x: 0, y, w: 12, h: 3, static: true }));
  return { globalStyle: { ...NEUTRAL_SKELETON_STYLE }, blocks };
}

export interface ComposeBaselineInput {
  subscriberZip: string;
  subscriberPlace: string | null;
  area: MarketArea;
  asOf: string;
  snapshot: ZipMetricsSnapshot;
  heatPosition: number | null;
  recentEvents: MarketEvent[];
}

/** Baseline welcome: "here's your market area right now" — held metrics only
 *  (nulls omitted), the area's heat position, recent events, ONE low-key paid
 *  line (no button — long-tenure subscribers convert, never push at signup). */
export function composeBaselineDoc(input: ComposeBaselineInput): EmailDoc {
  const { blocks, y: y0 } = headerAndHero(
    {
      events: input.recentEvents,
      subscriberZip: input.subscriberZip,
      subscriberPlace: input.subscriberPlace,
      area: input.area,
      asOf: input.asOf,
    },
    "Welcome — your market, right now",
  );
  let y = y0;

  const held = (Object.keys(input.snapshot.metrics) as MetricKey[]).filter(
    (k) => input.snapshot.metrics[k] != null,
  );
  for (let i = 0; i < held.length; i += 2) {
    for (const [j, key] of [held[i], held[i + 1]].entries()) {
      if (!key) continue;
      blocks.push(
        gblk(
          "metric-card",
          { x: j === 0 ? 0 : 6, y, w: 6, h: 4 },
          {
            metricValue: formatValue(input.snapshot.metrics[key], METRIC_UNITS[key]),
            metricLabel: METRIC_LABELS[key],
          },
        ),
      );
    }
    y += 4;
  }

  if (input.heatPosition != null) {
    blocks.push(
      gblk(
        "signal",
        { x: 0, y, w: 12, h: 3 },
        {
          kicker: "Market heat",
          title: `#${input.heatPosition} hottest market area in Lee & Collier`,
          body: `${capFirst(input.area.label)} ranks #${input.heatPosition} on pace, tightness, and momentum right now.`,
        },
      ),
    );
    y += 3;
  }

  for (const e of input.recentEvents.slice(0, 3)) {
    blocks.push(eventCard(e, y));
    y += 3;
  }

  blocks.push(
    gblk(
      "text",
      { x: 0, y, w: 12, h: 1 },
      {
        body: "From here on you'll only hear from us when this market actually moves — quiet weeks stay quiet.",
        align: "left",
      },
    ),
  );
  y += 1;

  blocks.push(sourcesBlock(input.recentEvents, ["SWFL Data Gulf listing lifecycle"], y));
  y += 2;
  blocks.push(gblk("footer", { x: 0, y, w: 12, h: 3, static: true }));
  return { globalStyle: { ...NEUTRAL_SKELETON_STYLE }, blocks };
}
