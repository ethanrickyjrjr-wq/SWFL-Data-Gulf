// lib/deliverable/recipes/community-info.ts
//
// R · COMMUNITY INFO — the first recipe over the neighborhood lane (the vendor
// neighborhood + amenity roots that landed 08/03/2026; see docs/standards/data-roots.md,
// "Community / subdivision grain"). One NAMED neighborhood: where it sits, how it scores,
// what's nearby, and (when the tax roll matches it exactly) typical assessed values.
//
// ── THE SUBJECT IS A NAME, NOT A ZIP ─────────────────────────────────────────────────
//
// The vendor's 245 named neighborhoods (boundary polygon + centroid) are the subject
// universe. The typed area is matched against those NAMES — exact, case-insensitive,
// longest-name-first so "Vista del Sol at Burnt Store Marina" beats "Burnt Store".
// An AMBIGUOUS name (two cities share it, no city cue in the prompt) matches NOTHING:
// a nearest-guess neighborhood presented as the asked one is an invented fact about
// where someone lives. No match → the grid still lands, all cells OPEN SLOTS
// (default-grid pattern; RULE 0.7 — never refuse, never guess).
//
// ── WHY THE NARRATIVE IS DETERMINISTIC (no LLM) ──────────────────────────────────────
//
// The vendor ships a SENTENCE with every location score ("Variety of restaurants within
// a short drive"). Those are the source's own words about the place — so the paragraph
// is COMPOSED from them in code (back-on-market precedent), never authored by a model
// that would decorate a neighborhood it has never seen.
//
// ── CITATION DECREE ──────────────────────────────────────────────────────────────────
//
// The user-facing source for any steadyapi_* table is "realtor.com" — the vendor's name
// never appears in a built doc (test-enforced). The assessed-value cell cites the county
// tax roll and says "assessed", never "sale price" (T2-class label discipline).
import { createBlock } from "@/lib/email/doc/default-docs";
import { finalizeDoc, type PlanEntry } from "@/lib/email/doc/finalize-doc";
import { GRID_COLS } from "@/lib/email/grid-schema";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
// KNOWN-DEBT(data_lake: the steadyapi_* neighborhood tables live in the data_lake schema,
// which the generated Supabase types do not cover — same hatch as review-reply.ts).
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import type { EmailBlock, EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { RecipeBuildContext } from "./index";

// ── Shapes ───────────────────────────────────────────────────────────────────────────

export interface NeighborhoodScore {
  label: string;
  /** The vendor's own sentence about this score — the narrative's only source. */
  text: string;
  value: number;
}

export interface CommunityNeighborhood {
  slugId: string;
  name: string;
  city: string;
  scores: NeighborhoodScore[];
  /** The source row's as-of date (ISO) — provenance renders THIS date, never the build date. */
  asOf: string | null;
}

export interface AmenityCount {
  category: string;
  count: number;
}

export interface CommunityInfoDeps {
  /** Match the typed area against the vendor neighborhoods. Null = no honest match. */
  findNeighborhood?: (prompt: string) => Promise<CommunityNeighborhood | null>;
  /** Per-category amenity counts for a matched neighborhood — ONLY categories with rows. */
  loadAmenityCounts?: (slugId: string) => Promise<AmenityCount[]>;
  /** Median assessed value off the county tax roll, on an EXACT unique subdivision-name
   *  match only (the tax-roll grain is a different family; never fuzzy-joined). */
  loadAssessedValue?: (name: string) => Promise<{ value: number; asOf: string | null } | null>;
}

// ── Name matching (pure; exported for the test) ──────────────────────────────────────

/**
 * The typed prompt vs. the neighborhood names. Exact word-boundary containment,
 * longest name first. Two different neighborhoods matching (same name, two cities)
 * resolves ONLY if the prompt also names the city — otherwise null. Never a
 * nearest-guess.
 */
export function matchNeighborhoodName(
  prompt: string,
  names: ReadonlyArray<{ slugId: string; name: string; city: string }>,
): { slugId: string; name: string; city: string } | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const p = ` ${norm(prompt)} `;
  const contains = (needle: string) => p.includes(` ${norm(needle)} `);

  const hits = names.filter((n) => contains(n.name));
  if (hits.length === 0) return null;

  // Longest matched name wins outright (a sub-name inside a longer real match is noise).
  const maxLen = Math.max(...hits.map((h) => h.name.length));
  const longest = hits.filter((h) => h.name.length === maxLen);
  if (longest.length === 1) return longest[0]!;

  // Same name in several cities → the prompt's own city cue decides, or nothing does.
  const byCity = longest.filter((h) => contains(h.city));
  return byCity.length === 1 ? byCity[0]! : null;
}

// ── Default lake-backed deps (empty-tolerant; four-lane/ODD contract) ────────────────

async function findNeighborhoodInLake(prompt: string): Promise<CommunityNeighborhood | null> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("steadyapi_neighborhoods")
      .select("slug_id, name, city, scores, as_of");
    if (!Array.isArray(data)) return null;
    const rows = data as Array<{
      slug_id: string;
      name: string;
      city: string;
      scores: unknown;
      as_of: string | null;
    }>;
    const hit = matchNeighborhoodName(
      prompt,
      rows.map((r) => ({ slugId: r.slug_id, name: r.name, city: r.city })),
    );
    if (!hit) return null;
    const row = rows.find((r) => r.slug_id === hit.slugId);
    if (!row) return null;
    const scores = Array.isArray(row.scores)
      ? (row.scores as Array<Record<string, unknown>>)
          .map((s) => ({
            label: String(s.label ?? ""),
            text: String(s.text ?? ""),
            value: Number(s.value),
          }))
          .filter((s) => s.label && Number.isFinite(s.value))
      : [];
    return { slugId: row.slug_id, name: row.name, city: row.city, scores, asOf: row.as_of };
  } catch {
    return null;
  }
}

async function loadAmenityCountsFromLake(slugId: string): Promise<AmenityCount[]> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("steadyapi_neighborhood_amenities")
      .select("category")
      .eq("slug_id", slugId)
      .limit(2000);
    if (!Array.isArray(data)) return [];
    const counts = new Map<string, number>();
    for (const r of data as Array<{ category?: string | null }>) {
      const c = (r.category ?? "").trim();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].map(([category, count]) => ({ category, count }));
  } catch {
    return [];
  }
}

async function loadAssessedValueFromLake(
  name: string,
): Promise<{ value: number; asOf: string | null } | null> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("neighborhood_stats")
      .select("subdivision, median_just_value")
      .ilike("subdivision", name)
      .limit(2);
    if (!Array.isArray(data) || data.length !== 1) return null; // exact-unique only
    const v = Number((data[0] as { median_just_value?: unknown }).median_just_value);
    return Number.isFinite(v) && v > 0 ? { value: v, asOf: null } : null;
  } catch {
    return null;
  }
}

// ── Cells ────────────────────────────────────────────────────────────────────────────

/** ISO "2026-08-01" → "08/01/2026" (the house as-of format). Bad input → null. */
function mmddyyyy(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

/** The location scores this email shows, in fixed order — chosen by CONCEPT, never by
 *  which scores flatter the place (picking only high values would be spin on facts). */
const SCORE_ORDER = ["Walking", "Parks", "Groceries", "Restaurants", "Quiet"] as const;

export function scoreCells(scores: NeighborhoodScore[]): StatItem[] {
  const byLabel = new Map(scores.map((s) => [s.label, s]));
  return SCORE_ORDER.flatMap((label) => {
    const s = byLabel.get(label);
    return s ? [{ value: `${s.value}/10`, label: `${label} score` }] : [];
  }).slice(0, 4);
}

/** Curated category → human label. Only listed categories render (the raw taxonomy is
 *  vendor slugs); a category with rows renders its count, one WITHOUT rows renders
 *  NOTHING — never a zero-filled cell. */
const CATEGORY_LABELS: ReadonlyArray<[string, string]> = [
  ["restaurants", "Restaurants nearby"],
  ["grocery", "Grocery stores"],
  ["coffee", "Coffee shops"],
  ["parks", "Parks"],
  ["golf", "Golf"],
  ["elementaryschools", "Elementary schools"],
  ["preschools", "Preschools"],
  ["gyms", "Gyms"],
];

export function amenityCells(counts: AmenityCount[]): StatItem[] {
  const byCat = new Map(counts.map((c) => [c.category, c.count]));
  const cells: StatItem[] = [];
  for (const [cat, label] of CATEGORY_LABELS) {
    const n = byCat.get(cat);
    if (n && n > 0) cells.push({ value: String(n), label });
  }
  return cells.slice(0, 4);
}

/** Open-slot rows for an unmatched area — the instruction IS the label; StatsBlock
 *  drops empty cells from the sent email (the open-slot contract). */
function openSlotCells(): StatItem[] {
  return [
    { value: "", label: "Walking / parks / quiet scores — add yours" },
    { value: "", label: "Restaurants & shops nearby — add counts" },
    { value: "", label: "Schools nearby — add yours" },
    { value: "", label: "Typical home value — add a cited figure" },
  ];
}

/** The deterministic paragraph: the place, then the vendor's own sentences, verbatim. */
export function composeNarrative(hood: CommunityNeighborhood): string {
  const texts = SCORE_ORDER.map((l) => hood.scores.find((s) => s.label === l)?.text).filter(
    (t): t is string => Boolean(t && t.trim()),
  );
  const around = `${hood.name} sits in ${hood.city}, Florida.`;
  if (texts.length === 0) return around;
  return `${around} ${texts.slice(0, 3).join(". ")}.`;
}

// ── The builder ──────────────────────────────────────────────────────────────────────

function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

export async function buildCommunityInfo(
  ctx: RecipeBuildContext,
  deps: CommunityInfoDeps = {},
): Promise<EmailDoc | null> {
  const findNeighborhood = deps.findNeighborhood ?? findNeighborhoodInLake;
  const loadAmenities = deps.loadAmenityCounts ?? loadAmenityCountsFromLake;
  const loadAssessed = deps.loadAssessedValue ?? loadAssessedValueFromLake;

  const hood = await findNeighborhood(ctx.prompt).catch(() => null);
  const counts = hood ? await loadAmenities(hood.slugId).catch(() => []) : [];
  const assessed = hood ? await loadAssessed(hood.name).catch(() => null) : null;

  const entries: PlanEntry[] = [];
  const push = (block: Omit<EmailBlock, "layout">, h: number, isStatic?: true) => {
    entries.push({
      id: block.id,
      type: block.type,
      props: block.props as Record<string, unknown>,
      span: GRID_COLS,
      newRow: true,
      height: h,
      ...(isStatic ? { isStatic: true } : {}),
    });
  };

  // Header — the agent's own, sticky.
  push(keepOrDefault(ctx.currentDoc, "header"), 2);

  // Hero. Matched: the neighborhood over its city (both the source's own strings).
  // Unmatched: generic template copy — structure, not a data claim (the hero has no
  // open-slot escape, so it must never carry a guessed place name).
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: {
        kicker: "Community Info",
        value: hood ? hood.name : "Your community",
        label: hood ? `${hood.city}, Florida` : "A one-neighborhood snapshot",
      },
    },
    4,
  );

  // Row 1 — location scores (or the open-slot row). Provenance footnote carries the
  // SOURCE ROW's as-of date, never the build date (stale-month drift guard).
  const asOf = mmddyyyy(hood?.asOf);
  const scoreRow = hood ? scoreCells(hood.scores) : openSlotCells();
  if (scoreRow.length > 0) {
    push(
      {
        id: createBlock("stats").id,
        type: "stats",
        props: {
          stats: scoreRow,
          // "strip" for the hairline look AND because that variant provably renders the
          // provenance footnote (verified on the lifecycle strips 08/03/2026).
          variant: "strip",
          ...(hood
            ? {
                footnote: `*Neighborhood scores & nearby counts: realtor.com${
                  asOf ? `, as of ${asOf}` : ""
                }.`,
              }
            : {}),
        },
      },
      3,
    );
  }

  // Row 2 — what's actually nearby: only categories with rows; sparse stays sparse.
  const amenityRow = hood ? amenityCells(counts) : [];
  if (amenityRow.length > 0) {
    push({ id: createBlock("stats").id, type: "stats", props: { stats: amenityRow } }, 3);
  }

  // Row 3 — typical values, ONLY on an exact-unique tax-roll match, labeled as what it
  // is: an ASSESSED value. Never blended with sale or list prices (T2).
  if (assessed) {
    push(
      {
        id: createBlock("stats").id,
        type: "stats",
        props: {
          stats: [
            {
              value: `$${Math.round(assessed.value).toLocaleString("en-US")}`,
              label: "Median assessed value (county tax roll)",
            },
          ],
          footnote:
            "*Assessed (tax-roll) value — not a sale or asking price. Source: Florida DOR county roll.",
        },
      },
      3,
    );
  }

  // The narrative — deterministic, the vendor's own sentences (or an open slot).
  push(
    {
      id: createBlock("text").id,
      type: "text",
      props: { body: hood ? composeNarrative(hood) : "", align: "left" },
    },
    4,
  );

  // CTA + footer — the agent's ask and their CAN-SPAM footer.
  const site = brandWebsiteUrl(ctx.currentDoc);
  push(
    {
      id: createBlock("button").id,
      type: "button",
      props: {
        label: hood ? `Ask about ${hood.name}` : "Ask about this community",
        ...(site ? { url: site } : {}),
      },
    },
    2,
  );
  push(keepOrDefault(ctx.currentDoc, "footer"), 3, true);

  return finalizeDoc({ globalStyle: { ...ctx.currentDoc.globalStyle }, entries });
}
