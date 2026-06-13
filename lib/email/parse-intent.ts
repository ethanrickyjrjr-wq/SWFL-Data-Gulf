/**
 * Parse a client's emailed reply into a lightweight buyer-intent signal:
 * which SWFL place/ZIP they named and what topic they're circling. Stored on the
 * `buyer_intent_events` row so the agent's alert reads "Sarah asked about Cape
 * Coral waterfront" instead of just dumping the raw text.
 *
 * Deterministic + pure: reuses the SAME sourced crosswalk that `place-context`
 * uses (so a ZIP/place identity is never invented), plus a small topic keyword
 * map. No model call — this is a label for the alert, not the answer (the answer
 * comes from the grounded engine).
 */
import { PLACE_ZIP_CROSSWALK, type PlaceZipEntry } from "@/refinery/lib/geography-gazetteer.mts";

export interface ReplyIntent {
  zip: string | null;
  place: string | null;
  topic: string | null;
}

function flatten(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ZIP (primary + alt) → entry, primary winning, mirroring place-context.ts.
const ZIP_TO_ENTRY = new Map<string, PlaceZipEntry>();
for (const e of PLACE_ZIP_CROSSWALK.entries) ZIP_TO_ENTRY.set(e.zip, e);
for (const e of PLACE_ZIP_CROSSWALK.entries)
  for (const alt of e.alt_zips) if (!ZIP_TO_ENTRY.has(alt)) ZIP_TO_ENTRY.set(alt, e);

// Place/alias needles, longest first so "fort myers beach" beats "fort myers".
const ALIAS_NEEDLES: { needle: string; entry: PlaceZipEntry }[] = PLACE_ZIP_CROSSWALK.entries
  .flatMap((e) => [e.place, ...e.aliases].map((name) => ({ needle: flatten(name), entry: e })))
  .filter((n) => n.needle.length > 0)
  .sort((a, b) => b.needle.length - a.needle.length);

// Topic keyword map — first hit wins (ordered by specificity). Plain-English
// labels: these ride straight into the agent's alert.
const TOPIC_RULES: { label: string; needles: string[] }[] = [
  { label: "waterfront", needles: ["waterfront", "water front", "canal", "gulf access"] },
  { label: "flood risk", needles: ["flood", "insurance", "aal", "storm", "hurricane", "risk"] },
  { label: "rents", needles: ["rent", "rental", "lease"] },
  { label: "permits", needles: ["permit", "construction", "new build", "builder"] },
  { label: "tourism", needles: ["tourism", "tourist", "visitor", "airbnb", "vacation"] },
  {
    label: "home prices",
    needles: ["price", "value", "worth", "median", "buy", "sell", "market", "appreciat"],
  },
];

/** Parse a subject + body (already concatenated) into a ReplyIntent. */
export function parseReplyIntent(text: string): ReplyIntent {
  const intent: ReplyIntent = { zip: null, place: null, topic: null };
  if (!text) return intent;

  // ZIP first — most precise. Only 5-digit tokens that map to a SWFL crosswalk ZIP.
  for (const zip of text.match(/\b\d{5}\b/g) ?? []) {
    const entry = ZIP_TO_ENTRY.get(zip);
    if (entry) {
      intent.zip = zip;
      intent.place = entry.place;
      break;
    }
  }

  // Place name, if no ZIP pinned one already (or to fill place when ZIP missed).
  if (!intent.place) {
    const scan = ` ${flatten(text)} `;
    for (const { needle, entry } of ALIAS_NEEDLES) {
      if (scan.includes(` ${needle} `)) {
        intent.place = entry.place;
        if (!intent.zip) intent.zip = entry.zip;
        break;
      }
    }
  }

  // Topic keyword scan.
  const flat = ` ${flatten(text)} `;
  for (const rule of TOPIC_RULES) {
    if (rule.needles.some((n) => flat.includes(flatten(n)))) {
      intent.topic = rule.label;
      break;
    }
  }

  return intent;
}

/** One-line human summary for the alert subject/body. */
export function describeIntent(intent: ReplyIntent): string {
  const where = intent.place ?? (intent.zip ? `ZIP ${intent.zip}` : null);
  if (where && intent.topic) return `${where} — ${intent.topic}`;
  if (where) return where;
  if (intent.topic) return intent.topic;
  return "a question about the market";
}
