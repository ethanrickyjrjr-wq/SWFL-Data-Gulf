// GET /api/agent-feed/transitions -- Task 3, hermes-email-driver spec (2026-08-10), Piece 2
// "the feed". Hermes (operator's box) pulls this OUTBOUND with a stored cursor -- no inbound
// traffic to the desktop (decision 4, operator's own correction). UNIONs the real detector
// (data_lake.listing_transitions -- Piece 1, no new code) with demo-scoped rehearsal rows
// (public.agent_feed_test_events, Task 1) and stamps origin so the driver skill (Task 6)
// and any human reading the feed can never confuse a rehearsal event with a real one.
//
// Cursor = `<at ISO>|<id>`, strictly-greater paging (never >=, so the row the cursor points
// at is never re-served), capped at 50 rows/page. Empty cursor ("" or absent) reads from the
// beginning. An empty result ALWAYS echoes the input cursor back unchanged -- that's what
// makes a late/missed tick lossless (design doc decision 5): the driver's stored cursor
// never regresses and never needs special-casing for "nothing happened".
//
// `at` is ALWAYS full millisecond-precision ISO-8601 UTC (review fix, was MEDIUM-HIGH) --
// lib/agent-feed/transitions-source.ts normalizes both the date-typed real rows and the
// timestamptz-typed test rows to the same precision before they ever reach this route, so
// the plain string comparisons below (isAfterCursor / compareEvents) are safe across origins.
//
// The strictly-after filter is now pushed down to EACH source query as a keyset predicate
// (review fix, was CRITICAL -- see transitions-source.ts's CURSOR PUSHDOWN note), not just
// bounded loosely by date; isAfterCursor here is a defense-in-depth re-check, not the
// primary filter.
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

/** "" (or absent) parses to the beginning-of-time cursor: every real row sorts after it. */
function parseCursor(raw: string): Cursor {
  if (!raw) return { at: "", id: -Infinity };
  const sep = raw.lastIndexOf("|");
  if (sep === -1) return { at: raw, id: -Infinity };
  const id = Number(raw.slice(sep + 1));
  return { at: raw.slice(0, sep), id: Number.isFinite(id) ? id : -Infinity };
}

/** Strictly-greater tuple compare on (at, id) -- matches the DB-level keyset predicate. */
function isAfterCursor(ev: TransitionEvent, cursor: Cursor): boolean {
  if (ev.at > cursor.at) return true;
  if (ev.at < cursor.at) return false;
  return ev.id > cursor.id;
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

  const candidates = await fetchTransitionCandidates(cursor, PAGE_CAP);

  const page = candidates
    .filter((ev) => isAfterCursor(ev, cursor))
    .sort(compareEvents)
    .slice(0, PAGE_CAP);

  // Strip the internal `id` -- it's cursor plumbing, not part of the documented response shape.
  const events = page.map(({ id: _id, ...rest }) => rest);
  const last = page[page.length - 1];
  const next_cursor = last ? `${last.at}|${last.id}` : cursorParam;

  return NextResponse.json({ events, next_cursor });
}
