# SKOS Orphan Triage

_Auto-generated read-only report — raw slugs that Stage 2.5 normalize observed but could not map to a SKOS concept, ranked against candidate concepts via the active similarity engine._

**Generated:** 2026-05-17T05:11:22.022Z (commit `77e4014`)
**Vocab schema:** 1.0.0 (concepts: 45)
**Ranker engine:** `string-similarity`

---

## TL;DR

- Stage 2.5 artifacts scanned: **10**
- Total orphan observations: **2**
- Unique raw_slugs that are orphaned: **2**
- Packs producing orphans: **2** (`bad-pack` (1), `mixed` (1))

---

## Orphans by raw_slug

Each row lists one unique orphan slug, the pack(s) and path(s) it was observed at, and the top-3 candidate SKOS concepts the ranker suggests as mappings. A human triager should pick one (or add a new concept to the vocab if none fit) and update `refinery/vocab/brain-vocabulary.json`.

### `invented_metric`

- **Observations:** 1 (across 1 pack)
- **Packs:** `mixed`
- **JSON paths:** `classification.topic`

| Rank | Candidate concept | Score | prefLabel |
| --- | --- | --- | --- |
| 1 | `cre_vacancy_rate_median` | 0.072 | Median Vacancy Rate (corpus) |
| 2 | `cre_vacancy_rate` | 0.066 | Vacancy Rate (per corridor) |
| 3 | `qual_metric_trajectory` | 0.059 | Metric Trajectory |

### `totally_fake_slug`

- **Observations:** 1 (across 1 pack)
- **Packs:** `bad-pack`
- **JSON paths:** `classification.topic`

| Rank | Candidate concept | Score | prefLabel |
| --- | --- | --- | --- |
| 1 | `cre_vacancy_rate` | 0.075 | Vacancy Rate (per corridor) |
| 2 | `sba_chargeoff_rate_sector_42` | 0.057 | Wholesale Trade (NAICS 42) — SBA Charge-off Rate |
| 3 | `sba_chargeoff_rate_sector_23` | 0.056 | Construction (NAICS 23) — SBA Charge-off Rate |

---

## Upgrading the ranker (P4b)

Today's `string-similarity` engine uses token Jaccard + Levenshtein. It catches the obvious cases (slug renames, multi-word reorderings, minor spelling) but misses semantic equivalence (e.g. `chargeoff` ↔ `loan_default_rate`).

When P4b ships a real embedder (Voyage AI is the Anthropic-documented partner), the triage generator will gain a `--vector` flag that swaps `stringSimilarityRanker` for `makeVectorRanker(embedder, preEmbedded, embedQuery)` from `refinery/lib/embedder.mts`. The report shape stays identical; only the **Score** column changes meaning (Jaccard+Levenshtein → cosine similarity over real embeddings).

The receiver schema is already in place: `docs/sql/20260517_vocab_concept_embeddings.sql` defines `public.vocab_concept_embeddings` with a 1024-dim `embedding vector` column and an IVFFlat cosine index.

