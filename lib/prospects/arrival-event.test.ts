// lib/prospects/arrival-event.test.ts
import { describe, expect, test } from "bun:test";
import { parseArrivalRef } from "./arrival-event";

const RID = "3f6c2a1e-9b4d-4e6f-8a2b-1c5d7e9f0a1b";

describe("parseArrivalRef", () => {
  test("round-trips a valid ref for every touch", () => {
    for (const touch of ["t1", "t2", "t3", "t4", "trial", "reengage"]) {
      expect(parseArrivalRef(`${RID}-${touch}`)).toEqual({ rid: RID, touch });
    }
  });
  test("rejects garbage, wrong touch, short uuid, null", () => {
    expect(parseArrivalRef("not-a-ref")).toBeNull();
    expect(parseArrivalRef(`${RID}-t9`)).toBeNull();
    expect(parseArrivalRef(`${RID.slice(0, 20)}-t1`)).toBeNull();
    expect(parseArrivalRef(null)).toBeNull();
    expect(parseArrivalRef(undefined)).toBeNull();
  });
});
