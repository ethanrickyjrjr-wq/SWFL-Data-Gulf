// Capture-or-blank additions (spec 2026-07-16-seed-capture-or-blank-design.md):
// the Start-blank escape renders only when a handler is given, and choice mode
// asks fill-vs-blank with no subject input.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AddressPopup } from "./AddressPopup";

describe("AddressPopup capture-or-blank additions", () => {
  it("renders the Start blank escape only when a handler is given", () => {
    const withEscape = renderToStaticMarkup(
      createElement(AddressPopup, {
        inputKind: "address",
        initialValue: "",
        onBuild: () => {},
        onCancel: () => {},
        onStartBlank: () => {},
      }),
    );
    const without = renderToStaticMarkup(
      createElement(AddressPopup, {
        inputKind: "address",
        initialValue: "",
        onBuild: () => {},
        onCancel: () => {},
      }),
    );
    expect(withEscape).toContain("Start blank instead");
    expect(without).not.toContain("Start blank instead");
  });

  it("choice mode: no subject input, Fill with AI primary", () => {
    const html = renderToStaticMarkup(
      createElement(AddressPopup, {
        inputKind: null,
        choiceMode: true,
        initialValue: "",
        onBuild: () => {},
        onCancel: () => {},
        onStartBlank: () => {},
      }),
    );
    expect(html).toContain("Fill with AI");
    expect(html).toContain("Fill it with your data?");
    expect(html).not.toContain("Listing address");
  });

  it("existing address mode is unchanged: Build primary, address input present", () => {
    const html = renderToStaticMarkup(
      createElement(AddressPopup, {
        inputKind: "address",
        initialValue: "123 Palm Ave",
        onBuild: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain("Build");
    expect(html).toContain("Listing address");
    expect(html).not.toContain("Fill with AI");
  });
});
