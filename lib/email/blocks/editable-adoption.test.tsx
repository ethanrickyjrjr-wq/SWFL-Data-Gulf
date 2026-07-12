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
