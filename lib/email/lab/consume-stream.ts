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
    case "skeleton":
      return { ...state, doc: ev.doc };
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
