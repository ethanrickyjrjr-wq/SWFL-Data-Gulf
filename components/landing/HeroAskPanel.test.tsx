// components/landing/HeroAskPanel.test.tsx
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { HeroAskPanel } from "./HeroAskPanel";

describe("HeroAskPanel", () => {
  it("renders nothing before a question is asked", () => {
    const html = renderToStaticMarkup(
      createElement(HeroAskPanel, { question: null, answer: "", streaming: false, error: null }),
    );
    expect(html).toBe("");
  });

  it("shows a working state while streaming", () => {
    const html = renderToStaticMarkup(
      createElement(HeroAskPanel, {
        question: "Is Naples inventory rising?",
        answer: "",
        streaming: true,
        error: null,
      }),
    );
    expect(html).toContain("Reading the live data");
  });

  it("renders the streamed answer and a keep-going link to /ask", () => {
    const html = renderToStaticMarkup(
      createElement(HeroAskPanel, {
        question: "Is Naples inventory rising?",
        answer: "Inventory in Naples rose to 4,100 active listings.",
        streaming: false,
        error: null,
      }),
    );
    expect(html).toContain("Inventory in Naples rose");
    expect(html).toContain("/ask?q=Is%20Naples%20inventory%20rising%3F");
    expect(html).toContain("Keep going");
  });

  it("fails toward a working page: error still offers the /ask door", () => {
    const html = renderToStaticMarkup(
      createElement(HeroAskPanel, {
        question: "hello",
        answer: "",
        streaming: false,
        error: "Something went wrong.",
      }),
    );
    expect(html).toContain("Something went wrong.");
    expect(html).toContain("/ask?q=hello");
  });
});
