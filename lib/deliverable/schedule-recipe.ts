/**
 * lib/deliverable/schedule-recipe.ts — the build→schedule bridge (Task 7, D1).
 *
 * Turn a built `"email"` deliverable into the RECIPE for a recurring send — never the
 * frozen snapshot. The recipe is a `ParsedCommand` the existing schedule-command path
 * (propose → confirm → write) consumes unchanged; "send weekly" then re-fetches fresh
 * data every run through Task 3's `template_id:"report"` grounded lane.
 *
 * PURE + DETERMINISTIC: no I/O, no Date. Same row + choices → same command. The copied
 * fields are a recipe only — `items_snapshot` / `narrative` never travel here, so a
 * weekly send can never re-emit the stale photograph.
 *
 * ZIP-grain by construction: a grounded "report" is keyed on a single ZIP. The scope is
 * resolved through the SHARED `resolveReportZip` (the same guard the render lane uses),
 * so the two lanes can never diverge; a non-ZIP / blank scope returns an error rather
 * than inventing sub-grain precision.
 */

import { resolveReportZip } from "../email/recurring-report";
import { validateToolInput, type ParsedCommand } from "../email/schedule-command";
import type { Cadence } from "../email/schedule-cadence";

/** The frozen deliverable fields the bridge reads. A `deliverables` row is a superset. */
export interface DeliverableRecipeRow {
  /** The deliverable id. REQUIRED for a "block-canvas" EmailDoc recipe — the cron
   *  worker re-renders the saved doc by this id. Unused by the grounded-report path. */
  id?: string;
  template: string;
  scope_kind: string | null;
  scope_value: string | null;
}

/** Normalize a frozen scope_kind to the canonical enum, or null if it isn't one. */
function asScopeKind(k: string | null): "zip" | "place" | "county" | null {
  const v = k?.trim().toLowerCase() ?? "";
  return v === "zip" || v === "place" || v === "county" ? v : null;
}

/** The send cadence + audience the user picks in the chat (Task 5). */
export interface ScheduleChoices {
  /** Omit until the user has chosen an audience; never coerced to null on the command. */
  audience_slug?: string | null;
  cadence: Cadence;
  day_of_week?: number | null;
  day_of_month?: number | null;
  send_hour_et: number;
}

export type RecipeResult = { ok: true; command: ParsedCommand } | { ok: false; error: string };

export function deliverableToScheduleRecipe(
  row: DeliverableRecipeRow,
  choices: ScheduleChoices,
): RecipeResult {
  // ── Block-canvas (Email Lab) EmailDoc lane ──
  // Re-render the user's SAVED design each occurrence (template_id "block-canvas" +
  // deliverable_id), NOT the grounded report. Unlike the report path this does NOT
  // collapse to a ZIP — an EmailDoc can be whole-region or place/county scoped; the
  // worker reads the doc + scope + branding off the deliverable row by deliverable_id.
  // Scope is carried through (normalized) only when the deliverable froze a valid one;
  // a whole-region design omits it (the NULL+NULL default), never inventing a ZIP.
  if (row.template === "block-canvas") {
    if (!row.id) {
      return {
        ok: false,
        error: "block-canvas deliverable is missing an id; cannot link a schedule",
      };
    }
    const kind = asScopeKind(row.scope_kind);
    const command: ParsedCommand = {
      action: "create",
      template_id: "block-canvas",
      deliverable_id: row.id,
      cadence: choices.cadence,
      send_hour_et: choices.send_hour_et,
      ...(kind && row.scope_value ? { scope_kind: kind, scope_value: row.scope_value } : {}),
      ...(choices.audience_slug ? { audience_slug: choices.audience_slug } : {}),
      ...(choices.day_of_week != null ? { day_of_week: choices.day_of_week } : {}),
      ...(choices.day_of_month != null ? { day_of_month: choices.day_of_month } : {}),
    };
    const v = validateToolInput(command);
    if (!v.ok) return { ok: false, error: v.errors.join("; ") };
    return { ok: true, command: v.command };
  }

  const zip = resolveReportZip(row.scope_kind, row.scope_value);
  if (!zip) {
    return {
      ok: false,
      error: `cannot schedule a non-ZIP deliverable as a recurring report (scope ${row.scope_kind ?? "—"}:${row.scope_value ?? "—"})`,
    };
  }

  const command: ParsedCommand = {
    action: "create",
    template_id: "report",
    scope_kind: "zip",
    scope_value: zip,
    cadence: choices.cadence,
    send_hour_et: choices.send_hour_et,
    ...(choices.audience_slug ? { audience_slug: choices.audience_slug } : {}),
    ...(choices.day_of_week != null ? { day_of_week: choices.day_of_week } : {}),
    ...(choices.day_of_month != null ? { day_of_month: choices.day_of_month } : {}),
  };

  // Reuse the one validator (cadence ⇒ day requirement, hour range, scope shape) so the
  // proposal is provably a valid `create` before it ever reaches the confirm/write path.
  const v = validateToolInput(command);
  if (!v.ok) return { ok: false, error: v.errors.join("; ") };
  return { ok: true, command: v.command };
}
