"use client";
// components/lab-entry/AddressPopup.tsx
// Replaces the off-screen in-textarea [[blank]] with a centered one-field popup.
// Labeled by what the recipe needs (listing address vs area/ZIP). Spec §C.
import { useState } from "react";

export interface AddressPopupProps {
  inputKind: "address" | "area";
  initialValue: string;
  onBuild: (value: string) => void;
  onCancel: () => void;
}

export function AddressPopup({ inputKind, initialValue, onBuild, onCancel }: AddressPopupProps) {
  const [value, setValue] = useState(initialValue);
  const label = inputKind === "address" ? "Listing address" : "Area or ZIP";
  const placeholder =
    inputKind === "address" ? "123 Palm Ave, Fort Myers FL 33901" : "Cape Coral or 33904";

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
            if (e.key === "Enter" && value.trim()) onBuild(value.trim());
          }}
          placeholder={placeholder}
          className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none"
        />
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => onBuild(value.trim())}
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
