//
// Pure reducer the canvas runs over stream events. THE RACE RULE LIVES HERE:
// once a user touches a block, no AI event may overwrite it (spec failure
// mode 1). Keeping this pure (no React, no fetch) is what makes the rule
// testable without a browser.
import type { EmailDoc } from "@/lib/email/doc/types";
import type { BuildStreamEvent } from "./stream-events";

export interface StreamCanvasState {
  doc: EmailDoc | null;
  touched: Set<string>;
  statusLabel: string | null;
  finished: boolean;
  errorMessage: string | null;
}

export function initialStreamState(): StreamCanvasState {
  return {
    doc: null,
    touched: new Set(),
    statusLabel: null,
    finished: false,
    errorMessage: null,
  };
}

export function markTouched(state: StreamCanvasState, blockId: string): StreamCanvasState {
  const touched = new Set(state.touched);
  touched.add(blockId);
  return { ...state, touched };
}

export function applyStreamEvent(
  state: StreamCanvasState,
  ev: BuildStreamEvent,
): StreamCanvasState {
  switch (ev.e) {
    case "status":
      return { ...state, statusLabel: ev.label };
    case "skeleton": {
      // A RESEAT IS NOT A LICENCE TO OVERWRITE (Ruling 11, amending Ruling 8).
      // The reseat itself is still last-one-wins — a builder fallthrough hands
      // us a different doc and that doc is the canvas. But the primary lane's
      // skeleton carries the SAME block ids the canvas already has, and the user
      // can edit in the window between the Build click and the first beat. Left
      // wholesale, that edit was reverted here, its id stayed in `touched` (so
      // every later `block` beat skipped it), and `done` then read the SERVER's
      // copy back out of `state.doc` — the human's words gone for good from the
      // one lane whose whole promise is that they aren't.
      //
      // So: any touched id present in BOTH docs keeps the props we already hold.
      // Ids that don't match reseat wholesale, which is the fallthrough case.
      if (!state.doc || state.touched.size === 0) return { ...state, doc: ev.doc };
      const mine = new Map(state.doc.blocks.map((b) => [b.id, b]));
      return {
        ...state,
        doc: {
          ...ev.doc,
          blocks: ev.doc.blocks.map((b) =>
            state.touched.has(b.id) && mine.has(b.id)
              ? ({ ...b, props: mine.get(b.id)!.props } as typeof b)
              : b,
          ),
        },
      };
    }
    case "block": {
      if (!state.doc || state.touched.has(ev.id)) return state;
      return {
        ...state,
        doc: {
          ...state.doc,
          blocks: state.doc.blocks.map((b) =>
            b.id === ev.id ? ({ ...b, props: ev.props } as typeof b) : b,
          ),
        },
      };
    }
    case "done": {
      const payload = ev.payload as { doc?: EmailDoc } | undefined;
      const full = payload?.doc;
      if (!full || !state.doc) return { ...state, finished: true, statusLabel: null };
      const mine = new Map(state.doc.blocks.map((b) => [b.id, b]));
      return {
        ...state,
        finished: true,
        statusLabel: null,
        doc: {
          ...full,
          blocks: full.blocks.map((b) =>
            state.touched.has(b.id) && mine.has(b.id) ? mine.get(b.id)! : b,
          ),
        },
      };
    }
    case "error":
      return { ...state, errorMessage: ev.message, statusLabel: null };
    case "slot":
      return state; // social lane; email canvas ignores it
    default:
      return state;
  }
}
