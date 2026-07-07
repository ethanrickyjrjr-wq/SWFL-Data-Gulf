import { describe, test, expect } from "bun:test";
import { groupWatchDigests, type WatchEventForDigest } from "./watch-digest";

function ev(over: Partial<WatchEventForDigest>): WatchEventForDigest {
  return {
    id: "e1",
    project_id: "p1",
    ai_summary: "New listing 0.3 mi away: 4 bd / 2 ba",
    event_date: "2026-07-06",
    event_type: "nearby_new_listing",
    created_at: "2026-07-06T16:00:00Z",
    ...over,
  };
}

describe("groupWatchDigests", () => {
  test("one digest per project, newest event first", () => {
    const events = [
      ev({ id: "a", project_id: "p1", created_at: "2026-07-05T16:00:00Z", ai_summary: "older" }),
      ev({ id: "b", project_id: "p1", created_at: "2026-07-06T16:00:00Z", ai_summary: "newer" }),
      ev({ id: "c", project_id: "p2", ai_summary: "other project" }),
    ];
    const digests = groupWatchDigests(events, new Map([["p1", "Cape listing"]]));
    expect(digests.length).toBe(2);
    const p1 = digests.find((d) => d.project_id === "p1")!;
    expect(p1.lines).toEqual(["newer", "older"]);
    expect(p1.event_ids).toEqual(["b", "a"]);
    expect(p1.subject).toBe("Cape listing — 2 nearby updates");
  });

  test("singular subject for one event; falls back when no title", () => {
    const digests = groupWatchDigests([ev({ project_id: "p9" })], new Map());
    expect(digests[0].subject).toBe("your watched area — 1 nearby update");
  });

  test("blank ai_summary events are dropped; an all-blank project yields no digest", () => {
    const events = [
      ev({ id: "x", project_id: "p1", ai_summary: null }),
      ev({ id: "y", project_id: "p1", ai_summary: "   " }),
    ];
    expect(groupWatchDigests(events, new Map())).toEqual([]);
  });
});
