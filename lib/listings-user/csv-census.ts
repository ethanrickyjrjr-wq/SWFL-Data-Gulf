// lib/listings-user/csv-census.ts
// Header census for the file door (spec 2026-08-03 §4): a structured file
// that matches no shape is PARKED with its census — never silently blobbed,
// never rejected. Pure + tiny so it can run client-side in UploadDrop.
// Deliberate approximation: comma-naive header split — quoted commas in
// HEADER names are rare, and the census is descriptive metadata, not a
// parse path; the real parsers own correctness.
const ADDRESS_ALIASES = ["address", "street address", "full address", "property address"];

export interface CsvCensus {
  headers: string[];
  rowCount: number;
  matchedShape: "contacts" | "listings" | "none";
}

export function censusCsv(text: string): CsvCensus {
  const deBommed = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = deBommed.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headerLine = lines.find((l) => l.trim().length > 0) ?? "";
  const headers = headerLine
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase())
    .filter(Boolean);
  const rowCount = lines.filter((l) => l.trim().length > 0).length - (headerLine ? 1 : 0);
  const matchedShape = headers.includes("email")
    ? ("contacts" as const)
    : headers.some((h) => ADDRESS_ALIASES.includes(h))
      ? ("listings" as const)
      : ("none" as const);
  return { headers, rowCount: Math.max(rowCount, 0), matchedShape };
}
