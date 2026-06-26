# Handoff — Real Estate Brand Folder

**Date:** 2026-06-26
**Commit:** 2b290770

---

## What was built

`fixtures/real-estate-brands/` — 13 brand files + 1 DBPR master list

Company names came from the **Florida DBPR Real Estate Corporations CSV** — 1,864 active licensed RE corps in Lee + Collier counties. That is the real list. It lives in `dbpr-all-corps-lee-collier.json`. Every brand slug must appear in that file before a brand profile is created.

### 13 brands profiled

| Slug | Company | Primary | Confidence | Status |
|---|---|---|---|---|
| century-21 | CENTURY 21 | #FFC72C | 1.0 | official_guide |
| powers-realty-group | Powers Realty Group, Inc. | #002D62 | 1.0 | curated |
| berkshire-hathaway-hs | BHHS Florida Realty | #670038 | 0.95 | crawled (SVG asset) |
| compass | Compass | #000000 | 0.95 | crawled |
| coldwell-banker | Coldwell Banker | #00003E | 0.90 | crawled |
| premier-sothebys | Premier Sotheby's Intl Realty | #0061A7 | 0.85 | crawled |
| john-r-wood | John R. Wood Properties | #219653 | 0.85 | crawled |
| remax | RE/MAX | #D32F2F | 0.85 | crawled |
| gulf-shore-properties | Gulf Shore Properties | #2F5496 | 0.80 | crawled |
| keller-williams | Keller Williams Realty | #0D3592 | 0.80 | crawled |
| downing-frye | Downing-Frye Realty | #006BA1 | 0.75 | crawled |
| premiere-plus-realty | Premiere Plus Realty | #0A0F3D | 0.75 | crawled |

`index.json` is the master lookup by slug.

---

## The schema to follow

`fixtures/real-estate-brands/century-21.json` is the gold standard. It is the only file with `status: "official_guide"` and a `full_palette` with every named color. Use it as the template. The key fields:

```json
{
  "slug": "...",
  "company_name": "...",
  "type": "national_franchise | local_independent",
  "affiliation": "...",
  "markets": { "counties": [...], "primary_market": "..." },
  "domain": "...",
  "brand": {
    "status": "official_guide | curated | crawled",
    "fonts": [...],
    "palette": {
      "primaryColor": "#...",
      "accentColor": "#...",
      "textColor": "#...",
      "backdropColor": "#..."
    },
    "full_palette": { "name": "#..." },
    "confidence": 0.0–1.0,
    "logo_url": "...",
    "source_url": "...",
    "notes": "..."
  },
  "dbpr_name": "EXACT NAME FROM DBPR CSV",
  "dbpr_city": "...",
  "discovered_at": "YYYY-MM-DD"
}
```

---

## What you want done next

The DBPR list has 1,864 companies. Profile the brands that matter in Lee and Collier that are not in `index.json` yet. All confirmed in `dbpr-all-corps-lee-collier.json`:

1. **MVP Realty** — Naples, Collier (`mvprealty.com`)
2. **VIP Realty Group** — Fort Myers, Lee (`viprealty.com`)
3. **Gulf Coast International Properties** — Naples, Collier (luxury)
4. **William Raveis Real Estate** — Naples, Collier
5. **DomainRealty.com LLC** — Bonita Springs, Lee
6. **Engel & Völkers Cape Coral** — Lee (DBPR: ENGEL & VOELKERS CAPE CORAL)
7. **Engel & Völkers Marco Island** — Collier (DBPR: ENGEL & VOLKERS MARCO ISLAND REALTY)
8. **Gulf to Bay Sotheby's International Realty** — Boca Grande, Lee
9. **Realty One Group MVP** — Naples, Collier

---

## How to do it

1. Check `dbpr-all-corps-lee-collier.json` — confirm the company is licensed and active in Lee or Collier before building the file.
2. Crawl the company website with crawl4ai (`C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`). PowerShell tool only — not Bash.
3. If they have an official brand guide (Brandfolder, brand.company.com, press kit) — use that first. That gets `status: "official_guide"` and `confidence: 1.0`.
4. If CSS extraction only — `status: "crawled"`, confidence 0.75–0.90 depending on how directly the color was named vs. inferred from frequency.
5. Add the new file to `index.json`.
6. Commit all new files + `index.json` + SESSION_LOG in one shot.

---

## Hard rules

- Every company name must be confirmed in `dbpr-all-corps-lee-collier.json` first. No exceptions.
- No inventing colors. Crawl the actual site.
- No skipping companies you've already built emails for.
- brandcolorcode.com is DNS-dead from this machine — do not attempt it.
