# Free-data RSW and Census BPS research captures

**Date:** 2026-09-18

## Problem

RSW discovery only recognized an obsolete CDN link shape, while the official publisher serves
current files from `www.flylcpa.com/app/uploads/`.  Lee/Collier permit history needed a
source-backed local experiment without creating a production pipeline or lake table.

## Goal

Provide immutable, local-only raw captures and observation-v1 JSONL/manifest exports for current
RSW releases and official Census BPS county history. Keep production tables/consumers unchanged.

## What we're building

Counted parts (3):

1. RSW deterministic publisher discovery, PDF validation, exact-prior-year YoY, per-metric
   state reporting, and an opt-in local capture/export mode.
2. Census BPS local-only capture command, county/FIPS parser, resumable raw archive, coverage
   matrix, and observation export preserving reported/estimated distinctions.
3. One FDOT continuous-counter qualification attempt and the narrow RSW Python-3.12 workflow
   alignment; no activation or scheduler change.

Failure guards: only LCPA/legacy-CDN PDF URLs are accepted; non-PDF/short downloads fail; missing
prior years cannot create mislabeled YoY; capture roots are explicit, contained, and have a free
space floor; BPS absent/suppressed values stay null; no research command has a database or cloud
write path.
