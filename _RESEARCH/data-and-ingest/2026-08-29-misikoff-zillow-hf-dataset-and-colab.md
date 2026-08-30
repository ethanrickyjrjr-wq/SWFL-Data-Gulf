# `misikoff/zillow` (HF) + its Colab example — "does this work?" — evaluated 08/29/2026

Asked: https://huggingface.co/datasets/misikoff/zillow +
https://colab.research.google.com/drive/1lEPLbWsOKmNBzkPWT30RCBVxhG1LWkGg (the card's "Example Notebook").
Prior ruling: `2026-08-27-huggingface-fleet-sweep.md` DO-NOT-TOUCH list ("2024 snapshot, zip/county
grain, license:other, no terms"). Re-verified live 08/29/2026 (crawl4ai + datasets-server API + drive export).

## Verdict: NO — the notebook does not run as written, and the data is a 2023 snapshot at MSA/state grain.

### The notebook is dead code on current tooling
- Cell 5: `load_dataset("misikoff/zillow", "sales", trust_remote_code=True, ...)`. The repo is a
  loading-script dataset (`zillow.py`, 26.1 kB; HF viewer disabled for that reason).
- `datasets` **4.0.0 release notes, Breaking changes:** "Remove scripts altogether (#7592) —
  `trust_remote_code` is no longer supported." Current PyPI: **5.0.1**. `!pip install datasets` in
  cell 2 pulls 5.x → cell 5 fails. Would need `datasets<4` pinned — and Colab's default Python is
  past the versions those wheels target.
- Cell 23: `mean_squared_error(..., squared=False)` — the `squared` kwarg was removed in
  scikit-learn 1.6 (deprecated 1.4). Second break even if the load is pinned back.
- Cell 9 pulls a second script dataset `misikoff/SPX` the same way — same failure.
- Content: XGBoost on `Median Sale Price` with S&P-500 adj-close as a feature, then auto-ARIMA on one
  MSA's log price. Toy analysis; nothing we would serve (INFERENCE-only, no falsifier, national grain).

### The data (measured on the parquet mirror `misikoff/zillow-viewer`, same configs per the card)
- Card header: **"Updated: 2023-02-01."** Every file in the tree: "over 2 years ago."
- `sales` config last row: **2023-12-09** (Prescott Valley, AZ). Region Type frequencies:
  zip 0 · city 0 · county 0 · **msa 253,368** · state 0 · country 1,656. **No ZIP, no county.**
- `home_values` config: **state 117,912, everything else 0.** No Lee, no Collier, no ZIP.
- License: `other`, no terms file in the tree. Zillow's own research-data terms govern anyway — and
  we already read that source directly.
- Total 2.7 GB; 8,332 downloads/month (popularity is not fitness).

### What we already hold that is strictly better (docs/standards/data-roots.md)
- `zhvi_*` / `zori_*` roots pull `https://www.zillow.com/research/data/` directly — the SAME upstream
  this dataset repackaged in 2023 — at ZIP grain, monthly, currently as-of 07/2026 in the registry
  (`ingest/cadence_registry.yaml` entries zhvi_swfl_duckdb / _tier2, tier_divergence_swfl_*, zori).
- Sold prices come from `lee_deed_official_records` / LEEPA (parcel grain, dated) — never a Zillow
  MSA median.

### Action
None. Nothing to add to data-roots. The one reusable idea — Zillow's DOM/price-cut/new-construction
CSVs — is already logged as a vendor-ceiling "DATA AVAILABLE, unpulled" line under zhvi in data-roots
(pull from zillow.com directly if ever wanted; not through a 2023 HF mirror).
