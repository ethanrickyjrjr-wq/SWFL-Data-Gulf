import { describe, expect, it } from "bun:test";
import { auditDocLinks, applyLinkFallbacks, subjectListingUrl } from "./link-audit";
import type { EmailDoc } from "./doc/types";

const style = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS" as const,
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};

const doc = (blocks: EmailDoc["blocks"]): EmailDoc => ({ globalStyle: style, blocks });

describe("auditDocLinks — click-promising slots only", () => {
  it("flags a labeled button with no url; ignores an unlabeled one", () => {
    const asks = auditDocLinks(
      doc([
        { id: "b1", type: "button", props: { label: "View Report", url: "" } },
        { id: "b2", type: "button", props: {} },
        { id: "b3", type: "button", props: { label: "Go", url: "https://x.com" } },
      ]),
    );
    expect(asks).toEqual([{ blockId: "b1", blockType: "button", label: "View Report" }]);
  });

  it("flags a listing card without linkUrl and a column with linkLabel but no linkUrl", () => {
    const asks = auditDocLinks(
      doc([
        { id: "l1", type: "listing", props: { price: "$500,000" } },
        {
          id: "m1",
          type: "multi-column",
          props: { columns: [{ heading: "A", linkLabel: "See more" }, { heading: "B" }] },
        },
      ]),
    );
    expect(asks).toEqual([
      { blockId: "l1", blockType: "listing", label: "$500,000" },
      { blockId: "m1", blockType: "multi-column", label: "See more", columnIndex: 0 },
    ]);
  });

  it("never flags decorative wrap-link slots", () => {
    const asks = auditDocLinks(
      doc([
        { id: "h1", type: "hero", props: { value: "$500K" } },
        { id: "t1", type: "text", props: { body: "hello" } },
        { id: "i1", type: "image", props: { url: "https://img" } },
      ]),
    );
    expect(asks).toEqual([]);
  });
});

describe("applyLinkFallbacks — ladder order, never dead-ends", () => {
  const needy = doc([{ id: "b1", type: "button", props: { label: "View", url: "" } }]);

  it("listing → website → reply → hosted, first available rung wins", () => {
    const full = applyLinkFallbacks(needy, {
      listingUrl: "https://www.realtor.com/realestateandhomes-detail/x_M1-2",
      brandWebsiteUrl: "https://agent.com",
      replyMailto: "mailto:a@b.com",
      hostedUrl: "https://www.swfldatagulf.com/p/abc",
    });
    expect(full.applied).toEqual([
      {
        blockId: "b1",
        url: "https://www.realtor.com/realestateandhomes-detail/x_M1-2",
        rung: "listing",
      },
    ]);
    const hostedOnly = applyLinkFallbacks(needy, {
      hostedUrl: "https://www.swfldatagulf.com/p/abc",
    });
    expect(hostedOnly.applied[0]).toEqual({
      blockId: "b1",
      url: "https://www.swfldatagulf.com/p/abc",
      rung: "hosted",
    });
    const b = hostedOnly.doc.blocks[0] as { props: { url?: string } };
    expect(b.props.url).toBe("https://www.swfldatagulf.com/p/abc");
  });

  it("fills a listing card and a multi-column label too", () => {
    const res = applyLinkFallbacks(
      doc([
        { id: "l1", type: "listing", props: { price: "$500,000" } },
        {
          id: "m1",
          type: "multi-column",
          props: { columns: [{ heading: "A", linkLabel: "See more" }, { heading: "B" }] },
        },
      ]),
      { brandWebsiteUrl: "https://agent.com" },
    );
    expect(res.applied).toEqual([
      { blockId: "l1", url: "https://agent.com", rung: "website" },
      { blockId: "m1", url: "https://agent.com", rung: "website", columnIndex: 0 },
    ]);
    const listing = res.doc.blocks[0] as { props: { linkUrl?: string } };
    expect(listing.props.linkUrl).toBe("https://agent.com");
    const col = (res.doc.blocks[1] as { props: { columns: { linkUrl?: string }[] } }).props.columns;
    expect(col[0].linkUrl).toBe("https://agent.com");
    expect(col[1].linkUrl).toBeUndefined();
  });

  it("no rungs at all → doc unchanged, applied empty (cron logs it, send proceeds)", () => {
    const res = applyLinkFallbacks(needy, {});
    expect(res.applied).toEqual([]);
    expect(res.doc).toEqual(needy);
  });

  it("is a no-op on a fully linked doc", () => {
    const linked = doc([
      { id: "b1", type: "button", props: { label: "View", url: "https://x.com" } },
    ]);
    expect(applyLinkFallbacks(linked, { hostedUrl: "https://h" }).applied).toEqual([]);
  });
});

describe("subjectListingUrl", () => {
  it("reads the listing card's link, else the hero photo's link", () => {
    expect(
      subjectListingUrl(doc([{ id: "l1", type: "listing", props: { linkUrl: "https://l" } }])),
    ).toBe("https://l");
    expect(
      subjectListingUrl(
        doc([
          {
            id: "i1",
            type: "image",
            props: { url: "https://p", kind: "photo", linkUrl: "https://src" },
          },
        ]),
      ),
    ).toBe("https://src");
    expect(subjectListingUrl(doc([]))).toBeNull();
  });
});
