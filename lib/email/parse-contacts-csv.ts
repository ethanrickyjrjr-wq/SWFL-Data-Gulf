/**
 * Pure CSV → contact-row parser.
 *
 * Input contract: a CSV string with a required header row. Recognised columns:
 *   email   — required; rows missing a valid email are skipped (counted as skipped)
 *   name    — optional
 *   tags    — optional; cell value is semicolon- OR pipe-separated tags
 *
 * Per-row `tags` are merged with the caller-supplied `bodyTags` (applies the
 * same tag list to every row, e.g. from the JSON request body). Duplicates are
 * removed; all tags are lowercased and trimmed.
 *
 * Parser is intentionally minimal (handles quoted fields containing commas,
 * trims whitespace, skips blank lines). Not RFC-4180-complete — covers
 * typical spreadsheet exports.
 */

export interface ContactRow {
  email: string;
  name: string | null;
  tags: string[];
}

export interface ParseResult {
  rows: ContactRow[];
  /** Number of data rows that were skipped (blank line or missing/invalid email). */
  skippedCount: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split a single CSV line into fields, respecting double-quoted fields that
 * may contain commas. Strips the outer quotes and unescapes internal `""`.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: escaped quote `""` → literal `"`
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // Closing quote
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    i++;
  }
  fields.push(current.trim());
  return fields;
}

/** Parse semicolon-or-pipe separated tag string into clean, deduped tags. */
function parseTags(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[|;]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
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
  // Normalise line endings from Windows or Mac exports
  const lines = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  if (lines.length === 0) {
    return { rows: [], skippedCount: 0 };
  }

  // First non-blank line is the header
  let headerLine = "";
  let headerIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      headerLine = lines[i];
      headerIndex = i;
      break;
    }
  }

  if (!headerLine) {
    return { rows: [], skippedCount: 0 };
  }

  const headers = splitCsvLine(headerLine).map((h) => h.toLowerCase());
  const emailCol = headers.indexOf("email");
  const nameCol = headers.indexOf("name");
  const tagsCol = headers.indexOf("tags");

  // No email column → nothing to parse
  if (emailCol === -1) {
    return { rows: [], skippedCount: 0 };
  }

  const rows: ContactRow[] = [];
  let skippedCount = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue; // blank line

    const fields = splitCsvLine(line);

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

    rows.push({
      email,
      name: rawName.trim() || null,
      tags: mergedTags,
    });
  }

  return { rows, skippedCount };
}
