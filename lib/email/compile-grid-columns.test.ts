// lib/email/compile-grid-columns.test.ts
// Load-bearing row shape for the agent-launch look: a portrait `image` block
// spanning 5 of 12 columns BESIDE a `text` block must compile to true
// side-by-side email columns (Cerberus inline-block + MSO ghost tables), with
// the image constrained to its column width — never a full-width banner.
import { describe, expect, it } from "bun:test";
import { renderEmailDocHtml } from "./render-email-doc";
import { EmailDocSchema } from "./doc/schema";

const gs = {
  primaryColor: "#1F4D3A",
  accentColor: "#A98A4E",
  fontFamily: "BOOK_SERIF",
  textColor: "#1A1E22",
  backdropColor: "#FBFAF7",
};

describe("compiled grid: portrait beside letter", () => {
  it("renders an image col and a text col as one side-by-side row", async () => {
    const doc = EmailDocSchema.parse({
      globalStyle: gs,
      blocks: [
        {
          type: "image",
          props: { url: "https://example.com/portrait.png", alt: "Agent portrait", kind: "photo" },
          layout: { x: 0, y: 0, w: 5, h: 6 },
        },
        {
          type: "text",
          props: { body: "You're getting this because we know each other." },
          layout: { x: 5, y: 0, w: 7, h: 6 },
        },
      ],
    });
    const html = await renderEmailDocHtml(doc);

    // Both cells present.
    expect(html).toContain("portrait.png");
    expect(html).toContain("because we know each other");

    // The image sits inside a 5/12 column: colSpanToPx(5) = 250 → the Cerberus
    // column div carries max-width:250px, and the MSO ghost td width="250".
    expect(html).toContain("max-width:250px");
    expect(html).toContain('td width="250"');

    // The text column is the 7/12 partner: colSpanToPx(7) = 350.
    expect(html).toContain("max-width:350px");

    // The image is fluid within its column (100% of the CELL), not a fixed
    // full-canvas banner.
    const imgTag = html.match(/<img[^>]*portrait\.png[^>]*>/)?.[0] ?? "";
    expect(imgTag).not.toContain('width="600"');
  });
});
