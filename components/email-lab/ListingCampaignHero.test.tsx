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

  it("renders NO old-capture imagery — the filmstrip is gone for good (operator decree 08/10/2026)", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).not.toContain("/showcase/");
    expect(html).not.toContain(".webp");
  });

  it("names the real click-alert capability", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("an alert lands in your inbox");
  });

  it("claims only the nudge triggers the decision core actually emits", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    // lib/project/lifecycle-nudge.ts: appeared / departed_holding / resolved_sold / time_elapsed.
    expect(html).toContain("It goes live, it leaves the active market, the sale is recorded");
    expect(html).toContain("two weeks after launch");
    expect(html).not.toContain("price cut"); // no price-cut nudge exists — never claim one
    expect(html).toContain("nothing fires on its own");
  });

  it("states build-time freshness, never send-time (scheduled sends are frozen)", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("fresh at build");
    expect(html).toContain("Nothing sends unseen");
  });

  it("asks for the one input we genuinely lack — the property description", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("Paste your description into the builder");
  });

  it("names socials as coming soon, with no dead link", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("Social scheduling is coming soon");
  });
});
