import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * mhs-permits source connector — SWFL commercial building permits from the
 * Maxwell, Hendry & Simmons (MHS) annual Data Book PDF, landed in
 * `data_lake.mhs_permits_swfl` (281 rows, calendar year 2025).
 *
 * THIS IS THE ONLY FILE THAT KNOWS THE mhs_permits_swfl SCHEMA.
 * Columns read (verified live 2026-06-10 against the loaded table):
 *   id (text PK), source_name (text, always 'mhs_databook'), jurisdiction (text),
 *   submarket_slug (text — from the J3 jurisdiction crosswalk), calendar_year (int),
 *   issued_date (date), asset_class (text), project_address (text),
 *   project_name (text), permit_value_usd (numeric), building_sf (bigint),
 *   zip_code (text — site ZIP, scope-gated through resolveZip().in_scope; NULL
 *   when the address didn't geocode or fell outside the 6 counties),
 *   verified (bool — manual spot-check gate; false until an operator reviews
 *   the PDF extraction).
 *
 * Provenance: this is an ODD (Operation Dumbo Drop) source — a manual PDF, not a
 * machine-pulled feed. Every row carries source_name='mhs_databook' so no Accela
 * permit write can blend silently. Do NOT blend with permits-swfl (residential
 * Accela Lee+Collier) — different source, different grain.
 *
 * Trust tier: 1 (MHS is a primary SWFL commercial-appraisal authority publishing
 * the annual permit dataset directly).
 *
 * Fixture mode (REFINERY_SOURCE=fixture) reads the committed sample so the pack
 * typechecks + renders with zero creds.
 */

const SOURCE_ID = "mhs_permits_swfl";
const TABLE = "mhs_permits_swfl";

const DATABOOK_URL =
  "https://mhsappraisal.com/wp-content/uploads/2026/03/2026-Market-Trends-Report-Magazine-Version-All-Permits.pdf";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "permits-commercial-swfl.sample.json",
);

/** Normalized MHS commercial-permit row — what Stage 2 / Stage 3 see. */
export interface MhsPermitNormalized {
  kind: "mhs-permit";
  /** Submarket slug from the jurisdiction crosswalk. null = unmapped jurisdiction. */
  submarket_slug: string | null;
  /** Raw jurisdiction string from the PDF (for traceability / caveats). */
  jurisdiction: string;
  /** County name (Lee | Collier | Charlotte) — derived from the crosswalk submarket. */
  calendar_year: number | null;
  /** Asset class label from the PDF (Retail, Industrial, Multi-Family, …). */
  asset_class: string | null;
  /** Project name from the PDF (e.g. "Project Rainforest") — for concentration context. */
  project_name: string | null;
  /** Site ZIP — scope-gated through resolveZip().in_scope. null when unresolved. */
  zip_code: string | null;
  /** Permit value in USD. null when missing / unparseable. */
  permit_value_usd: number | null;
  /** Building square footage. null when missing. */
  building_sf: number | null;
  /** Manual spot-check flag. false until an operator reviews the PDF extraction. */
  verified: boolean;
  /** Canonical receipt URL (MHS Data Book PDF, or fixture sentinel). */
  source_url: string;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function numericOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,\s]/g, "");
    if (cleaned === "") return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function intOrNull(v: unknown): number | null {
  const n = numericOrNull(v);
  return n === null ? null : Math.trunc(n);
}

function receiptUrl(): string {
  if (env.source === "fixture") {
    return `fixture://refinery/__fixtures__/permits-commercial-swfl.sample.json`;
  }
  return DATABOOK_URL;
}

export function normalizeMhsRow(row: Record<string, unknown>): MhsPermitNormalized {
  const slug = str(row.submarket_slug);
  const zip = str(row.zip_code);
  return {
    kind: "mhs-permit",
    submarket_slug: slug.length > 0 ? slug : null,
    jurisdiction: str(row.jurisdiction) || "Unknown",
    calendar_year: intOrNull(row.calendar_year),
    asset_class: str(row.asset_class) || null,
    project_name: str(row.project_name) || null,
    zip_code: zip.length === 5 ? zip : null,
    permit_value_usd: numericOrNull(row.permit_value_usd),
    building_sf: intOrNull(row.building_sf),
    verified: row.verified === true || str(row.verified).toLowerCase() === "true",
    source_url: receiptUrl(),
  };
}

async function loadFixtureRows(): Promise<Record<string, unknown>[]> {
  const data = JSON.parse(await readFile(FIXTURE_PATH, "utf-8")) as
    | { rows?: unknown[]; data?: unknown[] }
    | unknown[];
  const rows: unknown[] = Array.isArray(data) ? data : (data.rows ?? data.data ?? []);
  return rows as Record<string, unknown>[];
}

async function fetchRows(): Promise<Record<string, unknown>[]> {
  if (env.source === "fixture") return loadFixtureRows();
  // 281 rows — well under the PostgREST db-max-rows=1000 cap, so a plain select
  // returns the whole table (no pagination floor needed). data_lake schema.
  const { data, error } = await getSupabase()
    .schema("data_lake")
    .from(TABLE)
    .select(
      "id, jurisdiction, submarket_slug, calendar_year, asset_class, project_name, permit_value_usd, building_sf, zip_code, verified",
    );
  if (error) {
    throw new Error(`mhs-permits-source: ${TABLE} fetch failed — ${error.message}`);
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    throw new Error(`mhs-permits-source: ${TABLE} returned 0 rows.`);
  }
  return rows;
}

export const mhsPermitsSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,
  async fetch(): Promise<RawFragment[]> {
    const rows = await fetchRows();
    const fetched_at = isoTimestamp();
    return rows.map((row): RawFragment<MhsPermitNormalized> => {
      const normalized = normalizeMhsRow(row);
      const rowId = str(row.id);
      const idKey =
        rowId.length > 0
          ? rowId
          : `${normalized.submarket_slug ?? normalized.jurisdiction}:${str(row.project_name)}`;
      return {
        fragment_id: fragmentId(SOURCE_ID, idKey),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at,
        raw: row,
        normalized,
      };
    });
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    return {
      source:
        env.source === "fixture"
          ? "Maxwell, Hendry & Simmons SWFL Data Book — issued commercial permits (fixture)"
          : `Maxwell, Hendry & Simmons SWFL Data Book — issued commercial permits, calendar year 2025 (Supabase data_lake.mhs_permits_swfl; source_name='mhs_databook'). PDF: ${DATABOOK_URL}`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};

export { DATABOOK_URL as MHS_DATABOOK_URL };
