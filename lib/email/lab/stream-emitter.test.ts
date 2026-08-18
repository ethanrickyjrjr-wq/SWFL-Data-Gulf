import { describe, expect, test } from "bun:test";
import { createBuildEmitter } from "./stream-emitter";
import { decodeEvents } from "./stream-events";
import { seedById } from "@/lib/email/doc/default-docs";

function collector() {
  let out = "";
  return { write: (s: string) => (out += s), read: () => decodeEvents(out, "").events };
}

describe("stream-emitter validation gate", () => {
  test("a valid block event is emitted with its props", () => {
    const doc = seedById("trend-snapshot")!.build();
    const target = doc.blocks.find((b) => b.type === "text") ?? doc.blocks[0];
    const c = collector();
    const em = createBuildEmitter(c.write);
    const ok = em.block(doc, target.id, { ...target.props });
    expect(ok).toBe(true);
    expect(c.read()).toEqual([{ e: "block", id: target.id, props: { ...target.props } }]);
  });

  test("an invalid block never reaches the stream — error event instead", () => {
    const doc = seedById("trend-snapshot")!.build();
    const c = collector();
    const em = createBuildEmitter(c.write);
    // type-breaking props: blocks are discriminated by shape; a number where the
    // schema wants a string must fail whole-doc validation. `companyName` is a
    // DECLARED key on the header block's schema — an undeclared key (`prose`)
    // would be silently STRIPPED by z.object rather than rejected, so it could
    // never prove the gate. The contract under test is "invalid never streams".
    const ok = em.block(doc, doc.blocks[0].id, { companyName: 42 as unknown as string });
    expect(ok).toBe(false);
    const events = c.read();
    expect(events.some((e) => e.e === "block")).toBe(false);
    expect(events.some((e) => e.e === "error")).toBe(true);
  });

  test("an unknown block id is rejected", () => {
    const doc = seedById("trend-snapshot")!.build();
    const c = collector();
    const em = createBuildEmitter(c.write);
    expect(em.block(doc, "no-such-id", { prose: "x" })).toBe(false);
  });
});
