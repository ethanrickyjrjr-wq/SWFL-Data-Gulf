// components/email-lab/parked/classic-templates.ts
//
// ⏸ DORMANT — parked 2026-07-07 (retire-block-shell). NOT WIRED to any live surface.
//
// These are the 12 legacy "classic" email templates that used to live on a
// preview-only rail inside the now-deleted block shell (EmailLabShell). We kept the
// catalog + render helper here — verbatim, out of the live tree — instead of deleting
// them, because the operator wants the option to revive them later (likely as a
// free-tier surface once updated). Nothing imports this file today.
//
// STILL FUNCTIONAL, not just a record: the template MODULES themselves live under
// `lib/templates/` and are rendered server-side by `POST /api/email-lab/render` via
// its `{ template, tokens }` path (kept alive for already-saved block-canvas
// deliverables). So a future revival only has to import CLASSIC_TEMPLATES for the
// catalog and call renderLegacyHtml(id, tokens) — no template rebuild needed.
//
// If you revive these: re-route a `classicTemplates` capability in
// lib/email/lab/capabilities.ts and render this catalog from whatever shell owns it.

export interface ClassicTemplate {
  id: string;
  label: string;
  icon: string;
}

/** The legacy preview-rail catalog, verbatim from EmailLabShell as of 2026-07-07. */
export const CLASSIC_TEMPLATES: ClassicTemplate[] = [
  { id: "email/shell-two-col", label: "Two Column", icon: "⊞" },
  { id: "email/email-compare", label: "Compare", icon: "↔" },
  { id: "email/email-hbar", label: "Bar Chart", icon: "📊" },
  { id: "email/email-table", label: "Data Table", icon: "📈" },
  { id: "email/email-ranked", label: "Ranked List", icon: "🏆" },
  { id: "email/email-report", label: "Full Report", icon: "📋" },
  { id: "email/email-listing", label: "New Listing", icon: "🏠" },
  { id: "email/email-just-sold", label: "Just Sold", icon: "✅" },
  { id: "email/email-open-house", label: "Open House", icon: "🔑" },
  { id: "email/email-price-drop", label: "Price Drop", icon: "📉" },
  { id: "email/email-listing-digest", label: "Listing Digest", icon: "🏘" },
  { id: "email/email-investment-spotlight", label: "Investment", icon: "💼" },
];

/** Render a classic template id to HTML via the still-live render route. Dormant. */
export async function renderLegacyHtml(
  template: string,
  tokens: Record<string, string>,
): Promise<string> {
  const res = await fetch("/api/email-lab/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template, tokens }),
  });
  return (await res.json()).html ?? "";
}
