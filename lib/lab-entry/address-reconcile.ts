// lib/lab-entry/address-reconcile.ts
//
// On Build, reconcile the address the user entered against what the project
// already believes (projects.subject_address). Match → build. No belief → adopt.
// Differ → one confirm (new project titled the address, OR keep here + record it
// as an additional known address). Spec 2026-07-06 §C "Address ↔ project
// reconciliation on Build". Pure — the client owns the DB writes + the confirm UI.

export type ReconcileResult = { kind: "match" } | { kind: "no-belief" } | { kind: "differ" };

export function normalizeAddress(a: string): string {
  return (a || "").toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
}

export function reconcileAddress(entered: string, believed: string | null): ReconcileResult {
  const b = normalizeAddress(believed ?? "");
  if (!b) return { kind: "no-belief" };
  return normalizeAddress(entered) === b ? { kind: "match" } : { kind: "differ" };
}

export function addressItem(address: string): { kind: "address"; address: string } {
  return { kind: "address", address };
}
