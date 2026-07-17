import type { ProjectItem } from "@/lib/project/items";
import { PLACE_ZIP_CROSSWALK } from "@/refinery/lib/geography-gazetteer.mts";
import { cityForZip } from "@/lib/swfl-zip-city";

/**
 * Deterministic project auto-naming (Piece 1 §G) — turn a set of filed items into
 * a human title like "Fort Myers Beach 33931" or "SWFL Permits", so a project
 * created from anywhere (briefcase draft, charts page, /r/ answer, MCP claim)
 * lands already named with nothing to set up (FINAL BOSS J1).
 *
 * Pure + no LLM. Place identity is a *grounded lookup*, never speculation: ZIP →
 * place comes from the sourced crosswalk (`fixtures/swfl-place-zip-crosswalk.json`
 * via the gazetteer) with `cityForZip` as the broader fallback — the same ground
 * truth the converse/MCP surfaces use so 33931 reads "Fort Myers Beach", not
 * "Lehigh Acres" (see [[lib/place-context.ts]]). The ZIP is the dominant signal;
 * a free-text place-name scan + a small topic table fill the gaps.
 */

// ZIP -> full place name. Crosswalk first (full names: "Fort Myers Beach"), then
// the wider USPS city map (137 ZIPs, abbreviated) as fallback. Built once at import.
const PLACE_BY_ZIP = new Map<string, string>();
for (const e of PLACE_ZIP_CROSSWALK.entries) {
  PLACE_BY_ZIP.set(e.zip, e.place);
  for (const z of e.alt_zips) if (!PLACE_BY_ZIP.has(z)) PLACE_BY_ZIP.set(z, e.place);
}

/** Place-name needles (place + aliases), normalized, longest-first so the most
 *  specific name wins ("fort myers beach" before "fort myers"). */
const PLACE_NEEDLES: { needle: string; place: string }[] = (() => {
  const out: { needle: string; place: string }[] = [];
  for (const e of PLACE_ZIP_CROSSWALK.entries) {
    out.push({ needle: flatten(e.place), place: e.place });
    for (const a of e.aliases) out.push({ needle: flatten(a), place: e.place });
  }
  return out.sort((a, b) => b.needle.length - a.needle.length);
})();

/** Topic keyword table (rent / permit / flood / cre / price) → display label. */
const TOPICS: { topic: string; re: RegExp }[] = [
  { topic: "Flood", re: /\b(flood|nfip|aal|surge|storm)\b/i },
  { topic: "Permits", re: /\bpermit/i },
  { topic: "Rentals", re: /\b(rent|rental|lease)\b/i },
  { topic: "CRE", re: /\b(cre|commercial|vacancy|absorption|cap rate|nnn|triple[- ]?net)\b/i },
  { topic: "Prices", re: /\b(price|value|valuation|sale|zhvi|median)\b/i },
];

function flatten(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cap a file's extracted_text fed into scope inference — the scope signal lives near
 *  the top, and an uncapped multi-page PDF would both slow the regex scan and let a
 *  document that name-drops many ZIPs swamp the dominant-ZIP count. */
const FILE_TEXT_MAX = 1000;

/** Fields worth scanning for a place / topic — excludes opaque tokens
 *  (freshness_token, added_at) so an "8-digit token date" can't read as a ZIP. */
function itemText(item: ProjectItem): string {
  switch (item.kind) {
    case "qa":
      return `${item.report_id} ${item.question}`;
    case "metric":
      return `${item.report_id} ${item.label}`;
    case "report":
      return `${item.slug} ${item.title ?? ""}`;
    case "source":
      return `${item.table} ${item.label}`;
    case "note":
      return item.text;
    case "chart":
    case "frame":
      return item.title;
    case "table_slice":
      return `${item.report_id} ${item.title}`;
    case "file":
      // A PDF carries distilled `extracted_text` (Claude-vision at upload) — fold it in
      // (capped) so a PDF upload becomes scope-bearing instead of contributing only its
      // random storage UUID. Caption + extracted text; fall back to the path when neither.
      return (
        [item.caption, item.extracted_text?.slice(0, FILE_TEXT_MAX)].filter(Boolean).join(" ") ||
        item.storage_path
      );
    case "address":
      // A known listing address is scope-bearing — the place/ZIP inference reads it.
      return item.address;
  }
}

// A 5-digit run starting with 3, NOT followed by ".digit" (so "33901.5" — a cap rate
// or ratio — is not read as a ZIP). A candidate is only counted if it resolves to a
// known SWFL place (below), which also rejects bare 5-digit dollar figures like 30074.
const ZIP_RE = /\b3\d{4}\b(?!\.\d)/g;

function topKey<T>(counts: Map<T, number>): T | undefined {
  let best: T | undefined;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function placeForZip(zip: string): string | undefined {
  return PLACE_BY_ZIP.get(zip) ?? cityForZip(zip);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jun 17, 2026" from an ISO string — UTC so the test is timezone-stable. */
function datedFallback(items: ProjectItem[]): string {
  const earliest = items
    .map((i) => i.added_at)
    .filter(Boolean)
    .sort()[0];
  if (!earliest) return "Untitled project";
  const d = new Date(earliest);
  if (Number.isNaN(d.getTime())) return "Untitled project";
  return `Project ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * The grounded scope a set of items is "about": the dominant SWFL ZIP (only when
 * it resolves to a known place — never a bare 5-digit number), the resolved place
 * name (from that ZIP, else a whole-word place-name scan), and a topic.
 *
 * This is the ONE scope-inference root (Piece 2 §A digest, §C/§E assemble-command,
 * and Piece 3's `projectScopeSet` all read it) so there is never a second copy of
 * the ZIP regex / place crosswalk drifting out of sync. `deriveProjectName` (below)
 * composes a title from it; downstream consumers read the structured fields.
 */
export interface InferredScope {
  /** Dominant ZIP, present only when it resolves to a SWFL place. */
  zip?: string;
  /** Resolved place name — from the ZIP if present, else the place-name scan. */
  place?: string;
  /** Topic label (Flood / Permits / Rentals / CRE / Prices). */
  topic?: string;
}

export function inferScopeFromItems(items: ProjectItem[]): InferredScope {
  const zipCounts = new Map<string, number>();
  const placeNameCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();

  for (const item of items) {
    const raw = itemText(item);
    const flat = flatten(raw);

    for (const m of raw.matchAll(ZIP_RE)) {
      if (placeForZip(m[0])) zipCounts.set(m[0], (zipCounts.get(m[0]) ?? 0) + 1);
    }
    // Most-specific (longest) place needle present as WHOLE WORDS (so "landscape"
    // does not match "cape" → Cape Coral). `flat` is space-normalized; pad + match.
    const padded = ` ${flat} `;
    const hit = PLACE_NEEDLES.find((p) => p.needle && padded.includes(` ${p.needle} `));
    if (hit) placeNameCounts.set(hit.place, (placeNameCounts.get(hit.place) ?? 0) + 1);

    for (const t of TOPICS) {
      if (t.re.test(raw)) topicCounts.set(t.topic, (topicCounts.get(t.topic) ?? 0) + 1);
    }
  }

  const topZip = topKey(zipCounts);
  const topic = topKey(topicCounts);

  // ZIP is the dominant signal: resolve its place. (zipCounts only ever holds ZIPs
  // that already resolved, so `place` is defined whenever `zip` is.)
  if (topZip) return { zip: topZip, place: placeForZip(topZip), topic };

  const namePlace = topKey(placeNameCounts);
  return { place: namePlace, topic };
}

/**
 * Scope from the project's remembered SUBJECT — the saved listing address
 * (`projects.subject_address`) and/or market area (`projects.subject_area`) — for
 * projects whose filed items don't name a place yet (a fresh listing project has
 * zero items but knows exactly where it is). Routed through the ONE scope root as
 * synthetic notes so there is never a second address parser: a crosswalk-resolving
 * ZIP in either text wins (and brings its place), else the whole-word place-name
 * scan. Works for every covered city the crosswalk/needles know — nothing is
 * special-cased to one town. An out-of-coverage address yields {} so callers fall
 * back to region-wide instead of claiming a city we don't cover.
 */
export function inferScopeFromSubject(
  subjectAddress?: string | null,
  subjectArea?: string | null,
): InferredScope {
  const notes: ProjectItem[] = [subjectAddress, subjectArea]
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((text, i) => ({
      id: `subject-${i}`,
      added_at: "",
      origin: "web" as const,
      kind: "note" as const,
      text,
    }));
  if (notes.length === 0) return {};
  return inferScopeFromItems(notes);
}

export function deriveProjectName(items: ProjectItem[]): string {
  if (items.length === 0) return "Untitled project";

  const { zip, place, topic } = inferScopeFromItems(items);

  // ZIP is the dominant signal: resolve its place + keep the ZIP for the title.
  if (zip) {
    if (place) return `${place} ${zip}`;
    return topic ? `SWFL ${topic}` : `SWFL ${zip}`;
  }

  if (place) return topic ? `${place} ${topic}` : place;

  if (topic) return `SWFL ${topic}`;
  return datedFallback(items);
}
