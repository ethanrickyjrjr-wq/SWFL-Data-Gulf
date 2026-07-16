import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ListingCampaignHero } from "./ListingCampaignHero";

describe("ListingCampaignHero", () => {
  it("captures an address when the project has none yet", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("From Teaser to Sold.");
    expect(html).toContain("Get started");
    expect(html).not.toContain("Start the listing campaign for");
  });

  it("offers to start the campaign once the address is known", () => {
    const html = renderToStaticMarkup(
      createElement(ListingCampaignHero, {
        subjectAddress: "123 Palm Ave, Fort Myers FL",
        arming: false,
        onArm: () => {},
      }),
    );
    expect(html).toContain("Start the listing campaign for 123 Palm Ave, Fort Myers FL");
    expect(html).not.toContain(">Get started<");
  });

  it("shows the arming state on the ready CTA", () => {
    const html = renderToStaticMarkup(
      createElement(ListingCampaignHero, {
        subjectAddress: "123 Palm Ave",
        arming: true,
        onArm: () => {},
      }),
    );
    expect(html).toContain("Starting…");
  });

  it("shows the real five-milestone filmstrip from the listing-to-close showcase, not invented images", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("Coming Soon");
    expect(html).toContain("New Listing");
    expect(html).toContain("Market Comps");
    expect(html).toContain("Under Contract");
    expect(html).toContain("/showcase/listing-to-close/step-1.webp");
  });

  it("names the real click-alert capability", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("real click on any piece alerts you directly");
  });

  it("names socials as coming soon, with no dead link", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("Social scheduling is coming soon");
  });
});
