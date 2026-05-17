/**
 * P4a — SKOS Orphan Triage report generator.
 *
 * Scans every cached Stage 2.5 normalize artifact, collects raw_slugs
 * that failed to resolve to a SKOS concept, dedupes them, and for each
 * unique orphan suggests the top-K candidate concepts a human triager
 * would consider mapping it to. Writes docs/orphan-triage.md.
 *
 * Today's ranker is string-similarity (refinery/lib/embedder.mts
 * `stringSimilarityRanker`). When P4b lands a real embedder, this
 * generator gains an optional `--vector` flag that swaps the engine
 * to cosine similarity over pre-computed concept embeddings — the
 * report shape stays identical, only the score column changes meaning.
 *
 * Pure read-only. Inputs: .refinery-cache/&#x7B;pack_id&#x7D;/stage-2.5-normalize.json,
 * refinery/vocab/brain-vocabulary.json. Output: docs/orphan-triage.md.
 *
 * Usage:
 *
 *   bun refinery/tools/orphan-triage.mts
 *   npm run triage
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadVocabularySync } from "../vocab/loader.mts";
import {
  rankCandidates,
  stringSimilarityRanker,
  type RankCandidate,
} from "../lib/embedder.mts";

const CACHE_DIR = path.join(process.cwd(), ".refinery-cache");
const OUTPUT_PATH = path.join(process.cwd(), "docs", "orphan-triage.md");

interface RawOrphan {
  fragment_id: string;
  path: string;
  raw_slug: string;
  context: string;
}

interface Stage25Artifact {
  pack_id: string;
  orphan_count: number;
  orphans: RawOrphan[];
}

interface OrphanObservation {
  pack_id: string;
  fragment_id: string;
  path: string;
}

interface DedupedOrphan {
  raw_slug: string;
  observations: OrphanObservation[];
  packs: Set<string>;
  paths: Set<string>;
}

function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function loadAllOrphans(): {
  artifacts: number;
  total: number;
  byPack: Map<string, number>;
  deduped: DedupedOrphan[];
} {
  const byPack = new Map<string, number>();
  const bySlug = new Map<string, DedupedOrphan>();
  let artifacts = 0;
  let total = 0;

  if (!existsSync(CACHE_DIR)) {
    return { artifacts: 0, total: 0, byPack, deduped: [] };
  }

  for (const pack of readdirSync(CACHE_DIR)) {
    const artifactPath = path.join(CACHE_DIR, pack, "stage-2.5-normalize.json");
    if (!existsSync(artifactPath)) continue;
    artifacts++;
    let artifact: Stage25Artifact;
    try {
      artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
    } catch {
      continue;
    }
    const orphans = artifact.orphans ?? [];
    if (orphans.length === 0) continue;
    byPack.set(pack, orphans.length);
    total += orphans.length;
    for (const o of orphans) {
      let bucket = bySlug.get(o.raw_slug);
      if (!bucket) {
        bucket = {
          raw_slug: o.raw_slug,
          observations: [],
          packs: new Set<string>(),
          paths: new Set<string>(),
        };
        bySlug.set(o.raw_slug, bucket);
      }
      bucket.observations.push({
        pack_id: pack,
        fragment_id: o.fragment_id,
        path: o.path,
      });
      bucket.packs.add(pack);
      bucket.paths.add(o.path);
    }
  }

  const deduped = [...bySlug.values()].sort((a, b) =>
    a.raw_slug.localeCompare(b.raw_slug),
  );
  return { artifacts, total, byPack, deduped };
}

function buildCandidates(): RankCandidate[] {
  const vocab = loadVocabularySync();
  const out: RankCandidate[] = [];
  for (const [id, concept] of Object.entries(vocab.concepts)) {
    const parts: string[] = [concept.prefLabel];
    if (concept.altLabels?.length) parts.push(...concept.altLabels);
    for (const slug of concept.raw_slugs) parts.push(slug);
    if (concept.scope_note) parts.push(concept.scope_note);
    out.push({ id, text: parts.join(" ") });
  }
  return out;
}

function renderReport(
  artifacts: number,
  total: number,
  byPack: Map<string, number>,
  deduped: DedupedOrphan[],
  candidates: readonly RankCandidate[],
): string {
  const now = new Date().toISOString();
  const sha = gitShortSha();
  const vocab = loadVocabularySync();

  const lines: string[] = [];
  lines.push("# SKOS Orphan Triage");
  lines.push("");
  lines.push(
    "_Auto-generated read-only report — raw slugs that Stage 2.5 normalize observed but could not map to a SKOS concept, ranked against candidate concepts via the active similarity engine._",
  );
  lines.push("");
  lines.push(`**Generated:** ${now} (commit \`${sha}\`)`);
  lines.push(
    `**Vocab schema:** ${vocab.meta.schema_version} (concepts: ${Object.keys(vocab.concepts).length})`,
  );
  lines.push(`**Ranker engine:** \`${stringSimilarityRanker.id}\``);
  lines.push("");
  lines.push("---");
  lines.push("");

  // TL;DR
  lines.push("## TL;DR");
  lines.push("");
  lines.push(`- Stage 2.5 artifacts scanned: **${artifacts}**`);
  lines.push(`- Total orphan observations: **${total}**`);
  lines.push(`- Unique raw_slugs that are orphaned: **${deduped.length}**`);
  lines.push(
    `- Packs producing orphans: ${
      byPack.size === 0
        ? "none — full vocab coverage."
        : "**" +
          byPack.size +
          "** (" +
          [...byPack.entries()]
            .sort()
            .map(([p, n]) => `\`${p}\` (${n})`)
            .join(", ") +
          ")"
    }`,
  );
  lines.push("");

  if (deduped.length === 0) {
    lines.push("---");
    lines.push("");
    lines.push("## No orphans");
    lines.push("");
    lines.push(
      "Every raw_slug observed across all cached Stage 2.5 artifacts resolved to a SKOS concept. SKOS coverage is currently 100%. This report will gain content the moment a brain emits a slug not registered in `refinery/vocab/brain-vocabulary.json`.",
    );
    lines.push("");
    lines.push(footerNote());
    return lines.join("\n") + "\n";
  }

  // Per-orphan triage table
  lines.push("---");
  lines.push("");
  lines.push("## Orphans by raw_slug");
  lines.push("");
  lines.push(
    "Each row lists one unique orphan slug, the pack(s) and path(s) it was observed at, and the top-3 candidate SKOS concepts the ranker suggests as mappings. A human triager should pick one (or add a new concept to the vocab if none fit) and update `refinery/vocab/brain-vocabulary.json`.",
  );
  lines.push("");

  for (const orphan of deduped) {
    lines.push(`### \`${orphan.raw_slug}\``);
    lines.push("");
    lines.push(
      `- **Observations:** ${orphan.observations.length} (across ${orphan.packs.size} pack${orphan.packs.size === 1 ? "" : "s"})`,
    );
    lines.push(
      `- **Packs:** ${[...orphan.packs]
        .sort()
        .map((p) => `\`${p}\``)
        .join(", ")}`,
    );
    lines.push(
      `- **JSON paths:** ${[...orphan.paths]
        .sort()
        .map((p) => `\`${p}\``)
        .join(", ")}`,
    );
    lines.push("");

    const queryText = orphan.raw_slug;
    const top = rankCandidates(queryText, candidates, stringSimilarityRanker, {
      topK: 3,
    });
    lines.push("| Rank | Candidate concept | Score | prefLabel |");
    lines.push("| --- | --- | --- | --- |");
    if (top.length === 0) {
      lines.push("| — | _no candidates_ | — | — |");
    } else {
      top.forEach((c, i) => {
        const concept = vocab.concepts[c.id];
        const pref = concept?.prefLabel ?? "(unknown)";
        lines.push(
          `| ${i + 1} | \`${c.id}\` | ${c.score.toFixed(3)} | ${escapePipes(pref)} |`,
        );
      });
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(footerNote());
  return lines.join("\n") + "\n";
}

function footerNote(): string {
  return [
    "## Upgrading the ranker (P4b)",
    "",
    "Today's `string-similarity` engine uses token Jaccard + Levenshtein. It catches the obvious cases (slug renames, multi-word reorderings, minor spelling) but misses semantic equivalence (e.g. `chargeoff` ↔ `loan_default_rate`).",
    "",
    "When P4b ships a real embedder (Voyage AI is the Anthropic-documented partner), the triage generator will gain a `--vector` flag that swaps `stringSimilarityRanker` for `makeVectorRanker(embedder, preEmbedded, embedQuery)` from `refinery/lib/embedder.mts`. The report shape stays identical; only the **Score** column changes meaning (Jaccard+Levenshtein → cosine similarity over real embeddings).",
    "",
    "The receiver schema is already in place: `docs/sql/20260517_vocab_concept_embeddings.sql` defines `public.vocab_concept_embeddings` with a 1024-dim `embedding vector` column and an IVFFlat cosine index.",
    "",
  ].join("\n");
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function main(): void {
  const { artifacts, total, byPack, deduped } = loadAllOrphans();
  const candidates = buildCandidates();
  const md = renderReport(artifacts, total, byPack, deduped, candidates);
  writeFileSync(OUTPUT_PATH, md, "utf-8");
  console.log(
    `[orphan-triage] wrote ${OUTPUT_PATH} (${md.length} bytes) — ` +
      `${artifacts} artifact${artifacts === 1 ? "" : "s"} scanned, ` +
      `${deduped.length} unique orphan${deduped.length === 1 ? "" : "s"} ` +
      `across ${total} observation${total === 1 ? "" : "s"}.`,
  );
}

main();
