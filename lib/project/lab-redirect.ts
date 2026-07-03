// lib/project/lab-redirect.ts
// Cockpit D4 — signed-in visits to the standalone labs land in a project's
// Email tab (grid is the default canvas there, so one destination covers both
// /email-lab and /email-lab/grid). Null = no projects; the caller auto-creates.
// A homepage-map ?zip= rides the redirect so the ZIP email prebuild survives
// the hop (it used to be silently dropped — the operator's map-click promise
// broke for every signed-in user).
export function labDestination(projects: { id: string }[], zip?: string | null): string | null {
  const first = projects[0];
  if (!first) return null;
  const q = zip && /^\d{5}$/.test(zip) ? `?zip=${zip}` : "";
  return `/project/${first.id}/email-lab${q}`;
}
