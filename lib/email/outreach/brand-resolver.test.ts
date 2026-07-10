// lib/email/outreach/brand-resolver.test.ts
import { describe, expect, test } from "bun:test";
import type { BrandEnrichment } from "@/lib/prospects/enrich-brand";
import type { BrandFixture } from "./brand-fixtures";
import { makeFixtureFirstEnrich } from "./brand-resolver";

const FX = (
  over: Partial<BrandFixture["brand"]> = {},
  domain = "john-r-wood.com",
): BrandFixture => ({
  slug: "john-r-wood",
  company_name: "John R. Wood Properties",
  domain,
  brand: {
    status: "crawled",
    palette: { primaryColor: "#219653", accentColor: "#FFCA00" },
    confidence: 0.85,
    logo_url: "https://johnrwood.com/logo.png",
    source_url: "https://johnrwood.com",
    ...over,
  },
});

const scrapeResult = (confidence: number): BrandEnrichment => ({
  primary: "#111111",
  secondary: "#222222",
  logo_url: "https://scraped/logo.png",
  confidence,
  source: "direct-scrape+haiku",
  company_name: "Scraped Name",
});

function liveStub(result: BrandEnrichment) {
  const calls: string[] = [];
  const fn = async (domain: string) => {
    calls.push(domain);
    return result;
  };
  return { fn, calls };
}

describe("makeFixtureFirstEnrich", () => {
  test("high-confidence fixture wins WITHOUT calling the live scrape", async () => {
    const live = liveStub(scrapeResult(0.9));
    const enrich = makeFixtureFirstEnrich({ fixtures: [FX()], liveEnrich: live.fn });
    const r = await enrich("john-r-wood.com");
    expect(r.source).toBe("fixture:john-r-wood");
    expect(r.primary).toBe("#219653");
    expect(r.secondary).toBe("#FFCA00");
    expect(r.company_name).toBe("John R. Wood Properties");
    expect(r.confidence).toBe(0.85);
    expect(live.calls.length).toBe(0); // no scrape spend when the fixture is trusted
  });

  test("domain matching is normalized (www./scheme/case/path)", async () => {
    const live = liveStub(scrapeResult(0.9));
    const enrich = makeFixtureFirstEnrich({ fixtures: [FX()], liveEnrich: live.fn });
    const r = await enrich("https://WWW.John-R-Wood.com/agents");
    expect(r.source).toBe("fixture:john-r-wood");
  });

  test("low-confidence fixture: scrape runs and a trusted scrape wins", async () => {
    const live = liveStub(scrapeResult(0.8));
    const enrich = makeFixtureFirstEnrich({
      fixtures: [FX({ status: "api", confidence: 0.6 })],
      liveEnrich: live.fn,
    });
    const r = await enrich("john-r-wood.com");
    expect(r.source).toBe("direct-scrape+haiku");
    expect(live.calls).toEqual(["john-r-wood.com"]);
  });

  test("low-confidence fixture still beats a WEAKER scrape", async () => {
    const live = liveStub(scrapeResult(0.2));
    const enrich = makeFixtureFirstEnrich({
      fixtures: [FX({ status: "api", confidence: 0.6 })],
      liveEnrich: live.fn,
    });
    const r = await enrich("john-r-wood.com");
    expect(r.source).toBe("fixture:john-r-wood");
    expect(r.confidence).toBe(0.6);
  });

  test("no fixture → exact live pass-through (byte parity tripwire)", async () => {
    const result = scrapeResult(0.3);
    const live = liveStub(result);
    const enrich = makeFixtureFirstEnrich({ fixtures: [], liveEnrich: live.fn });
    const r = await enrich("unknown.com");
    expect(r).toEqual(result); // identical object content — resolver adds nothing
    expect(live.calls).toEqual(["unknown.com"]);
  });

  test("fixture without a domain never matches", async () => {
    const fx = FX();
    delete fx.domain;
    const live = liveStub(scrapeResult(0.9));
    const enrich = makeFixtureFirstEnrich({ fixtures: [fx], liveEnrich: live.fn });
    const r = await enrich("john-r-wood.com");
    expect(r.source).toBe("direct-scrape+haiku");
  });
});
