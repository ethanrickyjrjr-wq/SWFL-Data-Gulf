//
// Deterministic contact→cohort assignment for a split-send. PURE: a stable
// FNV-1a 32-bit hash of the contact id, mod the variant count. Stable across
// calls (and across a retried/partial batch send) so a contact never flips
// cohorts mid-flight.

export function cohortIndex(contactId: string, variantCount: number): number {
  if (variantCount <= 1) return 0;
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < contactId.length; i += 1) {
    hash ^= contactId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return (hash >>> 0) % variantCount;
}
