/**
 * Pure CSV → contact-row parser.
 *
 * Input contract: a CSV string with a required header row. Recognised columns:
 *   email   — required; rows missing a valid email are skipped (counted as skipped)
 *   name    — optional
 *   tags    — optional; cell value is semicolon- OR pipe-separated tags
 *
 * Any other header becomes an `attribs` key (lowercased header → trimmed cell
 * value), capped at MAX_ATTRIBS_PER_ROW columns; empty cells are omitted.
 *
 * Per-row `tags` are merged with the caller-supplied `bodyTags` (applies the
 * same tag list to every row, e.g. from the JSON request body). Duplicates are
 * removed; all tags are lowercased and trimmed.
 *
 * Tokenisation is a single pass over the whole string that tracks quote state
 * ACROSS physical lines, so a double-quoted field may contain commas AND
 * embedded newlines (a normal RFC-4180 shape that Google / Outlook / spreadsheet
 * exports of free-text fields produce). A leading UTF-8 BOM is stripped so a
 * BOM-prefixed header still matches. Internal `""` is unescaped to a literal `"`.
 */

export interface ContactRow {
  email: string;
  name: string | null;
  tags: string[];
  attribs?: Record<string, string>;
}

export interface ParseResult {
  rows: ContactRow[];
  /** Number of data rows that were skipped (blank line or missing/invalid email). */
  skippedCount: number;
}

// Defensive caps so a single malicious cell can't carry an unbounded tag list
// (the row count itself is bounded downstream in upsert-contacts).
const MAX_TAGS_PER_ROW = 50;
const MAX_TAG_LEN = 64;

// Cap on unrecognised columns captured into `attribs` per row (defensive —
// a wide malicious header row shouldn't carry an unbounded key set).
const MAX_ATTRIBS_PER_ROW = 50;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Tokenise an entire CSV string into records (one array of fields per record).
 *
 * Quote state is carried across physical newlines, so a `"…"` field containing
 * a newline stays a single field instead of tearing across two records. Each
 * field is trimmed; `""` inside a quoted field becomes a literal `"`. A record
 * is emitted at every UNQUOTED newline. A purely empty physical line yields the
 * single-empty-field record `[""]`, which callers treat as a blank line.
 */
function tokenizeCsv(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let started = false; // any content seen toward the current record
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote `""` → literal `"`
        if (i + 1 < n && text[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    // Not in quotes.
    if (ch === '"') {
      inQuotes = true;
      started = true;
      i++;
      continue;
    }
    if (ch === ",") {
      fields.push(current.trim());
      current = "";
      started = true;
      i++;
      continue;
    }
    if (ch === "\n") {
      fields.push(current.trim());
      records.push(fields);
      fields = [];
      current = "";
      started = false;
      i++;
      continue;
    }
    current += ch;
    started = true;
    i++;
  }

  // Flush the trailing record only if it carried any content (so a trailing
  // newline does not synthesise a spurious blank record).
  if (started || current !== "" || fields.length > 0) {
    fields.push(current.trim());
    records.push(fields);
  }

  return records;
}

/** A record corresponding to an empty physical line (skipped silently). */
function isBlankRecord(record: string[]): boolean {
  return record.length === 1 && record[0] === "";
}

/** Parse semicolon-or-pipe separated tag string into clean, deduped, capped tags. */
function parseTags(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[|;]/)
    .map((t) => t.trim().toLowerCase().slice(0, MAX_TAG_LEN))
    .filter((t) => t.length > 0)
    .slice(0, MAX_TAGS_PER_ROW);
}

/** Merge two tag arrays, deduplicating. */
function mergeTags(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string into contact rows.
 *
 * @param csv       - raw CSV text (header row required)
 * @param bodyTags  - tags to apply to every row from the request body
 */
export function parseContactsCsv(csv: string, bodyTags: string[] = []): ParseResult {
  // Strip a leading UTF-8 BOM (Excel / Windows exports prepend one) so the
  // header's first column still matches, then normalise line endings.
  const deBommed = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const normalised = deBommed.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const records = tokenizeCsv(normalised);
  if (records.length === 0) {
    return { rows: [], skippedCount: 0 };
  }

  // First non-blank record is the header.
  let headerIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (!isBlankRecord(records[i])) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) {
    return { rows: [], skippedCount: 0 };
  }

  const headers = records[headerIndex].map((h) => h.toLowerCase());
  const emailCol = headers.indexOf("email");
  const nameCol = headers.indexOf("name");
  const tagsCol = headers.indexOf("tags");

  // No email column → nothing to parse
  if (emailCol === -1) {
    return { rows: [], skippedCount: 0 };
  }

  const attribCols = headers
    .map((h, idx) => ({ h, idx }))
    .filter(({ h, idx }) => h && idx !== emailCol && idx !== nameCol && idx !== tagsCol)
    .slice(0, MAX_ATTRIBS_PER_ROW);

  const rows: ContactRow[] = [];
  let skippedCount = 0;

  for (let i = headerIndex + 1; i < records.length; i++) {
    const fields = records[i];
    if (isBlankRecord(fields)) continue; // blank line

    const rawEmail = fields[emailCol] ?? "";
    const rawName = nameCol !== -1 ? (fields[nameCol] ?? "") : "";
    const rawTags = tagsCol !== -1 ? (fields[tagsCol] ?? "") : "";

    // Validate email
    const email = rawEmail.trim().toLowerCase();
    if (!email) {
      skippedCount++;
      continue;
    }

    // Basic shape check — caller can apply isValidEmail for stricter validation
    const rowTags = parseTags(rawTags);
    const mergedTags = mergeTags(bodyTags, rowTags);

    const attribs: Record<string, string> = {};
    for (const { h, idx } of attribCols) {
      const v = (fields[idx] ?? "").trim();
      if (v) attribs[h] = v;
    }

    rows.push({
      email,
      name: rawName.trim() || null,
      tags: mergedTags,
      attribs,
    });
  }

  return { rows, skippedCount };
}
