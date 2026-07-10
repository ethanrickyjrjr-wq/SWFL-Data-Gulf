// lib/email/insiders/materialize.ts
//
// Stage 2c — deterministic materialization. Chart REQUESTS resolve against real
// series through the production chart path (buildChartForQuestion → ChartSpec →
// chartSpecToEmailImage → chartImageBlock; nothing chartable → the request is
// DROPPED with a warning, never a fabricated series). Then the blocking lint
// (lint.ts) — a violation aborts the issue with no html. Then the ONE renderer,
// renderEmailDocHtml, produces the email html (the /r/insiders page renders the
// same stored doc in Phase C; its CitationList integration lands there too —
// v1 renders the sources as a plain numbered list).

import { buildChartForQuestion, type ChartForQuestion } from "@/lib/assistant/chart-for-question";
import { DEFAULT_GLOBAL_STYLE } from "@/lib/email/doc/default-docs";
import { mintBlockId } from "@/lib/email/doc/schema";
import type { BlockOf, EmailBlock, EmailDoc } from "@/lib/email/doc/types";
import { chartImageBlock } from "@/lib/email/inject-chart";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";
import {
  chartImageCaption,
  chartSpecToEmailImage,
  type EmailChartImage,
} from "@/lib/email/spec-to-png";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type { IssueDossier } from "./dossier";
import { lintIssueProse } from "./lint";
import type { IssueDoc } from "./schema";

export type ChartFn = (question: string, origin: string) => Promise<ChartForQuestion | null>;
export type ChartImageFn = (
  spec: ChartSpec,
  accent: string,
  key: string,
) => Promise<EmailChartImage | null>;

export interface MaterializeOpts {
  origin: string; // SITE_ORIGIN — chart routing + allowed self-links
  slug: string; // issue slug — chart hosting cache keys
  chartFn?: ChartFn; // test seam; prod default is the ONE chart root
  imageFn?: ChartImageFn; // test seam; prod default renders+hosts the PNG
}

export type MaterializeResult =
  | { ok: true; html: string; emailDoc: EmailDoc; warnings: string[]; charts: number }
  | { ok: false; blocked: string[]; warnings: string[] };

function textBlock(body: string): BlockOf<"text"> {
  return { id: mintBlockId(), type: "text", props: { body } };
}

export async function materializeIssue(
  doc: IssueDoc,
  dossier: IssueDossier,
  opts: MaterializeOpts,
): Promise<MaterializeResult> {
  const chartFn = opts.chartFn ?? buildChartForQuestion;
  const imageFn = opts.imageFn ?? chartSpecToEmailImage;
  const warnings: string[] = [];

  // ── Charts first: their grounding notes join the lint's anchor set ────────
  const chartBlocks: Array<BlockOf<"image">> = [];
  const groundingNotes: string[] = [];
  for (const [i, req] of doc.dashboard.entries()) {
    let resolved: ChartForQuestion | null = null;
    try {
      resolved = await chartFn(req.question, opts.origin);
    } catch {
      resolved = null; // the chart root never throws by contract; belt anyway
    }
    if (!resolved) {
      warnings.push(
        `chart dropped: "${req.question}" — nothing chartable matched (a bar/table version can be offered)`,
      );
      continue;
    }
    const image = await imageFn(
      resolved.chart,
      DEFAULT_GLOBAL_STYLE.accentColor,
      `insiders-${opts.slug}-${i}`,
    );
    if (!image) {
      warnings.push(`chart dropped: "${req.question}" — image render failed`);
      continue;
    }
    groundingNotes.push(resolved.groundingNote);
    chartBlocks.push(
      chartImageBlock({
        url: image.url,
        alt: image.alt || resolved.chart.title || "market chart",
        caption: chartImageCaption(resolved.chart),
      }),
    );
  }

  // ── The blocking lint — a violation means NO issue, loudly ────────────────
  const allowedSourceUrls = new Set<string>([
    ...dossier.news.map((n) => n.url),
    opts.origin,
    `${opts.origin}/`,
    "https://www.swfldatagulf.com",
    "https://www.swfldatagulf.com/",
  ]);
  const lint = lintIssueProse(doc, dossier.anchors, groundingNotes, allowedSourceUrls);
  if (!lint.ok) {
    return {
      ok: false,
      blocked: lint.violations.map(
        (v) => `${v.section}: ${v.message}${v.token ? ` (${v.token})` : ""}`,
      ),
      warnings,
    };
  }

  // ── Assemble the EmailDoc (ordered blocks → the ONE renderer) ─────────────
  const blocks: EmailBlock[] = [];
  blocks.push({
    id: mintBlockId(),
    type: "header",
    props: { companyName: "SWFL Data Gulf", tagline: "Insiders Edition" },
  } as BlockOf<"header">);

  blocks.push(textBlock("THE READ"));
  for (const p of doc.the_read) blocks.push(textBlock(p));

  blocks.push(textBlock("THE STORIES"));
  for (const s of doc.stories) {
    blocks.push(textBlock(s.headline.toUpperCase()));
    blocks.push(textBlock(s.what_happened));
    blocks.push(textBlock(s.our_data));
    blocks.push(textBlock(s.analog));
  }

  if (chartBlocks.length > 0) {
    blocks.push(textBlock("THE DASHBOARD"));
    blocks.push(...chartBlocks);
  }

  blocks.push(textBlock("THE FORWARD LOOK"));
  for (const f of doc.forward_look) {
    blocks.push(textBlock(`${f.claim} [${f.base_source_n}] — this call dies if: ${f.falsifier}`));
  }

  blocks.push(textBlock("SOURCES"));
  blocks.push(textBlock(doc.sources.map((s) => `[${s.n}] ${s.label} — ${s.url}`).join("\n")));

  // The single as-of statement + the unsubscribe slot (send path replaces the
  // token with a per-subscriber link; preview keeps the literal token).
  blocks.push(textBlock(`As of ${doc.as_of} · SWFL Data Gulf · ${UNSUBSCRIBE_TOKEN}`));

  const emailDoc: EmailDoc = {
    globalStyle: DEFAULT_GLOBAL_STYLE,
    blocks,
    subjectVariants: [doc.subject],
  };

  const html = await renderEmailDocHtml(emailDoc);
  return { ok: true, html, emailDoc, warnings, charts: chartBlocks.length };
}
