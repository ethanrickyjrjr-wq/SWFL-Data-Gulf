// lib/listings-user/parse-listings-csv.ts
// Pure CSV → user-listing rows. Mirrors lib/email/parse-contacts-csv.ts:
// header row required, `address` required per row (aliases below), typed
// columns parsed leniently (null on failure — a bad cell never drops the
// row, a missing address does), every other header → attribs (capped).
// Values stored RAW (escape at exit only — csv-escape.ts policy).
import { normalizeAddressKey } from "./address-key";

export interface UserListingRow {
  address: string;
  address_key: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  status: string | null;
  url: string | null;
  attribs: Record<string, string>;
}

export interface ListingsParseResult {
  rows: UserListingRow[];
  skippedCount: number;
  skipReasons: string[];
}

const MAX_ATTRIBS_PER_ROW = 50;

const ADDRESS_ALIASES = ["address", "street address", "full address", "property address"];
const PRICE_ALIASES = ["price", "list price", "asking price"];
const BEDS_ALIASES = ["beds", "bedrooms", "br"];
const BATHS_ALIASES = ["baths", "bathrooms", "ba"];
const SQFT_ALIASES = ["sqft", "square feet", "living area", "sq ft"];
const STATUS_ALIASES = ["status", "listing status"];
const URL_ALIASES = ["url", "link", "listing url"];

/** Single-pass RFC-4180 tokenizer — same contract as parse-contacts-csv.ts
 *  (quote state carried across newlines, `""` → literal `"`). */
function tokenizeCsv(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
      continue;
    }
    if (ch === ",") {
      fields.push(current.trim());
      current = "";
      started = true;
      continue;
    }
    if (ch === "\n") {
      fields.push(current.trim());
      records.push(fields);
      fields = [];
      current = "";
      started = false;
      continue;
    }
    current += ch;
    started = true;
  }
  if (started || current !== "" || fields.length > 0) {
    fields.push(current.trim());
    records.push(fields);
  }
  return records;
}

function isBlank(record: string[]): boolean {
  return record.length === 1 && record[0] === "";
}

/** "$450,000" → 450000 · "2.5" → 2.5 · "call for price" → null. Never throws. */
function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function findCol(headers: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = headers.indexOf(a);
    if (i !== -1) return i;
  }
  return -1;
}

export function parseListingsCsv(csv: string): ListingsParseResult {
  const deBommed = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const records = tokenizeCsv(deBommed.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));

  let headerIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (!isBlank(records[i])) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return { rows: [], skippedCount: 0, skipReasons: [] };

  const headers = records[headerIndex].map((h) => h.toLowerCase());
  const col = {
    address: findCol(headers, ADDRESS_ALIASES),
    price: findCol(headers, PRICE_ALIASES),
    beds: findCol(headers, BEDS_ALIASES),
    baths: findCol(headers, BATHS_ALIASES),
    sqft: findCol(headers, SQFT_ALIASES),
    status: findCol(headers, STATUS_ALIASES),
    url: findCol(headers, URL_ALIASES),
  };
  if (col.address === -1) {
    return { rows: [], skippedCount: 0, skipReasons: ["no address column found"] };
  }

  const typedCols = new Set(Object.values(col).filter((i) => i !== -1));
  const attribCols = headers
    .map((h, idx) => ({ h, idx }))
    .filter(({ h, idx }) => h && !typedCols.has(idx))
    .slice(0, MAX_ATTRIBS_PER_ROW);

  const rows: UserListingRow[] = [];
  let skippedCount = 0;
  const skipReasons: string[] = [];

  for (let i = headerIndex + 1; i < records.length; i++) {
    const fields = records[i];
    if (isBlank(fields)) continue;
    const address = (fields[col.address] ?? "").trim();
    if (!address) {
      skippedCount++;
      continue;
    }
    const pick = (c: number) => (c !== -1 ? (fields[c] ?? "").trim() : "");
    const attribs: Record<string, string> = {};
    for (const { h, idx } of attribCols) {
      const v = (fields[idx] ?? "").trim();
      if (v) attribs[h] = v;
    }
    rows.push({
      address,
      address_key: normalizeAddressKey(address),
      price: toNumber(pick(col.price)),
      beds: toNumber(pick(col.beds)),
      baths: toNumber(pick(col.baths)),
      sqft: toNumber(pick(col.sqft)),
      status: pick(col.status) || null,
      url: pick(col.url) || null,
      attribs,
    });
  }
  if (skippedCount > 0) skipReasons.push(`${skippedCount} row(s) had no address`);
  return { rows, skippedCount, skipReasons };
}
