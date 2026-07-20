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
function eventCard(e: MarketEvent, y: number, kickerOverride?: string): BlockOf<"signal"> {
  const f = e.facts[0];
  const kickerByType: Record<MarketEvent["type"], string> = {
    threshold_cross: "Market move",
    rank_flip: "Rank change",
    lifecycle_burst: "Market activity",
    nearby_news: "Local news",
    heat_shift: "Market heat",
  };
  // ZIP-grain events carry their ZIP in the title: an area email can hold the
  // same fact label for several ZIPs (e.g. two price-cut bursts), and without
  // the qualifier the cards read as one contradictory number (07/19 screenshot).
  const scope = e.zip != null ? ` (${e.zip})` : "";
  const title =
    e.type === "nearby_news"
      ? `${e.facts.length} local update${e.facts.length === 1 ? "" : "s"} nearby`
      : `${f.label}${scope}: ${formatValue(f.value, f.unit)}`;
  const body =
    e.type === "nearby_news"
      ? e.facts.map((x) => x.label).join(" · ")
      : f.from != null && f.to != null
        ? e.type === "lifecycle_burst"
          ? // Surge baseline is a trailing weekly AVERAGE (can be fractional) —
            // name it as one; "Moved from 2.6" read as a broken count.
            `Up from a typical week of ${formatValue(f.from, f.unit)} (trailing average).`
          : `Moved from ${formatValue(f.from, f.unit)} to ${formatValue(f.to, f.unit)}.`
        : "";
  return gblk(
    "signal",
    { x: 0, y, w: 12, h: 3 },
    { kicker: kickerOverride ?? kickerByType[e.type], title, body },
  );
}

const ROLLUP_MAX = 8;

/** ONE lead story + a compact per-ZIP rollup. The 07/19 operator review killed
 *  the previous layout — every event as its own full-size card produced a wall
 *  of identical boxes with no hierarchy and nothing to scan. Now: the subject
 *  ZIP's event (or the first event) leads as a card; every other ZIP-grain fact
 *  collapses into one scannable rollup line per ZIP; non-ZIP events (news etc.)
 *  keep their own cards. */
function splitLeadAndRollup(events: MarketEvent[], subjectZip: string) {
  const zipEvents = events.filter((e) => e.zip != null && e.type !== "nearby_news");
  const other = events.filter((e) => e.zip == null || e.type === "nearby_news");
  const lead = zipEvents.find((e) => e.zip === subjectZip) ?? zipEvents[0] ?? null;
  const byZip = new Map<string, string[]>();
  for (const e of zipEvents) {
    if (e === lead) continue;
    const f = e.facts[0];
    const line = `${f.label}: ${formatValue(f.value, f.unit)}`;
    byZip.set(e.zip as string, [...(byZip.get(e.zip as string) ?? []), line]);
  }
  const rollup: ListItem[] = [...byZip.entries()].map(([zip, lines]) => ({
    lead: zip,
    text: lines.join(" · "),
  }));
  return { lead, rollup, other };
}

/** Every issue leads somewhere: one button to the subscriber's live ZIP report.
 *  Label names the ZIP, not the city — the destination is ZIP-grain (a "Fort
 *  Myers report" label over a 33908 link mislabels the grain — operator 07/19). */
function ctaBlock(url: string, zip: string, y: number): BlockOf<"button"> {
  return gblk("button", { x: 0, y, w: 12, h: 2 }, { label: `See the full ZIP ${zip} report`, url });
}

const NEWS_H = 4;

/** Nearby-news event → a linked story list — every story leads to its article
 *  ("make stories clickable so they lead to the story" — operator 07/19). */
function newsListBlock(e: MarketEvent, y: number): BlockOf<"list"> {
  const items: ListItem[] = e.facts.map((f) => ({ text: f.label, linkUrl: f.url }));
  return gblk("list", { x: 0, y, w: 12, h: NEWS_H }, { title: "Local news nearby", items });
}

/** News renders as a linked list; every other non-ZIP event stays a card. */
function otherEventBlock(
  e: MarketEvent,
  y: number,
): { block: EmailDoc["blocks"][number]; h: number } {
  return e.type === "nearby_news"
    ? { block: newsListBlock(e, y), h: NEWS_H }
    : { block: eventCard(e, y), h: 3 };
}

/** Dedupe every fact source into ONE collapsed sources block. In the sent email
 *  it renders as a compact "Sources (N) — view all" line (Gmail strips <details>),
 *  so the full list needs a web home: the report's #section-sources accordion. */
function sourcesAnchor(reportUrl?: string | null): string | undefined {
  return reportUrl ? `${reportUrl}#section-sources` : undefined;
}

function sourcesBlock(
  events: MarketEvent[],
  extra: string[],
  y: number,
  viewAllUrl?: string,
): BlockOf<"sources"> {
  const labels = [...new Set([...events.flatMap((e) => e.facts.map((f) => f.source)), ...extra])];
  return gblk(
    "sources",
    { x: 0, y, w: 12, h: 2 },
    {
      sources: labels.map((label) => ({ label, url: undefined })),
      note: "Every figure above comes straight from the source cited — nothing is estimated.",
      ...(viewAllUrl ? { viewAllUrl } : {}),
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
  /** Absolute URL of the subscriber's live ZIP report — renders the CTA button. */
  reportUrl?: string | null;
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

/** Alert email: ONE firing event leads, siblings roll up, CTA out. */
export function composeAlertDoc(input: ComposeInput): EmailDoc {
  const { blocks, y: y0 } = headerAndHero(input, "Market alert");
  let y = y0;
  const placeOrZip = input.subscriberPlace ?? `ZIP ${input.subscriberZip}`;
  const { lead, rollup, other } = splitLeadAndRollup(input.events, input.subscriberZip);
  if (lead) {
    const leadScope = lead.zip === input.subscriberZip ? placeOrZip : `ZIP ${lead.zip}`;
    blocks.push(eventCard(lead, y, `Market alert — ${leadScope}`));
    y += 3;
  }
  if (rollup.length > 0) {
    blocks.push(
      gblk(
        "list",
        { x: 0, y, w: 12, h: 4 },
        { title: `Also moving in ${input.area.label}`, items: rollup.slice(0, ROLLUP_MAX) },
      ),
    );
    y += 4;
  }
  for (const e of other) {
    const { block, h } = otherEventBlock(e, y);
    blocks.push(block);
    y += h;
  }
  if (input.reportUrl) {
    blocks.push(ctaBlock(input.reportUrl, input.subscriberZip, y));
    y += 2;
  }
  blocks.push(sourcesBlock(input.events, [], y, sourcesAnchor(input.reportUrl)));
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

/** Weekly roundup: ONE lead story → per-ZIP rollup → heat leaderboard → news →
 *  insider extra (flagged) → report CTA. Hierarchy over card-wall (07/19). */
export function composeWeeklyDoc(input: ComposeWeeklyInput): EmailDoc {
  const { blocks, y: y0 } = headerAndHero(input, "Your weekly market read");
  let y = y0;
  const placeOrZip = input.subscriberPlace ?? `ZIP ${input.subscriberZip}`;
  const { lead, rollup, other } = splitLeadAndRollup(input.events, input.subscriberZip);
  if (lead) {
    const leadScope = lead.zip === input.subscriberZip ? placeOrZip : `ZIP ${lead.zip}`;
    blocks.push(eventCard(lead, y, `This week's lead — ${leadScope}`));
    y += 3;
  }
  if (rollup.length > 0) {
    blocks.push(
      gblk(
        "list",
        { x: 0, y, w: 12, h: 4 },
        { title: `Around ${input.area.label}`, items: rollup.slice(0, ROLLUP_MAX) },
      ),
    );
    y += 4;
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

  for (const e of other) {
    const { block, h } = otherEventBlock(e, y);
    blocks.push(block);
    y += h;
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

  if (input.reportUrl) {
    blocks.push(ctaBlock(input.reportUrl, input.subscriberZip, y));
    y += 2;
  }

  blocks.push(
    sourcesBlock(
      input.events,
      input.insider ? [input.insider.source] : [],
      y,
      sourcesAnchor(input.reportUrl),
    ),
  );
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
  /** Absolute URL of the subscriber's live ZIP report — renders the CTA button. */
  reportUrl?: string | null;
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

  const placeOrZip = input.subscriberPlace ?? `ZIP ${input.subscriberZip}`;
  const { lead, rollup, other } = splitLeadAndRollup(input.recentEvents, input.subscriberZip);
  if (lead) {
    const leadScope = lead.zip === input.subscriberZip ? placeOrZip : `ZIP ${lead.zip}`;
    blocks.push(eventCard(lead, y, `Happening now — ${leadScope}`));
    y += 3;
  }
  if (rollup.length > 0) {
    blocks.push(
      gblk(
        "list",
        { x: 0, y, w: 12, h: 4 },
        { title: `Around ${input.area.label}`, items: rollup.slice(0, ROLLUP_MAX) },
      ),
    );
    y += 4;
  }
  for (const e of other.slice(0, 1)) {
    const { block, h } = otherEventBlock(e, y);
    blocks.push(block);
    y += h;
  }

  if (input.reportUrl) {
    blocks.push(ctaBlock(input.reportUrl, input.subscriberZip, y));
    y += 2;
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

  blocks.push(
    sourcesBlock(
      input.recentEvents,
      ["SWFL Data Gulf listings data"],
      y,
      sourcesAnchor(input.reportUrl),
    ),
  );
  y += 2;
  blocks.push(gblk("footer", { x: 0, y, w: 12, h: 3, static: true }));
  return { globalStyle: { ...NEUTRAL_SKELETON_STYLE }, blocks };
}

// ── Rich composition — the researched zip-seed anatomy + the week's events ──
//
// Operator ruling 07/19 (verbatim: "how does builder not put together a full
// rundown brief of what is going, what has happened and what the future looks
// like?"): the recurring email is NOT a bare event list. It is the full
// zip-seed brief — map cutout, ranked metric cards from the same pool the
// webpage renders, the baked narrator commentary, the [INFERENCE]+falsifier
// outlook — with the week's events and the regional housing read spliced in
// ahead of its sources/CTA tail. buildZipSeedDoc is empty-tolerant; when it
// returns null the composer falls back to the plain event shape.

export interface RegionalRead {
  /** Held, brain-baked conclusion text — served verbatim (read rates as written). */
  text: string;
  sourceLabel: string;
}

function regionalReadBlock(r: RegionalRead, y: number): BlockOf<"signal"> {
  return gblk(
    "signal",
    { x: 0, y, w: 12, h: 5 },
    { kicker: "The regional read", title: "Southwest Florida housing right now", body: r.text },
  );
}

interface EventSectionInput {
  events: MarketEvent[];
  subscriberZip: string;
  subscriberPlace: string | null;
  area: MarketArea;
  heatRanks?: AreaHeatRank[];
  areaLabelsById?: Record<string, string>;
  insider?: InsiderCard | null;
  regionalRead?: RegionalRead | null;
}

function eventSectionBlocks(
  kind: "weekly" | "baseline",
  input: EventSectionInput,
  startY: number,
): { blocks: EmailDoc["blocks"]; y: number } {
  const blocks: EmailDoc["blocks"] = [];
  let y = startY;
  const placeOrZip = input.subscriberPlace ?? `ZIP ${input.subscriberZip}`;
  const { lead, rollup, other } = splitLeadAndRollup(input.events, input.subscriberZip);
  if (lead) {
    const leadScope = lead.zip === input.subscriberZip ? placeOrZip : `ZIP ${lead.zip}`;
    const kicker = kind === "weekly" ? "This week's lead" : "Happening now";
    blocks.push(eventCard(lead, y, `${kicker} — ${leadScope}`));
    y += 3;
  }
  if (rollup.length > 0) {
    blocks.push(
      gblk(
        "list",
        { x: 0, y, w: 12, h: 4 },
        { title: `Around ${input.area.label}`, items: rollup.slice(0, ROLLUP_MAX) },
      ),
    );
    y += 4;
  }
  if (kind === "weekly" && input.heatRanks && input.heatRanks.length > 0 && input.areaLabelsById) {
    const labels = input.areaLabelsById;
    const items: ListItem[] = input.heatRanks
      .filter((r) => labels[r.area_id])
      .slice(0, 6)
      .map((r) => ({ lead: `#${r.position}`, text: capFirst(labels[r.area_id]) }));
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
  const newsCap = kind === "weekly" ? other.length : Math.min(other.length, 1);
  for (const e of other.slice(0, newsCap)) {
    const { block, h } = otherEventBlock(e, y);
    blocks.push(block);
    y += h;
  }
  if (input.regionalRead) {
    blocks.push(regionalReadBlock(input.regionalRead, y));
    y += 5;
  }
  if (kind === "weekly" && input.insider) {
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
  if (kind === "baseline") {
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
  }
  return { blocks, y };
}

/** Where the seed doc's tail (sources → button → footer) begins. */
function tailStart(seed: EmailDoc): { index: number; y: number } {
  const index = seed.blocks.findIndex(
    (b) => b.type === "sources" || b.type === "button" || b.type === "footer",
  );
  if (index === -1) return { index: seed.blocks.length, y: 0 };
  const layout = (seed.blocks[index] as { layout?: BlockLayout }).layout;
  return { index, y: layout?.y ?? 0 };
}

function spliceIntoSeed(
  seed: EmailDoc,
  kind: "weekly" | "baseline",
  input: EventSectionInput,
): EmailDoc {
  const { index, y } = tailStart(seed);
  const section = eventSectionBlocks(kind, input, y);
  const delta = section.y - y;
  const blocks = [...seed.blocks];
  for (let i = index; i < blocks.length; i++) {
    const b = blocks[i] as { layout?: BlockLayout };
    if (b.layout) b.layout = { ...b.layout, y: b.layout.y + delta };
  }
  blocks.splice(index, 0, ...section.blocks);
  const src = blocks.find((b) => b.type === "sources") as BlockOf<"sources"> | undefined;
  if (src) {
    const extra = [
      ...input.events.flatMap((e) => e.facts.map((f) => f.source)),
      ...(input.insider ? [input.insider.source] : []),
      ...(input.regionalRead ? [input.regionalRead.sourceLabel] : []),
    ];
    const have = new Set((src.props.sources ?? []).map((s) => s.label));
    for (const label of extra) {
      if (label && !have.has(label)) {
        src.props.sources.push({ label, url: undefined });
        have.add(label);
      }
    }
  }
  return { ...seed, blocks };
}

export type RichWeeklyInput = ComposeWeeklyInput & {
  seedDoc?: EmailDoc | null;
  regionalRead?: RegionalRead | null;
};

export function composeRichWeeklyDoc(input: RichWeeklyInput): EmailDoc {
  if (!input.seedDoc) return composeWeeklyDoc(input);
  return spliceIntoSeed(input.seedDoc, "weekly", input);
}

export type RichBaselineInput = ComposeBaselineInput & {
  seedDoc?: EmailDoc | null;
  regionalRead?: RegionalRead | null;
};

export function composeRichBaselineDoc(input: RichBaselineInput): EmailDoc {
  if (!input.seedDoc) return composeBaselineDoc(input);
  return spliceIntoSeed(input.seedDoc, "baseline", {
    events: input.recentEvents,
    subscriberZip: input.subscriberZip,
    subscriberPlace: input.subscriberPlace,
    area: input.area,
    regionalRead: input.regionalRead,
  });
}
