// lib/email/blocks/editable-adoption.test.tsx
//
// Per-block contract: WHICH paths are editable on the canvas, and that the
// server render (no edit prop) carries zero edit artifacts. Grows with each
// adoption task; the `sources` block is pinned NEVER-editable here.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockRenderer } from "./BlockRenderer";
import type { EmailBlock, EmailGlobalStyle } from "../doc/types";

const GS: EmailGlobalStyle = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};
const EDIT = { commit: () => {} };

function pathsIn(block: EmailBlock): string[] {
  const html = renderToStaticMarkup(<BlockRenderer block={block} globalStyle={GS} edit={EDIT} />);
  return [...html.matchAll(/data-edit-path="([^"]+)"/g)].map((m) => m[1]);
}
function serverHtml(block: EmailBlock): string {
  return renderToStaticMarkup(<BlockRenderer block={block} globalStyle={GS} />);
}
function expectClean(block: EmailBlock) {
  const html = serverHtml(block).toLowerCase();
  expect(html).not.toContain("contenteditable");
  expect(html).not.toContain("data-edit-path");
  expect(html).not.toContain("data-placeholder");
}

describe("hero block", () => {
  const b: EmailBlock = {
    id: "h1",
    type: "hero",
    props: { kicker: "K", value: "$485K", label: "L", prose: "P" },
  };
  it("canvas paths", () => expect(pathsIn(b)).toEqual(["kicker", "value", "label", "prose"]));
  it("server clean", () => expectClean(b));
});

describe("signal block", () => {
  const b: EmailBlock = {
    id: "sg1",
    type: "signal",
    props: { kicker: "K", title: "T", body: "B" },
  };
  it("canvas paths", () => expect(pathsIn(b)).toEqual(["kicker", "title", "body"]));
  it("server clean", () => expectClean(b));
});

describe("stats block", () => {
  const b: EmailBlock = {
    id: "st1",
    type: "stats",
    props: {
      stats: [
        { value: "34", label: "DOM" },
        { value: "3.2", label: "Supply" },
      ],
    },
  };
  it("canvas paths (side-by-side)", () =>
    expect(pathsIn(b)).toEqual([
      "stats.0.value",
      "stats.0.label",
      "stats.1.value",
      "stats.1.label",
    ]));
  it("server clean", () => expectClean(b));
});

describe("list block", () => {
  const b: EmailBlock = {
    id: "l1",
    type: "list",
    props: {
      title: "Events",
      items: [{ lead: "JUL 12 ·", text: "Open house", linkUrl: "https://x.test" }],
    },
  };
  it("canvas paths", () => expect(pathsIn(b)).toEqual(["title", "items.0.lead", "items.0.text"]));
  it("server clean", () => expectClean(b));
});

describe("multi-column block", () => {
  const b: EmailBlock = {
    id: "mc1",
    type: "multi-column",
    props: { columns: [{ heading: "H", body: "B", linkUrl: "https://x.test", linkLabel: "More" }] },
  };
  it("canvas paths", () =>
    expect(pathsIn(b)).toEqual(["columns.0.heading", "columns.0.body", "columns.0.linkLabel"]));
  it("server: link label text unchanged", () => expect(serverHtml(b)).toContain("More →"));
  it("server clean", () => expectClean(b));
});

describe("listing block", () => {
  const b: EmailBlock = {
    id: "li1",
    type: "listing",
    props: {
      badge: "Just Sold",
      price: "$485K",
      beds: "3",
      baths: "2",
      sqft: "1,850",
      address: "123 Main St",
    },
  };
  it("canvas paths", () =>
    expect(pathsIn(b)).toEqual(["badge", "price", "beds", "baths", "sqft", "address"]));
  it("server: specs line stays the joined string", () => {
    expect(serverHtml(b)).toContain("3 bd   ·   2 ba   ·   1,850 sqft");
  });
  it("server clean", () => expectClean(b));
});

describe("metric-card block", () => {
  const b: EmailBlock = {
    id: "m1",
    type: "metric-card",
    props: {
      metricValue: "$495K",
      metricLabel: "Median",
      sub: "90-day",
      rankText: "#2 of 54",
      movementText: "↑ 6.8% YoY",
    },
  };
  it("canvas paths", () =>
    expect(pathsIn(b)).toEqual(["metricValue", "metricLabel", "sub", "rankText", "movementText"]));
  it("server: captions stay joined", () =>
    expect(serverHtml(b)).toContain("#2 of 54  ·  ↑ 6.8% YoY"));
  it("server clean", () => expectClean(b));
});

describe("header block", () => {
  const b: EmailBlock = {
    id: "hd1",
    type: "header",
    props: { companyName: "Acme", tagline: "Tag" },
  };
  it("canvas paths", () => expect(pathsIn(b)).toEqual(["companyName", "tagline"]));
  it("server clean", () => expectClean(b));
});

describe("button block", () => {
  const linked: EmailBlock = {
    id: "bt1",
    type: "button",
    props: { label: "Book", url: "https://x.test" },
  };
  const bare: EmailBlock = { id: "bt2", type: "button", props: { label: "Book" } };
  it("canvas: label editable in both variants", () => {
    expect(pathsIn(linked)).toEqual(["label"]);
    expect(pathsIn(bare)).toEqual(["label"]);
  });
  it("server: label passes through as Button's own children (no extra wrapper)", () => {
    // react-email's Button always wraps its children in its own styled span —
    // the bare-mode EditableText hands it the raw string exactly as before.
    expect(serverHtml(linked)).toContain(">Book</span>");
  });
  it("server clean", () => expectClean(linked));
});

describe("footer block", () => {
  const b: EmailBlock = {
    id: "f1",
    type: "footer",
    props: {
      companyName: "Acme",
      address: "1 Main St",
      phone: "239-555-0100",
      unsubscribeUrl: "https://x.test/u",
    },
  };
  it("canvas paths", () => expect(pathsIn(b)).toEqual(["companyName", "address", "phone"]));
  it("server clean", () => expectClean(b));
});

describe("image block", () => {
  const cap: EmailBlock = {
    id: "i1",
    type: "image",
    props: { url: "https://x.test/p.jpg", caption: "Cape Coral" },
  };
  const ovl: EmailBlock = {
    id: "i2",
    type: "image",
    props: { url: "https://x.test/p.jpg", overlayTitle: "T", overlayBody: "B" },
  };
  it("caption path", () => expect(pathsIn(cap)).toEqual(["caption"]));
  it("overlay paths", () => expect(pathsIn(ovl)).toEqual(["overlayTitle", "overlayBody"]));
  it("server clean", () => expectClean(cap));
});

describe("agent blocks", () => {
  const card: EmailBlock = {
    id: "a1",
    type: "agent-card",
    props: {
      name: "N",
      title: "T",
      bio: "B",
      phone: "P",
      ctaLabel: "Call",
      ctaUrl: "https://x.test",
    },
  };
  const hero: EmailBlock = {
    id: "a2",
    type: "agent-hero",
    props: {
      name: "N",
      designation: "D",
      tagline: "TL",
      ctaLabel: "Call",
      ctaUrl: "https://x.test",
    },
  };
  it("agent-card paths", () =>
    expect(pathsIn(card)).toEqual(["name", "title", "bio", "phone", "ctaLabel"]));
  it("agent-hero paths", () =>
    expect(pathsIn(hero)).toEqual(["name", "designation", "tagline", "ctaLabel"]));
  it("server clean", () => expectClean(card));
});

describe("sources block — NEVER editable (provenance carve-out)", () => {
  const b: EmailBlock = {
    id: "src1",
    type: "sources",
    props: { sources: [{ url: "https://x.test", label: "Source" }], note: "refreshed nightly" },
  };
  it("no canvas paths even with edit scope", () => expect(pathsIn(b)).toEqual([]));
});

describe("text block", () => {
  const b: EmailBlock = { id: "t1", type: "text", props: { body: "Hello", align: "left" } };
  it("canvas: body is editable", () => expect(pathsIn(b)).toEqual(["body"]));
  it("canvas: empty body still renders an editable placeholder node", () => {
    expect(pathsIn({ id: "t2", type: "text", props: {} })).toEqual(["body"]);
  });
  it("server: clean", () => expectClean(b));
  it("server: empty body renders nothing (parity with today)", () => {
    expect(serverHtml({ id: "t2", type: "text", props: {} })).not.toContain("<p");
  });
});
