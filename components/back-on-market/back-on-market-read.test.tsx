// components/back-on-market/back-on-market-read.test.tsx
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import BackOnMarketRead from "./BackOnMarketRead";
import type { BackOnMarketZip } from "@/lib/back-on-market/load-zip";

const data: BackOnMarketZip = {
  zip: "33904",
  place: "Cape Coral",
  cancellationRatePct: 14.2,
  relistRatePct: 6.1,
  delistRatePct: 11.8,
  stressScore: 71,
  asOf: "03/01/2026",
  source: { label: "Redfin Data Center", url: "https://www.redfin.com/news/data-center/" },
};

test("renders the local rate, the as-of date, and never the word stigmatized", () => {
  const html = renderToStaticMarkup(<BackOnMarketRead data={data} />);
  expect(html).toContain("14.2");
  expect(html).toContain("03/01/2026");
  expect(html).toContain("Cape Coral");
  expect(html.toLowerCase()).not.toContain("stigmatiz");
});

test("renders the cited national frame value", () => {
  const html = renderToStaticMarkup(<BackOnMarketRead data={data} />);
  expect(html).toContain("13.6");
  expect(html).toContain("Redfin");
});

test("a suppressed ZIP shows the neutral truth without a fabricated rate", () => {
  const html = renderToStaticMarkup(
    <BackOnMarketRead
      data={{ ...data, cancellationRatePct: null, relistRatePct: null, delistRatePct: null }}
    />,
  );
  expect(html.toLowerCase()).toContain("no fault of");
  expect(html).not.toContain("14.2");
});
