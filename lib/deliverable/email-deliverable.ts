/**
 * lib/deliverable/email-deliverable.ts — freeze a briefcase "email" deliverable into
 * the Task-2 grounded spine (`GroundedReportModel`).
 *
 * PURE + DETERMINISTIC: same row → same model → same output every render. No I/O, no
 * `new Date()`, no live brain fetch — the model is reconstructed entirely from the
 * frozen `items_snapshot` + `narrative` + the persisted ZIP scope. That is the moat:
 * the email and PDF skins can never drift from what the deliverable froze.
 *
 * Scope is grain-flexible: ZIP, place, county, or whole-region — the header only FRAMES;
 * the numbers are the frozen filed items, so no grain invents precision. A blank/unknown
 * scope is a whole-region (Southwest Florida) read, never a refusal. The model is null
 * ONLY when there is genuinely nothing to render (no figures AND no prose). The recurring
 * scheduled-send lane keeps its own ZIP-only `resolveReportZip` guard (it re-fetches live
 * by ZIP); this briefcase lane does not re-fetch, so it has no such constraint.
 */

import { resolvePlaceZip } from "@/refinery/lib/geography-gazetteer.mts";
import type { ActivationSnapshot } from "../email/activation/types";
import type { GroundedReportModel, GroundedReportScope } from "./grounded-report";
import type { ReportMetric, ReportLine } from "../email/activation/snapshot";
import type { SnapshotItem, Narrative } from "./templates";

/**
 * The frozen deliverable fields the email model reads. The DB `deliverables` row (and
 * the `/p/[id]` page's `DeliverableRow`) is a structural SUPERSET, so callers pass
 * their row directly — no shared types module needed.
 */
export interface EmailDeliverableRow {
  template: string;
  created_at: string;
  scope_kind: string | null;
  scope_value: string | null;
  items_snapshot: SnapshotItem[];
  narrative: Narrative;
}

/**
 * A render-irrelevant placeholder snapshot. `delta` is never computed for a briefcase
 * email (there is no prior snapshot to diff), so the renderer never reads these fields
 * — but we still satisfy the full `ActivationSnapshot` contract. `captured_at` derives
 * from the deliverable's freeze time (deterministic), never `new Date()`.
 */
function emptyActivationSnapshot(zip: string, capturedAt: string): ActivationSnapshot {
  return { zip, freshness_token: null, captured_at: capturedAt, metrics: [], lines: [] };
}

/**
 * The first `freshness_token` carried by any snapshot item (metric / qa / report /
 * table_slice / chart / frame may each carry one). The token is the ONE piece of
 * provenance the email skin actually renders, so we surface it even for a deliverable
 * whose metrics happen to lack one.
 */
function firstFreshnessToken(items: SnapshotItem[]): string | null {
  for (const item of items) {
    const t = (item as { freshness_token?: unknown }).freshness_token;
    if (typeof t === "string" && t.length > 0) return t;
  }
  return null;
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Title-case a free-text place value for display when it isn't in the crosswalk. */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Header/scope fields for the grounded model at WHATEVER grain the deliverable holds. The
 * numbers are the frozen filed items regardless of grain; these fields only LABEL the
 * header, so a coarser grain never invents precision. A blank/unknown scope → whole-region
 * (Southwest Florida), never a refusal. Case-insensitive on the value (the build route
 * lowercases it via `parse-scope`; the action route passes canonical case). Pure.
 *
 * The ZIP case is left byte-identical to the prior ZIP-only behavior (`primaryPlace` /
 * `countyName` stay null → the renderer shows `ZIP {zip}` / "Southwest Florida"), so
 * existing ZIP deliverables render unchanged.
 */
export function emailHeaderScope(
  scope_kind: string | null | undefined,
  scope_value: string | null | undefined,
): {
  zip: string;
  primaryPlace: string | null;
  countyName: string | null;
  scope: GroundedReportScope;
} {
  const kind = (scope_kind ?? "").trim().toLowerCase();
  const value = (scope_value ?? "").trim();

  if (kind === "zip" && value) {
    return {
      zip: value,
      primaryPlace: null,
      countyName: null,
      scope: { kind: "zip", value, grain: "zip" },
    };
  }

  if (kind === "place" && value) {
    const entry = resolvePlaceZip(value);
    const place = entry ? entry.place : titleCase(value);
    const countyName = entry ? capitalize(entry.county) : null;
    return {
      zip: "",
      primaryPlace: place,
      countyName,
      scope: { kind: "place", value: place, grain: "place" },
    };
  }

  if (kind === "county" && value) {
    const county = capitalize(value.replace(/\s*county$/i, "").trim());
    return {
      zip: "",
      primaryPlace: county,
      countyName: county,
      scope: { kind: "county", value: county, grain: "county" },
    };
  }

  // Whole-region (blank / unknown / null) — never a refusal.
  return {
    zip: "",
    primaryPlace: "Southwest Florida",
    countyName: null,
    scope: { kind: "region", value: "Southwest Florida", grain: "region" },
  };
}

export function buildEmailDeliverableModel(
  row: EmailDeliverableRow,
  opts?: { ctaUrl?: string; siteOrigin?: string },
): GroundedReportModel | null {
  const { zip, primaryPlace, countyName, scope } = emailHeaderScope(
    row.scope_kind,
    row.scope_value,
  );

  const metricItems = row.items_snapshot.filter(
    (item): item is Extract<SnapshotItem, { kind: "metric" }> => item.kind === "metric",
  );

  // Numbers: the metric item stores a pre-formatted string (e.g. "$412,000"); the raw
  // number isn't kept, so the string is the `display` and `value` stays null. The
  // renderer reads `display`, never `value`.
  const metrics: ReportMetric[] = metricItems.map((item) => ({
    key: item.metric_slug ?? item.id,
    label: item.label,
    value: null,
    display: item.value,
  }));

  // Reads: the deliverable's PROSE (exec_summary + section intros) — NOT a second copy
  // of the metrics. `renderGroundedReport` renders only `line.text`; `source_url` /
  // `source_citation` are type-required but never rendered in this skin, so they are
  // safe placeholders. The visible provenance is the freshness token, surfaced below.
  const lines: ReportLine[] = [];
  const pushLine = (label: string, text: string) => {
    if (!text) return;
    lines.push({
      brain_id: row.template,
      grain: scope.grain,
      is_true_zip: scope.kind === "zip",
      label,
      text,
      source_url: "",
      source_citation: "",
    });
  };
  pushLine("Summary", row.narrative.exec_summary ?? "");
  for (const s of row.narrative.sections ?? []) {
    pushLine(s.title, [s.title, s.intro].filter(Boolean).join(" — "));
  }

  // Never refuse for a missing ZIP — only return null when there is genuinely nothing to
  // render (no figures AND no prose). Every real build, at any grain, yields a model.
  if (metrics.length === 0 && lines.length === 0) return null;

  return {
    in_scope: true,
    zip,
    primaryPlace,
    countyName,
    freshness_token: firstFreshnessToken(row.items_snapshot),
    metrics,
    lines,
    coverage_caveats: [],
    snapshot: emptyActivationSnapshot(zip, row.created_at),
    delta: null,
    scope,
    cta_url: opts?.ctaUrl,
    site_origin: opts?.siteOrigin,
  };
}
