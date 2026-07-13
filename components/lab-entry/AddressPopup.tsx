"use client";
// components/lab-entry/AddressPopup.tsx
// Replaces the off-screen in-textarea [[blank]] with a centered one-field popup.
// Labeled by what the recipe needs (listing address vs area/ZIP). Spec §C.
//
// ONE ROOT for "a recipe needs something before it can build" (operator ruling
// 07/13/2026). This popup was built for the ARRIVAL door only — a recipe carried in
// from the homepage/showcase. The in-lab door (clicking a campaign card or an example
// in the rail) never got it: it silently wrote the prompt into the Build textarea at
// the top of a scrolling rail while you were scrolled down looking at the cards, so
// the click read as doing nothing. Both doors now land here.
//
// It also collects the brand fields the artifact will PRINT (your name, your
// brokerage, the CAN-SPAM address). Those used to be nagged for after the fact, in an
// amber panel, via a button that expanded a form below the fold. One box, one Build.
import { useState } from "react";
import { NEED_LABELS, type BrandNeed } from "@/lib/showcase/recipe";

export interface AddressPopupProps {
  inputKind: "address" | "area";
  initialValue: string;
  /** Brand fields the recipe needs that the brand blob doesn't have yet. A headshot
   *  is an upload, not a text field — callers filter it out; the Brand panel owns it. */
  gaps?: readonly BrandNeed[];
  /** brandPatch carries only the gap fields they actually typed ({} when none). */
  onBuild: (value: string, brandPatch: Record<string, string>) => void;
  onCancel: () => void;
}

export function AddressPopup({
  inputKind,
  initialValue,
  gaps = [],
  onBuild,
  onCancel,
}: AddressPopupProps) {
  const [value, setValue] = useState(initialValue);
  const [brandPatch, setBrandPatch] = useState<Record<string, string>>({});
  const label = inputKind === "address" ? "Listing address" : "Area or ZIP";
  const placeholder =
    inputKind === "address" ? "123 Palm Ave, Fort Myers FL 33901" : "Cape Coral or 33904";

  function build() {
    if (!value.trim()) return;
    const patch = Object.fromEntries(Object.entries(brandPatch).filter(([, v]) => v.trim()));
    onBuild(value.trim(), patch);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl">
        <h2 className="text-sm font-semibold text-white">{label}</h2>
        <p className="mt-1 text-xs text-white/50">
          {inputKind === "address"
            ? "Which listing is this for?"
            : "Which area should the numbers cover?"}
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) build();
          }}
          placeholder={placeholder}
          className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none"
        />

        {gaps.length > 0 && (
          <div className="mt-3 rounded-lg border border-[#f59e0b]/25 bg-[#f59e0b]/[0.07] p-3">
            <p className="text-[11px] leading-relaxed text-[#fbbf24]">
              {`This email signs ${gaps.map((g) => NEED_LABELS[g]).join(", ")}. Type ${
                gaps.length === 1 ? "it" : "them"
              } once — we’ll remember.`}
            </p>
            <div className="mt-2.5 flex flex-col gap-2">
              {gaps.map((need) => (
                <input
                  key={need}
                  value={brandPatch[need] ?? ""}
                  onChange={(e) => setBrandPatch((b) => ({ ...b, [need]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && value.trim()) build();
                  }}
                  placeholder={NEED_LABELS[need]}
                  aria-label={NEED_LABELS[need]}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 placeholder:text-white/30 focus:border-[#f59e0b] focus:outline-none"
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={!value.trim()}
            onClick={build}
            className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            Build
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="py-1 text-xs text-white/40 hover:text-white/70"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
