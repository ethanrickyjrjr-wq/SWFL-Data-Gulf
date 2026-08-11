// GET /api/agent-feed/transitions -- Task 3, hermes-email-driver spec (2026-08-10), Piece 2
// "the feed". Hermes (operator's box) pulls this OUTBOUND with a stored cursor -- no inbound
// traffic to the desktop (decision 4, operator's own correction). UNIONs the real detector
// (data_lake.listing_transitions -- Piece 1, no new code) with demo-scoped rehearsal rows
// (public.agent_feed_test_events, Task 1) and stamps origin so the driver skill (Task 6)
// and any human reading the feed can never confuse a rehearsal event with a real one.
//
// Cursor wire format (F1 fix, hermes-email-driver final review, was HIGH):
//   "<at ISO>|<id>|r:<lastRealId>|t:<lastTestId>"
// The first two segments are the legacy shared (at, id) pair -- kept for display/back-compat
// and as the FALLBACK per-source threshold when a cursor has no r:/t: segments (an old
// cursor.json already on disk from before this fix). r:/t: are each source's OWN last-served
// id (lib/agent-feed/transitions-source.ts's Cursor.realId/testId) -- see that module's F1
// header note for WHY a single shared id cross-contaminates two unrelated id sequences and
// silently drops same-calendar-date real rows.
//
// Strictly-greater paging (never >=, so the row the cursor points at is never re-served),
// capped at 50 rows/page. Empty cursor ("" or absent) reads from the beginning. An empty
// result ALWAYS echoes the input cursor back UNCHANGED (raw string, untouched) -- that's
// what makes a late/missed tick lossless (design doc decision 5): the driver's stored cursor
// never regresses and never needs special-casing for "nothing happened".
//
// `at` is ALWAYS full millisecond-precision ISO-8601 UTC (review fix, was MEDIUM-HIGH) --
// lib/agent-feed/transitions-source.ts normalizes both the date-typed real rows and the
// timestamptz-typed test rows to the same precision before they ever reach this route.
// isAfterCursor below is origin-aware (F1 fix): a "real" event compares at CALENDAR-DATE
// grain (its `at` is always midnight UTC of its date -- the column itself carries no
// time-of-day, so comparing full timestamps would wrongly treat "arrived later in the same
// day" as unserved), tie-broken on cursor.realId; a "test" event compares at full
// millisecond precision, tie-broken on cursor.testId. This is the SAME per-source rule the
// DB-level keyset filter applies (transitions-source.ts), so a row that survives the DB
// fetch is never dropped again here for the wrong reason.
//
// The strictly-after filter is pushed down to EACH source query as a per-source keyset
// predicate (transitions-source.ts's keysetFilter); isAfterCursor here is a defense-in-depth
// re-check, not the primary filter.
//
// ADDRESS SCOPING (H2b fix, hermes-email-driver review round). The spec's own
// `addresses=<optional scope>` query param (design doc Piece 2), never wired by Task 3.
// Comma-separated address_keys, parsed here and pushed down to
// fetchTransitionCandidates -- which applies `.in("address_key", keys)` on BOTH sources
// BEFORE the page cap (transitions-source.ts), so a scoped caller's 50-row cap counts only
// rows relevant to it. Omitted -- unscoped, exactly today's region-wide behavior.
//
// The Supabase client (untyped -- data_lake schema access, see transitions-source.ts's
// KNOWN-DEBT comment) is created INSIDE fetchTransitionCandidates, not here, so this route
// carries no direct dependency on the untyped hatch (mirrors lib/back-on-market/relist-fact.ts's
// defaultFetchRelistRows shape: caller passes only the query bounds, the source module owns
// its own client).
import { NextResponse } from "next/server";
import { requireScope } from "@/lib/api-tokens/scopes";
import {
  fetchTransitionCandidates,
  type Cursor,
  type TransitionEvent,
} from "@/lib/agent-feed/transitions-source";

export const runtime = "nodejs";

const PAGE_CAP = 50;

/** "" (or absent) parses to the beginning-of-time cursor: every real row sorts after it.
 *
 *  F1 fix: also parses the optional `r:<id>` / `t:<id>` per-source segments (positions 2+,
 *  order-independent). A LEGACY 2-segment cursor (no r:/t:) leaves realId/testId undefined,
 *  which every downstream reader (isAfterCursor here, keysetFilter in transitions-source.ts)
 *  falls back to the shared `id` for -- exactly the "legacy cursor still works" rule, a
 *  one-time, deliberately accepted over-serve on the very next pull (never an under-serve;
 *  claimOnce at the build seam absorbs any resulting duplicate as `duplicate:true`). */
function parseCursor(raw: string): Cursor {
  if (!raw) return { at: "", id: -Infinity };
  const segments = raw.split("|");
  const at = segments[0] ?? "";
  const parsedId = Number(segments[1]);
  const id = Number.isFinite(parsedId) ? parsedId : -Infinity;

  let realId: number | undefined;
  let testId: number | undefined;
  for (const seg of segments.slice(2)) {
    if (seg.startsWith("r:")) {
      const n = Number(seg.slice(2));
      if (!Number.isNaN(n)) realId = n;
    } else if (seg.startsWith("t:")) {
      const n = Number(seg.slice(2));
      if (!Number.isNaN(n)) testId = n;
    }
  }
  return {
    at,
    id,
    ...(realId !== undefined ? { realId } : {}),
    ...(testId !== undefined ? { testId } : {}),
  };
}

/** Comma-separated address_keys -- trimmed, empties dropped. Absent/empty param -> undefined
 *  (unscoped), never an empty array (an empty .in() filter would match zero rows, which is
 *  the opposite of "no scope"). */
function parseAddresses(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return keys.length > 0 ? keys : undefined;
}

/** Strictly-after compare, ORIGIN-AWARE (F1 fix) -- matches the per-source DB-level keyset
 *  exactly, so a row the DB fetch legitimately returns is never dropped here for comparing
 *  the wrong grain or the wrong source's id.
 *
 *  "real": listing_transitions.at is a Postgres DATE column -- every real event's
 *  normalized `at` is midnight UTC of its date, carrying no time-of-day at all. Comparing
 *  full timestamps here (as the old shared-cursor code did) would treat a same-calendar-date
 *  row that simply lacks a "late enough" time-of-day as still-unserved-but-excluded once the
 *  cursor's `at` had a later time component from a DIFFERENT source that day -- the exact
 *  shadow bug this fix closes. Truncate both sides to the date part before comparing;
 *  tie-break on `cursor.realId` (this source's own last-served id), never `cursor.testId`.
 *
 *  "test": agent_feed_test_events.at is timestamptz -- full millisecond-precision compare,
 *  tie-broken on `cursor.testId`. */
function isAfterCursor(ev: TransitionEvent, cursor: Cursor): boolean {
  if (ev.origin === "real") {
    const realId = cursor.realId ?? cursor.id;
    const evDate = ev.at.slice(0, 10);
    const cursorDate = cursor.at.slice(0, 10);
    if (evDate > cursorDate) return true;
    if (evDate < cursorDate) return false;
    return ev.id > realId;
  }
  const testId = cursor.testId ?? cursor.id;
  if (ev.at > cursor.at) return true;
  if (ev.at < cursor.at) return false;
  return ev.id > testId;
}

function compareEvents(a: TransitionEvent, b: TransitionEvent): number {
  if (a.at < b.at) return -1;
  if (a.at > b.at) return 1;
  return a.id - b.id;
}

export async function GET(req: Request) {
  const scoped = await requireScope(req, "agent_feed_read");
  if (scoped instanceof Response) return scoped;

  const url = new URL(req.url);
  const cursorParam = url.searchParams.get("cursor") ?? "";
  const cursor = parseCursor(cursorParam);
  const addressKeys = parseAddresses(url.searchParams.get("addresses"));

  const candidates = await fetchTransitionCandidates(cursor, PAGE_CAP, addressKeys);

  const page = candidates
    .filter((ev) => isAfterCursor(ev, cursor))
    .sort(compareEvents)
    .slice(0, PAGE_CAP);

  // Strip the internal `id` -- it's cursor plumbing, not part of the documented response shape.
  const events = page.map(({ id: _id, ...rest }) => rest);
  const last = page[page.length - 1];

  // F1 fix: next_cursor tracks each source's own running max id -- "max per source" -- never
  // just the LAST sorted event's id (which could be either origin, and would silently
  // regress or lose the other source's progress if applied to both r: and t:). A source with
  // no events in THIS page keeps its prior threshold unchanged (never regresses).
  let nextRealId = cursor.realId ?? cursor.id;
  let nextTestId = cursor.testId ?? cursor.id;
  for (const ev of page) {
    if (ev.origin === "real" && ev.id > nextRealId) nextRealId = ev.id;
    if (ev.origin === "test" && ev.id > nextTestId) nextTestId = ev.id;
  }
  const next_cursor = last ? `${last.at}|${last.id}|r:${nextRealId}|t:${nextTestId}` : cursorParam;

  return NextResponse.json({ events, next_cursor });
}
