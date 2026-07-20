// lib/email/blocks/sources-block.test.tsx — pins the two faces of SourcesBlock.
//
// EMAIL face (emailRender): Gmail replaces <details>/<summary> with <u></u>
// (caniemail, verified 07/19/2026), so the sent HTML must never rely on the
// accordion staying closed — it renders ONE compact "Sources (N)" line, linking
// to viewAllUrl when present. CANVAS face: the native <details> accordion,
// closed by default (no `open` attribute) — the operator's everywhere-rule.
import { describe, expect, it } from "bun:test";
import { render } from "@react-email/render";
import { SourcesBlock } from "./SourcesBlock";
import { DEFAULT_GLOBAL_STYLE } from "../doc/default-docs";
import type { SourcesProps } from "../doc/types";

const MANY: SourcesProps = {
  sources: [
    { label: "SWFL Data Gulf listings data" },
    { label: "Realtor.com monthly ZIP data" },
    { label: "Lee County permits" },
    { label: "Collier County parcels" },
    { label: "FEMA flood zones" },
  ],
  note: "Every figure above comes straight from the source cited.",
};

describe("SourcesBlock email face (Gmail-safe)", () => {
  it("renders a compact view-all line, no <details>, when viewAllUrl is set", async () => {
    const html = await render(
      <SourcesBlock
        props={{
          ...MANY,
          viewAllUrl: "https://www.swfldatagulf.com/r/zip-report/33908#section-sources",
        }}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        emailRender
      />,
    );
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<summary");
    expect(html).toContain("Sources (");
    expect(html).toContain("5");
    expect(html).toContain("https://www.swfldatagulf.com/r/zip-report/33908#section-sources");
    // Individual labels stay web-side — the email carries the count + link only.
    expect(html).not.toContain("FEMA flood zones");
  });

  it("falls back to a one-line capped label list when there is no viewAllUrl", async () => {
    const html = await render(
      <SourcesBlock props={MANY} globalStyle={DEFAULT_GLOBAL_STYLE} emailRender />,
    );
    expect(html).not.toContain("<details");
    expect(html).toContain("SWFL Data Gulf listings data");
    expect(html).toContain("+ 2 more");
    expect(html).not.toContain("FEMA flood zones"); // beyond the cap
  });
});

describe("SourcesBlock canvas face", () => {
  it("keeps the closed <details> accordion with the full list", async () => {
    const html = await render(<SourcesBlock props={MANY} globalStyle={DEFAULT_GLOBAL_STYLE} />);
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("FEMA flood zones");
  });
});
