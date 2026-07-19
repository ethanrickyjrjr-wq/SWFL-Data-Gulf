import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseBrainMarkdown, toDisplayBrain } from "../../refinery/render/speaker.mts";
import type { BakeFact, BakeInputs, SourceRef } from "./types";

/**
 * Brain-page surface adapter (spec §Phase E). The key list mirrors the route
 * registry exactly: every brains/*.md is a live /r/[slug] page (test-alpha is
 * the dev fixture the sitemap also skips). Facts come from the SAME display
 * layer the page renders (toDisplayBrain) — the bake can never cite a figure
 * the page doesn't hold. Brains with no display metrics are skipped (null).
 * The scope + conclusion ride as context; the validator whitelists context
 * numbers, so the conclusion's figures can't trip the no-invention lint.
 */

const BRAINS_DIR = path.join(process.cwd(), "brains");
const EXCLUDED = new Set(["test-alpha"]);

export async function listBrainSurfaceKeys(): Promise<string[]> {
  let files: string[] = [];
  try {
    files = await readdir(BRAINS_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter((s) => !EXCLUDED.has(s))
    .sort();
}

export async function assembleBrainBakeInputs(slug: string): Promise<BakeInputs | null> {
  let content: string;
  try {
    content = await readFile(path.join(BRAINS_DIR, `${slug}.md`), "utf-8");
  } catch {
    return null;
  }
  let display: ReturnType<typeof toDisplayBrain>;
  try {
    display = toDisplayBrain(parseBrainMarkdown(content));
  } catch {
    return null; // unparseable brain renders as raw fallback — nothing to bake
  }

  const facts: BakeFact[] = display.metrics.map((m) => ({
    label: m.label,
    display: typeof m.value === "string" ? m.value : String(m.value),
    sub: null,
    why: null,
    source: m.sourceLabel ?? "SWFL Data Gulf",
  }));
  if (facts.length === 0) return null;

  const sources = new Map<string, SourceRef>();
  for (const m of display.metrics) {
    if (m.sourceUrl) {
      sources.set(m.sourceUrl, { label: m.sourceLabel ?? "SWFL Data Gulf", url: m.sourceUrl });
    }
  }
  return {
    surface: "brain",
    key: slug,
    place: display.title,
    county: null,
    // display.freshnessToken is ALREADY the MM/DD/YYYY form (speaker.mts runs
    // asOfFromToken at display time) — parsing it again always returned null.
    asOf: display.freshnessToken || null,
    facts,
    context: [display.scope, display.conclusion].filter(Boolean),
    sources: [...sources.values()],
  };
}
