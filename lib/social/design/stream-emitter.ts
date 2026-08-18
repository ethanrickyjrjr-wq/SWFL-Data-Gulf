//
// Server-side gate for the SOCIAL lane's live build stream (spec 2026-08-18).
// Same contract as the email lane's `lib/email/lab/stream-emitter.ts` — nothing
// content-bearing is written to the wire until it has passed the validation that
// already gates today's non-streaming response — and the SAME protocol module
// (`lib/email/lab/stream-events.ts`). There is deliberately no second wire format.
//
// The validation reused here is `applyDesignPatch`'s, via `TEXT_FIELDS`: a value it
// would silently drop (unknown element id, a field that element type cannot hold, an
// empty/whitespace string) must never reach the canvas through the stream either.
import { encodeEvent, type BuildStreamEvent } from "@/lib/email/lab/stream-events";
import { slotFieldFor } from "./serialize";
import type { SocialElement } from "./types";

export interface SocialBuildEmitter {
  status(label: string): void;
  /** Returns false when the slot was refused — the caller keeps going, the wire stays clean. */
  slot(id: string, text: string): boolean;
  done(payload: unknown): void;
  error(message: string): void;
}

/**
 * @param write     one NDJSON line at a time onto the response stream
 * @param skeleton  the skeleton the CLIENT submitted (`designToSkeleton` shape:
 *                  element id -> { type, ...text fields }). It is the only thing that
 *                  makes a slot id checkable — an id not in it names an element this
 *                  canvas does not have. The author lane submits none and passes `{}`,
 *                  which correctly refuses every slot.
 */
export function createSocialBuildEmitter(
  write: (s: string) => void,
  skeleton: Record<string, Record<string, string>>,
): SocialBuildEmitter {
  const emit = (ev: BuildStreamEvent) => write(encodeEvent(ev));
  return {
    status: (label) => emit({ e: "status", label }),
    slot: (id, text) => {
      const entry = skeleton[id];
      if (!entry) {
        emit({ e: "error", message: `unknown slot ${id}` });
        return false;
      }
      const field = slotFieldFor(entry.type as SocialElement["type"]);
      if (!field) {
        emit({ e: "error", message: `slot ${id} is not addressable` });
        return false;
      }
      if (typeof text !== "string" || !text.trim()) {
        emit({ e: "error", message: `slot ${id} failed validation` });
        return false;
      }
      emit({ e: "slot", id, text });
      return true;
    },
    done: (payload) => emit({ e: "done", payload }),
    error: (message) => emit({ e: "error", message }),
  };
}
