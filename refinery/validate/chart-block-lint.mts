/**
 * Chart-block lint — Step 3 of the corridor-character generator plan.
 *
 * STRUCTURAL validation only. The `chart_block` of a corridor-character
 * synthesis output is either:
 *   - `null` (no chart was useful for this corridor — fine), or
 *   - `{ title: string, columns: string[], rows: cell[][] }` where every
 *     `rows[i].length === columns.length` and every cell is a string,
 *     number, or null.
 *
 * No semantic gating: this lint does NOT decide whether a chart is the right
 * shape of comparison, whether the values match the fact pack, etc. Those
 * judgments belong upstream in the prompt / human review. The point here is
 * to reject malformed JSON that would crash the consumer renderer.
 */

export type ChartCell = string | number | null;

export interface ChartBlock {
  title: string;
  columns: string[];
  rows: ChartCell[][];
}

export interface ChartLintResult {
  ok: boolean;
  errors: string[];
}

/** Type-narrow cell values without leaking the renderer's tolerance to any. */
function isCell(v: unknown): v is ChartCell {
  return v === null || typeof v === "string" || typeof v === "number";
}

export function lintChartBlock(block: unknown): ChartLintResult {
  const errors: string[] = [];

  // null is a legal value — the prompt is allowed to emit no chart.
  if (block === null) return { ok: true, errors };

  if (typeof block !== "object" || Array.isArray(block)) {
    errors.push(
      "chart_block must be null or an object {title, columns, rows}.",
    );
    return { ok: false, errors };
  }

  const b = block as Record<string, unknown>;

  if (typeof b.title !== "string" || b.title.length === 0) {
    errors.push("chart_block.title must be a non-empty string.");
  }

  if (!Array.isArray(b.columns)) {
    errors.push("chart_block.columns must be an array of strings.");
  } else {
    b.columns.forEach((c, i) => {
      if (typeof c !== "string" || c.length === 0) {
        errors.push(
          `chart_block.columns[${i}] must be a non-empty string, got ${JSON.stringify(c)}.`,
        );
      }
    });
  }

  if (!Array.isArray(b.rows)) {
    errors.push("chart_block.rows must be an array of cell arrays.");
  } else {
    const colsArr = Array.isArray(b.columns) ? b.columns : [];
    b.rows.forEach((row, ri) => {
      if (!Array.isArray(row)) {
        errors.push(`chart_block.rows[${ri}] must be an array.`);
        return;
      }
      if (colsArr.length > 0 && row.length !== colsArr.length) {
        errors.push(
          `chart_block.rows[${ri}] has ${row.length} cell(s); expected ${colsArr.length} to match columns.`,
        );
      }
      row.forEach((cell, ci) => {
        if (!isCell(cell)) {
          errors.push(
            `chart_block.rows[${ri}][${ci}] must be string|number|null, got ${typeof cell}.`,
          );
        }
      });
    });
  }

  return { ok: errors.length === 0, errors };
}
