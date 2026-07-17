// lib/switch/forward-inbound.test.ts
// Coverage for the forward-lane classifier (Task 9) — five pure functions, no
// DB, no fetch. Fixtures are hand-built minimal HTML/headers per platform
// (RULE 0.4 crawl4ai verification of the marker domains is in the file header
// of forward-inbound.ts, not repeated here).
import { describe, test, expect } from "bun:test";
import {
  SWITCH_ADDRESS_LOCAL,
  isSwitchInbound,
  classifyForward,
  detectPlatform,
  extractFooterAbout,
  senderDomain,
  MAX_FORWARD_HTML,
} from "./forward-inbound";

describe("SWITCH_ADDRESS_LOCAL", () => {
  test("is the literal local-part 'switch'", () => {
    expect(SWITCH_ADDRESS_LOCAL).toBe("switch");
  });
});

describe("isSwitchInbound", () => {
  test("true when the sole recipient's local part is switch", () => {
    expect(isSwitchInbound({ data: { to: ["switch@swfldatagulf.com"] } })).toBe(true);
  });

  test("case-insensitive local-part match", () => {
    expect(isSwitchInbound({ data: { to: ["SWITCH@swfldatagulf.com"] } })).toBe(true);
  });

  test("false when local part is unrelated", () => {
    expect(isSwitchInbound({ data: { to: ["hello@swfldatagulf.com"] } })).toBe(false);
  });

  test("true when ANY recipient (of several) matches", () => {
    expect(
      isSwitchInbound({ data: { to: ["a@b.com", "switch@otherdomain.com", "c@d.com"] } }),
    ).toBe(true);
  });

  test("domain-agnostic — matches regardless of which domain follows switch@", () => {
    expect(isSwitchInbound({ data: { to: ["switch@another-domain.example"] } })).toBe(true);
  });

  test("accepts a bare string (not just an array) for data.to", () => {
    expect(isSwitchInbound({ data: { to: "switch@swfldatagulf.com" } })).toBe(true);
  });

  test("does not match on a mere prefix — 'switchy' is not 'switch'", () => {
    expect(isSwitchInbound({ data: { to: ["switchy@swfldatagulf.com"] } })).toBe(false);
  });

  test("does not match on a mere suffix — 'notswitch' is not 'switch'", () => {
    expect(isSwitchInbound({ data: { to: ["notswitch@swfldatagulf.com"] } })).toBe(false);
  });

  test("handles a 'Name <email>' wrapped recipient defensively", () => {
    expect(isSwitchInbound({ data: { to: ["Switch Import <switch@swfldatagulf.com>"] } })).toBe(
      true,
    );
  });

  test("false when data is undefined", () => {
    expect(isSwitchInbound({})).toBe(false);
  });

  test("false when to is undefined", () => {
    expect(isSwitchInbound({ data: {} })).toBe(false);
  });

  test("false when to is an empty array", () => {
    expect(isSwitchInbound({ data: { to: [] } })).toBe(false);
  });
});

describe("classifyForward", () => {
  test("contact_export when an attachment is CSV by extension", () => {
    const result = classifyForward({
      text: "please see attached",
      html: null,
      headers: {},
      attachments: [{ filename: "subscribed_members_export.csv", contentType: "text/csv" }],
    });
    expect(result).toEqual({ kind: "contact_export" });
  });

  test("contact_export by extension even with a generic content-type", () => {
    const result = classifyForward({
      text: "export attached",
      html: null,
      headers: {},
      attachments: [{ filename: "Members-Export.CSV", contentType: "application/octet-stream" }],
    });
    expect(result).toEqual({ kind: "contact_export" });
  });

  test("contact_export by content-type even without a recognizable extension", () => {
    const result = classifyForward({
      text: "export attached",
      html: null,
      headers: {},
      attachments: [{ filename: "export", contentType: "text/csv" }],
    });
    expect(result).toEqual({ kind: "contact_export" });
  });

  test("contact_export for an XLSX attachment by extension", () => {
    const result = classifyForward({
      text: "",
      html: null,
      headers: {},
      attachments: [{ filename: "contacts.xlsx", contentType: "application/octet-stream" }],
    });
    expect(result).toEqual({ kind: "contact_export" });
  });

  test("contact_export for an XLSX attachment by content-type", () => {
    const result = classifyForward({
      text: "",
      html: null,
      headers: {},
      attachments: [
        {
          filename: "data",
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });
    expect(result).toEqual({ kind: "contact_export" });
  });

  test("contact_export wins even when HTML is also present", () => {
    const result = classifyForward({
      text: "",
      html: "<html><body>a campaign</body></html>",
      headers: {},
      attachments: [{ filename: "export.csv", contentType: "text/csv" }],
    });
    expect(result).toEqual({ kind: "contact_export" });
  });

  test("campaign when HTML is present and no export attachment qualifies", () => {
    const result = classifyForward({
      text: "view in browser",
      html: "<html><body><p>New listings this week</p></body></html>",
      headers: {},
      attachments: [{ filename: "flyer.pdf", contentType: "application/pdf" }],
    });
    expect(result).toEqual({ kind: "campaign" });
  });

  test("unknown when there is no HTML and no export attachment (empty/plain email)", () => {
    const result = classifyForward({
      text: "just a plain reply, nothing forwarded",
      html: null,
      headers: {},
      attachments: [],
    });
    expect(result).toEqual({ kind: "unknown" });
  });

  test("unknown when html is an empty string (present-but-blank does not count)", () => {
    const result = classifyForward({
      text: "",
      html: "",
      headers: {},
      attachments: [],
    });
    expect(result).toEqual({ kind: "unknown" });
  });
});

describe("detectPlatform", () => {
  test("Mailchimp via List-Unsubscribe header carrying a list-manage.com URL", () => {
    const platform = detectPlatform(
      { "list-unsubscribe": "<https://uniquename.list-manage.com/unsubscribe?u=abc&id=123>" },
      null,
    );
    expect(platform).toBe("mailchimp");
  });

  test("Mailchimp via body links even with NO usable headers (Gmail-forward case)", () => {
    // Gmail forwarding rewrites the envelope/headers (From/Reply-To become the
    // forwarder's own, List-Unsubscribe is dropped) but the ORIGINAL campaign
    // HTML is quoted verbatim inside the new message body — so the mailchimp
    // tracking/footer links survive even though the headers no longer do.
    const gmailForwardedHtml = `
      <div class="gmail_quote">
        <div dir="ltr">---------- Forwarded message ---------<br>From: Acme Realty</div>
        <div>
          <p>Check out this week's new listings.</p>
          <a href="http://uniquename.list-manage.com/track/click?u=abc&id=456">Read more</a>
          <p style="font-size:11px;color:#999">Copyright (C) 2026. Powered by
            <a href="https://mailchimp.com/">Mailchimp</a></p>
        </div>
      </div>`;
    const platform = detectPlatform(
      { "x-google-original-from": "someone@gmail.com" },
      gmailForwardedHtml,
    );
    expect(platform).toBe("mailchimp");
  });

  test("Constant Contact via rs6.net link in the body", () => {
    const html =
      '<p>Read our newsletter.</p><a href="http://r20.rs6.net/tn.jsp?f=abc123">View update</a>';
    expect(detectPlatform({}, html)).toBe("constantcontact");
  });

  test("Constant Contact via constantcontact.com header URL", () => {
    const platform = detectPlatform(
      { "list-unsubscribe": "<https://visitor.constantcontact.com/do?p=un&m=abc>" },
      null,
    );
    expect(platform).toBe("constantcontact");
  });

  test("Follow Up Boss via followupboss.com link in the body", () => {
    const html =
      '<p>Sent from <a href="https://app.followupboss.com/2/people/123">Follow Up Boss</a></p>';
    expect(detectPlatform({}, html)).toBe("followupboss");
  });

  test("CONFLICT: header carries a Constant Contact marker but body links carry Mailchimp — links win", () => {
    // Review-pinned 07/16/2026: body links are checked FIRST because in a
    // forwarded email the headers belong to the forwarder, not the platform —
    // a stale/reused header pointing elsewhere must not out-rank the actual
    // quoted body.
    const platform = detectPlatform(
      { "list-unsubscribe": "<https://visitor.constantcontact.com/do?p=un&m=abc>" },
      '<p>Check out this week\'s listings.</p><a href="https://mailchimp.com/">Powered by Mailchimp</a>',
    );
    expect(platform).toBe("mailchimp");
  });

  test("null when no headers and no html carry any known marker", () => {
    expect(detectPlatform({}, null)).toBeNull();
  });

  test("null on an empty/unknown email (no markers anywhere)", () => {
    const html = "<p>Hey, just checking in on the listing.</p>";
    expect(detectPlatform({ "content-type": "text/html" }, html)).toBeNull();
  });
});

describe("extractFooterAbout", () => {
  test("extracts the last block matching the about-me/about-Name pattern", () => {
    const html = `
      <table>
        <tr><td><p>About Us: We are a company.</p></td></tr>
        <tr><td><p>About Jane Smith — Jane has helped 200+ families buy and sell homes in Bonita Springs since 2015.</p></td></tr>
      </table>`;
    expect(extractFooterAbout(html)).toBe(
      "About Jane Smith — Jane has helped 200+ families buy and sell homes in Bonita Springs since 2015.",
    );
  });

  test("falls back to the final long (>120 char) paragraph when no about-pattern exists", () => {
    const shortPara = "<p>Hi there.</p>";
    const longFooter =
      "<p>Jane Smith is a top-producing agent serving Lee and Collier counties, specializing in waterfront properties, new construction, and relocation clients moving to Southwest Florida.</p>";
    expect(longFooter.replace(/<[^>]+>/g, "").length).toBeGreaterThan(120);
    expect(extractFooterAbout(shortPara + longFooter)).toBe(
      "Jane Smith is a top-producing agent serving Lee and Collier counties, specializing in waterfront properties, new construction, and relocation clients moving to Southwest Florida.",
    );
  });

  test("returns null when nothing qualifies (no invention)", () => {
    const html = "<p>Hi</p><p>Thanks for reaching out.</p>";
    expect(extractFooterAbout(html)).toBeNull();
  });

  test("returns null for null html", () => {
    expect(extractFooterAbout(null)).toBeNull();
  });

  test("returns null for html with no p/td blocks at all", () => {
    expect(extractFooterAbout("<div>no paragraph or table cells here</div>")).toBeNull();
  });

  test("MAX_FORWARD_HTML matches the documented cap", () => {
    expect(MAX_FORWARD_HTML).toBe(250_000);
  });

  test("still finds the real bio when preceded by more than MAX_FORWARD_HTML of padding (tail slice)", () => {
    // The bio sits at the very end, as a real forwarded-campaign footer would
    // — slicing to the TAIL (rather than e.g. the head) must still surface it.
    const filler =
      "<p>filler content that is not a bio and is not long enough to qualify on its own</p>";
    const padding = filler.repeat(4000);
    expect(padding.length).toBeGreaterThan(MAX_FORWARD_HTML);
    const bio =
      "<p>About Jane Smith — Jane has helped 200+ families buy and sell homes in Bonita Springs since 2015.</p>";
    expect(extractFooterAbout(padding + bio)).toBe(
      "About Jane Smith — Jane has helped 200+ families buy and sell homes in Bonita Springs since 2015.",
    );
  });

  test("a pathological 200k+ string of unclosed <p> openers returns quickly (no quadratic blowup)", () => {
    // Regression for the reviewer's CRITICAL finding: the old backtracking
    // regex was O(n^2) here (benchmarked 143ms at just 80KB of unclosed <p>
    // openers). This fixture is 210,000 chars — over 200k, and still under
    // MAX_FORWARD_HTML, so it exercises the LINEAR SCAN itself, not just the
    // tail-slice safety net.
    const hostile = "<p>".repeat(70_000);
    expect(hostile.length).toBeGreaterThan(200_000);

    const start = performance.now();
    const result = extractFooterAbout(hostile);
    const elapsedMs = performance.now() - start;

    // Generous bound so this isn't flaky on a loaded CI box — the point is
    // "not quadratic", not "as fast as physically possible".
    expect(elapsedMs).toBeLessThan(500);
    expect(result === null || typeof result === "string").toBe(true);
  });
});

describe("senderDomain", () => {
  test("extracts the domain from a bare address", () => {
    expect(senderDomain("agent@compass.com")).toBe("compass.com");
  });

  test("extracts the domain from a 'Name <email>' wrapped address", () => {
    expect(senderDomain("Jane Smith <jane@compass.com>")).toBe("compass.com");
  });

  test("lowercases the domain", () => {
    expect(senderDomain("Jane Smith <JANE@COMPASS.COM>")).toBe("compass.com");
  });

  test("handles a bracketed address with no display name", () => {
    expect(senderDomain("<jane@compass.com>")).toBe("compass.com");
  });

  test("strips a trailing dot on the domain", () => {
    expect(senderDomain("jane@compass.com.")).toBe("compass.com");
  });

  test("null for an empty string", () => {
    expect(senderDomain("")).toBeNull();
  });

  test("null when there is no @ at all", () => {
    expect(senderDomain("not-an-email")).toBeNull();
  });

  test("null when the domain part is empty", () => {
    expect(senderDomain("jane@")).toBeNull();
  });
});
