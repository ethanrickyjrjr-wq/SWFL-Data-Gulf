/**
 * Personal Vault — capture CLI.
 *
 * Single-purpose dumb pipe: validates args + SKOS tags against
 * brain-vocabulary.json, inserts one row into personal_vault.vault_fragments,
 * prints the new UUID.
 *
 * All tag-inference reasoning lives in the /vault slash command (where Claude
 * can interpret natural-language intent). This script never guesses a tag.
 *
 * Usage:
 *   bun refinery/tools/vault-capture.mts \
 *     --slug=i75-developer-flight \
 *     --insight="Industrial supply on I-75 is pushing developers north…" \
 *     --tags=cre_industrial_vacancy,qual_sentiment_direction \
 *     --confidence=0.75 \
 *     --revisit-after=2026-11-17 \
 *     --source-chat=claude-2026-05-17-vault-ship
 *
 * Required: --slug, --insight, --tags
 * Optional: --confidence (default 0.70), --revisit-after (default vintage+90d),
 *           --source-chat
 *
 * Exit codes: 0 = inserted, 1 = validation or insert error.
 */

import { loadVocabularySync } from "../vocab/loader.mts";
import { getSupabase } from "../sources/supabase.mts";
import { requireEnv } from "../config/env.mts";

const SCHEMA = "personal_vault";
const TABLE = "vault_fragments";
const SLUG_RE = /^[a-z0-9-]+$/;
const MIN_INSIGHT_CHARS = 20;

interface Args {
  slug: string;
  insight: string;
  tags: string[];
  confidence?: number;
  revisitAfter?: string;
  sourceChat?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const map = new Map<string, string>();
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq < 0) {
      // boolean flag — not used here, but keep tolerant
      map.set(raw.slice(2), "true");
      continue;
    }
    const key = raw.slice(2, eq);
    const value = raw.slice(eq + 1);
    map.set(key, value);
  }

  const missing: string[] = [];
  const slug = map.get("slug") ?? "";
  const insight = map.get("insight") ?? "";
  const tagsRaw = map.get("tags") ?? "";
  if (!slug) missing.push("--slug");
  if (!insight) missing.push("--insight");
  if (!tagsRaw) missing.push("--tags");
  if (missing.length > 0) {
    fail(
      `missing required arg(s): ${missing.join(", ")}\n` +
        `usage: bun refinery/tools/vault-capture.mts --slug=… --insight="…" --tags=tag1,tag2 [--confidence=0.7] [--revisit-after=YYYY-MM-DD] [--source-chat=…]`,
    );
  }

  const tags = tagsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (tags.length === 0) fail("--tags must list at least one SKOS concept id.");

  const confidenceStr = map.get("confidence");
  const confidence =
    confidenceStr !== undefined ? Number(confidenceStr) : undefined;
  if (
    confidence !== undefined &&
    (Number.isNaN(confidence) || confidence < 0 || confidence > 1)
  ) {
    fail(`--confidence must be a number in [0,1]; got "${confidenceStr}".`);
  }

  return {
    slug,
    insight,
    tags,
    confidence,
    revisitAfter: map.get("revisit-after"),
    sourceChat: map.get("source-chat"),
  };
}

function fail(msg: string): never {
  console.error(`[vault-capture] ${msg}`);
  process.exit(1);
}

function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    fail(
      `--slug "${slug}" must match /^[a-z0-9-]+$/ (lowercase + digits + dashes only).`,
    );
  }
}

function validateInsight(insight: string): void {
  if (insight.length < MIN_INSIGHT_CHARS) {
    fail(
      `--insight is ${insight.length} chars; minimum ${MIN_INSIGHT_CHARS}. Add detail or skip the bank.`,
    );
  }
}

function validateRevisit(d: string | undefined): void {
  if (d === undefined) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    fail(`--revisit-after must be YYYY-MM-DD; got "${d}".`);
  }
}

// ---------------------------------------------------------------------------
// Tag validation + "did you mean" fuzzy matcher
// ---------------------------------------------------------------------------

interface ConceptLike {
  id: string;
  prefLabel: string;
  altLabels?: string[];
  raw_slugs?: string[];
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function suggestTagFixes(
  bad: string,
  allConcepts: readonly ConceptLike[],
): string[] {
  const target = tokens(bad);
  const scored = allConcepts.map((c) => {
    const candidate = new Set<string>([
      ...tokens(c.id),
      ...tokens(c.prefLabel),
      ...(c.altLabels ?? []).flatMap((a) => [...tokens(a)]),
      ...(c.raw_slugs ?? []).flatMap((s) => [...tokens(s)]),
    ]);
    return { id: c.id, score: jaccard(target, candidate) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((s) => s.score > 0)
    .slice(0, 3)
    .map((s) => s.id);
}

function validateTags(tags: readonly string[]): void {
  const vocab = loadVocabularySync();
  const concepts = vocab.concepts as Record<string, ConceptLike>;
  const all = Object.values(concepts);
  const missing: { tag: string; suggestions: string[] }[] = [];
  for (const tag of tags) {
    if (!concepts[tag]) {
      missing.push({ tag, suggestions: suggestTagFixes(tag, all) });
    }
  }
  if (missing.length > 0) {
    const lines = missing.map(({ tag, suggestions }) => {
      const hint =
        suggestions.length > 0
          ? `  did you mean: ${suggestions.map((s) => `"${s}"`).join(", ")}?`
          : `  no near matches in vocab.`;
      return `  - unknown SKOS concept: "${tag}"\n${hint}`;
    });
    fail(
      `tag validation failed (${missing.length} of ${tags.length} unknown):\n` +
        lines.join("\n") +
        `\n\nValid concept ids live in refinery/vocab/brain-vocabulary.json.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  validateSlug(args.slug);
  validateInsight(args.insight);
  validateRevisit(args.revisitAfter);
  validateTags(args.tags);

  requireEnv(["supabaseUrl", "supabaseKey"]);

  const row: Record<string, unknown> = {
    context_slug: args.slug,
    insight: args.insight,
    tags: args.tags,
  };
  if (args.confidence !== undefined) row.confidence = args.confidence;
  if (args.revisitAfter !== undefined) row.revisit_after = args.revisitAfter;
  if (args.sourceChat !== undefined) row.source_chat = args.sourceChat;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(TABLE)
    .insert([row])
    .select("id, context_slug, vintage, revisit_after, confidence, tags")
    .single();

  if (error) {
    fail(
      `insert failed: ${error.message}\n` +
        `If the error is "schema must be one of the following: public, …", add "${SCHEMA}" to ` +
        `Project Settings → API → Exposed schemas in the Supabase dashboard.`,
    );
  }

  const r = data as {
    id: string;
    context_slug: string;
    vintage: string;
    revisit_after: string;
    confidence: number;
    tags: string[];
  };
  console.log(
    `[vault-capture] banked id=${r.id} slug=${r.context_slug} vintage=${r.vintage} revisit=${r.revisit_after} conf=${r.confidence} tags=[${r.tags.join(", ")}]`,
  );
}

main().catch((err) => {
  console.error(
    `[vault-capture] FAILED: ${err instanceof Error ? err.message : err}`,
  );
  process.exit(1);
});
