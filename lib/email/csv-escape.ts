/**
 * ONE ROOT for CSV generation — the pinned CSV/formula-injection policy
 * (check `contacts_csv_injection_policy`, decided 07/10/2026).
 *
 * POLICY: contact data is stored RAW — import never mangles a value (a leading
 * `-` in a name or an `@handle` is legitimate data). The escape happens at the
 * EXIT: any code that GENERATES a CSV builds every cell through
 * `escapeCsvCell` / `toCsvLine`, never by joining raw strings.
 *
 * Escape shape (OWASP "CSV Injection", owasp.org/www-community/attacks/CSV_Injection):
 *   - every cell is double-quoted and internal `"` doubled to `""` — a
 *     separator or quote inside the value can never start a new cell, so a
 *     formula trigger can't be smuggled to a cell boundary mid-value;
 *   - a cell whose first character is a formula trigger — `=` `+` `-` `@`,
 *     tab, CR, LF, or the full-width variants `＝＋－＠` — is prefixed with a
 *     single quote so spreadsheets read it as text.
 *
 * OWASP's own caveat applies: no CSV sanitization is bulletproof in Excel
 * after a save/re-open cycle. This is the strongest portable shape; it is a
 * viewer safety measure, not a substitute for storing the raw value.
 *
 * No CSV exporter exists in the product today (verified 07/10/2026 — every
 * CSV module is a parser). When one ships, it uses this module.
 */

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r", "\n", "＝", "＋", "－", "＠"]);

/** Escape ONE cell for a generated CSV. Null/undefined become an empty cell. */
export function escapeCsvCell(value: string | null | undefined): string {
  const raw = value ?? "";
  const neutralized = FORMULA_TRIGGERS.has(raw.charAt(0)) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

/** Build one CSV record (no trailing newline) — every cell escaped, comma-joined. */
export function toCsvLine(cells: ReadonlyArray<string | null | undefined>): string {
  return cells.map(escapeCsvCell).join(",");
}
