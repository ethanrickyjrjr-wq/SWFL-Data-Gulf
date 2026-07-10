// lib/email/insiders/schema.ts
//
// The IssueDoc contract — what the Fable 5 author must emit. TWO artifacts, kept
// in sync by schema.test.ts:
//   • IssueDocSchema (zod) — the runtime validator; parse-miss = the issue aborts
//     (spec: never ship a partial).
//   • ISSUE_DOC_JSON_SCHEMA — the structured-outputs schema sent as
//     output_config.format. Hand-written (zod-to-json-schema is not a dependency —
//     probed 07/10/2026) and deliberately LOOSE: structured outputs reject
//     minLength/minItems-style constraints, so counts and formats are enforced by
//     zod after parse (and stated in the authoring charge so the model aims right).
//
// The model authors PROSE + chart REQUESTS + source refs. It never emits chart
// data; every [n] in prose must resolve to sources[] (superRefine below).

import { z } from "zod";

const StorySchema = z.object({
  headline: z.string().min(1),
  what_happened: z.string().min(1),
  our_data: z.string().min(1),
  analog: z.string().min(1),
});

const ChartRequestSchema = z.object({
  question: z.string().min(8),
  why: z.string().min(1),
});

const ProjectionSchema = z.object({
  claim: z.string().min(1),
  base_source_n: z.number().int().positive(),
  falsifier: z.string().min(1),
});

const SourceRefSchema = z.object({
  n: z.number().int().positive(),
  url: z.string().regex(/^https?:\/\//, "source url must be absolute http(s)"),
  label: z.string().min(1),
});

const PROSE_REF_RE = /\[(\d+)\]/g;

export const IssueDocSchema = z
  .object({
    issue_slug: z.string().regex(/^\d{4}-\d{2}(-mini-[a-z0-9-]+)?$/),
    subject: z.string().min(8).max(120),
    as_of: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
    the_read: z.array(z.string().min(1)).min(2),
    stories: z.array(StorySchema).min(1).max(4),
    dashboard: z.array(ChartRequestSchema).min(1).max(6),
    forward_look: z.array(ProjectionSchema).min(1).max(5),
    sources: z.array(SourceRefSchema).min(1),
  })
  .superRefine((doc, ctx) => {
    // Monthly issues carry the full skeleton; -mini- slugs are cut down (Task 15).
    const isMini = doc.issue_slug.includes("-mini-");
    if (!isMini) {
      if (doc.stories.length < 2)
        ctx.addIssue({
          code: "custom",
          path: ["stories"],
          message: "monthly issue needs 2–4 stories",
        });
      if (doc.dashboard.length < 3)
        ctx.addIssue({
          code: "custom",
          path: ["dashboard"],
          message: "monthly issue needs 3–6 charts",
        });
      if (doc.forward_look.length < 2)
        ctx.addIssue({
          code: "custom",
          path: ["forward_look"],
          message: "monthly issue needs 2–5 projections",
        });
    }

    const ns = new Set<number>();
    for (const s of doc.sources) {
      if (ns.has(s.n))
        ctx.addIssue({ code: "custom", path: ["sources"], message: `duplicate source n=${s.n}` });
      ns.add(s.n);
    }

    for (const f of doc.forward_look) {
      if (!ns.has(f.base_source_n))
        ctx.addIssue({
          code: "custom",
          path: ["forward_look"],
          message: `base_source_n=${f.base_source_n} resolves to no source`,
        });
    }

    const prose = [
      ...doc.the_read,
      ...doc.stories.flatMap((s) => [s.what_happened, s.our_data, s.analog]),
      ...doc.forward_look.flatMap((f) => [f.claim, f.falsifier]),
    ].join("\n");
    for (const m of prose.matchAll(PROSE_REF_RE)) {
      const n = Number(m[1]);
      if (!ns.has(n))
        ctx.addIssue({
          code: "custom",
          path: ["sources"],
          message: `prose cites [${n}] but no source n=${n} exists`,
        });
    }
  });

export type IssueDoc = z.infer<typeof IssueDocSchema>;

/** Structured-outputs schema (output_config.format.schema). Loose by design —
 *  see file-top comment. Descriptions steer the model; zod enforces after. */
export const ISSUE_DOC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "issue_slug",
    "subject",
    "as_of",
    "the_read",
    "stories",
    "dashboard",
    "forward_look",
    "sources",
  ],
  properties: {
    issue_slug: { type: "string", description: "The issue month as YYYY-MM, exactly as given." },
    subject: { type: "string", description: "Email subject line, 8-120 characters." },
    as_of: {
      type: "string",
      description: "The as-of date MM/DD/YYYY — echo the dossier's as-of date exactly.",
    },
    the_read: {
      type: "array",
      description: "The month's lead thesis, 2+ paragraphs of plain prose.",
      items: { type: "string" },
    },
    stories: {
      type: "array",
      description: "2-4 stories (exactly 1 for a mini).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "what_happened", "our_data", "analog"],
        properties: {
          headline: { type: "string" },
          what_happened: { type: "string", description: "The news event, citing sources as [n]." },
          our_data: {
            type: "string",
            description: "What the dossier's data says about that exact area, citing [n].",
          },
          analog: {
            type: "string",
            description: "Where this pattern played out before, anywhere, with [n]-cited figures.",
          },
        },
      },
    },
    dashboard: {
      type: "array",
      description:
        "3-6 chart REQUESTS (1-2 for a mini): natural-language series asks. Never chart data.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "why"],
        properties: {
          question: { type: "string", description: "e.g. 'permits YoY by ZIP for Lee County'" },
          why: {
            type: "string",
            description: "One line: why this series tells the month's story.",
          },
        },
      },
    },
    forward_look: {
      type: "array",
      description: "2-5 projections (exactly 1 for a mini), each falsifiable.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "base_source_n", "falsifier"],
        properties: {
          claim: { type: "string" },
          base_source_n: {
            type: "integer",
            description: "The source n carrying the audited base value this projection stands on.",
          },
          falsifier: { type: "string", description: "This call dies if X." },
        },
      },
    },
    sources: {
      type: "array",
      description: "Every source cited as [n] in prose. Unique n. Real URLs only.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "url", "label"],
        properties: {
          n: { type: "integer" },
          url: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
} as const;

// ── Deterministic mock (no-key / DRY authoring) ───────────────────────────────
// The fixture issue is built ONLY from dossier content — zero free-typed figures —
// so the mocked pipeline exercises schema→materialize→lint→render for $0
// (weekly-read precedent: no API key = mocked build).

export interface FixtureDossierInput {
  month: string; // YYYY-MM
  asOf: string; // MM/DD/YYYY
  news: Array<{ headline: string; url: string; publishedAt: string; summary: string }>;
  chartMenu: string[];
}

const STANDING_CHART_QUESTIONS = [
  "median home value trend",
  "permits YoY by ZIP",
  "inventory and days-on-market trend",
];

export function FIXTURE_ISSUE_DOC(dossier: FixtureDossierInput): IssueDoc {
  const site = { url: "https://www.swfldatagulf.com/", label: "SWFL Data Gulf" };
  const newsSources = dossier.news.slice(0, 2).map((n, i) => ({
    n: i + 1,
    url: n.url,
    label: n.headline,
  }));
  const sources = [...newsSources, { n: newsSources.length + 1, ...site }];
  const lakeN = sources.length; // the SWFL Data Gulf source ref

  const storyFor = (headline: string, n: number) => ({
    headline,
    what_happened: `${headline} [${n}].`,
    our_data: `Our held series for the affected areas provide the base context [${lakeN}].`,
    analog: `A comparable pattern is on record elsewhere; the analog rides the cited source [${n}].`,
  });

  const stories = [
    storyFor(dossier.news[0]?.headline ?? "Placeholder story one (mock)", 1),
    storyFor(
      dossier.news[1]?.headline ?? "Placeholder story two (mock)",
      dossier.news.length >= 2 ? 2 : 1,
    ),
  ];

  const questions = [...dossier.chartMenu, ...STANDING_CHART_QUESTIONS].slice(0, 3);

  return {
    issue_slug: dossier.month,
    subject: "Insiders Edition (mock draft)",
    as_of: dossier.asOf,
    the_read: [
      "This is the deterministic mock issue — the real thesis is authored live.",
      `Every figure in a live issue anchors to held data; this mock states none [${lakeN}].`,
    ],
    stories,
    dashboard: questions.map((question) => ({
      question,
      why: "mock chart request from the dossier's chart menu",
    })),
    forward_look: [
      {
        claim: "Mock projection one — replaced by live authoring.",
        base_source_n: lakeN,
        falsifier: "This mock never ships; a live issue replaces it.",
      },
      {
        claim: "Mock projection two — replaced by live authoring.",
        base_source_n: lakeN,
        falsifier: "This mock never ships; a live issue replaces it.",
      },
    ],
    sources,
  };
}
