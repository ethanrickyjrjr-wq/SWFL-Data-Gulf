/**
 * Embedder + similarity ranker abstractions for SKOS orphan triage (P4a).
 *
 * The point of this module is to draw a clean line between the SHAPE of
 * the similarity-ranking work (orphan → top-K candidate concepts) and
 * the actual SCORING engine used. Today the scoring engine is string
 * similarity (token overlap + Levenshtein); tomorrow, when a vector
 * provider is keyed (P4b), the scoring engine becomes cosine similarity
 * over real embeddings. Callers don't change.
 *
 * Two public surfaces:
 *
 *   1. `Embedder` — the I/O surface a real vector provider implements.
 *      `embed(text)` returns a fixed-dim number[]. `similarity(a, b)`
 *      returns a 0..1 score (higher = more similar). Both are async to
 *      match the inevitable network call.
 *   2. `rankCandidates({ query, candidates, ranker })` — the pure
 *      ranking function. Takes a query text + an array of candidates
 *      `{ id, text }`, returns top-K by score. The `ranker` argument is
 *      the swappable engine: string similarity today, vector similarity
 *      tomorrow.
 *
 * No external dependencies. The string-similarity ranker is small
 * enough to inline rather than pull in `string-similarity` from npm.
 */

export interface Embedder {
  /** Provider id, used as primary-key component in vocab_concept_embeddings. */
  readonly model: string;
  /** Fixed vector dimension this embedder emits. Matches DB column dim. */
  readonly dim: number;
  embed(text: string): Promise<number[]>;
  similarity(a: readonly number[], b: readonly number[]): number;
}

/** Null embedder — fails loud if a caller forgets to wire a real provider. */
export const nullEmbedder: Embedder = {
  model: "null",
  dim: 0,
  async embed(): Promise<number[]> {
    throw new Error(
      "No embedder configured. Set VOYAGE_API_KEY (P4b) or pick a different provider.",
    );
  },
  similarity(): number {
    throw new Error(
      "No embedder configured. Set VOYAGE_API_KEY (P4b) or pick a different provider.",
    );
  },
};

// ---------------------------------------------------------------------------
// Pure ranker abstraction
// ---------------------------------------------------------------------------

export interface RankCandidate {
  /** Stable identifier for the candidate (e.g., concept_id). */
  id: string;
  /** Human-readable text the ranker scores against the query. */
  text: string;
}

export interface RankedCandidate extends RankCandidate {
  /** 0..1 score. Higher = more similar to the query. */
  score: number;
}

export interface Ranker {
  /** Identifier used in audit output ("string-similarity", "vector-voyage-3", ...). */
  readonly id: string;
  rank(query: string, candidates: readonly RankCandidate[]): RankedCandidate[];
}

export interface RankOptions {
  /** Return at most this many top candidates. Default 3. */
  topK?: number;
  /** Drop candidates below this score. Default 0 (no filter). */
  minScore?: number;
}

/**
 * Generic top-K wrapper. Stable: ties break by candidate.id ASC so the
 * output is byte-identical across runs.
 */
export function rankCandidates(
  query: string,
  candidates: readonly RankCandidate[],
  ranker: Ranker,
  opts: RankOptions = {},
): RankedCandidate[] {
  const topK = opts.topK ?? 3;
  const minScore = opts.minScore ?? 0;
  const ranked = ranker.rank(query, candidates);
  return [...ranked]
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, topK);
}

// ---------------------------------------------------------------------------
// String-similarity ranker — today's default
// ---------------------------------------------------------------------------

/**
 * Token-set Jaccard + Levenshtein-normalized similarity, equally weighted.
 *
 *   - Token Jaccard captures "are we talking about the same things"
 *     (good for multi-word labels like "median cap rate" vs "cap rate
 *     median").
 *   - Levenshtein-normalized similarity captures "is this a minor
 *     spelling / morphology variant" (good for "sofr" vs "sofr_30d" or
 *     "chargeoff" vs "charge_off").
 *
 * Result is 0..1. Not a perfect substitute for embeddings but does the
 * obvious heavy lifting until a real vector provider lands in P4b.
 */
export const stringSimilarityRanker: Ranker = {
  id: "string-similarity",
  rank(query: string, candidates: readonly RankCandidate[]): RankedCandidate[] {
    const q = normalize(query);
    const qTokens = tokenize(q);
    return candidates.map((c) => {
      const cn = normalize(c.text);
      const cTokens = tokenize(cn);
      const jacc = jaccard(qTokens, cTokens);
      const lev = levenshteinSimilarity(q, cn);
      return { ...c, score: (jacc + lev) / 2 };
    });
  },
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  // Word characters, length >= 2 — drops stopword-y noise like "of", "a", "the"
  // without a stopword list. Numbers stay (they're meaningful in slugs).
  const out = new Set<string>();
  const matches = s.match(/[a-z0-9]+/g);
  if (!matches) return out;
  for (const t of matches) if (t.length >= 2) out.add(t);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Levenshtein distance, normalized to 0..1 similarity. */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const d = levenshtein(a, b);
  const max = Math.max(a.length, b.length);
  return 1 - d / max;
}

function levenshtein(a: string, b: string): number {
  // Classic two-row dynamic programming. Sufficient for short slug strings.
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ---------------------------------------------------------------------------
// Vector-similarity ranker — P4b drop-in. Activates when an Embedder lands.
// ---------------------------------------------------------------------------

/**
 * Build a ranker that calls `embedder.similarity` over pre-computed
 * embeddings. P4b will pre-embed all concepts at vocab-load time, pass
 * the resulting Map<concept_id, vector> in here, and rank orphans by
 * cosine similarity. Today this is unused — kept as the documented
 * shape of the P4b drop-in.
 */
export function makeVectorRanker(
  embedder: Embedder,
  preEmbedded: ReadonlyMap<string, readonly number[]>,
  embedQuery: (q: string) => Promise<number[]>,
): {
  id: string;
  rankAsync: (
    q: string,
    c: readonly RankCandidate[],
  ) => Promise<RankedCandidate[]>;
} {
  return {
    id: `vector-${embedder.model}`,
    async rankAsync(
      query: string,
      candidates: readonly RankCandidate[],
    ): Promise<RankedCandidate[]> {
      const qvec = await embedQuery(query);
      return candidates.map((c) => {
        const cvec = preEmbedded.get(c.id);
        const score = cvec ? embedder.similarity(qvec, cvec) : 0;
        return { ...c, score };
      });
    },
  };
}
