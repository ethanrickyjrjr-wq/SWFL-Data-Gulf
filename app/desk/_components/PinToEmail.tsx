"use client";

import { useState } from "react";
import { useFiler } from "@/lib/briefcase/file-routing";
import { toast } from "sonner";
import { Pin, Check, Loader2 } from "lucide-react";

/** A brain-mirrored desk figure that can be filed as a LIVE frame recipe. */
export interface FramePinSpec {
  brainId: string;
  frameId?: string;
  metricKeys?: string[];
  title: string;
}

/**
 * Files a `frame` ProjectItem — NOT a snapshot. The item names a brain +
 * metrics and re-binds to live data at every deliverable build
 * (`bindFrameSpec`), so "pin this to my weekly client email" stays fresh and
 * gate-checked on each send. This is the desk's flywheel edge: only offered
 * on tiles whose figure is mirrored by a brain (a lake-view-only figure files
 * as a frozen highlight instead, via the site-wide highlighter).
 */
export function PinToEmail({ pin }: { pin: FramePinSpec }) {
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const { file } = useFiler();

  function handleClick() {
    if (state !== "idle") return;
    setState("saving");
    try {
      file({
        id: crypto.randomUUID(),
        added_at: new Date().toISOString(),
        origin: "web",
        kind: "frame",
        brain_id: pin.brainId,
        ...(pin.frameId ? { frame_id: pin.frameId } : {}),
        ...(pin.metricKeys ? { metric_keys: pin.metricKeys } : {}),
        title: pin.title,
      });
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      toast.error("Couldn't pin this figure");
      setState("idle");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state !== "idle"}
      title="Pin to my weekly email — refreshes with live data at every send"
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] transition-all duration-200 cursor-pointer disabled:cursor-default ${
        state === "done"
          ? "border-gulf-teal/50 bg-gulf-teal/20 text-gulf-teal"
          : "border-[#22414f] bg-[#0a1419]/80 text-[#807e76] hover:border-gulf-teal/50 hover:text-gulf-teal"
      }`}
    >
      {state === "saving" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state === "done" ? (
        <Check className="h-3 w-3" />
      ) : (
        <Pin className="h-3 w-3" />
      )}
      {state === "saving" ? "Pinning…" : state === "done" ? "Pinned" : "Pin to email"}
    </button>
  );
}
