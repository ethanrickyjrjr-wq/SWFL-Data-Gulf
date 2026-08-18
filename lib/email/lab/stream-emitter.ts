//
// Server-side gate: every content-bearing event is validated BEFORE it is
// written to the stream (spec failure mode 3). A block validates by applying
// its props inside a copy of the working doc and safeParse-ing the whole doc —
// there is deliberately no second, weaker per-block schema.
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { encodeEvent, type BuildStreamEvent } from "./stream-events";

export interface BuildEmitter {
  status(label: string): void;
  skeleton(doc: unknown): boolean;
  block(workingDoc: unknown, id: string, props: Record<string, unknown>): boolean;
  done(payload: unknown): void;
  error(message: string): void;
}

export function createBuildEmitter(write: (s: string) => void): BuildEmitter {
  const emit = (ev: BuildStreamEvent) => write(encodeEvent(ev));
  return {
    status: (label) => emit({ e: "status", label }),
    skeleton: (doc) => {
      const parsed = EmailDocSchema.safeParse(doc);
      if (!parsed.success) {
        emit({ e: "error", message: "skeleton failed validation" });
        return false;
      }
      emit({ e: "skeleton", doc: parsed.data });
      return true;
    },
    block: (workingDoc, id, props) => {
      const base = EmailDocSchema.safeParse(workingDoc);
      if (!base.success) {
        emit({ e: "error", message: "working doc invalid" });
        return false;
      }
      const idx = base.data.blocks.findIndex((b) => b.id === id);
      if (idx === -1) {
        emit({ e: "error", message: `unknown block ${id}` });
        return false;
      }
      const candidate = {
        ...base.data,
        blocks: base.data.blocks.map((b, i) => (i === idx ? { ...b, props } : b)),
      };
      if (!EmailDocSchema.safeParse(candidate).success) {
        emit({ e: "error", message: `block ${id} failed validation` });
        return false;
      }
      emit({ e: "block", id, props });
      return true;
    },
    done: (payload) => emit({ e: "done", payload }),
    error: (message) => emit({ e: "error", message }),
  };
}
