// lib/email/zip-seed.ts
//
// The ZIP email prebuild (Lane B fork 1b — OPERATOR'S SHAPE): clicking a ZIP on
// the homepage map lands in the email lab with that ZIP's page already built as
// an email. DETERMINISTIC + composed in code from the same cited live loaders
// the lab's AI uses (lib/email/market-context.ts) — never an LLM authoring call
// on arrival; drive-by clicks and bots cost ~$0. The AI engages when the
// visitor edits.
//
// NUMBERS PEOPLE CARE ABOUT (operator ruling 07/03/2026): value + direction,
// list price, days on market, live market motion, rent. Census ACS rides a
// 2018–2022 vintage (the Bureau's own publication lag) — AT MOST ONE census
// line ships (median household income, dated honestly); population/age/
// owner-occupied/household demographics stay on the ZIP page.
//
// Empty-tolerant by contract: unknown ZIP, no lake creds, or zero figures →
// null, and each surface opens in its normal state. Every rendered value is a
// MarketFigure verbatim (real source + as-of); prose sentences carry NO numbers.

import { createBlock, DEFAULT_GLOBAL_STYLE } from "./doc/default-docs";
import type { BlockOf, BlockPropsMap, BlockType, EmailDoc } from "./doc/types";
import { loadLifecycleDigest, loadMarketFigures, type MarketFigure } from "./market-context";

/** Seed-style block: defaults + overrides (mirror of default-docs' seedBlock,
 *  which is deliberately unexported). */
function blk<K extends BlockType>(type: K, overrides: Partial<BlockPropsMap[K]> = {}): BlockOf<K> {
  const b = createBlock(type);
  Object.assign(b.props as object, overrides);
  return b;
}

/** Same env-aware base the send routes use — local previews resolve locally,
 *  prod-built docs carry prod URLs. */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com").replace(
  /\/$/,
  "",
);

/** "Median home value — Cape Coral (33914)" → "Cape Coral". */
function placeFromLabel(figs: MarketFigure[], zip: string): string {
  const hv = figs.find((f) => f.key === "home_value");
  const m = hv?.label.match(/—\s*(.+?)\s*\(\d{5}\)\s*$/);
  return m?.[1] ?? zip;
}

function fig(figs: MarketFigure[], key: string): MarketFigure | undefined {
  return figs.find((f) => f.key === key);
}

/** "Zillow ZHVI · as of 05/31/2026" (as-of stated once per figure line). */
function cite(f: MarketFigure): string {
  return f.as_of ? `${f.source} · as of ${f.as_of}` : f.source;
}

/**
 * Builds the deterministic ZIP email. Returns null when the ZIP yields no
 * figures — the caller opens its surface unseeded (never an error page).
 */
export async function buildZipSeedDoc(zip: string): Promise<EmailDoc | null> {
  if (!/^\d{5}$/.test(zip)) return null;

  // Parallel pulls — the same loaders the ZIP page renders from. Each is
  // empty-tolerant; only zero market figures blocks the seed entirely.
  const [allFigs, lifecycle] = await Promise.all([
    loadMarketFigures({ kind: "zip", value: zip }),
    loadLifecycleDigest({ kind: "zip", value: zip }),
  ]);

  // ONE census line max: median household income. Every other ACS figure
  // (population, owner-occupied) is dropped — its 2022 vintage reads stale next
  // to this week's market rows.
  const figs = allFigs.filter((f) => f.source !== "U.S. Census ACS" || f.key === "income");
  if (figs.length === 0) return null;

  const place = placeFromLabel(figs, zip);
  const value = fig(figs, "home_value");
  const active = fig(figs, "active");
  const medianList = fig(figs, "median_list");
  const dom = fig(figs, "dom");

  // Hero number: home value, else median list — a ZIP with neither still seeds
  // (stats/list carry what exists), the hero states the place only.
  const heroFig = value ?? medianList;

  const statFigs = [active, medianList, dom].filter((f): f is MarketFigure => Boolean(f));

  // "On the record": the remaining care-worthy figures, verbatim, source-cited.
  // Order fixed: direction first (value YoY), then rent, rent YoY, income last.
  const listOrder = ["home_value_yoy", "rent", "rent_yoy", "income"];
  const usedKeys = new Set(["home_value", ...statFigs.map((f) => f.key)]);
  const listFigs = listOrder
    .map((k) => fig(figs, k))
    .filter((f): f is MarketFigure => Boolean(f) && !usedKeys.has((f as MarketFigure).key));

  const sources = [...new Map(figs.map((f) => [f.source, f])).values()];

  const blocks: EmailDoc["blocks"] = [
    blk("header"),
    blk("hero", {
      kicker: `This Week in ${place}`,
      value: heroFig?.value ?? place,
      label: heroFig
        ? `${heroFig.key === "home_value" ? "Median Home Value" : "Median List Price"} · ${place} (${zip}) · ${cite(heroFig)}`
        : `${place} (${zip})`,
      prose: `Where ${place} stands right now — every figure in this email is pulled live and cited to its source.`,
    }),
    // The ZIP cutout — the report page's shape as a branded PNG card (email
    // clients strip inline SVG; /api/zip-shape rasterizes the same geometry).
    blk("image", {
      url: `${SITE}/api/zip-shape/${zip}`,
      alt: `Map cutout of ${place} (${zip})`,
      caption: `${place} · ZIP ${zip}`,
    }),
  ];

  if (statFigs.length > 0) {
    blocks.push(
      blk("stats", {
        stats: statFigs.map((f) => ({
          value: f.value,
          label:
            f.key === "active"
              ? "Active Listings"
              : f.key === "median_list"
                ? "Median List Price"
                : "Avg Days on Market",
        })),
      }),
    );
  }

  // Market motion — the lifecycle digest sentence (price cuts / new listings /
  // sales over the last 30 or 90 days), composed in code from live transition
  // counts. Window rides in the loader's own label.
  if (lifecycle) {
    const windowLabel = lifecycle.label.match(/\(([^)]+)\)\s*$/)?.[1] ?? "recent weeks";
    blocks.push(
      blk("signal", {
        kicker: `${lifecycle.source}${lifecycle.as_of ? ` · as of ${lifecycle.as_of}` : ""}`,
        title: `What just moved (${windowLabel})`,
        body: lifecycle.value,
      }),
    );
  }

  if (listFigs.length > 0) {
    blocks.push(
      blk("list", {
        title: "On the record",
        items: listFigs.map((f) => ({
          lead: `${f.value} ·`,
          text: `${f.label} (${cite(f)})`,
        })),
      }),
    );
  }

  blocks.push(
    blk("text", {
      body: `Sources: ${sources.map((f) => cite(f)).join(" · ")}. Figures refresh from live data when this email rebuilds.`,
      align: "left",
    }),
    blk("button", { label: "See the full ZIP report", url: `${SITE}/r/zip-report/${zip}` }),
    blk("footer"),
  );

  return { globalStyle: { ...DEFAULT_GLOBAL_STYLE }, blocks };
}
