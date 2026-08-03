// lib/share/share-link.ts
// Share-link contract (spec 2026-08-03): /p/[id] IS the share surface for
// every template family; ?ref=share is the growth marker (write-only —
// nothing may read it for auth/tier/content).
export function buildShareUrl(origin: string, deliverableId: string): string {
  return `${origin}/p/${deliverableId}?ref=share`;
}

/** Only a ready deliverable has anything to share (building/revoked → no button). */
export function canShare(status: string): boolean {
  return status === "ready";
}
