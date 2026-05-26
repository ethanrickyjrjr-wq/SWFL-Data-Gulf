---
name: corridor-character-generator
description: Replace hand-authored corridor_profiles.character strings with a two-block generator (facts + speculative) backed by deterministic local data + Anthropic grounded web search
status: active
created: 2026-05-26T21:20:14Z
---

# Corridor Character Generator

## Problem

`corridor_profiles.character` (rendered verbatim to end users at `refinery/packs/cre-swfl.mts:1087`) contains 24–26 Claude-drafted strings from May 2026 with no per-claim source citations. They are both un-citable AND un-thought-provoking.

## Solution

Two-block structured output per corridor:

1. **Facts block** — verified, sourced, lint-strict. Every number verbatim from fact pack. Every claim cites internal data row or Anthropic web_search citation. No softening, no inference.
2. **Speculative block** — AI unleashed. Reads fact-pack gaps + grounded web context, produces thought-provoking inference with inline "Speculative — double-check" disclaimer. Exempt from numeric_softening ban (that's the point).
3. **Optional chart block** — when comparison is genuinely useful. Structured rows/columns, fact-pack values only.

Sources chart page at bottom of every answer: internal citations, web citations, freshness token, legal disclaimer.

## Scope

Steps 0–5. Step 0 (snapshot baseline) is SHIPPED. Steps 1–5 are in this epic.

## Canonical plan

`docs/superpowers/plans/2026-05-26-corridor-character-generator/README.md`

## Vendor

Anthropic `web_search_20260209` — locked. Per-claim citations with `cited_text` spans + raw publisher URLs. `ANTHROPIC_API_KEY` already wired in `.env.local`.

## Out of scope

FL-other-cities, statewide, national, forecasts, outlier brain, BYO overlay, Tavily pre-fetch. All deferred to `docs/ontology-and-roadmap.md`.
