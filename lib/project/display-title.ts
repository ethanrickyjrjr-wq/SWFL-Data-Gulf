// lib/project/display-title.ts
/**
 * Cockpit display rule (spec 2026-07-16 §4): list/rail rows show an address
 * title only up to the city — "2006 SW 15th Ave, Cape Coral", never
 * "…, FL 33991". The full title (with state/ZIP) stays on the panel header.
 * Non-address titles pass through untouched.
 */
const STATE_TAIL = /[,\s]+(FL|Fla\.?|Florida)\.?(\s+\d{5}(-\d{4})?)?\s*$/i;
const ZIP_TAIL = /[,\s]+\d{5}(-\d{4})?\s*$/;

export function displayProjectTitle(title: string | null): string {
  const t = (title ?? "").trim();
  if (!t) return "Untitled project";
  let out = t.replace(STATE_TAIL, "");
  if (out === t) out = t.replace(ZIP_TAIL, "");
  out = out.replace(/[,\s]+$/, "").trim();
  return out || t;
}
