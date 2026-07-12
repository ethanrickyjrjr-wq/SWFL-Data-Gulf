// lib/email/postal-address.ts
//
// CAN-SPAM postal line for the injected blast footer. The deliverable's own
// branding.business_address wins (it's what the doc was built with), else the
// account-level user_brand_profiles.business_address (07/03/2026 migration),
// else null — the caller must refuse the send (422), because a hardcoded or
// invented address never meets the floor. Same key branding-to-tokens.ts maps
// to the ADDRESS token; this is the injected-footer counterpart.
// Spec: docs/superpowers/specs/2026-07-12-send-safety-floor-design.md

export function resolvePostalAddress(
  branding: unknown,
  profileAddress: string | null | undefined,
): string | null {
  if (branding && typeof branding === "object") {
    const v = (branding as Record<string, unknown>)["business_address"];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (typeof profileAddress === "string" && profileAddress.trim()) return profileAddress.trim();
  return null;
}
