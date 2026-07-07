import { describe, expect, it } from "bun:test";
import { renderDripEmail, appendPostalAddress, type DripEmailInput } from "./drip-email";

function input(over: Partial<DripEmailInput> = {}): DripEmailInput {
  return {
    brand: {
      primary: "#0a3d62",
      accent: "#e74c3c",
      logoUrl: "https://cdn.acme.com/logo.png",
      companyName: "Acme Realty",
    },
    kicker: "FORT MYERS BEACH · MARKET PULSE",
    title: "Typical home value is up 4% this quarter",
    chart: {
      type: "sparkline",
      title: "Typical home value",
      subtitle: "as of Jun 2026",
      data: [
        { x: "Mar", y: 410 },
        { x: "Apr", y: 415 },
        { x: "May", y: 420 },
        { x: "Jun", y: 426 },
      ],
    },
    explanation: "Prices firmed for the third straight month as inventory stayed tight.",
    ctaUrl: "https://www.swfldatagulf.com/welcome?primary=%230a3d62&zip=33931",
    freshness: "Live data token: SWFL-7421-v5-20260620",
    subject: "Fort Myers Beach market: home values up 4%",
    ...over,
  };
}

describe("renderDripEmail", () => {
  it("renders branded HTML with no unfilled {{TOKEN}} left", async () => {
    const { html, subject } = await renderDripEmail(input());
    expect(subject).toBe("Fort Myers Beach market: home values up 4%");
    // renderEmailTemplate throws on a leftover {{TOKEN}}; reaching here proves none.
    // Belt-and-suspenders: no double-brace uppercase token survives.
    // The only legit remaining brace-token is the post-render unsubscribe token.
    const stripped = html.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "");
    expect(stripped.match(/\{\{[A-Z_]+\}\}/)).toBeNull();
  });

  it("injects the recipient brand: logo, accent, company name, and the CTA url", async () => {
    const { html } = await renderDripEmail(input());
    expect(html).toContain("https://cdn.acme.com/logo.png");
    expect(html).toContain("Acme Realty");
    expect(html).toContain("#e74c3c"); // accent on kicker/CTA
    expect(html).toContain("https://www.swfldatagulf.com/welcome?primary=%230a3d62&zip=33931");
    expect(html).toContain("Create your own report");
  });

  it("includes the chart, the explanation, and the freshness token", async () => {
    const { html } = await renderDripEmail(input());
    expect(html).toContain("Typical home value"); // chart title
    expect(html).toContain("inventory stayed tight"); // explanation
    expect(html).toContain("SWFL-7421-v5-20260620"); // freshness
  });

  it("injects an unsubscribe footer (CAN-SPAM) via the resend token", async () => {
    const { html } = await renderDripEmail(input());
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(html.toLowerCase()).toContain("unsubscribe");
  });

  it("falls back to shell defaults when brand fields are absent (house brand)", async () => {
    const { html } = await renderDripEmail(
      input({ brand: { primary: null, accent: null, logoUrl: null, companyName: null } }),
    );
    // The only legit remaining brace-token is the post-render unsubscribe token.
    const stripped = html.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "");
    expect(stripped.match(/\{\{[A-Z_]+\}\}/)).toBeNull();
    // No company override → the shell's SWFL default company name is used.
    expect(html).toContain("SWFL Data Gulf");
  });

  it("appends the CAN-SPAM postal address when provided", async () => {
    const addr = "SWFL Data Gulf, 123 Main St, Fort Myers, FL 33901";
    const { html } = await renderDripEmail(input({ postalAddress: addr }));
    expect(html).toContain(addr);
  });

  it("omits the postal address line when none is provided", async () => {
    const { html } = await renderDripEmail(input());
    expect(html).not.toContain("123 Main St");
  });
});

describe("renderDripEmail — demo sections", () => {
  const demoOver: Partial<DripEmailInput> = {
    brand: {
      primary: "#670038",
      accent: "#ab8f40",
      logoUrl: "https://cdn.example.com/logo.png",
      companyName: "BHHS Florida Realty",
    },
    preheader: "This is what your clients could get from you every week.",
    stats: [
      { label: "Active listings", value: "214" },
      { label: "Median list price", value: "$1,240,000" },
      { label: "Days on market", value: "63" },
    ],
    promptButtons: [
      {
        label: "What changed in Park Shore this week?",
        url: "https://www.swfldatagulf.com/welcome?zip=34103&prompt=x&ref=rid-t1",
      },
    ],
    deltaLine: "Median sale price: $899,000 → $912,000",
    ctaLabel: "See your whole week — already built",
    sources: ["SWFL Data Gulf"],
  };

  it("renders preheader, stats, buttons, delta, sources, custom CTA label", async () => {
    const { html } = await renderDripEmail(input(demoOver));
    expect(html).toContain("This is what your clients could get from you every week.");
    expect(html).toContain("$1,240,000");
    expect(html).toContain("What changed in Park Shore this week?");
    expect(html).toContain(
      "https://www.swfldatagulf.com/welcome?zip=34103&amp;prompt=x&amp;ref=rid-t1",
    );
    expect(html).toContain("Median sale price: $899,000 → $912,000");
    expect(html).toContain("See your whole week — already built");
    expect(html).toContain("<details");
    expect(html).toContain("Sources (1)");
    expect(html).toContain("SWFL Data Gulf");
    expect(html).toContain("#670038"); // brand primary present (pre-send gate relies on this)
    expect(html).toContain("#ab8f40"); // accent styles the button borders
  });

  it("legacy input renders the legacy CTA label — the registry default never leaks", async () => {
    const { html } = await renderDripEmail(input());
    expect(html).toContain("Create your own report");
    expect(html).not.toContain("View Listing");
  });
});

describe("appendPostalAddress (CAN-SPAM footer)", () => {
  const ADDR = "SWFL Data Gulf, 123 Main St, Fort Myers, FL 33901";

  it("injects the address just before </body>", () => {
    const out = appendPostalAddress("<html><body><p>hi</p></body></html>", ADDR);
    expect(out).toContain(ADDR);
    expect(out.indexOf(ADDR)).toBeLessThan(out.indexOf("</body>"));
  });

  it("appends at the end when there is no </body>", () => {
    expect(appendPostalAddress("<p>hi</p>", ADDR)).toContain(ADDR);
  });

  it("is idempotent — never double-injects", () => {
    const once = appendPostalAddress("<body>x</body>", ADDR);
    expect(appendPostalAddress(once, ADDR)).toBe(once);
  });

  it("leaves html unchanged for a blank address", () => {
    expect(appendPostalAddress("<body>x</body>", "   ")).toBe("<body>x</body>");
  });

  it("escapes HTML in the address", () => {
    expect(appendPostalAddress("<body>x</body>", "A & B <Co>")).toContain("A &amp; B &lt;Co&gt;");
  });
});
