// lib/booking/blast-chain.integration.test.ts
//
// The seam the unit tests could not see (second-order audit, 08/19/2026): the
// expanded doc's deep links live between expand-doc's output and the blast
// route's compiled-HTML url gate, and NOTHING crossed that seam — which is how
// a 422-on-every-cal.com-blast shipped with a green suite. This test runs the
// route's real chain: expand → link ladder → render → lint, with the allowlist
// built exactly the way the route builds it (stored doc + saved destinations).
import { describe, test, expect } from "bun:test";
import type { EmailDoc } from "@/lib/email/doc/types";
import { createBlock } from "@/lib/email/doc/default-docs";
import { applyLinkFallbacks } from "@/lib/email/link-audit";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { collectAllowedUrls, lintCompiledHtml } from "@/lib/deliverable/url-lint";
import { expandBookingButtonWithTimes } from "./expand-doc";

const CAL = "https://cal.com/jane/tour";
const WEB_URL = "https://www.swfldatagulf.com/p/test-id";

const block = (type: Parameters<typeof createBlock>[0], props: Record<string, unknown>) => ({
  ...createBlock(type),
  props: { ...createBlock(type).props, ...props },
});

const storedDoc = {
  globalStyle: { fontFamily: "MODERN_SANS" },
  blocks: [
    block("text", { text: "Pick a time below." }),
    block("button", { label: "Book a time", url: CAL, role: "booking" }),
    block("footer", { companyName: "Jane", address: "123 St", unsubscribeUrl: WEB_URL }),
  ],
} as unknown as EmailDoc;

describe("blast chain: expand → ladder → render → lint", () => {
  test("slot deep links survive the whole chain and PASS the url gate", async () => {
    const expanded = expandBookingButtonWithTimes(storedDoc, {
      slotStartsISO: ["2026-08-25T18:00:00.000Z", "2026-08-26T14:00:00.000Z"],
      bookingUrl: CAL,
      timeZone: "America/New_York",
    });
    const ladder = applyLinkFallbacks(expanded, {
      listingUrl: null,
      brandWebsiteUrl: null,
      replyMailto: null,
      hostedUrl: WEB_URL,
      savedDestinations: { booking: CAL },
    });
    const html = await renderEmailDocHtml(ladder.doc);
    // The route's allowlist shape: the STORED doc (not the expanded one) plus
    // the saved destinations root added 08/19/2026.
    const allowed = collectAllowedUrls(storedDoc, WEB_URL, { booking: CAL });
    const gate = lintCompiledHtml(html, allowed);
    expect(gate.violations).toEqual([]);
    expect(gate.ok).toBe(true);
    // And the deep links really are in the compiled HTML — the gate passing an
    // email that silently lost its times would be a different bug.
    expect(html).toContain("slot=2026-08-25T18%3A00%3A00.000Z");
    expect(html).toContain("See all available times");
  });

  test("a minted same-host different-path URL still fails the gate — the loosening is scoped", async () => {
    const doc = {
      ...storedDoc,
      blocks: [
        ...storedDoc.blocks.slice(0, 1),
        block("button", {
          label: "x",
          url: "https://cal.com/jane/other",
          role: "booking",
          urlSource: "user",
        }),
        ...storedDoc.blocks.slice(2),
      ],
    } as unknown as EmailDoc;
    const html = await renderEmailDocHtml(doc);
    const allowed = collectAllowedUrls(storedDoc, WEB_URL, { booking: CAL });
    expect(lintCompiledHtml(html, allowed).ok).toBe(false);
  });
});
