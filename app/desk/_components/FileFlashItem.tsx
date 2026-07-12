"use client";

import { useState } from "react";
import { Check, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { useFiler } from "@/lib/briefcase/file-routing";
import type { FlashItem } from "@/lib/desk/types";

/** Compose the filed note VERBATIM from the item's real fields — headline,
 *  detail, named source, as-of, disclosure, link. Nothing added, nothing
 *  invented; the disclosure (e.g. sold-price honesty wording) travels with
 *  the fact it qualifies. */
export function flashNoteText(item: FlashItem): string {
  const parts = [item.headline];
  if (item.detail) parts.push(item.detail);
  const prov = [item.sourceLabel, item.asOf ? `as of ${item.asOf}` : null]
    .filter(Boolean)
    .join(", ");
  if (prov) parts.push(`(${prov})`);
  if (item.disclosure) parts.push(item.disclosure);
  if (item.href) parts.push(item.href);
  return parts.join(" — ");
}

/** Files a Wire item into the active project (or the anonymous tray) as a
 *  note, through the same routing the KPI pins use. */
export function FileFlashItem({ item }: { item: FlashItem }) {
  const [done, setDone] = useState(false);
  const { file } = useFiler();

  function handleClick() {
    if (done) return;
    try {
      const target = file({
        id: crypto.randomUUID(),
        added_at: new Date().toISOString(),
        origin: "web",
        kind: "note",
        text: flashNoteText(item),
      });
      setDone(true);
      toast.success(target === "tray" ? "Filed to your briefcase" : "Filed to your project");
      setTimeout(() => setDone(false), 2000);
    } catch {
      toast.error("Couldn't file this item");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="File this item — it lands in your project (or briefcase) with its source and date"
      className={`shrink-0 rounded p-0.5 transition-colors ${
        done ? "text-gulf-teal" : "text-gray-700 hover:text-gray-400"
      }`}
    >
      {done ? <Check className="h-3 w-3" /> : <FilePlus2 className="h-3 w-3" />}
    </button>
  );
}
