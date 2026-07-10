// lib/email/insiders/author.test.ts — mock mode only; no key, no spend, ever.
import { describe, expect, test } from "bun:test";
import { authorIssue, estimatePassUsd, liveAuthoringEnabled } from "./author";
import type { IssueDossier } from "./dossier";
import { IssueDocSchema } from "./schema";

const DOSSIER: IssueDossier = {
  month: "2026-07",
  asOf: "07/10/2026",
  masterOutputMd: "Direction: cooling. Median value $412,000.",
  brainOutputs: [{ slug: "permits-swfl", outputMd: "Permits fell 12.5% YoY." }],
  news: [
    {
      headline: "Impact fees jump",
      url: "https://example.com/fees",
      publishedAt: "2026-07-03",
      summary: "Fees rise to $9,800 per unit.",
      deskWeight: 5,
      deskWhy: "cost shock",
      seriesHint: "permits YoY by ZIP",
    },
  ],
  deskOk: true,
  anchors: ["412,000", "12.5%", "$9,800"],
  chartMenu: ["permits YoY by ZIP", "median home value trend", "tourism occupancy trend"],
  playbookMd: "stub",
};

describe("liveAuthoringEnabled (the belt: BOTH a key and the flag)", () => {
  test("mocked client (no key) → never live, even with the flag", () => {
    expect(liveAuthoringEnabled({ INSIDERS_LIVE_AUTHOR: "1" } as NodeJS.ProcessEnv, true)).toBe(
      false,
    );
  });
  test("key present but flag unset → not live (a key in env can't spend by accident)", () => {
    expect(liveAuthoringEnabled({} as NodeJS.ProcessEnv, false)).toBe(false);
  });
  test("key + flag → live", () => {
    expect(liveAuthoringEnabled({ INSIDERS_LIVE_AUTHOR: "1" } as NodeJS.ProcessEnv, false)).toBe(
      true,
    );
  });
});

describe("estimatePassUsd", () => {
  test("labeled estimate: chars/4 tokens at $10/MTok in + a 40K-token out budget at $50/MTok", () => {
    // 1M chars ≈ 250K tokens → $2.50 in; out budget $2.00 → $4.50
    expect(estimatePassUsd(1_000_000)).toBeCloseTo(4.5, 2);
  });
});

describe("authorIssue (mock mode — the test env has no key)", () => {
  test("returns the deterministic fixture with an empty ledger", async () => {
    const r = await authorIssue(DOSSIER);
    expect(r.servedBy).toEqual(["mock"]);
    expect(r.passes).toEqual(["draft"]);
    expect(r.ledger).toEqual([]);
    expect(r.doc.issue_slug).toBe("2026-07");
    expect(r.doc.as_of).toBe("07/10/2026");
  });

  test("the mock parses under IssueDocSchema (the same bar a live doc must clear)", async () => {
    const r = await authorIssue(DOSSIER);
    expect(IssueDocSchema.safeParse(r.doc).success).toBe(true);
  });
});
