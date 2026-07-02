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
