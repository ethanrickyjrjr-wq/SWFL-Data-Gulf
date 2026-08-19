"use client";
// components/email-lab/SalePriceConfirmModal.tsx
//
// The send-time SALE-PRICE CONFIRM (operator decree 08/19/2026: "POP UP A CONFIRM
// FOR THE USER ON SALE PRICE, SEND IF THEY DON'T ANSWER. THEY ANSWER, THE PRICE
// PER SQUARE FOOTAGE CHANGES AUTOMATICALLY"). Fires only on a JUST SOLD build
// whose hero holds a price (the prefilled last-list price is the usual case —
// lib/deliverable/recipes/just-sold.ts's ladder). NEVER blocks a send: "Send as
// is" ships the build untouched, and scheduled sends never see this modal at all.
// The math half lives in lib/email/sale-price-confirm.ts.

import { useState } from "react";

interface Props {
  /** The hero's current price — the prefill the agent is confirming or correcting. */
  initialPrice: string;
  /** They answered: apply their price, recompute $/Sq Ft, then send. */
  onConfirm: (price: string) => void;
  /** They didn't: send exactly what is on the canvas. */
  onSendAsIs: () => void;
  /** Plain close — no send; they can hit Send again whenever. */
  onClose: () => void;
}

export function SalePriceConfirmModal({ initialPrice, onConfirm, onSendAsIs, onClose }: Props) {
  const [price, setPrice] = useState(initialPrice);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Confirm the sale price</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 transition-colors hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-white/50">
          This is the last price we have on record. If the home closed at a different number, put
          the real one in — the price per square foot updates automatically.
        </p>
        <input
          type="text"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm(price);
          }}
          autoFocus
          className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-gulf-teal/50"
          aria-label="Sale price"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSendAsIs}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/60 transition-colors hover:text-white"
          >
            Send as is
          </button>
          <button
            type="button"
            onClick={() => onConfirm(price)}
            className="rounded-lg border border-gulf-teal/30 bg-gulf-teal/10 px-3 py-1.5 text-sm text-gulf-teal transition-colors hover:bg-gulf-teal/20"
          >
            Use this price &amp; send
          </button>
        </div>
      </div>
    </div>
  );
}
