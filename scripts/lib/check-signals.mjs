// check-signals.mjs — the live-assertion runner behind `scripts/check.mjs close`.
//
// The whole point of task 16: the CLI makes the call ITSELF. `runSignal` takes a
// check's STORED `signal` (jsonb, set at creation, immutable thereafter) and
// executes it against the live surface — HTTP GET or a PostgREST read — returning
// { ok, observed, detail }. The caller never supplies the result, so there is
// nothing for a session to fabricate. A failing/unreachable signal → ok:false →
// the close is refused. That is the guarantee, not a bug.
//
// Injected deps keep it unit-testable with no network:
//   fetchImpl  — global fetch by default (http_ok / http_body)
//   rest       — scripts/check.mjs's PostgREST helper `rest(path, init) -> body`
//   now        — Date for db_fresh age math (default real clock)
//
// Phase 1 gates on http + db only (both ride existing fetch / rest — no gh-auth
// dependency that could wedge a close). `workflow_success` is recognized-but-next.

export const SIGNAL_TYPES = [
  "http_ok",
  "http_body",
  "db_row_exists",
  "db_fresh", // alias: table_fresh
  "workflow_success",
];

// GET <url> → 2xx (or === expect_status).
export async function httpOk(signal, fetchImpl) {
  const { url, expect_status } = signal ?? {};
  if (!url) return { ok: false, observed: null, detail: "http_ok: missing url" };
  let res;
  try {
    res = await fetchImpl(url, { method: "GET" });
  } catch (e) {
    return { ok: false, observed: null, detail: `http_ok: fetch failed — ${e.message}` };
  }
  const status = res.status;
  const ok = expect_status != null ? status === expect_status : status >= 200 && status < 300;
  return {
    ok,
    observed: { status },
    detail: ok
      ? `GET ${url} → ${status}`
      : `GET ${url} → ${status} (expected ${expect_status ?? "2xx"})`,
  };
}

// GET <url> → 2xx AND body includes `contains`.
export async function httpBody(signal, fetchImpl) {
  const { url, contains } = signal ?? {};
  if (!url || contains == null)
    return { ok: false, observed: null, detail: "http_body: missing url or contains" };
  let res, text;
  try {
    res = await fetchImpl(url, { method: "GET" });
    text = await res.text();
  } catch (e) {
    return { ok: false, observed: null, detail: `http_body: fetch failed — ${e.message}` };
  }
  const status = res.status;
  const httpFine = status >= 200 && status < 300;
  const matched = String(text).includes(contains);
  const ok = httpFine && matched;
  const idx = String(text).indexOf(contains);
  const snippet =
    matched && idx >= 0
      ? String(text).slice(Math.max(0, idx - 20), idx + contains.length + 20)
      : null;
  return {
    ok,
    observed: { status, matched, snippet },
    detail: ok
      ? `GET ${url} → ${status}, body contains "${contains}"`
      : `GET ${url} → ${status}, contains=${matched}`,
  };
}

// PostgREST: at least `min` rows match `filter` on `table`. Existence = min 1.
// Uses limit=min + array length (rides the existing rest() body-only helper — no
// Content-Range header needed). `min` is meant to be small.
export async function dbRowExists(signal, rest) {
  const { table, filter, schema, min = 1 } = signal ?? {};
  if (!rest) return { ok: false, observed: null, detail: "db_row_exists: no rest client" };
  if (!table || !filter)
    return { ok: false, observed: null, detail: "db_row_exists: missing table or filter" };
  const init = schema ? { headers: { "Accept-Profile": schema } } : {};
  let rows;
  try {
    rows = await rest(`${table}?${filter}&limit=${min}`, init);
  } catch (e) {
    return { ok: false, observed: null, detail: `db_row_exists: query failed — ${e.message}` };
  }
  const count = Array.isArray(rows) ? rows.length : 0;
  const ok = count >= min;
  return {
    ok,
    observed: { count },
    detail: `${table}?${filter} → ${count} row(s) (${ok ? "≥" : "<"}${min})`,
  };
}

// PostgREST: newest `column` on `table` is within `max_age_days` of now.
export async function dbFresh(signal, rest, now) {
  const { table, column, max_age_days, schema } = signal ?? {};
  if (!rest) return { ok: false, observed: null, detail: "db_fresh: no rest client" };
  if (!table || !column || max_age_days == null)
    return { ok: false, observed: null, detail: "db_fresh: missing table/column/max_age_days" };
  const init = schema ? { headers: { "Accept-Profile": schema } } : {};
  let rows;
  try {
    rows = await rest(`${table}?select=${column}&order=${column}.desc&limit=1`, init);
  } catch (e) {
    return { ok: false, observed: null, detail: `db_fresh: query failed — ${e.message}` };
  }
  const newest = Array.isArray(rows) && rows[0] ? rows[0][column] : null;
  if (newest == null)
    return {
      ok: false,
      observed: { newest: null },
      detail: `db_fresh: ${table} has no dated ${column}`,
    };
  const newestMs = Date.parse(newest);
  if (Number.isNaN(newestMs))
    return { ok: false, observed: { newest }, detail: `db_fresh: unparseable ${column}=${newest}` };
  const ref = now instanceof Date ? now.getTime() : Date.now();
  const ageDays = Math.floor((ref - newestMs) / 86_400_000);
  const ok = ageDays <= max_age_days;
  return {
    ok,
    observed: { newest, age_days: ageDays },
    detail: `${table}.${column} newest ${newest} (${ageDays}d ${ok ? "≤" : ">"} ${max_age_days}d)`,
  };
}

// Recognized-but-next: kept so the seed checks' workflow_success signals don't
// read as "unknown type", but the close path does NOT gate on gh being authed.
export function workflowSuccess(signal) {
  return {
    ok: false,
    observed: null,
    detail: `workflow_success (${signal?.workflow ?? "?"}) not enabled in phase 1 — recognized-but-next`,
  };
}

export async function runSignal(signal, opts = {}) {
  const { rest, fetchImpl = fetch, now } = opts;
  const type = signal?.type;
  switch (type) {
    case "http_ok":
      return httpOk(signal, fetchImpl);
    case "http_body":
      return httpBody(signal, fetchImpl);
    case "db_row_exists":
      return dbRowExists(signal, rest);
    case "db_fresh":
    case "table_fresh":
      return dbFresh(signal, rest, now);
    case "workflow_success":
      return workflowSuccess(signal);
    default:
      return { ok: false, observed: null, detail: `unknown signal type: ${type ?? "(none)"}` };
  }
}
