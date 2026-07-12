// ListItem.linkUrl → a trailing "View →" anchor on the row. Engine/user-owned
// like every link field; the AI patch has no path to it (schema strip mode).
import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { render } from "@react-email/components";
import { ListBlock } from "./ListBlock";
import type { EmailGlobalStyle } from "../doc/types";

const HOUSE: EmailGlobalStyle = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};

describe("ListBlock row links", () => {
  it("renders a View → link when the item carries linkUrl", async () => {
    const html = await render(
      createElement(ListBlock, {
        props: {
          items: [{ lead: "$450,000", text: "125 Main St", linkUrl: "https://example.com/l" }],
        },
        globalStyle: HOUSE,
      }),
    );
    expect(html).toContain('href="https://example.com/l"');
    expect(html).toContain("View →");
  });

  it("renders no anchor when linkUrl is absent", async () => {
    const html = await render(
      createElement(ListBlock, {
        props: { items: [{ text: "125 Main St" }] },
        globalStyle: HOUSE,
      }),
    );
    expect(html).not.toContain("<a");
  });
});
