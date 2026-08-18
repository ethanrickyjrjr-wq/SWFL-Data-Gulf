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

  // A RESEAT IS NOT A LICENCE TO OVERWRITE. The user can edit between the Build
  // click and the first `skeleton` beat — the window is small but it is the one
  // moment the canvas already holds their doc and the stream has not spoken yet.
  // Before this, `skeleton` replaced the doc wholesale: the edit was reverted,
  // its id stayed in `touched` (so every later `block` beat skipped it), and
  // `done`'s merge then read the SERVER's copy back out of `state.doc` — the
  // human's words were gone from a lane whose whole promise is that they aren't.
  test("a skeleton reseat KEEPS a touched block the user edited before it arrived", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "skeleton", doc: skel() });
    const touchedId = s.doc!.blocks[0].id;
    // The user types into a block, and the shell reports it: markTouched + the
    // doc they produced (exactly what noteUserBlockEdit does in the grid shell).
    const edited = structuredClone(s.doc!) as EmailDoc;
    (edited.blocks[0].props as Record<string, unknown>).prose = "the human wrote this";
    s = { ...markTouched(s, touchedId), doc: edited };
    // The primary lane's skeleton carries the SAME ids as the canvas doc.
    const reseat = structuredClone(s.doc!) as EmailDoc;
    for (const b of reseat.blocks) (b.props as Record<string, unknown>).prose = "server skeleton";
    s = applyStreamEvent(s, { e: "skeleton", doc: reseat });
    expect((s.doc!.blocks[0].props as Record<string, unknown>).prose).toBe("the human wrote this");
    // …and every block they did NOT touch reseats from the server.
    expect((s.doc!.blocks[1].props as Record<string, unknown>).prose).toBe("server skeleton");
  });

  test("a skeleton whose ids are all different replaces everything (last one wins)", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "skeleton", doc: skel() });
    s = markTouched(s, s.doc!.blocks[0].id);
    // A builder fallthrough reseats a DIFFERENT doc — fresh ids, nothing to keep.
    const fresh = skel();
    expect(fresh.blocks[0].id).not.toBe(s.doc!.blocks[0].id);
    s = applyStreamEvent(s, { e: "skeleton", doc: fresh });
    expect(s.doc!.blocks.map((b) => b.id)).toEqual(fresh.blocks.map((b) => b.id));
    expect(s.doc!.blocks[0].props).toEqual(fresh.blocks[0].props);
  });

  test("status and error update chip state without touching the doc", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "status", label: "pulling comps" });
    expect(s.statusLabel).toBe("pulling comps");
    s = applyStreamEvent(s, { e: "error", message: "boom" });
    expect(s.errorMessage).toBe("boom");
    expect(s.doc).toBeNull();
  });
});
