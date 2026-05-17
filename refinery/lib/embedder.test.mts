import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  makeVectorRanker,
  nullEmbedder,
  rankCandidates,
  stringSimilarityRanker,
  type Embedder,
  type RankCandidate,
} from "./embedder.mts";

describe("nullEmbedder", () => {
  test("throws on embed", async () => {
    await assert.rejects(
      () => nullEmbedder.embed("hello"),
      /No embedder configured/,
    );
  });

  test("throws on similarity", () => {
    assert.throws(
      () => nullEmbedder.similarity([0], [0]),
      /No embedder configured/,
    );
  });

  test("self-identifies as model 'null' with dim 0", () => {
    assert.equal(nullEmbedder.model, "null");
    assert.equal(nullEmbedder.dim, 0);
  });
});

describe("stringSimilarityRanker — pairwise scoring", () => {
  test("identical strings score 1", () => {
    const out = stringSimilarityRanker.rank("cap_rate_median", [
      { id: "c1", text: "cap_rate_median" },
    ]);
    assert.equal(out[0].score, 1);
  });

  test("token reorder still scores high (Jaccard captures it)", () => {
    const out = stringSimilarityRanker.rank("median cap rate", [
      { id: "c1", text: "cap rate median" },
    ]);
    assert.ok(out[0].score >= 0.5, `expected >=0.5, got ${out[0].score}`);
  });

  test("snake-case ↔ space normalization", () => {
    const out = stringSimilarityRanker.rank("cap_rate_median", [
      { id: "c1", text: "cap rate median" },
    ]);
    assert.equal(out[0].score, 1);
  });

  test("totally unrelated strings score low", () => {
    const out = stringSimilarityRanker.rank("invented_metric", [
      { id: "c1", text: "SBA franchise overall survival rate" },
    ]);
    assert.ok(out[0].score < 0.3, `expected <0.3, got ${out[0].score}`);
  });

  test("near-spelling variants score moderately (Levenshtein contribution)", () => {
    // "chargeoff" vs "charge_off" — same concept, different morphology
    const out = stringSimilarityRanker.rank("chargeoff", [
      { id: "c1", text: "charge_off" },
    ]);
    assert.ok(out[0].score >= 0.4, `expected >=0.4, got ${out[0].score}`);
  });

  test("empty strings on both sides do not crash", () => {
    const out = stringSimilarityRanker.rank("", [{ id: "c1", text: "" }]);
    assert.equal(out.length, 1);
    assert.ok(out[0].score >= 0 && out[0].score <= 1);
  });

  test("all candidates scored independently (no cross-contamination)", () => {
    const out = stringSimilarityRanker.rank("vacancy rate", [
      { id: "match", text: "vacancy rate median" },
      { id: "nomatch", text: "tourist development tax" },
    ]);
    const matchScore = out.find((o) => o.id === "match")!.score;
    const noMatchScore = out.find((o) => o.id === "nomatch")!.score;
    assert.ok(matchScore > noMatchScore);
  });
});

describe("rankCandidates — top-K, stable, filtered", () => {
  const universe: RankCandidate[] = [
    { id: "a_exact", text: "vacancy rate" },
    { id: "b_partial", text: "vacancy" },
    { id: "c_unrelated", text: "tourist development tax" },
    { id: "d_partial2", text: "rate" },
  ];

  test("default topK=3 returned, sorted by score DESC", () => {
    const out = rankCandidates(
      "vacancy rate",
      universe,
      stringSimilarityRanker,
    );
    assert.equal(out.length, 3);
    assert.equal(out[0].id, "a_exact");
    for (let i = 1; i < out.length; i++) {
      assert.ok(out[i - 1].score >= out[i].score, "scores monotone DESC");
    }
  });

  test("topK=1 returns the single best", () => {
    const out = rankCandidates(
      "vacancy rate",
      universe,
      stringSimilarityRanker,
      { topK: 1 },
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "a_exact");
  });

  test("minScore filter drops weak candidates", () => {
    const out = rankCandidates(
      "vacancy rate",
      universe,
      stringSimilarityRanker,
      { topK: 10, minScore: 0.5 },
    );
    for (const c of out) {
      assert.ok(c.score >= 0.5);
    }
  });

  test("tie-break by id ASC is stable across runs", () => {
    // Two synthetic identical-score candidates
    const fakeRanker = {
      id: "fake",
      rank: (_q: string, cs: readonly RankCandidate[]) =>
        cs.map((c) => ({ ...c, score: 0.5 })),
    };
    const out = rankCandidates(
      "x",
      [
        { id: "zzz", text: "z" },
        { id: "aaa", text: "a" },
        { id: "mmm", text: "m" },
      ],
      fakeRanker,
      { topK: 3 },
    );
    assert.deepStrictEqual(
      out.map((c) => c.id),
      ["aaa", "mmm", "zzz"],
    );
  });

  test("empty candidate list returns empty result", () => {
    const out = rankCandidates("anything", [], stringSimilarityRanker);
    assert.deepStrictEqual(out, []);
  });
});

describe("makeVectorRanker — P4b drop-in shape", () => {
  // A toy embedder that uses identity vectors so cosine similarity is
  // deterministic and we can validate the drop-in plumbing.
  const toyEmbedder: Embedder = {
    model: "toy-1",
    dim: 3,
    async embed(t: string): Promise<number[]> {
      // Deterministic 3-dim embedding from char codes (toy)
      const a = (t.charCodeAt(0) || 0) / 255;
      const b = (t.charCodeAt(1) || 0) / 255;
      const c = (t.charCodeAt(2) || 0) / 255;
      return [a, b, c];
    },
    similarity(a, b) {
      // Cosine similarity
      let dot = 0,
        na = 0,
        nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      if (na === 0 || nb === 0) return 0;
      return dot / (Math.sqrt(na) * Math.sqrt(nb));
    },
  };

  test("returns ranker with provider id baked in", () => {
    const r = makeVectorRanker(toyEmbedder, new Map(), async () => [0, 0, 0]);
    assert.equal(r.id, "vector-toy-1");
    assert.equal(typeof r.rankAsync, "function");
  });

  test("scores against pre-embedded map; missing concept scores 0", async () => {
    const known = await toyEmbedder.embed("apple");
    const preEmbedded = new Map<string, readonly number[]>([
      ["c_known", known],
    ]);
    const r = makeVectorRanker(toyEmbedder, preEmbedded, (q) =>
      toyEmbedder.embed(q),
    );
    const out = await r.rankAsync("apple", [
      { id: "c_known", text: "apple" },
      { id: "c_missing", text: "banana" },
    ]);
    const known_score = out.find((o) => o.id === "c_known")!.score;
    const missing_score = out.find((o) => o.id === "c_missing")!.score;
    assert.ok(known_score > 0.99, "self-similarity ~ 1");
    assert.equal(missing_score, 0, "missing concept gets 0");
  });
});
