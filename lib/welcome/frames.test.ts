import { describe, expect, test } from "bun:test";

import {
  citationLink,
  formatMetric,
  hostDomain,
  initialWelcomeState,
  isInternalSource,
  parseFreshnessDate,
  parseSseFrame,
  reduceWelcome,
  type WelcomeAnswer,
} from "./frames";

const ANSWER: WelcomeAnswer = {
  freshness_token: "SWFL-7421-v5-20260522",
  place: { zip: "33931", name: "Fort Myers Beach, FL" },
  metrics: [
    {
      key: "flood_aal",
      label: "Flood AAL",
      value: 30074,
      display_format: "currency",
      units: "yr",
      direction: "rising",
      is_true_zip: true,
      coverage_label: "ZIP 33931",
      source: {
        domain: "fema.gov",
        url: "https://hazards.fema.gov/nri/",
        as_of: "2026-05",
        citation: "FEMA National Risk Index — expected annual flood loss",
      },
    },
  ],
};

describe("reduceWelcome", () => {
  test("starts idle", () => {
    expect(initialWelcomeState.status).toBe("idle");
    expect(initialWelcomeState.prose).toBe("");
  });

  test("submit → awaiting, captures zip, clears prior prose", () => {
    const dirty = { ...initialWelcomeState, prose: "old", error: "boom" };
    const s = reduceWelcome(dirty, { type: "submit", zip: "33931" });
    expect(s.status).toBe("awaiting");
    expect(s.zip).toBe("33931");
    expect(s.prose).toBe("");
    expect(s.error).toBeNull();
    expect(s.answer).toBeNull();
  });

  test("place frame fills place, stays awaiting", () => {
    const s0 = reduceWelcome(initialWelcomeState, { type: "submit", zip: "33931" });
    const s = reduceWelcome(s0, {
      type: "frame",
      frame: { type: "place", place: { zip: "33931", name: "Fort Myers Beach, FL" } },
    });
    expect(s.place).toEqual({ zip: "33931", name: "Fort Myers Beach, FL" });
    expect(s.status).toBe("awaiting");
  });

  test("data frame populates cards → answered, place is authoritative", () => {
    const s0 = reduceWelcome(initialWelcomeState, { type: "submit", zip: "33931" });
    const s = reduceWelcome(s0, { type: "frame", frame: { type: "data", answer: ANSWER } });
    expect(s.status).toBe("answered");
    expect(s.answer).toEqual(ANSWER);
    expect(s.place).toEqual(ANSWER.place);
  });

  test("text frames accumulate → streaming", () => {
    let s = reduceWelcome(initialWelcomeState, { type: "submit", zip: "33931" });
    s = reduceWelcome(s, { type: "frame", frame: { type: "text", text: "Fort Myers Beach " } });
    s = reduceWelcome(s, {
      type: "frame",
      frame: { type: "text", text: "is still absorbing Ian." },
    });
    expect(s.status).toBe("streaming");
    expect(s.prose).toBe("Fort Myers Beach is still absorbing Ian.");
  });

  test("done is terminal; later text does not reopen streaming", () => {
    let s = reduceWelcome(initialWelcomeState, { type: "submit", zip: "33931" });
    s = reduceWelcome(s, { type: "frame", frame: { type: "done" } });
    expect(s.status).toBe("done");
    s = reduceWelcome(s, { type: "frame", frame: { type: "text", text: "late" } });
    expect(s.status).toBe("done");
  });

  test("sources frame stores lane-3 citations without changing status", () => {
    let s = reduceWelcome(initialWelcomeState, { type: "submit", zip: "33931" });
    s = reduceWelcome(s, { type: "frame", frame: { type: "text", text: "60 days." } });
    const before = s.status;
    s = reduceWelcome(s, {
      type: "frame",
      frame: {
        type: "sources",
        sources: [
          {
            label: "Cape Coral median DOM",
            value: 60,
            url: "https://redfin.com/x",
            domain: "redfin.com",
          },
        ],
      },
    });
    expect(s.sources).toHaveLength(1);
    expect(s.sources[0]).toEqual({
      label: "Cape Coral median DOM",
      value: 60,
      url: "https://redfin.com/x",
      domain: "redfin.com",
    });
    expect(s.status).toBe(before); // order-tolerant: never disturbs the stream status
  });

  test("error frame surfaces message", () => {
    const s = reduceWelcome(initialWelcomeState, {
      type: "frame",
      frame: { type: "error", error: "upstream 500" },
    });
    expect(s.status).toBe("error");
    expect(s.error).toBe("upstream 500");
  });

  test("canonical order: submit → place → data → text → done", () => {
    let s = reduceWelcome(initialWelcomeState, { type: "submit", zip: "33931" });
    s = reduceWelcome(s, { type: "frame", frame: { type: "place", place: ANSWER.place } });
    s = reduceWelcome(s, { type: "frame", frame: { type: "data", answer: ANSWER } });
    s = reduceWelcome(s, { type: "frame", frame: { type: "text", text: "Grounded read." } });
    s = reduceWelcome(s, { type: "frame", frame: { type: "done" } });
    expect(s.status).toBe("done");
    expect(s.answer).toEqual(ANSWER);
    expect(s.prose).toBe("Grounded read.");
    expect(s.place).toEqual(ANSWER.place);
  });

  test("prose-before-cards order keeps both", () => {
    let s = reduceWelcome(initialWelcomeState, { type: "submit", zip: "33931" });
    s = reduceWelcome(s, { type: "frame", frame: { type: "text", text: "streaming first " } });
    expect(s.status).toBe("streaming");
    s = reduceWelcome(s, { type: "frame", frame: { type: "data", answer: ANSWER } });
    expect(s.status).toBe("streaming");
    expect(s.answer).toEqual(ANSWER);
    expect(s.prose).toBe("streaming first ");
  });

  test("reset returns to initial", () => {
    let s = reduceWelcome(initialWelcomeState, { type: "submit", zip: "33931" });
    s = reduceWelcome(s, { type: "reset" });
    expect(s).toEqual(initialWelcomeState);
  });
});

describe("parseSseFrame", () => {
  test("parses typed frames", () => {
    expect(parseSseFrame('data: {"type":"text","text":"hi"}')).toEqual({
      type: "text",
      text: "hi",
    });
    expect(parseSseFrame('data: {"type":"done"}')).toEqual({ type: "done" });
    expect(parseSseFrame('data: {"type":"place","place":{"zip":"33931","name":"FMB"}}')).toEqual({
      type: "place",
      place: { zip: "33931", name: "FMB" },
    });
    expect(
      parseSseFrame(
        'data: {"type":"sources","sources":[{"label":"DOM","value":60,"url":"https://redfin.com/x","domain":"redfin.com"}]}',
      ),
    ).toEqual({
      type: "sources",
      sources: [{ label: "DOM", value: 60, url: "https://redfin.com/x", domain: "redfin.com" }],
    });
  });

  test("normalizes legacy un-typed frames (parallel route's current shape)", () => {
    expect(parseSseFrame('data: {"text":"hi"}')).toEqual({ type: "text", text: "hi" });
    expect(parseSseFrame('data: {"done":true}')).toEqual({ type: "done" });
    expect(parseSseFrame('data: {"error":"boom"}')).toEqual({ type: "error", error: "boom" });
  });

  test("rejects empty, malformed, or unknown-type frames", () => {
    expect(parseSseFrame("")).toBeNull();
    expect(parseSseFrame("data: {oops")).toBeNull();
    expect(parseSseFrame('data: {"type":"mystery"}')).toBeNull();
    expect(parseSseFrame('data: {"mystery":1}')).toBeNull();
  });
});

describe("isInternalSource / citationLink (default-deny)", () => {
  test("flags raw internal sources", () => {
    expect(isInternalSource("https://abc.supabase.co/rest/v1/x")).toBe(true);
    expect(isInternalSource("s3://bucket.amazonaws.com/data_lake/x")).toBe(true);
    expect(isInternalSource("http://localhost:54321")).toBe(true);
    expect(isInternalSource("https://www.fema.gov/nri")).toBe(false);
    expect(isInternalSource(undefined)).toBe(false);
  });

  test("citationLink drops the link + masks the host for an internal source", () => {
    expect(
      citationLink({
        domain: "abc.supabase.co",
        url: "https://abc.supabase.co/x",
        as_of: "2026-05",
        citation: "raw",
      }),
    ).toEqual({ href: null, domain: "source" });
  });

  test("citationLink prefers provenance_url, else the clean source url", () => {
    expect(
      citationLink({
        domain: "fema.gov",
        url: "https://hazards.fema.gov/nri",
        as_of: "2026-05",
        citation: "FEMA NRI",
        provenance_url: "https://www.swfldatagulf.com/r/source/nfip",
      }),
    ).toEqual({ href: "https://www.swfldatagulf.com/r/source/nfip", domain: "fema.gov" });
  });
});

describe("formatMetric", () => {
  test("currency, no units → plain grouped dollars", () => {
    expect(formatMetric(825000, "currency")).toBe("$825,000");
  });
  test("currency ignores a USD units label", () => {
    expect(formatMetric(825000, "currency", "USD")).toBe("$825,000");
  });
  test("currency appends a non-USD cadence suffix", () => {
    expect(formatMetric(2650, "currency", "mo")).toBe("$2,650/mo");
    expect(formatMetric(30074, "currency", "yr")).toBe("$30,074/yr");
  });
  test("percent keeps sign + up to one decimal", () => {
    expect(formatMetric(-2.1, "percent")).toBe("-2.1%");
    expect(formatMetric(2, "percent")).toBe("2%");
  });
  test("count groups thousands, no units", () => {
    expect(formatMetric(1234, "count")).toBe("1,234");
    expect(formatMetric(18, "count", "90d")).toBe("18");
  });
  test("ratio → two decimals", () => {
    expect(formatMetric(0.984, "ratio")).toBe("0.98");
    expect(formatMetric(1.5, "ratio")).toBe("1.50");
  });
  test("raw → String()", () => {
    expect(formatMetric(7, "raw")).toBe("7");
  });
  test("categorical string passes through any format", () => {
    expect(formatMetric("Zone AE", "currency")).toBe("Zone AE");
  });
});

describe("hostDomain", () => {
  test("strips www and scheme", () => {
    expect(hostDomain("https://www.fema.gov/nri/x")).toBe("fema.gov");
    expect(hostDomain("https://redfin.com/news")).toBe("redfin.com");
  });
  test("bad url → empty string", () => {
    expect(hostDomain("not a url")).toBe("");
  });
});

describe("parseFreshnessDate", () => {
  test("extracts trailing YYYYMMDD → human date", () => {
    expect(parseFreshnessDate("SWFL-7421-v5-20260522")).toBe("May 22, 2026");
  });
  test("malformed token → null", () => {
    expect(parseFreshnessDate("SWFL-7421-v5")).toBeNull();
  });
});
