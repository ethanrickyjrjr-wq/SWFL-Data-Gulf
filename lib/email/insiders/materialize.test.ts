// lib/email/insiders/materialize.test.ts — charts injected, renderer REAL.
import { describe, expect, test } from "bun:test";
import type { ChartForQuestion } from "@/lib/assistant/chart-for-question";
import type { IssueDossier } from "./dossier";
import { materializeIssue, type ChartFn, type ChartImageFn } from "./materialize";
import { FIXTURE_ISSUE_DOC } from "./schema";
import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";

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
    {
      headline: "Occupancy slips",
      url: "https://example.com/occ",
      publishedAt: "2026-07-05",
      summary: "June occupancy was soft.",
    },
  ],
  deskOk: true,
  anchors: ["$412,000", "12.5%", "$9,800"],
  chartMenu: ["permits YoY by ZIP", "median home value trend", "tourism occupancy trend"],
  playbookMd: "stub",
};

const cfq = (title: string, note: string): ChartForQuestion =>
  ({ chart: { title } as ChartForQuestion["chart"], groundingNote: note }) as ChartForQuestion;

const chartFn: ChartFn = async (question) => {
  if (question.includes("permits")) return cfq("Permits YoY", "Permits fell 12.5% YoY (held)");
  if (question.includes("median")) return cfq("Median value", "Occupancy hit 61.4% in June");
  return null; // tourism → nothing chartable
};

const imageFn: ChartImageFn = async (_spec, _accent, key) => ({
  url: `https://cdn.example.com/${key}.png`,
  alt: "chart",
  caption: "cap",
});

const OPTS = { origin: "https://www.swfldatagulf.com", slug: "2026-07", chartFn, imageFn };

describe("materializeIssue", () => {
  test("resolves real charts, drops unchartable requests with a warning, renders html", async () => {
    const doc = FIXTURE_ISSUE_DOC(DOSSIER);
    const r = await materializeIssue(doc, DOSSIER, OPTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.charts).toBe(2);
    expect(r.warnings.some((w) => w.includes("chart dropped"))).toBe(true);
    expect(r.html).toContain("cdn.example.com/insiders-2026-07-0.png");
  });

  test("a figure present only in a chart grounding note anchors (chart figures are citable)", async () => {
    const doc = FIXTURE_ISSUE_DOC(DOSSIER);
    doc.the_read[1] = `Occupancy hit 61.4% in June [${doc.sources.length}].`;
    const r = await materializeIssue(doc, DOSSIER, OPTS);
    expect(r.ok).toBe(true);
  });

  test("an unanchored figure BLOCKS — no html, violations named", async () => {
    const doc = FIXTURE_ISSUE_DOC(DOSSIER);
    doc.the_read[1] = `Prices rose 14.7% this month [${doc.sources.length}].`;
    const r = await materializeIssue(doc, DOSSIER, OPTS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.blocked.join(" ")).toContain("14.7%");
  });

  test("html states the as-of date exactly once, lists sources, carries the unsubscribe token", async () => {
    const doc = FIXTURE_ISSUE_DOC(DOSSIER);
    const r = await materializeIssue(doc, DOSSIER, OPTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const asOfCount = (r.html.match(/07\/10\/2026/g) ?? []).length;
    expect(asOfCount).toBe(1);
    expect(r.html).toContain("Impact fees jump");
    expect(r.html).toContain(UNSUBSCRIBE_TOKEN);
  });
});
