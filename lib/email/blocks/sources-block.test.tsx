// lib/email/blocks/sources-block.test.tsx — pins the two faces of SourcesBlock.
//
// EMAIL face (emailRender): RENDERS NOTHING. Operator decree 08/19/2026 ("get rid
// of whatever this shit is in all emails = Sources (1): …"): no sent email carries
// a Sources/methodology line. This return-null is the one-door backstop — both
// HTML engines dispatch through BlockRenderer, so it covers every recipe, the AI
// author, the ZIP digests, and docs saved before the emitters were removed.
// CANVAS face: the native <details> accordion, closed by default (no `open`
// attribute) — kept so an old saved doc's sources block stays visible and
// deletable instead of becoming invisible dead space.
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

describe("SourcesBlock email face (decree 08/19/2026: renders NOTHING)", () => {
  it("renders nothing on the email path, even with viewAllUrl and a note", async () => {
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
    expect(html).not.toContain("Sources (");
    expect(html).not.toContain("SWFL Data Gulf listings data");
    expect(html).not.toContain("Every figure above comes straight");
    expect(html).not.toContain("<details");
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
