// lib/listings/typed-address.ts — the ONE "#x -> Unit x" boundary normalizer for
// user-TYPED addresses. Extracted from lib/back-on-market/relist-fact.ts (copy #2:
// the Why Isn't It Selling loader needs the identical round-trip). The stored
// address_key derives from the vendor permalink's word-form unit ("UNIT201");
// addressKey matches neither "#201" nor "# 201", so typed input rewrites first.
export function normalizeTypedUnits(street: string): string {
  return street
    .replace(/#\s*(\w+)/g, "Unit $1")
    .replace(/\s+/g, " ")
    .trim();
}
