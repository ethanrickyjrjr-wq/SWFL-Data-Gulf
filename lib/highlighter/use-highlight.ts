"use client";

import { useCallback, useEffect, useState } from "react";

export type FactType = "metric" | "place";

export interface SelectedFact {
  text: string;
  rect: DOMRect;
  factType: FactType;
}

/** Classify a selection: a number/currency/percent reads as a "metric", else
 *  a "place" (ZIP names, corridors, towns). Pure so it could be unit-tested. */
export function classifyFact(text: string): FactType {
  const cleaned = text.replace(/[\s,$%]/g, "").replace(/[+\-]/g, "");
  // A metric if, after stripping currency/percent/commas/sign, what's left is
  // numeric (allow a trailing unit like "k"/"m" or a decimal).
  if (/^\d+(\.\d+)?[kmb]?$/i.test(cleaned)) return "metric";
  // Mixed numeric tokens (e.g. "$30,074/yr", "6.2%") — has a digit run.
  if (/[\d][\d,.]*\s*(%|\/yr|bps)/i.test(text)) return "metric";
  return "place";
}

const SUPPRESS_CLOSEST =
  "input, textarea, [contenteditable], #highlighter-popup";

function selectionIsSuppressed(sel: Selection): boolean {
  if (sel.rangeCount === 0) return true;
  const node = sel.anchorNode;
  if (!node) return true;
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  if (!el) return true;
  return el.closest(SUPPRESS_CLOSEST) !== null;
}

/**
 * Desktop text-selection → fact snapshot. On `mouseup`/`keyup` we wait 10ms for
 * the selection to settle, then snapshot the selected text, its bounding rect,
 * and a coarse fact type. Selections inside form fields, contenteditable, or
 * the popup itself are ignored so the user can type a question without the
 * popup re-triggering. An empty/collapsed selection clears to `null`.
 */
export function useHighlight() {
  const [fact, setFact] = useState<SelectedFact | null>(null);

  const clear = useCallback(() => setFact(null), []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function snapshot() {
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      if (!sel || sel.isCollapsed || selectionIsSuppressed(sel)) {
        // Don't clobber an open popup the user is interacting with: only clear
        // when there is genuinely no selection.
        if (!sel || sel.isCollapsed) setFact(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setFact(null);
        return;
      }
      let rect: DOMRect;
      try {
        rect = sel.getRangeAt(0).getBoundingClientRect();
      } catch {
        return;
      }
      if (rect.width === 0 && rect.height === 0) return;
      setFact({ text, rect, factType: classifyFact(text) });
    }

    function onSettle() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(snapshot, 10);
    }

    document.addEventListener("mouseup", onSettle);
    document.addEventListener("keyup", onSettle);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("mouseup", onSettle);
      document.removeEventListener("keyup", onSettle);
    };
  }, []);

  return { fact, clear };
}
