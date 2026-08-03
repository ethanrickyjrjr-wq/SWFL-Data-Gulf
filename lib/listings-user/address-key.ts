// lib/listings-user/address-key.ts
// Deterministic dedupe key for user-brought listings: lowercase, strip
// punctuation, collapse whitespace, abbreviate the common street suffixes.
// This is a DEDUPE key, not a canonical postal address — it only has to be
// stable across re-imports of the same row (UNIQUE(user_id, address_key)).
const SUFFIXES: Record<string, string> = {
  street: "st",
  drive: "dr",
  avenue: "ave",
  boulevard: "blvd",
  lane: "ln",
  place: "pl",
  road: "rd",
  circle: "cir",
  terrace: "ter",
  court: "ct",
  parkway: "pkwy",
  highway: "hwy",
};

export function normalizeAddressKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIXES[w] ?? w)
    .join(" ");
}
