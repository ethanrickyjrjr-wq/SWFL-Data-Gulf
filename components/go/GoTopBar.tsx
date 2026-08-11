// components/go/GoTopBar.tsx — the /go top bar: My Brand + Sign up. NO LOGO.
//
// Operator, 08/11/2026: "we need to get brand and sign up up top" → then, same
// day, the exact shape: a button that says **My Brand**, opening a popup where a
// user fills in their brand. Anyone who does not fill it in gets OUR colors and
// OUR logo — which is already how the email renders (applyBrand only OVERLAYS
// when a brand token exists; no tokens = the house default ships).
//
// IDENTITY RULE, split by artifact (same message, supersedes the 08/10 blanket
// strip): the LOGO is fine here; the NAME "SWFL Data Gulf" is legal ONLY inside a
// rendered email — sender identity, CAN-SPAM footer, the data citation line.
// Never on this page, in any form, including alt text. go-identity.test.ts
// enforces it.
//
// TWO ELEMENTS ONLY. This file carries two logged copy-creep rages (08/10) and
// the handoff states the spec is a CEILING: no tagline, no second link, no
// footer. Adding copy here is a defect, not polish.
//
// Built INSIDE components/go on purpose. /go sits in CHROME_FREE_PREFIXES, which
// is what drops SiteShell + SiteFooter — reaching for that list to "let a header
// through" would drag the whole site nav back onto the page.
//
// Server component: two links, zero client JS.
import Link from "next/link";
import { GO_BRAND } from "./brand";

export default function GoTopBar() {
  return (
    <header className="flex w-full items-center justify-between px-6 py-5">
      {/* NO LOGO. Operator, 08/11/2026: "DO NOT PUT THE FUCKING LOGO ON THE
          [/go] PAGE OR CHANGE ANYTHING ABOUT THE FUCKING LOOK." His earlier
          "logo is fine" was scoped to the EMAIL, not to this page — /go carries
          no company identity of any kind. This left slot stays empty. */}
      <span aria-hidden="true" />

      {/* BOTH doors, in this order (operator, 08/11/2026 — "i still want sign
          up", after I wrongly SWAPPED Sign up out for My Brand instead of
          adding it). My Brand is the quieter of the two; Sign up stays the
          filled call to action. */}
      <div className="flex items-center gap-2">
        {/* THE brand popup, not a new one: /account/brand is intercepted by the
            existing parallel route app/@accountModal/(.)account/brand/page.tsx,
            which renders AccountBrandEditor → BrandingBlock — the ONE brand
            form. A visitor who skips it simply keeps the house brand. */}
        <Link
          href="/account/brand"
          className="rounded-full border px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ borderColor: GO_BRAND.hairline, color: GO_BRAND.primary }}
        >
          My Brand
        </Link>
        {/* One door covers create-account AND brand setup: postLoginDestination
            sends a profile with no brand saved to BRAND_WELCOME_PATH. */}
        <Link
          href="/login?next=%2Fgo"
          className="rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: GO_BRAND.accent, color: GO_BRAND.primary }}
        >
          Sign up
        </Link>
      </div>
    </header>
  );
}
