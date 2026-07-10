// lib/email/insiders/dossier.ts
//
// Stage 2a — deterministic dossier assembly. NO model call. Gathers everything
// the Fable 5 author is allowed to know: master + per-brain OUTPUT slices (thin
// pipe — only the --- OUTPUT --- section travels), the month's news (desk-curated
// picks first, raw scored rows as backstop), the anchor set (every numeric token
// the issue's prose may state — same tokenizer as the lint, so the two can never
// disagree), and the chart menu (desk series pairings + standing defaults).
//
// Data source: data_lake.news_articles_swfl (dlt-owned; reached via
// db.schema("data_lake") — probed 07/10/2026; columns: headline, article_url,
// body_text, source_name, published_date, swfl_relevance).

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractNumbers } from "@/lib/deliverable/narrative-lint";
import { readBrainMarkdown } from "@/lib/fetch-brain";
import { parseDeskLog } from "./desk";

export interface IssueNewsItem {
  headline: string;
  url: string;
  publishedAt: string;
  summary: string;
  sourceName?: string | null;
  deskWeight?: number;
  deskWhy?: string;
  areas?: string[];
  seriesHint?: string | null;
}

export interface IssueDossier {
  month: string; // YYYY-MM
  asOf: string; // MM/DD/YYYY — stated ONCE downstream
  masterOutputMd: string;
  brainOutputs: Array<{ slug: string; outputMd: string }>;
  news: IssueNewsItem[];
  deskOk: boolean; // false → desk file missing/malformed, raw backstop in use
  anchors: string[]; // raw numeric tokens present in the included feed
  chartMenu: string[];
  playbookMd: string;
}

export interface RawNewsRow {
  headline: string | null;
  article_url: string | null;
  body_text: string | null;
  source_name: string | null;
  published_date: string | null;
  swfl_relevance: number | null;
}

export type NewsFetcher = (monthStart: string) => Promise<RawNewsRow[]>;

/** Production news fetcher — the one seam that touches Supabase. */
export function supabaseNewsFetcher(db: SupabaseClient): NewsFetcher {
  return async (monthStart: string) => {
    const { data, error } = await db
      .schema("data_lake")
      .from("news_articles_swfl")
      .select("headline, article_url, body_text, source_name, published_date, swfl_relevance")
      .gte("published_date", monthStart)
      .order("published_date", { ascending: false })
      .limit(60);
    if (error) throw new Error(`[insiders-dossier] news query failed: ${error.message}`);
    return (data ?? []) as RawNewsRow[];
  };
}

const OUTPUT_MARKER = "--- OUTPUT ---";
const DESK_SUMMARY_CHARS = 1200; // desk picks carry more context into the dossier
const BACKSTOP_SUMMARY_CHARS = 300;

const STANDING_CHART_QUESTIONS = [
  "median home value trend",
  "permits YoY by ZIP",
  "inventory and days-on-market trend",
];

function outputSlice(md: string): string {
  const i = md.indexOf(OUTPUT_MARKER);
  return i === -1 ? "" : md.slice(i + OUTPUT_MARKER.length).trim();
}

function mmddyyyy(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

export interface AssembleDossierOpts {
  month: string; // YYYY-MM
  deskMd: string | null; // contents of _FABLE5/desk/<month>.md, null if absent
  fetchNews: NewsFetcher;
  playbookMd?: string;
  now?: Date;
  /** Brain ids to include; "master" is pulled out separately. Defaults to the
   *  full pack roster at the call site (runner passes it) — tests inject two. */
  brainSlugs?: string[];
  readBrain?: (slug: string) => Promise<string>;
}

export async function assembleIssueDossier(opts: AssembleDossierOpts): Promise<IssueDossier> {
  const now = opts.now ?? new Date();
  const readBrain = opts.readBrain ?? readBrainMarkdown;
  const slugs = opts.brainSlugs ?? ["master"];

  // ── Brains: OUTPUT slices only (thin pipe) ────────────────────────────────
  let masterOutputMd = "";
  const brainOutputs: Array<{ slug: string; outputMd: string }> = [];
  for (const slug of slugs) {
    let md = "";
    try {
      md = await readBrain(slug);
    } catch {
      continue; // a missing brain never sinks the dossier; the author sees fewer inputs
    }
    const out = outputSlice(md);
    if (!out) continue;
    if (slug === "master") masterOutputMd = out;
    else brainOutputs.push({ slug, outputMd: out });
  }

  // ── Desk picks (editorial lane) + raw news backstop ───────────────────────
  const parsed = opts.deskMd ? parseDeskLog(opts.deskMd) : null;
  const deskOk = parsed?.ok === true;
  const deskEntries = deskOk && parsed.ok ? [...parsed.log.entries] : [];
  deskEntries.sort((a, b) => b.weight - a.weight);

  const rows = await opts.fetchNews(`${opts.month}-01`);
  const rowByUrl = new Map<string, RawNewsRow>();
  for (const r of rows) if (r.article_url) rowByUrl.set(r.article_url, r);

  const news: IssueNewsItem[] = [];
  const claimed = new Set<string>();
  for (const e of deskEntries) {
    const row = rowByUrl.get(e.url);
    claimed.add(e.url);
    news.push({
      headline: row?.headline ?? e.headline,
      url: e.url,
      publishedAt: row?.published_date ?? e.day,
      summary: (row?.body_text ?? "").slice(0, DESK_SUMMARY_CHARS),
      sourceName: row?.source_name ?? null,
      deskWeight: e.weight,
      deskWhy: e.why,
      areas: e.areas,
      seriesHint: e.seriesHint,
    });
  }
  for (const r of rows) {
    if (!r.article_url || claimed.has(r.article_url)) continue;
    news.push({
      headline: r.headline ?? "(untitled)",
      url: r.article_url,
      publishedAt: r.published_date ?? "",
      summary: (r.body_text ?? "").slice(0, BACKSTOP_SUMMARY_CHARS),
      sourceName: r.source_name,
    });
  }

  // ── Anchors: every number in what the author will actually see ────────────
  // Same tokenizer as the prose lint (ONE tokenizer, never a fork) — extracted
  // from the INCLUDED text (truncated summaries, not full articles), so the
  // anchor set and the model's visible feed can never diverge.
  const feed = [
    masterOutputMd,
    ...brainOutputs.map((b) => b.outputMd),
    ...news.map((n) => `${n.headline}\n${n.summary}\n${n.deskWhy ?? ""}`),
  ].join("\n");
  const anchors = [...new Set(extractNumbers(feed))];

  // ── Chart menu: desk pairings lead (already weight-sorted), defaults pad ──
  const chartMenu: string[] = [];
  for (const e of deskEntries)
    if (e.seriesHint && !chartMenu.includes(e.seriesHint)) chartMenu.push(e.seriesHint);
  for (const q of STANDING_CHART_QUESTIONS) if (!chartMenu.includes(q)) chartMenu.push(q);

  return {
    month: opts.month,
    asOf: mmddyyyy(now),
    masterOutputMd,
    brainOutputs,
    news,
    deskOk,
    anchors,
    chartMenu,
    playbookMd: opts.playbookMd ?? "",
  };
}
