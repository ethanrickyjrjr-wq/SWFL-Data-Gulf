# Hugging Face fleet sweep — 35-agent survey, 08/27/2026

**Source:** huggingface.co Hub API (`/api/models`, `/api/datasets`, `/api/spaces`) queried live
08/27/2026, plus model cards / LICENSE files / linked GitHub repos read via crawl4ai.

**Operator decree:** "fan out 5 sonnets at a time 7 times and see what we can find on hugging face
website that can help us." NORTH STAR #5 (adopt-nothing-new, day 8 of 30) was raised in one
sentence and the operator chose "Everything on HF, full sweep." **The freeze is lifted for the
SWEEP ONLY** — this document is a shortlist with verdicts. Wiring anything is still his word.

## HOW TO READ THIS — the two filters that did the work

Every one of the 35 briefs carried two HARD pre-filters, set BEFORE dispatch, not after:

1. **LICENSE.** We SELL sends, so `-nc-` is fatal. This filter earned its keep immediately:
   `microsoft/layoutlmv3-base` — 508 likes, the obvious doc-AI pick — is cc-by-nc-sa-4.0 and was
   the #2 hit on the very first query run. A downloads-ranked list recommends it.
2. **HARDWARE.** The box was MEASURED for this sweep (first time it is written down):
   **NVIDIA RTX 4060 Ti, 16GB VRAM (nvidia-smi: 16380 MiB) · 32GB RAM · Intel i7-14700KF ·
   Windows 11.** That is real local-inference capacity — 1–7B models run unquantized. Every
   finding carries a `runnable-where`.

**Evidence contract enforced on every agent:** every id must re-fetch at
`https://huggingface.co/api/models/<id>` or be DROPPED (no IDs from memory); every number quoted
from the API response; full candidate lists returned so overlap is detectable at merge.

## THE LICENSE TAXONOMY — six distinct traps, none visible from a downloads ranking

The most transferable finding of the sweep. "Check the license" is not one check:

1. **Plain non-commercial** (cc-by-nc-sa-4.0 / cc-by-nc-4.0). Fatal. Caught:
   `microsoft/layoutlmv3-base`, `microsoft/layoutlmv2-base-uncased`, `microsoft/layoutlmv3-large`,
   `impira/layoutlm-invoices` (the single best field-extraction fit), `rubentito/layoutlmv3-base-mpdocvqa`,
   `xiaoyao9184/surya_table_recognition`, `Zhaowc/TabPedia_v1.0`,
   `factlogic/phoenix-arabic-manuscript-htr`, the WARAJA binarization pair.
2. **CODE license is not WEIGHTS license.** `echo840/MonkeyOCR` ships Apache-2.0 code with
   "academic research and non-commercial use only" for the weights — buried at README line 1239.
   Checking the repo license alone passes it.
3. **Same family, different checkpoint, different license.** `opendatalab/MinerU2.5-2509-1.2B` is
   **agpl-3.0**; `opendatalab/MinerU2.5-Pro-2604-1.2B` is **apache-2.0**. Verify per-CHECKPOINT,
   never per-family.
4. **Revenue-capped / non-compete OpenRAIL-M.** `datalab-to/surya-ocr-2`, `datalab-to/chandra-ocr-2`:
   usable only under ~$5M revenue/funding AND barred if you "compete with any product or service
   offered by Licensor" — Datalab sells hosted document intelligence. A ticking restriction, not a
   clean pass. Same shape on MinerU (100M MAU / $20M-mo cap — nowhere near us, but it exists).
5. **No license at all = all-rights-reserved.** `nanonets/Nanonets-OCR2-3B` — the single best
   card-level fit for our job (explicit `<signature>` tag, names "legal and business documents" as
   its reason for existing) — declares NO license anywhere. Also `docling-project/TableFormerV2`
   (bare safetensors, no README), `foduucom/table-detection-and-extraction`.
6. **AGPL viral copyleft.** `keremberke/yolov8m-table-extraction` (+ -s/-n),
   `omoured/YOLOv10-Document-Layout-Analysis`. Ultralytics' default. The network-use clause against
   a closed SaaS we sell means disclosure or an Ultralytics enterprise license.

## WAVE 1 — DOCUMENT / PDF / OCR (deed PDFs, Clerk official records, LeePA scans) — 5/5 returned

### TOP PICK: docling (high confidence)
`docling-project/docling-layout-heron` (1.82M dl) + `docling-project/docling-models` (TableFormer,
2.06M dl) + `ibm-granite/granite-docling-258M` (352K dl), orchestrated by the `docling` package.

- CODE **MIT** (verified via GitHub API) · WEIGHTS **apache-2.0 / cdla-permissive-2.0**. Clean.
- **Windows-native: YES** — vendor README verbatim: "Works on macOS, Linux and Windows environments
  for both x86_64 and arm64 architectures." The only candidate in the lane with vendor-confirmed
  Windows support. olmOCR's vLLM/sglang pipeline is a real Windows risk.
- **Provenance: YES, verified in source** — docling-core `document.py`: every element carries
  `page_no` + `bbox` (ProvenanceItem). **This is why it wins for us.** We cite sources; a parser
  that returns flat text cannot ground a citation to a page.
- Maintenance: commit 08/26/2026, 65.6K GitHub stars. Everything else in the table lane is frozen
  at 2023–2024.
- runnable-where: LOCAL-CPU (layout model is 43M params) or LOCAL-GPU-16GB trivially.

**Strong second, worth a bake-off:** `opendatalab/MinerU2.5-Pro-2604-1.2B` (apache-2.0 weights,
332K dl, 1.16B params, also emits per-element bbox + page_idx, GitHub pushed 08/27/2026 — the same
day as this research). Windows install path UNVERIFIED. **Use the -Pro checkpoint; the sibling is AGPL.**

### Field extraction off a deed page
- `microsoft/udop-large` | **mit** | 83,676 dl — the only MIT model in the LayoutLMv3 capability
  tier. The direct commercial substitute for the blocked LayoutLMv3.
- `impira/layoutlm-document-qa` | **mit** | 298,922 dl — zero-shot "ask the page a question"
  (grantor? consideration? recording date?). No fine-tuning to start. Cheap first probe.
- `SCUT-DLVCLab/lilt-roberta-en-base` | **mit** | 216,460 dl — MIT structural equivalent of LayoutLM
  for token classification once OCR has run.
- `naver-clova-ix/donut-base` | **mit** — OCR-free base to fine-tune a deed-field extractor.

### Region detection (isolate the recording stamp / legal description / signature block)
- `PaddlePaddle/PP-DocLayoutV3` | **apache-2.0** | 766,665 dl | updated 07/08/2026 — highest-download,
  most actively maintained layout detector with an unambiguous commercial license.
- `juliozhao/DocLayout-YOLO-DocStructBench` | **apache-2.0** — faster single-shot alternative.

### OCR engines (all license-clean)
`zai-org/GLM-OCR` (**mit**, 1.3B — smallest strong VLM-OCR, 2.5M dl, card claims **seal/stamp**
robustness, states 1.86 pages/sec, 94.62 OmniDocBench v1.5) · `dots-studio/dots.ocr` (**mit**, 3B,
260K dl, native bbox+category JSON) · `deepseek-ai/DeepSeek-OCR` (**mit**, 2.34M dl — highest
downloads in the sweep) · `stepfun-ai/GOT-OCR2_0` (**apache-2.0**, 699K dl, older) ·
`PaddlePaddle/PP-OCRv5_server_det`/`_rec` (**apache-2.0**, CPU-viable).

### THE HONEST FINDING ON OCR — read before anyone budgets a model
**No HF OCR model card publishes field-level accuracy on names, dates, or dollar amounts.**
Every one is benchmarked on OmniDocBench/Fox, which score *markdown reconstruction and layout
fidelity* — not whether the sale price digit is correct. For a deed, the digit IS the product; a
wrong consideration figure is a shipped defect under our no-invention rule. The VLM-OCR edge over
classical is **semantic tagging** (signature/seal/checkbox awareness), not proven raw accuracy.
PaddleOCR runs on CPU, is well-characterized on degraded scans, and is far cheaper per page.

**Verdict: HF OCR is NOT proven better than classical for this job. It needs OUR bake-off on OUR
scans before anything goes production.** (The agent's own words, unprompted, against its own lane.)

### Tables (tax rolls, FDOR rollups, assessment schedules)
- `microsoft/table-transformer-detection` (**mit**, 719,313 dl) + `-structure-recognition-v1.1-all`
  (**mit**, 226,685 dl). Default pick. **Natively predicts merged/spanning cells as an object class**
  (PubTables-1M annotates "table spanning cell" + "projected row header") rather than patching them
  post-hoc — a silently-split merged cell is a data-integrity defect for us.
- `docling-project/docling-models` TableFormer — best merged-cell TEDS found (95.4 simple /
  90.1 complex) and the only Dec-2026 commit in the lane.
- `poloclub/UniTable` (**mit**) — the only candidate trained on an explicitly SCANNED dataset
  (ICDAR2019 cTDaR); best structural fit for rasterized county PDFs, but ships as a research repo,
  not a `transformers` pipeline.
- **Two limits no model solves:** rotation robustness is absent from every card (deskew upstream,
  do not shop for it), and **multi-page table continuation is orchestration logic we write
  ourselves** (stitch by header schema across the page break), not a model capability.

### Degraded / historical scans, and how we would actually TEST any of this
The testability half matters more than the model half, precisely because of the accuracy gap above:

- **`davanstrien/ocr-time-machine`** (Space, 68 likes, gradio, cloneable) — runs SIX OCR models
  side-by-side on one uploaded document. This is the "drop in a real Lee County deed and see which
  one gets the sale price right" rig, available before any engineering commitment.
- **`AqsaK/1880_census_handwritten_archives`** (cc-by-4.0) — English-language period cursive on
  archival civil forms. Closest public analog to old deed-book handwriting.
- **`Teklia/POPP-line`** (**mit**) — handwritten census/civil-record FORMS; structurally the same
  shape as a grantor/grantee index. Pairs with `Teklia/pylaia-popp` (**mit**, CPU-runnable).
- `Teklia/NorHand-v3-line`, `CATMuS/medieval-segmentation` (cc-by-4.0) — cursive/skew stress tests.
- Restoration is THIN: `SBB/sbb_binarization` (apache-2.0, CPU) and `DiTo97/binarization-segformer-b3`
  are real, but **no deskew/denoise model exists trained on legal/deed documents**, and DIBCO — the
  benchmark they optimize for — measures ink-fade and bleed-through, **not stamp-over-text**, which
  is the actual degradation on a recorded instrument. Unproven for our worst pages.
- DIBCO itself is NOT on the Hub as a dataset repo — only as model-card tags.

## WAVE 2 — ENTITY RESOLUTION / ADDRESS / EMBEDDINGS (the crosswalk gap) — 5/5 returned

### HEADLINE: four of five lanes independently returned "classical wins." The crosswalk is confirmed NOT a machine-learning problem.
This does not overturn the in-house conclusion in `docs/standards/community-crosswalk-playbook.md`
(PUD/PD boundary geometry is the fix) — it independently reproduces it from a different direction.

### Three MORE license traps, worse than Wave 1's
7. **A repo tagged with a license it does not have.** `BAAI/bge-reranker-v2-gemma` carries
   `apache-2.0` at the repo level; its base model is `google/gemma-2b` = `license:gemma`, gated,
   with a Prohibited Use Policy. The Apache tag covers BAAI's finetune code, not the weights you run.
8. **License splits by model SIZE inside one family.** `Qwen/Qwen2.5-1.5B-Instruct` = apache-2.0.
   `Qwen/Qwen2.5-3B-Instruct` = `license:other` / `qwen-research` = **non-commercial**. One size step.
9. **VAPORWARE.** `Symio-ai/legal-entity-resolver` — README describes our EXACT problem (trusts,
   LLCs, alter-ego, party-name variants, Florida Sunbiz), claims apache-2.0, and **contains no model
   files** (only `.gitattributes` + `README.md`). All 20 sibling "GLACIER" cards from that org show
   the same zero-weight pattern. **Always check the file list, not just the card.**
Also: `jinaai/jina-embeddings-v3` and both `jina-reranker-v2/v3` are **cc-by-nc-4.0**, while
`jina-embeddings-v2-small-en`/`-v2-base-en` are apache-2.0 — per-checkpoint again.
Also: `Vsevolod/company-names-similarity-sentence-transformer` (6,288 dl, the highest-traction
entity-matcher on the Hub) and `ctrlbuzz/bert-addresses` (3,480 dl, highest-traction address model)
both declare **NO license**. The most-used artifact in a lane is routinely the unusable one.

### Embeddings — no published evidence for our task
**No embedding model publishes evaluation on SHORT ENTITY STRINGS.** MTEB scores STS and retrieval
— sentences and passages. Nobody benchmarks "PELICAN BAY PH 2 BLK C" vs "Pelican Bay". Every score
available measures a different task. The only toponym-fine-tuned lineage found (LaBSE/geonames) is
Russian-relocation-domain, <100 downloads, undocumented eval.
Agent's read: this is a **lexical-overlap-with-noise-suffix problem, not a meaning problem**, and a
large semantic model may map "PELICAN BAY" and "PELICAN LANDING" together *for the right reason*
and be wrong for us. **Normalization does more work than model choice** (strip UNIT/PH/BLK/TRACT/LOT,
uppercase-fold, expand abbreviations).
If tried anyway, smallest-that-wins: `minishlab/potion-base-8M` (**mit**, 256-dim, 7.56M params,
528K dl, static/CPU-only — no GPU at all) cross-checked against
`sentence-transformers/all-MiniLM-L6-v2` (**apache-2.0**, 251M dl). Nothing above ~150M params or
768 dims is justified at 20,369 rows.

### Entity resolution — a graveyard
Every on-point artifact is a single-maintainer side project under ~200 downloads, trained on
unrelated corpora (Indian KYC names, synthetic finance counterparties, e-commerce products). Zero
eval evidence on anything resembling FL deed/parcel names.
**Classical wins outright:** deterministic blocking (ZIP/STRAP/situs) + a legal-suffix vocabulary
(TR, TRUST, UDT, LLC, LP, REV, FAM, ET UX, ET VIR, C/O) + Jaro-Winkler/Levenshtein + a
Fellegi-Sunter layer (`recordlinkage` or `splink` — maintained, MIT/Apache-family, CPU, off-Hub).
Only defensible neural piece: `themelder/arctic-embed-xs-entity-resolution` (**apache-2.0**, real
tiny weights, CPU) strictly as a blocking pre-filter — **never as the matcher of record**.

### ⚠️ ADDRESSES — THE ODbL EXPOSURE (the one legal finding in this sweep)
**Every serious address resource on HF traces back to libpostal, and libpostal is trained on
OpenStreetMap = ODbL, share-alike on derived databases.** `deepparse`'s own data README says its
training data is "generated using data from libpostal." The HF dataset
`deepparse/worldwide-addresses` is relabeled **cc-by-4.0 by the redistributor**, but the lineage
runs through OSM. **A CC-BY tag applied downstream does not discharge ODbL share-alike if the OSM
content is still present in derived form.** This matters because we SELL derived data.
Agent confidence: HIGH that HF loses to classical here; **MEDIUM** on the ODbL characterization —
it traced the lineage chain but explicitly flagged that whether downstream CC-BY relabeling
legally discharges ODbL **wants a lawyer, not another agent**. Do not resolve this in-session.
Also: `deepparse` CODE is LGPL-3.0 while its HF WEIGHTS carry no license tag at all.
**The clean answer: `usaddress`** — MIT, CRF-based, trained on OpenAddresses/Census-style data,
**no OSM lineage**, CPU-only, purpose-built for the all-caps abbreviated county-roll format
("8348 SOUTHWIND BAY CIR") that is our actual pain. Plus Mapbox (already wired, already paid) as
the geocode confirmation step. `knowledge-computing/geolm-base-toponym-recognition` is cc-by-nc-2.0.
**Clean negative: NOTHING on HF addresses unit/condo addressing.** Searches for "unit address",
"apartment number", "suite number" returned zero relevant results. Condo-vs-SFH stays an in-house
rule problem — nobody is selling a shortcut.

### Rerankers — the one W2 lane where something IS worth buying
**The scale reframe:** 81 rows × ~20 candidates ≈ **1,600 pair scorings**. Inference cost is a
rounding error. Leaderboards optimize for latency/QPS under load; **none of that constrains us.**
We are free to run the biggest model that fits, ensemble several, or run a full LLM judge with
reasoning on every pair — options a web-scale system cannot afford.
**Why a trained reranker is the WRONG tool here:** rerankers are trained on query→passage relevance
= surface overlap. There is no mechanism to tell one "UNIT/PHASE/BLK and 'OF NAPLES' are noise but
NORTH vs SOUTH is decisive." Generic relevance training scores **"PELICAN BAY NORTH" vs "PELICAN BAY
SOUTH" as highly similar** — exactly backwards, and exactly the silent wrong match that would ship
into a cited deliverable.
**Recommended:** `Qwen/Qwen3-Reranker-0.6B` (**apache-2.0**, 596M, 1.9M dl) — not a classic
cross-encoder; it is chat-templated, answering yes/no, so its score is a real `P(yes)` softmax
rather than an arbitrary logit — driven with a **custom instruction encoding our domain rule**
(its card documents a `prompts` override). Arbitrate borderline cases with `Qwen2.5-1.5B-Instruct`
(apache-2.0 — NOT the 3B) or `microsoft/Phi-3.5-mini-instruct`.
**The honest limit: NO card in the lane supplies a match/no-match threshold.** Every one shows a
sigmoid example and stops. **Calibration is entirely on us** — against the 81 ground-truth rows plus
manufactured hard negatives, with a margin rule (top score clears threshold AND beats #2 by a gap).
For a precision-critical join feeding a sold deliverable, **that calibration set IS the work**;
model choice is the easy part.

### Geospatial — nothing beats the county layer we already have
- **`landrecords/us-parcel-layer`** — 157M US parcel polygons, 94 attributes, looks like it solves
  everything. **CC BY-NC-ND 4.0**, README explicitly bans commercial use AND derivatives. Doubly
  illegal for us. The purest instance of the trap.
- `hughbertlongshanks/us_southeast_building_footprints` — NAIP imagery (0.3m, public domain) but
  ground-truth masks are "OSM and MS Building Footprints" = ODbL entanglement, and its license tag
  is a bare `cc` with no variant. CONDITIONAL, unresolved.
- `DataDock/overturemaps*` — HF mirror tagged `odbl`; **Overture's canonical license is
  CDLA-Permissive-2.0.** A mirror's tag can contradict upstream. **Never trust a mirror — name the
  upstream and go to it directly.**
- Prithvi (`ibm-nasa-geospatial/Prithvi-EO-2.0-300M`) and TerraMind are cleanly apache-2.0 with
  legitimate NASA/USGS/Copernicus provenance — and run at **10–30m per pixel**. They cannot resolve
  a building. Wrong resolution class; solving a problem we do not have.
- No commercially-usable building-footprint segmentation model exists (all unlicensed or trained on
  research-only INRIA/WHU corpora). No Lee/Collier dataset on HF (0 hits).
- **Verdict: nothing beats the PostGIS spatial join on Lee's verified 1,627-polygon PUD layer.**

## WAVE 3 — TABULAR / DATASETS / FORECASTING — 5/5 returned

### HEADLINE: the entire wave is a NO. Every lane confirmed what we already do is right.
This wave was framed around the no-invention rule rather than around "how do we impute," and that
framing is what produced usable answers instead of a shopping list.

### More license traps (10–12)
10. **The vendor's own flagship is non-commercial.** `google/tabfm-1.0.0-pytorch` / `-jax` ship under
    "TabFM Non-Commercial License v1.0" — quoted: *"freely available for your non-commercial and
    non-production use."* `LG-AI-Research/EXAONE-Tabular` = "EXAONE ... 1.2 - NC". Both tagged only
    `license:other`; you must open the license file to find out.
11. **An attribution clause that collides with our brand rule.** TabPFN (`Prior-Labs/*`) ships under
    Prior Labs License v1.1 — commercial use permitted, no revenue cap, BUT §10 requires that any
    external exposure **prominently display "Built with PriorLabs-TabPFN"**, and any distributed
    derivative be named starting with "TabPFN". Our standing rule is that output surfaces carry SWFL
    Data Gulf and no system nouns. **Internal-only use is explicitly exempt** — so it is usable for
    triage, never on a customer surface.
12. **The official org account publishing synthetic data.** `zillow/real_estate_v1` — the real
    `zillow` HF org — card states it is *"synthetically generated using gpt-4o."* Real brand, real
    account, LLM-invented content. Dropping that into a no-invention system is the purest own-goal
    available: invented numbers laundered through a name you trust.
Also NC: `Salesforce/moirai-1.0/1.1-R-*` (all six checkpoints, cc-by-nc-4.0),
`pfnet/timesfm-1.0-200m-fin` (cc-by-nc-sa-4.0), `datahiveai/Zillow-Panoramic-Property-Dataset`.

### Tabular foundation models — real, cleanly licensed, and the WRONG TOOL at our scale
Clean: `autogluon/mitra-classifier` (AWS, **apache-2.0**, 417,824 dl, no attribution string) is the
standout. Also `autogluon/tabpfn-mix-1.0-*`, `Synthefy/Nori*`, `alana89/TabSTAR` (cc-by-4.0),
`YuchenShen/FoMo-0D` (mit). `SAP/sap-rpt-1-oss` is apache-2.0 but GATED — terms behind the gate unread.
**Why it does not matter:** every model in this class is **in-context learning** — one forward pass
over a context of labeled rows, not training on your dataset. TabPFN's own README frames it as
"accurate predictions on **small data**." Native context is thousands of rows, not hundreds of
thousands. At our ~100k-row backfill scale you subsample and ensemble, which erodes exactly the edge
the papers report. **XGBoost/LightGBM trains on the full set in minutes on CPU with no context ceiling.**

### Anomaly detection / data quality — NOT A LANE ON HF, and the answer is a SQL assertion
Every "anomaly detection" hit with traction is image-defect (MVTec/VisA/BTAD) or time-series
autoencoder tutorials. The structural reason: anomaly detection over a bespoke schema is unsupervised
and dataset-specific — there is nothing to pretrain and redistribute. Nobody hosts "IsolationForest
for parcels" because IsolationForest has no weights. Corroborating evidence: the ONE real-estate
outlier artifact on the whole Hub implements outlier flagging as **a plain z-score column**.

**⚠️ ACTIONABLE, ZERO-COST — what would have caught the 34,139-row null clobber:**
a null-rate assertion on every ingest. Compare non-null count for the enriched column pre-merge vs
post-merge; **fail the job if it drops beyond ~1–2%**. One
`SELECT count(*) FILTER (WHERE col IS NOT NULL)` diff wired into the pipeline gate. Step-up: track
each column's fill-rate per run in a history table and flag when a run falls off its own historical
distribution (scikit-learn on our own metrics table — nothing downloaded).
**This is a real incident with a one-line fix. Not built — surfaced for the operator's word.**

### Real-estate datasets — a DEAD LANE
29 queries, 300+ result rows. **No dataset on HF contains real, sourced, recent property attributes
for Lee or Collier County at any grain finer than state/county aggregate index.** Nothing to add to
`docs/standards/data-roots.md`.
DO-NOT-TOUCH: `zillow/real_estate_v1` (gpt-4o synthetic), `datahiveai/Zillow-Panoramic-Property-Dataset`
(Zillow-scraped + NC), `KJJ231/redfin-data` (1.8GB parquet, no card, no license, name says it all).
`misikoff/zillow` is a 2024 snapshot at zip/county grain, `license:other` with no terms text — blocked,
stale, wrong grain. **The property appraiser + clerk-of-court lanes we already run are strictly
better: parcel-grain, dated, licensable, already the cited source of truth.**

### AVM / valuation — ~92% toy or vaporware, MEASURED
Of ~50 relevant hits: **~42 toy** (Boston housing appears 19 times; plus Ames, California, Kaggle
"USA_Housing" synthetic, single-city bootcamp assignments), **~4 vaporware** (no real weights),
**exactly 1** trained on real feature-rich US residential data — and that one,
`Scyther007/property-valuation-v4`, is license-blocked by design. Quoted from its LICENSE: forbids
*"Copying, cloning, or 'forking' the raw weights ... to any platform not controlled by Resi Inc."*
and *"Accessing or serving The Model via any infrastructure other than Authorized Resi Gateways
(e.g., self-hosting for commercial use)."* A paid gateway wearing a Hub model's clothes.
**The real reason to refuse the lane:** every apache/mit hit has 3–13 generic features and **zero
awareness of size-banding, property type, deed-vs-list price, or situs** — precisely the domain rules
this project learned the hard way. Adopting one silently reintroduces every mistake those rules exist
to prevent, inside a number that looks authoritative.

### ✅ THE TWO SHAPES THAT SURVIVE THE NO-INVENTION RULE (the constructive finding of Wave 3)
Both came from the agents, unprompted, and both are the same move — **the model routes attention or
spend; it never authors a figure:**
1. **A comp-similarity RANKER.** Its output is an ORDERING, not a number. Rank candidate comps
   honoring same-type + size-band + situs; every price in the deliverable still comes from the deed
   record of whichever comp is selected.
2. **An anomaly FLAG.** Score the residual between an already-ingested value and a
   size/type/situs-conditioned expectation; the FLAG ships to a human or a paid re-check, the model's
   number never does. Same shape for prioritizing which missing fields justify a paid API call, and
   for gating a backfill batch where the vendor's answer disagrees sharply with expectation.
Both must be built in-house on our own deed data — nothing on the Hub supplies them — and both are
gated by their own beat-the-baseline test.

### Forecasting — DON'T. And the evidence is now external as well as internal.
- `Salesforce/moirai-*` (strongest architecture in the class) is **cc-by-nc-4.0** — dead for a sold
  product. Clean: Chronos/Chronos-Bolt (`amazon/*`, apache-2.0, 31.5M dl), TimesFM (`google/timesfm-*`,
  apache-2.0), Granite TTM (`ibm-granite/*`, apache-2.0, sub-2M params), MOMENT (mit), Sundial, Toto.
- **Who actually publishes a NAIVE-baseline comparison** (the crux — a model benchmarked only against
  other neural models tells you nothing about beating "next month = this month"):
  **Chronos, TimesFM, and Moirai DO** — verified in the arXiv full text, NOT on the HF cards.
  **IBM Granite TTM verifiably DUCKS it** — the agent pulled 112KB of paper full text and grepped:
  **zero occurrences of naive/persistence**; it compares only against other deep/foundation models.
  MOMENT / Sundial / Toto: unverified, flagged as unchecked rather than asserted either way.
- Third-party ground truth: Salesforce's **GIFT-Eval** leaderboard runs Naive and Seasonal Naive as
  scored, ranked entries alongside every foundation model. (Live numeric table not scrapable — a gap,
  not a finding.)
- **~40 monthly points per ZIP is starvation-level context** for models pretrained on
  thousands-to-millions of points per series. TimesFM's own Darts comparison shows zero-shot merely
  "within significance of" classical ARIMA on the short single-series regime closest to ours.
- **Verdict: signal is plausibly there at COUNTY grain; thin-to-absent at ZIP/monthly.** "Report what
  happened, don't forecast" at ZIP grain is the evidence-backed answer — consistent with our own
  measured 42.0% vs 48.6% persistence (N=138).
- **If we ever settle it, the experiment is exact:** run Chronos-Bolt-small or TimesFM-2.5 zero-shot
  on the SAME 138 backtest windows, same geographies, same cutoffs, same direction-call definition;
  score directional hit-rate vs persistence (not MASE/CRPS); **pre-register persistence as the bar
  BEFORE running.** If it does not clear it, it is dead — no second model gets tried on hope.

## WAVE 4 — OPEN TEXT MODELS vs OUR ANTHROPIC CALLS — 5/5 returned

### HEADLINE: stay on the first-party API. Local models are BATCH-ONLY, and the numbers say so.

### Traps 13–16
13. **The vendor's own Quick Start example is non-commercial.** HF's front-page text-to-image
    tutorial uses `black-forest-labs/FLUX.1-dev` = `flux-1-dev-non-commercial-license`. The model
    they put on the landing path cannot be used by a product that sells.
14. **The Qwen 3B trap, isolated precisely.** `Qwen/Qwen2.5-3B-Instruct` LICENSE, verbatim:
    *"Qwen RESEARCH LICENSE AGREEMENT ... use ... the Materials FOR NON-COMMERCIAL PURPOSES ONLY."*
    **Every other size checked — 0.5B, 1.5B, 7B, 14B, and all of Qwen3 1.7B–14B — is apache-2.0.**
    The trap is isolated to one checkpoint in the middle of a clean family.
15. **A README that contradicts itself, with no LICENSE file.** `internlm/internlm2_5-7b-chat`:
    "weights ... fully open ... also allow free commercial usage" AND "to apply for a commercial
    license, please fill in the application form." Tag is `other`, no LICENSE in repo. **No readable
    terms exist to rely on — blocked, not "probably fine."**
16. **A tool whose Terms forbid being a backend.** LM Studio is proprietary freeware; its ToS grants
    "personal and/or internal business purposes" only and explicitly prohibits use "as a service
    bureau ... or software-as-a-service ... to any third party." Fine as a desktop GUI; can never be
    scripted into anything customer-facing.
Also blocked: `mistralai/Ministral-8B-Instruct-2410` (Mistral Research License — note
`Mistral-7B-Instruct-v0.3` IS apache-2.0; the catalog is mixed), `stabilityai/stablelm-2-12b-chat`
(non-commercial, AUP by reference), `CohereLabs/aya-expanse-8b` (cc-by-nc-4.0),
`PatronusAI/Llama-3-Patronus-Lynx-8B` (cc-by-nc-4.0), `Salesforce/xLAM-*` (cc-by-nc-4.0, every size).
CONDITIONAL: Llama 3.x (700M-MAU clause + AUP incorporated by reference), Gemma (Prohibited Use
Policy + Google's unilateral right to update and to "restrict (remotely or otherwise) usage").
Historical landmine: **TGI briefly shipped under the restrictive HFOIL license in 2023** before
reverting to Apache-2.0 — an old fork or tag carries terms the current repo does not.

### ⛔ THE NUMBER THAT DECIDES THE LOCAL-PROSE QUESTION
Vectara HHEM-2.3 leaderboard (grounded summarization, temp 0, updated 05/11/2026):
- `microsoft/phi-4` — **3.7% hallucination but only 80.7% ANSWER RATE** (silently declines 1 in 5).
- `Qwen3-8B` 4.8% / 99.9% answer · `Qwen3-14B` 5.4% / 99.9% · `granite-3.3-8b` **10.6%**.
**Why this disqualifies the lane:** that benchmark asks a model to summarize a document using only
its own content — **strictly EASIER than writing prose from supplied numbers with zero tolerance for
an unsourced digit.** These are hosted-endpoint numbers; Q4/Q5 quantization on a 4060 Ti pushes them
UP, not down. A 1-in-20 to 1-in-9 fabrication rate is not absorbable by a sold, cited product.
**The baked-narrative-first doctrine is already the right call, and a local model does not beat it.**
If a local model is used at all it is for classification/routing/rewrite — never number-bearing prose
— and its output still passes the caller's anchoring guard, never model trust.
Best-fitting models if ever needed: `Qwen/Qwen3-14B` or `microsoft/phi-4` (~14.7B) at Q4_K_M ≈8.8–9GB,
leaving 6–7GB for KV cache. bf16 on any 14B (~29GB) does NOT fit; bf16 on a 7–8B technically fits but
leaves almost no KV headroom. **Quantize; do not run raw bf16 on this card.**
`Qwen/Qwen3-4B-Instruct-2507` (apache-2.0, 3.4M dl) is the cleanest small option — a dedicated
non-thinking checkpoint, no template toggle needed.

### ⛔ THE ARCHITECTURE ANSWER — local inference is BATCH-ONLY, permanently
A model on this workstation **cannot serve live traffic** for a Vercel-hosted product, for two
independent structural reasons: (1) the box is a Windows desktop that gets turned off — no public
endpoint, no SLA, no autoscaling; (2) every Windows-native stack here is single-machine,
single-tenant, so even tunneling it puts all production behind one consumer GPU with no failover and
an unmeasured concurrency ceiling.
**The legitimate envelope:** nightly/scheduled ingest enrichment, one-off document processing,
internal QA and prompt comparison — a local script writes to Supabase, the live app reads the row.
The model is never in the request path.

### Windows viability, VERIFIED FROM VENDOR DOCS (not assumed)
- **Ollama** — MIT. Its own GPU table explicitly lists the RTX 4060 Ti (compute 8.9). Native Windows
  installer, no WSL, no Docker. **Best fit for this box.**
- **llama.cpp** — MIT. Native MSVC/CUDA build documented (`-DGGML_CUDA=ON`). Fallback for finer control.
- **vLLM** — quoted: *"vLLM does not support Windows natively."* WSL2 or unofficial community forks.
- **SGLang** — no Windows install path; open GitHub issues literally titled "Add Windows OS support."
- **TGI** — Docker-first; local install documents Linux and macOS only.
- **ONNX Runtime** — MIT, native Windows+CUDA, but a runtime not a serving stack.
Quant publishers verified live: **bartowski**, **unsloth**, **mradermacher** (GGUF); Qwen's own org
and **casperhansen** (AWQ); **RedHatAI** (FP8, successor to neuralmagic). TheBloke stopped publishing
in late 2023 — legacy, not current best practice.
**Throughput: NO measured tokens/sec for this card exists and none was invented.** Agent's words:
*"Do not quote a throughput figure for this GPU without running it."*

### ⚠️ HOSTED INFERENCE — routed providers reproduce our WORST failure shape
HF Inference Providers is a routed proxy over ~20 third-party backends with auto-selection and
automatic failover. **Unless every call pins a provider, the backend answering you changes between
requests** — which is exactly `stale-source-served-silently`, the strike shape already at 6 with a
guard owed. Worse: **`status.huggingface.co` lists Inference Endpoints as a component but NOT
Inference Providers** — no status signal for the proxy path, no published SLA, no documented
model-deprecation notice period.
Dedicated Endpoints are a structural mismatch, not a price question: docs state scale-to-zero causes
a cold start of *"a few minutes"* with 503s, and that scaling 0→1 on request *"is typically not
recommended if your application needs to be responsive."* Avoiding it means paying for an always-on
replica against bursty two-county volume.
**Verdict: stay on the first-party Anthropic path for everything it covers.** The only honest opening
is a capability Anthropic does not offer (image/video generation) — provider pinned explicitly, never
auto, with a per-model license check before anything ships.

### 🔑 STRUCTURED OUTPUT — the most counterintuitive finding of the sweep
**Forcing a JSON schema can INCREASE invention.** A grammar enforces structural validity — every
required key present, correct type — but structure and truth are orthogonal. If `consideration` is
`required: string`, the grammar **cannot emit nothing**; a value absent from the deed gets filled by
whatever the model's prior finds plausible for a dollar figure. **Constrained decoding removes
"admit absence" as a syntactically legal move.**
External evidence, not theory — **ExtractBench** (arXiv 2602.12247, Contextual AI, 08/2026), verbatim:
*"structured outputs reduce both validity and accuracy relative to prompt-based extraction: overall
validity dropped from 51% (107/210) to 37% (77/210)."* One schema was rejected outright (0/42 valid
vs 62% in prompt mode).
**The design fix:** every extractable field `["string","null"]` so **native JSON `null` is its own
grammar branch** — exactly as cheap to emit as any other token. A `"not_present"` sentinel STRING is
weaker (still a string the model can pad past). Then pair each field with a `source_span`/bbox from
the docling parse stage, so a validator can check STRUCTURALLY that the value came from somewhere —
rather than trusting a confidence score the model can equally confabulate. **This is where Wave 1's
provenance win (page_no + bbox) becomes load-bearing rather than decorative.**
Scope the grammar to shape only (keys, types, enums) — never a `minLength`/pattern that forecloses null.
Tooling: **llama.cpp GBNF** (MIT, Windows-native, JSON-schema→grammar converter in-repo) over vLLM
precisely because vLLM's Windows path is unofficial. Model: `numind/NuExtract3` (apache-2.0, 127,020
dl, ~4B, purpose-trained for extraction); fallback `numind/NuExtract-2.0-8B` (mit).
**No confabulation-rate number exists for NuExtract3 or any local model in our size class** —
ExtractBench tested only frontier hosted models. Stated, not papered over.

### ✅ FACTUALITY GUARD — the one place a model adds a capability we DON'T have
Verbatim on replacing the deterministic guard: **"downgrade for the narrow numeric-token property,
no contest."** A set-membership check (every numeric token in the output appears in the source fact
set) is 100% precise and 100% recall on that property, free, instant, no false negatives on a swapped
digit. SOTA neural verifiers sit ~90–95% balanced accuracy and **do no exact numeric matching** —
`$412,000` vs `412000` vs `$412K` is not what they were built for. **Do NOT replace the lint.**
Structural gap in the whole field: **everything verifies prose against prose.** No model takes a
structured row as the evidence side. Nobody has trained schema-aware numeric verification.
**BUT — the real find:** there is a claim class the current guard **structurally cannot see**:
> "Prices are rising fastest in Cape Coral." · "This is the strongest quarter in five years."
No invented digit. Nothing for a regex to match. A comparison/trend assertion the source may not
support — an unsourced claim shipping inside a cited deliverable, invisible to the mechanism built to
stop it. For that slice: `MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli` (184M, **mit**, 496,509 dl,
CPU) or `lytang/MiniCheck-Flan-T5-Large` (0.8B, **mit**) as a second-pass sentence-level entailment
check — evidence = the source fact bullets, claim = each generated sentence. **An ADD-ON beside the
existing lint, never a replacement.** Heavier option: `ibm-granite/granite-guardian-3.3-8b`
(apache-2.0, 214,799 dl) whose risk taxonomy explicitly includes groundedness.
Confirmed negative, so nobody re-runs it: **Llama-Guard / ShieldGemma / WildGuard are content-safety
and prompt-injection classifiers, NOT groundedness checkers.**

## WAVE 5 — FRAMEWORKS / MEMORY / EVAL / SPACES / HUB-AS-DATA — 5/5 returned

### HEADLINE: do-not-adopt across the board — the THIRD harness rejection after Writ and Omnigent.

- **Agent frameworks (smolagents).** Apache-2.0 and active, but it ships an MCP *client* — its
  native mode is consuming MCP servers, which Claude Code already does with skills/subagents/hooks
  on top. No capability gap. **Concrete defect found:** its code-execution security denylist is
  Linux-first — still-open unmerged PRs titled "block `os.system` via the `nt` module on Windows"
  and "add `nt.system` to DANGEROUS_FUNCTIONS for Windows parity." The sandbox does not block the
  Windows equivalent on the OS we run. Borrowing it is a DOWNGRADE against our hooks.
  Tool-use models are a clean license miss: **every `Salesforce/xLAM` checkpoint is cc-by-nc-4.0**;
  both `meetkai/functionary-*` declare NO license.
- **Memory/RAG.** Nothing beats Postgres full-text + pgvector at ~1,500 documents; every framework
  surveyed is an orchestration layer over that same primitive. Agent's line, and it is the right
  diagnosis: adding a framework on top of our five existing surfaces (memory dir, session log,
  checks ledger, scratchpad, graphify) **"adds a sixth place to look, which is the opposite of the
  fix."** The documented failure — research on disk going unread — is a discipline/discoverability
  problem, not a recall-quality one.
  Two late-interaction libraries are DEAD: **byaldi last pushed 01/2025 (~19mo), RAGatouille 05/2025
  (~15mo).** Only PyLate is maintained, and it is a training library.
  Trap 17: **`vidore/colpali` is tagged MIT but its base resolves to `google/paligemma` =
  `license:gemma`.** The clean sibling `vidore/colqwen2-v1.0` is apache-2.0 all the way down.
  `jinaai/jina-colbert-v2` is cc-by-nc-4.0 — Jina's embeddings, rerankers AND ColBERT are all NC at
  current versions.
  **CATALOGUE-DON'T-BUILD:** ColQwen2 does document-IMAGE retrieval (embeds page screenshots,
  skips OCR) — genuinely beyond pgvector for layout-heavy scans. **But we ingest no page images**
  (deed lanes are structured text), so there is no corpus. File it like ATTOM: known, never built.
- **Eval tooling.** `lighteval` is vendor-confirmed **Windows-unsupported** (*"completely untested
  on Windows, and we don't support it yet"*). Every framework here scores models on public academic
  benchmarks — the wrong shape for N=138 domain rows. Only transferable piece: HF `evaluate`'s
  `bootstrap` CI utility (Apache-2.0, verified in `src/evaluate/evaluator/base.py` — it wraps
  `scipy.stats.bootstrap`), which is scipy with a wrapper, not worth installing.
  `PatronusAI/glider` is cc-by-nc-4.0 (blocked). Clean judges if ever needed:
  `prometheus-eval/prometheus-7b-v2.0` (apache-2.0), `flowaicom/Flow-Judge-v0.1` (apache-2.0, base
  Phi-3.5-mini/MIT — no inheritance conflict).
  **LLM-JUDGE BIAS, cited (Zheng et al., arXiv:2306.05685, full text pulled):** position bias —
  GPT-4 **65.0%** order-consistency, Claude-v1 **23.8%**; verbosity attack (pad a correct answer
  with reworded duplicates) failure rate **Claude-v1 91.3%, GPT-3.5 91.3%**, GPT-4 8.7%;
  self-enhancement **+10 to +25 win-rate points** for judging your own family. **Any judge verdict
  needs order-swap-and-require-agreement before it is trusted** — a two-line loop, not a framework.
- **Spaces.** Product surface: hard NO, confirmed, do not revisit. Internal tooling: real value.
  Quoted from HF docs — three visibility levels, **duplicated Spaces are private by default**,
  private Spaces do not appear in search; creating a Gradio/Docker Space **requires PRO** (2-space
  ZeroGPU free exception); using existing public demos costs nothing. **Every Space found is PUBLIC
  — nothing client-identifying may go into one.**
  **`argilla/argilla-template-space`** (Argilla = Apache-2.0, verified on GitHub) is the concrete
  answer to the ground-truth problem every wave converged on. Live OCR bake-off rigs:
  `Loren/Streamlit_OCR_comparator` (RUNNING), `davanstrien/ocr-time-machine` (SLEEPING, wakes),
  `echo840/ocrbench-leaderboard` (MIT, RUNNING, pre-screen only).
  `nazianafis/Extract-Tables-From-PDF` is **PAUSED — not a usable tool right now.**
- **Hub as data infrastructure — solution looking for a problem.** The `hf://` DuckDB integration is
  a remote-file scheme (like reading S3 over HTTP), not push-down compute; we already run DuckDB
  against our own lake at zero latency. Storage quoted: free tier **100GB private**, PRO 1TB +
  $18/TB/mo pay-as-you-go. HF's own docs argue against us: *"If you plan to upload a dataset you
  anticipate won't have any further reuse, other platforms are likely more suitable."*
  **The publish-side license risk is the real finding:** a license tag we set becomes an assertion
  WE make, machine-readable and copied by every downstream tool that trusts Hub metadata. If any
  upstream source in our lake carries redistribution restrictions we have not cleared, we would be
  mis-asserting terms on someone else's data — the Overture-mirror error with us as the origin.
  Plus: a public HF repo is a Git repo — a committed credential stays recoverable from history.

## WAVE 6 — MAKING THE SURVIVORS DECIDABLE — 4/5 returned (McNemar pending)

### ⛔ THE HEADLINE REVERSAL: docling's assumed corpus DOES NOT EXIST.
**This repo holds ZERO deed images or PDFs** (verified by filesystem search: the only PDFs are
8 MarketBeat CRE reports, a firecrawl userguide, and a finished-email artifact). Both deed ingests
scrape **already-structured text** from county search grids:
- Lee: `data_lake.lee_deed_official_records` (28,186 rows / 22 dates as of 08/12/2026) — consideration
  arrives as a raw string (`$15,000.00`, `$0.00`), grantors/grantees as arrays.
- Collier: `ingest/pipelines/collier_official_records/` — **its grid does not expose consideration at
  all.** Real asymmetry vs Lee, not a bug.
There is no image→text step anywhere. An OCR-accuracy gold set has no source material today, and
getting one needs a NEW records pull against a source where **Akamai blocks all non-human-browser
access** (confirmed three ways in that pipeline's README, incl. crawl4ai hitting an Access Denied
page at `errors.edgesuite.net`).

### ✅ THE REDIRECT: the PDF corpus that IS wired
`ingest/pipelines/marketbeat_pdf/extractor.py` — **589 lines of PyMuPDF + hand-written regex
parsers, with a paid Anthropic vision fallback** when page text is shorter than MIN_TEXT_CHARS.
8 CRE broker PDFs in `ingest/drops/marketbeat_pdf/`. A live consumer, brittle per-vendor parsing,
recurring spend, and **no records request needed to try it.** Far better first target than deeds.
(Wave 7 is attacking this redirect — see its verdict before acting.)

### docling adoption dossier — clean, with two real caveats
- **Windows wheels confirmed for every package.** The one native dep, `docling-parse` 7.16.0, ships
  prebuilt `win_amd64` AND `win_arm64` wheels for cp310–cp314. **No compiler needed.** `docling`,
  `docling-core`, `docling-ibm-models` are all `py3-none-any`.
- Licenses: docling / -core / -ibm-models / -parse all **MIT** (LICENSE files fetched). HF weights
  apache-2.0. **No AGPL transitively.** (`mail-parser`'s license unresolved — minor dep, flagged
  unverified rather than asserted safe.)
- **Provenance verified in source**, `docling_core/types/doc/common/reference.py:182-192`:
  `ProvenanceItem` carries `page_no: int`, `bbox: BoundingBox`, `charspan`. Every `DocItem` has
  `prov: list[ProvenanceItem]`. First-class, not bolted on.
- **GitHub issue #3956** (closed 08/20/2026): `torch.compile` required MSVC on Windows —
  *"InvalidCxxCompiler: Compiler: cl is not found"*. **Fixed in 2.120.2** ("Do not torch compile
  models by default"); current 2.123.0 is three releases past it.
- ⚠️ **CAVEAT 1:** default `DocumentConverter()` may not OCR a scanned PDF at all unless
  `pipeline_options.do_ocr=True`. ⚠️ **CAVEAT 2:** CUDA is NOT automatic — plain `pip install` gets
  CPU-only torch (~116MB; full install 500MB–1GB). GPU needs the separate CUDA wheel index.
- ⚠️ **The honest line from the dossier:** *"provenance is a pointer to where the model thinks the
  text is, not proof the text is right."*
- 15-minute runbook + venv rollback are in the agent's report; install is UNAPPROVED and NOT DONE.

### ⚠️ CORRECTION TO WAVE 4 — the qualitative-claim guard ALREADY EXISTS
Wave 4 reported that unsourced qualitative claims are invisible to our guards. **That was wrong.**
`lib/deliverable/claims.ts` (`auditClaims`) is a mature, incident-driven, **fully deterministic**
claim-shape gate built after four real fabrications shipped 07/13/2026. It covers COMPARATIVE_QUANT,
COMPARATIVE_PHRASE, TRAJECTORY, COUNT, SEQUENCE, SPATIAL, MOTIVE, ARTIFACT_POSITIONAL,
unanchored-number, unsourced-feature, NAMED_AREA. Mechanism: code computes the relation and hands
the model a `SettledClaim` it may only restate; shapes outside the settled set are dropped,
paragraph-level, fail-closed. **This IS the architecture the HF finding recommended — already
shipped and load-bearing.**
**The real, narrower finding — a LIVE hole, read directly at `claims.ts:236-237`:**
`COMPARATIVE_PHRASE` lists only `largest|smallest|biggest|highest|lowest|priciest|cheapest`.
**"strongest" and "fastest" are absent.** So *"This is the strongest quarter in five years"* passes
clean today; *"prices are rising fastest in Cape Coral"* trips only by accident via `rising` in
`TRAJECTORY`.
**Guard coverage across 10 LLM-prose sites:** 6 recipes import `auditClaims`; 3 have weaker
numbers-only gates (`narrative-lint.ts`, `author-doc.ts`, `review-reply.ts`); and **1 has none —
`claims.ts:53` self-documents that the SOCIAL path has NO no-invention gate of any kind
(`stat.value` is free text the model writes).** That absence may matter more than the superlative gap.
**Recommendation from the agent: NEVER put an NLI model in the build path** — `gateNarrative`'s own
docstring says it is "PURE — no LLM, no I/O — unit-testable without a live key," and this stack has
no Python inference host wired. Extend the deterministic gate; scope any model to an OFFLINE review
lane over already-shipped artifacts.

### The gold set + bake-off protocol (specs produced, not executed)
- Gold set: nullable-first schema (`null` a first-class value, per Wave 4's confabulation finding),
  **N=150 paired** (90 typical + 60 hard cases, ~6 per category), 10 enumerated hard cases incl.
  nominal-$10 consideration, doc-stamp-implies-price, multi-parcel, trust/entity grantee, ET UX/TR,
  re-recorded instrument, and **Lee's own documented truncation bug** (README line 57: grantor/grantee
  *"truncates to 2 names + literal `...` if more than ~3 parties — a real data-completeness gap, not
  yet worked around"*). Scoring: per-field precision/recall PLUS a separate **confabulation rate**,
  split into pure-invention (true label null) and wrong-value. At N=150 a **spreadsheet beats Argilla**;
  escalate to Argilla only if this becomes a recurring re-label cycle.
- Bake-off: **field-level exact match after stated normalization** (dollars → integer cents, dates →
  ISO, names case/whitespace only), never page CER — *CER rewards getting 95% of a page right while
  missing the digit that turns $412,000 into $442,000.* Round 1 = zero-install screening on the free
  public Spaces, **public county records ONLY**; Round 2 local, PaddleOCR first. **Pre-registered
  decision rule: adopt a challenger only if price-FEM ≥ PaddleOCR AND confabulation = 0% AND it emits
  page+bbox AND it runs Windows-native without WSL2. No post-hoc renegotiation.**

## WAVE 7 — ADVERSARIAL KILL PASS — 5/5 returned. IT KILLED MOST OF THE SWEEP.

### 💀 KILL 1 — the docling→MarketBeat redirect is DEAD ON ARRIVAL (3 independent fatal flaws)
1. **The output is gated dead.** `refinery/sources/marketbeat-swfl-source.mts:191` requires
   `r.verified === true` for `cw_marketbeat`; `loader.py`'s `_UPSERT_COLS` never writes `verified`,
   so every row lands `false` and is filtered out. Registry comment: **"NONE of this data (261 rows
   across 3 sources) reaches the brain today; only the 48-row annual MHS Databook does."** Open check
   `ceiling_marketbeat_swfl`. **Improving extraction on data nobody reads is a no-op — fix the gate.**
   (mhs_databook survives because it uses separate `verified_vacancy/_rents/_absorption` flags.)
2. **"Eliminates paid vision spend" was FABRICATED — mine, not an agent's.** The agent live-probed
   all 8 PDFs with PyMuPDF: **minimum page text 221 chars vs `MIN_TEXT_CHARS = 200`.** Every page
   clears. The vision branch is DEAD CODE on this corpus. There is no spend to eliminate. I inferred
   the benefit from a docstring instead of measuring the files.
3. **The 589 lines are not generic plumbing.** They are two vendors' layout-drift column mappings
   with two named production incidents behind them (Charlotte County total-row swallowing a
   transaction row; 9-col medical-office layout misreading under-construction SF as a $40,000/SF
   rent). docling returns a table, not "this cell is `ytd_absorption_sqft` for Naples 2026-Q1" —
   the semantic mapping survives regardless.

### ⚠️ KILL 2 — "no deed corpus exists" was TOO STRONG (my overstatement)
Verified: **0 of 28,186+ rows carry a doc-link** (all 22 raw JSON files parsed for every distinct
key). So "we hold none" is TRUE. But `cadence_registry.yaml` Lee source_scope says verbatim:
**"leave idx 14 (doc-image links) ... unparsed"** — a DELIBERATE scoping decision, not
inaccessibility. The field was dropped before reaching disk on both ingestion methods tried.
**And the Akamai blocker is measured on the SEARCH GRID ONLY — nobody has ever probed a document-
image URL.** "Akamai blocks the corpus" was extrapolation.
Collier is genuinely closed (ceiling confirmed = 9 fields, no doc-link column).
**Honest version: no OCR ground truth exists today; Lee is a plausible future corpus gated on an
UNMEASURED fetch check, not a confirmed dead end.**
Also found: `ingest/pipelines/dbpr_public_notices/` ALREADY parses PDFs→text via an LLM (stores
`pdf_url` + summary, not the binary). A working PDF path already exists in this system.

### 💀 KILL 3 — the superlative patch, HALF-KILLED BY LIVE EXECUTION
The second-order agent RAN `auditClaims` against the real module. Measured:
- `"This is the strongest quarter in five years."` → **`[]`** — the hole is REAL. ✅
- `"Prices are rising fastest in Cape Coral."` → **already caught** by `TRAJECTORY` ("rising").
  **Half the motivating evidence was already covered.**
- **The patch does not even catch the bare form:** because the new words go inside the existing
  `the (…)` alternation, `"rising fastest"` and `"selling at the fastest pace"` **still pass after
  the change.** It catches the definite-article form only.
- **Measured precision regression — three honest, quantity-free sentences go clean → dropped:**
  *"the fastest way to get an answer is just to ask"*, *"The strongest thing I can offer you is a
  straight answer"*, *"Saturday is the busiest day for showings."* This is exactly the register
  `LETTER_SYSTEM` asks for ("Plain and warm", `agent-launch.ts:267`) and `gateLetterProse` deletes
  the WHOLE paragraph. It reopens the documented covered-lanai wound (`claims.ts:224-228`).
- **Two silent-failure paths:** `agent-launch.ts:196-203` drops a paragraph with NO LOG;
  `agent-launch.ts:329` sets the SUBJECT LINE to `""` with NO LOG — and subject lines are exactly
  where "fastest"/"hottest" register lives.
- **A second hand-maintained copy of the vocabulary exists.** `CLAIM_PROHIBITION`
  (`claims.ts:474-494`) is pasted verbatim into SIX prompts and carries nothing about rate/pace.
  Extend the regex only and the prompt tells the model not to draw a conclusion it was never told
  not to draw.
- **The lockstep tests cannot detect the drift.** `market-pulse.test.ts:376`,
  `agent-launch.test.ts:240`, `market-comps.test.ts:1112` all assert
  `expect(system).toContain(CLAIM_PROHIBITION)` — **containment of the string, never its content.**
  All three stay GREEN while the stated invariant is false.
**SURVIVES-IF (from the dedicated kill agent): ship ONLY the scoped `PERIOD_SUPERLATIVE` pattern**
(superlative + "in/since N years|months|quarters"), which requires the temporal shape that makes a
claim falsifiable. **REJECT bare-word additions** to `COMPARATIVE_PHRASE`. **REJECT the
"wire into three doors" half** — `auditClaims` needs `{sentence, anchors}`; all three doors pass
bare number arrays. That is a data-model migration, not a patch.
**The higher-severity finding is the ABSENCE, not the vocabulary:** `claims.ts:53-54` self-documents
that the SOCIAL path has NO no-invention gate of any kind (`stat.value` is free text the model writes).

### 🎯 KILL 4 — THE SWEEP'S OWN DESIGN WAS BIASED (the most useful finding in Wave 7)
- **CC BY-NC is a PURPOSE test, not an entity test** (legalcode verified: "not primarily intended
  for or directed towards commercial advantage"). An NC model used ONCE, INTERNALLY, to build a gold
  set or run a bake-off — output never shipped, never training a customer-facing artifact — has a
  real internal-use argument.
- **I applied that exemption to TabPFN (trap #11) and then never applied the same test anywhere
  else.** That inconsistency hard-blocked, before dispatch, the two models the sweep itself called
  "the obvious doc-AI pick" (`microsoft/layoutlmv3-base`) and "the single best card-level fit"
  (`nanonets/Nanonets-OCR2-3B`) — for a bake-off whose entire purpose is internal learning.
  `impira/layoutlm-invoices` is the same shape.
  **The line: fine to use internally to LEARN something; not fine the moment output persists into
  training data, a threshold, or prose reaching a customer.**
- **The hardware filter conflated two different decisions.** "Local inference is batch-only" answers
  the SERVING question. It was allowed to stand as the answer to the ONE-TIME ARCHIVAL JOB question
  too — renting a bigger GPU for two hours to build ground truth was foreclosed before any agent
  could name it.
- **Framing partially poisoned the well.** Every brief cited the freeze and pre-blessed "nothing
  beats what we have." The sweep's proudest artifact — "16 license traps" — is
  **optimizing for rigor-flavored negativity rather than value-hunting.** (Countervailing: genuine
  constructive findings did surface unprompted — the comp-ranker/anomaly-flag shapes, the null-rate
  assertion, the structured-output null insight — so agents were not purely rubber-stamping.)
- **CATEGORIES NEVER SEARCHED AT ALL:** translation/multilingual (**large Spanish-speaking
  population in SWFL — the most defensible miss**); PII detection/redaction (there is a hard
  client-data rule); call/voice transcription (**our own competitor research says interaction data
  is the moat**); synthetic data for TEST FIXTURES (only ever evaluated as a production
  contamination risk); marketing image generation (portrait generation is already live elsewhere in
  this codebase and was never cross-referenced); model distillation.

## FINAL VERDICT — what survived 35 agents and a kill pass

**ADOPT NOW: nothing.** NORTH STAR #5 stands undisturbed; this sweep did not find a reason to break it.

**THE THREE THINGS WORTH DOING, none of them a Hugging Face adoption:**
1. **Fix the `verified` gate on `marketbeat_swfl`** — 261 rows across 3 sources land and reach
   nothing. Open check `ceiling_marketbeat_swfl`. This is a real dead pipeline found by accident.
2. **The null-rate ingest assertion** — check `ingest_null_rate_assertion` opened this session. The
   34,139-row clobber had no detector; the field's own answer is a SQL assertion, not a model.
3. **The `PERIOD_SUPERLATIVE` scoped pattern + the SOCIAL-path gate absence** — TDD-first, and fix
   the `toContain(CLAIM_PROHIBITION)` tests that cannot detect their own invariant breaking.

**IF THE SWEEP IS EVER RE-RUN:** score license and hardware as USE-CASE-CONDITIONAL dimensions
(no-for-production / yes-for-internal-eval / needs-a-lawyer), never as hard pre-dispatch filters —
and search the six categories listed above that were never in scope.
4. Open text models vs our Anthropic calls (the narrative/bake path).
5. Frameworks / harnesses / memory / eval / Spaces (what the freeze was covering).
6. Depth pass on finalists.
7. Adversarial kill pass on finalists.
