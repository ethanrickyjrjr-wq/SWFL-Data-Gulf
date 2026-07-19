import { describe, it, expect } from "bun:test";
import { buildShouldISellOgModel } from "./og-card";
import type { BackOnMarketZip } from "../back-on-market/load-zip";

const SCORED: BackOnMarketZip = {
  zip: "33904",
  place: "Cape Coral",
  cancellationRatePct: 20.5,
  relistRatePct: 3.1,
  delistRatePct: 18.7,
  stressScore: 62.5,
  region: {
    direction: "bearish",
    stateLabel: "under elevated seller pressure right now",
    median: 58,
  },
  area: { rank: { position: 14, total: 52 }, vsMedian: "above" },
  asOf: "03/01/2026",
  source: { label: "Redfin Data Center", url: "https://www.redfin.com/news/data-center/" },
  drivers: [{ label: "Delistings — homes pulled off the market", valuePct: 18.7 }],
  sellerCaveats: [],
  refreshedAt: "07/18/2026",
};

describe("buildShouldISellOgModel", () => {
  it("carries the score VERBATIM with rank + place on a scored read", () => {
    const m = buildShouldISellOgModel(SCORED);
    expect(m.headline).toBe("Should I sell in Cape Coral?");
    expect(m.stat?.value).toBe("62.5 / 100");
    expect(m.stat?.caption).toBe("#14 of 52 SWFL areas · Cape Coral 33904");
    expect(m.as_of).toBe("03/01/2026");
    expect(m.source).toBe("Redfin Data Center");
  });

  it("OMITS the stat block on a suppressed (unscored) ZIP — no placeholder ever", () => {
    const m = buildShouldISellOgModel({ ...SCORED, stressScore: null, area: null });
    expect(m.headline).toBe("Should I sell in Cape Coral?");
    expect(m.stat).toBeUndefined();
  });

  it("falls back to the branded generic card when the read is absent", () => {
    const m = buildShouldISellOgModel(null);
    expect(m.headline).toBe("Should I sell in Southwest Florida?");
    expect(m.stat).toBeUndefined();
    expect(m.as_of).toBeUndefined();
  });

  it("drops the rank clause when area is null but the score exists", () => {
    const m = buildShouldISellOgModel({ ...SCORED, area: null });
    expect(m.stat?.value).toBe("62.5 / 100");
    expect(m.stat?.caption).toBe("Cape Coral 33904");
  });

  it("strips the jargon tail off the citation label — watermark shows the named source only", () => {
    const m = buildShouldISellOgModel({
      ...SCORED,
      source: {
        label:
          "Redfin Data Center — price_drops, contract_cancellations, delistings_relistings ZIP-level monthly rolling-3-month data for SWFL MSAs.",
        url: "https://www.redfin.com/news/data-center/",
      },
    });
    expect(m.source).toBe("Redfin Data Center");
  });

  it("never doubles the ZIP when the loader's place fell back to the ZIP itself", () => {
    const m = buildShouldISellOgModel({ ...SCORED, place: "33904" });
    expect(m.headline).toBe("Should I sell in ZIP 33904?");
    expect(m.stat?.caption).toBe("#14 of 52 SWFL areas · ZIP 33904");
  });
});
