// lib/lab-entry/area-from-query.ts
// City/area extraction for /go's area-keyed options (Listings Digest, operator
// decree 08/11/2026). The /go bar usually holds a street address — Mapbox
// retrieve format "3166 Melbury Drive, Columbus, Ohio 43230, United States" —
// but the digest's [[blank]] wants "Columbus". Heuristic, never inventing: an
// unparseable string passes through untouched so the recipe's own resolver (or
// the lab's area ask) gets the raw text instead of a guess.
export function areaFromGoQuery(q: string): string {
  const parts = q
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  // A leading street number means segment 0 is the street; the city follows.
  // A city-first suggestion ("Fort Myers, Florida, …") keeps segment 0.
  let seg = /^\d/.test(parts[0]) && parts.length > 1 ? parts[1] : parts[0];
  seg = seg.replace(/\s+\d{5}(-\d{4})?$/, ""); // trailing ZIP
  seg = seg.replace(/\s+[A-Z]{2}$/, ""); // trailing state abbreviation
  return seg.trim();
}
