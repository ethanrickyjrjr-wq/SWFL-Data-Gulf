"use client";

// components/email-lab/DatasetBrowser.tsx — the Datasets rail section (paid grid).
// Lists the curated datasets from /api/concoctions; picking one materializes its
// blocks server-side (values baked, bindings remembered) and hands them to the
// shell to place on the canvas. All copy says "Datasets" — no system nouns.
import { useEffect, useState } from "react";
import type { EmailBlock } from "@/lib/email/doc/types";
import {
  parseIndex,
  paramsComplete,
  cleanParams,
  type DatasetIndexEntry,
} from "./dataset-browser-core";

export function DatasetBrowser({ onLoad }: { onLoad: (blocks: EmailBlock[]) => void }) {
  const [entries, setEntries] = useState<DatasetIndexEntry[] | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/concoctions")
      .then((r) => r.json())
      .then((json) => {
        if (alive) setEntries(parseIndex(json));
      })
      .catch(() => {
        if (alive) {
          setEntries([]);
          setError("Couldn't load datasets — try again in a moment.");
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  async function load(entry: DatasetIndexEntry) {
    setLoadingId(entry.id);
    setError(null);
    try {
      const res = await fetch("/api/concoctions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "load",
          id: entry.id,
          params: cleanParams(values[entry.id] ?? {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        blocks?: EmailBlock[];
        error?: string;
      } | null;
      if (!res.ok || !json?.blocks?.length) {
        setError(json?.error ?? "That dataset couldn't be loaded right now.");
        return;
      }
      onLoad(json.blocks);
    } catch {
      setError("That dataset couldn't be loaded right now.");
    } finally {
      setLoadingId(null);
    }
  }

  if (entries === null) {
    return <p className="mt-2 text-[11px] text-white/35">Loading datasets…</p>;
  }

  const byCategory = new Map<string, DatasetIndexEntry[]>();
  for (const e of entries) {
    byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e]);
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      {error && <p className="text-[11px] text-sunset-coral">{error}</p>}
      {[...byCategory.entries()].map(([category, list]) => (
        <div key={category}>
          <p className="mb-1 text-[10px] uppercase tracking-[0.15em] text-white/25">{category}</p>
          <div className="flex flex-col gap-2">
            {list.map((entry) => {
              const v = values[entry.id] ?? {};
              const ready = paramsComplete(entry, v);
              return (
                <div
                  key={entry.id}
                  className="rounded-md border border-white/8 bg-white/4 px-2.5 py-2"
                >
                  <p className="text-[11px] font-medium text-white/70">{entry.label}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-white/40">
                    {entry.description}
                  </p>
                  {entry.params.map((p) => (
                    <div key={p.key} className="mt-1.5">
                      {p.options ? (
                        <select
                          value={v[p.key] ?? ""}
                          onChange={(e) =>
                            setValues((all) => ({
                              ...all,
                              [entry.id]: { ...v, [p.key]: e.target.value },
                            }))
                          }
                          className="w-full rounded border border-white/10 bg-[#0a1822] px-2 py-1 text-[11px] text-white/70"
                        >
                          <option value="">
                            {p.required ? `Choose ${p.key}…` : `Any ${p.key}`}
                          </option>
                          {p.options.map((o) => (
                            <option key={o} value={o}>
                              {o.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={v[p.key] ?? ""}
                          onChange={(e) =>
                            setValues((all) => ({
                              ...all,
                              [entry.id]: { ...v, [p.key]: e.target.value },
                            }))
                          }
                          placeholder={p.key}
                          className="w-full rounded border border-white/10 bg-[#0a1822] px-2 py-1 text-[11px] text-white/70 placeholder:text-white/25"
                        />
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={!ready || loadingId === entry.id}
                    onClick={() => void load(entry)}
                    className="mt-2 w-full rounded-md bg-gulf-teal/90 px-2 py-1.5 text-[11px] font-semibold text-[#0a1419] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loadingId === entry.id ? "Loading…" : "Load onto canvas"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
