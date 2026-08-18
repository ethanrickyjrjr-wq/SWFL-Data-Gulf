import { describe, expect, test } from "bun:test";
import { initialStreamState, applyStreamEvent, markTouched } from "./consume-stream";
import { seedById } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";

const skel = (): EmailDoc => seedById("trend-snapshot")!.build();

describe("consume-stream race rule — the human wins", () => {
  test("a block event fills an untouched block", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "skeleton", doc: skel() });
    const id = s.doc!.blocks[0].id;
    s = applyStreamEvent(s, {
      e: "block",
      id,
      props: { ...s.doc!.blocks[0].props, prose: "ai wrote this" },
    });
    expect((s.doc!.blocks[0].props as Record<string, unknown>).prose).toBe("ai wrote this");
  });

  test("a block event is DROPPED for a touched block", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "skeleton", doc: skel() });
    const id = s.doc!.blocks[0].id;
    s = markTouched(s, id);
    const before = s.doc!.blocks[0].props;
    s = applyStreamEvent(s, { e: "block", id, props: { prose: "ai overwrite" } });
    expect(s.doc!.blocks[0].props).toEqual(before);
  });

  test("done reconciles around touched blocks, never over them", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "skeleton", doc: skel() });
    const touchedId = s.doc!.blocks[0].id;
    s = markTouched(s, touchedId);
    const userProps = s.doc!.blocks[0].props;
    const finalDoc = skel(); // same ids as the skeleton build for this seed? if not, use structuredClone(s.doc)
    const full = structuredClone(s.doc!) as EmailDoc;
    for (const b of full.blocks) (b.props as Record<string, unknown>).prose = "final";
    s = applyStreamEvent(s, { e: "done", payload: { doc: full } });
    expect(s.finished).toBe(true);
    expect(s.doc!.blocks[0].props).toEqual(userProps); // human's block survives
    expect((s.doc!.blocks[1].props as Record<string, unknown>).prose).toBe("final"); // ai's blocks land
    void finalDoc;
  });

  test("status and error update chip state without touching the doc", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "status", label: "pulling comps" });
    expect(s.statusLabel).toBe("pulling comps");
    s = applyStreamEvent(s, { e: "error", message: "boom" });
    expect(s.errorMessage).toBe("boom");
    expect(s.doc).toBeNull();
  });
});
