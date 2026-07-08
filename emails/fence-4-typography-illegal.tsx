// Live preview of Fence 4 REJECTING an illegal pairing — run with `bun email dev`.
// Requests serif body (BOOK_SERIF) + serif display (PLAYFAIR_SERIF).
// brandGlobalStyle drops the display font rather than allow serif+serif —
// the hero headline below renders in the body serif, not Playfair, because
// there is no legal display font to fall back to here.
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

const globalStyle = brandGlobalStyle(BASE, {
  FONT_BODY: "BOOK_SERIF",
  FONT_DISPLAY: "PLAYFAIR_SERIF", // requested, but rejected — serif + serif
});

const doc: EmailDoc = {
  globalStyle,
  blocks: [
    { id: "h", type: "header", props: { companyName: "SWFL Data Gulf" } },
    {
      id: "hero",
      type: "hero",
      props: {
        kicker: "FENCE 4 — REJECTED PAIRING",
        value: "Naples, FL",
        label: `resulting displayFontFamily: ${globalStyle.displayFontFamily ?? "(none — dropped)"}`,
        prose:
          "Requested PLAYFAIR_SERIF display on a BOOK_SERIF body — Fence 4 drops the display font instead of allowing serif+serif.",
      },
    },
  ],
};

export default function Preview() {
  return <EmailDocEmail doc={doc} preview="Fence 4 — serif+serif rejected" />;
}
