# opendatalab/MinerU — "is this better than what we have?" (08/29/2026)

Source: https://github.com/opendatalab/mineru (crawl4ai, 08/29/2026) ·
https://raw.githubusercontent.com/opendatalab/MinerU/master/LICENSE.md (fetched verbatim, 08/29/2026)

## Verdict: NO. Not better — there is nothing for it to be better AT. Do not adopt.

## What "what we have" actually is (opened in-session)
- `ingest/pipelines/marketbeat_pdf/extractor.py` — PyMuPDF (`fitz`) text extraction + hand-written
  column parsers for two vendors' layouts (C&W MarketBeat, Colliers). Docstring: "Both source PDFs
  are text-based — no OCR/vision needed." Anthropic vision fallback fires only below
  `MIN_TEXT_CHARS`; the 08/27 sweep measured all 8 PDFs at ≥221 chars/page → the vision branch is
  dead code on this corpus. 589 lines of the file are the vendor-specific cell→field mappings with
  two production incidents behind them — a generic parser returns a table, not "this cell is
  `ytd_absorption_sqft` for Naples 2026-Q1".
- `ingest/pipelines/rsw_airport_monthly/pipeline.py` — pdfplumber `page.extract_tables()` on a
  text PDF.
- `ingest/requirements.txt:41-42` — `pdfplumber>=0.10`, `pymupdf>=1.23`. That is the whole PDF lane.
- **Zero scanned/image PDFs anywhere in the repo** (08/27 sweep Wave 6: "the only PDFs are 8
  MarketBeat CRE reports, a firecrawl userguide, and a finished-email artifact"). Both deed feeds
  scrape already-structured text from county search grids; there is no image→text step to improve.

## What MinerU is (from the live README)
- Document parsing engine: PDF/DOCX/PPTX/XLSX/images → Markdown/JSON, VLM+OCR dual engine, 109
  languages. 78.8k stars. Latest 3.4 (06/18/2026): pipeline OCR moved to PP-OCRv6.
- Three backends: `pipeline` (CPU ok, OmniDocBench 86.47), `vlm-engine` / `hybrid-engine`
  (GPU, 95.3–95.4), `*-http-client` (points at a vLLM/SGLang/LMDeploy server).
- Requirements table verbatim: RAM min 16GB (32GB recommended), disk min 20GB SSD, min VRAM 4GB
  (pipeline) / 8GB (engine); Windows supported but **Python 3.10–3.12 only** ("key dependency `ray`
  does not support Python 3.13 on Windows"). Docker: Linux or WSL2 only.
- 3.1.0 removed the AGPLv3 models (doclayoutyolo, mfd_yolov8) and a CC-BY-NC-SA one (layoutreader).

## License — the part that would bite us (LICENSE.md, verbatim)
Moved from AGPLv3 to "MinerU Open Source License" = Apache 2.0 plus:
- §1 commercial license required above 100M MAU or USD 20M/month revenue (irrelevant at our size).
- **§2 "Online Service Attribution Obligation": "If you provide online services to third parties
  based on MinerU, you must clearly and prominently indicate, in the relevant product or service
  interface or in publicly available documentation, that MinerU is used."**
- §3 automatic termination on non-compliance with §2.
This is trap shape #7 from the 08/27 HF sweep ("an attribution clause that would put a vendor's name
on our output surfaces"), now confirmed from the vendor's own license file rather than a model card.
It is not a blocker on its own (documentation attribution satisfies it), but it is a real term.

## Why it loses even on merits
1. Our two PDF consumers are text PDFs where PyMuPDF/pdfplumber already clear every page. A
   95-point OmniDocBench score buys nothing on a corpus where native text extraction is 100%.
2. The value in our lane is the vendor-layout→field mapping, not parsing. MinerU doesn't do that.
3. MarketBeat output is gated dead anyway (`marketbeat-swfl-source.mts:191` requires
   `verified === true`; loader never writes it; check `ceiling_marketbeat_swfl`). Better parsing
   of rows nobody reads is a no-op — the same kill that took docling off the table on 08/27.
4. Cost: 20GB disk + a 16GB-RAM floor + `ray` + a Python-version pin, to replace two `pip`
   packages that already work. RULE 11 (justify at our volume): it doesn't.
5. NORTH STAR #5: adopt nothing new until 09/18/2026.

## What would change the answer
A scanned/image corpus we actually hold and read — e.g. if a records request ever returns deed
IMAGES rather than grid text, or a broker report ships as a raster PDF and the vision branch
starts firing. At that point the bake-off is docling vs MinerU (08/27 sweep Wave 1 already
ranked docling first on MIT + verified page/bbox provenance; MinerU-Pro 2604 is the named
second). Trigger to watch: `MARKETBEAT_PDF_FORCE_VISION` ever needed, or `_vision_extract` ever
logging spend.

## Correction to the 08/27 sweep line
Wave 1 said "Use the -Pro checkpoint; the sibling is AGPL." Live README 3.1.0+: the whole project
left AGPLv3; the live constraint is the §2 attribution clause above, not copyleft.
