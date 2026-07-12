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
