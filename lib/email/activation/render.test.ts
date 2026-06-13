import { describe, expect, it } from "bun:test";
import { reportToEmailHtml } from "./render";
import type { AssembledReport } from "./snapshot";
import type { ReportDelta } from "./types";

function report(over: Partial<AssembledReport> = {}): AssembledReport {
  return {
    in_scope: true,
    zip: "33931",
    primaryPlace: "Fort Myers Beach",
    countyName: "Lee",
    freshness_token: "SWFL-7421-v6-20260613",
    metrics: [
      { key: "housing.median_sale_price", label: "Median sale price", value: 412000, unit: "", direction: "neutral", display: "$412,000" },
      { key: "housing.median_dom", label: "Days on market", value: 45, unit: " days", direction: "lower_is_better", display: "45" },
      { key: "env.flood_aal_usd", label: "Flood avg annual loss", value: 30074, unit: "", direction: "lower_is_better", display: "$30,074 / yr" },
    ],
    lines: [
      {
        brain_id: "city-pulse-swfl",
        grain: "city",
        is_true_zip: false,
        label: "Fort Myers Beach-area",
        text: "**Fort Myers Beach-area** — a new beachfront mixed-use approval cleared review.\n\n_Freshness:_ `SWFL-7421-v6-20260613`",
        source_url: "https://example.com/pulse",
        source_citation: "City pulse",
      },
    ],
    coverage_caveats: [],
    snapshot: { zip: "33931", freshness_token: "SWFL-7421-v6-20260613", captured_at: "2026-06-13T00:00:00.000Z", metrics: [], lines: [] },
    ...over,
  };
}

describe("reportToEmailHtml", () => {
  it("emits the literal unsubscribe token (broadcast route requires it)", async () => {
    const html = await reportToEmailHtml(report());
    expect(html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}")).toBe(true);
  });

  it("leaves no unfilled uppercase template tokens", async () => {
    const html = await reportToEmailHtml(report());
    // Strip the intentional triple-brace unsub token before scanning for {{UPPER}}.
    const scan = html.replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, "");
    expect(scan.match(/\{\{[A-Z_]+\}\}/g)).toBeNull();
  });

  it("fills the prospect brand (primary color + company name)", async () => {
    const html = await reportToEmailHtml(report(), {
      brand: { primary: "#7b2d8e", accent: "#f0a", companyName: "Gulf Coast Realty" },
    });
    expect(html).toContain("#7b2d8e");
    expect(html).toContain("Gulf Coast Realty");
  });

  it("quotes the freshness token once and stays under 90kb", async () => {
    const html = await reportToEmailHtml(report());
    expect(html).toContain("SWFL-7421-v6-20260613");
    expect(Buffer.byteLength(html, "utf8")).toBeLessThanOrEqual(90 * 1024);
  });

  it("renders a real delta block when changes exist", async () => {
    const delta: ReportDelta = {
      zip: "33931",
      has_change: true,
      freshness_moved: true,
      freshness_token_prev: "SWFL-7421-v5-20260610",
      freshness_token_current: "SWFL-7421-v6-20260613",
      metric_changes: [
        { key: "housing.median_sale_price", label: "Median sale price", from: 400000, to: 412000, delta: 12000, direction: "up", favorable: null, unit: "" },
      ],
      signal_changes: [{ brain_id: "city-pulse-swfl", label: "Local city pulse" }],
    };
    const html = await reportToEmailHtml(report(), { delta });
    expect(html).toContain("What changed");
    expect(html).toContain("400,000");
    expect(html).toContain("412,000");
    expect(html).toContain("Local city pulse");
  });

  it("no-change delta leads with re-verified, never a fabricated change", async () => {
    const delta: ReportDelta = {
      zip: "33931",
      has_change: false,
      freshness_moved: true,
      freshness_token_prev: "SWFL-7421-v5-20260610",
      freshness_token_current: "SWFL-7421-v6-20260613",
      metric_changes: [],
      signal_changes: [],
    };
    const html = await reportToEmailHtml(report(), { delta });
    expect(html).toContain("Re-verified");
    expect(html).not.toContain("What changed");
  });

  it("points the CTA at the gate", async () => {
    const html = await reportToEmailHtml(report(), { ctaUrl: "https://www.swfldatagulf.com/pricing" });
    expect(html).toContain('href="https://www.swfldatagulf.com/pricing"');
  });
});
