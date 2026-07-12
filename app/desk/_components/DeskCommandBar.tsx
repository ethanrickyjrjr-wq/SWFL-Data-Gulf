"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { toast } from "sonner";
import { ArrowUpRight, MapPin, Pin, SquareDashedMousePointer } from "lucide-react";
import { useFiler } from "@/lib/briefcase/file-routing";
import { anonymousLabArrival } from "@/lib/lab-entry/destination";
import type { WatchZipRow } from "@/lib/desk/types";
import type { FramePinSpec } from "./PinToEmail";

export interface CommandZone {
  id: string;
  label: string;
}

export interface CommandPin {
  title: string;
  pin: FramePinSpec;
}

export interface CommandRecipe {
  label: string;
  recipe: string;
}

/**
 * The desk's ⌘K command bar (cmdk). Pure navigation/action layer — it renders
 * NO data of its own (SSR numbers stay untouched); the ZIP jump list is the
 * same server-shipped `watch` rows the watchlist rail reads. The overlay is
 * hand-rolled (fixed div + Escape/backdrop close) so we depend only on cmdk's
 * documented core: Command / Input / List / Group / Item / Empty.
 */
export function DeskCommandBar({
  zones,
  zips,
  pins,
  recipes,
}: {
  zones: CommandZone[];
  zips: WatchZipRow[];
  pins: CommandPin[];
  recipes: CommandRecipe[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { file } = useFiler();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const jump = useCallback((id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const pinFrame = useCallback(
    (p: CommandPin) => {
      setOpen(false);
      try {
        file({
          id: crypto.randomUUID(),
          added_at: new Date().toISOString(),
          origin: "web",
          kind: "frame",
          brain_id: p.pin.brainId,
          ...(p.pin.frameId ? { frame_id: p.pin.frameId } : {}),
          ...(p.pin.metricKeys ? { metric_keys: p.pin.metricKeys } : {}),
          title: p.pin.title,
        });
        toast.success(`Pinned — ${p.pin.title}`);
      } catch {
        toast.error("Couldn't pin this figure");
      }
    },
    [file],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open the desk command bar"
        className="inline-flex items-center gap-1 rounded-md border border-[#22414f] bg-[#0a1419]/80 px-2 py-1 font-mono text-[10px] text-[#807e76] transition-all duration-200 hover:border-gulf-teal/50 hover:text-gulf-teal"
      >
        <SquareDashedMousePointer className="h-3 w-3" />
        ⌘K
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Desk commands"
            className="w-full max-w-lg overflow-hidden rounded-xl border border-[#22414f] bg-[#0f1d24] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Desk commands" className="text-[#f0ede6]">
              <Command.Input
                autoFocus
                placeholder="Jump to a ZIP, zone, or action…"
                className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm text-gray-100 outline-none placeholder:text-gray-600"
              />
              <Command.List className="max-h-[50vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-600 [&_[cmdk-item]]:flex [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item]]:items-center [&_[cmdk-item]]:gap-2 [&_[cmdk-item]]:rounded-md [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:text-sm [&_[cmdk-item]]:text-gray-300 [&_[cmdk-item][data-selected=true]]:bg-white/10 [&_[cmdk-item][data-selected=true]]:text-white">
                <Command.Empty className="px-2 py-6 text-center text-sm text-gray-500">
                  Nothing matches.
                </Command.Empty>
                <Command.Group heading="Jump to">
                  {zones.map((z) => (
                    <Command.Item key={z.id} value={`zone ${z.label}`} onSelect={() => jump(z.id)}>
                      <SquareDashedMousePointer className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                      {z.label}
                    </Command.Item>
                  ))}
                </Command.Group>
                {pins.length > 0 || recipes.length > 0 ? (
                  <Command.Group heading="Actions">
                    {pins.map((p) => (
                      <Command.Item
                        key={p.pin.title}
                        value={`pin ${p.title}`}
                        onSelect={() => pinFrame(p)}
                      >
                        <Pin className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                        Pin to email — {p.title}
                      </Command.Item>
                    ))}
                    {recipes.map((r) => (
                      <Command.Item
                        key={r.label}
                        value={`report ${r.label}`}
                        onSelect={() => {
                          setOpen(false);
                          router.push(anonymousLabArrival({ recipe: r.recipe, ref: "desk" }));
                        }}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                        Branded report — {r.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}
                {zips.length > 0 ? (
                  <Command.Group heading="ZIP reports">
                    {zips.map((z) => (
                      <Command.Item
                        key={z.zip}
                        value={`${z.zip} ${z.county ?? ""}`}
                        onSelect={() => {
                          setOpen(false);
                          router.push(`/r/zip-report/${z.zip}`);
                        }}
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                        <span className="font-mono tabular-nums">{z.zip}</span>
                        <span className="text-gray-500">
                          {z.county ?? ""}
                          {z.medianListDisplay ? ` · ask ${z.medianListDisplay}` : ""}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}
              </Command.List>
            </Command>
          </div>
        </div>
      ) : null}
    </>
  );
}
