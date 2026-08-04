// lib/email/blocks/listing-grid-engine-parity.test.tsx — F9, the whole point.
//
// `docs/standards/emails.md` §5: a block that renders in one engine and not the
// others is this repo's documented recurring failure. There are THREE rendering
// surfaces but only TWO switches — `BlockRenderer` serves the free tier
// (renderEmailDocHtml) AND the grid tier (compileGrid); `lib/pdf/email-doc-pdf.tsx`
// has its own.
//
// WHY THIS TEST HAS TO EXIST AT ALL: both switches end in `default:` — a missing
// arm is not a type error and not a runtime throw. The block just silently
// disappears from that surface. Nothing else in the suite would notice, so each
// surface is asserted end to end here, on the SAME doc.
//
// Split out of listing-grid-render.test.tsx because the PDF path rasterises and is
// an order of magnitude slower than the pure component tests.
import { describe, expect, test } from "bun:test";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { compileGrid } from "@/lib/email/compile-grid";
import { renderEmailDocToBuffer, parsePdfText } from "@/lib/pdf";
import { DEFAULT_GLOBAL_STYLE } from "../doc/default-docs";
import { GRID_COLS } from "@/lib/email/grid-schema";
import type { EmailDoc } from "../doc/types";

const card = (n: number) => ({
  photoUrl: `https://ap.rdcpix.com/photo${n}.jpg`,
  linkUrl: `https://www.realtor.com/realestateandhomes-detail/home-${n}`,
  price: `$${200 + n},000`,
  addressLine1: `${n} Byron Rd`,
  addressLine2: "Fort Myers, FL 33919",
});

const doc = (): EmailDoc =>
  ({
    globalStyle: DEFAULT_GLOBAL_STYLE,
    blocks: [
      {
        id: "g1",
        type: "listing-grid",
        props: {
          title: "Price drops",
          subtitle: "Fort Myers",
          cards: [card(1), card(2), card(3), card(4)],
        },
        layout: { x: 0, y: 0, w: GRID_COLS, h: 6 },
      },
    ],
  }) as EmailDoc;

describe("F9 — listing-grid renders on every surface, not just one", () => {
  test("free tier (renderEmailDocHtml → BlockRenderer)", async () => {
    const html = await renderEmailDocHtml(doc());
    expect(html).toContain("photo1.jpg");
    expect(html).toContain("home-4");
    expect(html).toContain("Price drops");
  });

  test("grid tier (compileGrid → BlockRenderer)", async () => {
    const html = await compileGrid(doc());
    expect(html).toContain("photo1.jpg");
    expect(html).toContain("home-4");
    expect(html).toContain("Price drops");
  });

  test("PDF (email-doc-pdf's own switch) — real text, not just non-empty bytes", async () => {
    const buf = await renderEmailDocToBuffer(doc());
    const parsed = await parsePdfText(buf);
    // A `default: null` arm would still produce a perfectly valid PDF, so asserting
    // the buffer exists proves nothing. Assert the CARD CONTENT is in the text layer.
    expect(parsed?.text ?? "").toContain("Byron Rd");
    expect(parsed?.text ?? "").toContain("Price drops");
  }, 30000);
});
