import { describe, expect, test } from "bun:test";
import { encodeEvent, decodeEvents, type BuildStreamEvent } from "./stream-events";

describe("stream-events codec", () => {
  test("encode produces one JSON line per event", () => {
    const ev: BuildStreamEvent = { e: "status", label: "pulling comps" };
    expect(encodeEvent(ev)).toBe('{"e":"status","label":"pulling comps"}\n');
  });

  test("decode reassembles events split across chunk boundaries", () => {
    const a = '{"e":"status","label":"x"}\n{"e":"block","id":"b1","pr';
    const b = 'ops":{"prose":"hi"}}\n';
    const first = decodeEvents(a, "");
    expect(first.events).toEqual([{ e: "status", label: "x" }]);
    const second = decodeEvents(b, first.carry);
    expect(second.events).toEqual([{ e: "block", id: "b1", props: { prose: "hi" } }]);
    expect(second.carry).toBe("");
  });

  test("a malformed line becomes an error event, not a throw", () => {
    const { events } = decodeEvents("not-json\n", "");
    expect(events[0]?.e).toBe("error");
  });
});
