/**
 * lib/email/schedule-signature.ts — the recipe "signature" used to make schedule
 * creation idempotent (Task 7, D2).
 *
 * Two schedules are "the same recipe" when this nine-column tuple matches, scoped to
 * one (user_id, project_id) and `status != 'stopped'`. Re-issuing an identical recipe
 * must UPDATE/reactivate the existing row, not insert a duplicate.
 *
 * NULL-equal is mandatory (operator-locked). The lookup matches each nullable column
 * with `IS NOT DISTINCT FROM` semantics — never `=`, because `col = NULL` returns zero
 * rows in Postgres (the NULL-distinct trap), which would silently duplicate exactly the
 * scoped recipes this feature creates. Through PostgREST that is expressed per-column as
 * `.is(col, null)` for a null target and `.eq(col, value)` for a non-null target; the
 * two together, ANDed across columns, ARE `IS NOT DISTINCT FROM`. PURE — no I/O.
 */

import type { ParsedCommand } from "./schedule-command";

export interface RecipeSignature {
  template_id: string | null;
  scope_kind: string | null;
  scope_value: string | null;
  topic: string | null;
  audience_slug: string | null;
  /** NOT NULL on the table. */
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  /** NOT NULL on the table. */
  send_hour_et: number;
}

/** The columns, in stable order, that the signature spans. */
const SIGNATURE_COLUMNS = [
  "template_id",
  "scope_kind",
  "scope_value",
  "topic",
  "audience_slug",
  "cadence",
  "day_of_week",
  "day_of_month",
  "send_hour_et",
] as const satisfies ReadonlyArray<keyof RecipeSignature>;

/** Project a parsed command onto the canonical signature tuple (undefined → null). */
export function recipeSignature(command: ParsedCommand): RecipeSignature {
  return {
    template_id: command.template_id ?? null,
    scope_kind: command.scope_kind ?? null,
    scope_value: command.scope_value ?? null,
    topic: command.topic ?? null,
    audience_slug: command.audience_slug ?? null,
    cadence: command.cadence as string,
    day_of_week: command.day_of_week ?? null,
    day_of_month: command.day_of_month ?? null,
    send_hour_et: command.send_hour_et as number,
  };
}

export type SignatureFilter =
  | { col: string; op: "eq"; value: string | number }
  | { col: string; op: "is"; value: null };

/**
 * The per-column PostgREST filters that express `IS NOT DISTINCT FROM` for the whole
 * tuple: a null target → `is null`, a non-null target → `eq value`. Applying all of
 * them to a query ANDs them — exactly NULL-equal matching, no NULL-distinct trap.
 */
export function signatureFilters(sig: RecipeSignature): SignatureFilter[] {
  return SIGNATURE_COLUMNS.map((col): SignatureFilter => {
    const value = sig[col];
    return value === null
      ? { col, op: "is", value: null }
      : { col, op: "eq", value: value as string | number };
  });
}

/** Field-by-field equality. JS `===` already treats `null === null` as true, so this
 *  is inherently NULL-equal (the Postgres trap does not exist in app code). */
export function signaturesEqual(a: RecipeSignature, b: RecipeSignature): boolean {
  return SIGNATURE_COLUMNS.every((col) => a[col] === b[col]);
}
