// Live preview of Fence 3 (photo aspect-ratio lock) — run with `bun email dev`.
// Renders via the real production path (EmailDocEmail), not a redrawn mockup.
import { EmailDocEmail } from "../lib/email/blocks/EmailDocRenderer";
import type { EmailDoc } from "../lib/email/doc/types";

// "Dark Pro" — the real SWFL Data Gulf skeleton palette (lib/email/doc/default-docs.ts).
const STYLE: EmailDoc["globalStyle"] = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#e8e4dc",
  backdropColor: "#0f1d24",
};

// Same source image, three different `kind` values — only "photo" gets the
// 3:2 lock. Compare the rendered widths/heights in the preview to see it.
const doc: EmailDoc = {
  globalStyle: STYLE,
  blocks: [
    { id: "h", type: "header", props: { companyName: "SWFL Data Gulf" } },
    {
      id: "locked",
      type: "image",
      props: {
        url: "https://picsum.photos/id/1015/1200/1200",
        alt: "Fort Myers listing photo, locked to 3:2 regardless of the 1200x1200 source",
        kind: "photo",
        caption: "kind: photo — locked to 3:2 (Fence 3)",
      },
    },
    {
      id: "chart",
      type: "image",
      props: {
        url: "https://picsum.photos/id/1015/1200/1200",
        alt: "kind: chart — unconstrained",
        kind: "chart",
        caption: "kind: chart — unconstrained (same source image)",
      },
    },
    {
      id: "untagged",
      type: "image",
      props: {
        url: "https://picsum.photos/id/1015/1200/1200",
        alt: "no kind — unconstrained (today's pre-fence behavior)",
        caption: "no kind — unconstrained (today's pre-fence behavior)",
      },
    },
  ],
};

export default function Preview() {
  return <EmailDocEmail doc={doc} preview="Fence 3 — photo aspect-ratio lock" />;
}
