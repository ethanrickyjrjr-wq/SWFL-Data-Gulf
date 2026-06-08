"use client";

// Sticky bottom-right action button that toggles the Ask-AI dock.
// Positioning lives on the wrapper div, NOT the button: `.btn-gradient` sets
// `position: relative` (globals.css), which would override Tailwind's `fixed`
// if both sat on the same element.

export function AskAiFab({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[56]">
      <button
        type="button"
        onClick={onClick}
        aria-label={open ? "Close AI chat" : "Ask AI about this report"}
        aria-expanded={open}
        className="btn-gradient flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-navy-dark shadow-lg shadow-black/40 transition-transform hover:scale-105 active:scale-95"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 512 512" fill="none" aria-hidden="true">
          <g stroke="currentColor" strokeLinecap="round" strokeWidth="56">
            <path d="M80 160 C 144 112, 208 112, 256 160 C 304 208, 368 208, 432 160" />
            <path
              d="M80 256 C 144 208, 208 208, 256 256 C 304 304, 368 304, 432 256"
              opacity="0.7"
            />
            <path
              d="M80 352 C 144 304, 208 304, 256 352 C 304 400, 368 400, 432 352"
              opacity="0.4"
            />
          </g>
        </svg>
        <span>{open ? "Close" : "SWFL Data Gulf"}</span>
      </button>
    </div>
  );
}
