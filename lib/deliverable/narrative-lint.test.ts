import { test, expect, describe } from "bun:test";
import { lintDeliverableNarrative, anchorsExactly, normalizeNumber } from "./narrative-lint";
import type { Narrative } from "./templates";

// The frozen snapshot's numbers. The narrative may ONLY use numbers that appear
// here, verbatim. These mirror real filed items: an AAL figure, a bps delta, a
// negative net-absorption, a percent, a price.
const SNAPSHOT_NUMBERS = ["$30,074", "+60bps", "−201,983", "4.8%", "$28.40", "12,000"];

function narr(overrides: Partial<Narrative>): Narrative {
  return {
    exec_summary: "Fort Myers Beach flood AAL is $30,074, up 60bps.",
    sections: [{ title: "Flood cost is the driver", intro: "AAL reached $30,074." }],
    inference_notes: [],
    ...overrides,
  };
}

describe("normalizeNumber", () => {
  test("strips $, commas, %, bps and unifies unicode minus", () => {
    expect(normalizeNumber("$30,074")).toBe("30074");
    expect(normalizeNumber("+60bps")).toBe("60");
    expect(normalizeNumber("−201,983")).toBe("-201983"); // U+2212 → ASCII minus
    expect(normalizeNumber("4.8%")).toBe("4.8");
    expect(normalizeNumber("$28.40")).toBe("28.40"); // trailing zero preserved (verbatim)
  });
});

describe("anchorsExactly — equality, NOT the 5% chart tolerance", () => {
  const anchors = new Set(["30074", "60", "-201983", "4.8", "28.40", "12000"]);
  test("exact match anchors", () => {
    expect(anchorsExactly("$30,074", anchors)).toBe(true);
  });
  test("a ~5%-off number does NOT anchor (this is the R2 guarantee)", () => {
    expect(anchorsExactly("$31,500", anchors)).toBe(false); // ~4.7% off — chart tol would pass; we must FAIL
  });
  test("a rounded/smoothed restatement does NOT anchor", () => {
    expect(anchorsExactly("$30K", anchors)).toBe(false);
    expect(anchorsExactly("28.4", anchors)).toBe(false); // 28.4 != 28.40 verbatim
  });
});

describe("number gate [LB-R2] — exec_summary + section intros", () => {
  test("flags a number with no item anchor", () => {
    const n = narr({ exec_summary: "Vacancy hit 14% last quarter." });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "number" && v.token === "14%")).toBe(true);
    expect(r.ok).toBe(false);
  });

  test("flags a ~5%-off near-miss (equality, not tolerance)", () => {
    const n = narr({ exec_summary: "Flood AAL is about $31,500." });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "number")).toBe(true);
  });

  test("passes when every number is verbatim from the snapshot", () => {
    const n = narr({
      exec_summary: "Flood AAL is $30,074, up 60bps; net absorption was −201,983.",
      sections: [{ title: "Rent context", intro: "Asking rent is $28.40 at 4.8% vacancy." }],
    });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.filter((v) => v.gate === "number")).toHaveLength(0);
  });

  test("strip() removes the whole offending sentence, not just the token", () => {
    const n = narr({
      exec_summary: "Flood AAL is $30,074. Vacancy hit 14% last quarter.",
    });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.stripped.exec_summary).toContain("$30,074");
    expect(r.stripped.exec_summary).not.toContain("14%");
  });
});

describe("smoothing gate [LB-R3] — no numeric softening / confidence translation", () => {
  test("flags 'approximately' (numeric_softening)", () => {
    const n = narr({ exec_summary: "Flood AAL is approximately $30,074." });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "smoothing")).toBe(true);
  });
  test("flags 'high confidence' (prose_confidence_translation)", () => {
    const n = narr({
      sections: [{ title: "Outlook", intro: "We have high confidence in $30,074." }],
    });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "smoothing")).toBe(true);
  });
});

describe("grounded gate [LB-R3] — forecasts are not facts", () => {
  test("flags an ungrounded forward-looking forecast in a fact location", () => {
    const n = narr({
      sections: [{ title: "Outlook", intro: "Rents will keep climbing through 2027." }],
    });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "grounded")).toBe(true);
  });

  test("an inference_note WITHOUT a falsifier is flagged", () => {
    const n = narr({
      inference_notes: ["[INFERENCE] Rents likely climb from $28.40 as vacancy tightens."],
    });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "grounded")).toBe(true);
  });

  test("an inference_note WITH a falsifier passes the grounded gate", () => {
    const n = narr({
      inference_notes: [
        "[INFERENCE] Builds on the $28.40 asking rent: IF vacancy falls below 4.8% THEN rents rise; falsifier: new pipeline > 500k sqft.",
      ],
    });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.filter((v) => v.gate === "grounded")).toHaveLength(0);
  });
});

describe("jargon gate [ADDED] — strip internal vocabulary", () => {
  for (const word of ["master", "brain", "payload", "grain", "dossier"]) {
    test(`flags + strips a planted "${word}"`, () => {
      const n = narr({
        exec_summary: `Flood AAL is $30,074. The ${word} shows the trend.`,
      });
      const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
      expect(r.violations.some((v) => v.gate === "jargon")).toBe(true);
      expect(r.stripped.exec_summary.toLowerCase()).not.toContain(word);
    });
  }
});

// Regression locks for the holes the adversarial review found (2026-06-10).
describe("adversarial hardening — closed holes stay closed", () => {
  test("words-as-numbers are flagged (spelled magnitude bypasses the numeral regex)", () => {
    const n = narr({ exec_summary: "Flood AAL is thirty-one thousand five hundred dollars." });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "number")).toBe(true);
  });

  for (const intro of [
    "Rents are on an upward trajectory across the corridor.",
    "Momentum is building and the market keeps tightening.",
    "We anticipate further increases over the coming quarters.",
  ]) {
    test(`modal-less forecast flagged: "${intro.slice(0, 28)}…"`, () => {
      const n = narr({ sections: [{ title: "Outlook", intro }] });
      const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
      expect(r.violations.some((v) => v.gate === "grounded")).toBe(true);
    });
  }

  test("jargon plural is flagged ('payloads')", () => {
    const n = narr({ exec_summary: "Flood AAL is $30,074. Two payloads landed." });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "jargon")).toBe(true);
  });

  test("year-shaped COUNT is flagged ('2025 parcels' — no temporal cue)", () => {
    const n = narr({ exec_summary: "Some 2025 parcels sit in the flood zone." });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "number" && v.token === "2025")).toBe(true);
  });

  test("a real year in temporal context still passes ('through 2027')", () => {
    const n = narr({ exec_summary: "Flood AAL of $30,074 is locked through 2027." });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.filter((v) => v.gate === "number")).toHaveLength(0);
  });

  test("falsifier substring trick is flagged ('no falsifier provided')", () => {
    const n = narr({
      inference_notes: ["[INFERENCE] Rents will moon. No falsifier provided here."],
    });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "grounded")).toBe(true);
  });

  test("inference note that cites only fabricated numbers (no anchored base) is flagged", () => {
    const n = narr({
      inference_notes: [
        "[INFERENCE] AAL could hit $99,999 next storm; falsifier: an NFIP cap revision.",
      ],
    });
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.violations.some((v) => v.gate === "number" && v.location === "inference_note")).toBe(
      true,
    );
  });
});

describe("clean narrative", () => {
  test("a fully-grounded, verbatim narrative passes with ok=true", () => {
    const n: Narrative = {
      exec_summary: "Fort Myers Beach flood AAL is $30,074, up 60bps.",
      sections: [{ title: "Rent context", intro: "Asking rent is $28.40 at 4.8% vacancy." }],
      inference_notes: [
        "[INFERENCE] Builds on $30,074 AAL: IF a Cat-3 lands THEN losses spike; falsifier: a sub-$20,000 NFIP revision.",
      ],
    };
    const r = lintDeliverableNarrative(n, SNAPSHOT_NUMBERS);
    expect(r.ok).toBe(true);
    expect(r.violations).toHaveLength(0);
  });
});

// ── recorded-claim gate (invention-surface-guards §B) ─────────────────────────
import { RECORDED_CLAIM_RE, RECORDED_LABEL_RE } from "./narrative-lint";

describe("recorded-claim gate", () => {
  const nar = (intro: string): Narrative => ({
    exec_summary: intro,
    sections: [],
    inference_notes: [],
  });

  test("'sold for $X' where X anchors only to a LIST price is a violation", () => {
    const r = lintDeliverableNarrative(
      nar("The property sold for $14,800,000 last month."),
      ["$14,800,000"], // list price IS in the snapshot…
      [], // …but nothing recorded
    );
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.gate === "recorded")).toBe(true);
    expect(r.stripped.exec_summary).toBe("");
  });

  test("'sold for $X' anchored to a recorded item passes", () => {
    const r = lintDeliverableNarrative(
      nar("The property sold for $415,000."),
      ["$415,000"],
      ["Recorded sold price: $415,000"],
    );
    expect(r.violations.filter((v) => v.gate === "recorded")).toEqual([]);
  });

  test("aggregate 'median sale price' figures pass when the item label marks them", () => {
    const r = lintDeliverableNarrative(
      nar("The median sale price in Lee County is $389,000."),
      ["$389,000"],
      ["Lee County median sale price: $389,000"],
    );
    expect(r.violations.filter((v) => v.gate === "recorded")).toEqual([]);
  });

  test("a sold COUNT sentence is not a price claim", () => {
    const r = lintDeliverableNarrative(nar("127 homes changed hands in June."), ["127"], []);
    expect(r.violations.filter((v) => v.gate === "recorded")).toEqual([]);
  });

  test("omitting the third param changes nothing (backward compat)", () => {
    const r = lintDeliverableNarrative(nar("Rents hit $2,150."), ["$2,150"]);
    expect(r.ok).toBe(true);
  });
});

describe("recorded regexes", () => {
  test("claim patterns", () => {
    expect(RECORDED_CLAIM_RE.test("it sold for $1")).toBe(true);
    expect(RECORDED_CLAIM_RE.test("closed at $1")).toBe(true);
    expect(RECORDED_CLAIM_RE.test("the sale price of")).toBe(true);
    expect(RECORDED_CLAIM_RE.test("closing price was")).toBe(true);
    expect(RECORDED_CLAIM_RE.test("listed at $1")).toBe(false);
  });
  test("label patterns", () => {
    expect(RECORDED_LABEL_RE.test("Recorded sold price")).toBe(true);
    expect(RECORDED_LABEL_RE.test("Lee County median sale price")).toBe(true);
    expect(RECORDED_LABEL_RE.test("Median list price")).toBe(false);
  });
});
