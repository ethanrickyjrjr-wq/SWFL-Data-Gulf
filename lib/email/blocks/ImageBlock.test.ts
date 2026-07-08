import { describe, expect, it } from "bun:test";
import { renderEmailDocHtml } from "../render-email-doc";
import type { EmailDoc } from "../doc/types";

const STYLE: EmailDoc["globalStyle"] = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};

const docWithImage = (kind?: "chart" | "photo"): EmailDoc => ({
  globalStyle: STYLE,
  blocks: [
    {
      id: "img1",
      type: "image",
      props: { url: "https://cdn/example/whatever-ratio.jpg", alt: "a", ...(kind ? { kind } : {}) },
    },
  ],
});

// Fence 3 (docs/superpowers/specs/2026-07-08-email-grid-fence-system-design.md)
// — a listing photo displays center-cropped to the MLS 3:2 standard regardless
// of its source dimensions. Locked via CSS aspect-ratio + object-fit: cover,
// which is progressive enhancement (~41% email-client support per caniemail,
// Outlook desktop falls back to today's unconstrained rendering — never worse,
// same policy already used for fonts in lib/brand/fonts.ts).
describe("ImageBlock — Fence 3 photo aspect-ratio lock", () => {
  it("locks a kind:photo image to 3 / 2 with object-fit: cover", async () => {
    const html = await renderEmailDocHtml(docWithImage("photo"));
    expect(html).toContain("aspect-ratio:3 / 2");
    expect(html).toContain("object-fit:cover");
  });

  it("leaves a kind:chart image unconstrained — charts have their own aspect needs", async () => {
    const html = await renderEmailDocHtml(docWithImage("chart"));
    expect(html).not.toContain("aspect-ratio");
    expect(html).not.toContain("object-fit");
  });

  it("leaves an untagged image (no kind) unconstrained — today's behavior", async () => {
    const html = await renderEmailDocHtml(docWithImage());
    expect(html).not.toContain("aspect-ratio");
    expect(html).not.toContain("object-fit");
  });
});
