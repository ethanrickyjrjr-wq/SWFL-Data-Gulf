// components/go/brand.ts — the ONE place /go's identity is defined.
//
// The palette is the operator's brand row (user_brand_profiles, read 08/10/2026);
// both /go surfaces read it here so a color can never drift between the bar and
// the hero.
export const GO_BRAND = {
  primary: "#0F1D24",
  accent: "#3DC9C0",
  text: "#1A2B33",
  surface: "#F7F9FA",
  hairline: "#D8E0E3",
} as const;

/**
 * The mark shown top-left — OUR LOGO, never our name.
 *
 * Operator, 08/11/2026, splitting the 08/10 blanket strip by artifact: *"no SWFL
 * DATA GULF name any where… logo is fine… just make our name SWFL Data Gulf in
 * email. we will use it there but no mention anywhere else."*
 *
 * So: the logo is legal on this page; the NAME is legal ONLY inside a rendered
 * email (sender identity, CAN-SPAM footer, the data citation line). A wordmark
 * here is the exact thing he stripped — `go-identity.test.ts` FM1/FM2 fail the
 * suite if the name reappears in any /go source.
 *
 * `alt` is intentionally generic for the same reason: alt text is rendered text.
 */
// (No export. The slot is empty by decree — see GoTopBar.tsx.)
