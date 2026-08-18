import { describe, it, expect } from "bun:test";
import { createSocialBuildEmitter } from "@/lib/social/design/stream-emitter";
import type { BuildStreamEvent } from "@/lib/email/lab/stream-events";

/** The submitted skeleton — exactly what `designToSkeleton` produces and what the
 *  composer POSTs: element id -> { type, <its writable text fields> }. */
const SKELETON: Record<string, Record<string, string>> = {
  head: { type: "text", text: "Your text" },
  price: { type: "stat", value: "", label: "median" },
  button: { type: "cta", text: "Learn more" },
};

function collect(): { events: BuildStreamEvent[]; write: (s: string) => void; raw: string[] } {
  const raw: string[] = [];
  const events: BuildStreamEvent[] = [];
  return {
    events,
    raw,
    write: (s: string) => {
      raw.push(s);
      for (const line of s.split("\n")) {
        if (line.trim()) events.push(JSON.parse(line) as BuildStreamEvent);
      }
    },
  };
}

describe("social stream emitter — nothing unvalidated reaches the wire", () => {
  it("FM-SLOT-1: a slot naming an element in the skeleton is emitted verbatim", () => {
    const { events, write } = collect();
    const em = createSocialBuildEmitter(write, SKELETON);
    expect(em.slot("head", "Cape Coral medians are up 4%")).toBe(true);
    expect(events).toEqual([{ e: "slot", id: "head", text: "Cape Coral medians are up 4%" }]);
  });

  it("FM-SLOT-2: an UNKNOWN slot id emits `error` and never a `slot` (Task 2's unknown-block rule)", () => {
    const { events, write } = collect();
    const em = createSocialBuildEmitter(write, SKELETON);
    expect(em.slot("not-on-the-canvas", "text the canvas has no home for")).toBe(false);
    expect(events.map((e) => e.e)).toEqual(["error"]);
    expect(events.some((e) => e.e === "slot")).toBe(false);
  });

  it("FM-SLOT-3: a multi-field element (stat) is NOT slot-addressable — the protocol carries one string", () => {
    const { events, write } = collect();
    const em = createSocialBuildEmitter(write, SKELETON);
    expect(em.slot("price", "$412K")).toBe(false);
    expect(events.map((e) => e.e)).toEqual(["error"]);
  });

  it("FM-SLOT-4: text applyDesignPatch would DROP never reaches the wire (empty / whitespace)", () => {
    const { events, write } = collect();
    const em = createSocialBuildEmitter(write, SKELETON);
    expect(em.slot("head", "   ")).toBe(false);
    expect(em.slot("head", "")).toBe(false);
    expect(events.every((e) => e.e === "error")).toBe(true);
    expect(events).toHaveLength(2);
  });

  it("FM-SLOT-5: status / done / error are NDJSON, one object per line", () => {
    const { events, raw, write } = collect();
    const em = createSocialBuildEmitter(write, SKELETON);
    em.status("reading the lake");
    em.slot("button", "See the report");
    em.done({ patch: { button: { text: "See the report" } } });
    expect(events.map((e) => e.e)).toEqual(["status", "slot", "done"]);
    expect(raw.every((s) => s.endsWith("\n"))).toBe(true);
    expect(raw.every((s) => s.split("\n").filter(Boolean).length === 1)).toBe(true);
  });
});
