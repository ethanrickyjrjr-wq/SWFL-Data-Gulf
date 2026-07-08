"use client";
// components/email-lab/AddBlockPanel.tsx (Card 32) — the user add-block palette.
// The menu is derived from the ONE supply contract (block-contract.ts): every
// block whose contract entry carries `menu` is user-addable, in contract order.
// Re-exported here so existing importers (EmailLabGridShell) keep their path.
import type { BlockType } from "@/lib/email/doc/types";
import { BLOCK_MENU } from "@/lib/email/doc/block-contract";

export { BLOCK_MENU };

export function AddBlockPanel({
  onAdd,
  onClose,
}: {
  onAdd: (type: BlockType) => void;
  onClose?: () => void;
}) {
  return (
    <div className="grid w-56 grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
      {BLOCK_MENU.map((b) => (
        <button
          key={b.type}
          type="button"
          onClick={() => onAdd(b.type)}
          className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
        >
          <span className="w-4 text-center text-gray-400">{b.icon}</span>
          {b.label}
        </button>
      ))}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="col-span-2 mt-1 rounded px-2 py-1 text-center text-xs text-gray-400 hover:bg-gray-100"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}
