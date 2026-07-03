// app/r/zip-report/_components/find-it-button.tsx
//
// Find-it slot (spec §5) — renders where a source structurally can't cover this
// ZIP. Click → the engine finds the number live with a named source, or honestly
// reports the miss with a pointer to the real issuing source. Found figures are
// cached server-side, so everyone (page, assistant, builders) gets the number.
"use client";

import { useState } from "react";

export interface FoundFigure {
  key: string;
  label: string;
  value: string;
  source: string;
  source_url: string;
  as_of?: string;
}

interface Pointer {
  name: string;
  url: string;
}

type Phase = "idle" | "finding" | "found" | "not_found" | "error";

export function FindItButton({
  zip,
  metricKey,
  label,
  coverage,
  initialFigure,
}: {
  zip: string;
  metricKey: string;
  /** Card title, e.g. "New Permits (90 Days)". */
  label: string;
  /** The real issuing source — shown as the coverage line and the miss pointer. */
  coverage: Pointer;
  /** A figure already cached for this slot → render found state with no click. */
  initialFigure?: FoundFigure | null;
}) {
  const [phase, setPhase] = useState<Phase>(initialFigure ? "found" : "idle");
  const [figure, setFigure] = useState<FoundFigure | null>(initialFigure ?? null);
  const [pointer, setPointer] = useState<Pointer>(coverage);

  async function onFind() {
    setPhase("finding");
    try {
      const res = await fetch("/api/figures/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, metric_key: metricKey }),
      });
      const json = (await res.json().catch(() => null)) as {
        found?: boolean;
        figure?: FoundFigure;
        pointer?: Pointer;
      } | null;
      if (res.ok && json?.found && json.figure) {
        setFigure(json.figure);
        setPhase("found");
      } else if (res.ok && json) {
        if (json.pointer) setPointer(json.pointer);
        setPhase("not_found");
      } else {
        setPhase("error");
      }
    } catch {
      setPhase("error");
    }
  }

  const sourceLink = (
    <a
      href={pointer.url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-white/30 underline-offset-2 hover:text-white"
    >
      {pointer.name}
    </a>
  );

  return (
    <div className="rounded-xl glass-card-modern border border-dashed border-white/15 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>

      {phase === "found" && figure ? (
        <>
          <p className="mt-1 font-mono text-lg font-semibold text-white">{figure.value}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            <a
              href={figure.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-white/30 underline-offset-2 hover:text-white"
            >
              {figure.source}
            </a>
            {figure.as_of ? ` · as of ${figure.as_of}` : ""}
          </p>
        </>
      ) : phase === "finding" ? (
        <p className="mt-2 text-sm text-gray-400">Finding it from a named source…</p>
      ) : phase === "not_found" ? (
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          No published figure found. The issuing source is {sourceLink}.
        </p>
      ) : phase === "error" ? (
        <p className="mt-2 text-sm text-gray-400">
          Couldn&apos;t run the lookup right now — try again.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            Not in our data for this ZIP — permits here are issued by {sourceLink}.
          </p>
          <button
            type="button"
            onClick={onFind}
            className="mt-3 inline-flex items-center rounded-lg border border-teal-primary/40 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-teal-primary"
          >
            Find it →
          </button>
        </>
      )}
    </div>
  );
}
