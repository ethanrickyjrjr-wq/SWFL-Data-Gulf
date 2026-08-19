// lib/deliverable/recipes/under-contract.ts
//
// R4 · UNDER CONTRACT — the FIRST recipe migrated to recipes-as-config
// (spec 2026-08-18, plan 2026-08-19 Task 5). The declarative layer — ribbon, subject
// templates, spec cells, CTA, narrator framing, banned sold phrasings, narrator
// strips — is DATA on the registry entry (`RECIPES["under-contract"].config`,
// recipes.ts), consumed by the ONE config builder. What remains here is this
// recipe's irreducible math: the SPEED ladder, registered in derivations.ts as
// "under-contract/speed" + "under-contract/speed-sources".
//
// The walked lessons that used to live in the 654-line hand-coded builder ride
// with the code that owns them:
//   • THE CONTRACT DATE IS THE BUILD DATE (operator decree 08/05/2026: "The fucking
//     under contract date is the date the email is fucking made, user can change it
//     if they want") — so days-to-contract IS the listing clock's own count, and it
//     is NEVER parsed out of the prompt (§1.13: seed text is display, not identity).
//   • THE EMAIL STATES A PENDING FACT AND NEVER A SOLD ONE — the banned phrasings
//     live on the config (`bannedNarrativePhrases`); SOLD_LANGUAGE below is a
//     derived view of that SAME array, so the recipe guard, the fleet builder, and
//     the acceptance script's bytes assertion can never diverge.
//   • The comparand is the LIST-side median (`zip_active_dom_median` through
//     fetchZipBenchmark) — never the sold-side table; data-roots.md:69-71 says the
//     two are never interchanged, and the July build broke exactly that.
//   • A median over a handful of listings is not a market fact — below the sample
//     floor the comparison is DROPPED and this home's number ships alone.

import { createBlock } from "@/lib/email/doc/default-docs";
import { spec } from "@/lib/email/listing-flyer";
import { todayIso } from "@/lib/listings/dom";
import { fetchZipBenchmark } from "@/lib/buyer-leverage/zip-benchmark";
import { RECIPES } from "@/lib/deliverable/recipes";
import { subjectFor } from "./config";
import { resolveCells } from "./cell-catalog";
import type { Derivation } from "./derivations";
import type { RecipeBuildContext } from "./index";
import type { ChromeBlock } from "@/lib/email/lifecycle-chrome";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { StatItem } from "@/lib/email/doc/types";

const CFG = RECIPES["under-contract"].config!;

/** The citation root — who the DATA is attributed to, never where a reader is sent.
 *  Env would ship "http://localhost:3000" as the citation of a locally-built doc. */
const SITE = "https://www.swfldatagulf.com";

/**
 * *** THE BANNED SOLD PHRASINGS — ONE ROOT, DERIVED FROM THE CONFIG. ***
 * The config builder's narrative drop reads the config; the acceptance script's
 * bytes assertion imports THIS. Both are the same array under the hood, so a phrase
 * added in one place guards everywhere. Lowercase; consumers compare lowercased.
 */
export const SOLD_LANGUAGE: readonly string[] = Object.freeze([...CFG.bannedNarrativePhrases!]);

/** The derivation's own constants + views the tests and the acceptance script read.
 *  ribbon/ctaLabel are DERIVED from the config (one root); the floor defaults from
 *  config.params and may be overridden per call (a field, not a magic number). */
export const UNDER_CONTRACT_FIELDS = Object.freeze({
  ribbon: CFG.ribbon,
  ctaLabel: CFG.ctaLabel,
  /** THE SAMPLE FLOOR FOR THE COMPARAND — below it the comparison is DROPPED and
   *  this home's number ships alone. The email is still correct, just quieter. */
  minMedianSample: Number(CFG.params!.minMedianSample),
  citation: { label: "SWFL Data Gulf", url: SITE },
  /** A sources note longer than this wraps into a paragraph and reads as a disclaimer. */
  noteMaxChars: 200,
});

export type UnderContractFields = typeof UNDER_CONTRACT_FIELDS;

// ── The speed number ─────────────────────────────────────────────────────────

/**
 * DAYS TO CONTRACT — this home's number. With the contract date pinned to the build
 * date (the decree), contractDate − listedDate IS today − listedDate, which is what
 * `data_lake.listing_dom` computes at read time and `resolve-subject.ts` attaches as
 * `facts.daysOnMarket` — ONLY when the count is not a first-seen floor, so the floor
 * guard is INHERITED, not re-implemented. NEVER ESTIMATED: null → open slots.
 */
export function daysToContract(facts: ListingFacts): number | null {
  const d = facts.daysOnMarket;
  if (d == null || !Number.isFinite(d) || d < 0) return null;
  return Math.floor(d);
}

/** The comparand plus the scope it was actually computed over. */
export interface Speed {
  /** This home: listed → under contract, in whole days. */
  daysToContract: number;
  /** The market's median days LISTED (active for-sale, floors excluded). Null = dropped. */
  medianDom: number | null;
  /** How many listings the median was computed over. Below the floor → the median drops. */
  sampleSize: number;
  /** *** THE ONE STRING EVERY CONSUMER PRINTS *** — "ZIP 33908". The stat cell AND
   *  the sources note read THIS, never a ZIP of their own: a reader who re-runs the
   *  stated criterion must reproduce the printed number. */
  scopeLabel: string;
  /** Which rung produced the comparand, for the provenance table. */
  rung: 1 | 2;
  /** When we READ it — the median is computed live at read time (the build date). */
  asOfIso: string;
}

/**
 * THE SPEED LADDER. RUNG 1 — the subject's ZIP through fetchZipBenchmark → the
 * `zip_active_dom_median` RPC (free, live, LIST-side, floors excluded). RUNG 2 —
 * the comparison is DROPPED and this home's number ships alone. The county rung is
 * deliberately NOT built: no county-scoped median root exists, and minting one
 * mid-build would be a second root for a catalogued concept (RULE 0.55). Empty-
 * tolerant by contract (RULE 0.7): no creds, a query error, or a thin sample → the
 * median is null. Never throws, never invents.
 */
export async function loadSpeed(
  facts: ListingFacts,
  fields: UnderContractFields = UNDER_CONTRACT_FIELDS,
  deps: { benchmark?: typeof fetchZipBenchmark; asOf?: string } = {},
): Promise<Speed | null> {
  const days = daysToContract(facts);
  if (days == null) return null;

  // This derivation reads the clock (the ONE that does — recorded, not discovered:
  // registry-seam runs builders milliseconds apart so both calls agree; asOfIso
  // reaches the doc only through the sources note, which needs a live median).
  const asOfIso = deps.asOf ?? todayIso();
  const zip = String(facts.zip ?? "").match(/\d{5}/)?.[0];
  const base: Speed = {
    daysToContract: days,
    medianDom: null,
    sampleSize: 0,
    scopeLabel: zip ? `ZIP ${zip}` : fields.citation.label,
    rung: 2,
    asOfIso,
  };
  if (!zip) return base;

  try {
    const bench = await (deps.benchmark ?? fetchZipBenchmark)(zip);
    const median = bench?.medianDomDays;
    const sample = bench?.sampleSize ?? 0;
    if (median == null || median < 0) return base;
    return { ...base, medianDom: median, sampleSize: sample, rung: 1 };
  } catch {
    return base; // a DB hiccup degrades to this home's number alone
  }
}

/**
 * THE SPEED PAIR. Two cells, never three, ONE WEIGHT ACROSS THE ROW (playbook finish
 * pass defect 5 — committed on New Listing AND re-committed on Coming Soon). The
 * contrast between 18 and 96 is carried BY THE NUMBERS. The label reads "days
 * listed", not "days on market": the comparand is the current AGE of homes still for
 * sale, not a completed interval — different facts, never worded as each other.
 */
export function speedStats(
  s: Speed,
  fields: UnderContractFields = UNDER_CONTRACT_FIELDS,
): StatItem[] {
  const cells: StatItem[] = [spec(String(s.daysToContract), "Days to contract")];
  if (s.medianDom != null && s.sampleSize >= fields.minMedianSample) {
    cells.push(spec(String(s.medianDom), `Median days listed · ${s.scopeLabel}`));
  }
  return cells;
}

/** The speed cells when nothing resolved: OPEN SLOTS whose LABELS are the
 *  instruction on the canvas, absent from the sent email. Never a zero (RULE 0.7). */
export function speedOpenSlots(): StatItem[] {
  return [
    spec(undefined, "Days to contract — add the count"),
    spec(undefined, "What's typical in this ZIP"),
  ];
}

// ── The derivations (registered in derivations.ts — never imported from here) ──

/** ONE speed read per build, shared by the middle and the tail derivation — the
 *  memo is keyed on the build context's identity, so two builds never share it. */
const speedMemo = new WeakMap<RecipeBuildContext, Promise<Speed | null>>();

function fieldsWith(params: Record<string, number | string>): UnderContractFields {
  const floor = Number(params.minMedianSample ?? UNDER_CONTRACT_FIELDS.minMedianSample);
  return { ...UNDER_CONTRACT_FIELDS, minMedianSample: floor };
}

function loadSpeedOnce(
  ctx: RecipeBuildContext,
  fields: UnderContractFields,
): Promise<Speed | null> {
  let p = speedMemo.get(ctx);
  if (!p) {
    p = loadSpeed(ctx.facts!, fields).catch(() => null);
    speedMemo.set(ctx, p);
  }
  return p;
}

/** MIDDLE — the speed pair, or its open slots. Also resolves {days} for the
 *  subject's strongest form ("Under contract in 9 days"). */
export const underContractSpeed: Derivation = async (ctx, params) => {
  const fields = fieldsWith(params);
  const speed = await loadSpeedOnce(ctx, fields);
  const days = ctx.facts ? daysToContract(ctx.facts) : null;
  const blocks: ChromeBlock[] = [
    {
      block: {
        id: createBlock("stats").id,
        type: "stats",
        props: { stats: speed ? speedStats(speed, fields) : speedOpenSlots(), variant: "strip" },
      },
      height: 3,
    },
  ];
  const subjectVars: Record<string, string> = days != null ? { days: String(days) } : {};
  return { blocks, subjectVars };
};

// The sources-note TAIL derivation was DELETED 08/19/2026 by operator decree ("get
// rid of whatever this shit is in all emails = Sources (1): … / Median days listed
// = …"). No email prints a Sources/methodology line; SourcesBlock renders null on
// the email paths as the one-door backstop. The median itself still ships in the
// speed strip above, computed exactly as before.

// ── Compat views over the config (one root; these can never drift from it) ─────

/** The spec strip as the config declares it — kept for the cell-policy fleet sweep
 *  and this recipe's own tests. */
export function underContractSpecs(facts: ListingFacts): StatItem[] {
  return resolveCells(CFG.specs, facts);
}

/** The deterministic subject, off the config's own templates. `days` feeds the
 *  bare rung's strongest form only — "Under contract in 213 days" is a subject
 *  that argues against the email underneath it, and the street/city rungs win
 *  first exactly as before. */
export function underContractSubject(facts: ListingFacts, days: number | null): string {
  return subjectFor(CFG, facts, days != null ? { days: String(days) } : {});
}
