import { describe, expect, it } from "bun:test";
import { LINK_PROP, COLOR_PROP } from "./block-edit-maps";

describe("block edit maps", () => {
  it("link prop names match the doc contract", () => {
    expect(LINK_PROP.button).toBe("url");
    expect(LINK_PROP["agent-hero"]).toBe("ctaUrl");
    expect(LINK_PROP.text).toBe("linkUrl");
    expect(LINK_PROP.sources).toBeUndefined();
    expect(LINK_PROP.footer).toBeUndefined();
  });
  it("color prop prefers bgColor where the type paints a box", () => {
    expect(COLOR_PROP.header).toBe("bgColor");
    expect(COLOR_PROP.signal).toBe("bgColor");
    expect(COLOR_PROP.text).toBe("sectionBg");
    expect(COLOR_PROP.divider).toBeUndefined();
  });
});
