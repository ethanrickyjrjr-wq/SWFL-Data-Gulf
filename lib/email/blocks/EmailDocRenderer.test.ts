import { describe, expect, it } from "bun:test";
import { render } from "@react-email/render";
import { EmailDocEmail } from "./EmailDocRenderer";
import { SEED_DOCS } from "../doc/default-docs";
import type { EmailDoc } from "../doc/types";

// A doc with every block type populated — the acceptance guard from Task 20.
// If BlockRenderer drops a case or a block component crashes, one of these tests breaks.
const ALL_BLOCKS_DOC: EmailDoc = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "MODERN_SANS",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
  },
  blocks: [
    {
      id: "b1",
      type: "header",
      props: { companyName: "SWFL Data Gulf", tagline: "Gulf Coast Intel", bgColor: "#0f1d24" },
    },
    {
      id: "b2",
      type: "hero",
      props: {
        kicker: "Market Spotlight",
        value: "$485K",
        label: "Median Sale Price",
        prose: "A quick read on where the market is heading.",
      },
    },
    {
      id: "b3",
      type: "stats",
      props: {
        stats: [
          { value: "34", label: "Median DOM" },
          { value: "3.2 mo", label: "Supply" },
        ],
      },
    },
    {
      id: "b4",
      type: "signal",
      props: {
        kicker: "Signal to Watch",
        title: "Inventory ticking up",
        body: "More listings are reaching the market.",
        bgColor: "#f0f9ff",
      },
    },
    { id: "b5", type: "text", props: { body: "Write your message here.", align: "left" } },
    {
      id: "b6",
      type: "image",
      props: {
        url: "https://cdn.example.com/photo.jpg",
        alt: "SWFL sunset",
        caption: "Cape Coral, FL",
      },
    },
    {
      id: "b7",
      type: "agent-card",
      props: {
        name: "Jane Smith",
        title: "Realtor®",
        bio: "10-year SWFL specialist.",
        phone: "239-555-0100",
        ctaLabel: "Contact Jane",
        ctaUrl: "https://example.com",
      },
    },
    {
      id: "b8",
      type: "button",
      props: { label: "View Full Report", url: "https://example.com/report", bgColor: "#3DC9C0" },
    },
    { id: "b9", type: "divider", props: { color: "#E5E7EB" } },
    {
      id: "b10",
      type: "footer",
      props: {
        companyName: "SWFL Data Gulf",
        address: "123 Main St, Fort Myers, FL 33901",
        websiteUrl: "https://swfldatagulf.com",
      },
    },
  ],
};

describe("EmailDocEmail renderer (Task 20 acceptance)", () => {
  it("renders all 10 block types to a non-empty HTML document without throwing", async () => {
    const html = await render(EmailDocEmail({ doc: ALL_BLOCKS_DOC }));
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toMatch(/<html/i);
    expect(html).toMatch(/<body/i);
  });

  it("block content from all 10 types appears in the rendered HTML", async () => {
    const html = await render(EmailDocEmail({ doc: ALL_BLOCKS_DOC }));
    // header
    expect(html).toContain("SWFL Data Gulf");
    expect(html).toContain("Gulf Coast Intel");
    // hero
    expect(html).toContain("Market Spotlight");
    expect(html).toContain("$485K");
    expect(html).toContain("Median Sale Price");
    // stats
    expect(html).toContain("34");
    expect(html).toContain("Median DOM");
    // signal
    expect(html).toContain("Signal to Watch");
    expect(html).toContain("Inventory ticking up");
    // text
    expect(html).toContain("Write your message here.");
    // image
    expect(html).toContain("SWFL sunset");
    expect(html).toContain("Cape Coral, FL");
    // agent-card
    expect(html).toContain("Jane Smith");
    expect(html).toContain("Realtor®");
    // button
    expect(html).toContain("View Full Report");
    // footer — company name shared with header; websiteUrl is distinct
    expect(html).toContain("swfldatagulf.com");
  });

  it("globalStyle backdropColor is applied to the output", async () => {
    const html = await render(EmailDocEmail({ doc: ALL_BLOCKS_DOC }));
    expect(html).toContain("#F8F8F8");
  });

  it("preview text appears in the output when provided", async () => {
    const html = await render(
      EmailDocEmail({ doc: ALL_BLOCKS_DOC, preview: "Unique preview sentinel abc123" }),
    );
    expect(html).toContain("Unique preview sentinel abc123");
  });

  it("every seed doc renders without throwing", async () => {
    for (const seed of SEED_DOCS) {
      const doc = seed.build();
      const html = await render(EmailDocEmail({ doc }));
      expect(html.length).toBeGreaterThan(100);
    }
  });
});
