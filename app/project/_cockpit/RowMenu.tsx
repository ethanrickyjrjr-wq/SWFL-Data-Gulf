// app/project/_cockpit/RowMenu.tsx
"use client";

import { useState } from "react";

/**
 * Visible ⋯ row-action menu (spec 2026-07-16 §4) — replaces the rail's
 * trash-mode toggle. Always-visible signifier; hover-only reveals are
 * accelerators, not the primary affordance.
 */
export function RowMenu({
  items,
  label,
}: {
  items: { label: string; onSelect: () => void; tone?: "danger" }[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-full px-1.5 py-0.5 text-sm leading-none text-gray-500 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gulf-teal/70"
      >
        ⋯
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="fixed inset-0 z-30 cursor-default"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            role="menu"
            className="absolute right-0 z-40 mt-1 w-36 rounded-lg border border-white/15 bg-[#0d1e2b] py-1 shadow-xl"
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  it.onSelect();
                }}
                className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5 focus-visible:bg-white/5 ${
                  it.tone === "danger" ? "text-red-400" : "text-gray-200"
                }`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
