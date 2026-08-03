// lib/export/surfaces.ts
// ONE registry — the Clay export-view principle. Adding a future export
// (lake/desk/brain tables) = one entry here, never a new route. The registry
// IS the whitelist: a column not listed does not exist to the CSV builder, so
// internal columns are structurally unexportable (spec 2026-08-03, FM6).
export type CellFormat = "raw" | "date" | "join-semicolon";

export interface ExportColumn {
  /** Row property. `attribs.<name>` reads row.attribs[name] (listings). */
  key: string;
  header: string;
  format?: CellFormat;
}

export interface ExportSurfaceDef {
  table: "contacts" | "user_listings";
  filenameBase: string;
  /** Unique-together — selectAllPaged needs a stable total order. */
  orderCols: readonly string[];
  columns: readonly ExportColumn[];
  /** Listings: append the union of the user's own attribs keys. */
  withAttribsUnion?: boolean;
}

export const BANNED_EXPORT_KEYS: ReadonlySet<string> = new Set(["id", "user_id", "address_key"]);
export const BANNED_KEY_PATTERN = /token|hash|secret/i;

export const EXPORT_SURFACES: Record<string, ExportSurfaceDef> = {
  contacts: {
    table: "contacts",
    filenameBase: "swfl-contacts",
    orderCols: ["created_at", "id"],
    columns: [
      { key: "name", header: "name" },
      { key: "email", header: "email" },
      { key: "phone", header: "phone" },
      { key: "tags", header: "tags", format: "join-semicolon" },
      { key: "created_at", header: "created", format: "date" },
    ],
  },
  listings: {
    table: "user_listings",
    filenameBase: "swfl-listings",
    orderCols: ["created_at", "id"],
    columns: [
      { key: "address", header: "address" },
      { key: "price", header: "price" },
      { key: "beds", header: "beds" },
      { key: "baths", header: "baths" },
      { key: "sqft", header: "sqft" },
      { key: "status", header: "status" },
      { key: "url", header: "url" },
      { key: "zip_code", header: "zip_code" },
      { key: "county", header: "county" },
      { key: "updated_at", header: "imported", format: "date" },
    ],
    withAttribsUnion: true,
  },
};

/** FM9 guard: a user with 60 brought columns gets 50, deterministically. */
export const ATTRIBS_UNION_CAP = 50;

export function attribsUnionColumns(rows: ReadonlyArray<Record<string, unknown>>): ExportColumn[] {
  const keys = new Set<string>();
  for (const row of rows) {
    const attribs = row.attribs;
    if (attribs && typeof attribs === "object" && !Array.isArray(attribs)) {
      for (const k of Object.keys(attribs)) keys.add(k);
    }
  }
  return [...keys]
    .sort()
    .slice(0, ATTRIBS_UNION_CAP)
    .map((k) => ({ key: `attribs.${k}`, header: k }));
}
