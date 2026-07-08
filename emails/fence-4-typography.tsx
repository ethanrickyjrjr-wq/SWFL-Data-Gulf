// Live preview of Fence 4 (typography pairing) — run with `bun email dev`.
// Renders via the real production path (EmailDocEmail + brandGlobalStyle),
// not a redrawn mockup. Compare this file against fence-4-typography-illegal
// in the preview sidebar.
import { EmailDocEmail } from "../lib/email/blocks/EmailDocRenderer";
import { brandGlobalStyle } from "../lib/email/brand/apply-brand-style";
import type { EmailDoc } from "../lib/email/doc/types";

// "Dark Pro" — the real SWFL Data Gulf skeleton palette (lib/email/doc/default-docs.ts).
const BASE: EmailDoc["globalStyle"] = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#e8e4dc",
  backdropColor: "#0f1d24",
};

// Legal pairing: PLAYFAIR_SERIF display + LATO_SANS body — the exact
// combination exercised in font-parity.test.ts.
const globalStyle = brandGlobalStyle(BASE, {
  FONT_BODY: "LATO_SANS",
  FONT_DISPLAY: "PLAYFAIR_SERIF",
});

const doc: EmailDoc = {
  globalStyle,
  blocks: [
    { id: "h", type: "header", props: { companyName: "SWFL Data Gulf" } },
    {
      id: "hero",
      type: "hero",
      props: {
        kicker: "FENCE 4 — LEGAL PAIRING",
        value: "Fort Myers, FL",
        label: "display: PLAYFAIR_SERIF",
        prose:
          "This headline renders in PLAYFAIR_SERIF; this body copy renders in LATO_SANS — the blessed pairing, never serif-on-serif.",
      },
    },
  ],
};

export default function Preview() {
  return <EmailDocEmail doc={doc} preview="Fence 4 — legal serif display + sans body" />;
}
