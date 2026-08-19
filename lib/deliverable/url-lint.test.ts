import { describe, expect, test } from "bun:test";
import { collectAllowedUrls, lintCompiledHtml, lintTextUrls } from "./url-lint";

describe("collectAllowedUrls", () => {
  test("harvests URLs from nested objects, arrays, and inside longer strings", () => {
    const allowed = collectAllowedUrls(
      { blocks: [{ props: { url: "https://cdn.example.com/p.jpg" } }] },
      { note: "see https://feed.example.com/listing/123 for detail" },
      "https://client-site.com/465-gordonia",
    );
    expect(allowed.has("https://cdn.example.com/p.jpg")).toBe(true);
    expect(allowed.has("https://feed.example.com/listing/123")).toBe(true);
    expect(allowed.has("https://client-site.com/465-gordonia")).toBe(true);
  });
});

describe("lintCompiledHtml", () => {
  const allowed = collectAllowedUrls({ photo: "https://cdn.example.com/p.jpg" });

  test("verbatim payload URL passes; platform, relative, mailto pass by rule", () => {
    const html =
      `<a href="https://cdn.example.com/p.jpg">photo</a>` +
      `<a href="https://www.swfldatagulf.com/p/abc">report</a>` +
      `<a href="/api/unsubscribe?id=1">unsub</a>` +
      `<a href="mailto:agent@example.com">mail</a>`;
    const r = lintCompiledHtml(html, allowed);
    expect(r.ok).toBe(true);
    expect(r.stripped).toBe(html);
  });

  test("a minted href is a violation; the anchor is unwrapped, text kept", () => {
    const html = `<p>See <a href="https://www.realtor.com/M5493101642">the listing</a> today.</p>`;
    const r = lintCompiledHtml(html, allowed);
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual([{ attr: "href", url: "https://www.realtor.com/M5493101642" }]);
    expect(r.stripped).toBe(`<p>See the listing today.</p>`);
  });

  test("a minted img src removes the img tag", () => {
    const html = `<div><img src="https://ap.rdcpix.com/x-w2048.jpg" alt="p"/></div>`;
    const r = lintCompiledHtml(html, allowed);
    expect(r.ok).toBe(false);
    expect(r.stripped).toBe(`<div></div>`);
  });

  test("HTML-escaped ampersands match their raw allowed URL", () => {
    const allowed2 = collectAllowedUrls("https://cdn.example.com/p.jpg?a=1&b=2");
    const html = `<img src="https://cdn.example.com/p.jpg?a=1&amp;b=2"/>`;
    expect(lintCompiledHtml(html, allowed2).ok).toBe(true);
  });
});

describe("lintTextUrls (captions)", () => {
  test("bare minted URL in a caption is stripped and reported", () => {
    const allowed = collectAllowedUrls("https://client-site.com/listing");
    const r = lintTextUrls(
      "Tour it: https://www.realtor.com/M123 or https://client-site.com/listing",
      allowed,
    );
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(["https://www.realtor.com/M123"]);
    expect(r.stripped).toBe("Tour it:  or https://client-site.com/listing");
  });
});

describe("refinement allowance — a deep link INTO an allowed page is that page (08/19/2026)", () => {
  // The time-offer lane (lib/booking) appends date/month/slot to the agent's
  // SAVED booking link. Exact-string membership alone 422'd the whole blast for
  // exactly the agents with the best setup — found by second-order audit the
  // day the lane shipped.
  const BASE = "https://cal.com/jane/tour";
  const DEEP = `${BASE}?date=2026-08-25&month=2026-08&slot=2026-08-25T18%3A00%3A00.000Z`;

  test("query-only refinement of an allowed URL passes the compiled-HTML gate", () => {
    const allowed = collectAllowedUrls({ booking: BASE });
    const html = `<a href="${DEEP.replace(/&/g, "&amp;")}">Tue · 2:00 PM ET</a>`;
    expect(lintCompiledHtml(html, allowed).ok).toBe(true);
  });

  test("same host, DIFFERENT path is still minted — the gate holds", () => {
    const allowed = collectAllowedUrls({ booking: BASE });
    const html = `<a href="https://cal.com/jane/other?x=1">nope</a>`;
    expect(lintCompiledHtml(html, allowed).ok).toBe(false);
  });

  test("a lookalike host refining nothing is still refused", () => {
    const allowed = collectAllowedUrls({ booking: BASE });
    const html = `<a href="https://cal.com.evil.co/jane/tour?x=1">nope</a>`;
    expect(lintCompiledHtml(html, allowed).ok).toBe(false);
  });
});
