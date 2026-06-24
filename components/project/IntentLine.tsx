"use client";
import { useState } from "react";

type Phase =
  | { k: "idle" }
  | { k: "picking" }
  | { k: "filling" }
  | { k: "done"; name: string }
  | { k: "fail" };

export function IntentLine({
  onSubmit,
}: {
  onSubmit: (intent: string) => Promise<{ template: { name: string }; id: string } | null>;
}) {
  const [intent, setIntent] = useState("");
  const [phase, setPhase] = useState<Phase>({ k: "idle" });

  async function go() {
    if (!intent.trim()) return;
    setPhase({ k: "picking" });
    setTimeout(() => setPhase((p) => (p.k === "picking" ? { k: "filling" } : p)), 600);
    const res = await onSubmit(intent.trim());
    if (res) setPhase({ k: "done", name: res.template.name });
    else setPhase({ k: "fail" });
  }

  const busy = phase.k === "picking" || phase.k === "filling";

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d1e2b]/80 px-3 py-2 focus-within:ring-2 focus-within:ring-[#3DC9C0]/40">
        <span className="text-[#3DC9C0]" aria-hidden="true">
          ✦
        </span>
        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          disabled={busy}
          placeholder={`What's this for? — e.g. "just listed 123 Gulf Blvd" or "April market update"`}
          className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/30 focus:outline-none"
        />
        <button
          onClick={go}
          disabled={busy}
          aria-label="Build"
          className="text-[#3DC9C0] transition-opacity disabled:opacity-40"
        >
          →
        </button>
      </div>
      {phase.k !== "idle" && (
        <p className="mt-1.5 text-xs text-white/45" aria-live="polite">
          {phase.k === "picking" && "Picking a template…"}
          {phase.k === "filling" && "Filling in your numbers…"}
          {phase.k === "done" && <span className="text-[#3DC9C0]">Built a {phase.name} ✓</span>}
          {phase.k === "fail" && "Couldn't build that one automatically — pick a starter below."}
        </p>
      )}
    </div>
  );
}
