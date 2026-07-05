// lib/deliverable/band-guard-web.ts
//
// Runtime web-confirm for a band-guard outlier: projects the data-readiness
// verification ladder (`verifyMetricItem` — two web_search calls over disjoint
// authoritative domains, consensus/single/conflict) down to the `WebConfirm`
// shape the note resolver needs. Kept OUT of the pure `band-guard.ts` so that
// module stays I/O-free and unit-testable without network or the Anthropic SDK.

import { verifyMetricItem } from "../email/data-readiness";
import type { WebConfirm } from "./band-guard";
import type { ProjectItem } from "../project/items";

type MetricItem = Extract<ProjectItem, { kind: "metric" }>;

/** Confirm one outlier metric against live authoritative sources. Never throws —
 *  an infra failure returns null ("could not confirm"), which the note resolver
 *  maps to a please-confirm note rather than a false clean. */
export async function webConfirmMetric(item: MetricItem): Promise<WebConfirm | null> {
  try {
    const r = await verifyMetricItem(item);
    return {
      within_tolerance: r.within_tolerance,
      value_used: r.value_used,
      source_urls: r.source_urls,
    };
  } catch {
    return null;
  }
}
