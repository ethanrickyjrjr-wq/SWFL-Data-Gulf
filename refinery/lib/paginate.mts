/**
 * selectAllPaged — the one shared defense against PostgREST's silent
 * `db-max-rows` cap (1000 on this project). A single `.select()` — even with
 * `.limit(500000)` — returns AT MOST 1000 rows with no error, so any aggregate
 * over a >1000-row table computed from one un-paged response is a silent sample.
 * This bit `fema-nfip-source` (env-swfl ran on 1.2% of FEMA claims; FMB AAL read
 * $264/yr instead of $30,074/yr). See docs/superpowers/plans/2026-06-01-postgrest-pagination-audit.md.
 *
 * Page with `.range()` ordered by a UNIQUE column (or a composite that is unique
 * together). Without a stable total order PostgREST repeats/skips rows across
 * page seams — the silent corruption a row-count check on the WRONG column won't
 * catch. Caller supplies a thunk that builds a FRESH filtered query each page
 * (supabase query builders are single-use); the helper appends `.order()` per
 * column then `.range(from, from+pageSize-1)` and loops until a short page.
 *
 * Boundary behavior (probed live 2026-06-01): an out-of-bounds `.range()`
 * returns `{ data: [], error: null }` (HTTP 200) on this project, so the
 * short-page break terminates cleanly even when the total is an exact multiple
 * of pageSize. A PGRST103 / 416 error (some PostgREST configs answer an
 * out-of-bounds range that way) is also treated as clean end-of-data, not an
 * error — defensive against config drift.
 */

/** Minimal structural view of the supabase-js query builder this helper drives. */
export interface PagedResult<T> {
  data: T[] | null;
  error: { code?: string; message: string } | null;
}

export interface PagedQuery<T> {
  order(column: string, options: { ascending: boolean }): PagedQuery<T>;
  range(from: number, to: number): PromiseLike<PagedResult<T>>;
}

const DEFAULT_PAGE_SIZE = 1000;
/** Offset ceiling — fail loud rather than loop forever on a runaway query. */
const DEFAULT_MAX_ROWS = 250_000;
/** PostgREST "Requested Range Not Satisfiable" — an out-of-bounds page = EOF. */
const RANGE_NOT_SATISFIABLE = "PGRST103";

export async function selectAllPaged<T>(
  buildQuery: () => PagedQuery<T>,
  orderCols: string | readonly string[],
  opts?: { pageSize?: number; maxRows?: number },
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS;
  const cols = typeof orderCols === "string" ? [orderCols] : orderCols;
  if (cols.length === 0) {
    throw new Error(
      "selectAllPaged: at least one order column is required (a unique column, or " +
        "a composite that is unique together) — without a stable total order, " +
        "PostgREST pages overlap or skip.",
    );
  }

  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    if (from >= maxRows) {
      throw new Error(
        `selectAllPaged: exceeded maxRows=${maxRows} (offset ${from}); aborting to ` +
          "avoid an unbounded loop. Raise maxRows if the table is legitimately larger.",
      );
    }
    let q = buildQuery();
    for (const c of cols) q = q.order(c, { ascending: true });
    const res = await q.range(from, from + pageSize - 1);
    if (res.error) {
      if (res.error.code === RANGE_NOT_SATISFIABLE) break; // out-of-bounds page → clean EOF
      throw new Error(
        `selectAllPaged: query failed (rows ${from}-${from + pageSize - 1}) — ${res.error.message}`,
      );
    }
    const page = res.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}
