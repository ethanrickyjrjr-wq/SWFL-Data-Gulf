# 07 · asset-factory (GHA, NOT Vercel)
**Model:** Sonnet | **Group:** independent | **deps:** none | **owner:** ingest-engineer

## Goal
A GHA workflow that renders Graphite-designed SVG headers/dividers to Outlook-safe PNGs via Inkscape `--pipe` and uploads them to `email-media`.

## Research (build-time, RULE 0.4)
- Inkscape `--pipe`: `gitlab.com/inkscape/inkscape` → `inkscape --pipe --export-type=png --export-dpi=144 < in.svg > out.png`. Extensions: `inkscape.gitlab.io/extensions` (Python injection of data into SVG by element id).

## Files
- NEW `.github/workflows/email-assets.yml` — install Inkscape, convert SVG→PNG, upload to `email-media` (service-role).
- NEW `ingest/email_assets/` (optional) — Python extension to inject data into SVG templates.

## Spec
- Runs in GHA/local ONLY (no desktop binaries on Vercel).
- Output PNGs referenced by blocks via `email-media` URLs.

## Acceptance
- A sample SVG header → PNG in `email-media`, renders in Outlook.
