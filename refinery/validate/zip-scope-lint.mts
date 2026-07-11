/**
 * zip-scope lint — the anti-rediscovery lock for core ZIP scope.
 *
 * A pack build FAILS if any emitted detail-table row keyed by a 5-digit ZIP is not in core scope
 * (Lee + Collier = 57). This is the permanent guard behind the source-fix: pack #13 that forgets
 * the `isCoreScope` filter and starts leaking Sarasota/Charlotte/mailing ZIPs into a ranked
 * ZIP-grain table fails loudly at Stage 4 instead of silently inflating "of N SWFL ZIPs" again.
 *
 * Spec: docs/superpowers/specs/2026-07-11-zip-scope-core-design.md (§5). RULE 2.4 postmortem —
 * scope gaps that were "noted in the log" got rediscovered from scratch; this makes the gap a
 * build failure, not a diary entry.
 *
 * SCOPE OF THE CHECK: only rows whose key is a bare 5-digit ZIP. A table keyed by month, city,
 * corridor, or anything non-numeric is untouched (grain is not assumed — the key shape is the
 * trigger). Stage 4 runs this before writing; a violation aborts the run, prior brain file intact.
 */

import type { BrainOutput } from "../types/brain-output.mts";
import { isCoreScope } from "../lib/core-scope.mts";

export interface ZipScopeViolation {
  table: string;
  key: string;
  reason: string;
}

export interface ZipScopeResult {
  ok: boolean;
  violations: ZipScopeViolation[];
}

const ZIP_KEY_RE = /^\d{5}$/;

export function lintZipScope(output: Pick<BrainOutput, "detail_tables">): ZipScopeResult {
  const violations: ZipScopeViolation[] = [];
  for (const table of output.detail_tables ?? []) {
    for (const row of table.rows) {
      if (ZIP_KEY_RE.test(row.key) && !isCoreScope(row.key)) {
        violations.push({
          table: table.id,
          key: row.key,
          reason:
            `ZIP ${row.key} is outside core scope (Lee + Collier = 57). Filter this table's ` +
            `rows with isCoreScope(zip) at the source, or the "of N SWFL ZIPs" denominator inflates.`,
        });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}
