# SWFL history comparison evidence packet

**Date:** 2026-09-18

## Problem

The repository holds long-running RSW airport observations but does not yet have a reproducible, source-period-aware comparison against Census Building Permits Survey county authorizations. Existing brain rebuild timestamps are not authoritative observation or release dates.

## Goal

Build one deterministic local command that validates immutable observation-v1 exports, selects revisions explicitly, compares each native monthly series with its exact prior-year calendar period, and renders agreement, divergence, and insufficient-evidence results with visible source and coverage limits.

## What we're building

Five counted parts:

1. Observation-v1 and manifest validation, including file hashes and duplicate identities.
2. Exact prior-year period comparisons that preserve units, frequencies, and geography.
3. A read-only manifest-driven CLI that emits deterministic JSON and Markdown plus separate invocation metadata.
4. A real RSW + Census BPS packet reconciled to Terra's retained source bytes.
5. A dated human review note outside the analytical hash.

Failure modes and guards:

- Build timestamps mistaken for observation dates -> require explicit inclusive measurement periods.
- Missing/suppressed data coerced to zero -> require null for non-observed statuses and preserve observed zero.
- Airport and county measurements silently merged -> geography participates in series identity and output labels.
- Revisions overwrite history -> observation identity includes vintage; the report declares and tests revision selection.
- Tampered or moved inputs -> relative-path containment, byte-size, SHA-256, and row-count checks.
- Partial periods presented as comparable -> quality/status gaps produce `insufficient_evidence`.
- Human interpretation changes computed facts -> review note references the analytical hash and is not read by the builder.

The usual build-registration command was intentionally not run because it writes the production checks ledger, while this authorized experiment explicitly forbids production writes. This spec provides the local build record; the integrator may register a live check after approval.
